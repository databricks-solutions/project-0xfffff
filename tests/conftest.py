import inspect
from unittest.mock import MagicMock

import httpx
import pytest
import pytest_asyncio


@pytest.fixture(scope="session")
def app():
    # Import lazily so test collection doesn't accidentally trigger app startup.
    from server.app import app as fastapi_app

    return fastapi_app


@pytest.fixture()
def mock_db_session():
    # Session-like mock used for dependency overrides in router tests.
    db = MagicMock(name="db_session")
    db.rollback = MagicMock(name="rollback")
    db.close = MagicMock(name="close")
    return db


@pytest.fixture()
def override_get_db(app, mock_db_session):
    """
    Override FastAPI's `get_db` dependency so route tests don't touch a real DB.
    """
    from server.database import get_db

    def _override():
        yield mock_db_session

    app.dependency_overrides[get_db] = _override
    try:
        yield mock_db_session
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture()
async def async_client(app):
    """
    ASGI test client (async) with lifespan disabled so startup doesn't run DB bootstrap.
    """
    # httpx v0.25+ exposes ASGITransport; keep a fallback to older locations.
    ASGITransport = getattr(httpx, "ASGITransport", None)
    if ASGITransport is None:
        from httpx._transports.asgi import ASGITransport  # type: ignore

    transport_kwargs = {"app": app}
    # httpx transport gained `lifespan=` relatively recently; keep compatibility with older versions
    # that will error if we pass an unexpected kwarg.
    if "lifespan" in inspect.signature(ASGITransport).parameters:
        transport_kwargs["lifespan"] = "off"

    transport = ASGITransport(**transport_kwargs)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
