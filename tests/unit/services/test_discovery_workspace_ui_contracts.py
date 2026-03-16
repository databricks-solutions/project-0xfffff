"""Tests for DISCOVERY_SPEC facilitator workspace UI data contracts.

These tests verify the backend data models and services that underpin the
facilitator workspace UI requirements (trace-specific findings, promote action,
trace reference badges). They ensure the data contracts deliver the information
the frontend needs to render these features.

Uses real in-memory SQLite (same pattern as test_draft_rubric_promotion.py).
"""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import (
    Base,
    DiscoveryAnalysisDB,
    TraceDB,
    WorkshopDB,
)
from server.models import (
    DraftRubricItem,
    DraftRubricItemCreate,
    Finding,
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
        current_phase="discovery",
        discovery_started=True,
        active_discovery_trace_ids=["t-1", "t-2", "t-3"],
    )
    test_db.add(ws)
    test_db.commit()
    return ws


@pytest.fixture
def traces(test_db, workshop):
    t1 = TraceDB(id="t-1", workshop_id="ws-1", input="What is AI?", output="AI is artificial intelligence.")
    t2 = TraceDB(id="t-2", workshop_id="ws-1", input="Explain ML", output="ML is machine learning.")
    t3 = TraceDB(id="t-3", workshop_id="ws-1", input="Define NLP", output="NLP processes language.")
    test_db.add_all([t1, t2, t3])
    test_db.commit()
    return [t1, t2, t3]


@pytest.fixture
def analysis_with_findings(test_db, workshop):
    """Create an analysis record with trace-specific and cross-trace findings."""
    findings = [
        {"text": "Trace-specific: accuracy concern", "evidence_trace_ids": ["t-1"], "priority": "medium"},
        {"text": "Cross-trace: brevity preference varies", "evidence_trace_ids": ["t-1", "t-2", "t-3"], "priority": "high"},
        {"text": "Cross-trace: factual accuracy valued", "evidence_trace_ids": ["t-2", "t-3"], "priority": "high"},
    ]
    analysis = DiscoveryAnalysisDB(
        id="analysis-1",
        workshop_id="ws-1",
        template_used="evaluation_criteria",
        analysis_data="Summary text about findings.",
        findings=json.dumps(findings),
        disagreements=json.dumps({"high": [], "medium": [], "lower": []}),
        participant_count=3,
        model_used="claude-sonnet-4.5",
    )
    test_db.add(analysis)
    test_db.commit()
    return analysis


# ---------------------------------------------------------------------------
# Trace-specific findings on trace cards
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestTraceSpecificFindings:
    """Findings with evidence_trace_ids enable the UI to pin trace-specific
    findings on the correct trace card."""

    @pytest.mark.req("Trace-specific analysis findings appear on the trace card, pinned above feedback (collapsible)")
    def test_findings_have_evidence_trace_ids_for_card_pinning(self, test_db, analysis_with_findings):
        """Analysis findings include evidence_trace_ids so the UI can filter
        and pin trace-specific findings to the correct trace card."""
        analysis = test_db.query(DiscoveryAnalysisDB).filter_by(id="analysis-1").first()
        findings = json.loads(analysis.findings)

        # Each finding has the evidence_trace_ids field
        for finding in findings:
            assert "evidence_trace_ids" in finding
            assert isinstance(finding["evidence_trace_ids"], list)

        # Simulate the UI filtering: findings with exactly one trace ID
        # are trace-specific and should appear on that trace's card
        trace_specific = [f for f in findings if len(f["evidence_trace_ids"]) == 1]
        assert len(trace_specific) == 1
        assert trace_specific[0]["text"] == "Trace-specific: accuracy concern"
        assert trace_specific[0]["evidence_trace_ids"] == ["t-1"]

        # Cross-trace findings (2+ trace IDs) go to the summary section
        cross_trace = [f for f in findings if len(f["evidence_trace_ids"]) > 1]
        assert len(cross_trace) == 2

    @pytest.mark.req("Trace-specific analysis findings appear on the trace card, pinned above feedback (collapsible)")
    def test_finding_model_validates_evidence_trace_ids(self):
        """The Finding model validates evidence_trace_ids as a list of strings."""
        finding = Finding(
            text="Test finding",
            evidence_trace_ids=["t-1", "t-2"],
            priority="high",
        )
        assert finding.evidence_trace_ids == ["t-1", "t-2"]
        assert finding.text == "Test finding"
        assert finding.priority == "high"


# ---------------------------------------------------------------------------
# Promote action: finding → draft rubric item
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestPromoteAction:
    """The promote action creates a draft rubric item from a finding/disagreement,
    which the UI renders as moving an item from the trace feed into the sidebar."""

    @pytest.mark.req("Promote action visibly moves items from trace feed/summary into the sidebar")
    def test_promote_creates_draft_item_with_source_tracing(self, db_service, workshop, traces):
        """Promoting a finding creates a draft rubric item that carries source info,
        enabling the UI to show the item in the sidebar with trace references."""
        data = DraftRubricItemCreate(
            text="Accuracy of factual claims varies",
            source_type="finding",
            source_analysis_id="analysis-1",
            source_trace_ids=["t-1", "t-2"],
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        # The item exists in the draft rubric (sidebar data source)
        items = db_service.get_draft_rubric_items("ws-1")
        assert len(items) == 1
        assert items[0].text == "Accuracy of factual claims varies"
        assert items[0].source_type == "finding"
        assert items[0].source_trace_ids == ["t-1", "t-2"]

    @pytest.mark.req("Promote action visibly moves items from trace feed/summary into the sidebar")
    def test_promote_disagreement_creates_draft_item(self, db_service, workshop, traces):
        """Promoting a disagreement from the trace card also creates a sidebar item."""
        data = DraftRubricItemCreate(
            text="Reviewers disagree on brevity vs completeness",
            source_type="disagreement",
            source_analysis_id="analysis-1",
            source_trace_ids=["t-1"],
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        items = db_service.get_draft_rubric_items("ws-1")
        assert len(items) == 1
        assert items[0].source_type == "disagreement"
        assert items[0].promoted_by == "f-1"


# ---------------------------------------------------------------------------
# Draft rubric items expose trace reference data for badge rendering
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestTraceReferenceBadges:
    """Draft rubric items include source_trace_ids which the UI renders as
    interactive trace reference badges."""

    @pytest.mark.req("Draft rubric items show trace reference badges (interactive: hover for preview, click to scroll)")
    def test_draft_items_carry_source_trace_ids_for_badges(self, db_service, workshop, traces):
        """Draft rubric items include source_trace_ids, providing the data
        the UI needs to render trace reference badges."""
        # Create items from different sources with trace IDs
        finding_item = db_service.add_draft_rubric_item(
            "ws-1",
            DraftRubricItemCreate(
                text="Accuracy matters",
                source_type="finding",
                source_trace_ids=["t-1", "t-2"],
            ),
            promoted_by="f-1",
        )
        manual_item = db_service.add_draft_rubric_item(
            "ws-1",
            DraftRubricItemCreate(
                text="Manual criterion",
                source_type="manual",
                source_trace_ids=[],
            ),
            promoted_by="f-1",
        )

        items = db_service.get_draft_rubric_items("ws-1")
        by_text = {i.text: i for i in items}

        # Finding-sourced item has trace references for badge rendering
        assert by_text["Accuracy matters"].source_trace_ids == ["t-1", "t-2"]

        # Manual item has no trace references (no badges to show)
        assert by_text["Manual criterion"].source_trace_ids == []

    @pytest.mark.req("Draft rubric items show trace reference badges (interactive: hover for preview, click to scroll)")
    def test_source_trace_ids_preserved_through_group_assignment(self, db_service, workshop, traces):
        """Trace reference data survives group assignment operations."""
        item = db_service.add_draft_rubric_item(
            "ws-1",
            DraftRubricItemCreate(
                text="Evidence-backed criterion",
                source_type="finding",
                source_trace_ids=["t-1", "t-3"],
            ),
            promoted_by="f-1",
        )

        # Apply group assignment
        db_service.apply_draft_rubric_groups(
            "ws-1",
            [{"name": "Quality", "item_ids": [item.id]}],
        )

        # Trace references still present after grouping
        items = db_service.get_draft_rubric_items("ws-1")
        assert len(items) == 1
        assert items[0].source_trace_ids == ["t-1", "t-3"]
        assert items[0].group_name == "Quality"
