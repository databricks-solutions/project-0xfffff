"""SQLite Rescue - Backup/restore SQLite DB to Unity Catalog Volumes.

Databricks Apps containers are ephemeral. This module provides:
1. Restore from Volume on startup (if backup exists)
2. Backup to Volume on shutdown (SIGTERM/SIGINT)
3. Backup after N write operations (optional)

Configuration via environment variables:
- SQLITE_VOLUME_BACKUP_PATH: Path to Unity Catalog volume (e.g., /Volumes/catalog/schema/volume/workshop.db)
- SQLITE_BACKUP_AFTER_OPS: Number of write operations before auto-backup (default: 50, 0 to disable)
"""

from __future__ import annotations

import logging
import os
import shutil
import signal
import threading
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)

# Global state for operation counting and backup coordination
_write_op_count = 0
_write_op_lock = threading.Lock()
_backup_in_progress = threading.Lock()
_shutdown_handlers_installed = False


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

    volume_backup_path = os.getenv("SQLITE_VOLUME_BACKUP_PATH")
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


def _copy_file_safely(src: str, dst: str, is_volume_dest: bool = False) -> bool:
    """Copy file with atomic semantics (write to temp, then rename).

    Args:
        src: Source file path
        dst: Destination file path
        is_volume_dest: If True, destination is a UC volume (don't try to create parent dirs)

    Returns:
        True if successful, False otherwise.
    """
    src_path = Path(src)
    dst_path = Path(dst)

    if not src_path.exists():
        logger.warning(f"Source file does not exist: {src}")
        return False

    # For UC volumes, the volume must already exist - don't try to create directories
    # For local paths, ensure destination directory exists
    if not is_volume_dest:
        dst_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        # For UC volumes, verify the parent directory exists
        if not dst_path.parent.exists():
            logger.error(
                f"Volume directory does not exist: {dst_path.parent}. "
                "Ensure the Unity Catalog volume is created and the app has write access."
            )
            return False

    # Write to temp file first, then rename for atomicity
    tmp_path = dst_path.with_suffix(dst_path.suffix + ".tmp")

    try:
        shutil.copy2(src, tmp_path)
        tmp_path.rename(dst_path)
        return True
    except Exception as e:
        logger.error(f"Failed to copy {src} -> {dst}: {e}")
        # Clean up temp file if it exists
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
        return False


def restore_from_volume() -> bool:
    """Restore SQLite database from Unity Catalog Volume on startup.

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

    volume_path = Path(volume_backup_path)
    local_path = Path(local_db_path)

    if not volume_path.exists():
        logger.info(f"No backup found at {volume_backup_path} - starting fresh")
        return False

    # If local DB already exists (shouldn't happen in container), log and skip
    if local_path.exists():
        logger.warning(
            f"Local DB already exists at {local_db_path}. "
            f"Volume backup at {volume_backup_path} will NOT overwrite. "
            "Delete local DB first if you want to restore from volume."
        )
        return False

    logger.info(f"Restoring SQLite database from {volume_backup_path}...")

    # Also restore WAL and SHM files if they exist (for consistency)
    success = _copy_file_safely(volume_backup_path, local_db_path)

    if success:
        # Try to restore WAL file too
        wal_src = str(volume_path) + "-wal"
        wal_dst = str(local_path) + "-wal"
        if Path(wal_src).exists():
            _copy_file_safely(wal_src, wal_dst)

        logger.info(f"Successfully restored database from {volume_backup_path}")
    else:
        logger.error(f"Failed to restore database from {volume_backup_path}")

    return success


def backup_to_volume(force: bool = False) -> bool:
    """Backup SQLite database to Unity Catalog Volume.

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

    # Check if the volume root exists (quick fail if volume not mounted/accessible)
    volume_root = _get_volume_root(volume_backup_path)
    if volume_root and not Path(volume_root).exists():
        logger.error(
            f"Unity Catalog volume not accessible: {volume_root}. "
            "Ensure the volume exists and the app's service principal has 'Can read and write' permission."
        )
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

        success = _copy_file_safely(local_db_path, volume_backup_path, is_volume_dest=True)

        if success:
            # Also backup WAL file if it exists (belt and suspenders)
            wal_src = str(local_path) + "-wal"
            wal_dst = volume_backup_path + "-wal"
            if Path(wal_src).exists():
                _copy_file_safely(wal_src, wal_dst, is_volume_dest=True)

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

    # Check if volume is accessible
    volume_root = _get_volume_root(volume_backup_path)
    if volume_root and not Path(volume_root).exists():
        logger.error(
            f"Unity Catalog volume not accessible: {volume_root}. "
            "Ensure the volume exists and the app's service principal has 'Can read and write' permission. "
            "Shutdown backup handlers NOT installed."
        )
        return

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
    volume_exists = Path(volume_backup_path).exists() if volume_backup_path else False

    # Check path validity and volume accessibility
    path_valid = False
    path_error = None
    volume_accessible = False

    if volume_backup_path:
        path_valid, path_error = _validate_volume_path(volume_backup_path)
        if path_valid:
            volume_root = _get_volume_root(volume_backup_path)
            volume_accessible = Path(volume_root).exists() if volume_root else False

    return {
        "configured": volume_backup_path is not None,
        "local_db_path": local_db_path,
        "volume_backup_path": volume_backup_path,
        "backup_after_ops": backup_after_ops if volume_backup_path else None,
        "local_exists": local_exists,
        "volume_backup_exists": volume_exists,
        "path_valid": path_valid,
        "path_error": path_error,
        "volume_accessible": volume_accessible,
        "write_op_count": _write_op_count,
        "shutdown_handlers_installed": _shutdown_handlers_installed,
    }
