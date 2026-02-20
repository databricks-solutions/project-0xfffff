"""Tests for POST /workshops/{id}/re-evaluate endpoint.

Spec: JUDGE_EVALUATION_SPEC (Re-Evaluation section, lines 251-310)

Key requirements:
- Re-evaluation uses tag_type='eval' to evaluate the same trace set (line 310)
- Traces must be tagged before searching (line 307: eval tag applied when annotation starts)
- Re-evaluate endpoint must ensure traces are tagged even if annotation sync overwrote the label
"""

import threading
import time
from datetime import datetime
from unittest.mock import MagicMock, patch, call

import pytest

from server.models import Rubric, Trace, Workshop, WorkshopPhase, WorkshopStatus


def _make_workshop(**overrides):
    defaults = dict(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.ANNOTATION,
        completed_phases=[],
        discovery_started=True,
        annotation_started=True,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=["t1", "t2", "t3"],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )
    defaults.update(overrides)
    return Workshop(**defaults)


def _make_traces(count=3):
    return [
        Trace(
            id=f"t{i+1}",
            workshop_id="w1",
            input=f"Question {i+1}",
            output=f"Answer {i+1}",
            created_at=datetime.now(),
            mlflow_trace_id=f"mlflow-t{i+1}",
        )
        for i in range(count)
    ]


class FakeDatabaseService:
    """Fake DB service that tracks calls to tag_traces_for_evaluation."""

    def __init__(self, db, workshop=None, traces=None):
        self.db = db
        self._workshop = workshop or _make_workshop()
        self._traces = traces or _make_traces()
        self.tag_calls = []  # Track all tag_traces_for_evaluation calls

    def get_workshop(self, workshop_id):
        return self._workshop

    def get_traces(self, workshop_id):
        return self._traces

    def get_rubric(self, workshop_id):
        return Rubric(
            id="r1",
            workshop_id=workshop_id,
            question="Accuracy: Is the response correct?",
            created_by="fac",
            created_at=datetime.now(),
            judge_type="likert",
            binary_labels=None,
            rating_scale=5,
        )

    def get_mlflow_config(self, workshop_id):
        config = MagicMock()
        config.experiment_id = "exp-123"
        config.databricks_host = "https://test.databricks.com"
        return config

    def get_auto_evaluation_prompt(self, workshop_id):
        return "Evaluate the response for accuracy on a 1-5 scale."

    def get_auto_evaluation_model(self, workshop_id):
        return "databricks-claude-opus-4-5"

    def derive_judge_prompt_from_rubric(self, workshop_id, question_index=0):
        return "Evaluate the response for accuracy on a 1-5 scale."

    def _parse_rubric_questions(self, question):
        return [{"judge_type": "likert", "title": "Accuracy"}]

    def get_judge_prompts(self, workshop_id):
        return []

    def get_databricks_token(self, workshop_id):
        return "test-token"

    def update_auto_evaluation_job(self, workshop_id, job_id, prompt):
        pass

    def tag_traces_for_evaluation(self, workshop_id, trace_ids, tag_type='eval'):
        self.tag_calls.append({
            "workshop_id": workshop_id,
            "trace_ids": trace_ids,
            "tag_type": tag_type,
        })
        return {"tagged": len(trace_ids), "failed": []}


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_re_evaluate_tags_traces_before_evaluation(async_client, override_get_db, monkeypatch):
    """Re-evaluate endpoint must tag traces with 'eval' label before running evaluation.

    Spec: JUDGE_EVALUATION_SPEC line 310
    - Re-evaluation uses tag_type='eval' to evaluate the same trace set.
    - If traces were previously tagged 'align' by annotation sync, the 'eval' tag
      must be re-applied before searching.

    This test verifies that POST /re-evaluate calls tag_traces_for_evaluation
    BEFORE starting the background evaluation thread.
    """
    import server.routers.workshops as workshops_router

    fake_db = FakeDatabaseService(None)
    monkeypatch.setattr(workshops_router, "DatabaseService", lambda db: fake_db)

    mock_token_storage = MagicMock()
    mock_token_storage.get_token.return_value = "test-token"

    with patch("server.routers.workshops.create_job") as mock_create_job, \
         patch("server.services.token_storage_service.token_storage", mock_token_storage):
        mock_job = MagicMock()
        mock_create_job.return_value = mock_job

        resp = await async_client.post(
            "/workshops/w1/re-evaluate",
            json={
                "judge_name": "accuracy_judge",
                "judge_type": "likert",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body.get("job_id") is not None

    # CRITICAL: tag_traces_for_evaluation must have been called with tag_type='eval'
    # before the background thread starts searching for tagged traces
    assert len(fake_db.tag_calls) > 0, (
        "re-evaluate endpoint must call tag_traces_for_evaluation to ensure "
        "traces have the 'eval' label before searching. Currently it skips "
        "tagging, which causes 'No MLflow traces found with label eval' errors "
        "when annotation sync has overwritten the label to 'align'."
    )
    tag_call = fake_db.tag_calls[0]
    assert tag_call["tag_type"] == "eval"
    assert set(tag_call["trace_ids"]) == {"t1", "t2", "t3"}


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_re_evaluate_tags_traces_fallback_when_no_active_annotation_ids(
    async_client, override_get_db, monkeypatch
):
    """Re-evaluate falls back to all traces with MLflow IDs when active_annotation_trace_ids is empty.

    Spec: JUDGE_EVALUATION_SPEC line 310
    """
    import server.routers.workshops as workshops_router

    workshop = _make_workshop(active_annotation_trace_ids=[])
    fake_db = FakeDatabaseService(None, workshop=workshop)
    monkeypatch.setattr(workshops_router, "DatabaseService", lambda db: fake_db)

    mock_token_storage = MagicMock()
    mock_token_storage.get_token.return_value = "test-token"

    with patch("server.routers.workshops.create_job") as mock_create_job, \
         patch("server.services.token_storage_service.token_storage", mock_token_storage):
        mock_job = MagicMock()
        mock_create_job.return_value = mock_job

        resp = await async_client.post(
            "/workshops/w1/re-evaluate",
            json={},
        )

    assert resp.status_code == 200

    # Should fall back to tagging all traces that have mlflow_trace_ids
    assert len(fake_db.tag_calls) > 0, (
        "When active_annotation_trace_ids is empty, re-evaluate should fall back "
        "to tagging all traces with MLflow IDs."
    )
    tag_call = fake_db.tag_calls[0]
    assert tag_call["tag_type"] == "eval"
    # All 3 traces have mlflow_trace_id set
    assert len(tag_call["trace_ids"]) == 3
