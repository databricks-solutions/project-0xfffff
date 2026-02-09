"""Tests for server.db_config — Lakebase/PostgreSQL configuration and token management."""

from __future__ import annotations

import os
import time
from unittest.mock import MagicMock, patch

import pytest

from server.db_config import (
    DatabaseBackend,
    LakebaseConfig,
    OAuthTokenManager,
    create_engine_for_backend,
    detect_database_backend,
    get_database_url,
    get_schema_name,
    get_token_manager,
)


# ---------------------------------------------------------------------------
# LakebaseConfig
# ---------------------------------------------------------------------------
class TestLakebaseConfig:
    """Tests for LakebaseConfig dataclass and from_env class method."""

    def test_from_env_returns_none_when_no_vars(self, monkeypatch):
        monkeypatch.delenv("PGHOST", raising=False)
        monkeypatch.delenv("PGDATABASE", raising=False)
        monkeypatch.delenv("PGUSER", raising=False)
        assert LakebaseConfig.from_env() is None

    def test_from_env_returns_none_when_partial_vars(self, monkeypatch):
        monkeypatch.setenv("PGHOST", "myhost")
        monkeypatch.delenv("PGDATABASE", raising=False)
        monkeypatch.delenv("PGUSER", raising=False)
        assert LakebaseConfig.from_env() is None

    def test_from_env_with_required_vars(self, monkeypatch):
        monkeypatch.setenv("PGHOST", "db.example.com")
        monkeypatch.setenv("PGDATABASE", "mydb")
        monkeypatch.setenv("PGUSER", "myuser")
        monkeypatch.delenv("PGPORT", raising=False)
        monkeypatch.delenv("PGSSLMODE", raising=False)
        monkeypatch.delenv("PGAPPNAME", raising=False)

        config = LakebaseConfig.from_env()
        assert config is not None
        assert config.host == "db.example.com"
        assert config.database == "mydb"
        assert config.user == "myuser"
        assert config.port == 5432  # default
        assert config.sslmode == "require"  # default
        assert config.app_name == "human-eval-workshop"  # default

    def test_from_env_with_all_vars(self, monkeypatch):
        monkeypatch.setenv("PGHOST", "db.example.com")
        monkeypatch.setenv("PGDATABASE", "mydb")
        monkeypatch.setenv("PGUSER", "svc-principal")
        monkeypatch.setenv("PGPORT", "5433")
        monkeypatch.setenv("PGSSLMODE", "verify-full")
        monkeypatch.setenv("PGAPPNAME", "my-custom-app")

        config = LakebaseConfig.from_env()
        assert config is not None
        assert config.port == 5433
        assert config.sslmode == "verify-full"
        assert config.app_name == "my-custom-app"

    def test_from_env_returns_none_when_host_empty(self, monkeypatch):
        monkeypatch.setenv("PGHOST", "")
        monkeypatch.setenv("PGDATABASE", "mydb")
        monkeypatch.setenv("PGUSER", "myuser")
        # Empty string is falsy, so from_env should return None
        assert LakebaseConfig.from_env() is None


# ---------------------------------------------------------------------------
# OAuthTokenManager
# ---------------------------------------------------------------------------
class TestOAuthTokenManager:
    """Tests for OAuth token lifecycle management."""

    def test_initial_state(self):
        mgr = OAuthTokenManager(refresh_interval_seconds=60)
        assert mgr._token is None
        assert mgr.needs_refresh is True

    def test_get_token_calls_workspace_client(self):
        mgr = OAuthTokenManager(refresh_interval_seconds=60)
        mock_client = MagicMock()
        mock_client.config.oauth_token.return_value = MagicMock(access_token="tok123")
        mgr._workspace_client = mock_client

        token = mgr.get_token()
        assert token == "tok123"
        assert mgr.needs_refresh is False
        mock_client.config.oauth_token.assert_called_once()

    def test_get_token_uses_cache(self):
        mgr = OAuthTokenManager(refresh_interval_seconds=3600)
        mock_client = MagicMock()
        mock_client.config.oauth_token.return_value = MagicMock(access_token="tok123")
        mgr._workspace_client = mock_client

        # First call: fetches token
        token1 = mgr.get_token()
        # Second call: should use cache
        token2 = mgr.get_token()

        assert token1 == token2 == "tok123"
        # Only called once because second call uses cache
        assert mock_client.config.oauth_token.call_count == 1

    def test_get_token_refreshes_after_interval(self):
        mgr = OAuthTokenManager(refresh_interval_seconds=1)
        mock_client = MagicMock()
        mock_client.config.oauth_token.return_value = MagicMock(access_token="tok_v1")
        mgr._workspace_client = mock_client

        # First call
        mgr.get_token()
        assert mock_client.config.oauth_token.call_count == 1

        # Simulate time passing
        mgr._last_refresh = time.time() - 2
        mock_client.config.oauth_token.return_value = MagicMock(access_token="tok_v2")

        token = mgr.get_token()
        assert token == "tok_v2"
        assert mock_client.config.oauth_token.call_count == 2

    def test_get_token_raises_on_first_failure(self):
        mgr = OAuthTokenManager(refresh_interval_seconds=60)
        mock_client = MagicMock()
        mock_client.config.oauth_token.side_effect = Exception("Auth failed")
        mgr._workspace_client = mock_client

        with pytest.raises(RuntimeError, match="Cannot obtain OAuth token"):
            mgr.get_token()

    def test_get_token_uses_stale_on_refresh_failure(self):
        mgr = OAuthTokenManager(refresh_interval_seconds=1)
        mock_client = MagicMock()
        mock_client.config.oauth_token.return_value = MagicMock(access_token="stale_tok")
        mgr._workspace_client = mock_client

        # First call succeeds
        token = mgr.get_token()
        assert token == "stale_tok"

        # Simulate expiry and failure on refresh
        mgr._last_refresh = time.time() - 2
        mock_client.config.oauth_token.side_effect = Exception("Network error")

        # Should return stale token instead of raising
        token = mgr.get_token()
        assert token == "stale_tok"

    def test_needs_refresh_true_when_no_token(self):
        mgr = OAuthTokenManager(refresh_interval_seconds=60)
        assert mgr.needs_refresh is True

    def test_needs_refresh_false_within_interval(self):
        mgr = OAuthTokenManager(refresh_interval_seconds=3600)
        mgr._token = "some_token"
        mgr._last_refresh = time.time()
        assert mgr.needs_refresh is False

    def test_needs_refresh_true_after_interval(self):
        mgr = OAuthTokenManager(refresh_interval_seconds=60)
        mgr._token = "some_token"
        mgr._last_refresh = time.time() - 120
        assert mgr.needs_refresh is True


# ---------------------------------------------------------------------------
# detect_database_backend
# ---------------------------------------------------------------------------
class TestDetectDatabaseBackend:
    """Tests for DATABASE_ENV-based backend detection."""

    def test_returns_sqlite_when_database_env_unset(self, monkeypatch):
        monkeypatch.delenv("DATABASE_ENV", raising=False)
        assert detect_database_backend() == DatabaseBackend.SQLITE

    def test_returns_sqlite_when_database_env_is_sqlite(self, monkeypatch):
        monkeypatch.setenv("DATABASE_ENV", "sqlite")
        assert detect_database_backend() == DatabaseBackend.SQLITE

    def test_returns_postgresql_when_database_env_is_postgres(self, monkeypatch):
        monkeypatch.setenv("DATABASE_ENV", "postgres")
        # PG vars not required for detection, only for engine creation
        monkeypatch.delenv("PGHOST", raising=False)
        assert detect_database_backend() == DatabaseBackend.POSTGRESQL

    def test_returns_postgresql_case_insensitive(self, monkeypatch):
        monkeypatch.setenv("DATABASE_ENV", "Postgres")
        assert detect_database_backend() == DatabaseBackend.POSTGRESQL


# ---------------------------------------------------------------------------
# get_database_url
# ---------------------------------------------------------------------------
class TestGetDatabaseUrl:
    """Tests for database URL construction."""

    def test_sqlite_default_url(self, monkeypatch):
        monkeypatch.delenv("DATABASE_ENV", raising=False)
        monkeypatch.delenv("DATABASE_URL", raising=False)

        url = get_database_url()
        assert url == "sqlite:///./workshop.db"

    def test_sqlite_custom_url(self, monkeypatch):
        monkeypatch.delenv("DATABASE_ENV", raising=False)
        monkeypatch.setenv("DATABASE_URL", "sqlite:///./custom.db")

        url = get_database_url()
        assert url == "sqlite:///./custom.db"

    def test_postgresql_url_construction(self, monkeypatch):
        monkeypatch.setenv("DATABASE_ENV", "postgres")
        monkeypatch.setenv("PGHOST", "db.example.com")
        monkeypatch.setenv("PGDATABASE", "mydb")
        monkeypatch.setenv("PGUSER", "svc-user")
        monkeypatch.setenv("PGPORT", "5432")
        monkeypatch.setenv("PGSSLMODE", "require")
        monkeypatch.setenv("PGAPPNAME", "test-app")

        # Mock the token manager
        with patch("server.db_config.get_token_manager") as mock_get_tm:
            mock_tm = MagicMock()
            mock_tm.get_token.return_value = "test_token_123"
            mock_get_tm.return_value = mock_tm

            url = get_database_url()
            assert "postgresql+psycopg://" in url
            assert "svc-user:test_token_123@" in url
            assert "db.example.com:5432/mydb" in url
            assert "sslmode=require" in url
            assert "application_name=test-app" in url


# ---------------------------------------------------------------------------
# get_schema_name
# ---------------------------------------------------------------------------
class TestGetSchemaName:
    """Tests for schema name derivation."""

    def test_returns_none_for_sqlite(self, monkeypatch):
        monkeypatch.delenv("DATABASE_ENV", raising=False)
        assert get_schema_name() is None

    def test_returns_schema_for_postgresql(self, monkeypatch):
        monkeypatch.setenv("DATABASE_ENV", "postgres")
        monkeypatch.setenv("PGAPPNAME", "my-app")
        monkeypatch.setenv("PGUSER", "svc-user")

        schema = get_schema_name()
        assert schema is not None
        assert "-" not in schema  # hyphens replaced with underscores

    def test_schema_name_replaces_hyphens(self, monkeypatch):
        monkeypatch.setenv("DATABASE_ENV", "postgres")
        monkeypatch.setenv("PGUSER", "svc-principal-123")
        monkeypatch.setenv("PGAPPNAME", "human-eval-workshop")

        schema = get_schema_name()
        assert "-" not in schema


# ---------------------------------------------------------------------------
# get_token_manager (singleton)
# ---------------------------------------------------------------------------
class TestGetTokenManager:
    """Tests for the global token manager singleton."""

    def test_returns_same_instance(self):
        import server.db_config as mod

        # Reset global state
        mod._token_manager = None
        mgr1 = get_token_manager()
        mgr2 = get_token_manager()
        assert mgr1 is mgr2
        # Clean up
        mod._token_manager = None

    def test_returns_oauth_token_manager(self):
        import server.db_config as mod

        mod._token_manager = None
        mgr = get_token_manager()
        assert isinstance(mgr, OAuthTokenManager)
        mod._token_manager = None


# ---------------------------------------------------------------------------
# create_engine_for_backend
# ---------------------------------------------------------------------------
class TestCreateEngineForBackend:
    """Tests for SQLAlchemy engine creation."""

    def test_sqlite_engine_creation(self, monkeypatch, tmp_path):
        monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/test.db")
        engine = create_engine_for_backend(DatabaseBackend.SQLITE)
        assert engine is not None
        assert "sqlite" in str(engine.url)
        engine.dispose()

    def test_postgresql_engine_raises_without_config(self, monkeypatch):
        monkeypatch.delenv("PGHOST", raising=False)
        monkeypatch.delenv("PGDATABASE", raising=False)
        monkeypatch.delenv("PGUSER", raising=False)

        with pytest.raises(RuntimeError, match="Lakebase config not available"):
            create_engine_for_backend(DatabaseBackend.POSTGRESQL)

    def test_postgresql_engine_creation(self, monkeypatch):
        monkeypatch.setenv("PGHOST", "db.example.com")
        monkeypatch.setenv("PGDATABASE", "testdb")
        monkeypatch.setenv("PGUSER", "svc-user")
        monkeypatch.setenv("PGPORT", "5432")
        monkeypatch.setenv("PGSSLMODE", "require")
        monkeypatch.setenv("PGAPPNAME", "test-app")

        with patch("server.db_config.get_token_manager") as mock_tm:
            mock_tm_inst = MagicMock()
            mock_tm_inst.get_token.return_value = "test_token"
            mock_tm_inst.needs_refresh = False
            mock_tm.return_value = mock_tm_inst

            engine = create_engine_for_backend(DatabaseBackend.POSTGRESQL)
            assert engine is not None
            assert "postgresql" in str(engine.url)
            engine.dispose()


# ---------------------------------------------------------------------------
# DatabaseBackend enum
# ---------------------------------------------------------------------------
class TestDatabaseBackend:
    """Tests for the DatabaseBackend enum."""

    def test_values(self):
        assert DatabaseBackend.SQLITE.value == "sqlite"
        assert DatabaseBackend.POSTGRESQL.value == "postgresql"

    def test_members(self):
        assert len(DatabaseBackend) == 2
