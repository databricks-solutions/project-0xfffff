"""PostgresManager — direct psycopg interface for Lakebase (PostgreSQL) table operations.

Provides create / read / write / upsert helpers on the predefined app tables
without going through SQLAlchemy ORM.  Useful for batch operations and for
contexts where the ORM overhead is unnecessary.

Usage::

    from server.postgres_manager import PostgresManager

    mgr = PostgresManager.get_instance()
    mgr.create_tables()
    mgr.write("users", {"id": "u1", "email": "a@b.com", "name": "Alice", "role": "annotator", "workshop_id": "w1"})
    rows = mgr.read("users", filters={"workshop_id": "w1"})
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

# Predefined app tables that the manager is allowed to operate on.
# Matches the SQLAlchemy models defined in server/database.py.
ALLOWED_TABLES: set[str] = {
    "users",
    "facilitator_configs",
    "workshop_participants",
    "workshops",
    "traces",
    "discovery_findings",
    "user_discovery_completions",
    "rubrics",
    "annotations",
    "mlflow_intake_config",
    "databricks_tokens",
    "judge_prompts",
    "judge_evaluations",
    "user_trace_orders",
    "custom_llm_provider_config",
}


def _validate_table_name(table_name: str) -> None:
    """Raise ValueError if *table_name* is not in the whitelist."""
    if table_name not in ALLOWED_TABLES:
        raise ValueError(
            f"Table '{table_name}' is not a recognised app table. Allowed tables: {sorted(ALLOWED_TABLES)}"
        )


# ---------------------------------------------------------------------------
# DDL for all predefined tables (PostgreSQL syntax)
# ---------------------------------------------------------------------------
_TABLE_DDL: list[str] = [
    # -- workshops (referenced by many FKs, create first) --
    """
    CREATE TABLE IF NOT EXISTS workshops (
        id              VARCHAR PRIMARY KEY,
        name            VARCHAR NOT NULL,
        description     TEXT,
        facilitator_id  VARCHAR NOT NULL,
        status          VARCHAR DEFAULT 'active',
        current_phase   VARCHAR DEFAULT 'intake',
        completed_phases            JSON DEFAULT '[]',
        discovery_started           BOOLEAN DEFAULT FALSE,
        annotation_started          BOOLEAN DEFAULT FALSE,
        active_discovery_trace_ids  JSON DEFAULT '[]',
        active_annotation_trace_ids JSON DEFAULT '[]',
        discovery_randomize_traces  BOOLEAN DEFAULT FALSE,
        annotation_randomize_traces BOOLEAN DEFAULT FALSE,
        judge_name                  VARCHAR DEFAULT 'workshop_judge',
        input_jsonpath              TEXT,
        output_jsonpath             TEXT,
        auto_evaluation_job_id      VARCHAR,
        auto_evaluation_prompt      TEXT,
        auto_evaluation_model       VARCHAR,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- users --
    """
    CREATE TABLE IF NOT EXISTS users (
        id              VARCHAR PRIMARY KEY,
        email           VARCHAR UNIQUE NOT NULL,
        name            VARCHAR NOT NULL,
        role            VARCHAR NOT NULL,
        workshop_id     VARCHAR REFERENCES workshops(id),
        status          VARCHAR DEFAULT 'active',
        password_hash   VARCHAR,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active     TIMESTAMP
    )
    """,
    # -- facilitator_configs --
    """
    CREATE TABLE IF NOT EXISTS facilitator_configs (
        id              VARCHAR PRIMARY KEY,
        email           VARCHAR UNIQUE NOT NULL,
        password_hash   VARCHAR NOT NULL,
        name            VARCHAR NOT NULL,
        description     TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- workshop_participants --
    """
    CREATE TABLE IF NOT EXISTS workshop_participants (
        id              VARCHAR PRIMARY KEY,
        user_id         VARCHAR NOT NULL REFERENCES users(id),
        workshop_id     VARCHAR NOT NULL REFERENCES workshops(id),
        role            VARCHAR NOT NULL,
        assigned_traces JSON DEFAULT '[]',
        annotation_quota INTEGER,
        joined_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- traces --
    """
    CREATE TABLE IF NOT EXISTS traces (
        id                  VARCHAR PRIMARY KEY,
        workshop_id         VARCHAR REFERENCES workshops(id) ON DELETE CASCADE,
        input               TEXT NOT NULL,
        output              TEXT NOT NULL,
        context             JSON,
        trace_metadata      JSON,
        mlflow_trace_id     VARCHAR,
        mlflow_url          VARCHAR,
        mlflow_host         VARCHAR,
        mlflow_experiment_id VARCHAR,
        include_in_alignment BOOLEAN DEFAULT TRUE,
        sme_feedback        TEXT,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- discovery_findings --
    """
    CREATE TABLE IF NOT EXISTS discovery_findings (
        id              VARCHAR PRIMARY KEY,
        workshop_id     VARCHAR NOT NULL REFERENCES workshops(id),
        trace_id        VARCHAR NOT NULL REFERENCES traces(id),
        user_id         VARCHAR NOT NULL,
        insight         TEXT NOT NULL,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- user_discovery_completions --
    """
    CREATE TABLE IF NOT EXISTS user_discovery_completions (
        id              VARCHAR PRIMARY KEY,
        workshop_id     VARCHAR NOT NULL REFERENCES workshops(id),
        user_id         VARCHAR NOT NULL REFERENCES users(id),
        completed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- rubrics --
    """
    CREATE TABLE IF NOT EXISTS rubrics (
        id              VARCHAR PRIMARY KEY,
        workshop_id     VARCHAR NOT NULL REFERENCES workshops(id),
        question        TEXT NOT NULL,
        judge_type      VARCHAR DEFAULT 'likert',
        binary_labels   JSON,
        rating_scale    INTEGER DEFAULT 5,
        created_by      VARCHAR NOT NULL,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- annotations --
    """
    CREATE TABLE IF NOT EXISTS annotations (
        id              VARCHAR PRIMARY KEY,
        workshop_id     VARCHAR NOT NULL REFERENCES workshops(id),
        trace_id        VARCHAR NOT NULL REFERENCES traces(id),
        user_id         VARCHAR NOT NULL,
        rating          INTEGER NOT NULL,
        ratings         JSON,
        comment         TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- mlflow_intake_config --
    """
    CREATE TABLE IF NOT EXISTS mlflow_intake_config (
        id                  VARCHAR PRIMARY KEY,
        workshop_id         VARCHAR NOT NULL UNIQUE REFERENCES workshops(id),
        databricks_host     VARCHAR NOT NULL,
        experiment_id       VARCHAR NOT NULL,
        max_traces          INTEGER DEFAULT 100,
        filter_string       TEXT,
        is_ingested         BOOLEAN DEFAULT FALSE,
        trace_count         INTEGER DEFAULT 0,
        last_ingestion_time TIMESTAMP,
        error_message       TEXT,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- databricks_tokens --
    """
    CREATE TABLE IF NOT EXISTS databricks_tokens (
        workshop_id     VARCHAR PRIMARY KEY REFERENCES workshops(id),
        token           TEXT NOT NULL,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- judge_prompts --
    """
    CREATE TABLE IF NOT EXISTS judge_prompts (
        id                  VARCHAR PRIMARY KEY,
        workshop_id         VARCHAR NOT NULL REFERENCES workshops(id),
        prompt_text         TEXT NOT NULL,
        judge_type          VARCHAR DEFAULT 'likert',
        version             INTEGER NOT NULL,
        few_shot_examples   JSON DEFAULT '[]',
        model_name          VARCHAR DEFAULT 'demo',
        model_parameters    JSON,
        binary_labels       JSON,
        rating_scale        INTEGER DEFAULT 5,
        created_by          VARCHAR NOT NULL,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        performance_metrics JSON
    )
    """,
    # -- judge_evaluations --
    """
    CREATE TABLE IF NOT EXISTS judge_evaluations (
        id                  VARCHAR PRIMARY KEY,
        workshop_id         VARCHAR NOT NULL REFERENCES workshops(id),
        prompt_id           VARCHAR NOT NULL REFERENCES judge_prompts(id),
        trace_id            VARCHAR NOT NULL REFERENCES traces(id),
        predicted_rating    INTEGER,
        human_rating        INTEGER,
        predicted_binary    BOOLEAN,
        human_binary        BOOLEAN,
        predicted_feedback  TEXT,
        human_feedback      TEXT,
        confidence          DOUBLE PRECISION,
        reasoning           TEXT,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- user_trace_orders --
    """
    CREATE TABLE IF NOT EXISTS user_trace_orders (
        id                  VARCHAR PRIMARY KEY,
        user_id             VARCHAR NOT NULL,
        workshop_id         VARCHAR NOT NULL REFERENCES workshops(id),
        discovery_traces    JSON DEFAULT '[]',
        annotation_traces   JSON DEFAULT '[]',
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # -- custom_llm_provider_config --
    """
    CREATE TABLE IF NOT EXISTS custom_llm_provider_config (
        id              VARCHAR PRIMARY KEY,
        workshop_id     VARCHAR NOT NULL UNIQUE REFERENCES workshops(id),
        provider_name   VARCHAR NOT NULL,
        base_url        VARCHAR NOT NULL,
        model_name      VARCHAR NOT NULL,
        is_enabled      BOOLEAN DEFAULT TRUE,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
]


class PostgresManager:
    """Direct psycopg-based manager for Lakebase table operations.

    Provides ``create_tables``, ``read``, ``write``, ``write_many``,
    ``upsert``, and ``execute`` methods that bypass SQLAlchemy and speak
    directly to PostgreSQL via a ``psycopg_pool.ConnectionPool``.
    """

    _instance: PostgresManager | None = None

    # ------------------------------------------------------------------
    # Singleton
    # ------------------------------------------------------------------
    @classmethod
    def get_instance(cls) -> PostgresManager:
        """Return the singleton PostgresManager (creates on first call)."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------
    def __init__(self) -> None:
        from .db_config import LakebaseConfig, get_token_manager

        self._config = LakebaseConfig.from_env()
        if self._config is None:
            raise RuntimeError(
                "PostgresManager requires Lakebase environment variables "
                "(PGHOST, PGDATABASE, PGUSER). Set them or use SQLite instead."
            )

        self._token_manager = get_token_manager()
        # Derive schema name the same way as db_config.py (hyphens → underscores)
        self._schema_name = self._config.app_name.replace("-", "_")
        self._pool = None  # lazy init
        self._pool_created_at: float = 0

        logger.info("=" * 60)
        logger.info("PostgresManager initialised")
        logger.info(f"  Host  : {self._config.host}")
        logger.info(f"  DB    : {self._config.database}")
        logger.info(f"  Schema: {self._schema_name}")
        logger.info("=" * 60)

    # ------------------------------------------------------------------
    # Connection helpers
    # ------------------------------------------------------------------
    def _build_conn_string(self) -> str:
        """Build a libpq-style connection string with a fresh OAuth token."""
        password = self._token_manager.get_token()
        cfg = self._config
        return (
            f"dbname={cfg.database} "
            f"user={cfg.user} "
            f"password={password} "
            f"host={cfg.host} "
            f"port={cfg.port} "
            f"sslmode={cfg.sslmode} "
            f"options='-csearch_path={self._schema_name},public'"
        )

    def _ensure_pool(self):
        """Create or recreate the connection pool when the token has expired."""
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        needs_new_pool = self._pool is None or self._token_manager.needs_refresh

        if needs_new_pool:
            # Close old pool if present
            if self._pool is not None:
                try:
                    self._pool.close()
                except Exception:
                    pass

            conn_string = self._build_conn_string()
            self._pool = ConnectionPool(
                conn_string,
                min_size=2,
                max_size=10,
                kwargs={"row_factory": dict_row},
            )
            self._pool_created_at = time.time()
            logger.info("PostgresManager: connection pool created/refreshed")

        return self._pool

    # ------------------------------------------------------------------
    # Schema & table creation
    # ------------------------------------------------------------------
    def create_tables(self) -> None:
        """Create the schema and all predefined app tables.

        Safe to call multiple times — uses ``CREATE TABLE IF NOT EXISTS``.
        """
        pg_user = os.getenv("PGUSER", "")
        pool = self._ensure_pool()
        with pool.connection() as conn:
            # Create schema with ownership for Lakebase service principal
            conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{self._schema_name}" AUTHORIZATION "{pg_user}"')
            # Grant privileges on the schema to PGUSER
            if pg_user:
                conn.execute(f'GRANT ALL PRIVILEGES ON SCHEMA "{self._schema_name}" TO "{pg_user}"')
            # Ensure search_path is set for this connection
            conn.execute(f'SET search_path TO "{self._schema_name}", public')
            conn.commit()
            logger.info(f"Schema '{self._schema_name}' ensured")

            # Create tables in the app schema (search_path ensures they land there)
            for ddl in _TABLE_DDL:
                conn.execute(ddl)
            conn.commit()
            logger.info(f"All {len(_TABLE_DDL)} predefined tables created/verified")

            # Grant privileges on all tables and sequences to PGUSER
            if pg_user:
                try:
                    conn.execute(f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "{self._schema_name}" TO "{pg_user}"')
                    conn.execute(
                        f'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "{self._schema_name}" TO "{pg_user}"'
                    )
                    conn.commit()
                    logger.info(f"Privileges granted to {pg_user} on schema {self._schema_name}")
                except Exception as grant_err:
                    logger.warning(f"Privilege grant skipped: {grant_err}")

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------
    def write(self, table_name: str, data: dict[str, Any]) -> dict[str, Any]:
        """Insert a single row and return it.

        Args:
            table_name: One of the predefined app table names.
            data: Column-name → value mapping for the new row.

        Returns:
            The inserted row as a dict.
        """
        _validate_table_name(table_name)
        if not data:
            raise ValueError("data must be a non-empty dict")

        columns = list(data.keys())
        placeholders = [f"%({c})s" for c in columns]

        sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({', '.join(placeholders)}) RETURNING *"

        pool = self._ensure_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, data)
                row = cur.fetchone()
            conn.commit()

        logger.debug(f"Inserted 1 row into {table_name}")
        return row

    def write_many(self, table_name: str, rows: list[dict[str, Any]]) -> int:
        """Batch-insert multiple rows.

        All rows must have the same set of keys.

        Args:
            table_name: One of the predefined app table names.
            rows: List of column-name → value dicts.

        Returns:
            Number of rows inserted.
        """
        _validate_table_name(table_name)
        if not rows:
            return 0

        columns = list(rows[0].keys())
        placeholders = [f"%({c})s" for c in columns]

        sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({', '.join(placeholders)})"

        pool = self._ensure_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.executemany(sql, rows)
            conn.commit()

        count = len(rows)
        logger.debug(f"Inserted {count} rows into {table_name}")
        return count

    def upsert(
        self,
        table_name: str,
        data: dict[str, Any],
        conflict_columns: list[str],
    ) -> dict[str, Any]:
        """Insert a row or update it if a conflict is detected.

        Args:
            table_name: One of the predefined app table names.
            data: Column-name → value mapping.
            conflict_columns: Columns that form the unique/primary key
                              constraint for the ``ON CONFLICT`` clause.

        Returns:
            The upserted row as a dict.
        """
        _validate_table_name(table_name)
        if not data:
            raise ValueError("data must be a non-empty dict")
        if not conflict_columns:
            raise ValueError("conflict_columns must be a non-empty list")

        columns = list(data.keys())
        placeholders = [f"%({c})s" for c in columns]
        update_cols = [c for c in columns if c not in conflict_columns]
        update_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)

        sql = (
            f"INSERT INTO {table_name} ({', '.join(columns)}) "
            f"VALUES ({', '.join(placeholders)}) "
            f"ON CONFLICT ({', '.join(conflict_columns)}) "
            f"DO UPDATE SET {update_clause} "
            f"RETURNING *"
        )

        pool = self._ensure_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, data)
                row = cur.fetchone()
            conn.commit()

        logger.debug(f"Upserted 1 row into {table_name}")
        return row

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------
    def read(
        self,
        table_name: str,
        filters: dict[str, Any] | None = None,
        columns: list[str] | None = None,
        limit: int | None = None,
        order_by: str | None = None,
    ) -> list[dict[str, Any]]:
        """Read rows from a table with optional filtering.

        Args:
            table_name: One of the predefined app table names.
            filters: Optional column-name → value equality filters
                     (combined with AND).
            columns: Optional list of columns to select (default ``*``).
            limit: Optional maximum number of rows to return.
            order_by: Optional column name to order by (e.g. ``"created_at DESC"``).

        Returns:
            List of matching rows as dicts.
        """
        _validate_table_name(table_name)

        select_clause = ", ".join(columns) if columns else "*"
        sql = f"SELECT {select_clause} FROM {table_name}"
        params: dict[str, Any] = {}

        if filters:
            where_parts = []
            for col, val in filters.items():
                where_parts.append(f"{col} = %({col})s")
                params[col] = val
            sql += " WHERE " + " AND ".join(where_parts)

        if order_by:
            # Only allow simple column + direction patterns
            sql += f" ORDER BY {order_by}"

        if limit is not None:
            sql += f" LIMIT {int(limit)}"

        pool = self._ensure_pool()
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

        logger.debug(f"Read {len(rows)} rows from {table_name}")
        return rows

    # ------------------------------------------------------------------
    # Generic execute
    # ------------------------------------------------------------------
    def execute(self, sql: str, params: dict[str, Any] | tuple | None = None) -> list[dict[str, Any]]:
        """Execute arbitrary SQL and return rows (if any).

        Use for queries that don't fit the ``read``/``write`` helpers.

        Args:
            sql: The SQL statement (use ``%s`` or ``%(name)s`` placeholders).
            params: Parameters for the query.

        Returns:
            List of result rows as dicts, or an empty list for non-SELECT.
        """
        pool = self._ensure_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                if cur.description is not None:
                    rows = cur.fetchall()
                else:
                    rows = []
            conn.commit()
        return rows

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------
    def close(self) -> None:
        """Close the connection pool."""
        if self._pool is not None:
            self._pool.close()
            self._pool = None
            logger.info("PostgresManager: connection pool closed")
