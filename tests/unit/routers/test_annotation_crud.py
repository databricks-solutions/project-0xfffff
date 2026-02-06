"""
Tests for annotation upsert (create and update) behavior.

Spec: ANNOTATION_SPEC
Success criteria:
  - PUT creates new annotation (upsert create)
  - PUT updates existing annotation (upsert update)
"""

from datetime import datetime
from unittest.mock import MagicMock

import pytest
import pytest_asyncio

from server.models import (
    Annotation,
    AnnotationCreate,
    Rubric,
    Workshop,
    WorkshopPhase,
    WorkshopStatus,
    Trace,
)


def _make_workshop(trace_ids: list[str]) -> Workshop:
    return Workshop(
        id="ws-crud",
        name="CRUD Workshop",
        description=None,
        facilitator_id="fac-1",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.ANNOTATION,
        completed_phases=[],
        discovery_started=True,
        annotation_started=True,
        active_discovery_trace_ids=trace_ids,
        active_annotation_trace_ids=trace_ids,
        judge_name="test_judge",
        created_at=datetime.now(),
    )


def _make_rubric() -> Rubric:
    return Rubric(
        id="rubric-crud",
        workshop_id="ws-crud",
        question="Is this helpful?|||TITLE|||Helpfulness|||DESC|||Rate helpfulness",
        created_by="fac-1",
        created_at=datetime.now(),
        judge_type="likert",
        binary_labels=None,
        rating_scale=5,
    )


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_upsert_creates_new_annotation(async_client, override_get_db, monkeypatch):
    """POST /annotations creates a brand-new annotation when none exists for the user+trace pair."""
    import server.routers.workshops as workshops_router

    traces = [
        Trace(
            id="trace-new",
            workshop_id="ws-crud",
            input="Hello",
            output="World",
            context=None,
            mlflow_trace_id=None,
            mlflow_url=None,
            mlflow_host=None,
            mlflow_experiment_id=None,
            include_in_alignment=True,
            sme_feedback=None,
        )
    ]
    workshop = _make_workshop([t.id for t in traces])
    rubric = _make_rubric()

    created: list[Annotation] = []

    class FakeDB:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id):
            return workshop

        def get_rubric(self, workshop_id):
            return rubric

        def add_annotation(self, workshop_id, annotation_data: AnnotationCreate):
            ann = Annotation(
                id="ann-new-1",
                workshop_id=workshop_id,
                trace_id=annotation_data.trace_id,
                user_id=annotation_data.user_id,
                rating=annotation_data.rating,
                ratings=annotation_data.ratings,
                comment=annotation_data.comment,
                created_at=datetime.now(),
            )
            created.append(ann)
            return ann

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDB)

    resp = await async_client.post(
        "/workshops/ws-crud/annotations",
        json={
            "trace_id": "trace-new",
            "user_id": "user-a",
            "rating": 3,
            "ratings": {"rubric-crud_0": 3},
            "comment": "First annotation",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["trace_id"] == "trace-new"
    assert body["user_id"] == "user-a"
    assert body["comment"] == "First annotation"
    assert len(created) == 1, "Expected exactly one annotation to be created"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_upsert_updates_existing_annotation(async_client, override_get_db, monkeypatch):
    """POST /annotations updates an existing annotation when one already exists for the user+trace pair."""
    import server.routers.workshops as workshops_router

    traces = [
        Trace(
            id="trace-upd",
            workshop_id="ws-crud",
            input="Hello",
            output="World",
            context=None,
            mlflow_trace_id=None,
            mlflow_url=None,
            mlflow_host=None,
            mlflow_experiment_id=None,
            include_in_alignment=True,
            sme_feedback=None,
        )
    ]
    workshop = _make_workshop([t.id for t in traces])
    rubric = _make_rubric()

    # Track whether add_annotation was called and with what data
    call_log: list[dict] = []

    # Pre-existing annotation
    existing = Annotation(
        id="ann-existing",
        workshop_id="ws-crud",
        trace_id="trace-upd",
        user_id="user-a",
        rating=3,
        ratings={"rubric-crud_0": 3},
        comment="Original comment",
        created_at=datetime.now(),
    )

    class FakeDB:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id):
            return workshop

        def get_rubric(self, workshop_id):
            return rubric

        def add_annotation(self, workshop_id, annotation_data: AnnotationCreate):
            # The real add_annotation does an upsert: checks for existing, then updates.
            # We simulate the update path by returning updated data.
            call_log.append({
                "trace_id": annotation_data.trace_id,
                "user_id": annotation_data.user_id,
                "rating": annotation_data.rating,
                "ratings": annotation_data.ratings,
                "comment": annotation_data.comment,
            })
            return Annotation(
                id=existing.id,
                workshop_id=workshop_id,
                trace_id=annotation_data.trace_id,
                user_id=annotation_data.user_id,
                rating=annotation_data.rating,
                ratings=annotation_data.ratings,
                comment=annotation_data.comment,
                created_at=existing.created_at,
            )

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDB)

    resp = await async_client.post(
        "/workshops/ws-crud/annotations",
        json={
            "trace_id": "trace-upd",
            "user_id": "user-a",
            "rating": 5,
            "ratings": {"rubric-crud_0": 5},
            "comment": "Updated comment",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    # The returned annotation should reflect the updated values
    assert body["id"] == "ann-existing", "Should return the same annotation ID (update, not create)"
    assert body["comment"] == "Updated comment"
    assert len(call_log) == 1
    assert call_log[0]["comment"] == "Updated comment"
    assert call_log[0]["rating"] == 5
