"""Tests for SummarizationJob CRUD operations and endpoints.

Covers database-backed job tracking for batch summarization progress:
- Job creation, status updates, trace-level progress tracking
- GET endpoints for job status and summarization coverage
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import Base, WorkshopDB, TraceDB
from server.services.database_service import DatabaseService


WORKSHOP_ID = "ws-test"


@pytest.fixture
def db_session():
    """Create an in-memory SQLite database with all tables."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed a workshop
    workshop = WorkshopDB(
        id=WORKSHOP_ID,
        name="Test Workshop",
        facilitator_id="facilitator-1",
        summarization_enabled=True,
        summarization_model="test-model",
    )
    session.add(workshop)

    # Seed traces — some with summaries, some without
    for i in range(5):
        trace = TraceDB(
            id=f"trace-{i}",
            workshop_id=WORKSHOP_ID,
            input=f"input-{i}",
            output=f"output-{i}",
            context={"spans": []} if i < 4 else None,
        )
        if i < 2:
            trace.summary = {"executive_summary": "test"}
        session.add(trace)

    session.commit()
    yield session
    session.close()


@pytest.fixture
def service(db_session):
    return DatabaseService(db_session)


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestSummarizationJobCRUD:

    @pytest.mark.req("A `SummarizationJob` database row is created when summarization starts")
    def test_create_summarization_job(self, service):
        """Creating a job returns a SummarizationJob with pending status."""
        job = service.create_summarization_job(workshop_id=WORKSHOP_ID, total=50)
        assert job.workshop_id == WORKSHOP_ID
        assert job.status == "pending"
        assert job.total == 50
        assert job.completed_traces == []
        assert job.failed_traces == []
        assert job.completed == 0
        assert job.failed == 0

    @pytest.mark.req("The job row is updated as each trace completes (trace ID appended to `completed_traces` or `failed_traces`)")
    def test_add_completed_trace(self, service):
        """Appending a completed trace updates the job row."""
        job = service.create_summarization_job(workshop_id=WORKSHOP_ID, total=10)
        updated = service.add_summarization_job_completed(job.id, "trace-0")
        assert "trace-0" in updated.completed_traces
        assert updated.completed == 1
        assert updated.failed == 0

    @pytest.mark.req("The job row is updated as each trace completes (trace ID appended to `completed_traces` or `failed_traces`)")
    def test_add_failed_trace(self, service):
        """Appending a failed trace records trace_id and error."""
        job = service.create_summarization_job(workshop_id=WORKSHOP_ID, total=10)
        updated = service.add_summarization_job_failed(job.id, "trace-1", "LLM timeout")
        assert len(updated.failed_traces) == 1
        assert updated.failed_traces[0]["trace_id"] == "trace-1"
        assert updated.failed_traces[0]["error"] == "LLM timeout"
        assert updated.failed == 1

    @pytest.mark.req("The job row is updated as each trace completes (trace ID appended to `completed_traces` or `failed_traces`)")
    def test_multiple_trace_updates(self, service):
        """Multiple traces can be appended sequentially."""
        job = service.create_summarization_job(workshop_id=WORKSHOP_ID, total=3)
        service.add_summarization_job_completed(job.id, "trace-0")
        service.add_summarization_job_completed(job.id, "trace-1")
        updated = service.add_summarization_job_failed(job.id, "trace-2", "parse error")
        assert updated.completed == 2
        assert updated.failed == 1
        assert set(updated.completed_traces) == {"trace-0", "trace-1"}

    @pytest.mark.req("`GET /workshops/{id}/summarization-job/{job_id}` returns job status with completed/total/failed counts")
    def test_get_summarization_job(self, service):
        """Fetching a job by ID returns the full job state."""
        job = service.create_summarization_job(workshop_id=WORKSHOP_ID, total=5)
        fetched = service.get_summarization_job(job.id)
        assert fetched is not None
        assert fetched.id == job.id
        assert fetched.total == 5

    def test_get_summarization_job_not_found(self, service):
        """Fetching a nonexistent job returns None."""
        assert service.get_summarization_job("nonexistent") is None

    def test_update_job_status(self, service):
        """Job status can be updated to running/completed/failed."""
        job = service.create_summarization_job(workshop_id=WORKSHOP_ID, total=5)
        updated = service.update_summarization_job_status(job.id, "running")
        assert updated.status == "running"
        updated = service.update_summarization_job_status(job.id, "completed")
        assert updated.status == "completed"

    @pytest.mark.req("`GET /workshops/{id}/summarization-status` returns summary coverage stats and last job info")
    def test_get_summarization_status(self, service):
        """Summarization status returns trace counts and last job."""
        status = service.get_summarization_status(WORKSHOP_ID)
        assert status["traces_with_summaries"] == 2  # trace-0, trace-1 have summaries
        assert status["traces_without_summaries"] == 3  # trace-2, trace-3, trace-4

    @pytest.mark.req("`summarization-status` endpoint provides the data for these indicators without requiring a job")
    def test_get_summarization_status_no_jobs(self, service):
        """Status works even when no jobs have been created."""
        status = service.get_summarization_status(WORKSHOP_ID)
        assert status["last_job"] is None
        assert status["traces_with_summaries"] == 2

    @pytest.mark.req("`GET /workshops/{id}/summarization-status` returns summary coverage stats and last job info")
    def test_get_summarization_status_with_job(self, service):
        """Status includes the latest job when one exists."""
        service.create_summarization_job(workshop_id=WORKSHOP_ID, total=5)
        status = service.get_summarization_status(WORKSHOP_ID)
        assert status["last_job"] is not None
        assert status["last_job"].total == 5

    def test_get_latest_job(self, service):
        """get_latest_summarization_job returns a job (most recent by created_at)."""
        job1 = service.create_summarization_job(workshop_id=WORKSHOP_ID, total=10)
        job2 = service.create_summarization_job(workshop_id=WORKSHOP_ID, total=20)
        latest = service.get_latest_summarization_job(WORKSHOP_ID)
        assert latest is not None
        assert latest.id in (job1.id, job2.id)

    def test_get_latest_job_none(self, service):
        """get_latest_summarization_job returns None when no jobs exist."""
        assert service.get_latest_summarization_job(WORKSHOP_ID) is None
