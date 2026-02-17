"""Tests for discovery feedback CRUD in DatabaseService.

Covers upsert behavior, Q&A append ordering, completion stats,
and incremental save guarantees per DISCOVERY_SPEC Step 1.

Uses real in-memory SQLite (same pattern as test_update_discovery_model.py)
instead of mock chains, so we exercise actual SQL queries.
"""

import time

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import (
    Base,
    DiscoveryFeedbackDB,
    TraceDB,
    UserDB,
    WorkshopDB,
    WorkshopParticipantDB,
)
from server.models import (
    DiscoveryFeedback,
    DiscoveryFeedbackCreate,
    FeedbackLabel,
)
from server.services.database_service import DatabaseService


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
def db_service(test_db):
    return DatabaseService(test_db)


@pytest.fixture
def workshop(test_db):
    ws = WorkshopDB(
        id="ws-1",
        name="Test Workshop",
        facilitator_id="f-1",
        active_discovery_trace_ids=["t-1", "t-2"],
    )
    test_db.add(ws)
    test_db.commit()
    return ws


@pytest.fixture
def traces(test_db, workshop):
    t1 = TraceDB(id="t-1", workshop_id="ws-1", input="Hello", output="Hi")
    t2 = TraceDB(id="t-2", workshop_id="ws-1", input="Bye", output="Later")
    test_db.add_all([t1, t2])
    test_db.commit()
    return [t1, t2]


@pytest.fixture
def users_and_participants(test_db, workshop):
    """Create UserDB + WorkshopParticipantDB records for completion tests."""
    u1 = UserDB(id="u-1", email="u1@test.com", name="User One", role="participant")
    u2 = UserDB(id="u-2", email="u2@test.com", name="User Two", role="participant")
    test_db.add_all([u1, u2])
    test_db.flush()

    p1 = WorkshopParticipantDB(id="wp-1", user_id="u-1", workshop_id="ws-1", role="sme")
    p2 = WorkshopParticipantDB(id="wp-2", user_id="u-2", workshop_id="ws-1", role="participant")
    test_db.add_all([p1, p2])
    test_db.commit()
    return [u1, u2]


# ============================================================================
# add_discovery_feedback (upsert)
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("One feedback record per (workshop, trace, user) — upsert behavior")
@pytest.mark.unit
def test_add_discovery_feedback_creates_new(db_service, workshop, traces):
    """Create new feedback when none exists for the (workshop, trace, user) triple."""
    data = DiscoveryFeedbackCreate(
        trace_id="t-1",
        user_id="u-1",
        feedback_label=FeedbackLabel.GOOD,
        comment="Looks great",
    )
    result = db_service.add_discovery_feedback("ws-1", data)

    assert isinstance(result, DiscoveryFeedback)
    assert result.feedback_label == "good"
    assert result.comment == "Looks great"
    assert result.workshop_id == "ws-1"
    assert result.trace_id == "t-1"
    assert result.user_id == "u-1"
    assert result.followup_qna == []

    # Verify persisted in DB
    row = db_service.db.query(DiscoveryFeedbackDB).filter_by(id=result.id).first()
    assert row is not None
    assert row.feedback_label == "good"


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("One feedback record per (workshop, trace, user) — upsert behavior")
@pytest.mark.unit
def test_add_discovery_feedback_upsert_updates_existing(db_service, workshop, traces):
    """Upsert updates existing feedback record instead of creating duplicate."""
    data1 = DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Old comment",
    )
    first = db_service.add_discovery_feedback("ws-1", data1)

    data2 = DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.BAD, comment="Actually bad",
    )
    second = db_service.add_discovery_feedback("ws-1", data2)

    # Same record ID
    assert second.id == first.id
    assert second.feedback_label == "bad"
    assert second.comment == "Actually bad"

    # Only one row in DB
    count = db_service.db.query(DiscoveryFeedbackDB).filter_by(
        workshop_id="ws-1", trace_id="t-1", user_id="u-1"
    ).count()
    assert count == 1


# ============================================================================
# append_followup_qna
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Q&A pairs appended in order to JSON array")
@pytest.mark.unit
def test_append_followup_qna_preserves_order(db_service, workshop, traces):
    """Q&A pairs are appended in order to the JSON array."""
    # Create initial feedback
    data = DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Nice",
    )
    db_service.add_discovery_feedback("ws-1", data)

    # Append Q1
    db_service.append_followup_qna("ws-1", "t-1", "u-1", {"question": "Q1?", "answer": "A1"})
    # Append Q2
    result = db_service.append_followup_qna("ws-1", "t-1", "u-1", {"question": "Q2?", "answer": "A2"})

    assert len(result.followup_qna) == 2
    assert result.followup_qna[0]["question"] == "Q1?"
    assert result.followup_qna[1]["question"] == "Q2?"

    # Verify persisted
    row = db_service.db.query(DiscoveryFeedbackDB).filter_by(id=result.id).first()
    assert len(row.followup_qna) == 2
    assert row.followup_qna[0]["answer"] == "A1"
    assert row.followup_qna[1]["answer"] == "A2"


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Feedback saved incrementally (no data loss on failure)")
@pytest.mark.unit
def test_append_followup_qna_raises_if_no_feedback(db_service, workshop, traces):
    """Raises ValueError when no feedback record exists to append to."""
    with pytest.raises(ValueError, match="No feedback found"):
        db_service.append_followup_qna(
            "ws-1", "t-1", "u-1", {"question": "Q1", "answer": "A1"}
        )


# ============================================================================
# get_discovery_feedback
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Participants view traces and provide GOOD/BAD + comment")
@pytest.mark.unit
def test_get_discovery_feedback_filters_by_user(db_service, workshop, traces):
    """Get feedback filtered by user returns only matching rows."""
    db_service.add_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="User 1 says good",
    ))
    db_service.add_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-2",
        feedback_label=FeedbackLabel.BAD, comment="User 2 says bad",
    ))

    result = db_service.get_discovery_feedback("ws-1", user_id="u-1")
    assert len(result) == 1
    assert result[0].user_id == "u-1"
    assert result[0].comment == "User 1 says good"


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Participants view traces and provide GOOD/BAD + comment")
@pytest.mark.unit
def test_get_discovery_feedback_filters_by_trace(db_service, workshop, traces):
    """Get feedback filtered by trace_id returns only matching rows."""
    db_service.add_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Trace 1 feedback",
    ))
    db_service.add_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-2", user_id="u-1",
        feedback_label=FeedbackLabel.BAD, comment="Trace 2 feedback",
    ))

    result = db_service.get_discovery_feedback("ws-1", trace_id="t-1")
    assert len(result) == 1
    assert result[0].trace_id == "t-1"
    assert result[0].comment == "Trace 1 feedback"


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Participants view traces and provide GOOD/BAD + comment")
@pytest.mark.unit
def test_get_discovery_feedback_returns_ordered_by_created_at(db_service, workshop, traces):
    """Feedback results are ordered by created_at ascending."""
    db_service.add_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="First",
    ))
    # Small delay so created_at differs
    time.sleep(0.01)
    db_service.add_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-2", user_id="u-1",
        feedback_label=FeedbackLabel.BAD, comment="Second",
    ))

    result = db_service.get_discovery_feedback("ws-1")
    assert len(result) == 2
    assert result[0].comment == "First"
    assert result[1].comment == "Second"


# ============================================================================
# Upsert + Q&A interaction
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("One feedback record per (workshop, trace, user) — upsert behavior")
@pytest.mark.unit
def test_upsert_preserves_existing_qna(db_service, workshop, traces):
    """Upserting label/comment does not wipe existing followup_qna."""
    # Create feedback + append Q1
    db_service.add_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Good stuff",
    ))
    db_service.append_followup_qna("ws-1", "t-1", "u-1", {"question": "Q1?", "answer": "A1"})

    # Upsert to change label
    result = db_service.add_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.BAD, comment="Changed my mind",
    ))

    assert result.feedback_label == "bad"
    assert result.comment == "Changed my mind"
    # Q&A should still be there
    assert len(result.followup_qna) == 1
    assert result.followup_qna[0]["question"] == "Q1?"


# ============================================================================
# get_discovery_feedback_completion_status
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Completion status shows % of participants finished")
@pytest.mark.unit
def test_completion_status_percentage(db_service, workshop, traces, users_and_participants):
    """Completion status calculates correct percentage with real data."""
    # u-1: complete (feedback + 3 Q&A on both traces)
    for tid in ["t-1", "t-2"]:
        db_service.add_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
            trace_id=tid, user_id="u-1",
            feedback_label=FeedbackLabel.GOOD, comment=f"Good on {tid}",
        ))
        for i in range(3):
            db_service.append_followup_qna(
                "ws-1", tid, "u-1",
                {"question": f"Q{i+1}?", "answer": f"A{i+1}"},
            )

    # u-2: only completed trace t-1 (3 Q&A), not t-2
    db_service.add_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-2",
        feedback_label=FeedbackLabel.BAD, comment="Bad on t-1",
    ))
    for i in range(3):
        db_service.append_followup_qna(
            "ws-1", "t-1", "u-2",
            {"question": f"Q{i+1}?", "answer": f"A{i+1}"},
        )

    result = db_service.get_discovery_feedback_completion_status("ws-1")

    assert result["total_participants"] == 2
    assert result["completed_participants"] == 1
    assert result["completion_percentage"] == 50.0
    assert result["all_completed"] is False


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Completion status shows % of participants finished")
@pytest.mark.unit
def test_completion_status_empty_workshop(db_service):
    """Completion status handles nonexistent workshop gracefully."""
    result = db_service.get_discovery_feedback_completion_status("nonexistent-ws")
    assert result["total_participants"] == 0
    assert result["completion_percentage"] == 0


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Completion status shows % of participants finished")
@pytest.mark.unit
def test_completion_status_partial_qna_not_complete(db_service, workshop, traces, users_and_participants):
    """User with only 2/3 Q&As on a trace is not counted as complete."""
    # u-1: feedback + only 2 Q&A on t-1, nothing on t-2
    db_service.add_discovery_feedback("ws-1", DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.GOOD, comment="Partial",
    ))
    for i in range(2):
        db_service.append_followup_qna(
            "ws-1", "t-1", "u-1",
            {"question": f"Q{i+1}?", "answer": f"A{i+1}"},
        )

    result = db_service.get_discovery_feedback_completion_status("ws-1")

    assert result["total_participants"] == 2
    assert result["completed_participants"] == 0
    assert result["completion_percentage"] == 0


# ============================================================================
# Incremental save
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Feedback saved incrementally (no data loss on failure)")
@pytest.mark.unit
def test_feedback_saved_incrementally(db_service, workshop, traces):
    """Feedback is saved on initial submit, then each Q&A is appended independently."""
    # Step 1: Initial feedback saved
    data = DiscoveryFeedbackCreate(
        trace_id="t-1", user_id="u-1",
        feedback_label=FeedbackLabel.BAD, comment="Needs work",
    )
    result = db_service.add_discovery_feedback("ws-1", data)

    # Verify in DB immediately
    row = db_service.db.query(DiscoveryFeedbackDB).filter_by(id=result.id).first()
    assert row is not None
    assert row.comment == "Needs work"
    assert len(row.followup_qna or []) == 0

    # Step 2: Q1 appended
    db_service.append_followup_qna("ws-1", "t-1", "u-1", {"question": "Q1", "answer": "A1"})

    # Verify Q1 persisted
    row = db_service.db.query(DiscoveryFeedbackDB).filter_by(id=result.id).first()
    assert len(row.followup_qna) == 1

    # Step 3: Q2 appended
    db_service.append_followup_qna("ws-1", "t-1", "u-1", {"question": "Q2", "answer": "A2"})

    # Verify Q2 persisted alongside Q1
    row = db_service.db.query(DiscoveryFeedbackDB).filter_by(id=result.id).first()
    assert len(row.followup_qna) == 2
    assert row.followup_qna[0]["question"] == "Q1"
    assert row.followup_qna[1]["question"] == "Q2"
