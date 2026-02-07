"""Tests for PostgreSQL bootstrap paths in server.db_bootstrap.

These tests use mocking to avoid requiring an actual PostgreSQL database.
They cover the bootstrap logic, error handling, and recovery flows.
"""

from __future__ import annotations

from unittest.mock import MagicMock, call, patch

import pytest

from server.db_bootstrap import (
    BootstrapPlan,
    DatabaseBackend,
    _bootstrap_full,
    _bootstrap_full_postgres,
    _bootstrap_if_missing,
    _bootstrap_if_missing_postgres,
    _db_path_from_url,
    _detect_backend,
    _get_postgres_schema_name,
    _list_postgres_tables,
    _truthy,
    _widen_alembic_version_column,
    maybe_bootstrap_db_on_startup,
)


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------
class TestTruthy:
    """Tests for _truthy boolean parsing."""

    @pytest.mark.parametrize("val", ["1", "true", "True", "TRUE", "t", "T", "yes", "Yes", "y", "Y", "on", "ON"])
    def test_truthy_values(self, val):
        assert _truthy(val) is True

    @pytest.mark.parametrize("val", ["0", "false", "False", "no", "off", "", "random"])
    def test_falsy_values(self, val):
        assert _truthy(val) is False

    def test_none_is_falsy(self):
        assert _truthy(None) is False

    def test_whitespace_stripped(self):
        assert _truthy("  true  ") is True
        assert _truthy("  false  ") is False


class TestDbPathFromUrl:
    """Tests for SQLite path extraction from URLs."""

    def test_triple_slash_url(self):
        assert _db_path_from_url("sqlite:///./workshop.db") == "./workshop.db"

    def test_double_slash_url(self):
        # sqlite:/// strips the prefix, leaving the path as-is
        assert _db_path_from_url("sqlite:///tmp/db.sqlite") == "tmp/db.sqlite"

    def test_non_sqlite_url(self):
        url = "postgresql+psycopg://user:pass@host/db"
        assert _db_path_from_url(url) == url


class TestDetectBackend:
    """Tests for _detect_backend based on environment variables."""

    def test_sqlite_when_no_pg_vars(self, monkeypatch):
        monkeypatch.delenv("PGHOST", raising=False)
        monkeypatch.delenv("PGDATABASE", raising=False)
        monkeypatch.delenv("PGUSER", raising=False)
        assert _detect_backend() == DatabaseBackend.SQLITE

    def test_postgresql_when_all_pg_vars(self, monkeypatch):
        monkeypatch.setenv("PGHOST", "host")
        monkeypatch.setenv("PGDATABASE", "db")
        monkeypatch.setenv("PGUSER", "user")
        assert _detect_backend() == DatabaseBackend.POSTGRESQL

    def test_sqlite_when_partial_pg_vars(self, monkeypatch):
        monkeypatch.setenv("PGHOST", "host")
        monkeypatch.delenv("PGDATABASE", raising=False)
        monkeypatch.delenv("PGUSER", raising=False)
        assert _detect_backend() == DatabaseBackend.SQLITE


class TestGetPostgresSchemaName:
    """Tests for _get_postgres_schema_name derivation."""

    def test_default_schema_name(self, monkeypatch):
        monkeypatch.delenv("PGAPPNAME", raising=False)
        assert _get_postgres_schema_name() == "human_eval_workshop"

    def test_hyphens_replaced(self, monkeypatch):
        monkeypatch.setenv("PGAPPNAME", "my-custom-app")
        assert _get_postgres_schema_name() == "my_custom_app"

    def test_underscores_preserved(self, monkeypatch):
        monkeypatch.setenv("PGAPPNAME", "already_underscored")
        assert _get_postgres_schema_name() == "already_underscored"


# ---------------------------------------------------------------------------
# _widen_alembic_version_column
# ---------------------------------------------------------------------------
class TestWidenAlembicVersionColumn:
    """Tests for the alembic_version column widening utility."""

    def test_widen_executes_alter_statements(self, monkeypatch):
        monkeypatch.setenv("PGAPPNAME", "test_schema")

        mock_conn = MagicMock()
        mock_engine = MagicMock()
        mock_engine.connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = MagicMock(return_value=False)

        with patch("sqlalchemy.create_engine", return_value=mock_engine):
            _widen_alembic_version_column("postgresql://test")
            # Should execute ALTER for app schema and public schema
            assert mock_conn.execute.call_count == 2
            assert mock_conn.commit.called

    def test_widen_handles_exception_gracefully(self, monkeypatch):
        monkeypatch.setenv("PGAPPNAME", "test")

        with patch("sqlalchemy.create_engine", side_effect=Exception("Connection failed")):
            # Should not raise
            _widen_alembic_version_column("postgresql://test")


# ---------------------------------------------------------------------------
# _bootstrap_if_missing_postgres
# ---------------------------------------------------------------------------
def _make_plan(url: str = "postgresql://test") -> BootstrapPlan:
    return BootstrapPlan(
        database_url=url,
        db_path="",
        lock_path="/tmp/test.lock",
        backend=DatabaseBackend.POSTGRESQL,
    )


class TestBootstrapIfMissingPostgres:
    """Tests for _bootstrap_if_missing_postgres covering all code paths."""

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    def test_skips_when_tables_exist_with_alembic(self, mock_list, mock_widen):
        """If tables AND alembic_version exist, do nothing."""
        mock_list.return_value = ["workshops", "users", "alembic_version"]

        with patch("server.db_bootstrap._run_alembic_upgrade_head") as mock_upgrade:
            _bootstrap_if_missing_postgres(_make_plan())
            mock_upgrade.assert_not_called()

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_stamp_baseline")
    def test_stamps_head_when_tables_exist_without_alembic(self, mock_stamp, mock_list, mock_widen):
        """Tables exist but alembic_version is missing -> stamp to head."""
        mock_list.return_value = ["workshops", "users", "traces"]

        _bootstrap_if_missing_postgres(_make_plan())
        mock_stamp.assert_called_once_with("postgresql://test", revision="head")

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_stamp_baseline")
    def test_stamps_head_swallows_error(self, mock_stamp, mock_list, mock_widen):
        """If stamp to head fails, log warning but don't crash."""
        mock_list.return_value = ["workshops", "users"]
        mock_stamp.side_effect = Exception("stamp failed")

        # Should not raise
        _bootstrap_if_missing_postgres(_make_plan())

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_upgrade_head")
    def test_creates_tables_when_empty(self, mock_upgrade, mock_list, mock_widen):
        """No tables -> run alembic upgrade head."""
        mock_list.return_value = []

        _bootstrap_if_missing_postgres(_make_plan())
        mock_upgrade.assert_called_once_with("postgresql://test")

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_upgrade_head")
    @patch("server.db_bootstrap._run_alembic_stamp_baseline")
    def test_recovery_on_duplicate_table(self, mock_stamp, mock_upgrade, mock_list, mock_widen):
        """If upgrade fails with DuplicateTable, recover by stamping to head."""
        mock_list.return_value = []
        mock_upgrade.side_effect = Exception('relation "workshops" already exists (DuplicateTable)')

        _bootstrap_if_missing_postgres(_make_plan())
        mock_stamp.assert_called_once_with("postgresql://test", revision="head")

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_upgrade_head")
    @patch("server.db_bootstrap._run_alembic_stamp_baseline")
    def test_recovery_on_string_truncation(self, mock_stamp, mock_upgrade, mock_list, mock_widen):
        """If upgrade fails with StringDataRightTruncation, recover by stamping to head."""
        mock_list.return_value = []
        mock_upgrade.side_effect = Exception("StringDataRightTruncation: value too long")

        _bootstrap_if_missing_postgres(_make_plan())
        mock_stamp.assert_called_once_with("postgresql://test", revision="head")

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_upgrade_head")
    def test_raises_on_unexpected_error(self, mock_upgrade, mock_list, mock_widen):
        """Unexpected errors should propagate."""
        mock_list.return_value = []
        mock_upgrade.side_effect = RuntimeError("Connection refused")

        with pytest.raises(RuntimeError, match="Connection refused"):
            _bootstrap_if_missing_postgres(_make_plan())

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_upgrade_head")
    @patch("server.db_bootstrap._run_alembic_stamp_baseline")
    def test_recovery_stamp_failure_non_fatal(self, mock_stamp, mock_upgrade, mock_list, mock_widen):
        """If both upgrade and recovery stamp fail, don't crash."""
        mock_list.return_value = []
        mock_upgrade.side_effect = Exception("DuplicateTable")
        mock_stamp.side_effect = Exception("stamp also failed")

        # Should not raise
        _bootstrap_if_missing_postgres(_make_plan())

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    def test_always_widens_alembic_version(self, mock_list, mock_widen):
        """_widen_alembic_version_column is always called first."""
        mock_list.return_value = ["workshops", "alembic_version"]

        _bootstrap_if_missing_postgres(_make_plan())
        mock_widen.assert_called_once_with("postgresql://test")


# ---------------------------------------------------------------------------
# _bootstrap_full_postgres
# ---------------------------------------------------------------------------
class TestBootstrapFullPostgres:
    """Tests for _bootstrap_full_postgres covering all code paths."""

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_upgrade_head")
    def test_empty_db_runs_upgrade(self, mock_upgrade, mock_list, mock_widen):
        """Empty database -> run upgrade head."""
        mock_list.return_value = []

        _bootstrap_full_postgres(_make_plan())
        mock_upgrade.assert_called_once()

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_upgrade_head")
    @patch("server.db_bootstrap._run_alembic_stamp_baseline")
    def test_empty_db_recovery_on_duplicate(self, mock_stamp, mock_upgrade, mock_list, mock_widen):
        """Empty DB + DuplicateTable -> stamp to head."""
        mock_list.return_value = []
        mock_upgrade.side_effect = Exception("DuplicateTable")

        _bootstrap_full_postgres(_make_plan())
        mock_stamp.assert_called_once_with("postgresql://test", revision="head")

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_stamp_baseline")
    def test_tables_without_alembic_stamps_head(self, mock_stamp, mock_list, mock_widen):
        """Tables exist without alembic_version -> stamp to head."""
        mock_list.return_value = ["workshops", "users", "traces"]

        _bootstrap_full_postgres(_make_plan())
        mock_stamp.assert_called_once_with("postgresql://test", revision="head")

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_upgrade_head")
    def test_tables_with_alembic_runs_upgrade(self, mock_upgrade, mock_list, mock_widen):
        """Tables + alembic_version -> run pending migrations."""
        mock_list.return_value = ["workshops", "users", "alembic_version"]

        _bootstrap_full_postgres(_make_plan())
        mock_upgrade.assert_called_once()

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_upgrade_head")
    def test_empty_db_unexpected_error_raises(self, mock_upgrade, mock_list, mock_widen):
        """Unexpected errors propagate from upgrade."""
        mock_list.return_value = []
        mock_upgrade.side_effect = RuntimeError("Unexpected")

        with pytest.raises(RuntimeError, match="Unexpected"):
            _bootstrap_full_postgres(_make_plan())

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    @patch("server.db_bootstrap._run_alembic_upgrade_head")
    @patch("server.db_bootstrap._run_alembic_stamp_baseline")
    def test_string_truncation_recovery(self, mock_stamp, mock_upgrade, mock_list, mock_widen):
        """StringDataRightTruncation in full bootstrap triggers stamp to head."""
        mock_list.return_value = []
        mock_upgrade.side_effect = Exception("stringdataright truncation error")

        _bootstrap_full_postgres(_make_plan())
        mock_stamp.assert_called_once_with("postgresql://test", revision="head")

    @patch("server.db_bootstrap._widen_alembic_version_column")
    @patch("server.db_bootstrap._list_postgres_tables")
    def test_always_widens_column(self, mock_list, mock_widen):
        """_widen_alembic_version_column always called."""
        mock_list.return_value = ["workshops", "alembic_version"]

        with patch("server.db_bootstrap._run_alembic_upgrade_head"):
            _bootstrap_full_postgres(_make_plan())
        mock_widen.assert_called_once()


# ---------------------------------------------------------------------------
# _list_postgres_tables
# ---------------------------------------------------------------------------
class TestListPostgresTables:
    """Tests for _list_postgres_tables."""

    def test_returns_table_list(self, monkeypatch):
        monkeypatch.setenv("PGAPPNAME", "test_app")

        mock_result = MagicMock()
        mock_result.fetchall.return_value = [("workshops",), ("users",), ("alembic_version",)]
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_result
        mock_engine = MagicMock()
        mock_engine.connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = MagicMock(return_value=False)

        with patch("sqlalchemy.create_engine", return_value=mock_engine):
            tables = _list_postgres_tables("postgresql://test")
            assert "workshops" in tables
            assert "users" in tables
            assert "alembic_version" in tables

    def test_returns_empty_on_exception(self, monkeypatch):
        monkeypatch.setenv("PGAPPNAME", "test_app")

        with patch("sqlalchemy.create_engine", side_effect=Exception("Connection refused")):
            tables = _list_postgres_tables("postgresql://test")
            assert tables == []


# ---------------------------------------------------------------------------
# _bootstrap_if_missing / _bootstrap_full dispatchers
# ---------------------------------------------------------------------------
class TestBootstrapDispatch:
    """Tests for the _bootstrap_if_missing and _bootstrap_full dispatchers."""

    @patch("server.db_bootstrap._bootstrap_if_missing_postgres")
    def test_if_missing_dispatches_to_postgres(self, mock_pg):
        plan = _make_plan()
        _bootstrap_if_missing(plan)
        mock_pg.assert_called_once_with(plan)

    @patch("server.db_bootstrap._bootstrap_if_missing_sqlite")
    def test_if_missing_dispatches_to_sqlite(self, mock_sqlite):
        plan = BootstrapPlan(
            database_url="sqlite:///./test.db",
            db_path="/tmp/test.db",
            lock_path="/tmp/test.lock",
            backend=DatabaseBackend.SQLITE,
        )
        _bootstrap_if_missing(plan)
        mock_sqlite.assert_called_once_with(plan)

    @patch("server.db_bootstrap._bootstrap_full_postgres")
    def test_full_dispatches_to_postgres(self, mock_pg):
        plan = _make_plan()
        _bootstrap_full(plan)
        mock_pg.assert_called_once_with(plan)

    @patch("server.db_bootstrap._bootstrap_full_sqlite")
    def test_full_dispatches_to_sqlite(self, mock_sqlite):
        plan = BootstrapPlan(
            database_url="sqlite:///./test.db",
            db_path="/tmp/test.db",
            lock_path="/tmp/test.lock",
            backend=DatabaseBackend.SQLITE,
        )
        _bootstrap_full(plan)
        mock_sqlite.assert_called_once_with(plan)


# ---------------------------------------------------------------------------
# maybe_bootstrap_db_on_startup
# ---------------------------------------------------------------------------
class TestMaybeBootstrapDbOnStartup:
    """Tests for the startup entrypoint."""

    @patch("server.db_bootstrap._bootstrap_plan")
    @patch("server.db_bootstrap._interprocess_lock")
    @patch("server.db_bootstrap._bootstrap_if_missing")
    def test_default_mode_runs_if_missing(self, mock_if_missing, mock_lock, mock_plan, monkeypatch):
        monkeypatch.delenv("DB_BOOTSTRAP_ON_STARTUP", raising=False)
        mock_plan.return_value = _make_plan()
        mock_lock.return_value.__enter__ = MagicMock()
        mock_lock.return_value.__exit__ = MagicMock(return_value=False)

        maybe_bootstrap_db_on_startup()
        mock_if_missing.assert_called_once()

    @patch("server.db_bootstrap._bootstrap_plan")
    @patch("server.db_bootstrap._interprocess_lock")
    @patch("server.db_bootstrap._bootstrap_full")
    def test_full_mode_runs_full(self, mock_full, mock_lock, mock_plan, monkeypatch):
        monkeypatch.setenv("DB_BOOTSTRAP_ON_STARTUP", "true")
        mock_plan.return_value = _make_plan()
        mock_lock.return_value.__enter__ = MagicMock()
        mock_lock.return_value.__exit__ = MagicMock(return_value=False)

        maybe_bootstrap_db_on_startup()
        mock_full.assert_called_once()

    def test_disabled_mode_skips(self, monkeypatch):
        monkeypatch.setenv("DB_BOOTSTRAP_ON_STARTUP", "false")

        with patch("server.db_bootstrap._bootstrap_plan") as mock_plan:
            maybe_bootstrap_db_on_startup()
            mock_plan.assert_not_called()

    @patch("server.db_bootstrap._bootstrap_plan")
    @patch("server.db_bootstrap._interprocess_lock")
    @patch("server.db_bootstrap._bootstrap_if_missing")
    def test_handles_alembic_not_installed(self, mock_if_missing, mock_lock, mock_plan, monkeypatch):
        monkeypatch.delenv("DB_BOOTSTRAP_ON_STARTUP", raising=False)
        mock_plan.return_value = _make_plan()
        mock_lock.return_value.__enter__ = MagicMock()
        mock_lock.return_value.__exit__ = MagicMock(return_value=False)

        err = ModuleNotFoundError("No module named 'alembic'")
        err.name = "alembic"
        mock_if_missing.side_effect = err

        # Should not raise
        maybe_bootstrap_db_on_startup()

    @patch("server.db_bootstrap._bootstrap_plan")
    @patch("server.db_bootstrap._interprocess_lock")
    @patch("server.db_bootstrap._bootstrap_if_missing")
    def test_handles_general_exception(self, mock_if_missing, mock_lock, mock_plan, monkeypatch):
        monkeypatch.delenv("DB_BOOTSTRAP_ON_STARTUP", raising=False)
        mock_plan.return_value = _make_plan()
        mock_lock.return_value.__enter__ = MagicMock()
        mock_lock.return_value.__exit__ = MagicMock(return_value=False)
        mock_if_missing.side_effect = RuntimeError("Something went wrong")

        # Should not raise (catches and prints error)
        maybe_bootstrap_db_on_startup()
