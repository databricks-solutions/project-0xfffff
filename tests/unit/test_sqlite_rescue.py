"""Unit tests for SQLite Rescue module.

Tests configuration parsing, path validation, and volume path utilities
for Databricks Apps database persistence.
"""

import os
import pytest
from unittest.mock import patch

from server.sqlite_rescue import (
    _get_config,
    _validate_volume_path,
    _get_volume_root,
)


@pytest.mark.spec("BUILD_AND_DEPLOY_SPEC")
class TestGetConfig:
    """Tests for the _get_config function."""

    def test_default_database_url(self):
        """Test default DATABASE_URL parsing."""
        with patch.dict(os.environ, {}, clear=True):
            local_path, volume_path, interval = _get_config()
            # Default is sqlite:///./workshop.db
            assert local_path == "./workshop.db"
            assert volume_path is None
            assert interval == 10  # Default interval

    def test_sqlite_triple_slash_url(self):
        """Test sqlite:/// URL format."""
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite:///./data/app.db"}, clear=True):
            local_path, volume_path, interval = _get_config()
            assert local_path == "./data/app.db"

    def test_sqlite_double_slash_url(self):
        """Test sqlite:// URL format (less common)."""
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite://./data/app.db"}, clear=True):
            local_path, volume_path, interval = _get_config()
            assert local_path == "./data/app.db"

    def test_non_sqlite_url_returns_none(self):
        """Test that non-SQLite URLs return None for local path."""
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://localhost/db"}, clear=True):
            local_path, volume_path, interval = _get_config()
            assert local_path is None

    def test_volume_backup_path_direct(self):
        """Test SQLITE_VOLUME_BACKUP_PATH configuration."""
        env = {
            "DATABASE_URL": "sqlite:///./workshop.db",
            "SQLITE_VOLUME_BACKUP_PATH": "/Volumes/catalog/schema/volume/backup.db",
        }
        with patch.dict(os.environ, env, clear=True):
            local_path, volume_path, interval = _get_config()
            assert volume_path == "/Volumes/catalog/schema/volume/backup.db"

    def test_volume_path_appends_workshop_db(self):
        """Test SQLITE_VOLUME_PATH appends /workshop.db."""
        env = {
            "DATABASE_URL": "sqlite:///./workshop.db",
            "SQLITE_VOLUME_PATH": "/Volumes/catalog/schema/volume",
        }
        with patch.dict(os.environ, env, clear=True):
            local_path, volume_path, interval = _get_config()
            assert volume_path == "/Volumes/catalog/schema/volume/workshop.db"

    def test_volume_path_with_trailing_slash(self):
        """Test SQLITE_VOLUME_PATH with trailing slash is handled."""
        env = {
            "DATABASE_URL": "sqlite:///./workshop.db",
            "SQLITE_VOLUME_PATH": "/Volumes/catalog/schema/volume/",
        }
        with patch.dict(os.environ, env, clear=True):
            local_path, volume_path, interval = _get_config()
            assert volume_path == "/Volumes/catalog/schema/volume/workshop.db"
            assert "//" not in volume_path  # No double slashes

    def test_backup_path_takes_precedence(self):
        """Test that SQLITE_VOLUME_BACKUP_PATH takes precedence over SQLITE_VOLUME_PATH."""
        env = {
            "DATABASE_URL": "sqlite:///./workshop.db",
            "SQLITE_VOLUME_PATH": "/Volumes/catalog/schema/volume",
            "SQLITE_VOLUME_BACKUP_PATH": "/Volumes/other/path/custom.db",
        }
        with patch.dict(os.environ, env, clear=True):
            local_path, volume_path, interval = _get_config()
            assert volume_path == "/Volumes/other/path/custom.db"

    def test_custom_backup_interval(self):
        """Test custom backup interval configuration."""
        env = {
            "DATABASE_URL": "sqlite:///./workshop.db",
            "SQLITE_BACKUP_INTERVAL_MINUTES": "30",
        }
        with patch.dict(os.environ, env, clear=True):
            local_path, volume_path, interval = _get_config()
            assert interval == 30

    def test_backup_interval_zero_disables(self):
        """Test that interval of 0 is allowed (disables backup timer)."""
        env = {
            "DATABASE_URL": "sqlite:///./workshop.db",
            "SQLITE_BACKUP_INTERVAL_MINUTES": "0",
        }
        with patch.dict(os.environ, env, clear=True):
            local_path, volume_path, interval = _get_config()
            assert interval == 0


@pytest.mark.spec("BUILD_AND_DEPLOY_SPEC")
class TestValidateVolumePath:
    """Tests for the _validate_volume_path function."""

    def test_valid_volume_path(self):
        """Test valid Unity Catalog volume path."""
        path = "/Volumes/my_catalog/my_schema/my_volume/workshop.db"
        is_valid, error = _validate_volume_path(path)
        assert is_valid is True
        assert error == ""

    def test_valid_nested_path(self):
        """Test valid nested path within volume."""
        path = "/Volumes/catalog/schema/volume/subdir/nested/file.db"
        is_valid, error = _validate_volume_path(path)
        assert is_valid is True
        assert error == ""

    def test_empty_path_is_invalid(self):
        """Test that empty path is invalid."""
        is_valid, error = _validate_volume_path("")
        assert is_valid is False
        assert "empty" in error.lower()

    def test_none_path_is_invalid(self):
        """Test that None path is invalid."""
        is_valid, error = _validate_volume_path(None)
        assert is_valid is False

    def test_non_volumes_prefix_is_invalid(self):
        """Test that paths not starting with /Volumes/ are invalid."""
        path = "/dbfs/mnt/my_volume/file.db"
        is_valid, error = _validate_volume_path(path)
        assert is_valid is False
        assert "/Volumes/" in error

    def test_incomplete_volume_path_is_invalid(self):
        """Test that incomplete volume path is invalid."""
        # Missing filename component
        path = "/Volumes/catalog/schema"
        is_valid, error = _validate_volume_path(path)
        assert is_valid is False
        assert "Invalid Unity Catalog volume path" in error

    def test_just_volumes_root_is_invalid(self):
        """Test that just /Volumes/ is invalid."""
        path = "/Volumes/"
        is_valid, error = _validate_volume_path(path)
        assert is_valid is False

    def test_case_sensitive_volumes_prefix(self):
        """Test that /Volumes/ prefix is case-sensitive."""
        path = "/volumes/catalog/schema/volume/file.db"
        is_valid, error = _validate_volume_path(path)
        assert is_valid is False  # lowercase 'v' should fail


@pytest.mark.spec("BUILD_AND_DEPLOY_SPEC")
class TestGetVolumeRoot:
    """Tests for the _get_volume_root function."""

    def test_extracts_volume_root(self):
        """Test extracting volume root from full path."""
        path = "/Volumes/my_catalog/my_schema/my_volume/workshop.db"
        root = _get_volume_root(path)
        assert root == "/Volumes/my_catalog/my_schema/my_volume"

    def test_extracts_root_from_nested_path(self):
        """Test extracting volume root from deeply nested path."""
        path = "/Volumes/catalog/schema/volume/a/b/c/file.db"
        root = _get_volume_root(path)
        assert root == "/Volumes/catalog/schema/volume"

    def test_returns_none_for_short_path(self):
        """Test that short paths return None."""
        path = "/Volumes/catalog"
        root = _get_volume_root(path)
        assert root is None

    def test_returns_none_for_empty_path(self):
        """Test that empty path returns None."""
        root = _get_volume_root("")
        assert root is None

    def test_exact_volume_path_returns_self(self):
        """Test that exact volume path returns itself."""
        path = "/Volumes/catalog/schema/volume"
        root = _get_volume_root(path)
        assert root == path
