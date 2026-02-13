"""Tests for POST /workshops/{id}/begin-annotation auto-evaluation functionality.

Spec: JUDGE_EVALUATION_SPEC (Auto-Evaluation section, lines 150-248)
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from server.models import Rubric, Trace, Workshop, WorkshopPhase, WorkshopStatus


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Auto-evaluation runs in background when annotation phase starts")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_begin_annotation_with_auto_eval_enabled(async_client, override_get_db, monkeypatch):
    """Auto-evaluation starts when model is provided.

    Spec: JUDGE_EVALUATION_SPEC lines 158-169
    - POST with evaluation_model_name should start background evaluation
    - Return auto_evaluation_started=True
    """
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=True,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )

    rubric = Rubric(
        id="r1",
        workshop_id="w1",
        question="Accuracy: Is the response correct?",
        created_by="fac",
        created_at=datetime.now(),
        judge_type="likert",
        binary_labels=None,
        rating_scale=5,
    )

    traces = [
        Trace(
            id="t1",
            workshop_id="w1",
            input="What is the answer?",
            output="The answer is test.",
            created_at=datetime.now(),
            mlflow_trace_id="mlflow-t1",
        ),
        Trace(
            id="t2",
            workshop_id="w1",
            input="What is the answer 2?",
            output="The answer is test2.",
            created_at=datetime.now(),
            mlflow_trace_id="mlflow-t2",
        ),
    ]

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db
            self.auto_eval_updated = False

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_rubric(self, workshop_id: str):
            return rubric

        def get_traces(self, workshop_id: str):
            return traces

        def update_active_annotation_traces(self, workshop_id, trace_ids):
            pass

        def update_annotation_randomize_setting(self, workshop_id, randomize):
            pass

        def update_workshop_phase(self, workshop_id, phase):
            pass

        def update_phase_started(self, workshop_id, **kwargs):
            pass

        def tag_traces_for_evaluation(self, workshop_id, trace_ids, tag_type):
            return {"tagged": len(trace_ids)}

        def get_mlflow_config(self, workshop_id):
            config = MagicMock()
            config.experiment_id = "exp-123"
            config.databricks_host = "https://test.databricks.com"
            return config

        def derive_judge_prompt_from_rubric(self, workshop_id, question_index=0):
            return "Evaluate the response based on accuracy."

        def update_auto_evaluation_job(self, workshop_id, job_id, prompt, model):
            self.auto_eval_updated = True

        def get_rubric_questions_for_evaluation(self, workshop_id):
            return [{
                'judge_name': 'accuracy_judge',
                'judge_prompt': 'Evaluate accuracy',
                'judge_type': 'likert',
                'title': 'Accuracy',
            }]

        def get_databricks_token(self, workshop_id):
            return "test-token"

    fake_db_service = FakeDatabaseService(None)
    monkeypatch.setattr(workshops_router, "DatabaseService", lambda db: fake_db_service)

    # Mock token storage
    mock_token_storage = MagicMock()
    mock_token_storage.get_token.return_value = "test-token"

    with patch("server.routers.workshops.create_job") as mock_create_job, \
         patch("server.services.token_storage_service.token_storage", mock_token_storage):
        mock_job = MagicMock()
        mock_create_job.return_value = mock_job

        resp = await async_client.post(
            "/workshops/w1/begin-annotation",
            json={
                "trace_limit": 10,
                "randomize": False,
                "evaluation_model_name": "databricks-meta-llama-3-3-70b-instruct",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body.get("auto_evaluation_started") is True or body.get("auto_eval_job_id") is not None
    assert "traces_used" in body


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Auto-evaluation runs in background when annotation phase starts")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_begin_annotation_with_auto_eval_disabled(async_client, override_get_db, monkeypatch):
    """Auto-evaluation skipped when model is null.

    Spec: JUDGE_EVALUATION_SPEC lines 219-226
    - POST with evaluation_model_name=null should NOT start auto-evaluation
    - Return auto_evaluation_started=False
    """
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=True,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )

    rubric = Rubric(
        id="r1",
        workshop_id="w1",
        question="Accuracy: Is the response correct?",
        created_by="fac",
        created_at=datetime.now(),
        judge_type="likert",
        binary_labels=None,
        rating_scale=5,
    )

    traces = [
        Trace(
            id="t1",
            workshop_id="w1",
            input="What is the answer?",
            output="The answer is test.",
            created_at=datetime.now(),
            mlflow_trace_id="mlflow-t1",
        ),
    ]

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db
            self.auto_eval_updated = False

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_rubric(self, workshop_id: str):
            return rubric

        def get_traces(self, workshop_id: str):
            return traces

        def update_active_annotation_traces(self, workshop_id, trace_ids):
            pass

        def update_annotation_randomize_setting(self, workshop_id, randomize):
            pass

        def update_workshop_phase(self, workshop_id, phase):
            pass

        def update_phase_started(self, workshop_id, **kwargs):
            pass

        def get_mlflow_config(self, workshop_id):
            return None  # No MLflow config

        def update_auto_evaluation_job(self, workshop_id, job_id, prompt, model):
            self.auto_eval_updated = True

    fake_db_service = FakeDatabaseService(None)
    monkeypatch.setattr(workshops_router, "DatabaseService", lambda db: fake_db_service)

    resp = await async_client.post(
        "/workshops/w1/begin-annotation",
        json={
            "trace_limit": 10,
            "randomize": False,
            "evaluation_model_name": None,  # Explicitly disabled
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    # Auto-eval should not have started
    assert body.get("auto_evaluation_started") is False or body.get("auto_eval_job_id") is None
    # But annotation phase should still proceed
    assert "traces_used" in body
    assert not fake_db_service.auto_eval_updated


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_begin_annotation_requires_rubric(async_client, override_get_db, monkeypatch):
    """Cannot start annotation without a rubric.

    Spec: JUDGE_EVALUATION_SPEC lines 255-261
    - Rubric is required before starting annotation phase
    """
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=True,
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
            return workshop

        def get_rubric(self, workshop_id: str):
            return None  # No rubric

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post(
        "/workshops/w1/begin-annotation",
        json={"trace_limit": 10},
    )

    assert resp.status_code == 400
    assert "rubric" in resp.json()["detail"].lower()
