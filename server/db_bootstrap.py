"""Database bootstrap utilities (SQLite + PostgreSQL/Lakebase + Alembic).

This module exists primarily as a *deployment safety net*:
- Preferred workflow: run `just db-bootstrap` before starting the API.
- Fallback: on API startup, if the DB is missing we can create it via Alembic.
  Optionally, deployments can enable full bootstrap (stamp legacy + upgrade).

Supports two database backends:
- SQLite: Default for local development and simple deployments
- Lakebase (PostgreSQL): For Databricks Apps with database resources

Important: FastAPI lifespan runs once per worker process under gunicorn, so any
bootstrap logic must be protected by an inter-process lock to avoid concurrent
migrations corrupting the database.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import time
import traceback
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class DatabaseBackend(Enum):
    """Supported database backends."""

    SQLITE = "sqlite"
    POSTGRESQL = "postgresql"


def _truthy(v: str | None) -> bool:
    if v is None:
        return False
    return v.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


def _detect_backend() -> DatabaseBackend:
    """Detect database backend based on environment variables."""
    # Check for Lakebase environment variables
    pghost = os.getenv("PGHOST")
    pgdatabase = os.getenv("PGDATABASE")
    pguser = os.getenv("PGUSER")

    if all([pghost, pgdatabase, pguser]):
        return DatabaseBackend.POSTGRESQL

    return DatabaseBackend.SQLITE


def _db_path_from_url(url: str) -> str:
    # Mirrors the logic in `just db-bootstrap`.
    if url.startswith("sqlite:///"):
        return url.replace("sqlite:///", "", 1)
    if url.startswith("sqlite://"):
        return url.replace("sqlite://", "", 1)
    return url


def _list_sqlite_tables(db_path: str) -> list[str]:
    with sqlite3.connect(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        return [r[0] for r in cur.fetchall()]


def _get_postgres_schema_name() -> str:
    """Get the PostgreSQL schema name derived from PGAPPNAME."""
    app_name = os.getenv("PGAPPNAME", "human_eval_workshop")
    return app_name.replace("-", "_")


def _list_postgres_tables(database_url: str) -> list[str]:
    """List tables in PostgreSQL database (checks app schema and public)."""
    try:
        from sqlalchemy import create_engine, text

        schema_name = _get_postgres_schema_name()
        engine = create_engine(database_url)
        with engine.connect() as conn:
            # Check both the app schema and public schema for tables
            result = conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = :app_schema "
                    "UNION "
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' AND table_name IN "
                    "('alembic_version', 'workshops', 'users', 'traces')"
                ),
                {"app_schema": schema_name},
            )
            tables = [r[0] for r in result.fetchall()]
            if tables:
                print(f"📋 Found {len(tables)} tables in schema '{schema_name}'")
            return tables
    except Exception as e:
        print(f"⚠️ Could not list PostgreSQL tables: {e}")
        import traceback
        traceback.print_exc()
        return []


def _get_postgres_url() -> str:
    """Construct PostgreSQL URL from Lakebase environment variables."""
    from server.db_config import LakebaseConfig, get_token_manager

    config = LakebaseConfig.from_env()
    if config is None:
        raise RuntimeError("Lakebase environment variables not set")

    token_manager = get_token_manager()
    password = token_manager.get_token()

    return (
        f"postgresql+psycopg://{config.user}:{password}@"
        f"{config.host}:{config.port}/{config.database}"
        f"?sslmode={config.sslmode}"
        f"&application_name={config.app_name}"
    )


@dataclass(frozen=True)
class BootstrapPlan:
    database_url: str
    db_path: str  # Only used for SQLite
    lock_path: str
    backend: DatabaseBackend


def _bootstrap_plan() -> BootstrapPlan:
    backend = _detect_backend()

    if backend == DatabaseBackend.POSTGRESQL:
        database_url = _get_postgres_url()
        # For PostgreSQL, use a consistent lock path
        lock_path = "/tmp/workshop-db-bootstrap.lock"
        return BootstrapPlan(
            database_url=database_url,
            db_path="",  # Not applicable for PostgreSQL
            lock_path=lock_path,
            backend=backend,
        )

    # SQLite
    database_url = os.getenv("DATABASE_URL", "sqlite:///./workshop.db")
    db_path = _db_path_from_url(database_url)

    # Keep the lock next to the DB so it works across processes/containers sharing that volume.
    db_path_abs = str(Path(db_path).expanduser().resolve())
    lock_path = f"{db_path_abs}.bootstrap.lock"

    return BootstrapPlan(
        database_url=database_url,
        db_path=db_path_abs,
        lock_path=lock_path,
        backend=backend,
    )


@contextmanager
def _interprocess_lock(lock_path: str, timeout_s: float) -> Iterator[None]:
    """Acquire an exclusive lock using POSIX advisory locks (works across processes).

    We use fcntl.flock which is available on Linux/macOS (Databricks Apps run on Linux).
    """

    start = time.time()
    lock_file = Path(lock_path)
    lock_file.parent.mkdir(parents=True, exist_ok=True)

    f = lock_file.open("a+")
    try:
        try:
            import fcntl  # Unix-only
        except Exception as e:  # pragma: no cover
            raise RuntimeError("fcntl is required for inter-process locking on this platform") from e

        while True:
            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError as e:
                if time.time() - start >= timeout_s:
                    raise TimeoutError(f"Timed out waiting for DB bootstrap lock: {lock_path}") from e
                time.sleep(0.2)

        # Write a small marker for debugging (not required for correctness).
        try:
            f.seek(0)
            f.truncate(0)
            f.write(f"pid={os.getpid()} acquired_at={time.time():.3f}\n")
            f.flush()
        except Exception:
            pass

        yield
    finally:
        try:
            import fcntl  # type: ignore

            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass
        try:
            f.close()
        except Exception:
            pass


def _widen_alembic_version_column(database_url: str) -> None:
    """Widen the alembic_version.version_num column if it's too narrow.

    Alembic defaults to VARCHAR(32), but our revision slugs can exceed that
    (e.g. '0007_add_custom_llm_provider_config' is 35 chars). This must run
    BEFORE any Alembic command so the UPDATE that records the new revision
    doesn't fail with StringDataRightTruncation.
    """
    try:
        from sqlalchemy import create_engine, text

        schema_name = _get_postgres_schema_name()
        engine = create_engine(database_url)
        with engine.connect() as conn:
            # Try to widen in the app schema
            conn.execute(
                text(
                    f'ALTER TABLE IF EXISTS "{schema_name}".alembic_version '
                    f"ALTER COLUMN version_num TYPE VARCHAR(128)"
                )
            )
            # Also try public schema in case alembic_version landed there
            conn.execute(
                text(
                    "ALTER TABLE IF EXISTS public.alembic_version "
                    "ALTER COLUMN version_num TYPE VARCHAR(128)"
                )
            )
            conn.commit()
            print(f"✅ Widened alembic_version.version_num to VARCHAR(128)")
        engine.dispose()
    except Exception as e:
        # Table may not exist yet — that's fine
        print(f"ℹ️  alembic_version column widen skipped: {e}")


def _run_alembic_upgrade_head(database_url: str) -> None:
    # Import lazily so the app can still start if Alembic isn't installed
    # (though the fallback bootstrap won't work without it).
    from alembic import command
    from alembic.config import Config

    alembic_cfg = Config("alembic.ini")
    # Ensure env var override is respected even if alembic.ini has a default.
    alembic_cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(alembic_cfg, "head")


def _run_alembic_stamp_baseline(database_url: str, revision: str = "0001_baseline") -> None:
    from alembic import command
    from alembic.config import Config

    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", database_url)
    command.stamp(alembic_cfg, revision)


def _bootstrap_if_missing_sqlite(plan: BootstrapPlan) -> None:
    """Bootstrap SQLite database if missing or empty.

    SQLite creates the .db file on first connection, so the file can exist
    with zero tables.  Check for actual user tables, not just file existence.
    """
    if Path(plan.db_path).exists():
        tables = _list_sqlite_tables(plan.db_path)
        user_tables = [t for t in tables if t and not t.startswith("sqlite_")]
        if user_tables:
            return
        print(f"📦 DB file exists but has no tables; bootstrapping: {plan.db_path}")
    else:
        print(f"📦 DB missing; creating via migrations: {plan.db_path}")

    _run_alembic_upgrade_head(plan.database_url)
    print("✅ Database created successfully!")


def _bootstrap_if_missing_postgres(plan: BootstrapPlan) -> None:
    """Bootstrap PostgreSQL database if tables are missing.

    Handles edge cases where:
    - Tables exist but alembic_version doesn't (created by Base.metadata.create_all)
    - _list_postgres_tables silently fails and returns [] even though tables exist
    - alembic_version.version_num column is too narrow for our revision slugs
    """
    # Always widen the alembic_version column first (safe no-op if table doesn't exist)
    _widen_alembic_version_column(plan.database_url)

    tables = _list_postgres_tables(plan.database_url)

    if tables:
        has_alembic = "alembic_version" in tables
        user_tables = [t for t in tables if t != "alembic_version"]
        print(f"✅ PostgreSQL database already has {len(user_tables)} tables (alembic_version: {has_alembic})")

        if user_tables and not has_alembic:
            # Tables exist but Alembic doesn't know — stamp to head since
            # Base.metadata.create_all creates the LATEST schema (all columns).
            print("📌 Tables exist without alembic_version — stamping to head...")
            try:
                _run_alembic_stamp_baseline(plan.database_url, revision="head")
                print("✅ Stamped to head — Alembic now tracks current state")
            except Exception as e:
                print(f"⚠️  Stamp to head failed (non-fatal): {e}")
        return

    # No tables found — try to create via migrations, but handle the case
    # where _list_postgres_tables returned [] due to a transient error
    # while tables actually exist.
    print("📦 PostgreSQL database appears empty; creating via migrations...")
    try:
        _run_alembic_upgrade_head(plan.database_url)
        print("✅ Database created successfully!")
    except Exception as e:
        error_str = str(e).lower()
        if "already exists" in error_str or "duplicatetable" in error_str or "stringdataright" in error_str:
            # Tables already exist (listing failed earlier) — stamp to head
            # since Base.metadata.create_all creates the full latest schema.
            print(
                "⚠️  Tables already exist (listing may have failed earlier). "
                "Stamping Alembic to head..."
            )
            try:
                _run_alembic_stamp_baseline(plan.database_url, revision="head")
                print("✅ Recovery successful — stamped to head")
            except Exception as recovery_err:
                print(f"⚠️  Recovery stamp to head also failed (non-fatal): {recovery_err}")
        else:
            raise


def _bootstrap_if_missing(plan: BootstrapPlan) -> None:
    """Bootstrap database if missing (works for both SQLite and PostgreSQL)."""
    if plan.backend == DatabaseBackend.POSTGRESQL:
        _bootstrap_if_missing_postgres(plan)
    else:
        _bootstrap_if_missing_sqlite(plan)


def _bootstrap_full_sqlite(plan: BootstrapPlan) -> None:
    """Full bootstrap for SQLite database."""
    db_file = Path(plan.db_path)

    # No DB file yet: create via migrations.
    if not db_file.exists():
        print(f"📦 Creating new database via migrations: {plan.db_path}")
        _run_alembic_upgrade_head(plan.database_url)
        print("✅ Database created successfully!")
        return

    # If DB exists, decide between stamp and upgrade based on alembic_version table.
    tables = _list_sqlite_tables(plan.db_path)
    user_tables = [t for t in tables if t and not t.startswith("sqlite_")]
    has_alembic_version = "alembic_version" in tables

    if user_tables and not has_alembic_version:
        print("📌 Stamping legacy database to baseline revision (0001_baseline)...")
        _run_alembic_stamp_baseline(plan.database_url, revision="0001_baseline")

    print("🔄 Applying pending migrations...")
    _run_alembic_upgrade_head(plan.database_url)
    print("✅ Migrations completed!")


def _bootstrap_full_postgres(plan: BootstrapPlan) -> None:
    """Full bootstrap for PostgreSQL database."""
    # Always widen the alembic_version column first
    _widen_alembic_version_column(plan.database_url)

    tables = _list_postgres_tables(plan.database_url)
    has_alembic_version = "alembic_version" in tables
    user_tables = [t for t in tables if t != "alembic_version"]

    if not tables:
        # Empty database: create via migrations (with recovery)
        print("📦 Creating new PostgreSQL database via migrations...")
        try:
            _run_alembic_upgrade_head(plan.database_url)
            print("✅ Database created successfully!")
        except Exception as e:
            error_str = str(e).lower()
            if "already exists" in error_str or "duplicatetable" in error_str or "stringdataright" in error_str:
                print(
                    "⚠️  Tables already exist (listing may have failed). "
                    "Stamping to head..."
                )
                _run_alembic_stamp_baseline(plan.database_url, revision="head")
                print("✅ Recovery successful — stamped to head!")
            else:
                raise
        return

    if user_tables and not has_alembic_version:
        # Tables created by Base.metadata.create_all — stamp to head
        print("📌 Stamping database to head (tables created outside Alembic)...")
        _run_alembic_stamp_baseline(plan.database_url, revision="head")
        print("✅ Stamped to head!")
        return

    print("🔄 Applying pending migrations...")
    _run_alembic_upgrade_head(plan.database_url)
    print("✅ Migrations completed!")


def _bootstrap_full(plan: BootstrapPlan) -> None:
    """Full bootstrap (works for both SQLite and PostgreSQL)."""
    if plan.backend == DatabaseBackend.POSTGRESQL:
        _bootstrap_full_postgres(plan)
    else:
        _bootstrap_full_sqlite(plan)


def maybe_bootstrap_db_on_startup() -> None:
    """Run a safe DB bootstrap during app startup when configured/needed.

    Behavior:
    - Default: create DB *only if missing* (safe fallback).
    - If `DB_BOOTSTRAP_ON_STARTUP=true`: run full bootstrap (stamp legacy + upgrade head).
    - If `DB_BOOTSTRAP_ON_STARTUP=false`: disable entirely.

    Supports both SQLite and PostgreSQL (Lakebase) backends.
    """

    mode_raw = os.getenv("DB_BOOTSTRAP_ON_STARTUP")
    if mode_raw is not None and not _truthy(mode_raw):
        # Explicitly disabled.
        return

    plan = _bootstrap_plan()

    print(f"🔍 Database backend detected: {plan.backend.value}")

    timeout_s = float(os.getenv("DB_BOOTSTRAP_LOCK_TIMEOUT_S", "300"))
    full = _truthy(mode_raw) if mode_raw is not None else False

    try:
        with _interprocess_lock(plan.lock_path, timeout_s=timeout_s):
            # Re-check under the lock.
            if full:
                _bootstrap_full(plan)
            else:
                _bootstrap_if_missing(plan)
    except ModuleNotFoundError as e:
        # Alembic is required for bootstrap. Don't hard-fail app startup; log clearly.
        if getattr(e, "name", "") == "alembic":
            print("⚠️  Alembic is not installed; cannot bootstrap DB on startup.")
            return
        raise
    except Exception as e:
        print(f"❌ Error during DB bootstrap: {e}")
        traceback.print_exc()


def bootstrap_database(*, full: bool, database_url: str | None = None, lock_timeout_s: float | None = None) -> None:
    """Bootstrap the database via Alembic, protected by an inter-process lock.

    This is the shared implementation used by:
    - `just db-bootstrap` (full=True)
    - FastAPI startup fallback (full=False by default; see maybe_bootstrap_db_on_startup)

    Supports both SQLite and PostgreSQL (Lakebase) backends.
    """

    if database_url is not None:
        os.environ["DATABASE_URL"] = database_url

    plan = _bootstrap_plan()

    print(f"🔍 Database backend: {plan.backend.value}")

    timeout_s = (
        float(lock_timeout_s) if lock_timeout_s is not None else float(os.getenv("DB_BOOTSTRAP_LOCK_TIMEOUT_S", "300"))
    )

    with _interprocess_lock(plan.lock_path, timeout_s=timeout_s):
        if full:
            _bootstrap_full(plan)
        else:
            _bootstrap_if_missing(plan)


def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Database bootstrap helpers (SQLite + PostgreSQL/Lakebase + Alembic).")
    sub = p.add_subparsers(dest="command", required=True)

    p_bootstrap = sub.add_parser("bootstrap", help="Create DB if missing; stamp legacy DBs; upgrade to head.")
    p_bootstrap.add_argument("--database-url", default=None, help="Override DATABASE_URL (otherwise uses env/default).")
    p_bootstrap.add_argument(
        "--lock-timeout-s",
        type=float,
        default=None,
        help="Time to wait for inter-process lock (defaults to DB_BOOTSTRAP_LOCK_TIMEOUT_S or 300).",
    )

    p_if_missing = sub.add_parser("bootstrap-if-missing", help="Create DB via migrations only when DB is missing/empty.")
    p_if_missing.add_argument(
        "--database-url", default=None, help="Override DATABASE_URL (otherwise uses env/default)."
    )
    p_if_missing.add_argument(
        "--lock-timeout-s",
        type=float,
        default=None,
        help="Time to wait for inter-process lock (defaults to DB_BOOTSTRAP_LOCK_TIMEOUT_S or 300).",
    )

    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    try:
        if args.command == "bootstrap":
            bootstrap_database(full=True, database_url=args.database_url, lock_timeout_s=args.lock_timeout_s)
            return 0
        if args.command == "bootstrap-if-missing":
            bootstrap_database(full=False, database_url=args.database_url, lock_timeout_s=args.lock_timeout_s)
            return 0
        raise AssertionError(f"Unhandled command: {args.command}")
    except Exception as e:
        print(f"❌ DB bootstrap failed: {e}")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
