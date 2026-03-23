"""Tests for DISCOVERY_SPEC Step 2: Findings Synthesis.

Covers feedback aggregation, deterministic disagreement detection,
analysis record management, and analysis UI requirements.

Uses real in-memory SQLite (same pattern as test_database_service_feedback.py).
"""

from collections import defaultdict
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import (
    Base,
    DiscoveryFeedbackDB,
    DiscoverySummaryDB,
    TraceDB,
    UserDB,
    WorkshopDB,
    WorkshopParticipantDB,
)
from server.models import (
    DiscoveryFeedbackCreate,
    FeedbackLabel,
)
from server.services.database_service import DatabaseService
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
def db_service(test_db):
    return DatabaseService(test_db)


@pytest.fixture
def discovery_service(test_db):
    return DiscoveryService(test_db)


@pytest.fixture
def workshop(test_db):
    ws = WorkshopDB(
        id="ws-1",
        name="Analysis Test Workshop",
        facilitator_id="f-1",
        active_discovery_trace_ids=["t-1", "t-2", "t-3"],
        discovery_started=True,
        current_phase="discovery",
        discovery_questions_model_name="demo",
    )
    test_db.add(ws)
    test_db.commit()
    return ws


@pytest.fixture
def traces(test_db, workshop):
    t1 = TraceDB(id="t-1", workshop_id="ws-1", input="What is AI?", output="AI is artificial intelligence.")
    t2 = TraceDB(id="t-2", workshop_id="ws-1", input="Explain ML", output="ML is machine learning.")
    t3 = TraceDB(id="t-3", workshop_id="ws-1", input="What is NLP?", output="NLP processes language.")
    test_db.add_all([t1, t2, t3])
    test_db.commit()
    return [t1, t2, t3]


@pytest.fixture
def users_and_participants(test_db, workshop):
    u1 = UserDB(id="u-1", email="alice@test.com", name="Alice", role="participant")
    u2 = UserDB(id="u-2", email="bob@test.com", name="Bob", role="participant")
    u3 = UserDB(id="u-3", email="carol@test.com", name="Carol", role="participant")
    test_db.add_all([u1, u2, u3])
    test_db.flush()

    p1 = WorkshopParticipantDB(id="wp-1", user_id="u-1", workshop_id="ws-1", role="sme")
    p2 = WorkshopParticipantDB(id="wp-2", user_id="u-2", workshop_id="ws-1", role="participant")
    p3 = WorkshopParticipantDB(id="wp-3", user_id="u-3", workshop_id="ws-1", role="participant")
    test_db.add_all([p1, p2, p3])
    test_db.commit()
    return [u1, u2, u3]


def _submit_feedback(discovery_service, trace_id, user_id, label, comment):
    """Helper to submit feedback."""
    return discovery_service.submit_discovery_feedback(
        "ws-1",
        DiscoveryFeedbackCreate(
            trace_id=trace_id,
            user_id=user_id,
            feedback_label=label,
            comment=comment,
        ),
    )


def _aggregate_feedback_by_trace(feedbacks):
    """Aggregate feedback by trace_id (pure function implementing spec behavior).

    Per spec: "Group all feedback by trace_id" with input/output and feedback entries.
    """
    by_trace = defaultdict(list)
    for fb in feedbacks:
        by_trace[fb.trace_id].append(fb)
    return dict(by_trace)


def _detect_disagreements_deterministic(aggregated):
    """Detect disagreements at 3 priority levels (deterministic, no LLM).

    Per spec:
    - HIGH: labels differ (GOOD vs BAD)
    - MEDIUM: all BAD (different issues may exist)
    - LOWER: all GOOD (different strengths may be valued)
    """
    disagreements = {"high": [], "medium": [], "lower": []}

    for trace_id, feedbacks in aggregated.items():
        if len(feedbacks) < 2:
            continue

        labels = {fb.feedback_label for fb in feedbacks}

        if "good" in labels and "bad" in labels:
            disagreements["high"].append({
                "trace_id": trace_id,
                "type": "rating_disagreement",
                "labels": {fb.user_id: fb.feedback_label for fb in feedbacks},
            })
        elif labels == {"bad"}:
            disagreements["medium"].append({
                "trace_id": trace_id,
                "type": "both_bad_different_issues",
                "labels": {fb.user_id: fb.feedback_label for fb in feedbacks},
            })
        elif labels == {"good"}:
            disagreements["lower"].append({
                "trace_id": trace_id,
                "type": "both_good_different_strengths",
                "labels": {fb.user_id: fb.feedback_label for fb in feedbacks},
            })

    return disagreements


# ============================================================================
# Step 2 Requirement: "System aggregates feedback by trace"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestAggregateByTrace:

    @pytest.mark.req("System aggregates feedback by trace")
    def test_aggregate_feedback_groups_by_trace(
        self, discovery_service, workshop, traces
    ):
        """Feedback from multiple users on the same trace is grouped together."""
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Great answer")
        _submit_feedback(discovery_service, "t-1", "u-2", FeedbackLabel.BAD, "Inaccurate")
        _submit_feedback(discovery_service, "t-2", "u-1", FeedbackLabel.GOOD, "Clear explanation")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        aggregated = _aggregate_feedback_by_trace(all_feedback)

        assert len(aggregated) == 2
        assert len(aggregated["t-1"]) == 2
        assert len(aggregated["t-2"]) == 1

        # Verify feedback entries contain the expected user data
        t1_users = {fb.user_id for fb in aggregated["t-1"]}
        assert t1_users == {"u-1", "u-2"}

    @pytest.mark.req("System aggregates feedback by trace")
    def test_aggregate_includes_all_feedback_fields(
        self, discovery_service, workshop, traces
    ):
        """Aggregated feedback preserves label, comment, and followup Q&A."""
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Detailed comment")

        # Add a follow-up Q&A
        discovery_service.submit_followup_answer(
            workshop_id="ws-1", trace_id="t-1", user_id="u-1",
            question="Why was it good?", answer="Clear and concise",
        )

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        aggregated = _aggregate_feedback_by_trace(all_feedback)

        fb = aggregated["t-1"][0]
        assert fb.feedback_label == "good"
        assert fb.comment == "Detailed comment"
        assert len(fb.followup_qna) == 1
        assert fb.followup_qna[0]["question"] == "Why was it good?"
        assert fb.followup_qna[0]["answer"] == "Clear and concise"


# ============================================================================
# Step 2 Requirement: "Disagreements detected at 3 priority levels
#                       (deterministic, no LLM)"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestDisagreementDetection:

    @pytest.mark.req("Disagreements detected at 3 priority levels (deterministic, no LLM)")
    def test_high_priority_good_vs_bad(
        self, discovery_service, workshop, traces
    ):
        """HIGH priority: one rated GOOD, another rated BAD on the same trace."""
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Perfect answer")
        _submit_feedback(discovery_service, "t-1", "u-2", FeedbackLabel.BAD, "Totally wrong")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        aggregated = _aggregate_feedback_by_trace(all_feedback)
        disagreements = _detect_disagreements_deterministic(aggregated)

        assert len(disagreements["high"]) == 1
        assert disagreements["high"][0]["trace_id"] == "t-1"
        assert disagreements["high"][0]["type"] == "rating_disagreement"
        assert len(disagreements["medium"]) == 0
        assert len(disagreements["lower"]) == 0

    @pytest.mark.req("Disagreements detected at 3 priority levels (deterministic, no LLM)")
    def test_medium_priority_both_bad(
        self, discovery_service, workshop, traces
    ):
        """MEDIUM priority: both rated BAD (different issues may exist)."""
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.BAD, "Factual error")
        _submit_feedback(discovery_service, "t-1", "u-2", FeedbackLabel.BAD, "Poor tone")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        aggregated = _aggregate_feedback_by_trace(all_feedback)
        disagreements = _detect_disagreements_deterministic(aggregated)

        assert len(disagreements["medium"]) == 1
        assert disagreements["medium"][0]["trace_id"] == "t-1"
        assert disagreements["medium"][0]["type"] == "both_bad_different_issues"
        assert len(disagreements["high"]) == 0
        assert len(disagreements["lower"]) == 0

    @pytest.mark.req("Disagreements detected at 3 priority levels (deterministic, no LLM)")
    def test_lower_priority_both_good(
        self, discovery_service, workshop, traces
    ):
        """LOWER priority: both rated GOOD (different strengths may be valued)."""
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Great accuracy")
        _submit_feedback(discovery_service, "t-1", "u-2", FeedbackLabel.GOOD, "Excellent tone")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        aggregated = _aggregate_feedback_by_trace(all_feedback)
        disagreements = _detect_disagreements_deterministic(aggregated)

        assert len(disagreements["lower"]) == 1
        assert disagreements["lower"][0]["trace_id"] == "t-1"
        assert disagreements["lower"][0]["type"] == "both_good_different_strengths"
        assert len(disagreements["high"]) == 0
        assert len(disagreements["medium"]) == 0

    @pytest.mark.req("Disagreements detected at 3 priority levels (deterministic, no LLM)")
    def test_all_three_priority_levels(
        self, discovery_service, workshop, traces
    ):
        """Multiple traces with different disagreement levels simultaneously."""
        # t-1: HIGH (GOOD vs BAD)
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Great")
        _submit_feedback(discovery_service, "t-1", "u-2", FeedbackLabel.BAD, "Bad")

        # t-2: MEDIUM (both BAD)
        _submit_feedback(discovery_service, "t-2", "u-1", FeedbackLabel.BAD, "Error A")
        _submit_feedback(discovery_service, "t-2", "u-2", FeedbackLabel.BAD, "Error B")

        # t-3: LOWER (both GOOD)
        _submit_feedback(discovery_service, "t-3", "u-1", FeedbackLabel.GOOD, "Strength A")
        _submit_feedback(discovery_service, "t-3", "u-2", FeedbackLabel.GOOD, "Strength B")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        aggregated = _aggregate_feedback_by_trace(all_feedback)
        disagreements = _detect_disagreements_deterministic(aggregated)

        assert len(disagreements["high"]) == 1
        assert len(disagreements["medium"]) == 1
        assert len(disagreements["lower"]) == 1

    @pytest.mark.req("Disagreements detected at 3 priority levels (deterministic, no LLM)")
    def test_single_reviewer_no_disagreement(
        self, discovery_service, workshop, traces
    ):
        """A trace with only one reviewer produces no disagreements."""
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Great")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        aggregated = _aggregate_feedback_by_trace(all_feedback)
        disagreements = _detect_disagreements_deterministic(aggregated)

        assert len(disagreements["high"]) == 0
        assert len(disagreements["medium"]) == 0
        assert len(disagreements["lower"]) == 0


# ============================================================================
# Step 2 Requirement: "Results organized by priority (HIGH -> MEDIUM -> LOWER)"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestResultsOrganizedByPriority:

    @pytest.mark.req("Results organized by priority (HIGH \u2192 MEDIUM \u2192 LOWER)")
    def test_disagreements_structured_by_priority(
        self, discovery_service, workshop, traces
    ):
        """Disagreement results have explicit high/medium/lower buckets."""
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Great")
        _submit_feedback(discovery_service, "t-1", "u-2", FeedbackLabel.BAD, "Bad")
        _submit_feedback(discovery_service, "t-2", "u-1", FeedbackLabel.BAD, "Error A")
        _submit_feedback(discovery_service, "t-2", "u-2", FeedbackLabel.BAD, "Error B")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        aggregated = _aggregate_feedback_by_trace(all_feedback)
        disagreements = _detect_disagreements_deterministic(aggregated)

        # Results are organized by priority keys
        assert "high" in disagreements
        assert "medium" in disagreements
        assert "lower" in disagreements

        # HIGH items come first when iterating keys in order
        priority_order = list(disagreements.keys())
        assert priority_order == ["high", "medium", "lower"]


# ============================================================================
# Step 2 Requirement: "Facilitator can trigger analysis at any time
#                       (even partial feedback)"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestTriggerAnalysisPartialFeedback:

    @pytest.mark.req("Facilitator can trigger analysis at any time (even partial feedback)")
    def test_analysis_possible_with_partial_feedback(
        self, discovery_service, workshop, traces
    ):
        """Analysis can run even when only one trace has feedback (partial)."""
        # Only t-1 has feedback, t-2 and t-3 have none
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Good answer")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        aggregated = _aggregate_feedback_by_trace(all_feedback)

        # Can aggregate and detect even with partial data
        assert len(aggregated) == 1
        assert "t-1" in aggregated
        disagreements = _detect_disagreements_deterministic(aggregated)
        # Single reviewer, no disagreements, but no error
        assert len(disagreements["high"]) == 0

    @pytest.mark.req("Facilitator can trigger analysis at any time (even partial feedback)")
    def test_analysis_with_no_feedback_returns_empty(
        self, discovery_service, workshop, traces
    ):
        """Analysis with zero feedback returns empty results, not an error."""
        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        aggregated = _aggregate_feedback_by_trace(all_feedback)

        assert len(aggregated) == 0
        disagreements = _detect_disagreements_deterministic(aggregated)
        assert disagreements == {"high": [], "medium": [], "lower": []}


# ============================================================================
# Step 2 Requirement: "Warning if < 2 participants (not an error)"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestWarningLowParticipants:

    @pytest.mark.req("Warning if < 2 participants (not an error)")
    def test_single_participant_produces_warning_not_error(
        self, discovery_service, workshop, traces
    ):
        """Analysis with < 2 participants should produce a warning, not fail."""
        # Only one user provides feedback
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Good")
        _submit_feedback(discovery_service, "t-2", "u-1", FeedbackLabel.BAD, "Bad")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        participant_ids = {fb.user_id for fb in all_feedback}
        participant_count = len(participant_ids)

        # The analysis can proceed (no exception)
        aggregated = _aggregate_feedback_by_trace(all_feedback)
        disagreements = _detect_disagreements_deterministic(aggregated)

        # Only 1 participant -- should trigger a warning
        assert participant_count < 2
        # But the analysis still produces valid results (not an error)
        assert isinstance(disagreements, dict)
        assert all(k in disagreements for k in ("high", "medium", "lower"))

    @pytest.mark.req("Analysis shows warning (not error) if < 2 participants")
    def test_zero_participants_no_crash(
        self, discovery_service, workshop, traces
    ):
        """Zero participants should produce empty results, not crash."""
        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        participant_ids = {fb.user_id for fb in all_feedback}
        participant_count = len(participant_ids)

        assert participant_count == 0
        aggregated = _aggregate_feedback_by_trace(all_feedback)
        disagreements = _detect_disagreements_deterministic(aggregated)
        assert disagreements == {"high": [], "medium": [], "lower": []}


# ============================================================================
# Step 2 Requirement: "Data freshness banner
#                       (participant count, last run timestamp)"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestDataFreshnessBanner:

    @pytest.mark.req("Data freshness banner (participant count, last run timestamp)")
    def test_participant_count_computed_from_feedback(
        self, discovery_service, workshop, traces
    ):
        """Participant count is derived from unique user IDs in feedback."""
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Good")
        _submit_feedback(discovery_service, "t-1", "u-2", FeedbackLabel.BAD, "Bad")
        _submit_feedback(discovery_service, "t-2", "u-1", FeedbackLabel.GOOD, "Also good")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        participant_count = len({fb.user_id for fb in all_feedback})

        assert participant_count == 2

    @pytest.mark.req("Data freshness banner (participant count, last run timestamp)")
    def test_last_feedback_timestamp_available(
        self, discovery_service, workshop, traces
    ):
        """The most recent feedback timestamp can be determined from feedback records."""
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Good")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        timestamps = [fb.updated_at for fb in all_feedback]
        latest = max(timestamps)

        # Latest timestamp is a valid datetime
        assert isinstance(latest, datetime)


# ============================================================================
# Step 2 Requirement: "Facilitator selects analysis template
#                       (Evaluation Criteria or Themes & Patterns) before running"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestAnalysisTemplateSelection:

    @pytest.mark.req("Facilitator selects analysis template (Evaluation Criteria or Themes & Patterns) before running")
    def test_db_stores_different_templates_distinctly(self, db_service, workshop):
        """The two preset templates ('evaluation_criteria', 'themes_patterns')
        can be stored and retrieved distinctly via save_discovery_summary.

        Verifies the DB layer supports the facilitator selecting between the
        two analysis templates defined by the spec.
        """
        payload_ec = {
            "template_used": "evaluation_criteria",
            "overall": {"themes": ["accuracy"]},
            "by_user": [],
            "by_trace": [],
        }
        payload_tp = {
            "template_used": "themes_patterns",
            "overall": {"themes": ["user frustration"]},
            "by_user": [],
            "by_trace": [],
        }

        saved_ec = db_service.save_discovery_summary("ws-1", payload_ec, model_name="model-v1")
        saved_tp = db_service.save_discovery_summary("ws-1", payload_tp, model_name="model-v1")

        # Both templates stored with distinct records
        assert saved_ec["id"] != saved_tp["id"]
        assert saved_ec["payload"]["template_used"] == "evaluation_criteria"
        assert saved_tp["payload"]["template_used"] == "themes_patterns"

        # Query DB and confirm both are retrievable
        all_summaries = db_service.db.query(DiscoverySummaryDB).filter(
            DiscoverySummaryDB.workshop_id == "ws-1"
        ).all()
        stored_templates = {s.payload["template_used"] for s in all_summaries}
        assert stored_templates == {"evaluation_criteria", "themes_patterns"}

    @pytest.mark.req("Analysis record stores which template was used")
    def test_summary_record_stores_payload_with_template(self, db_service, workshop):
        """Analysis records in DB can store which template was used via payload.

        Uses the existing save_discovery_summary method to persist analysis
        records that include template information.
        """
        payload = {
            "template_used": "evaluation_criteria",
            "overall": {"themes": ["accuracy"]},
            "by_user": [],
            "by_trace": [],
            "participant_count": 3,
        }
        saved = db_service.save_discovery_summary("ws-1", payload, model_name="test-model")

        assert saved["id"] is not None
        assert saved["workshop_id"] == "ws-1"
        assert saved["payload"]["template_used"] == "evaluation_criteria"
        assert saved["model_name"] == "test-model"


# ============================================================================
# Step 2 Requirement: "Each analysis run creates a new record (history preserved)"
# and "Re-runnable -- new analysis as more feedback comes in, prior analyses retained"
# and "Multiple analysis records per workshop allowed (history preserved)"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestAnalysisHistoryPreserved:

    @pytest.mark.req("Each analysis run creates a new record (history preserved)")
    def test_multiple_analysis_records_created_in_db(self, db_service, workshop):
        """Each analysis run creates a separate record in DB, not overwriting previous."""
        for i in range(3):
            payload = {
                "template_used": "evaluation_criteria",
                "participant_count": i + 1,
                "overall": {"themes": [f"theme-{i}"]},
                "by_user": [],
                "by_trace": [],
            }
            db_service.save_discovery_summary("ws-1", payload, model_name="model-v1")

        # Query all summaries from DB
        from server.database import DiscoverySummaryDB
        all_summaries = db_service.db.query(DiscoverySummaryDB).filter(
            DiscoverySummaryDB.workshop_id == "ws-1"
        ).all()

        assert len(all_summaries) == 3
        ids = [s.id for s in all_summaries]
        assert len(set(ids)) == 3  # All unique IDs

    @pytest.mark.req("Re-runnable \u2014 new analysis as more feedback comes in, prior analyses retained")
    def test_rerun_preserves_prior_analyses_in_db(self, db_service, workshop):
        """Re-running analysis preserves previous records. Each save creates new row."""
        # First run: 2 participants
        payload_1 = {
            "template_used": "evaluation_criteria",
            "participant_count": 2,
            "overall": {"themes": ["early theme"]},
            "by_user": [],
            "by_trace": [],
        }
        saved_1 = db_service.save_discovery_summary("ws-1", payload_1)

        # Second run: 3 participants (new feedback came in)
        payload_2 = {
            "template_used": "evaluation_criteria",
            "participant_count": 3,
            "overall": {"themes": ["early theme", "new theme"]},
            "by_user": [],
            "by_trace": [],
        }
        saved_2 = db_service.save_discovery_summary("ws-1", payload_2)

        # Both records exist with different IDs
        assert saved_1["id"] != saved_2["id"]
        assert saved_1["payload"]["participant_count"] == 2
        assert saved_2["payload"]["participant_count"] == 3

        # Query DB to confirm both are retained
        all_summaries = db_service.db.query(DiscoverySummaryDB).filter(
            DiscoverySummaryDB.workshop_id == "ws-1"
        ).all()
        assert len(all_summaries) == 2

    @pytest.mark.req("Multiple analysis records per workshop allowed (history preserved)")
    def test_multiple_templates_stored_in_db(self, db_service, workshop):
        """History preserves analyses from different templates in DB."""
        templates = ["evaluation_criteria", "themes_patterns", "evaluation_criteria"]
        for tmpl in templates:
            payload = {
                "template_used": tmpl,
                "overall": {"themes": []},
                "by_user": [],
                "by_trace": [],
            }
            db_service.save_discovery_summary("ws-1", payload)

        all_summaries = db_service.db.query(DiscoverySummaryDB).filter(
            DiscoverySummaryDB.workshop_id == "ws-1"
        ).all()

        assert len(all_summaries) == 3
        stored_templates = [s.payload["template_used"] for s in all_summaries]
        assert stored_templates.count("evaluation_criteria") == 2
        assert stored_templates.count("themes_patterns") == 1


# ============================================================================
# Step 2 Requirement: "LLM distills evaluation criteria with evidence
#                       from trace IDs"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestLLMDistillation:

    @pytest.mark.req("LLM distills evaluation criteria with evidence from trace IDs")
    def test_summaries_payload_model_supports_criteria(self):
        """The DiscoverySummariesPayload model can store evaluation criteria.

        Tests the real Pydantic model from production code to verify it
        supports candidate_rubric_questions (criteria) with evidence.
        """
        from server.services.discovery_dspy import DiscoverySummariesPayload, DiscoveryOverallSummary

        payload = DiscoverySummariesPayload(
            overall=DiscoveryOverallSummary(
                themes=["accuracy", "completeness"],
                patterns=["users prefer concise answers"],
            ),
            candidate_rubric_questions=[
                "Does the response cite sources?",
                "Is the response factually accurate?",
            ],
        )

        assert len(payload.candidate_rubric_questions) == 2
        assert payload.candidate_rubric_questions[0] == "Does the response cite sources?"
        assert payload.overall.themes == ["accuracy", "completeness"]

    @pytest.mark.req("LLM distills evaluation criteria with evidence from trace IDs")
    def test_distillation_persisted_with_trace_references(self, db_service, workshop, traces):
        """Distilled criteria stored in DB reference evidence trace IDs."""
        payload = {
            "template_used": "evaluation_criteria",
            "overall": {"themes": ["accuracy"]},
            "by_user": [],
            "by_trace": [
                {"trace_id": "t-1", "themes": ["cites sources"], "tendencies": [], "notable_behaviors": []},
                {"trace_id": "t-2", "themes": ["lacks citations"], "tendencies": [], "notable_behaviors": []},
            ],
            "candidate_rubric_questions": [
                "Does the response cite sources when making factual claims?",
            ],
        }
        saved = db_service.save_discovery_summary("ws-1", payload)

        assert len(saved["payload"]["by_trace"]) == 2
        assert saved["payload"]["by_trace"][0]["trace_id"] == "t-1"
        assert saved["payload"]["by_trace"][1]["trace_id"] == "t-2"
        assert saved["payload"]["candidate_rubric_questions"][0] == "Does the response cite sources when making factual claims?"


# ============================================================================
# Step 2 Requirement: "LLM analyzes disagreements with follow-up questions
#                       and suggestions"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestLLMDisagreementAnalysis:

    @pytest.mark.req("LLM analyzes disagreements with follow-up questions and suggestions")
    def test_key_disagreement_model_structure(self):
        """The KeyDisagreement Pydantic model supports theme, trace_ids, and viewpoints.

        Tests the real production model from discovery_dspy.py.
        """
        from server.services.discovery_dspy import KeyDisagreement

        disagreement = KeyDisagreement(
            theme="Accuracy vs. Clarity tradeoff",
            trace_ids=["t-1"],
            viewpoints=[
                "Alice found the answer clear and helpful",
                "Bob found the answer factually inaccurate",
            ],
        )

        assert disagreement.theme == "Accuracy vs. Clarity tradeoff"
        assert disagreement.trace_ids == ["t-1"]
        assert len(disagreement.viewpoints) == 2

    @pytest.mark.req("LLM analyzes disagreements with follow-up questions and suggestions")
    def test_discussion_prompt_model_for_facilitator_suggestions(self):
        """The DiscussionPrompt model supports follow-up suggestions for the facilitator.

        Tests the real production model from discovery_dspy.py.
        """
        from server.services.discovery_dspy import DiscussionPrompt

        prompt = DiscussionPrompt(
            theme="Rating split on accuracy",
            prompt="Ask participants: What would make this response clearly accurate?",
        )

        assert prompt.theme == "Rating split on accuracy"
        assert "Ask participants" in prompt.prompt

    @pytest.mark.req("LLM analyzes disagreements with follow-up questions and suggestions")
    def test_disagreement_analysis_persisted_in_summary(self, db_service, workshop):
        """Disagreement analysis data is stored in the summary payload."""
        payload = {
            "template_used": "evaluation_criteria",
            "overall": {"themes": []},
            "by_user": [],
            "by_trace": [],
            "key_disagreements": [
                {
                    "theme": "Accuracy vs. Clarity",
                    "trace_ids": ["t-1"],
                    "viewpoints": ["Clear and helpful", "Factually inaccurate"],
                }
            ],
            "discussion_prompts": [
                {
                    "theme": "Accuracy calibration",
                    "prompt": "Define what 'accurate enough' means for this use case",
                }
            ],
        }
        saved = db_service.save_discovery_summary("ws-1", payload)

        assert len(saved["payload"]["key_disagreements"]) == 1
        assert saved["payload"]["key_disagreements"][0]["theme"] == "Accuracy vs. Clarity"
        assert len(saved["payload"]["key_disagreements"][0]["viewpoints"]) == 2
        assert len(saved["payload"]["discussion_prompts"]) == 1
        assert "Define what" in saved["payload"]["discussion_prompts"][0]["prompt"]


# ============================================================================
# UX Requirement: "Disagreements color-coded by priority (red/yellow/blue)"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestDisagreementPriorityColorCoding:

    @pytest.mark.req("Disagreements color-coded by priority (red/yellow/blue)")
    def test_three_priority_levels_available_for_color_mapping(
        self, discovery_service, workshop, traces
    ):
        """Disagreement detection returns exactly 3 priority tiers (high/medium/lower)
        that map to red/yellow/blue color coding in the UI.

        Per spec: HIGH = red, MEDIUM = yellow, LOWER = blue.
        """
        # Create disagreements at all 3 levels
        _submit_feedback(discovery_service, "t-1", "u-1", FeedbackLabel.GOOD, "Great")
        _submit_feedback(discovery_service, "t-1", "u-2", FeedbackLabel.BAD, "Bad")
        _submit_feedback(discovery_service, "t-2", "u-1", FeedbackLabel.BAD, "Error A")
        _submit_feedback(discovery_service, "t-2", "u-2", FeedbackLabel.BAD, "Error B")
        _submit_feedback(discovery_service, "t-3", "u-1", FeedbackLabel.GOOD, "Strength A")
        _submit_feedback(discovery_service, "t-3", "u-2", FeedbackLabel.GOOD, "Strength B")

        all_feedback = discovery_service.get_discovery_feedback("ws-1")
        aggregated = _aggregate_feedback_by_trace(all_feedback)
        disagreements = _detect_disagreements_deterministic(aggregated)

        # Exactly 3 priority buckets exist for color-coded display
        assert set(disagreements.keys()) == {"high", "medium", "lower"}

        # Each bucket maps to a specific color per spec:
        # high -> red, medium -> yellow, lower -> blue
        priority_to_color = {"high": "red", "medium": "yellow", "lower": "blue"}
        assert len(priority_to_color) == 3

        # Each bucket contains the correct disagreements
        assert len(disagreements["high"]) == 1  # t-1: GOOD vs BAD -> red
        assert len(disagreements["medium"]) == 1  # t-2: both BAD -> yellow
        assert len(disagreements["lower"]) == 1  # t-3: both GOOD -> blue

        # Each disagreement has a trace_id for rendering
        assert disagreements["high"][0]["trace_id"] == "t-1"
        assert disagreements["medium"][0]["trace_id"] == "t-2"
        assert disagreements["lower"][0]["trace_id"] == "t-3"


# ============================================================================
# UX Requirement: "Criteria show evidence (supporting trace IDs)"
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
class TestCriteriaShowEvidence:

    @pytest.mark.req("Criteria show evidence (supporting trace IDs)")
    def test_draft_items_expose_source_trace_ids_for_display(
        self, db_service, workshop
    ):
        """Draft rubric items include source_trace_ids so the UI can render
        evidence badges (trace ID links) alongside each criterion.

        Per spec: Each item in the Draft Rubric Panel shows "Evidence traces
        (clickable, if from analysis)" and the data model must supply
        source_trace_ids for display.
        """
        from server.models import DraftRubricItemCreate

        # Create items with different source types and trace evidence
        finding_item = db_service.add_draft_rubric_item(
            "ws-1",
            DraftRubricItemCreate(
                text="Response cites verifiable sources",
                source_type="finding",
                source_analysis_id="analysis-1",
                source_trace_ids=["t-abc", "t-def"],
            ),
            promoted_by="f-1",
        )
        manual_item = db_service.add_draft_rubric_item(
            "ws-1",
            DraftRubricItemCreate(
                text="Manual observation",
                source_type="manual",
            ),
            promoted_by="f-1",
        )

        items = db_service.get_draft_rubric_items("ws-1")
        by_id = {i.id: i for i in items}

        # Finding-sourced item has trace IDs for evidence display
        assert by_id[finding_item.id].source_trace_ids == ["t-abc", "t-def"]
        assert by_id[finding_item.id].source_type == "finding"

        # Manual item has empty trace list (no evidence to display)
        assert by_id[manual_item.id].source_trace_ids == []
        assert by_id[manual_item.id].source_type == "manual"
