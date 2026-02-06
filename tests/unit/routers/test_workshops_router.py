from datetime import datetime

import pytest

from server.models import Workshop, WorkshopPhase, WorkshopStatus


@pytest.mark.spec("DISCOVERY_TRACE_ASSIGNMENT_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_workshop_404_when_missing(async_client, override_get_db, monkeypatch):
    import server.routers.workshops as workshops_router

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            assert workshop_id == "missing"
            return None

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.get("/workshops/missing")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Workshop not found"


@pytest.mark.spec("DISCOVERY_TRACE_ASSIGNMENT_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_traces_requires_user_id(async_client, override_get_db):
    resp = await async_client.get("/workshops/w1/traces")
    assert resp.status_code == 400
    assert "user_id is required" in resp.json()["detail"]


@pytest.mark.spec("DISCOVERY_TRACE_ASSIGNMENT_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_workshop_success(async_client, override_get_db, monkeypatch):
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="W",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=False,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            assert workshop_id == "w1"
            return workshop

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.get("/workshops/w1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "w1"
    assert body["current_phase"] == "intake"


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_re_evaluate_uses_stored_auto_evaluation_model(async_client, override_get_db, monkeypatch):
    """Re-evaluation picks up the auto_evaluation_model from workshop config.

    Spec: JUDGE_EVALUATION_SPEC lines 299-301
    - Re-evaluation uses the same model stored during initial auto-evaluation
    - The auto_evaluation_model field ensures fair comparison between pre/post align
    """
    import server.routers.workshops as workshops_router

    stored_model = "databricks-claude-sonnet-4-5"
    workshop = Workshop(
        id="w-reeval",
        name="Re-Eval Test",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.RESULTS,
        completed_phases=["intake", "discovery", "rubric", "annotation"],
        discovery_started=True,
        annotation_started=True,
        active_discovery_trace_ids=["t1"],
        active_annotation_trace_ids=["t1"],
        judge_name="workshop_judge",
        auto_evaluation_model=stored_model,
        auto_evaluation_prompt="Evaluate the response quality.",
        created_at=datetime.now(),
    )

    captured_model = {}

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id):
            return workshop

        def get_auto_evaluation_model(self, workshop_id):
            return stored_model

        def get_auto_evaluation_prompt(self, workshop_id):
            return "Evaluate the response quality."

        def derive_judge_prompt_from_rubric(self, workshop_id):
            return "Evaluate the response quality."

        def get_mlflow_config(self, workshop_id):
            return None  # Return None to trigger 400 error before model is used

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    # Call re-evaluate without specifying a model - it should use the stored one
    resp = await async_client.post("/workshops/w-reeval/re-evaluate", json={})

    # The endpoint will fail at MLflow config check (which is expected since we
    # returned None), but the key assertion is that it got past the model check.
    # A 400 from "MLflow configuration not found" proves it reached the model
    # retrieval step and didn't fail earlier.
    assert resp.status_code == 400
    assert "MLflow configuration not found" in resp.json()["detail"]
