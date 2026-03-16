"""Integration tests: Connection resilience — pool reset, retry, OAuth refresh.

These tests verify the get_db() retry logic and _reset_connection_pool() behavior
by mocking engine/session internals to simulate connection failures.
"""

import time
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import DisconnectionError, OperationalError

pytestmark = [
    pytest.mark.integration,
    pytest.mark.spec("TESTING_SPEC"),
]


class TestIsConnectionError:
    """Verify _is_connection_error classifies errors correctly."""

    def test_disconnection_error_is_connection_error(self):
        from server.database import _is_connection_error

        exc = DisconnectionError("connection was closed")
        assert _is_connection_error(exc) is True

    def test_operational_error_is_connection_error(self):
        from server.database import _is_connection_error

        exc = OperationalError("test", {}, Exception("operational"))
        assert _is_connection_error(exc) is True

    def test_generic_exception_with_connection_message(self):
        from server.database import _is_connection_error

        exc = Exception("connection is closed unexpectedly")
        assert _is_connection_error(exc) is True

    def test_generic_exception_without_connection_message(self):
        from server.database import _is_connection_error

        exc = Exception("invalid syntax near SELECT")
        assert _is_connection_error(exc) is False

    @pytest.mark.parametrize("message", [
        "server closed the connection unexpectedly",
        "terminating connection",
        "connection reset",
        "ssl connection has been closed unexpectedly",
        "could not connect to server",
        "connection refused",
        "connection timed out",
        "invalid authorization",
        "database is locked",
    ])
    def test_known_pg_error_messages(self, message):
        from server.database import _is_connection_error

        exc = Exception(message)
        assert _is_connection_error(exc) is True


class TestResetConnectionPool:
    """Verify _reset_connection_pool disposes engine and refreshes OAuth."""

    def test_reset_disposes_engine(self):
        from server.database import _reset_connection_pool, engine

        with patch.object(engine, "dispose") as mock_dispose:
            _reset_connection_pool()
            mock_dispose.assert_called_once()

    def test_reset_refreshes_oauth_for_postgres(self):
        """When backend is PostgreSQL, force_refresh is called."""
        import server.database as db_mod

        mock_token_mgr = MagicMock()
        with (
            patch.object(db_mod, "DATABASE_BACKEND", db_mod.DatabaseBackend.POSTGRESQL),
            patch.object(db_mod.engine, "dispose"),
            patch("server.db_config.get_token_manager", return_value=mock_token_mgr),
        ):
            db_mod._reset_connection_pool()
            mock_token_mgr.force_refresh.assert_called_once()


class TestGetDbRetry:
    """Verify get_db retries on transient connection errors."""

    def test_retries_on_connection_error_then_succeeds(self):
        """get_db retries up to 3 times; succeeds on second attempt."""
        import server.database as db_mod

        call_count = 0
        real_session_local = db_mod.SessionLocal

        def _flaky_session():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise DisconnectionError("connection is closed")
            return MagicMock()

        with (
            patch.object(db_mod, "SessionLocal", side_effect=_flaky_session),
            patch.object(db_mod, "_reset_connection_pool"),
            patch.object(db_mod, "DATABASE_BACKEND", db_mod.DatabaseBackend.SQLITE),
            patch("time.sleep"),
        ):
            gen = db_mod.get_db()
            session = next(gen)
            assert session is not None
            assert call_count == 2
            # Clean up generator
            try:
                next(gen)
            except StopIteration:
                pass

    def test_gives_up_after_max_attempts(self):
        """get_db raises after 3 failed attempts."""
        import server.database as db_mod

        def _always_fail():
            raise DisconnectionError("connection is closed")

        with (
            patch.object(db_mod, "SessionLocal", side_effect=_always_fail),
            patch.object(db_mod, "_reset_connection_pool"),
            patch.object(db_mod, "DATABASE_BACKEND", db_mod.DatabaseBackend.SQLITE),
            patch("time.sleep"),
        ):
            gen = db_mod.get_db()
            with pytest.raises(DisconnectionError):
                next(gen)

    def test_non_connection_error_raises_immediately(self):
        """Non-connection errors are not retried."""
        import server.database as db_mod

        call_count = 0

        def _bad_query():
            nonlocal call_count
            call_count += 1
            raise ValueError("invalid syntax")

        with (
            patch.object(db_mod, "SessionLocal", side_effect=_bad_query),
            patch.object(db_mod, "DATABASE_BACKEND", db_mod.DatabaseBackend.SQLITE),
        ):
            gen = db_mod.get_db()
            with pytest.raises(ValueError):
                next(gen)
            assert call_count == 1  # No retry
