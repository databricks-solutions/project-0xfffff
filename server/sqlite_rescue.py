"""SQLite Rescue - Backup/restore SQLite DB to Unity Catalog Volumes.

Databricks Apps containers are ephemeral. This module provides:
1. Restore from Volume on startup (if backup exists)
2. Backup to Volume on shutdown (SIGTERM/SIGINT)
3. Backup after N write operations (optional)

IMPORTANT: Databricks Apps do NOT support FUSE mounts for UC volumes.
This module uses the Databricks SDK Files API for all volume operations.

Configuration via environment variables:
- SQLITE_VOLUME_PATH: Base path to Unity Catalog volume (e.g., /Volumes/catalog/schema/volume)
  Use this with valueFrom in app.yaml - the module appends "/workshop.db" automatically.
- SQLITE_VOLUME_BACKUP_PATH: Full path including filename (e.g., /Volumes/catalog/schema/volume/workshop.db)
  Use this if you want to specify the complete path directly.
- SQLITE_BACKUP_AFTER_OPS: Number of write operations before auto-backup (default: 50, 0 to disable)

Recommended app.yaml configuration using valueFrom:
  env:
    - name: SQLITE_VOLUME_PATH
      valueFrom: db_backup_volume  # Resource key from Apps UI
"""

from __future__ import annotations

import io
import logging
import os
import signal
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

# Global state for operation counting and backup coordination
_write_op_count = 0
_write_op_lock = threading.Lock()
_backup_in_progress = threading.Lock()
_shutdown_handlers_installed = False

# Cached WorkspaceClient instance
_workspace_client = None
_workspace_client_lock = threading.Lock()


def _get_workspace_client():
    """Get or create a cached WorkspaceClient instance.

    In Databricks Apps, the SDK automatically picks up credentials from
    DATABRICKS_HOST, DATABRICKS_CLIENT_ID, and DATABRICKS_CLIENT_SECRET
    environment variables injected by the platform.

    Returns:
        WorkspaceClient instance, or None if not in Databricks environment.
    """
    global _workspace_client

    with _workspace_client_lock:
        if _workspace_client is not None:
            return _workspace_client

        try:
            from databricks.sdk import WorkspaceClient

            _workspace_client = WorkspaceClient()
            logger.debug("Databricks WorkspaceClient initialized successfully")
            return _workspace_client
        except Exception as e:
            logger.warning(f"Failed to initialize Databricks WorkspaceClient: {e}")
            return None


def _get_config() -> tuple[str | None, str | None, int]:
    """Get SQLite rescue configuration from environment.

    Returns:
        Tuple of (local_db_path, volume_backup_path, backup_after_ops)
    """
    database_url = os.getenv("DATABASE_URL", "sqlite:///./workshop.db")

    # Extract local path from SQLite URL
    if database_url.startswith("sqlite:///"):
        local_db_path = database_url.replace("sqlite:///", "", 1)
    elif database_url.startswith("sqlite://"):
        local_db_path = database_url.replace("sqlite://", "", 1)
    else:
        local_db_path = None

    # Support both SQLITE_VOLUME_PATH (base path, append /workshop.db)
    # and SQLITE_VOLUME_BACKUP_PATH (full path including filename)
    volume_backup_path = os.getenv("SQLITE_VOLUME_BACKUP_PATH")
    if not volume_backup_path:
        volume_base_path = os.getenv("SQLITE_VOLUME_PATH")
        if volume_base_path:
            # Remove trailing slash if present, then append filename
            volume_backup_path = volume_base_path.rstrip("/") + "/workshop.db"

    backup_after_ops = int(os.getenv("SQLITE_BACKUP_AFTER_OPS", "50"))

    return local_db_path, volume_backup_path, backup_after_ops


def _validate_volume_path(path: str) -> tuple[bool, str]:
    """Validate that a path looks like a Unity Catalog volume path.

    UC volume paths must be: /Volumes/<catalog>/<schema>/<volume>/...
    The volume itself must already exist - we cannot create it.

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not path:
        return False, "Path is empty"

    if not path.startswith("/Volumes/"):
        return False, f"Path must start with /Volumes/, got: {path}"

    parts = path.split("/")
    # /Volumes/catalog/schema/volume/file.db -> ['', 'Volumes', 'catalog', 'schema', 'volume', 'file.db']
    if len(parts) < 6:
        return False, (
            f"Invalid Unity Catalog volume path: {path}. "
            "Expected format: /Volumes/<catalog>/<schema>/<volume>/<filename>"
        )

    return True, ""


def _get_volume_root(path: str) -> str | None:
    """Extract the volume root from a UC volume path.

    /Volumes/catalog/schema/volume/subdir/file.db -> /Volumes/catalog/schema/volume
    """
    parts = path.split("/")
    if len(parts) >= 5:
        return "/".join(parts[:5])
    return None


def _file_exists_on_volume(path: str) -> bool:
    """Check if a file exists on a Unity Catalog volume using the SDK.

    Args:
        path: Full UC volume path (e.g., /Volumes/catalog/schema/volume/file.db)

    Returns:
        True if file exists, False otherwise.
    """
    client = _get_workspace_client()
    if not client:
        logger.warning("WorkspaceClient not available - cannot check file existence")
        return False

    try:
        # Try to get file status - if it doesn't exist, this will raise an exception
        status = client.files.get_status(path)
        logger.info(f"File exists at {path}: {status}")
        return True
    except Exception as e:
        # Log the full error to help debug
        error_type = type(e).__name__
        logger.info(f"File check for {path} returned {error_type}: {e}")
        return False


def _download_from_volume(volume_path: str, local_path: str) -> bool | None:
    """Download a file from Unity Catalog volume to local filesystem.

    Args:
        volume_path: Source path on UC volume
        local_path: Destination path on local filesystem

    Returns:
        True if successful, False if error occurred, None if file not found.
    """
    client = _get_workspace_client()
    if not client:
        logger.error("WorkspaceClient not available - cannot download from volume")
        return False

    try:
        # Ensure local directory exists
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)

        # Download file using SDK
        logger.info(f"Attempting to download {volume_path} -> {local_path}")
        response = client.files.download(volume_path)

        # Write to local file
        with open(local_path, "wb") as f:
            f.write(response.contents.read())

        logger.info(f"Successfully downloaded {volume_path} to {local_path}")
        return True

    except Exception as e:
        error_str = str(e).lower()
        error_type = type(e).__name__
        # Check for "not found" type errors
        if "not found" in error_str or "404" in error_str or "does not exist" in error_str:
            logger.info(f"File not found at {volume_path}: {error_type}: {e}")
            return None  # Indicates file doesn't exist (not an error)
        logger.error(f"Failed to download {volume_path}: {error_type}: {e}")
        return False


def _upload_to_volume(local_path: str, volume_path: str) -> bool:
    """Upload a file from local filesystem to Unity Catalog volume.

    Args:
        local_path: Source path on local filesystem
        volume_path: Destination path on UC volume

    Returns:
        True if successful, False otherwise.
    """
    client = _get_workspace_client()
    if not client:
        logger.error("WorkspaceClient not available - cannot upload to volume")
        return False

    local_file = Path(local_path)
    if not local_file.exists():
        logger.warning(f"Local file does not exist: {local_path}")
        return False

    try:
        # Read local file and upload
        logger.debug(f"Uploading {local_path} -> {volume_path}")
        with open(local_path, "rb") as f:
            file_content = f.read()

        # Upload using SDK with overwrite=True
        client.files.upload(volume_path, io.BytesIO(file_content), overwrite=True)

        logger.info(f"Successfully uploaded {local_path} to {volume_path}")
        return True

    except Exception as e:
        logger.error(f"Failed to upload to {volume_path}: {e}")
        return False


def restore_from_volume() -> bool:
    """Restore SQLite database from Unity Catalog Volume on startup.

    Uses Databricks SDK Files API (not FUSE mounts).
    Should be called BEFORE database bootstrap/migrations.

    Returns:
        True if restored, False if no backup found or restore failed.
    """
    local_db_path, volume_backup_path, _ = _get_config()

    if not volume_backup_path:
        logger.info("SQLITE_VOLUME_BACKUP_PATH not configured - skipping restore")
        return False

    if not local_db_path:
        logger.warning("Could not determine local DB path from DATABASE_URL")
        return False

    local_path = Path(local_db_path)

    # If local DB already exists (shouldn't happen in container), log and skip
    if local_path.exists():
        logger.warning(
            f"Local DB already exists at {local_db_path}. "
            f"Volume backup at {volume_backup_path} will NOT overwrite. "
            "Delete local DB first if you want to restore from volume."
        )
        return False

    logger.info(f"Attempting to restore SQLite database from {volume_backup_path}...")

    # Try to download directly - this is more reliable than checking existence first
    # Returns: True (success), False (error), None (file not found)
    result = _download_from_volume(volume_backup_path, local_db_path)

    if result is None:
        # File doesn't exist on volume - this is normal for first run
        logger.info(f"No backup found at {volume_backup_path} - starting fresh")
        return False
    elif result is False:
        # An actual error occurred
        logger.error(f"Failed to restore database from {volume_backup_path}")
        return False
    else:
        # Success! Try to restore WAL file too (if it exists on volume)
        wal_volume = volume_backup_path + "-wal"
        wal_local = str(local_path) + "-wal"
        wal_result = _download_from_volume(wal_volume, wal_local)
        if wal_result is True:
            logger.info(f"Also restored WAL file from {wal_volume}")

        logger.info(f"Successfully restored database from {volume_backup_path}")
        return True


def backup_to_volume(force: bool = False) -> bool:
    """Backup SQLite database to Unity Catalog Volume.

    Uses Databricks SDK Files API (not FUSE mounts).

    Args:
        force: If True, backup even if another backup is in progress.

    Returns:
        True if backed up successfully, False otherwise.
    """
    local_db_path, volume_backup_path, _ = _get_config()

    if not volume_backup_path:
        if force:
            logger.warning("SQLITE_VOLUME_BACKUP_PATH not configured - cannot backup")
        return False

    # Validate volume path format
    is_valid, error_msg = _validate_volume_path(volume_backup_path)
    if not is_valid:
        logger.error(f"Invalid SQLITE_VOLUME_BACKUP_PATH: {error_msg}")
        return False

    if not local_db_path:
        logger.warning("Could not determine local DB path from DATABASE_URL")
        return False

    local_path = Path(local_db_path)

    if not local_path.exists():
        logger.warning(f"Local database does not exist at {local_db_path} - nothing to backup")
        return False

    # Prevent concurrent backups (unless forced for shutdown)
    acquired = _backup_in_progress.acquire(blocking=force, timeout=0.1 if not force else 30)
    if not acquired:
        logger.debug("Backup already in progress, skipping")
        return False

    try:
        logger.info(f"Backing up SQLite database to {volume_backup_path}...")

        # For SQLite with WAL mode, we should checkpoint before backup
        # to ensure all data is in the main DB file
        _checkpoint_sqlite(local_db_path)

        success = _upload_to_volume(local_db_path, volume_backup_path)

        if success:
            # Also backup WAL file if it exists (belt and suspenders)
            wal_local = str(local_path) + "-wal"
            wal_volume = volume_backup_path + "-wal"
            if Path(wal_local).exists():
                _upload_to_volume(wal_local, wal_volume)

            logger.info(f"Successfully backed up database to {volume_backup_path}")
        else:
            logger.error(f"Failed to backup database to {volume_backup_path}")

        return success
    finally:
        _backup_in_progress.release()


def _checkpoint_sqlite(db_path: str) -> None:
    """Force a WAL checkpoint to flush all data to the main database file."""
    import sqlite3

    try:
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()
        logger.debug("SQLite WAL checkpoint completed")
    except Exception as e:
        logger.warning(f"WAL checkpoint failed (non-fatal): {e}")


def record_write_operation() -> None:
    """Record a write operation and trigger backup if threshold reached.

    Call this after successful database write operations.
    """
    global _write_op_count

    _, volume_backup_path, backup_after_ops = _get_config()

    if not volume_backup_path or backup_after_ops <= 0:
        return

    with _write_op_lock:
        _write_op_count += 1
        count = _write_op_count

    if count >= backup_after_ops:
        # Reset counter and trigger backup in background
        with _write_op_lock:
            _write_op_count = 0

        logger.info(f"Triggering backup after {count} write operations")
        # Run backup in background thread to not block the request
        thread = threading.Thread(target=backup_to_volume, kwargs={"force": False}, daemon=True)
        thread.start()


def _shutdown_signal_handler(signum: int, frame) -> None:
    """Handle shutdown signals by backing up the database."""
    sig_name = signal.Signals(signum).name
    logger.info(f"Received {sig_name} - initiating database backup before shutdown...")

    # Force backup (wait for any in-progress backup to complete)
    backup_to_volume(force=True)

    logger.info("Backup complete - proceeding with shutdown")

    # Re-raise the signal to let the default handler run
    # (or let the application continue its shutdown)


def install_shutdown_handlers() -> None:
    """Install signal handlers for graceful shutdown with backup.

    Should be called once during application startup.
    Note: In gunicorn, this runs in each worker process.
    """
    global _shutdown_handlers_installed

    if _shutdown_handlers_installed:
        return

    _, volume_backup_path, _ = _get_config()

    if not volume_backup_path:
        logger.info(
            "SQLITE_VOLUME_BACKUP_PATH not configured - "
            "shutdown backup handlers not installed"
        )
        return

    # Validate volume path format early to catch misconfiguration at startup
    is_valid, error_msg = _validate_volume_path(volume_backup_path)
    if not is_valid:
        logger.error(
            f"Invalid SQLITE_VOLUME_BACKUP_PATH: {error_msg}. "
            "Shutdown backup handlers NOT installed."
        )
        return

    # Verify we can create a WorkspaceClient (SDK is available)
    client = _get_workspace_client()
    if not client:
        logger.warning(
            "Databricks SDK WorkspaceClient not available. "
            "Shutdown backup handlers will be installed but backups may fail. "
            "Ensure DATABRICKS_HOST and credentials are configured."
        )

    # Store original handlers to chain if needed
    original_sigterm = signal.getsignal(signal.SIGTERM)
    original_sigint = signal.getsignal(signal.SIGINT)

    def chained_handler(signum: int, frame):
        _shutdown_signal_handler(signum, frame)
        # Call original handler if it was a callable
        original = original_sigterm if signum == signal.SIGTERM else original_sigint
        if callable(original) and original not in (signal.SIG_DFL, signal.SIG_IGN):
            original(signum, frame)

    signal.signal(signal.SIGTERM, chained_handler)
    signal.signal(signal.SIGINT, chained_handler)

    _shutdown_handlers_installed = True
    logger.info(
        f"Shutdown backup handlers installed - "
        f"database will be backed up to {volume_backup_path} on SIGTERM/SIGINT"
    )


def get_rescue_status() -> dict:
    """Get current SQLite rescue configuration and status.

    Useful for health checks and debugging.
    """
    local_db_path, volume_backup_path, backup_after_ops = _get_config()

    local_exists = Path(local_db_path).exists() if local_db_path else False

    # Check volume backup existence using SDK
    volume_exists = False
    sdk_available = False
    if volume_backup_path:
        client = _get_workspace_client()
        sdk_available = client is not None
        if sdk_available:
            volume_exists = _file_exists_on_volume(volume_backup_path)

    # Check path validity
    path_valid = False
    path_error = None

    if volume_backup_path:
        path_valid, path_error = _validate_volume_path(volume_backup_path)

    return {
        "configured": volume_backup_path is not None,
        "local_db_path": local_db_path,
        "volume_backup_path": volume_backup_path,
        "backup_after_ops": backup_after_ops if volume_backup_path else None,
        "local_exists": local_exists,
        "volume_backup_exists": volume_exists,
        "path_valid": path_valid,
        "path_error": path_error,
        "sdk_available": sdk_available,
        "write_op_count": _write_op_count,
        "shutdown_handlers_installed": _shutdown_handlers_installed,
    }
