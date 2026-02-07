"""Tests for server.postgres_manager — direct psycopg interface for Lakebase.

Uses mocking to avoid requiring psycopg_pool or an actual PostgreSQL database.
Tests validate SQL generation, table validation, and error handling.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from server.postgres_manager import ALLOWED_TABLES, _validate_table_name


# ---------------------------------------------------------------------------
# _validate_table_name
# ---------------------------------------------------------------------------
class TestValidateTableName:
    """Tests for the table name whitelist validation."""

    def test_valid_table_names(self):
        for table in ALLOWED_TABLES:
            # Should not raise
            _validate_table_name(table)

    def test_invalid_table_raises(self):
        with pytest.raises(ValueError, match="not a recognised app table"):
            _validate_table_name("nonexistent_table")

    def test_sql_injection_attempt_rejected(self):
        with pytest.raises(ValueError):
            _validate_table_name("users; DROP TABLE users;--")

    def test_empty_string_rejected(self):
        with pytest.raises(ValueError):
            _validate_table_name("")


class TestAllowedTables:
    """Tests for the ALLOWED_TABLES constant."""

    def test_contains_core_tables(self):
        core_tables = {
            "workshops",
            "users",
            "traces",
            "annotations",
            "rubrics",
            "discovery_findings",
            "judge_prompts",
            "judge_evaluations",
        }
        assert core_tables.issubset(ALLOWED_TABLES)

    def test_contains_config_tables(self):
        config_tables = {
            "facilitator_configs",
            "mlflow_intake_config",
            "databricks_tokens",
            "custom_llm_provider_config",
        }
        assert config_tables.issubset(ALLOWED_TABLES)

    def test_contains_ordering_tables(self):
        ordering_tables = {
            "user_trace_orders",
            "user_discovery_completions",
            "workshop_participants",
        }
        assert ordering_tables.issubset(ALLOWED_TABLES)


# ---------------------------------------------------------------------------
# PostgresManager construction
# ---------------------------------------------------------------------------
class TestPostgresManagerInit:
    """Tests for PostgresManager initialization and singleton pattern."""

    @patch("server.postgres_manager.PostgresManager.__init__", return_value=None)
    def test_get_instance_creates_singleton(self, mock_init):
        from server.postgres_manager import PostgresManager

        # Reset singleton for test
        PostgresManager._instance = None

        instance = PostgresManager.get_instance()
        assert instance is not None
        # Second call returns same instance
        instance2 = PostgresManager.get_instance()
        assert instance is instance2

        # Clean up
        PostgresManager._instance = None

    def test_init_raises_without_lakebase_env(self, monkeypatch):
        from server.postgres_manager import PostgresManager

        PostgresManager._instance = None
        monkeypatch.delenv("PGHOST", raising=False)
        monkeypatch.delenv("PGDATABASE", raising=False)
        monkeypatch.delenv("PGUSER", raising=False)

        with pytest.raises(RuntimeError, match="Lakebase environment variables"):
            PostgresManager()

        PostgresManager._instance = None


# ---------------------------------------------------------------------------
# PostgresManager._build_conn_string
# ---------------------------------------------------------------------------
class TestBuildConnString:
    """Tests for connection string construction."""

    def test_conn_string_format(self, monkeypatch):
        from server.postgres_manager import PostgresManager

        PostgresManager._instance = None
        monkeypatch.setenv("PGHOST", "db.example.com")
        monkeypatch.setenv("PGDATABASE", "testdb")
        monkeypatch.setenv("PGUSER", "svc-user")
        monkeypatch.setenv("PGPORT", "5432")
        monkeypatch.setenv("PGSSLMODE", "require")
        monkeypatch.setenv("PGAPPNAME", "test-app")

        with patch("server.db_config.get_token_manager") as mock_tm:
            mock_tm_inst = MagicMock()
            mock_tm_inst.get_token.return_value = "test_token"
            mock_tm.return_value = mock_tm_inst

            mgr = PostgresManager()
            conn_str = mgr._build_conn_string()

            assert "dbname=testdb" in conn_str
            assert "user=svc-user" in conn_str
            assert "password=test_token" in conn_str
            assert "host=db.example.com" in conn_str
            assert "port=5432" in conn_str
            assert "sslmode=require" in conn_str
            assert "search_path=test_app" in conn_str

            # Clean up
            PostgresManager._instance = None


# ---------------------------------------------------------------------------
# PostgresManager.write / write_many / upsert / read
# ---------------------------------------------------------------------------
class TestPostgresManagerOperations:
    """Tests for CRUD operations — validates SQL and parameter construction."""

    @pytest.fixture(autouse=True)
    def _cleanup_singleton(self):
        from server.postgres_manager import PostgresManager
        PostgresManager._instance = None
        yield
        PostgresManager._instance = None

    def _make_manager(self, monkeypatch):
        """Create a PostgresManager with mocked dependencies."""
        from server.postgres_manager import PostgresManager

        monkeypatch.setenv("PGHOST", "db.example.com")
        monkeypatch.setenv("PGDATABASE", "testdb")
        monkeypatch.setenv("PGUSER", "svc-user")
        monkeypatch.setenv("PGAPPNAME", "test-app")

        with patch("server.db_config.get_token_manager") as mock_tm:
            mock_tm_inst = MagicMock()
            mock_tm_inst.get_token.return_value = "tok"
            mock_tm_inst.needs_refresh = False
            mock_tm.return_value = mock_tm_inst

            mgr = PostgresManager()
            # Mock the pool
            mock_pool = MagicMock()
            mgr._pool = mock_pool
            mgr._token_manager = mock_tm_inst
            return mgr

    def test_write_validates_table(self, monkeypatch):
        mgr = self._make_manager(monkeypatch)
        with pytest.raises(ValueError, match="not a recognised"):
            mgr.write("invalid_table", {"id": "1"})

    def test_write_rejects_empty_data(self, monkeypatch):
        mgr = self._make_manager(monkeypatch)
        with pytest.raises(ValueError, match="non-empty dict"):
            mgr.write("users", {})

    def test_write_executes_insert_returning(self, monkeypatch):
        """write() should construct INSERT ... RETURNING * SQL."""
        mgr = self._make_manager(monkeypatch)
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = {"id": "u1", "email": "a@b.com"}
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mgr._pool.connection.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mgr._pool.connection.return_value.__exit__ = MagicMock(return_value=False)

        result = mgr.write("users", {"id": "u1", "email": "a@b.com"})
        assert result == {"id": "u1", "email": "a@b.com"}

        # Verify SQL structure
        sql_arg = mock_cursor.execute.call_args[0][0]
        assert "INSERT INTO users" in sql_arg
        assert "RETURNING *" in sql_arg

    def test_write_many_returns_zero_for_empty(self, monkeypatch):
        mgr = self._make_manager(monkeypatch)
        assert mgr.write_many("users", []) == 0

    def test_write_many_validates_table(self, monkeypatch):
        mgr = self._make_manager(monkeypatch)
        with pytest.raises(ValueError, match="not a recognised"):
            mgr.write_many("bad_table", [{"id": "1"}])

    def test_write_many_executes_batch(self, monkeypatch):
        """write_many() should use executemany for batch insert."""
        mgr = self._make_manager(monkeypatch)
        mock_cursor = MagicMock()
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mgr._pool.connection.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mgr._pool.connection.return_value.__exit__ = MagicMock(return_value=False)

        rows = [
            {"id": "u1", "email": "a@b.com"},
            {"id": "u2", "email": "c@d.com"},
        ]
        count = mgr.write_many("users", rows)
        assert count == 2
        mock_cursor.executemany.assert_called_once()

    def test_upsert_validates_table(self, monkeypatch):
        mgr = self._make_manager(monkeypatch)
        with pytest.raises(ValueError, match="not a recognised"):
            mgr.upsert("bad_table", {"id": "1"}, ["id"])

    def test_upsert_rejects_empty_data(self, monkeypatch):
        mgr = self._make_manager(monkeypatch)
        with pytest.raises(ValueError, match="non-empty dict"):
            mgr.upsert("users", {}, ["id"])

    def test_upsert_rejects_empty_conflict_columns(self, monkeypatch):
        mgr = self._make_manager(monkeypatch)
        with pytest.raises(ValueError, match="non-empty list"):
            mgr.upsert("users", {"id": "1"}, [])

    def test_upsert_generates_on_conflict_sql(self, monkeypatch):
        """upsert() should build INSERT ... ON CONFLICT ... DO UPDATE SET."""
        mgr = self._make_manager(monkeypatch)
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = {"id": "u1", "email": "new@b.com"}
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mgr._pool.connection.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mgr._pool.connection.return_value.__exit__ = MagicMock(return_value=False)

        result = mgr.upsert(
            "users",
            {"id": "u1", "email": "new@b.com", "name": "Alice"},
            ["id"],
        )
        assert result == {"id": "u1", "email": "new@b.com"}

        sql_arg = mock_cursor.execute.call_args[0][0]
        assert "ON CONFLICT (id)" in sql_arg
        assert "DO UPDATE SET" in sql_arg
        assert "email = EXCLUDED.email" in sql_arg
        assert "name = EXCLUDED.name" in sql_arg
        assert "RETURNING *" in sql_arg

    def test_read_validates_table(self, monkeypatch):
        mgr = self._make_manager(monkeypatch)
        with pytest.raises(ValueError, match="not a recognised"):
            mgr.read("bad_table")

    def test_read_basic_select(self, monkeypatch):
        """read() with no filters should produce SELECT * FROM table."""
        mgr = self._make_manager(monkeypatch)
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [{"id": "u1"}, {"id": "u2"}]
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mgr._pool.connection.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mgr._pool.connection.return_value.__exit__ = MagicMock(return_value=False)

        rows = mgr.read("users")
        assert len(rows) == 2

        sql_arg = mock_cursor.execute.call_args[0][0]
        assert "SELECT * FROM users" in sql_arg

    def test_read_with_filters(self, monkeypatch):
        """read() with filters should add WHERE clause."""
        mgr = self._make_manager(monkeypatch)
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [{"id": "u1"}]
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mgr._pool.connection.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mgr._pool.connection.return_value.__exit__ = MagicMock(return_value=False)

        rows = mgr.read("users", filters={"workshop_id": "w1"})
        assert len(rows) == 1

        sql_arg = mock_cursor.execute.call_args[0][0]
        assert "WHERE" in sql_arg
        assert "workshop_id" in sql_arg

    def test_read_with_columns_limit_order(self, monkeypatch):
        """read() with columns, limit, order_by should build correct SQL."""
        mgr = self._make_manager(monkeypatch)
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mgr._pool.connection.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mgr._pool.connection.return_value.__exit__ = MagicMock(return_value=False)

        mgr.read(
            "users",
            columns=["id", "email"],
            limit=10,
            order_by="created_at DESC",
        )

        sql_arg = mock_cursor.execute.call_args[0][0]
        assert "SELECT id, email FROM users" in sql_arg
        assert "ORDER BY created_at DESC" in sql_arg
        assert "LIMIT 10" in sql_arg

    def test_execute_returns_rows_for_select(self, monkeypatch):
        """execute() should return rows when cursor has description."""
        mgr = self._make_manager(monkeypatch)
        mock_cursor = MagicMock()
        mock_cursor.description = [("id",)]  # non-None indicates SELECT result
        mock_cursor.fetchall.return_value = [{"id": "u1"}]
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mgr._pool.connection.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mgr._pool.connection.return_value.__exit__ = MagicMock(return_value=False)

        rows = mgr.execute("SELECT * FROM users")
        assert rows == [{"id": "u1"}]

    def test_execute_returns_empty_for_non_select(self, monkeypatch):
        """execute() should return [] for non-SELECT statements."""
        mgr = self._make_manager(monkeypatch)
        mock_cursor = MagicMock()
        mock_cursor.description = None  # Non-SELECT
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mgr._pool.connection.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mgr._pool.connection.return_value.__exit__ = MagicMock(return_value=False)

        rows = mgr.execute("DELETE FROM users WHERE id = 'u1'")
        assert rows == []

    def test_close_sets_pool_to_none(self, monkeypatch):
        mgr = self._make_manager(monkeypatch)
        mgr.close()
        assert mgr._pool is None

    def test_close_when_no_pool(self, monkeypatch):
        mgr = self._make_manager(monkeypatch)
        mgr._pool = None
        # Should not raise
        mgr.close()


# ---------------------------------------------------------------------------
# PostgresManager._ensure_pool
# ---------------------------------------------------------------------------
class TestCreateTables:
    """Tests for PostgresManager.create_tables."""

    @pytest.fixture(autouse=True)
    def _cleanup_singleton(self):
        from server.postgres_manager import PostgresManager
        PostgresManager._instance = None
        yield
        PostgresManager._instance = None

    def _make_manager(self, monkeypatch):
        from server.postgres_manager import PostgresManager

        monkeypatch.setenv("PGHOST", "db.example.com")
        monkeypatch.setenv("PGDATABASE", "testdb")
        monkeypatch.setenv("PGUSER", "svc-user")
        monkeypatch.setenv("PGAPPNAME", "test-app")

        with patch("server.db_config.get_token_manager") as mock_tm:
            mock_tm_inst = MagicMock()
            mock_tm_inst.get_token.return_value = "tok"
            mock_tm_inst.needs_refresh = False
            mock_tm.return_value = mock_tm_inst

            mgr = PostgresManager()
            mgr._token_manager = mock_tm_inst
            return mgr

    def test_create_tables_executes_ddl(self, monkeypatch):
        """create_tables should execute schema creation and all DDL statements."""
        from server.postgres_manager import _TABLE_DDL

        mgr = self._make_manager(monkeypatch)
        mock_conn = MagicMock()
        mock_pool = MagicMock()
        mock_pool.connection.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_pool.connection.return_value.__exit__ = MagicMock(return_value=False)
        mgr._pool = mock_pool

        mgr.create_tables()

        # Should execute: CREATE SCHEMA, GRANT, SET search_path, commit,
        # then each DDL, commit, then GRANT ALL x2, commit
        assert mock_conn.execute.call_count >= len(_TABLE_DDL) + 3

    def test_create_tables_handles_grant_error(self, monkeypatch):
        """create_tables should handle grant privilege errors gracefully."""
        from server.postgres_manager import _TABLE_DDL

        mgr = self._make_manager(monkeypatch)
        mock_conn = MagicMock()
        # Make the second batch of grants fail
        call_count = [0]
        original_execute = mock_conn.execute

        def side_effect_execute(*args, **kwargs):
            call_count[0] += 1
            # Fail on the last few execute calls (privilege grants)
            if call_count[0] > len(_TABLE_DDL) + 4:
                raise Exception("InsufficientPrivilege")
            return original_execute(*args, **kwargs)

        mock_conn.execute = MagicMock(side_effect=side_effect_execute)
        mock_pool = MagicMock()
        mock_pool.connection.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_pool.connection.return_value.__exit__ = MagicMock(return_value=False)
        mgr._pool = mock_pool

        # Should not raise
        mgr.create_tables()


class TestEnsurePool:
    """Tests for connection pool lifecycle."""

    def test_ensure_pool_creates_when_none(self, monkeypatch):
        from server.postgres_manager import PostgresManager

        PostgresManager._instance = None
        monkeypatch.setenv("PGHOST", "db.example.com")
        monkeypatch.setenv("PGDATABASE", "testdb")
        monkeypatch.setenv("PGUSER", "svc-user")
        monkeypatch.setenv("PGAPPNAME", "test-app")

        with patch("server.db_config.get_token_manager") as mock_tm:
            mock_tm_inst = MagicMock()
            mock_tm_inst.get_token.return_value = "tok"
            mock_tm_inst.needs_refresh = True
            mock_tm.return_value = mock_tm_inst

            mgr = PostgresManager()
            mgr._pool = None

            with patch("psycopg_pool.ConnectionPool") as mock_pool_cls:
                mock_pool_cls.return_value = MagicMock()
                pool = mgr._ensure_pool()
                assert pool is not None
                mock_pool_cls.assert_called_once()

            PostgresManager._instance = None

    def test_ensure_pool_recreates_on_token_refresh(self, monkeypatch):
        from server.postgres_manager import PostgresManager

        PostgresManager._instance = None
        monkeypatch.setenv("PGHOST", "db.example.com")
        monkeypatch.setenv("PGDATABASE", "testdb")
        monkeypatch.setenv("PGUSER", "svc-user")
        monkeypatch.setenv("PGAPPNAME", "test-app")

        with patch("server.db_config.get_token_manager") as mock_tm:
            mock_tm_inst = MagicMock()
            mock_tm_inst.get_token.return_value = "tok"
            mock_tm_inst.needs_refresh = True
            mock_tm.return_value = mock_tm_inst

            mgr = PostgresManager()
            old_pool = MagicMock()
            mgr._pool = old_pool

            with patch("psycopg_pool.ConnectionPool") as mock_pool_cls:
                mock_pool_cls.return_value = MagicMock()
                pool = mgr._ensure_pool()
                # Old pool should be closed
                old_pool.close.assert_called_once()
                # New pool should be created
                mock_pool_cls.assert_called_once()

            PostgresManager._instance = None
