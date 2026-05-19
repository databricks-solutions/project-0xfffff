"""Tests for gunicorn_conf.py — the on_starting hook that runs migrations."""

from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.spec("BUILD_AND_DEPLOY_SPEC")
@pytest.mark.req("Pending Alembic migrations are applied automatically before workers accept traffic")
class TestOnStartingHook:
    """SC: Pending Alembic migrations are applied automatically before workers accept traffic."""

    def test_on_starting_calls_bootstrap_database(self):
        """on_starting hook calls bootstrap_database(full=True)."""
        from gunicorn_conf import on_starting

        mock_server = MagicMock()

        with patch("server.db_bootstrap.bootstrap_database") as mock_bootstrap:
            on_starting(mock_server)
            mock_bootstrap.assert_called_once_with(full=True)

    def test_on_starting_propagates_errors(self):
        """If bootstrap_database raises, on_starting does not swallow the error."""
        from gunicorn_conf import on_starting

        mock_server = MagicMock()

        with patch("server.db_bootstrap.bootstrap_database", side_effect=RuntimeError("migration failed")):
            with pytest.raises(RuntimeError, match="migration failed"):
                on_starting(mock_server)
