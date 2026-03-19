"""Integration tests for discovery feedback — full service round-trip.

Exercises DiscoveryService → DatabaseService → real SQLite, verifying the
complete feedback collection workflow end-to-end. Only the LLM call boundary
(FollowUpQuestionService) is mocked.
"""

from unittest.mock import patch

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
    DiscoveryFeedbackCreate,
    FeedbackLabel,
)
from server.services.discovery_service import DiscoveryService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def test_db():
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
    ws = WorkshopDB(
        id="ws-1",
        name="Integration Test Workshop",
        facilitator_id="f-1",
        active_discovery_trace_ids=["t-1", "t-2"],
        discovery_started=True,
        current_phase="discovery",
        discovery_questions_model_name="demo",
    )
    t1 = TraceDB(id="t-1", workshop_id="ws-1", input="What is AI?", output="AI is artificial intelligence.")
    t2 = TraceDB(id="t-2", workshop_id="ws-1", input="What is ML?", output="ML is machine learning.")
    test_db.add_all([ws, t1, t2])
    test_db.commit()
    return ws


@pytest.fixture
def users_and_participants(test_db, workshop_with_traces):
    """Create UserDB + WorkshopParticipantDB records."""
    u1 = UserDB(id="u-1", email="u1@test.com", name="Alice", role="participant")
    u2 = UserDB(id="u-2", email="u2@test.com", name="Bob", role="participant")
    test_db.add_all([u1, u2])
    test_db.flush()

    p1 = WorkshopParticipantDB(id="wp-1", user_id="u-1", workshop_id="ws-1", role="sme")
    p2 = WorkshopParticipantDB(id="wp-2", user_id="u-2", workshop_id="ws-1", role="participant")
    test_db.add_all([p1, p2])
    test_db.commit()
    return [u1, u2]


# ============================================================================
# Full flow tests
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.integration
class TestDiscoveryFeedbackIntegration:
    """Integration tests exercising the full service → DB round-trip."""

    @pytest.mark.req("Q&A pairs appended in order to JSON array")
    def test_full_feedback_and_qna_flow(self, discovery_service, workshop_with_traces):
        """Complete flow: submit feedback → Q1 → A1 → Q2 → A2 → Q3 → A3.

        Uses demo model so FollowUpQuestionService returns fallback questions.
        """
        # 1. Submit feedback
        feedback = discovery_service.submit_discovery_feedback(
            "ws-1",
            DiscoveryFeedbackCreate(
                trace_id="t-1", user_id="u-1",
                feedback_label=FeedbackLabel.GOOD, comment="Clear and helpful response",
            ),
        )
        assert feedback.feedback_label == "good"
        assert feedback.followup_qna == []

        # 2. Generate Q1 (demo model → fallback)
        q1_result = discovery_service.generate_followup_question(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1", question_number=1,
        )
        assert q1_result["question_number"] == 1
        assert len(q1_result["question"]) > 0

        # 3. Submit A1
        a1_result = discovery_service.submit_followup_answer(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1",
            question=q1_result["question"], answer="The reasoning was solid.",
        )
        assert a1_result["qna_count"] == 1
        assert a1_result["complete"] is False

        # 4. Generate Q2 — prior Q&A is in context
        q2_result = discovery_service.generate_followup_question(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1", question_number=2,
        )
        assert q2_result["question_number"] == 2

        # 5. Submit A2
        a2_result = discovery_service.submit_followup_answer(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1",
            question=q2_result["question"], answer="No major gaps.",
        )
        assert a2_result["qna_count"] == 2
        assert a2_result["complete"] is False

        # 6. Generate Q3
        q3_result = discovery_service.generate_followup_question(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1", question_number=3,
        )
        assert q3_result["question_number"] == 3

        # 7. Submit A3 → complete
        a3_result = discovery_service.submit_followup_answer(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1",
            question=q3_result["question"], answer="Overall very good.",
        )
        assert a3_result["qna_count"] == 3
        assert a3_result["complete"] is True

        # 8. Verify full state in DB
        feedbacks = discovery_service.get_discovery_feedback("ws-1", user_id="u-1")
        fb = [f for f in feedbacks if f.trace_id == "t-1"][0]
        assert len(fb.followup_qna) == 3
        assert fb.followup_qna[0]["answer"] == "The reasoning was solid."
        assert fb.followup_qna[2]["answer"] == "Overall very good."

    @pytest.mark.req("One feedback record per (workshop, trace, user) \u2014 upsert behavior")
    def test_upsert_then_qna_preserves_all_data(self, discovery_service, workshop_with_traces):
        """Upsert feedback (change label) after Q&A has been appended — Q&A preserved."""
        # Submit initial feedback
        discovery_service.submit_discovery_feedback(
            "ws-1",
            DiscoveryFeedbackCreate(
                trace_id="t-1", user_id="u-1",
                feedback_label=FeedbackLabel.GOOD, comment="Initially good",
            ),
        )

        # Append Q1
        discovery_service.submit_followup_answer(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1",
            question="Q1?", answer="A1",
        )

        # Upsert to change label to BAD
        updated = discovery_service.submit_discovery_feedback(
            "ws-1",
            DiscoveryFeedbackCreate(
                trace_id="t-1", user_id="u-1",
                feedback_label=FeedbackLabel.BAD, comment="Actually bad",
            ),
        )

        assert updated.feedback_label == "bad"
        assert updated.comment == "Actually bad"
        # Q1 should still be there
        assert len(updated.followup_qna) == 1
        assert updated.followup_qna[0]["question"] == "Q1?"

    @pytest.mark.req("Completion status shows % of participants finished")
    def test_multi_user_completion_status(
        self, discovery_service, workshop_with_traces, users_and_participants
    ):
        """Two users — one completes all traces, one partial → verify completion %."""
        # User A (u-1): feedback + 3 Q&A on both traces → complete
        for tid in ["t-1", "t-2"]:
            discovery_service.submit_discovery_feedback(
                "ws-1",
                DiscoveryFeedbackCreate(
                    trace_id=tid, user_id="u-1",
                    feedback_label=FeedbackLabel.GOOD, comment=f"Good on {tid}",
                ),
            )
            for i in range(3):
                discovery_service.submit_followup_answer(
                    workshop_id="ws-1", trace_id=tid, user_id="u-1",
                    question=f"Q{i+1}?", answer=f"A{i+1}",
                )

        # User B (u-2): feedback + 2 Q&A on t-1 only → not complete
        discovery_service.submit_discovery_feedback(
            "ws-1",
            DiscoveryFeedbackCreate(
                trace_id="t-1", user_id="u-2",
                feedback_label=FeedbackLabel.BAD, comment="Bad on t-1",
            ),
        )
        for i in range(2):
            discovery_service.submit_followup_answer(
                workshop_id="ws-1", trace_id="t-1", user_id="u-2",
                question=f"Q{i+1}?", answer=f"A{i+1}",
            )

        status = discovery_service.db_service.get_discovery_feedback_completion_status("ws-1")

        assert status["total_participants"] == 2
        assert status["completed_participants"] == 1
        assert status["completion_percentage"] == 50.0
        assert status["all_completed"] is False

    @pytest.mark.req("Facilitator can view participant feedback details (label, comment, follow-up Q&A)")
    def test_get_feedback_with_user_details(
        self, discovery_service, workshop_with_traces, users_and_participants
    ):
        """Facilitator view joins feedback with user names/roles."""
        discovery_service.submit_discovery_feedback(
            "ws-1",
            DiscoveryFeedbackCreate(
                trace_id="t-1", user_id="u-1",
                feedback_label=FeedbackLabel.GOOD, comment="Great job",
            ),
        )
        discovery_service.submit_discovery_feedback(
            "ws-1",
            DiscoveryFeedbackCreate(
                trace_id="t-1", user_id="u-2",
                feedback_label=FeedbackLabel.BAD, comment="Needs work",
            ),
        )

        result = discovery_service.get_discovery_feedback_with_user_details("ws-1")

        assert len(result) == 2

        u1_entry = next(r for r in result if r["user_id"] == "u-1")
        assert u1_entry["user_name"] == "Alice"
        assert u1_entry["user_role"] == "sme"
        assert u1_entry["feedback_label"] == "good"
        assert u1_entry["comment"] == "Great job"

        u2_entry = next(r for r in result if r["user_id"] == "u-2")
        assert u2_entry["user_name"] == "Bob"
        assert u2_entry["user_role"] == "participant"
        assert u2_entry["feedback_label"] == "bad"
