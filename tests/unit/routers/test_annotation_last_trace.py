"""
Test for bug: Last trace annotation cannot be saved

Bug report: Multiple annotators labeling 10 traces report that the last one
cannot be saved. Facilitator sees 9/10 completed.

This test verifies that all 10 annotations can be saved correctly via the API.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch
import pytest

from server.models import (
    Workshop,
    WorkshopPhase,
    WorkshopStatus,
    Trace,
    Rubric,
    Annotation,
    AnnotationCreate,
)


def create_test_workshop(trace_ids: list[str]) -> Workshop:
    """Create a test workshop in annotation phase with specified traces."""
    return Workshop(
        id="test-workshop",
        name="Test Workshop",
        description=None,
        facilitator_id="facilitator-1",
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


def create_test_traces(count: int) -> list[Trace]:
    """Create a list of test traces."""
    return [
        Trace(
            id=f"trace-{i}",
            workshop_id="test-workshop",
            input=f"Test input {i}",
            output=f"Test output {i}",
            context=None,
            mlflow_trace_id=None,
            mlflow_url=None,
            mlflow_host=None,
            mlflow_experiment_id=None,
            include_in_alignment=True,
            sme_feedback=None,
        )
        for i in range(count)
    ]


def create_test_rubric() -> Rubric:
    """Create a test rubric with a likert question."""
    return Rubric(
        id="test-rubric",
        workshop_id="test-workshop",
        question="How helpful is this response?|||TITLE|||Helpfulness|||DESC|||Rate how helpful the response is",
        created_by="facilitator-1",
        created_at=datetime.now(),
        judge_type="likert",
        binary_labels=None,
        rating_scale=5,
    )


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_all_10_annotations_can_be_saved(async_client, override_get_db, monkeypatch):
    """Test that all 10 annotations can be saved for a single user."""
    import server.routers.workshops as workshops_router

    traces = create_test_traces(10)
    trace_ids = [t.id for t in traces]
    workshop = create_test_workshop(trace_ids)
    rubric = create_test_rubric()

    saved_annotations: list[Annotation] = []
    annotation_counter = 0

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_rubric(self, workshop_id: str):
            return rubric

        def add_annotation(self, workshop_id: str, annotation_data: AnnotationCreate) -> Annotation:
            nonlocal annotation_counter
            annotation_counter += 1
            annotation = Annotation(
                id=f"annotation-{annotation_counter}",
                workshop_id=workshop_id,
                trace_id=annotation_data.trace_id,
                user_id=annotation_data.user_id,
                rating=annotation_data.rating,
                ratings=annotation_data.ratings,
                comment=annotation_data.comment,
                created_at=datetime.now(),
            )
            saved_annotations.append(annotation)
            return annotation

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    # Submit annotations for all 10 traces
    user_id = "sme-1"
    for i, trace in enumerate(traces):
        resp = await async_client.post(
            "/workshops/test-workshop/annotations",
            json={
                "trace_id": trace.id,
                "user_id": user_id,
                "rating": 4,
                "ratings": {"test-rubric_0": 4},
                "comment": f"Annotation for trace {i + 1}",
            },
        )
        assert resp.status_code == 200, f"Failed to save annotation {i + 1}: {resp.json()}"

    # Verify all 10 annotations were saved
    assert len(saved_annotations) == 10, f"Expected 10 annotations, got {len(saved_annotations)}"

    # Verify each trace has an annotation
    saved_trace_ids = {a.trace_id for a in saved_annotations}
    assert saved_trace_ids == set(trace_ids), "Not all traces have annotations"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_10th_annotation_specifically(async_client, override_get_db, monkeypatch):
    """Test that the 10th annotation specifically can be saved after 9 are already saved."""
    import server.routers.workshops as workshops_router

    traces = create_test_traces(10)
    trace_ids = [t.id for t in traces]
    workshop = create_test_workshop(trace_ids)
    rubric = create_test_rubric()

    # Pre-existing annotations for traces 0-8 (first 9)
    existing_annotations = [
        Annotation(
            id=f"annotation-{i}",
            workshop_id="test-workshop",
            trace_id=traces[i].id,
            user_id="sme-1",
            rating=4,
            ratings={"test-rubric_0": 4},
            comment=f"Annotation for trace {i + 1}",
            created_at=datetime.now(),
        )
        for i in range(9)
    ]

    saved_annotations = list(existing_annotations)
    annotation_counter = 9

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_rubric(self, workshop_id: str):
            return rubric

        def add_annotation(self, workshop_id: str, annotation_data: AnnotationCreate) -> Annotation:
            nonlocal annotation_counter
            annotation_counter += 1
            annotation = Annotation(
                id=f"annotation-{annotation_counter}",
                workshop_id=workshop_id,
                trace_id=annotation_data.trace_id,
                user_id=annotation_data.user_id,
                rating=annotation_data.rating,
                ratings=annotation_data.ratings,
                comment=annotation_data.comment,
                created_at=datetime.now(),
            )
            saved_annotations.append(annotation)
            return annotation

        def get_annotations(self, workshop_id: str, user_id: str = None):
            if user_id:
                return [a for a in saved_annotations if a.user_id == user_id]
            return saved_annotations

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    # Save the 10th annotation (trace index 9)
    tenth_trace = traces[9]
    resp = await async_client.post(
        "/workshops/test-workshop/annotations",
        json={
            "trace_id": tenth_trace.id,
            "user_id": "sme-1",
            "rating": 4,
            "ratings": {"test-rubric_0": 4},
            "comment": "Annotation for trace 10 (the last one)",
        },
    )

    assert resp.status_code == 200, f"Failed to save 10th annotation: {resp.json()}"

    # Verify all 10 annotations are now saved
    assert len(saved_annotations) == 10, f"Expected 10 annotations, got {len(saved_annotations)}"

    # Verify the 10th trace specifically has an annotation
    tenth_annotation = next((a for a in saved_annotations if a.trace_id == tenth_trace.id), None)
    assert tenth_annotation is not None, "10th trace annotation not found"
    assert tenth_annotation.rating == 4


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_multiple_annotators_can_save_10th_annotation(async_client, override_get_db, monkeypatch):
    """Test that multiple annotators can all save the 10th annotation."""
    import server.routers.workshops as workshops_router

    traces = create_test_traces(10)
    trace_ids = [t.id for t in traces]
    workshop = create_test_workshop(trace_ids)
    rubric = create_test_rubric()

    saved_annotations: list[Annotation] = []
    annotation_counter = 0

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_rubric(self, workshop_id: str):
            return rubric

        def add_annotation(self, workshop_id: str, annotation_data: AnnotationCreate) -> Annotation:
            nonlocal annotation_counter
            annotation_counter += 1
            annotation = Annotation(
                id=f"annotation-{annotation_counter}",
                workshop_id=workshop_id,
                trace_id=annotation_data.trace_id,
                user_id=annotation_data.user_id,
                rating=annotation_data.rating,
                ratings=annotation_data.ratings,
                comment=annotation_data.comment,
                created_at=datetime.now(),
            )
            saved_annotations.append(annotation)
            return annotation

        def get_annotations(self, workshop_id: str, user_id: str = None):
            if user_id:
                return [a for a in saved_annotations if a.user_id == user_id]
            return saved_annotations

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    # Multiple annotators each save all 10 annotations
    annotators = ["sme-1", "sme-2", "sme-3"]
    for annotator in annotators:
        for i, trace in enumerate(traces):
            resp = await async_client.post(
                "/workshops/test-workshop/annotations",
                json={
                    "trace_id": trace.id,
                    "user_id": annotator,
                    "rating": 4,
                    "ratings": {"test-rubric_0": 4},
                    "comment": f"Annotation from {annotator} for trace {i + 1}",
                },
            )
            assert resp.status_code == 200, f"Failed: {annotator} trace {i + 1}: {resp.json()}"

    # Verify total annotations: 3 annotators * 10 traces = 30
    assert len(saved_annotations) == 30, f"Expected 30 annotations, got {len(saved_annotations)}"

    # Verify each annotator has 10 annotations
    for annotator in annotators:
        annotator_annotations = [a for a in saved_annotations if a.user_id == annotator]
        assert len(annotator_annotations) == 10, f"{annotator} has {len(annotator_annotations)} annotations"

    # Verify all 10 traces have annotations from each annotator
    traces_with_annotations = set(a.trace_id for a in saved_annotations)
    assert traces_with_annotations == set(trace_ids), "Not all traces have annotations"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_facilitator_sees_10_completed(async_client, override_get_db, monkeypatch):
    """Test that the facilitator endpoint correctly counts 10/10 traces as annotated."""
    import server.routers.workshops as workshops_router

    traces = create_test_traces(10)
    trace_ids = [t.id for t in traces]
    workshop = create_test_workshop(trace_ids)
    rubric = create_test_rubric()

    # All 10 traces have annotations from at least one user
    annotations = [
        Annotation(
            id=f"annotation-{i}",
            workshop_id="test-workshop",
            trace_id=traces[i].id,
            user_id="sme-1",
            rating=4,
            ratings={"test-rubric_0": 4},
            comment=f"Annotation for trace {i + 1}",
            created_at=datetime.now(),
        )
        for i in range(10)
    ]

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_annotations(self, workshop_id: str, user_id: str = None):
            if user_id:
                return [a for a in annotations if a.user_id == user_id]
            return annotations

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    # Facilitator fetches all annotations (no user_id filter)
    resp = await async_client.get("/workshops/test-workshop/annotations")
    assert resp.status_code == 200

    result = resp.json()
    assert len(result) == 10, f"Expected 10 annotations, got {len(result)}"

    # Calculate unique trace_ids (what the facilitator dashboard does)
    traces_with_annotations = set(a["trace_id"] for a in result)
    assert len(traces_with_annotations) == 10, f"Expected 10 unique traces, got {len(traces_with_annotations)}"
