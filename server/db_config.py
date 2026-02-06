"""Database configuration with Lakebase (PostgreSQL) and SQLite support.

This module provides automatic database backend detection:
- If Lakebase environment variables are detected (PGHOST, PGDATABASE, etc.),
  PostgreSQL is used with OAuth token refresh via Databricks SDK.
- Otherwise, falls back to SQLite (default behavior).

Environment variables for Lakebase:
- PGHOST: PostgreSQL host
- PGDATABASE: Database name
- PGUSER: Username (typically a UUID for Lakebase)
- PGPORT: Port (default 5432)
- PGSSLMODE: SSL mode (default 'require')
- PGAPPNAME: Application name for connection tracking

The OAuth token for Lakebase authentication is automatically refreshed
using the Databricks SDK WorkspaceClient.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


class DatabaseBackend(Enum):
    """Supported database backends."""

    SQLITE = "sqlite"
    POSTGRESQL = "postgresql"


@dataclass
class LakebaseConfig:
    """Configuration for Lakebase (PostgreSQL) connection."""

    host: str
    database: str
    user: str
    port: int = 5432
    sslmode: str = "require"
    app_name: str = "human-eval-workshop"

    @classmethod
    def from_env(cls) -> LakebaseConfig | None:
        """Create LakebaseConfig from environment variables.

        Returns None if required variables are not set.
        """
        host = os.getenv("PGHOST")
        database = os.getenv("PGDATABASE")
        user = os.getenv("PGUSER")

        if not all([host, database, user]):
            return None

        return cls(
            host=host,  # type: ignore
            database=database,  # type: ignore
            user=user,  # type: ignore
            port=int(os.getenv("PGPORT", "5432")),
            sslmode=os.getenv("PGSSLMODE", "require"),
            app_name=os.getenv("PGAPPNAME", "human-eval-workshop"),
        )


class OAuthTokenManager:
    """Manages OAuth token refresh for Lakebase connections."""

    def __init__(self, refresh_interval_seconds: int = 900):
        """Initialize token manager.

        Args:
            refresh_interval_seconds: Interval between token refreshes (default 15 min).
        """
        self._token: str | None = None
        self._last_refresh: float = 0
        self._refresh_interval = refresh_interval_seconds
        self._workspace_client = None

    def _get_workspace_client(self):
        """Lazily initialize WorkspaceClient."""
        if self._workspace_client is None:
            from databricks.sdk import WorkspaceClient
            self._workspace_client = WorkspaceClient()
        return self._workspace_client

    def get_token(self) -> str:
        """Get OAuth token, refreshing if needed."""
        current_time = time.time()

        if self._token is None or (current_time - self._last_refresh) > self._refresh_interval:
            try:
                client = self._get_workspace_client()
                self._token = client.config.oauth_token().access_token
                self._last_refresh = current_time
                logger.info("Successfully refreshed Lakebase OAuth token")
            except Exception as e:
                logger.error(f"Failed to refresh OAuth token: {e}")
                if self._token is None:
                    raise RuntimeError(f"Cannot obtain OAuth token for Lakebase: {e}") from e
                # Use stale token if we have one
                logger.warning("Using potentially stale OAuth token")

        return self._token

    @property
    def needs_refresh(self) -> bool:
        """Check if token needs to be refreshed."""
        return self._token is None or (time.time() - self._last_refresh) > self._refresh_interval


# Global token manager instance
_token_manager: OAuthTokenManager | None = None


def get_token_manager() -> OAuthTokenManager:
    """Get the global token manager instance."""
    global _token_manager
    if _token_manager is None:
        _token_manager = OAuthTokenManager()
    return _token_manager


def detect_database_backend() -> DatabaseBackend:
    """Detect which database backend to use based on environment variables.

    Returns:
        DatabaseBackend.POSTGRESQL if Lakebase env vars are detected,
        DatabaseBackend.SQLITE otherwise.
    """
    lakebase_config = LakebaseConfig.from_env()
    if lakebase_config is not None:
        logger.info(
            f"Lakebase detected: host={lakebase_config.host}, "
            f"database={lakebase_config.database}, "
            f"app_name={lakebase_config.app_name}"
        )
        return DatabaseBackend.POSTGRESQL

    logger.info("Lakebase not detected, using SQLite")
    return DatabaseBackend.SQLITE


def get_database_url() -> str:
    """Get the database URL based on detected backend.

    For SQLite: Uses DATABASE_URL env var or default.
    For PostgreSQL: Constructs URL from Lakebase env vars with OAuth token.
    """
    backend = detect_database_backend()

    if backend == DatabaseBackend.SQLITE:
        return os.getenv("DATABASE_URL", "sqlite:///./workshop.db")

    # PostgreSQL with Lakebase
    config = LakebaseConfig.from_env()
    if config is None:
        raise RuntimeError("Lakebase detected but config could not be created")

    token_manager = get_token_manager()
    password = token_manager.get_token()

    # Construct PostgreSQL URL
    # Note: psycopg uses postgresql+psycopg for async, postgresql for sync
    url = (
        f"postgresql+psycopg://{config.user}:{password}@"
        f"{config.host}:{config.port}/{config.database}"
        f"?sslmode={config.sslmode}"
        f"&application_name={config.app_name}"
    )

    return url


def create_engine_for_backend(backend: DatabaseBackend) -> "Engine":
    """Create SQLAlchemy engine for the specified backend.

    Args:
        backend: The database backend to use.

    Returns:
        Configured SQLAlchemy engine.
    """
    from sqlalchemy import create_engine, event

    if backend == DatabaseBackend.SQLITE:
        database_url = os.getenv("DATABASE_URL", "sqlite:///./workshop.db")

        # Enhanced connection arguments for SQLite
        connect_args = {
            "check_same_thread": False,
            "timeout": 60,
            "isolation_level": "DEFERRED",
        }

        engine = create_engine(
            database_url,
            connect_args=connect_args,
            pool_size=20,
            max_overflow=30,
            pool_timeout=30,
            pool_recycle=3600,
            pool_pre_ping=True,
            echo=False,
        )

        # Set SQLite PRAGMAs on every connection
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=60000")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.close()

        return engine

    # PostgreSQL with Lakebase
    config = LakebaseConfig.from_env()
    if config is None:
        raise RuntimeError("Cannot create PostgreSQL engine: Lakebase config not available")

    token_manager = get_token_manager()
    password = token_manager.get_token()

    database_url = (
        f"postgresql+psycopg://{config.user}:{password}@"
        f"{config.host}:{config.port}/{config.database}"
        f"?sslmode={config.sslmode}"
        f"&application_name={config.app_name}"
    )

    # Derive schema name from PGAPPNAME (hyphens → underscores for SQL safety)
    schema_name = config.app_name.replace("-", "_")

    engine = create_engine(
        database_url,
        pool_size=10,
        max_overflow=20,
        pool_timeout=30,
        pool_recycle=1800,  # Recycle connections every 30 min (before token expires)
        pool_pre_ping=True,
        echo=False,
        # Set search_path at the PostgreSQL protocol level during connection
        # establishment.  This is more reliable than an event listener because
        # it is handled by the server before any SQL statement runs.
        connect_args={"options": f"-csearch_path={schema_name},public"},
    )

    # Also set search_path via on_connect as a belt-and-suspenders fallback
    # and handle token refresh for long-lived pooled connections.
    @event.listens_for(engine, "connect")
    def on_connect(dbapi_connection, connection_record):
        """Set search_path and refresh token on new connections."""
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute(f'SET search_path TO "{schema_name}", public')
            cursor.close()
        except Exception as e:
            logger.warning(f"Failed to SET search_path in on_connect: {e}")

        if token_manager.needs_refresh:
            try:
                token_manager.get_token()  # Refresh token
            except Exception as e:
                logger.warning(f"Token refresh on connect failed: {e}")

    logger.info(f"PostgreSQL engine created with search_path: {schema_name}, public")
    return engine


def get_schema_name() -> str | None:
    """Get the schema name for Lakebase.

    For SQLite, returns None (no schema).
    For PostgreSQL, returns a schema name based on PGAPPNAME and PGUSER.
    """
    backend = detect_database_backend()
    if backend == DatabaseBackend.SQLITE:
        return None

    # For Lakebase, create a schema name
    app_name = os.getenv("PGAPPNAME", "human_eval_workshop")
    user = os.getenv("PGUSER", "").replace("-", "_")

    # Clean up schema name to be SQL-safe
    schema_name = f"{app_name}_schema_{user}".replace("-", "_")

    return schema_name
