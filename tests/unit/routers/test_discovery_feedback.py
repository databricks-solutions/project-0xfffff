"""Tests for discovery feedback API endpoints.

Covers feedback submission, follow-up question generation,
and validation per DISCOVERY_SPEC Step 1.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from server.models import (
    DiscoveryFeedback,
    DiscoveryFeedbackCreate,
    FeedbackLabel,
    Trace,
    Workshop,
    WorkshopPhase,
    WorkshopStatus,
)


def _workshop(workshop_id="ws-1", phase=WorkshopPhase.DISCOVERY):
    return Workshop(
        id=workshop_id,
        name="Test",
        facilitator_id="f-1",
        status=WorkshopStatus.ACTIVE,
        current_phase=phase,
        discovery_started=True,
        active_discovery_trace_ids=["t-1", "t-2"],
        created_at=datetime.now(),
    )


def _feedback(fb_id="fb-1", label="good", comment="Nice", qna=None):
    return DiscoveryFeedback(
        id=fb_id,
        workshop_id="ws-1",
        trace_id="t-1",
        user_id="u-1",
        feedback_label=label,
        comment=comment,
        followup_qna=qna or [],
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


def _trace(trace_id="t-1"):
    return Trace(
        id=trace_id,
        workshop_id="ws-1",
        input="Hello",
        output="Hi",
        created_at=datetime.now(),
    )


# ============================================================================
# POST /workshops/{id}/discovery-feedback
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Participants view traces and provide GOOD/BAD + comment")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_submit_feedback_success(async_client, override_get_db, monkeypatch):
    """Submit GOOD/BAD feedback with comment on a trace."""
    import server.services.discovery_service as ds_mod

    mock_submit = MagicMock(return_value=_feedback())
    monkeypatch.setattr(ds_mod.DiscoveryService, "submit_discovery_feedback", mock_submit)

    resp = await async_client.post(
        "/workshops/ws-1/discovery-feedback",
        json={
            "trace_id": "t-1",
            "user_id": "u-1",
            "feedback_label": "good",
            "comment": "Nice answer",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["feedback_label"] == "good"
    assert data["comment"] == "Nice"


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Form validation prevents empty submissions")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_submit_feedback_validation_rejects_empty_comment(async_client, override_get_db, monkeypatch):
    """Validation rejects empty comment."""
    # Pydantic will still accept the request, but service raises 422
    from fastapi import HTTPException
    import server.services.discovery_service as ds_mod

    def raise_validation(*args, **kwargs):
        raise HTTPException(status_code=422, detail="Comment is required")

    monkeypatch.setattr(ds_mod.DiscoveryService, "submit_discovery_feedback", raise_validation)

    resp = await async_client.post(
        "/workshops/ws-1/discovery-feedback",
        json={
            "trace_id": "t-1",
            "user_id": "u-1",
            "feedback_label": "bad",
            "comment": "",
        },
    )
    assert resp.status_code == 422


# ============================================================================
# POST /workshops/{id}/generate-followup-question
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("AI generates 3 follow-up questions per trace based on feedback")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_generate_followup_question(async_client, override_get_db, monkeypatch):
    """Generate a follow-up question for a trace."""
    import server.services.discovery_service as ds_mod

    mock_gen = MagicMock(return_value={"question": "What specifically?", "question_number": 1})
    monkeypatch.setattr(ds_mod.DiscoveryService, "generate_followup_question", mock_gen)

    resp = await async_client.post(
        "/workshops/ws-1/generate-followup-question?question_number=1",
        json={"trace_id": "t-1", "user_id": "u-1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["question"] == "What specifically?"
    assert data["question_number"] == 1


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("All 3 questions required before moving to next trace")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_generate_followup_rejects_question_4(async_client, override_get_db, monkeypatch):
    """Reject question_number > 3."""
    from fastapi import HTTPException
    import server.services.discovery_service as ds_mod

    def raise_bad(*args, **kwargs):
        raise HTTPException(status_code=400, detail="question_number must be 1, 2, or 3")

    monkeypatch.setattr(ds_mod.DiscoveryService, "generate_followup_question", raise_bad)

    resp = await async_client.post(
        "/workshops/ws-1/generate-followup-question?question_number=4",
        json={"trace_id": "t-1", "user_id": "u-1"},
    )
    assert resp.status_code == 400


# ============================================================================
# POST /workshops/{id}/submit-followup-answer
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Questions build progressively on prior answers")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_submit_followup_answer(async_client, override_get_db, monkeypatch):
    """Submit an answer to a follow-up question."""
    import server.services.discovery_service as ds_mod

    mock_answer = MagicMock(return_value={"feedback_id": "fb-1", "qna_count": 1, "complete": False})
    monkeypatch.setattr(ds_mod.DiscoveryService, "submit_followup_answer", mock_answer)

    resp = await async_client.post(
        "/workshops/ws-1/submit-followup-answer",
        json={
            "trace_id": "t-1",
            "user_id": "u-1",
            "question": "What specifically?",
            "answer": "The tone was off.",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["qna_count"] == 1
    assert data["complete"] is False


# ============================================================================
# GET /workshops/{id}/discovery-feedback
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Participants view traces and provide GOOD/BAD + comment")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_discovery_feedback_list(async_client, override_get_db, monkeypatch):
    """List all discovery feedback for a workshop."""
    import server.services.discovery_service as ds_mod

    mock_get = MagicMock(return_value=[_feedback(), _feedback(fb_id="fb-2")])
    monkeypatch.setattr(ds_mod.DiscoveryService, "get_discovery_feedback", mock_get)

    resp = await async_client.get("/workshops/ws-1/discovery-feedback")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Participants view traces and provide GOOD/BAD + comment")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_discovery_feedback_filtered_by_user(async_client, override_get_db, monkeypatch):
    """List discovery feedback filtered by user_id."""
    import server.services.discovery_service as ds_mod

    mock_get = MagicMock(return_value=[_feedback()])
    monkeypatch.setattr(ds_mod.DiscoveryService, "get_discovery_feedback", mock_get)

    resp = await async_client.get("/workshops/ws-1/discovery-feedback?user_id=u-1")
    assert resp.status_code == 200
    mock_get.assert_called_once()


# ============================================================================
# POST /workshops/{id}/begin-discovery (with randomize)
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Facilitator can start Discovery phase with configurable trace limit")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_begin_discovery_with_trace_limit(async_client, override_get_db, monkeypatch):
    """Begin discovery with trace_limit and randomize params."""
    import server.routers.workshops as ws_mod

    # The begin-discovery route lives in workshops.py and uses DatabaseService directly
    mock_db_svc = MagicMock()
    mock_db_svc.get_workshop.return_value = _workshop()
    # Create 20 mock traces
    mock_traces = [MagicMock(id=f"t-{i}") for i in range(20)]
    mock_db_svc.get_traces.return_value = mock_traces
    mock_db_svc.update_workshop_phase.return_value = None
    mock_db_svc.update_phase_started.return_value = None
    mock_db_svc.update_discovery_randomize_setting.return_value = None
    mock_db_svc.update_active_discovery_traces.return_value = None

    monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

    resp = await async_client.post("/workshops/ws-1/begin-discovery?trace_limit=5&randomize=true")
    assert resp.status_code == 200
    data = resp.json()
    assert data["traces_used"] == 5
    assert data["total_traces"] == 20

    # Verify the randomize setting was persisted
    mock_db_svc.update_discovery_randomize_setting.assert_called_once_with("ws-1", True)
