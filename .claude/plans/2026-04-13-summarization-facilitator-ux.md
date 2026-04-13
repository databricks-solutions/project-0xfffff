# Summarization Facilitator UX Implementation Plan

**Spec:** [TRACE_SUMMARIZATION_SPEC](../../specs/TRACE_SUMMARIZATION_SPEC.md)
**Goal:** Give facilitators visibility into summarization status, progress, and results — replacing the current fire-and-forget background task with tracked jobs.
**Architecture:** Add a `SummarizationJobDB` table to track batch summarization progress. Background tasks update the job row as each trace completes. Two new GET endpoints expose job status and summary coverage. The SummarizationSettings component gains a progress section with polling, a re-summarize button, and the FacilitatorDashboard trace list shows per-trace summary indicators.

**Success Criteria Targeted:**

Batch Summarization:
- SC-BATCH-1: A `SummarizationJob` database row is created when summarization starts
- SC-BATCH-2: The ingestion response includes `summarization_job_id` when summarization is triggered
- SC-BATCH-3: The job row is updated as each trace completes (trace ID appended to `completed_traces` or `failed_traces`)

Facilitator UX — Status & Progress:
- SC-PROG-1: `GET /workshops/{id}/summarization-job/{job_id}` returns job status with completed/total/failed counts
- SC-PROG-2: `GET /workshops/{id}/summarization-status` returns summary coverage stats and last job info
- SC-PROG-3: SummarizationSettings shows a progress indicator while a summarization job is running
- SC-PROG-4: Progress indicator shows completed/total/failed counts (e.g., "Summarizing... 45/80 complete, 2 failed")
- SC-PROG-5: Progress updates automatically via polling while the job is active
- SC-PROG-6: On completion, succeeded/failed counts are displayed in SummarizationSettings
- SC-PROG-7: Failed traces are listed with their error descriptions
- SC-PROG-8: Facilitator can retry failed traces from the completion view (creates a new job for just those traces)

Facilitator UX — Re-summarization:
- SC-RESUM-1: Re-summarize button exists in SummarizationSettings (disabled while a job is running)
- SC-RESUM-2: Facilitator can choose to re-summarize all traces or only unsummarized traces
- SC-RESUM-3: Confirmation dialog is shown before starting re-summarization
- SC-RESUM-4: `POST /resummarize` accepts a `mode` parameter: "all", "unsummarized", or "failed"
- SC-RESUM-5: Re-summarization creates a tracked `SummarizationJob` with the same progress UI

Facilitator UX — Summary Indicators:
- SC-IND-1: Trace list in FacilitatorDashboard shows a visual indicator for traces that have summaries
- SC-IND-2: Aggregate count of summarized vs. unsummarized traces is visible (e.g., "45/80 traces summarized")
- SC-IND-3: Last summarization timestamp is visible in SummarizationSettings
- SC-IND-4: `summarization-status` endpoint provides the data for these indicators without requiring a job

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `migrations/versions/0018_add_summarization_jobs.py` | Alembic migration for `summarization_jobs` table |
| `tests/unit/test_summarization_job_endpoints.py` | Backend tests for job tracking endpoints |

### Modified Files
| File | Change |
|------|--------|
| `server/database.py` | Add `SummarizationJobDB` model |
| `server/models.py` | Add `SummarizationJob` Pydantic model |
| `server/services/database_service.py` | Add CRUD methods for summarization jobs |
| `server/routers/workshops.py` | Add job status endpoints, update `resummarize` and ingestion to create jobs |
| `client/src/hooks/useWorkshopApi.ts` | Add `useSummarizationJob`, `useSummarizationStatus`, `useResummarize` hooks |
| `client/src/components/SummarizationSettings.tsx` | Add progress section, re-summarize button, confirmation dialog |
| `client/src/components/FacilitatorDashboard.tsx` | Add per-trace summary indicator badge and aggregate count |

---

## Task 1: Data Model — SummarizationJobDB + Pydantic Model + Migration

**Spec criteria:** SC-BATCH-1
**Files:**
- Modify: `server/database.py`
- Modify: `server/models.py`
- Create: `migrations/versions/0018_add_summarization_jobs.py`
- Test: `tests/unit/test_summarization_job_endpoints.py`

- [ ] **Step 1: Add SummarizationJobDB to database.py**

Add after the `TraceDB` class (around line 234):

```python
class SummarizationJobDB(Base):
    """Database model for tracking summarization batch jobs."""

    __tablename__ = "summarization_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workshop_id = Column(String, ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, default="pending")  # pending, running, completed, failed
    total = Column(Integer, default=0)
    completed_traces = Column(JSON, default=list)  # [trace_id, ...]
    failed_traces = Column(JSON, default=list)  # [{ trace_id, error }, ...]
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
```

- [ ] **Step 2: Add SummarizationJob Pydantic model to models.py**

Add after the `Trace` model (around line 200):

```python
class SummarizationJob(BaseModel):
    id: str
    workshop_id: str
    status: str = "pending"  # pending, running, completed, failed
    total: int = 0
    completed_traces: list[str] = Field(default_factory=list)
    failed_traces: list[dict] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    @property
    def completed(self) -> int:
        return len(self.completed_traces)

    @property
    def failed(self) -> int:
        return len(self.failed_traces)
```

- [ ] **Step 3: Create Alembic migration**

Create `migrations/versions/0018_add_summarization_jobs.py`:

```python
"""Add summarization_jobs table for tracking batch summarization progress.

Stores job status, completed/failed trace lists, and timestamps so the
facilitator can monitor summarization progress in the UI.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0018_add_summarization_jobs"
down_revision = "0017_add_summarization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "summarization_jobs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workshop_id", sa.String(), sa.ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String(), default="pending"),
        sa.Column("total", sa.Integer(), default=0),
        sa.Column("completed_traces", sa.JSON(), default=list),
        sa.Column("failed_traces", sa.JSON(), default=list),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("summarization_jobs")
```

- [ ] **Step 4: Run migration to verify it applies**

Run: `just db-upgrade`
Expected: Migration 0018 applies successfully

- [ ] **Step 5: Commit**

```bash
git add server/database.py server/models.py migrations/versions/0018_add_summarization_jobs.py
git commit -m "feat(summarization): add SummarizationJobDB model and migration"
```

---

## Task 2: DatabaseService CRUD Methods

**Spec criteria:** SC-BATCH-1, SC-BATCH-3, SC-PROG-1, SC-PROG-2, SC-IND-4
**Files:**
- Modify: `server/services/database_service.py`
- Test: `tests/unit/test_summarization_job_endpoints.py`

- [ ] **Step 1: Write tests for CRUD methods**

Create `tests/unit/test_summarization_job_endpoints.py`:

```python
import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch
from server.services.database_service import DatabaseService
from server.database import SummarizationJobDB


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestSummarizationJobCRUD:

    @pytest.mark.req("A `SummarizationJob` database row is created when summarization starts")
    def test_create_summarization_job(self, db_session):
        """Creating a job returns a SummarizationJob with pending status."""
        db_service = DatabaseService(db_session)
        job = db_service.create_summarization_job(
            workshop_id="ws-1",
            total=50,
        )
        assert job.workshop_id == "ws-1"
        assert job.status == "pending"
        assert job.total == 50
        assert job.completed_traces == []
        assert job.failed_traces == []

    @pytest.mark.req("The job row is updated as each trace completes (trace ID appended to `completed_traces` or `failed_traces`)")
    def test_update_job_completed_trace(self, db_session):
        """Appending a completed trace updates the job row."""
        db_service = DatabaseService(db_session)
        job = db_service.create_summarization_job(workshop_id="ws-1", total=10)
        updated = db_service.add_summarization_job_completed(job.id, "trace-1")
        assert "trace-1" in updated.completed_traces
        assert updated.completed == 1

    @pytest.mark.req("The job row is updated as each trace completes (trace ID appended to `completed_traces` or `failed_traces`)")
    def test_update_job_failed_trace(self, db_session):
        """Appending a failed trace updates the job row."""
        db_service = DatabaseService(db_session)
        job = db_service.create_summarization_job(workshop_id="ws-1", total=10)
        updated = db_service.add_summarization_job_failed(job.id, "trace-2", "LLM timeout")
        assert len(updated.failed_traces) == 1
        assert updated.failed_traces[0]["trace_id"] == "trace-2"
        assert updated.failed_traces[0]["error"] == "LLM timeout"
        assert updated.failed == 1

    @pytest.mark.req("`GET /workshops/{id}/summarization-job/{job_id}` returns job status with completed/total/failed counts")
    def test_get_summarization_job(self, db_session):
        """Fetching a job by ID returns the full job state."""
        db_service = DatabaseService(db_session)
        job = db_service.create_summarization_job(workshop_id="ws-1", total=5)
        fetched = db_service.get_summarization_job(job.id)
        assert fetched is not None
        assert fetched.id == job.id
        assert fetched.total == 5

    def test_get_summarization_job_not_found(self, db_session):
        """Fetching a nonexistent job returns None."""
        db_service = DatabaseService(db_session)
        assert db_service.get_summarization_job("nonexistent") is None

    @pytest.mark.req("`GET /workshops/{id}/summarization-status` returns summary coverage stats and last job info")
    def test_get_summarization_status(self, db_session, sample_workshop):
        """Summarization status returns trace counts and last job."""
        db_service = DatabaseService(db_session)
        # Assume sample_workshop fixture creates a workshop with some traces
        status = db_service.get_summarization_status(sample_workshop.id)
        assert "traces_with_summaries" in status
        assert "traces_without_summaries" in status
        assert "last_job" in status
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server -k test_summarization_job -v`
Expected: FAIL — methods not defined yet

- [ ] **Step 3: Implement CRUD methods in DatabaseService**

Add after `update_trace_summary` (around line 351 of `server/services/database_service.py`):

```python
  def create_summarization_job(self, workshop_id: str, total: int) -> "SummarizationJob":
    """Create a new summarization job for tracking batch progress."""
    from server.models import SummarizationJob

    db_job = SummarizationJobDB(
      workshop_id=workshop_id,
      status="pending",
      total=total,
      completed_traces=[],
      failed_traces=[],
    )
    self.db.add(db_job)
    self.db.commit()
    self.db.refresh(db_job)
    return self._job_from_db(db_job)

  def get_summarization_job(self, job_id: str) -> "SummarizationJob | None":
    """Get a summarization job by ID."""
    db_job = self.db.query(SummarizationJobDB).filter(SummarizationJobDB.id == job_id).first()
    if not db_job:
      return None
    return self._job_from_db(db_job)

  def update_summarization_job_status(self, job_id: str, status: str) -> "SummarizationJob | None":
    """Update the status of a summarization job."""
    db_job = self.db.query(SummarizationJobDB).filter(SummarizationJobDB.id == job_id).first()
    if not db_job:
      return None
    db_job.status = status
    self.db.commit()
    self.db.refresh(db_job)
    return self._job_from_db(db_job)

  def add_summarization_job_completed(self, job_id: str, trace_id: str) -> "SummarizationJob | None":
    """Append a trace ID to the job's completed list."""
    db_job = self.db.query(SummarizationJobDB).filter(SummarizationJobDB.id == job_id).first()
    if not db_job:
      return None
    completed = list(db_job.completed_traces or [])
    completed.append(trace_id)
    db_job.completed_traces = completed
    self.db.commit()
    self.db.refresh(db_job)
    return self._job_from_db(db_job)

  def add_summarization_job_failed(self, job_id: str, trace_id: str, error: str) -> "SummarizationJob | None":
    """Append a failed trace entry to the job's failed list."""
    db_job = self.db.query(SummarizationJobDB).filter(SummarizationJobDB.id == job_id).first()
    if not db_job:
      return None
    failed = list(db_job.failed_traces or [])
    failed.append({"trace_id": trace_id, "error": error})
    db_job.failed_traces = failed
    self.db.commit()
    self.db.refresh(db_job)
    return self._job_from_db(db_job)

  def get_latest_summarization_job(self, workshop_id: str) -> "SummarizationJob | None":
    """Get the most recent summarization job for a workshop."""
    db_job = (
      self.db.query(SummarizationJobDB)
      .filter(SummarizationJobDB.workshop_id == workshop_id)
      .order_by(SummarizationJobDB.created_at.desc())
      .first()
    )
    if not db_job:
      return None
    return self._job_from_db(db_job)

  def get_summarization_status(self, workshop_id: str) -> dict:
    """Get summary coverage stats and last job for a workshop."""
    from server.database import TraceDB

    with_summary = self.db.query(TraceDB).filter(
      TraceDB.workshop_id == workshop_id,
      TraceDB.summary.isnot(None),
    ).count()
    without_summary = self.db.query(TraceDB).filter(
      TraceDB.workshop_id == workshop_id,
      TraceDB.summary.is_(None),
    ).count()
    last_job = self.get_latest_summarization_job(workshop_id)
    return {
      "traces_with_summaries": with_summary,
      "traces_without_summaries": without_summary,
      "last_job": last_job,
    }

  def _job_from_db(self, db_job: "SummarizationJobDB") -> "SummarizationJob":
    """Convert a SummarizationJobDB row to a Pydantic model."""
    from server.models import SummarizationJob

    return SummarizationJob(
      id=db_job.id,
      workshop_id=db_job.workshop_id,
      status=db_job.status,
      total=db_job.total,
      completed_traces=db_job.completed_traces or [],
      failed_traces=db_job.failed_traces or [],
      created_at=db_job.created_at,
      updated_at=db_job.updated_at,
    )
```

Also add the import at the top of the file:
```python
from server.database import SummarizationJobDB
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test-server -k test_summarization_job -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/database_service.py tests/unit/test_summarization_job_endpoints.py
git commit -m "feat(summarization): add SummarizationJob CRUD methods to DatabaseService"
```

---

## Task 3: Backend Endpoints — Job Status and Summarization Status

**Spec criteria:** SC-PROG-1, SC-PROG-2, SC-IND-4
**Files:**
- Modify: `server/routers/workshops.py`
- Test: `tests/unit/test_summarization_job_endpoints.py`

- [ ] **Step 1: Write endpoint tests**

Add to `tests/unit/test_summarization_job_endpoints.py`:

```python
from fastapi.testclient import TestClient
from server.app import app

client = TestClient(app)


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestSummarizationJobEndpoints:

    @pytest.mark.req("`GET /workshops/{id}/summarization-job/{job_id}` returns job status with completed/total/failed counts")
    def test_get_job_status(self, db_session, sample_workshop):
        db_service = DatabaseService(db_session)
        job = db_service.create_summarization_job(sample_workshop.id, total=10)
        db_service.add_summarization_job_completed(job.id, "trace-1")
        db_service.update_summarization_job_status(job.id, "running")

        response = client.get(f"/workshops/{sample_workshop.id}/summarization-job/{job.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "running"
        assert data["total"] == 10
        assert data["completed"] == 1
        assert "trace-1" in data["completed_traces"]

    @pytest.mark.req("`GET /workshops/{id}/summarization-job/{job_id}` returns job status with completed/total/failed counts")
    def test_get_job_not_found(self, sample_workshop):
        response = client.get(f"/workshops/{sample_workshop.id}/summarization-job/nonexistent")
        assert response.status_code == 404

    @pytest.mark.req("`GET /workshops/{id}/summarization-status` returns summary coverage stats and last job info")
    def test_get_summarization_status(self, db_session, sample_workshop):
        response = client.get(f"/workshops/{sample_workshop.id}/summarization-status")
        assert response.status_code == 200
        data = response.json()
        assert "traces_with_summaries" in data
        assert "traces_without_summaries" in data
        assert "last_job" in data

    @pytest.mark.req("`summarization-status` endpoint provides the data for these indicators without requiring a job")
    def test_summarization_status_without_any_jobs(self, db_session, sample_workshop):
        response = client.get(f"/workshops/{sample_workshop.id}/summarization-status")
        assert response.status_code == 200
        data = response.json()
        assert data["last_job"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server -k TestSummarizationJobEndpoints -v`
Expected: FAIL — endpoints not defined

- [ ] **Step 3: Add GET endpoints to workshops router**

Add to `server/routers/workshops.py` after the existing `resummarize` endpoint (around line 569):

```python
@router.get("/{workshop_id}/summarization-job/{job_id}")
async def get_summarization_job(
    workshop_id: str,
    job_id: str,
    db: Session = Depends(get_db),
) -> dict:
    """Get the status of a summarization job."""
    db_service = DatabaseService(db)
    job = db_service.get_summarization_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Summarization job not found")
    if job.workshop_id != workshop_id:
        raise HTTPException(status_code=403, detail="Job does not belong to this workshop")
    return {
        "id": job.id,
        "workshop_id": job.workshop_id,
        "status": job.status,
        "total": job.total,
        "completed": job.completed,
        "failed": job.failed,
        "completed_traces": job.completed_traces,
        "failed_traces": job.failed_traces,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }


@router.get("/{workshop_id}/summarization-status")
async def get_summarization_status(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> dict:
    """Get summary coverage stats and last job info for a workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")
    status = db_service.get_summarization_status(workshop_id)
    last_job = status["last_job"]
    return {
        "traces_with_summaries": status["traces_with_summaries"],
        "traces_without_summaries": status["traces_without_summaries"],
        "last_job": {
            "id": last_job.id,
            "status": last_job.status,
            "total": last_job.total,
            "completed": last_job.completed,
            "failed": last_job.failed,
            "completed_traces": last_job.completed_traces,
            "failed_traces": last_job.failed_traces,
            "created_at": last_job.created_at.isoformat(),
            "updated_at": last_job.updated_at.isoformat(),
        } if last_job else None,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test-server -k TestSummarizationJobEndpoints -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routers/workshops.py tests/unit/test_summarization_job_endpoints.py
git commit -m "feat(summarization): add job status and summarization-status endpoints"
```

---

## Task 4: Update Resummarize Endpoint + Ingestion to Create Jobs

**Spec criteria:** SC-BATCH-1, SC-BATCH-2, SC-BATCH-3, SC-RESUM-4, SC-RESUM-5
**Files:**
- Modify: `server/routers/workshops.py`
- Test: `tests/unit/test_summarization_job_endpoints.py`

- [ ] **Step 1: Write tests for updated resummarize endpoint**

Add to tests:

```python
@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestResummarizeWithJobTracking:

    @pytest.mark.req("`POST /resummarize` accepts a `mode` parameter: \"all\", \"unsummarized\", or \"failed\"")
    def test_resummarize_returns_job_id(self, db_session, sample_workshop_with_summarization):
        """Resummarize returns a job_id for progress tracking."""
        response = client.post(
            f"/workshops/{sample_workshop_with_summarization.id}/resummarize",
            json={"mode": "all"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data
        assert "total" in data
        assert data["total"] > 0

    @pytest.mark.req("Re-summarization creates a tracked `SummarizationJob` with the same progress UI")
    def test_resummarize_creates_job_in_db(self, db_session, sample_workshop_with_summarization):
        """Resummarize creates a SummarizationJob row."""
        response = client.post(
            f"/workshops/{sample_workshop_with_summarization.id}/resummarize",
            json={"mode": "unsummarized"},
        )
        job_id = response.json()["job_id"]
        db_service = DatabaseService(db_session)
        job = db_service.get_summarization_job(job_id)
        assert job is not None
        assert job.workshop_id == sample_workshop_with_summarization.id

    @pytest.mark.req("The ingestion response includes `summarization_job_id` when summarization is triggered")
    def test_ingestion_returns_summarization_job_id(self, db_session, sample_workshop_with_summarization):
        """When summarization is enabled, ingest-mlflow-traces returns summarization_job_id."""
        # This test requires MLflow config + mocked ingestion — may need integration test
        pass  # Implement based on existing ingestion test patterns
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server -k TestResummarizeWithJobTracking -v`
Expected: FAIL — endpoint doesn't return job_id

- [ ] **Step 3: Update resummarize endpoint**

Replace the `resummarize_traces` function at `server/routers/workshops.py:503-569`:

```python
class ResummarizeRequest(BaseModel):
    mode: str = "all"  # "all", "unsummarized", or "failed"
    trace_ids: list[str] | None = None


@router.post("/{workshop_id}/resummarize")
async def resummarize_traces(
    workshop_id: str,
    body: ResummarizeRequest | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Trigger re-summarization of workshop traces.

    Creates a tracked SummarizationJob and returns the job_id for progress polling.
    Modes: "all" (re-summarize everything), "unsummarized" (only traces without summaries),
    "failed" (only traces from the last job's failed list).
    """
    import asyncio
    from server.services.trace_summarization_service import TraceSummarizationService

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")
    if not workshop.summarization_enabled or not workshop.summarization_model:
        raise HTTPException(status_code=400, detail="Summarization not configured")

    traces = db_service.get_traces(workshop_id)
    if not traces:
        return {"job_id": None, "total": 0, "message": "No traces to summarize"}

    request = body or ResummarizeRequest()

    # Filter traces based on mode
    if request.trace_ids:
        traces = [t for t in traces if t.id in request.trace_ids]
    elif request.mode == "unsummarized":
        traces = [t for t in traces if not t.summary]
    elif request.mode == "failed":
        last_job = db_service.get_latest_summarization_job(workshop_id)
        if last_job and last_job.failed_traces:
            failed_ids = {ft["trace_id"] for ft in last_job.failed_traces}
            traces = [t for t in traces if t.id in failed_ids]
        else:
            return {"job_id": None, "total": 0, "message": "No failed traces to retry"}

    batch = [{"id": t.id, "context": t.context} for t in traces if t.context]
    if not batch:
        return {"job_id": None, "total": 0, "message": "No traces with context to summarize"}

    # Create tracked job
    job = db_service.create_summarization_job(workshop_id=workshop_id, total=len(batch))

    mlflow_config = db_service.get_mlflow_config(workshop_id)
    if not mlflow_config:
        raise HTTPException(status_code=400, detail="MLflow config not found")

    workspace_host = mlflow_config.databricks_host.rstrip("/")
    workspace_url = workspace_host if workspace_host.startswith("https://") else f"https://{workspace_host}"
    endpoint_url = f"{workspace_url}/serving-endpoints"

    async def run_summarization():
        from server.database import SessionLocal
        from server.services.databricks_service import resolve_databricks_token

        token = resolve_databricks_token(workspace_url)
        svc = TraceSummarizationService(
            endpoint_url=endpoint_url,
            token=token,
            model_name=workshop.summarization_model,
            guidance=workshop.summarization_guidance,
        )

        with SessionLocal() as bg_db:
            bg_service = DatabaseService(bg_db)
            bg_service.update_summarization_job_status(job.id, "running")

            results = await svc.summarize_batch(batch)
            for result in results:
                if result["summary"] is not None:
                    bg_service.update_trace_summary(result["trace_id"], result["summary"])
                    bg_service.add_summarization_job_completed(job.id, result["trace_id"])
                else:
                    bg_service.add_summarization_job_failed(
                        job.id, result["trace_id"], result.get("error", "Unknown error")
                    )

            bg_service.update_summarization_job_status(job.id, "completed")
            logger.info(
                f"Summarization job {job.id} complete: "
                f"{len([r for r in results if r['summary']])} succeeded, "
                f"{len([r for r in results if not r['summary']])} failed"
            )

    asyncio.create_task(run_summarization())

    return {
        "job_id": job.id,
        "total": len(batch),
        "message": f"Summarization started for {len(batch)} traces",
    }
```

- [ ] **Step 4: Update ingestion background summarization**

In `server/routers/workshops.py` around line 2999-3037, update the ingestion summarization block to create a job and return the job_id. The key change: create a SummarizationJob before the background task, store the job_id, and return it in the ingestion response.

Replace the fire-and-forget block with:

```python
# Trigger background summarization if enabled
summarization_job_id = None
if workshop.summarization_enabled and workshop.summarization_model:
    try:
        import asyncio
        from server.services.trace_summarization_service import TraceSummarizationService

        traces = db_service.get_traces(workshop_id)
        unsummarized = [t for t in traces if t.context and not t.summary]
        if unsummarized:
            batch = [{"id": t.id, "context": t.context} for t in unsummarized]
            ingest_host = config_with_token.databricks_host.rstrip("/")
            ingest_url = ingest_host if ingest_host.startswith("https://") else f"https://{ingest_host}"
            endpoint_url = f"{ingest_url}/serving-endpoints"

            # Create tracked job
            job = db_service.create_summarization_job(workshop_id=workshop_id, total=len(batch))
            summarization_job_id = job.id

            async def run_summarization():
                from server.database import SessionLocal
                from server.services.databricks_service import resolve_databricks_token

                token = resolve_databricks_token(ingest_url)
                svc = TraceSummarizationService(
                    endpoint_url=endpoint_url,
                    token=token,
                    model_name=workshop.summarization_model,
                    guidance=workshop.summarization_guidance,
                )

                with SessionLocal() as bg_db:
                    bg_service = DatabaseService(bg_db)
                    bg_service.update_summarization_job_status(job.id, "running")

                    results = await svc.summarize_batch(batch)
                    for r in results:
                        if r["summary"] is not None:
                            bg_service.update_trace_summary(r["trace_id"], r["summary"])
                            bg_service.add_summarization_job_completed(job.id, r["trace_id"])
                        else:
                            bg_service.add_summarization_job_failed(
                                job.id, r["trace_id"], r.get("error", "Unknown error")
                            )

                    bg_service.update_summarization_job_status(job.id, "completed")
                    logger.info(
                        f"Background summarization job {job.id} complete: "
                        f"{len([r for r in results if r['summary']])} succeeded, "
                        f"{len([r for r in results if not r['summary']])} failed"
                    )

            asyncio.create_task(run_summarization())
    except Exception as e:
        logger.warning(f"Failed to start background summarization: {e}")
```

Then update the ingestion response to include `summarization_job_id`:

```python
return {
    "trace_count": trace_count,
    "summarization_job_id": summarization_job_id,
}
```

- [ ] **Step 5: Update summarize_batch to return error info**

Check if `TraceSummarizationService.summarize_batch()` already returns error info in the result dict for failed traces. If not, ensure each result includes `{"trace_id": ..., "summary": None, "error": "..."}` for failed traces. This is needed so the job tracking can record the error reason.

- [ ] **Step 6: Run tests**

Run: `just test-server -k "summarization_job or resummarize" -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/routers/workshops.py tests/unit/test_summarization_job_endpoints.py
git commit -m "feat(summarization): track resummarize and ingestion with SummarizationJob"
```

---

## Task 5: Frontend Hooks

**Spec criteria:** SC-PROG-5, SC-IND-4
**Files:**
- Modify: `client/src/hooks/useWorkshopApi.ts`

- [ ] **Step 1: Add query keys**

Add to the `QUERY_KEYS` object in `client/src/hooks/useWorkshopApi.ts`:

```typescript
summarizationJob: (workshopId: string, jobId: string) => ['summarization-job', workshopId, jobId],
summarizationStatus: (workshopId: string) => ['summarization-status', workshopId],
```

- [ ] **Step 2: Add useSummarizationJob hook**

```typescript
export function useSummarizationJob(workshopId: string, jobId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.summarizationJob(workshopId, jobId ?? ''),
    queryFn: async () => {
      const response = await fetch(`/workshops/${workshopId}/summarization-job/${jobId}`);
      if (!response.ok) throw new Error('Failed to fetch job status');
      return response.json();
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Stop polling once job is done
      if (status === 'completed' || status === 'failed') return false;
      return 2000; // Poll every 2 seconds while active
    },
  });
}
```

- [ ] **Step 3: Add useSummarizationStatus hook**

```typescript
export function useSummarizationStatus(workshopId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.summarizationStatus(workshopId),
    queryFn: async () => {
      const response = await fetch(`/workshops/${workshopId}/summarization-status`);
      if (!response.ok) throw new Error('Failed to fetch summarization status');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}
```

- [ ] **Step 4: Add useResummarize mutation hook**

```typescript
interface ResummarizeRequest {
  mode: 'all' | 'unsummarized' | 'failed';
  trace_ids?: string[];
}

interface ResummarizeResponse {
  job_id: string | null;
  total: number;
  message: string;
}

export function useResummarize(workshopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: ResummarizeRequest): Promise<ResummarizeResponse> => {
      const response = await fetch(`/workshops/${workshopId}/resummarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to start summarization' }));
        throw new Error(error.detail || 'Failed to start summarization');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.summarizationStatus(workshopId) });
    },
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useWorkshopApi.ts
git commit -m "feat(summarization): add React Query hooks for job polling and re-summarize"
```

---

## Task 6: SummarizationSettings — Progress UI + Re-summarize Button

**Spec criteria:** SC-PROG-3, SC-PROG-4, SC-PROG-5, SC-PROG-6, SC-PROG-7, SC-PROG-8, SC-RESUM-1, SC-RESUM-2, SC-RESUM-3, SC-IND-3
**Files:**
- Modify: `client/src/components/SummarizationSettings.tsx`

- [ ] **Step 1: Add state and hooks for job tracking**

Add to SummarizationSettings component state:

```typescript
const { data: summaryStatus } = useSummarizationStatus(workshopId!);
const resummarize = useResummarize(workshopId!);

// Track the active job ID — either from a resummarize action or from the last job
const [activeJobId, setActiveJobId] = useState<string | null>(null);
const { data: activeJob } = useSummarizationJob(workshopId!, activeJobId);

// On mount, check if there's an in-progress job from the last status
useEffect(() => {
  if (summaryStatus?.last_job) {
    const lastJob = summaryStatus.last_job;
    if (lastJob.status === 'pending' || lastJob.status === 'running') {
      setActiveJobId(lastJob.id);
    }
  }
}, [summaryStatus?.last_job]);

// Confirmation dialog state
const [showConfirmDialog, setShowConfirmDialog] = useState(false);
const [resummarizeMode, setResummarizeMode] = useState<'all' | 'unsummarized'>('unsummarized');
```

- [ ] **Step 2: Add progress section below save button**

Add after the Save button div:

```tsx
{/* Summarization Status & Progress */}
{enabled && summaryStatus && (
  <div className="border-t pt-4 space-y-3">
    {/* Aggregate coverage */}
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <BarChart3 className="w-3.5 h-3.5" />
      <span>
        {summaryStatus.traces_with_summaries} / {summaryStatus.traces_with_summaries + summaryStatus.traces_without_summaries} traces summarized
      </span>
      {summaryStatus.last_job && (
        <span className="text-gray-400">
          &middot; Last run: {new Date(summaryStatus.last_job.created_at).toLocaleDateString()}
        </span>
      )}
    </div>

    {/* Active job progress */}
    {activeJob && (activeJob.status === 'pending' || activeJob.status === 'running') && (
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-indigo-900 flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            Summarizing traces...
          </span>
          <span className="text-indigo-700">
            {activeJob.completed}/{activeJob.total} complete
            {activeJob.failed > 0 && <span className="text-red-600 ml-1">({activeJob.failed} failed)</span>}
          </span>
        </div>
        <div className="w-full bg-indigo-200 rounded-full h-1.5">
          <div
            className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${((activeJob.completed + activeJob.failed) / activeJob.total) * 100}%` }}
          />
        </div>
      </div>
    )}

    {/* Completed job result */}
    {activeJob && activeJob.status === 'completed' && (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-green-900 flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
            Summarization complete
          </span>
          <span className="text-green-700">
            {activeJob.completed} succeeded
            {activeJob.failed > 0 && <span className="text-red-600 ml-1">, {activeJob.failed} failed</span>}
          </span>
        </div>

        {/* Failed traces detail */}
        {activeJob.failed > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-xs font-medium text-red-700">Failed traces:</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {activeJob.failed_traces.map((ft: { trace_id: string; error: string }) => (
                <div key={ft.trace_id} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                  <span className="font-mono">{ft.trace_id.slice(0, 12)}...</span>: {ft.error}
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs mt-1"
              onClick={() => handleResummarize('failed')}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry failed traces
            </Button>
          </div>
        )}
      </div>
    )}

    {/* Re-summarize controls */}
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={!!(activeJob && (activeJob.status === 'pending' || activeJob.status === 'running'))}
        onClick={() => setShowConfirmDialog(true)}
      >
        <RefreshCw className="w-3.5 h-3.5 mr-2" />
        Re-summarize
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Add confirmation dialog and handler**

```tsx
const handleResummarize = async (mode: 'all' | 'unsummarized' | 'failed') => {
  try {
    const result = await resummarize.mutateAsync({ mode });
    if (result.job_id) {
      setActiveJobId(result.job_id);
      toast.success(result.message);
    } else {
      toast.info(result.message);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start summarization';
    toast.error(message);
  }
  setShowConfirmDialog(false);
};

// Confirmation dialog JSX (inside the return, at the end of CardContent):
{showConfirmDialog && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-sm mx-4 space-y-4">
      <h3 className="font-semibold text-gray-900">Re-summarize Traces</h3>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name="mode"
            checked={resummarizeMode === 'unsummarized'}
            onChange={() => setResummarizeMode('unsummarized')}
          />
          Only unsummarized traces
          {summaryStatus && (
            <span className="text-gray-400">({summaryStatus.traces_without_summaries})</span>
          )}
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name="mode"
            checked={resummarizeMode === 'all'}
            onChange={() => setResummarizeMode('all')}
          />
          All traces (overwrites existing summaries)
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => setShowConfirmDialog(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => handleResummarize(resummarizeMode)}>
          Start
        </Button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Add missing imports**

Add to imports:
```typescript
import { CheckCircle, RefreshCw, BarChart3 } from 'lucide-react';
import { useSummarizationJob, useSummarizationStatus, useResummarize } from '../hooks/useWorkshopApi';
```

- [ ] **Step 5: Verify component renders**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add client/src/components/SummarizationSettings.tsx
git commit -m "feat(summarization): add progress UI and re-summarize controls to SummarizationSettings"
```

---

## Task 7: FacilitatorDashboard — Summary Indicators

**Spec criteria:** SC-IND-1, SC-IND-2
**Files:**
- Modify: `client/src/components/FacilitatorDashboard.tsx`

- [ ] **Step 1: Add summary indicator to trace list items**

In the FacilitatorDashboard Traces tab (around line 1014), where the review count and reviewer count badges are rendered, add a summary badge. The trace data comes from `traceCoverageDetails` which is computed from the traces. We need to cross-reference with the actual trace data to check for `summary`.

First, build a Set of trace IDs that have summaries from the all-traces query:

```typescript
const tracesWithSummaries = useMemo(() => {
  if (!allTraces) return new Set<string>();
  return new Set(
    allTraces
      .filter((t: { id: string; summary: unknown }) => t.summary)
      .map((t: { id: string }) => t.id)
  );
}, [allTraces]);
```

- [ ] **Step 2: Add per-trace badge**

In the trace item badges section (after the reviewer count badge), add:

```tsx
{tracesWithSummaries.has(trace.traceId) ? (
  <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">
    <Sparkles className="w-3 h-3 mr-1" />
    Summarized
  </Badge>
) : (
  <Badge variant="outline" className="text-gray-400 border-gray-200">
    No summary
  </Badge>
)}
```

- [ ] **Step 3: Add aggregate count to tab header**

In the Traces tab header (around line 996), add a second badge showing summary coverage:

```tsx
<div className="flex items-center gap-2 mb-4">
  <FileText className="h-4 w-4 text-purple-600" />
  <h3 className="text-sm font-semibold">Trace Review Status</h3>
  <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200">
    {traceCoverageDetails.length}
  </Badge>
  {tracesWithSummaries.size > 0 && (
    <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 border-indigo-200">
      <Sparkles className="w-3 h-3 mr-1" />
      {tracesWithSummaries.size}/{traceCoverageDetails.length} summarized
    </Badge>
  )}
</div>
```

- [ ] **Step 4: Add Sparkles import**

```typescript
import { Sparkles } from 'lucide-react';
```

- [ ] **Step 5: Verify**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add client/src/components/FacilitatorDashboard.tsx
git commit -m "feat(summarization): add summary indicator badges to facilitator trace list"
```

---

## Task 8 (Final): Lint and Verify Spec Coverage

- [ ] **Step 1: Run frontend linting**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 2: Run backend tests**

Run: `just test-server -k summarization -v`
Expected: All tests PASS

- [ ] **Step 3: Run frontend unit tests**

Run: `just ui-test-unit`
Expected: No regressions

- [ ] **Step 4: Verify the migration applies cleanly on a fresh database**

Run: `just db-upgrade`
Expected: All migrations apply, including 0018_add_summarization_jobs

- [ ] **Step 5: Register TRACE_SUMMARIZATION_SPEC in spec coverage**

If not already registered, add TRACE_SUMMARIZATION_SPEC to the coverage analyzer configuration so `just spec-coverage` tracks it.

- [ ] **Step 6: Run spec coverage**

Run: `just spec-coverage --specs TRACE_SUMMARIZATION_SPEC`
Expected: Coverage reported for the new success criteria

- [ ] **Step 7: Update implementation log**

Update the spec's Implementation Log entry status from `planned` to `complete`, and add a new row for this plan.
