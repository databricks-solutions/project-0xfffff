"""Integration test fixtures with real database and transaction-rollback isolation.

Provides:
- Session-scoped engine + schema creation (SQLite in-memory by default)
- Per-test transaction rollback so tests don't leak state
- Real FastAPI app with dependency override pointing at the test DB
- Async HTTP client for exercising endpoints end-to-end
"""

import inspect
from unittest.mock import patch

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from server.database import Base


# ---------------------------------------------------------------------------
# Session-scoped engine: created once, tables + indexes applied
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def integration_engine():
    """Create a real SQLite in-memory database engine for the test session."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    # Create all tables from the ORM models
    Base.metadata.create_all(bind=engine)

    # Apply runtime unique indexes that the app creates in create_tables()
    with engine.connect() as conn:
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_findings_unique "
            "ON discovery_findings (workshop_id, trace_id, user_id)"
        ))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_annotations_unique "
            "ON annotations (user_id, trace_id)"
        ))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_judge_evaluations_unique "
            "ON judge_evaluations (prompt_id, trace_id)"
        ))
        conn.commit()

    yield engine
    engine.dispose()


# ---------------------------------------------------------------------------
# Per-test session with transaction rollback
# ---------------------------------------------------------------------------

@pytest.fixture()
def integration_db(integration_engine):
    """Provide a real DB session that rolls back after each test."""
    connection = integration_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


# ---------------------------------------------------------------------------
# FastAPI app with real DB wired in
# ---------------------------------------------------------------------------

@pytest.fixture()
def integration_app(integration_db):
    """FastAPI app with get_db overridden to use the integration test session."""
    from server.app import app
    from server.database import get_db

    def _override_get_db():
        yield integration_db

    app.dependency_overrides[get_db] = _override_get_db
    yield app
    app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Async HTTP client (lifespan off to skip startup bootstrap)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def client(integration_app):
    """Async HTTP client that talks to the real app + real DB."""
    ASGITransport = getattr(httpx, "ASGITransport", None)
    if ASGITransport is None:
        from httpx._transports.asgi import ASGITransport  # type: ignore[attr-defined]

    transport_kwargs = {"app": integration_app}
    if "lifespan" in inspect.signature(ASGITransport).parameters:
        transport_kwargs["lifespan"] = "off"

    transport = ASGITransport(**transport_kwargs)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# Helper: seed a workshop (used by most tests)
# ---------------------------------------------------------------------------

@pytest.fixture()
def seed_workshop(integration_db):
    """Factory fixture: create a workshop row directly in the DB."""
    import uuid
    from server.database import WorkshopDB

    def _create(name="Test Workshop", facilitator_id="facilitator-1", phase="intake"):
        workshop = WorkshopDB(
            id=str(uuid.uuid4()),
            name=name,
            facilitator_id=facilitator_id,
            current_phase=phase,
        )
        integration_db.add(workshop)
        integration_db.flush()
        return workshop

    return _create


@pytest.fixture()
def seed_user(integration_db):
    """Factory fixture: create a user row directly in the DB."""
    import uuid
    from server.database import UserDB

    def _create(name="Test User", email=None, role="sme"):
        user = UserDB(
            id=str(uuid.uuid4()),
            name=name,
            email=email or f"{uuid.uuid4().hex[:8]}@test.com",
            role=role,
        )
        integration_db.add(user)
        integration_db.flush()
        return user

    return _create


@pytest.fixture()
def seed_trace(integration_db):
    """Factory fixture: create a trace row directly in the DB."""
    import uuid
    from server.database import TraceDB

    def _create(workshop_id, input_text="test input", output_text="test output", **kwargs):
        trace = TraceDB(
            id=str(uuid.uuid4()),
            workshop_id=workshop_id,
            input=input_text,
            output=output_text,
            **kwargs,
        )
        integration_db.add(trace)
        integration_db.flush()
        return trace

    return _create
