"""Tests for discovery feedback CRUD in DatabaseService.

Covers upsert behavior, Q&A append ordering, completion stats,
and incremental save guarantees per DISCOVERY_SPEC Step 1.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from server.models import (
    DiscoveryFeedback,
    DiscoveryFeedbackCreate,
    FeedbackLabel,
)
from server.services.database_service import DatabaseService


def _make_feedback_db(
    fb_id="fb-1",
    workshop_id="ws-1",
    trace_id="t-1",
    user_id="u-1",
    label="good",
    comment="Looks great",
    qna=None,
):
    mock = MagicMock()
    mock.id = fb_id
    mock.workshop_id = workshop_id
    mock.trace_id = trace_id
    mock.user_id = user_id
    mock.feedback_label = label
    mock.comment = comment
    mock.followup_qna = qna if qna is not None else []
    mock.created_at = datetime.utcnow()
    mock.updated_at = datetime.utcnow()
    return mock


def _make_participant_db(user_id="u-1", role="sme"):
    mock = MagicMock()
    mock.user_id = user_id
    mock.role = role
    return mock


def _make_workshop_db(workshop_id="ws-1", active_traces=None):
    mock = MagicMock()
    mock.id = workshop_id
    mock.active_discovery_trace_ids = active_traces or ["t-1", "t-2"]
    return mock


# ============================================================================
# add_discovery_feedback (upsert)
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("One feedback record per (workshop, trace, user) — upsert behavior")
@pytest.mark.unit
def test_add_discovery_feedback_creates_new():
    """Create new feedback when none exists for the (workshop, trace, user) triple."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    # No existing row
    mock_db.query.return_value.filter.return_value.first.return_value = None

    # After commit + refresh, simulate the row
    new_row = _make_feedback_db()

    def fake_refresh(obj):
        obj.id = new_row.id
        obj.workshop_id = new_row.workshop_id
        obj.trace_id = new_row.trace_id
        obj.user_id = new_row.user_id
        obj.feedback_label = new_row.feedback_label
        obj.comment = new_row.comment
        obj.followup_qna = new_row.followup_qna
        obj.created_at = new_row.created_at
        obj.updated_at = new_row.updated_at

    mock_db.refresh.side_effect = fake_refresh

    data = DiscoveryFeedbackCreate(
        trace_id="t-1",
        user_id="u-1",
        feedback_label=FeedbackLabel.GOOD,
        comment="Looks great",
    )
    result = service.add_discovery_feedback("ws-1", data)

    assert isinstance(result, DiscoveryFeedback)
    assert result.feedback_label == "good"
    assert result.comment == "Looks great"
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("One feedback record per (workshop, trace, user) — upsert behavior")
@pytest.mark.unit
def test_add_discovery_feedback_upsert_updates_existing():
    """Upsert updates existing feedback record instead of creating duplicate."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    existing = _make_feedback_db(label="good", comment="Old comment")
    mock_db.query.return_value.filter.return_value.first.return_value = existing

    data = DiscoveryFeedbackCreate(
        trace_id="t-1",
        user_id="u-1",
        feedback_label=FeedbackLabel.BAD,
        comment="Actually bad",
    )
    result = service.add_discovery_feedback("ws-1", data)

    assert existing.feedback_label == "bad"
    assert existing.comment == "Actually bad"
    # Should not call db.add for existing row
    mock_db.add.assert_not_called()
    mock_db.commit.assert_called_once()


# ============================================================================
# append_followup_qna
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Q&A pairs appended in order to JSON array")
@pytest.mark.unit
def test_append_followup_qna_preserves_order():
    """Q&A pairs are appended in order to the JSON array."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    existing = _make_feedback_db(qna=[{"question": "Q1", "answer": "A1"}])
    mock_db.query.return_value.filter.return_value.first.return_value = existing

    result = service.append_followup_qna(
        "ws-1", "t-1", "u-1", {"question": "Q2", "answer": "A2"}
    )

    assert len(existing.followup_qna) == 2
    assert existing.followup_qna[0]["question"] == "Q1"
    assert existing.followup_qna[1]["question"] == "Q2"


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Feedback saved incrementally (no data loss on failure)")
@pytest.mark.unit
def test_append_followup_qna_raises_if_no_feedback():
    """Raises ValueError when no feedback record exists to append to."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="No feedback found"):
        service.append_followup_qna(
            "ws-1", "t-1", "u-1", {"question": "Q1", "answer": "A1"}
        )


# ============================================================================
# get_discovery_feedback
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Participants view traces and provide GOOD/BAD + comment")
@pytest.mark.unit
def test_get_discovery_feedback_filters_by_user():
    """Get feedback filtered by user returns correct results."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    rows = [_make_feedback_db(fb_id="fb-1"), _make_feedback_db(fb_id="fb-2")]
    mock_db.query.return_value.filter.return_value.filter.return_value.order_by.return_value.all.return_value = rows

    result = service.get_discovery_feedback("ws-1", user_id="u-1")
    assert len(result) == 2
    assert all(isinstance(r, DiscoveryFeedback) for r in result)


# ============================================================================
# get_discovery_feedback_completion_status
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Completion status shows % of participants finished")
@pytest.mark.unit
def test_completion_status_percentage():
    """Completion status calculates correct percentage."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    workshop = _make_workshop_db(active_traces=["t-1", "t-2"])
    mock_db.query.return_value.filter.return_value.first.return_value = workshop

    participants = [_make_participant_db("u-1"), _make_participant_db("u-2")]
    mock_db.query.return_value.filter.return_value.all.side_effect = [
        participants,
        [
            # u-1 completed both traces (3 qna each)
            _make_feedback_db(fb_id="fb-1", user_id="u-1", trace_id="t-1", qna=[{"q": "Q1", "a": "A1"}, {"q": "Q2", "a": "A2"}, {"q": "Q3", "a": "A3"}]),
            _make_feedback_db(fb_id="fb-2", user_id="u-1", trace_id="t-2", qna=[{"q": "Q1", "a": "A1"}, {"q": "Q2", "a": "A2"}, {"q": "Q3", "a": "A3"}]),
            # u-2 completed 1 trace
            _make_feedback_db(fb_id="fb-3", user_id="u-2", trace_id="t-1", qna=[{"q": "Q1", "a": "A1"}, {"q": "Q2", "a": "A2"}, {"q": "Q3", "a": "A3"}]),
        ],
    ]

    result = service.get_discovery_feedback_completion_status("ws-1")

    assert result["total_participants"] == 2
    assert result["completed_participants"] == 1
    assert result["completion_percentage"] == 50.0
    assert result["all_completed"] is False


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Completion status shows % of participants finished")
@pytest.mark.unit
def test_completion_status_empty_workshop():
    """Completion status handles empty workshop gracefully."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_db.query.return_value.filter.return_value.first.return_value = None

    result = service.get_discovery_feedback_completion_status("ws-1")
    assert result["total_participants"] == 0
    assert result["completion_percentage"] == 0


# ============================================================================
# Incremental save
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Feedback saved incrementally (no data loss on failure)")
@pytest.mark.unit
def test_feedback_saved_incrementally():
    """Feedback is saved on initial submit, then each Q&A is appended independently."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    # Step 1: Initial feedback saved
    mock_db.query.return_value.filter.return_value.first.return_value = None
    new_row = _make_feedback_db()

    def fake_refresh(obj):
        for attr in ["id", "workshop_id", "trace_id", "user_id", "feedback_label", "comment", "followup_qna", "created_at", "updated_at"]:
            setattr(obj, attr, getattr(new_row, attr))

    mock_db.refresh.side_effect = fake_refresh

    data = DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.BAD, comment="Needs work",
    )
    result = service.add_discovery_feedback("ws-1", data)
    assert mock_db.commit.call_count == 1

    # Step 2: Q1 appended
    existing = _make_feedback_db(qna=[])
    mock_db.query.return_value.filter.return_value.first.return_value = existing
    mock_db.commit.reset_mock()
    mock_db.refresh.side_effect = None  # Clear the fake_refresh from step 1

    service.append_followup_qna("ws-1", "t-1", "u-1", {"question": "Q1", "answer": "A1"})
    assert mock_db.commit.call_count == 1
    assert len(existing.followup_qna) == 1
