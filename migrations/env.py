"""Alembic environment script.

This project uses SQLite. Many ALTER operations require Alembic "batch mode"
("move and copy"). We enable that via render_as_batch=True.
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
    # Prefer runtime env var, fall back to pyproject's sqlalchemy.url.
    return os.getenv("DATABASE_URL") or config.get_main_option("sqlalchemy.url")


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    url = _get_database_url()

    connect_args = {}
    if "sqlite" in (url or ""):
        connect_args = {"check_same_thread": False, "timeout": 30}

    engine = create_engine(url, connect_args=connect_args, poolclass=NullPool)

    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # SQLite-compatible "move and copy"
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
