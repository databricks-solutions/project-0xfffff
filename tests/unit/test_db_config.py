"""Tests for server.db_config — Lakebase/PostgreSQL configuration and token management."""

from __future__ import annotations

import os
import time
from unittest.mock import MagicMock, patch

import pytest

from server.db_config import (
    DatabaseBackend,
    LakebaseConfig,
    LakebaseCredentialManager,
    create_engine_for_backend,
    detect_database_backend,
    get_database_url,
    get_schema_name,
    get_credential_manager,
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
# LakebaseCredentialManager
# ---------------------------------------------------------------------------
class TestLakebaseCredentialManager:
    """Tests for Lakebase credential lifecycle management."""

    def test_initial_state(self):
        mgr = LakebaseCredentialManager()
        assert mgr._token is None
        assert mgr._token_expiry == 0.0

    def test_get_password_with_endpoint_name(self):
        mgr = LakebaseCredentialManager()
        mock_client = MagicMock()
        mock_cred = MagicMock()
        mock_cred.token = "db_cred_123"
        mock_cred.expire_time.seconds = 3600
        mock_client.postgres.generate_database_credential.return_value = mock_cred
        mgr._workspace_client = mock_client

        password = mgr.get_password("projects/p1/branches/b1/endpoints/e1")
        assert password == "db_cred_123"
        mock_client.postgres.generate_database_credential.assert_called_once_with(
            endpoint="projects/p1/branches/b1/endpoints/e1"
        )

    def test_get_password_falls_back_to_oauth_when_no_endpoint(self):
        mgr = LakebaseCredentialManager()
        mock_client = MagicMock()
        mock_client.config.oauth_token.return_value = MagicMock(access_token="oauth_tok")
        mgr._workspace_client = mock_client

        password = mgr.get_password(None)
        assert password == "oauth_tok"
        mock_client.config.oauth_token.assert_called_once()

    def test_get_password_uses_cache(self):
        mgr = LakebaseCredentialManager()
        mock_client = MagicMock()
        mock_cred = MagicMock()
        mock_cred.token = "cached_tok"
        mock_cred.expire_time.seconds = 3600
        mock_client.postgres.generate_database_credential.return_value = mock_cred
        mgr._workspace_client = mock_client

        # First call: fetches credential
        pw1 = mgr.get_password("ep1")
        # Second call: should use cache (within expiry window)
        pw2 = mgr.get_password("ep1")

        assert pw1 == pw2 == "cached_tok"
        assert mock_client.postgres.generate_database_credential.call_count == 1

    def test_get_password_refreshes_near_expiry(self):
        mgr = LakebaseCredentialManager()
        mock_client = MagicMock()
        mock_cred = MagicMock()
        mock_cred.token = "tok_v1"
        mock_cred.expire_time.seconds = 3600
        mock_client.postgres.generate_database_credential.return_value = mock_cred
        mgr._workspace_client = mock_client

        mgr.get_password("ep1")
        assert mock_client.postgres.generate_database_credential.call_count == 1

        # Simulate near-expiry (set expiry to now)
        mgr._token_expiry = time.time()
        mock_cred.token = "tok_v2"

        password = mgr.get_password("ep1")
        assert password == "tok_v2"
        assert mock_client.postgres.generate_database_credential.call_count == 2

    def test_get_password_raises_on_first_failure(self):
        mgr = LakebaseCredentialManager()
        mock_client = MagicMock()
        mock_client.postgres.generate_database_credential.side_effect = Exception("Auth failed")
        mgr._workspace_client = mock_client

        with pytest.raises(RuntimeError, match="Cannot obtain Lakebase credential"):
            mgr.get_password("ep1")

    def test_get_password_uses_stale_on_refresh_failure(self):
        mgr = LakebaseCredentialManager()
        mock_client = MagicMock()
        mock_cred = MagicMock()
        mock_cred.token = "stale_tok"
        mock_cred.expire_time.seconds = 3600
        mock_client.postgres.generate_database_credential.return_value = mock_cred
        mgr._workspace_client = mock_client

        # First call succeeds
        password = mgr.get_password("ep1")
        assert password == "stale_tok"

        # Simulate expiry and failure on refresh
        mgr._token_expiry = time.time()
        mock_client.postgres.generate_database_credential.side_effect = Exception("Network error")

        # Should return stale credential instead of raising
        password = mgr.get_password("ep1")
        assert password == "stale_tok"


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

    def test_postgresql_url_is_placeholder(self, monkeypatch):
        monkeypatch.setenv("DATABASE_ENV", "postgres")

        url = get_database_url()
        # PostgreSQL returns placeholder — do_connect handles auth
        assert url == "postgresql+psycopg://"


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
# get_credential_manager (singleton)
# ---------------------------------------------------------------------------
class TestGetCredentialManager:
    """Tests for the global credential manager singleton."""

    def test_returns_same_instance(self):
        import server.db_config as mod

        # Reset global state
        mod._credential_manager = None
        mgr1 = get_credential_manager()
        mgr2 = get_credential_manager()
        assert mgr1 is mgr2
        # Clean up
        mod._credential_manager = None

    def test_returns_lakebase_credential_manager(self):
        import server.db_config as mod

        mod._credential_manager = None
        mgr = get_credential_manager()
        assert isinstance(mgr, LakebaseCredentialManager)
        mod._credential_manager = None


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
