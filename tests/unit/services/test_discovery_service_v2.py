"""Tests for Assisted Facilitation v2 discovery service methods.

These tests verify spec requirements for the discovery service.
Tests that document unimplemented features are marked clearly.
"""

import pytest
from fastapi import HTTPException
from server.services.discovery_service import DiscoveryService
from server.services.classification_service import FINDING_CATEGORIES

pytestmark = pytest.mark.spec("ASSISTED_FACILITATION_SPEC")


class MockFinding:
    """Mock finding object that mimics database Finding model."""

    def __init__(self, id, trace_id, category, insight, user_id="user_1"):
        self.id = id
        self.trace_id = trace_id
        self.category = category
        self.insight = insight
        self.user_id = user_id
        self.created_at = None


class MockDatabaseService:
    """Mock database service for testing."""

    def __init__(self):
        self.workshops = {}
        self.traces = {}
        self.findings = []
        self.thresholds = {}
        self.disagreements = []

    def get_workshop(self, workshop_id):
        return self.workshops.get(workshop_id)

    def get_trace(self, trace_id):
        return self.traces.get(trace_id)

    def get_traces(self, workshop_id):
        return list(self.traces.values())

    def get_findings(self, workshop_id, user_id=None):
        return self.findings

    def add_classified_finding(self, workshop_id, finding):
        mock_finding = MockFinding(
            id=f"finding_{len(self.findings)}",
            trace_id=finding["trace_id"],
            category=finding.get("category"),
            insight=finding.get("text") or finding.get("insight", ""),
            user_id=finding.get("user_id", "user_1"),
        )
        self.findings.append(mock_finding)
        return {"id": mock_finding.id, **finding}

    def get_classified_findings_by_trace(self, workshop_id, trace_id):
        return [
            {
                "id": f.id,
                "trace_id": f.trace_id,
                "user_id": f.user_id,
                "text": f.insight,
                "category": f.category,
            }
            for f in self.findings
            if f.trace_id == trace_id
        ]

    def get_disagreements_by_trace(self, workshop_id, trace_id):
        return [d for d in self.disagreements if d.get("trace_id") == trace_id]

    def save_disagreement(self, workshop_id, trace_id, user_ids, finding_ids, summary):
        disagreement = {
            "id": f"disagreement_{len(self.disagreements)}",
            "workshop_id": workshop_id,
            "trace_id": trace_id,
            "user_ids": user_ids,
            "finding_ids": finding_ids,
            "summary": summary,
        }
        self.disagreements.append(disagreement)
        return disagreement

    def save_thresholds(self, workshop_id, trace_id, thresholds):
        self.thresholds[(workshop_id, trace_id)] = thresholds

    def get_thresholds(self, workshop_id, trace_id):
        return self.thresholds.get((workshop_id, trace_id), {})


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
class TestFuzzyProgress:
    """Tests for fuzzy progress (participant view).

    SPEC: "Participants see only fuzzy progress (no category bias)"
    """

    @pytest.mark.req("Participants see only fuzzy progress (no category bias)")
    def test_get_fuzzy_progress_empty(self, mock_db_session):
        """Test fuzzy progress with no traces."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type("Workshop", (), {"id": "test_workshop"})()
        service.db_service.workshops["test_workshop"] = workshop

        result = service.get_fuzzy_progress("test_workshop")
        assert result["status"] == "exploring"
        assert result["percentage"] == 0.0

    @pytest.mark.req("Participants see only fuzzy progress (no category bias)")
    def test_get_fuzzy_progress_exploring(self, mock_db_session):
        """Test fuzzy progress in exploring state."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type("Workshop", (), {"id": "test_workshop"})()
        service.db_service.workshops["test_workshop"] = workshop

        for i in range(10):
            trace = type("Trace", (), {"id": f"trace_{i}", "workshop_id": "test_workshop"})()
            service.db_service.traces[f"trace_{i}"] = trace

        result = service.get_fuzzy_progress("test_workshop")
        assert result["status"] == "exploring"
        assert 0 <= result["percentage"] < 30

    @pytest.mark.req("Participants see only fuzzy progress (no category bias)")
    def test_fuzzy_progress_does_not_expose_categories(self, mock_db_session):
        """Test that fuzzy progress doesn't reveal category breakdown.

        SPEC: Progress indicator "Does NOT show category-level breakdown"
        """
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type("Workshop", (), {"id": "test_workshop"})()
        service.db_service.workshops["test_workshop"] = workshop

        result = service.get_fuzzy_progress("test_workshop")

        # SPEC REQUIREMENT: No category details in participant view
        assert "categories" not in result
        assert "themes" not in result
        assert "edge_cases" not in result
        assert "boundary_conditions" not in result
        assert "failure_modes" not in result
        assert "missing_info" not in result


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
class TestFacilitatorStructuredView:
    """Tests for facilitator structured view.

    SPEC: "Facilitators see per-trace structured view with category breakdown"
    """

    @pytest.mark.req("Facilitators see per-trace structured view with category breakdown")
    def test_get_trace_discovery_state_structure(self, mock_db_session):
        """Test that get_trace_discovery_state returns correct structure."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type("Workshop", (), {"id": "test_workshop"})()
        trace = type("Trace", (), {"id": "test_trace", "workshop_id": "test_workshop"})()

        service.db_service.workshops["test_workshop"] = workshop
        service.db_service.traces["test_trace"] = trace

        result = service.get_trace_discovery_state("test_workshop", "test_trace")

        # Verify structure
        assert "trace_id" in result
        assert "categories" in result
        assert "disagreements" in result
        assert "questions" in result
        assert "thresholds" in result

        # Verify all category keys present
        expected_categories = set(FINDING_CATEGORIES)
        assert set(result["categories"].keys()) == expected_categories

    @pytest.mark.req("Facilitators see per-trace structured view with category breakdown")
    def test_discovery_state_includes_stored_findings(self, mock_db_session):
        """Test that discovery state includes findings from database.

        SPEC: Facilitators see findings grouped by category.
        This test will FAIL because get_trace_discovery_state returns placeholder data.
        """
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type("Workshop", (), {"id": "test_workshop"})()
        trace = type("Trace", (), {"id": "test_trace", "workshop_id": "test_workshop"})()

        service.db_service.workshops["test_workshop"] = workshop
        service.db_service.traces["test_trace"] = trace

        # Pre-populate with findings
        service.db_service.findings = [
            MockFinding("f1", "test_trace", "themes", "Good quality"),
            MockFinding("f2", "test_trace", "edge_cases", "Edge case"),
        ]

        result = service.get_trace_discovery_state("test_workshop", "test_trace")

        # SPEC REQUIREMENT: State must include stored findings
        # This FAILS because current implementation returns empty placeholder
        total_findings = sum(len(findings) for findings in result["categories"].values())
        assert total_findings > 0, (
            "SPEC VIOLATION: get_trace_discovery_state must query and return stored findings. "
            "Currently returns empty placeholder categories."
        )


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
class TestThresholdConfiguration:
    """Tests for threshold configuration.

    SPEC: "Thresholds are configurable per category per trace"
    """

    @pytest.mark.req("Thresholds are configurable per category per trace")
    def test_update_trace_thresholds_returns_structure(self, mock_db_session):
        """Test that update_trace_thresholds returns correct structure."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type("Workshop", (), {"id": "test_workshop"})()
        trace = type("Trace", (), {"id": "test_trace", "workshop_id": "test_workshop"})()

        service.db_service.workshops["test_workshop"] = workshop
        service.db_service.traces["test_trace"] = trace

        thresholds = {"themes": 5, "edge_cases": 3, "failure_modes": 4}
        result = service.update_trace_thresholds("test_workshop", "test_trace", thresholds)

        assert result["trace_id"] == "test_trace"
        assert result["thresholds"] == thresholds
        assert result["updated"] is True

    @pytest.mark.req("Thresholds are configurable per category per trace")
    def test_thresholds_are_persisted(self, mock_db_session):
        """Test that thresholds are actually saved to database.

        SPEC: Facilitators can adjust thresholds and they persist.
        This test will FAIL because thresholds aren't persisted.
        """
        service = DiscoveryService(mock_db_session)
        mock_db = MockDatabaseService()
        service.db_service = mock_db

        workshop = type("Workshop", (), {"id": "test_workshop"})()
        trace = type("Trace", (), {"id": "test_trace", "workshop_id": "test_workshop"})()

        mock_db.workshops["test_workshop"] = workshop
        mock_db.traces["test_trace"] = trace

        thresholds = {"themes": 5, "edge_cases": 3}
        service.update_trace_thresholds("test_workshop", "test_trace", thresholds)

        # Query discovery state - thresholds should be there
        state = service.get_trace_discovery_state("test_workshop", "test_trace")

        # SPEC REQUIREMENT: Thresholds must be persisted and returned
        # Updated thresholds should be reflected in the state
        assert state["thresholds"]["themes"] == 5, (
            f"Expected themes threshold to be 5, got {state['thresholds']['themes']}"
        )
        assert state["thresholds"]["edge_cases"] == 3, (
            f"Expected edge_cases threshold to be 3, got {state['thresholds']['edge_cases']}"
        )


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
class TestFindingPromotion:
    """Tests for finding promotion to draft rubric.

    SPEC: "Findings can be promoted to draft rubric staging area"
    """

    @pytest.mark.req("Findings can be promoted to draft rubric staging area")
    def test_promote_finding_returns_structure(self, mock_db_session):
        """Test that promote_finding returns correct structure."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type("Workshop", (), {"id": "test_workshop"})()
        service.db_service.workshops["test_workshop"] = workshop

        result = service.promote_finding("test_workshop", "finding_123", "facilitator_1")

        assert "id" in result
        assert "finding_id" in result
        assert "promoted_by" in result
        assert result["promoted_by"] == "facilitator_1"


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
class TestFindingClassification:
    """Tests for finding classification.

    SPEC: "Findings are classified in real-time as participants submit them"
    """

    @pytest.mark.req("Findings are classified in real-time as participants submit them")
    def test_submit_finding_v2_returns_classification(self, mock_db_session):
        """Test that submit_finding_v2 returns classification."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type("Workshop", (), {"id": "test_workshop"})()
        trace = type("Trace", (), {"id": "test_trace", "workshop_id": "test_workshop"})()

        service.db_service.workshops["test_workshop"] = workshop
        service.db_service.traces["test_trace"] = trace

        result = service.submit_finding_v2(
            "test_workshop",
            "test_trace",
            "user_1",
            "The response is missing important details",
        )

        assert "category" in result
        assert result["category"] in FINDING_CATEGORIES

    @pytest.mark.req("Findings are classified in real-time as participants submit them")
    def test_submit_finding_v2_accurate_classification(self, mock_db_session):
        """Test that classification is accurate for clear cases."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type("Workshop", (), {"id": "test_workshop"})()
        trace = type("Trace", (), {"id": "test_trace", "workshop_id": "test_workshop"})()

        service.db_service.workshops["test_workshop"] = workshop
        service.db_service.traces["test_trace"] = trace

        # Test missing_info classification
        result = service.submit_finding_v2(
            "test_workshop",
            "test_trace",
            "user_1",
            "Missing error handling for null inputs",
        )
        assert result["category"] == "missing_info"

        # Test failure_modes classification
        result = service.submit_finding_v2(
            "test_workshop",
            "test_trace",
            "user_1",
            "The code fails when given empty input",
        )
        assert result["category"] == "failure_modes"

    @pytest.mark.req("Findings are classified in real-time as participants submit them")
    def test_submit_finding_v2_persists_finding(self, mock_db_session):
        """Test that submit_finding_v2 persists the classified finding.

        SPEC: "Finding is stored with assigned category"
        This test will FAIL because submit_finding_v2 doesn't persist.
        """
        service = DiscoveryService(mock_db_session)
        mock_db = MockDatabaseService()
        service.db_service = mock_db

        workshop = type("Workshop", (), {"id": "test_workshop"})()
        trace = type("Trace", (), {"id": "test_trace", "workshop_id": "test_workshop"})()

        mock_db.workshops["test_workshop"] = workshop
        mock_db.traces["test_trace"] = trace

        service.submit_finding_v2(
            "test_workshop",
            "test_trace",
            "user_1",
            "Missing documentation",
        )

        # SPEC REQUIREMENT: Finding must be persisted
        assert len(mock_db.findings) > 0, (
            "SPEC VIOLATION: submit_finding_v2 must persist findings. "
            "Currently it only returns the result without saving to database."
        )
