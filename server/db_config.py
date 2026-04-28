"""Database configuration with Lakebase (PostgreSQL) and SQLite support.

This module provides database backend selection via the DATABASE_ENV
environment variable:
- DATABASE_ENV=postgres  → PostgreSQL (Lakebase) with OAuth token refresh
- DATABASE_ENV=sqlite    → SQLite (default when DATABASE_ENV is unset)

When using PostgreSQL, these environment variables configure the connection:
- PGHOST: PostgreSQL host
- PGDATABASE: Database name
- PGUSER: Username (typically a UUID for Lakebase service principal)
- PGPORT: Port (default 5432)
- PGSSLMODE: SSL mode (default 'require')
- PGAPPNAME: Application name for connection tracking
- ENDPOINT_NAME: Lakebase endpoint for credential generation
  (format: projects/<id>/branches/<id>/endpoints/<id>)

OAuth credentials for Lakebase are generated via the Databricks SDK
``WorkspaceClient().postgres.generate_database_credential()`` and injected
into new physical connections via the SQLAlchemy ``do_connect`` event.
Existing pooled connections remain valid after the credential expires — tokens
are only checked at connection establishment.

Reference: https://docs.databricks.com/aws/en/lakebase/connect/custom-app.html
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


class LakebaseCredentialManager:
    """Caches Lakebase database credentials and refreshes near expiry.

    Uses ``WorkspaceClient().postgres.generate_database_credential()`` which
    returns a token valid for 1 hour.  Tokens are refreshed 2 minutes before
    expiry.  Existing pooled connections remain valid after the cached token
    expires — this manager is only consulted when creating *new* physical
    connections via the ``do_connect`` event.

    Reference: https://docs.databricks.com/aws/en/lakebase/connect/token-rotation.html
    """

    # Refresh 2 minutes before the 1-hour expiry
    _EXPIRY_BUFFER_SECONDS = 120

    def __init__(self):
        self._token: str | None = None
        self._token_expiry: float = 0.0
        self._workspace_client = None

    def _get_workspace_client(self):
        """Lazily initialize WorkspaceClient."""
        if self._workspace_client is None:
            from databricks.sdk import WorkspaceClient

            self._workspace_client = WorkspaceClient()
        return self._workspace_client

    def get_password(self, endpoint_name: str | None = None) -> str:
        """Get a database credential, refreshing if near expiry.

        Args:
            endpoint_name: Lakebase endpoint name for generate_database_credential().
                If None, falls back to workspace OAuth token.
        """
        now = time.time()

        if self._token is not None and now < (self._token_expiry - self._EXPIRY_BUFFER_SECONDS):
            return self._token

        client = self._get_workspace_client()

        try:
            if endpoint_name:
                cred = client.postgres.generate_database_credential(endpoint=endpoint_name)
                token = cred.token
                if not token:
                    raise RuntimeError(
                        "generate_database_credential returned empty token "
                        f"(endpoint={endpoint_name})"
                    )
                self._token = token
                # expire_time is a google.protobuf.Timestamp (absolute UTC),
                # not a Duration — use .seconds directly as the epoch expiry.
                try:
                    self._token_expiry = cred.expire_time.seconds
                except (AttributeError, TypeError):
                    self._token_expiry = now + 3600
                logger.info(
                    "Refreshed Lakebase credential via generate_database_credential "
                    "(expires in %.0fs)",
                    self._token_expiry - now,
                )
            else:
                oauth = client.config.oauth_token()
                token = oauth.access_token
                if not token:
                    raise RuntimeError("oauth_token() returned empty access_token")
                self._token = token
                self._token_expiry = now + 3600
                logger.info(
                    "Refreshed Lakebase credential via workspace OAuth token (no ENDPOINT_NAME)"
                )
        except Exception as e:
            logger.error("Failed to refresh Lakebase credential: %s", e)
            if self._token is None:
                raise RuntimeError(f"Cannot obtain Lakebase credential: {e}") from e
            logger.warning("Using potentially stale Lakebase credential")

        return self._token


# Global credential manager instance
_credential_manager: LakebaseCredentialManager | None = None


def get_credential_manager() -> LakebaseCredentialManager:
    """Get the global Lakebase credential manager instance."""
    global _credential_manager
    if _credential_manager is None:
        _credential_manager = LakebaseCredentialManager()
    return _credential_manager


def detect_database_backend() -> DatabaseBackend:
    """Detect which database backend to use based on DATABASE_ENV.

    Returns:
        DatabaseBackend.POSTGRESQL if DATABASE_ENV is "postgres",
        DatabaseBackend.SQLITE otherwise (including when DATABASE_ENV is unset).
    """
    database_env = os.getenv("DATABASE_ENV", "sqlite").lower()

    if database_env == "postgres":
        lakebase_config = LakebaseConfig.from_env()
        if lakebase_config is not None:
            logger.info(
                f"DATABASE_ENV=postgres: host={lakebase_config.host}, "
                f"database={lakebase_config.database}, "
                f"app_name={lakebase_config.app_name}"
            )
        else:
            logger.info("DATABASE_ENV=postgres (PG connection vars will be read at engine creation)")
        return DatabaseBackend.POSTGRESQL

    logger.info(f"DATABASE_ENV={database_env}, using SQLite")
    return DatabaseBackend.SQLITE


def get_database_url() -> str:
    """Get the database URL based on detected backend.

    For SQLite: Uses DATABASE_URL env var or default.
    For PostgreSQL: Returns a placeholder URL — actual credentials are
    injected per-connection via the ``do_connect`` event in
    ``create_engine_for_backend()``.
    """
    backend = detect_database_backend()

    if backend == DatabaseBackend.SQLITE:
        return os.getenv("DATABASE_URL", "sqlite:///./workshop.db")

    # PostgreSQL: return placeholder — do_connect handles auth
    return "postgresql+psycopg://"


def create_engine_for_backend(backend: DatabaseBackend) -> Engine:
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

    credential_manager = get_credential_manager()
    endpoint_name = os.getenv("ENDPOINT_NAME")
    if endpoint_name:
        logger.info("ENDPOINT_NAME=%s — will use generate_database_credential()", endpoint_name)
    else:
        logger.info("ENDPOINT_NAME not set — falling back to workspace OAuth token.")

    # Derive schema name from PGAPPNAME (hyphens → underscores for SQL safety)
    schema_name = config.app_name.replace("-", "_")

    # Build connection URL without password — do_connect injects it per-connection.
    # Reference: https://docs.databricks.com/aws/en/lakebase/connect/custom-app.html
    conninfo = (
        f"postgresql+psycopg://{config.user}@"
        f"{config.host}:{config.port}/{config.database}"
        f"?sslmode={config.sslmode}"
        f"&application_name={config.app_name}"
        f"&options=-csearch_path%3D{schema_name}%2Cpublic"
    )

    engine = create_engine(
        conninfo,
        pool_size=5,
        max_overflow=5,  # Cap at 10/worker, 20 total with 2 gunicorn workers
        pool_timeout=30,
        pool_recycle=2700,  # 45 min — recycle well before token expiry
        pool_pre_ping=True,  # Detect stale/expired connections before use
        echo=False,
    )

    # Inject fresh credential into each NEW physical connection.
    # pool_pre_ping detects dead connections and discards them; the
    # replacement connection comes through do_connect with a fresh token.
    # Reference: https://docs.databricks.com/aws/en/lakebase/connect/token-rotation.html
    @event.listens_for(engine, "do_connect")
    def provide_token(dialect, conn_rec, cargs, cparams):
        password = credential_manager.get_password(endpoint_name)
        cparams["password"] = password
        logger.debug(
            "do_connect: injected credential (length=%d, user=%s, host=%s)",
            len(password) if password else 0,
            cparams.get("user", "?"),
            cparams.get("host", "?"),
        )

    # Set search_path on every new connection
    @event.listens_for(engine, "connect")
    def on_connect(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute(f'SET search_path TO "{schema_name}", public')
            cursor.close()
        except Exception as e:
            logger.warning(f"Failed to SET search_path in on_connect: {e}")

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
