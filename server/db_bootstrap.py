"""Database bootstrap utilities (SQLite + Alembic).

This module exists primarily as a *deployment safety net*:
- Preferred workflow: run `just db-bootstrap` before starting the API.
- Fallback: on API startup, if the DB file is missing we can create it via Alembic.
  Optionally, deployments can enable full bootstrap (stamp legacy + upgrade).

Important: FastAPI lifespan runs once per worker process under gunicorn, so any
bootstrap logic must be protected by an inter-process lock to avoid concurrent
migrations corrupting SQLite.
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
from pathlib import Path


def _truthy(v: str | None) -> bool:
    if v is None:
        return False
    return v.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


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


@dataclass(frozen=True)
class BootstrapPlan:
    database_url: str
    db_path: str
    lock_path: str


def _bootstrap_plan() -> BootstrapPlan:
    database_url = os.getenv("DATABASE_URL", "sqlite:///./workshop.db")
    db_path = _db_path_from_url(database_url)

    # Keep the lock next to the DB so it works across processes/containers sharing that volume.
    db_path_abs = str(Path(db_path).expanduser().resolve())
    lock_path = f"{db_path_abs}.bootstrap.lock"

    return BootstrapPlan(database_url=database_url, db_path=db_path_abs, lock_path=lock_path)


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


def _bootstrap_if_missing(plan: BootstrapPlan) -> None:
    if Path(plan.db_path).exists():
        return

    print(f"📦 DB missing; creating via migrations: {plan.db_path}")
    _run_alembic_upgrade_head(plan.database_url)
    print("✅ Database created successfully!")


def _bootstrap_full(plan: BootstrapPlan) -> None:
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


def maybe_bootstrap_db_on_startup() -> None:
    """Run a safe DB bootstrap during app startup when configured/needed.

    Behavior:
    - Default: create DB *only if missing* (safe fallback).
    - If `DB_BOOTSTRAP_ON_STARTUP=true`: run full bootstrap (stamp legacy + upgrade head).
    - If `DB_BOOTSTRAP_ON_STARTUP=false`: disable entirely.
    """

    mode_raw = os.getenv("DB_BOOTSTRAP_ON_STARTUP")
    if mode_raw is not None and not _truthy(mode_raw):
        # Explicitly disabled.
        return

    plan = _bootstrap_plan()

    # This project uses SQLite; if a non-sqlite URL is provided, do nothing here.
    if "sqlite" not in (plan.database_url or ""):
        return

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
    """Bootstrap the SQLite database via Alembic, protected by an inter-process lock.

    This is the shared implementation used by:
    - `just db-bootstrap` (full=True)
    - FastAPI startup fallback (full=False by default; see maybe_bootstrap_db_on_startup)
    """

    if database_url is not None:
        os.environ["DATABASE_URL"] = database_url

    plan = _bootstrap_plan()
    if "sqlite" not in (plan.database_url or ""):
        raise ValueError(f"bootstrap_database only supports sqlite URLs; got: {plan.database_url}")

    timeout_s = (
        float(lock_timeout_s) if lock_timeout_s is not None else float(os.getenv("DB_BOOTSTRAP_LOCK_TIMEOUT_S", "300"))
    )

    with _interprocess_lock(plan.lock_path, timeout_s=timeout_s):
        if full:
            _bootstrap_full(plan)
        else:
            _bootstrap_if_missing(plan)


def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="SQLite DB bootstrap helpers (Alembic).")
    sub = p.add_subparsers(dest="command", required=True)

    p_bootstrap = sub.add_parser("bootstrap", help="Create DB if missing; stamp legacy DBs; upgrade to head.")
    p_bootstrap.add_argument("--database-url", default=None, help="Override DATABASE_URL (otherwise uses env/default).")
    p_bootstrap.add_argument(
        "--lock-timeout-s",
        type=float,
        default=None,
        help="Time to wait for inter-process lock (defaults to DB_BOOTSTRAP_LOCK_TIMEOUT_S or 300).",
    )

    p_if_missing = sub.add_parser("bootstrap-if-missing", help="Create DB via migrations only when DB file is missing.")
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
