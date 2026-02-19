"""Tests for discovery feedback service logic.

Exercises real DiscoveryService logic with in-memory SQLite instead of
mocking the entire service layer. Only the LLM call boundary is mocked.
"""

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import Base, TraceDB, UserDB, WorkshopDB, WorkshopParticipantDB
from server.models import (
    DiscoveryFeedbackCreate,
    FeedbackLabel,
)
from server.services.discovery_service import DiscoveryService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def test_db():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def discovery_service(test_db):
    return DiscoveryService(test_db)


@pytest.fixture
def workshop_with_traces(test_db):
    """Create a real workshop + trace records."""
    ws = WorkshopDB(
        id="ws-1",
        name="Test Workshop",
        facilitator_id="f-1",
        active_discovery_trace_ids=["t-1", "t-2"],
        discovery_started=True,
        current_phase="discovery",
        discovery_questions_model_name="demo",
    )
    t1 = TraceDB(id="t-1", workshop_id="ws-1", input="What is AI?", output="AI is...")
    t2 = TraceDB(id="t-2", workshop_id="ws-1", input="What is ML?", output="ML is...")
    test_db.add_all([ws, t1, t2])
    test_db.commit()
    return ws


# ============================================================================
# POST /workshops/{id}/discovery-feedback — submit_discovery_feedback
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Participants view traces and provide GOOD/BAD + comment")
@pytest.mark.unit
def test_submit_feedback_success(discovery_service, workshop_with_traces):
    """Submit GOOD/BAD feedback with comment on a trace — verify DB state."""
    data = DiscoveryFeedbackCreate(
        trace_id="t-1",
        user_id="u-1",
        feedback_label=FeedbackLabel.GOOD,
        comment="Nice answer",
    )
    result = discovery_service.submit_discovery_feedback("ws-1", data)

    assert result.feedback_label == "good"
    assert result.comment == "Nice answer"
    assert result.workshop_id == "ws-1"
    assert result.trace_id == "t-1"
    assert result.user_id == "u-1"

    # Verify in DB
    feedbacks = discovery_service.get_discovery_feedback("ws-1", user_id="u-1")
    assert len(feedbacks) == 1
    assert feedbacks[0].id == result.id


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Form validation prevents empty submissions")
@pytest.mark.unit
def test_submit_feedback_validation_rejects_empty_comment(discovery_service, workshop_with_traces):
    """Validation rejects empty comment — tests real logic in discovery_service.py."""
    data = DiscoveryFeedbackCreate(
        trace_id="t-1",
        user_id="u-1",
        feedback_label=FeedbackLabel.BAD,
        comment="",
    )
    with pytest.raises(HTTPException) as exc_info:
        discovery_service.submit_discovery_feedback("ws-1", data)
    assert exc_info.value.status_code == 422
    assert "Comment is required" in exc_info.value.detail


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Form validation prevents empty submissions")
@pytest.mark.unit
def test_submit_feedback_validation_rejects_whitespace_comment(discovery_service, workshop_with_traces):
    """Validation rejects whitespace-only comment."""
    data = DiscoveryFeedbackCreate(
        trace_id="t-1",
        user_id="u-1",
        feedback_label=FeedbackLabel.BAD,
        comment="   ",
    )
    with pytest.raises(HTTPException) as exc_info:
        discovery_service.submit_discovery_feedback("ws-1", data)
    assert exc_info.value.status_code == 422


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Participants view traces and provide GOOD/BAD + comment")
@pytest.mark.unit
def test_submit_feedback_on_nonexistent_workshop(discovery_service):
    """Submit feedback on nonexistent workshop raises 404."""
    data = DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Should fail",
    )
    with pytest.raises(HTTPException) as exc_info:
        discovery_service.submit_discovery_feedback("nonexistent-ws", data)
    assert exc_info.value.status_code == 404


# ============================================================================
# POST /workshops/{id}/generate-followup-question
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("All 3 questions required before moving to next trace")
@pytest.mark.unit
def test_generate_followup_rejects_question_4(discovery_service, workshop_with_traces):
    """Reject question_number > 3 — tests real boundary check."""
    # Submit feedback first so "no feedback" doesn't trigger
    discovery_service.submit_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Good",
    ))

    with pytest.raises(HTTPException) as exc_info:
        discovery_service.generate_followup_question(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1", question_number=4,
        )
    assert exc_info.value.status_code == 400
    assert "1, 2, or 3" in exc_info.value.detail


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("AI generates 3 follow-up questions per trace based on feedback")
@pytest.mark.unit
def test_generate_followup_requires_prior_feedback(discovery_service, workshop_with_traces):
    """Generating a follow-up without prior feedback raises 404."""
    with pytest.raises(HTTPException) as exc_info:
        discovery_service.generate_followup_question(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1", question_number=1,
        )
    assert exc_info.value.status_code == 404
    assert "No feedback found" in exc_info.value.detail


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Progressive disclosure (one question at a time)")
@pytest.mark.unit
def test_generate_followup_enforces_sequence(discovery_service, workshop_with_traces):
    """Asking for Q2 when Q1 not answered raises 400."""
    discovery_service.submit_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Good",
    ))

    # Skip Q1, try to get Q2 directly
    with pytest.raises(HTTPException) as exc_info:
        discovery_service.generate_followup_question(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1", question_number=2,
        )
    assert exc_info.value.status_code == 400
    assert "Expected question_number=1" in exc_info.value.detail


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("AI generates 3 follow-up questions per trace based on feedback")
@pytest.mark.unit
def test_generate_followup_with_demo_model(discovery_service, workshop_with_traces):
    """With demo model, generate_followup returns a fallback question."""
    discovery_service.submit_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Good answer",
    ))

    result = discovery_service.generate_followup_question(
        workshop_id="ws-1", trace_id="t-1", user_id="u-1", question_number=1,
    )

    assert "question" in result
    assert result["question_number"] == 1
    assert isinstance(result["question"], str)
    assert len(result["question"]) > 0
    # Demo model should produce a fallback
    assert result["is_fallback"] is True


# ============================================================================
# POST /workshops/{id}/submit-followup-answer
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Questions build progressively on prior answers")
@pytest.mark.unit
def test_submit_followup_answer(discovery_service, workshop_with_traces):
    """Submit an answer to a follow-up — verify DB state."""
    # Setup: submit feedback first
    discovery_service.submit_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.BAD, comment="Not great",
    ))

    result = discovery_service.submit_followup_answer(
        workshop_id="ws-1",
        trace_id="t-1",
        user_id="u-1",
        question="What specifically was wrong?",
        answer="The tone was off.",
    )

    assert result["qna_count"] == 1
    assert result["complete"] is False

    # Verify in DB
    feedbacks = discovery_service.get_discovery_feedback("ws-1", user_id="u-1")
    assert len(feedbacks[0].followup_qna) == 1
    assert feedbacks[0].followup_qna[0]["question"] == "What specifically was wrong?"
    assert feedbacks[0].followup_qna[0]["answer"] == "The tone was off."


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Form validation prevents empty submissions")
@pytest.mark.unit
def test_submit_followup_answer_validation_rejects_empty_answer(discovery_service, workshop_with_traces):
    """Empty answer is rejected with 422."""
    discovery_service.submit_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Good",
    ))

    with pytest.raises(HTTPException) as exc_info:
        discovery_service.submit_followup_answer(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1",
            question="Q1?", answer="",
        )
    assert exc_info.value.status_code == 422
    assert "Answer is required" in exc_info.value.detail


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("All 3 questions required before moving to next trace")
@pytest.mark.unit
def test_submit_followup_answer_returns_complete_true_at_q3(discovery_service, workshop_with_traces):
    """After 3 Q&As, complete=True is returned."""
    discovery_service.submit_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Good",
    ))

    for i in range(2):
        result = discovery_service.submit_followup_answer(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1",
            question=f"Q{i+1}?", answer=f"A{i+1}",
        )
        assert result["complete"] is False

    # Third answer → complete
    result = discovery_service.submit_followup_answer(
        workshop_id="ws-1", trace_id="t-1", user_id="u-1",
        question="Q3?", answer="A3",
    )
    assert result["qna_count"] == 3
    assert result["complete"] is True


# ============================================================================
# GET /workshops/{id}/discovery-feedback — get_discovery_feedback
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Participants view traces and provide GOOD/BAD + comment")
@pytest.mark.unit
def test_get_discovery_feedback_list(discovery_service, workshop_with_traces):
    """List all discovery feedback for a workshop."""
    discovery_service.submit_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Good 1",
    ))
    discovery_service.submit_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-2", user_id="u-1",
        feedback_label=FeedbackLabel.BAD, comment="Bad 2",
    ))

    result = discovery_service.get_discovery_feedback("ws-1")
    assert len(result) == 2
    comments = {fb.comment for fb in result}
    assert "Good 1" in comments
    assert "Bad 2" in comments


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Participants view traces and provide GOOD/BAD + comment")
@pytest.mark.unit
def test_get_discovery_feedback_filtered_by_user(discovery_service, workshop_with_traces):
    """List discovery feedback filtered by user_id returns only matching results."""
    discovery_service.submit_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="User 1",
    ))
    discovery_service.submit_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-2",
        feedback_label=FeedbackLabel.BAD, comment="User 2",
    ))

    result = discovery_service.get_discovery_feedback("ws-1", user_id="u-1")
    assert len(result) == 1
    assert result[0].user_id == "u-1"
    assert result[0].comment == "User 1"


# ============================================================================
# POST /workshops/{id}/begin-discovery (with randomize)
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Facilitator can start Discovery phase with configurable trace limit")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_begin_discovery_with_trace_limit(async_client, override_get_db, monkeypatch):
    """Begin discovery with trace_limit and randomize params.

    This test legitimately uses mocks because the begin-discovery route
    lives in workshops.py (not discovery.py) and only tests HTTP routing.
    """
    from unittest.mock import MagicMock

    from server.models import Workshop, WorkshopPhase, WorkshopStatus
    from datetime import datetime

    import server.routers.workshops as ws_mod

    mock_db_svc = MagicMock()
    mock_db_svc.get_workshop.return_value = Workshop(
        id="ws-1", name="Test", facilitator_id="f-1",
        status=WorkshopStatus.ACTIVE, current_phase=WorkshopPhase.DISCOVERY,
        discovery_started=True, active_discovery_trace_ids=["t-1", "t-2"],
        created_at=datetime.now(),
    )
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
    mock_db_svc.update_discovery_randomize_setting.assert_called_once_with("ws-1", True)
