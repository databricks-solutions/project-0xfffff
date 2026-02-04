"""Alembic environment script.

This project supports both SQLite and PostgreSQL (Lakebase) backends.
For SQLite, many ALTER operations require Alembic "batch mode" ("move and copy").
We enable that via render_as_batch=True.
See: https://alembic.sqlalchemy.org/en/latest/batch.html
"""

from __future__ import annotations

import os

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from server.database import Base

# Alembic Config object provides access to values within the config file.
config = context.config

# NOTE: We intentionally do not call logging.config.fileConfig() here.
# Alembic's default templates configure logging via `alembic.ini`, but this
# project keeps Alembic configuration in `pyproject.toml` and does not require
# an `alembic.ini` file. If you later want Alembic-managed logging, either add
# a minimal `alembic.ini` or configure logging explicitly in Python.

target_metadata = Base.metadata


def _get_database_url() -> str:
    """Get database URL, supporting both SQLite and PostgreSQL (Lakebase).

    Priority:
    1. Alembic command-line override (via set_main_option)
    2. Lakebase environment variables (PGHOST, PGDATABASE, PGUSER)
    3. DATABASE_URL environment variable
    4. Default from pyproject.toml
    """
    # Check if URL was set via Alembic config (e.g., from db_bootstrap.py)
    alembic_url = config.get_main_option("sqlalchemy.url")
    if alembic_url and not alembic_url.startswith("sqlite"):
        # If it's a PostgreSQL URL passed via config, use it directly
        return alembic_url

    # Check for Lakebase environment variables
    pghost = os.getenv("PGHOST")
    pgdatabase = os.getenv("PGDATABASE")
    pguser = os.getenv("PGUSER")

    if all([pghost, pgdatabase, pguser]):
        # Lakebase detected - construct PostgreSQL URL with OAuth token
        try:
            from server.db_config import LakebaseConfig, get_token_manager

            lakebase_config = LakebaseConfig.from_env()
            if lakebase_config:
                token_manager = get_token_manager()
                password = token_manager.get_token()

                return (
                    f"postgresql+psycopg://{lakebase_config.user}:{password}@"
                    f"{lakebase_config.host}:{lakebase_config.port}/{lakebase_config.database}"
                    f"?sslmode={lakebase_config.sslmode}"
                    f"&application_name={lakebase_config.app_name}"
                )
        except Exception as e:
            print(f"Warning: Could not construct Lakebase URL: {e}")

    # Fall back to DATABASE_URL env var or pyproject default
    return os.getenv("DATABASE_URL") or alembic_url


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    url = _get_database_url()

    connect_args = {}
    is_sqlite = "sqlite" in (url or "")

    if is_sqlite:
        connect_args = {"check_same_thread": False, "timeout": 30}

    engine = create_engine(url, connect_args=connect_args, poolclass=NullPool)

    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # Required for SQLite, safe for PostgreSQL
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


#
# Note: Alembic also supports "offline" migrations (e.g. `alembic upgrade head --sql`)
# where it renders SQL without connecting to the database. We don't currently use that
# workflow, so this env.py is intentionally kept "online-only" for simplicity.
#
run_migrations_online()
