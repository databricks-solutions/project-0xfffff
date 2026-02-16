"""Integration test fixtures with real database and transaction-rollback isolation.

Provides:
- Session-scoped engine + schema creation
- SQLite in-memory (default) or Postgres via testcontainers (--backend postgres)
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
# CLI option: --backend sqlite|postgres
# ---------------------------------------------------------------------------

def pytest_addoption(parser):
    parser.addoption(
        "--backend",
        action="store",
        default="sqlite",
        choices=["sqlite", "postgres"],
        help="Database backend for integration tests (default: sqlite)",
    )


# ---------------------------------------------------------------------------
# Session-scoped engine: created once, tables + indexes applied
# ---------------------------------------------------------------------------

def _create_sqlite_engine():
    """Create a SQLite in-memory engine."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def _create_postgres_engine():
    """Create a Postgres engine backed by testcontainers."""
    from testcontainers.postgres import PostgresContainer

    # Store container on the engine so we can stop it later
    container = PostgresContainer("postgres:16-alpine")
    container.start()

    engine = create_engine(
        container.get_connection_url(),
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
    )
    engine._test_container = container  # type: ignore[attr-defined]
    return engine


def _apply_schema(engine):
    """Create all tables and runtime unique indexes."""
    Base.metadata.create_all(bind=engine)

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


@pytest.fixture(scope="session")
def integration_engine(request):
    """Create a real database engine for the test session."""
    backend = request.config.getoption("--backend")

    if backend == "postgres":
        engine = _create_postgres_engine()
    else:
        engine = _create_sqlite_engine()

    _apply_schema(engine)

    yield engine

    engine.dispose()

    # Stop the container if using Postgres
    container = getattr(engine, "_test_container", None)
    if container is not None:
        container.stop()


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
