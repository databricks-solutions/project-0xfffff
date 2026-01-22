import inspect
from unittest.mock import MagicMock

import httpx
import pytest
import pytest_asyncio


def pytest_addoption(parser):
    """Add --spec option for filtering tests by spec marker."""
    parser.addoption(
        "--spec",
        action="store",
        default=None,
        help="Only run tests marked with the given spec name (e.g., --spec ASSISTED_FACILITATION_SPEC)",
    )


def pytest_collection_modifyitems(config, items):
    """Filter tests by --spec option if provided."""
    spec_filter = config.getoption("--spec")
    if spec_filter is None:
        return

    selected = []
    deselected = []

    for item in items:
        # Check for spec marker on the test item or its parent class
        spec_markers = list(item.iter_markers(name="spec"))
        item_specs = [m.args[0] for m in spec_markers if m.args]

        if spec_filter in item_specs:
            selected.append(item)
        else:
            deselected.append(item)

    if deselected:
        config.hook.pytest_deselected(items=deselected)
    items[:] = selected


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
