"""Tests for trace upsert behavior in DatabaseService.add_traces.

Covers:
- mlflow_url, mlflow_host, mlflow_experiment_id persisted on ingest
- Re-ingest with same mlflow_trace_id updates existing trace (upsert)
- Different mlflow_trace_id values create separate traces
- Null mlflow_trace_id always inserts new row
- FK references (DiscoveryFindingDB) survive re-ingest
"""

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import Base, WorkshopDB, TraceDB, DiscoveryFindingDB
from server.models import TraceUpload
from server.services.database_service import DatabaseService


@pytest.fixture
def db_session():
    """Create an in-memory SQLite database with all tables."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed a workshop
    workshop = WorkshopDB(
        id="ws-1",
        name="Test Workshop",
        facilitator_id="facilitator-1",
    )
    session.add(workshop)
    session.commit()

    yield session
    session.close()


@pytest.fixture
def service(db_session):
    return DatabaseService(db_session)


WORKSHOP_ID = "ws-1"


@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("REQ-TRACE-MLFLOW-FIELDS")
class TestMlflowFieldsPersisted:
    """mlflow_url, mlflow_host, mlflow_experiment_id are stored on ingest."""

    def test_mlflow_fields_persisted(self, service, db_session):
        traces = service.add_traces(
            WORKSHOP_ID,
            [
                TraceUpload(
                    input="hi",
                    output="bye",
                    mlflow_trace_id="tr-1",
                    mlflow_url="https://mlflow.example.com/trace/tr-1",
                    mlflow_host="https://mlflow.example.com",
                    mlflow_experiment_id="exp-100",
                )
            ],
        )

        assert len(traces) == 1
        t = traces[0]
        assert t.mlflow_url == "https://mlflow.example.com/trace/tr-1"
        assert t.mlflow_host == "https://mlflow.example.com"
        assert t.mlflow_experiment_id == "exp-100"

        # Also verify at the DB level
        db_trace = db_session.query(TraceDB).filter(TraceDB.id == t.id).one()
        assert db_trace.mlflow_url == "https://mlflow.example.com/trace/tr-1"
        assert db_trace.mlflow_host == "https://mlflow.example.com"
        assert db_trace.mlflow_experiment_id == "exp-100"


@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("REQ-TRACE-UPSERT")
class TestReIngestUpdatesExisting:
    """Re-ingest with same mlflow_trace_id updates existing trace."""

    def test_upsert_same_mlflow_trace_id(self, service, db_session):
        # First ingest
        first = service.add_traces(
            WORKSHOP_ID,
            [
                TraceUpload(
                    input="v1-input",
                    output="v1-output",
                    mlflow_trace_id="tr-1",
                    mlflow_url="https://host/v1",
                    mlflow_host="https://host",
                    mlflow_experiment_id="exp-1",
                )
            ],
        )
        assert len(first) == 1
        first_id = first[0].id

        # Re-ingest same mlflow_trace_id with updated content
        second = service.add_traces(
            WORKSHOP_ID,
            [
                TraceUpload(
                    input="v2-input",
                    output="v2-output",
                    mlflow_trace_id="tr-1",
                    mlflow_url="https://host/v2",
                    mlflow_host="https://host-v2",
                    mlflow_experiment_id="exp-2",
                )
            ],
        )
        assert len(second) == 1
        # Same internal ID
        assert second[0].id == first_id
        # Content updated
        assert second[0].input == "v2-input"
        assert second[0].output == "v2-output"
        assert second[0].mlflow_url == "https://host/v2"
        assert second[0].mlflow_host == "https://host-v2"
        assert second[0].mlflow_experiment_id == "exp-2"

        # Only 1 row in DB
        count = db_session.query(TraceDB).filter(TraceDB.workshop_id == WORKSHOP_ID).count()
        assert count == 1


@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("REQ-TRACE-UPSERT")
class TestDifferentTraceIdsCreateSeparate:
    """Different mlflow_trace_id values create separate traces."""

    def test_different_mlflow_trace_ids(self, service, db_session):
        service.add_traces(
            WORKSHOP_ID,
            [
                TraceUpload(input="a", output="b", mlflow_trace_id="tr-1"),
                TraceUpload(input="c", output="d", mlflow_trace_id="tr-2"),
            ],
        )
        count = db_session.query(TraceDB).filter(TraceDB.workshop_id == WORKSHOP_ID).count()
        assert count == 2


@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("REQ-TRACE-UPSERT")
class TestNullTraceIdAlwaysInserts:
    """Null mlflow_trace_id always inserts a new row."""

    def test_null_mlflow_trace_id_inserts(self, service, db_session):
        service.add_traces(
            WORKSHOP_ID,
            [TraceUpload(input="a", output="b", mlflow_trace_id=None)],
        )
        service.add_traces(
            WORKSHOP_ID,
            [TraceUpload(input="a", output="b", mlflow_trace_id=None)],
        )
        count = db_session.query(TraceDB).filter(TraceDB.workshop_id == WORKSHOP_ID).count()
        assert count == 2


@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("REQ-TRACE-UPSERT-FK")
class TestFkSurvivesReIngest:
    """FK references (DiscoveryFindingDB) survive re-ingest."""

    def test_discovery_finding_fk_survives(self, service, db_session):
        # Ingest trace
        traces = service.add_traces(
            WORKSHOP_ID,
            [TraceUpload(input="a", output="b", mlflow_trace_id="tr-1")],
        )
        trace_id = traces[0].id

        # Create a discovery finding referencing this trace
        finding = DiscoveryFindingDB(
            id=str(uuid.uuid4()),
            workshop_id=WORKSHOP_ID,
            trace_id=trace_id,
            user_id="user-1",
            insight="interesting finding",
        )
        db_session.add(finding)
        db_session.commit()

        # Re-ingest same trace
        updated = service.add_traces(
            WORKSHOP_ID,
            [TraceUpload(input="a-v2", output="b-v2", mlflow_trace_id="tr-1")],
        )
        assert updated[0].id == trace_id

        # Finding still exists and references the same trace
        db_finding = db_session.query(DiscoveryFindingDB).filter(
            DiscoveryFindingDB.trace_id == trace_id
        ).one()
        assert db_finding.insight == "interesting finding"
