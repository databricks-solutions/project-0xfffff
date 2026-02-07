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
    else:
        # Set search_path at the PostgreSQL protocol level so migrations
        # create tables in the app schema from the very first statement.
        app_name = os.getenv("PGAPPNAME", "human_eval_workshop")
        schema_name = app_name.replace("-", "_")
        connect_args = {"options": f"-csearch_path={schema_name},public"}

    engine = create_engine(url, connect_args=connect_args, poolclass=NullPool)

    with engine.connect() as connection:
        # For PostgreSQL/Lakebase: set search_path so migrations create
        # tables in the app schema (derived from PGAPPNAME).
        if not is_sqlite:
            from sqlalchemy import text

            app_name = os.getenv("PGAPPNAME", "human_eval_workshop")
            schema_name = app_name.replace("-", "_")
            pg_user = os.getenv("PGUSER", "")

            # Create schema with ownership if it doesn't exist
            connection.execute(
                text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}" AUTHORIZATION "{pg_user}"')
            )
            # Grant privileges on the schema to PGUSER
            if pg_user:
                connection.execute(
                    text(f'GRANT ALL PRIVILEGES ON SCHEMA "{schema_name}" TO "{pg_user}"')
                )
            connection.execute(text(f'SET search_path TO "{schema_name}", public'))
            connection.commit()

        configure_kwargs = dict(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # Required for SQLite, safe for PostgreSQL
            compare_type=True,
        )

        # For PostgreSQL/Lakebase: place alembic_version in the app schema
        # so it's accessible to the service principal (who may not have
        # privileges on the public schema where a stale alembic_version
        # from a previous owner could exist).
        if not is_sqlite:
            configure_kwargs["version_table_schema"] = schema_name

        context.configure(**configure_kwargs)

        with context.begin_transaction():
            context.run_migrations()


#
# Note: Alembic also supports "offline" migrations (e.g. `alembic upgrade head --sql`)
# where it renders SQL without connecting to the database. We don't currently use that
# workflow, so this env.py is intentionally kept "online-only" for simplicity.
#
run_migrations_online()
