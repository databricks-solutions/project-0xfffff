"""Tests for discovery analysis router endpoints (Step 2).

Tests the 3 API endpoints for discovery findings synthesis:
  - POST /{workshop_id}/analyze-discovery
  - GET  /{workshop_id}/discovery-analysis
  - GET  /{workshop_id}/discovery-analysis/{analysis_id}

Uses FastAPI TestClient with mocked DatabaseService and DiscoveryAnalysisService.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.unit
class TestAnalyzeDiscovery:
    """POST /{workshop_id}/analyze-discovery"""

    @pytest.mark.req("Facilitator can trigger analysis at any time (even partial feedback)")
    @pytest.mark.asyncio
    async def test_trigger_analysis_success(self, async_client, override_get_db, monkeypatch):
        """Successful analysis returns the analysis result dict."""
        import server.routers.workshops as ws_mod

        mock_workshop = MagicMock()
        mock_workshop.id = "ws-1"

        mock_db_svc = MagicMock()
        mock_db_svc.get_workshop.return_value = mock_workshop

        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        analysis_result = {
            "id": "analysis-1",
            "workshop_id": "ws-1",
            "template_used": "evaluation_criteria",
            "analysis_data": "# Analysis\nSome findings...",
            "findings": [{"text": "Criterion 1", "evidence_trace_ids": ["t-1"], "priority": "high"}],
            "disagreements": {"high": [], "medium": [], "lower": []},
            "participant_count": 3,
            "model_used": "databricks-claude-sonnet-4-5",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }

        mock_analysis_svc = MagicMock()
        mock_analysis_svc.run_analysis.return_value = analysis_result

        mock_databricks_svc = MagicMock()

        with patch(
            "server.services.databricks_service.DatabricksService", return_value=mock_databricks_svc
        ), patch(
            "server.services.discovery_analysis_service.DiscoveryAnalysisService",
            return_value=mock_analysis_svc,
        ):
            resp = await async_client.post(
                "/workshops/ws-1/analyze-discovery",
                json={"template": "evaluation_criteria", "model": "databricks-claude-sonnet-4-5"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "analysis-1"
        assert data["workshop_id"] == "ws-1"
        assert data["template_used"] == "evaluation_criteria"
        assert data["participant_count"] == 3
        assert len(data["findings"]) == 1
        assert data["findings"][0]["text"] == "Criterion 1"

        mock_analysis_svc.run_analysis.assert_called_once_with(
            workshop_id="ws-1",
            template="evaluation_criteria",
            model="databricks-claude-sonnet-4-5",
        )

    @pytest.mark.req("Facilitator can trigger analysis at any time (even partial feedback)")
    @pytest.mark.asyncio
    async def test_trigger_analysis_with_themes_template(self, async_client, override_get_db, monkeypatch):
        """Analysis works with the themes_patterns template."""
        import server.routers.workshops as ws_mod

        mock_db_svc = MagicMock()
        mock_db_svc.get_workshop.return_value = MagicMock(id="ws-1")
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        analysis_result = {
            "id": "analysis-2",
            "workshop_id": "ws-1",
            "template_used": "themes_patterns",
            "analysis_data": "# Themes\nSome themes...",
            "findings": [{"text": "Theme 1", "evidence_trace_ids": ["t-2"], "priority": "medium"}],
            "disagreements": {"high": [], "medium": [], "lower": []},
            "participant_count": 2,
            "model_used": "databricks-claude-sonnet-4-5",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }

        mock_analysis_svc = MagicMock()
        mock_analysis_svc.run_analysis.return_value = analysis_result

        with patch(
            "server.services.databricks_service.DatabricksService", return_value=MagicMock()
        ), patch(
            "server.services.discovery_analysis_service.DiscoveryAnalysisService", return_value=mock_analysis_svc
        ):
            resp = await async_client.post(
                "/workshops/ws-1/analyze-discovery",
                json={"template": "themes_patterns", "model": "databricks-claude-sonnet-4-5"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["template_used"] == "themes_patterns"
        assert data["findings"][0]["text"] == "Theme 1"

        mock_analysis_svc.run_analysis.assert_called_once_with(
            workshop_id="ws-1",
            template="themes_patterns",
            model="databricks-claude-sonnet-4-5",
        )

    @pytest.mark.req("Facilitator can trigger analysis at any time (even partial feedback)")
    @pytest.mark.asyncio
    async def test_trigger_analysis_404_missing_workshop(self, async_client, override_get_db, monkeypatch):
        """Returns 404 when the workshop does not exist."""
        import server.routers.workshops as ws_mod

        mock_db_svc = MagicMock()
        mock_db_svc.get_workshop.return_value = None
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        resp = await async_client.post(
            "/workshops/nonexistent/analyze-discovery",
            json={"template": "evaluation_criteria"},
        )

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Workshop not found"

    @pytest.mark.req("Facilitator can trigger analysis at any time (even partial feedback)")
    @pytest.mark.asyncio
    async def test_trigger_analysis_400_missing_databricks_config(
        self, async_client, override_get_db, monkeypatch
    ):
        """Returns 400 when Databricks config is missing."""
        import server.routers.workshops as ws_mod

        mock_db_svc = MagicMock()
        mock_db_svc.get_workshop.return_value = MagicMock(id="ws-1")
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        with patch(
            "server.services.databricks_service.DatabricksService",
            side_effect=ValueError("No Databricks host configured"),
        ):
            resp = await async_client.post(
                "/workshops/ws-1/analyze-discovery",
                json={"template": "evaluation_criteria"},
            )

        assert resp.status_code == 400
        assert "Databricks configuration required" in resp.json()["detail"]

    @pytest.mark.req("Facilitator can trigger analysis at any time (even partial feedback)")
    @pytest.mark.asyncio
    async def test_trigger_analysis_400_no_feedback(self, async_client, override_get_db, monkeypatch):
        """Returns 400 when there is no feedback to analyze (ValueError from service)."""
        import server.routers.workshops as ws_mod

        mock_db_svc = MagicMock()
        mock_db_svc.get_workshop.return_value = MagicMock(id="ws-1")
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        mock_analysis_svc = MagicMock()
        mock_analysis_svc.run_analysis.side_effect = ValueError(
            "No discovery feedback available for analysis"
        )

        with patch(
            "server.services.databricks_service.DatabricksService", return_value=MagicMock()
        ), patch(
            "server.services.discovery_analysis_service.DiscoveryAnalysisService", return_value=mock_analysis_svc
        ):
            resp = await async_client.post(
                "/workshops/ws-1/analyze-discovery",
                json={"template": "evaluation_criteria"},
            )

        assert resp.status_code == 400
        assert "No discovery feedback available" in resp.json()["detail"]

    @pytest.mark.req("Facilitator can trigger analysis at any time (even partial feedback)")
    @pytest.mark.asyncio
    async def test_trigger_analysis_500_llm_failure(self, async_client, override_get_db, monkeypatch):
        """Returns 500 when the LLM call fails unexpectedly."""
        import server.routers.workshops as ws_mod

        mock_db_svc = MagicMock()
        mock_db_svc.get_workshop.return_value = MagicMock(id="ws-1")
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        mock_analysis_svc = MagicMock()
        mock_analysis_svc.run_analysis.side_effect = RuntimeError("LLM connection timeout")

        with patch(
            "server.services.databricks_service.DatabricksService", return_value=MagicMock()
        ), patch(
            "server.services.discovery_analysis_service.DiscoveryAnalysisService", return_value=mock_analysis_svc
        ):
            resp = await async_client.post(
                "/workshops/ws-1/analyze-discovery",
                json={"template": "evaluation_criteria"},
            )

        assert resp.status_code == 500
        assert "Analysis failed" in resp.json()["detail"]
        assert "LLM connection timeout" in resp.json()["detail"]

    @pytest.mark.req("Facilitator can trigger analysis at any time (even partial feedback)")
    @pytest.mark.asyncio
    async def test_trigger_analysis_uses_default_template(self, async_client, override_get_db, monkeypatch):
        """When no template is specified in the body, the default (evaluation_criteria) is used."""
        import server.routers.workshops as ws_mod

        mock_db_svc = MagicMock()
        mock_db_svc.get_workshop.return_value = MagicMock(id="ws-1")
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        mock_analysis_svc = MagicMock()
        mock_analysis_svc.run_analysis.return_value = {
            "id": "analysis-default",
            "workshop_id": "ws-1",
            "template_used": "evaluation_criteria",
            "analysis_data": "Analysis text",
            "findings": [],
            "disagreements": {"high": [], "medium": [], "lower": []},
            "participant_count": 1,
            "model_used": "databricks-claude-sonnet-4-5",
        }

        with patch(
            "server.services.databricks_service.DatabricksService", return_value=MagicMock()
        ), patch(
            "server.services.discovery_analysis_service.DiscoveryAnalysisService", return_value=mock_analysis_svc
        ):
            resp = await async_client.post(
                "/workshops/ws-1/analyze-discovery",
                json={},  # no template specified
            )

        assert resp.status_code == 200
        # Default template is evaluation_criteria
        mock_analysis_svc.run_analysis.assert_called_once_with(
            workshop_id="ws-1",
            template="evaluation_criteria",
            model="databricks-claude-sonnet-4-5",
        )


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.unit
class TestListDiscoveryAnalyses:
    """GET /{workshop_id}/discovery-analysis"""

    @pytest.mark.req("Each analysis run creates a new record (history preserved)")
    @pytest.mark.asyncio
    async def test_list_analyses_returns_newest_first(self, async_client, override_get_db, monkeypatch):
        """Listing analyses returns results ordered newest first."""
        import server.routers.workshops as ws_mod

        older_ts = datetime(2026, 1, 1, 10, 0, 0)
        newer_ts = datetime(2026, 1, 2, 10, 0, 0)

        record_older = MagicMock()
        record_older.id = "analysis-old"
        record_older.workshop_id = "ws-1"
        record_older.template_used = "evaluation_criteria"
        record_older.analysis_data = "Old analysis"
        record_older.findings = [{"text": "Old finding", "priority": "low"}]
        record_older.disagreements = {"high": [], "medium": [], "lower": []}
        record_older.participant_count = 2
        record_older.model_used = "databricks-claude-sonnet-4-5"
        record_older.created_at = older_ts
        record_older.updated_at = older_ts

        record_newer = MagicMock()
        record_newer.id = "analysis-new"
        record_newer.workshop_id = "ws-1"
        record_newer.template_used = "themes_patterns"
        record_newer.analysis_data = "New analysis"
        record_newer.findings = [{"text": "New finding", "priority": "high"}]
        record_newer.disagreements = {"high": [{"trace_id": "t-1"}], "medium": [], "lower": []}
        record_newer.participant_count = 5
        record_newer.model_used = "databricks-claude-sonnet-4-5"
        record_newer.created_at = newer_ts
        record_newer.updated_at = newer_ts

        mock_db_svc = MagicMock()
        mock_db_svc.get_workshop.return_value = MagicMock(id="ws-1")
        # Return newest first as the DB service does
        mock_db_svc.get_discovery_analyses.return_value = [record_newer, record_older]
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        resp = await async_client.get("/workshops/ws-1/discovery-analysis")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["id"] == "analysis-new"
        assert data[1]["id"] == "analysis-old"
        assert data[0]["participant_count"] == 5
        assert data[1]["participant_count"] == 2

        mock_db_svc.get_discovery_analyses.assert_called_once_with("ws-1", template=None)

    @pytest.mark.req("Analysis record stores which template was used")
    @pytest.mark.asyncio
    async def test_list_analyses_filter_by_template(self, async_client, override_get_db, monkeypatch):
        """Listing analyses with template filter passes it through to the DB service."""
        import server.routers.workshops as ws_mod

        record = MagicMock()
        record.id = "analysis-1"
        record.workshop_id = "ws-1"
        record.template_used = "themes_patterns"
        record.analysis_data = "Themes analysis"
        record.findings = []
        record.disagreements = {"high": [], "medium": [], "lower": []}
        record.participant_count = 3
        record.model_used = "databricks-claude-sonnet-4-5"
        record.created_at = datetime(2026, 1, 1)
        record.updated_at = datetime(2026, 1, 1)

        mock_db_svc = MagicMock()
        mock_db_svc.get_workshop.return_value = MagicMock(id="ws-1")
        mock_db_svc.get_discovery_analyses.return_value = [record]
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        resp = await async_client.get("/workshops/ws-1/discovery-analysis?template=themes_patterns")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["template_used"] == "themes_patterns"

        mock_db_svc.get_discovery_analyses.assert_called_once_with("ws-1", template="themes_patterns")

    @pytest.mark.req("Each analysis run creates a new record (history preserved)")
    @pytest.mark.asyncio
    async def test_list_analyses_empty(self, async_client, override_get_db, monkeypatch):
        """Listing analyses returns empty list when none exist."""
        import server.routers.workshops as ws_mod

        mock_db_svc = MagicMock()
        mock_db_svc.get_workshop.return_value = MagicMock(id="ws-1")
        mock_db_svc.get_discovery_analyses.return_value = []
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        resp = await async_client.get("/workshops/ws-1/discovery-analysis")

        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.req("Each analysis run creates a new record (history preserved)")
    @pytest.mark.asyncio
    async def test_list_analyses_404_missing_workshop(self, async_client, override_get_db, monkeypatch):
        """Returns 404 when the workshop does not exist."""
        import server.routers.workshops as ws_mod

        mock_db_svc = MagicMock()
        mock_db_svc.get_workshop.return_value = None
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        resp = await async_client.get("/workshops/nonexistent/discovery-analysis")

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Workshop not found"


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.unit
class TestGetDiscoveryAnalysis:
    """GET /{workshop_id}/discovery-analysis/{analysis_id}"""

    @pytest.mark.req("Each analysis run creates a new record (history preserved)")
    @pytest.mark.asyncio
    async def test_get_analysis_by_id(self, async_client, override_get_db, monkeypatch):
        """Retrieve a single analysis by ID returns full data."""
        import server.routers.workshops as ws_mod

        ts = datetime(2026, 1, 15, 14, 30, 0)
        record = MagicMock()
        record.id = "analysis-42"
        record.workshop_id = "ws-1"
        record.template_used = "evaluation_criteria"
        record.analysis_data = "# Full Analysis\nDetailed markdown..."
        record.findings = [
            {"text": "Accuracy criterion", "evidence_trace_ids": ["t-1", "t-3"], "priority": "high"},
            {"text": "Tone criterion", "evidence_trace_ids": ["t-2"], "priority": "medium"},
        ]
        record.disagreements = {
            "high": [{"trace_id": "t-1", "summary": "Rating split"}],
            "medium": [],
            "lower": [],
        }
        record.participant_count = 4
        record.model_used = "databricks-claude-sonnet-4-5"
        record.created_at = ts
        record.updated_at = ts

        mock_db_svc = MagicMock()
        mock_db_svc.get_discovery_analysis.return_value = record
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        resp = await async_client.get("/workshops/ws-1/discovery-analysis/analysis-42")

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "analysis-42"
        assert data["workshop_id"] == "ws-1"
        assert data["template_used"] == "evaluation_criteria"
        assert data["participant_count"] == 4
        assert data["model_used"] == "databricks-claude-sonnet-4-5"
        assert len(data["findings"]) == 2
        assert data["findings"][0]["text"] == "Accuracy criterion"
        assert data["findings"][0]["priority"] == "high"
        assert data["disagreements"]["high"][0]["trace_id"] == "t-1"
        assert data["created_at"] == "2026-01-15T14:30:00"

    @pytest.mark.req("Each analysis run creates a new record (history preserved)")
    @pytest.mark.asyncio
    async def test_get_analysis_404_missing(self, async_client, override_get_db, monkeypatch):
        """Returns 404 when analysis_id does not exist."""
        import server.routers.workshops as ws_mod

        mock_db_svc = MagicMock()
        mock_db_svc.get_discovery_analysis.return_value = None
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        resp = await async_client.get("/workshops/ws-1/discovery-analysis/nonexistent")

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Analysis not found"

    @pytest.mark.req("Each analysis run creates a new record (history preserved)")
    @pytest.mark.asyncio
    async def test_get_analysis_404_wrong_workshop(self, async_client, override_get_db, monkeypatch):
        """Returns 404 when analysis belongs to a different workshop."""
        import server.routers.workshops as ws_mod

        record = MagicMock()
        record.id = "analysis-42"
        record.workshop_id = "ws-other"  # different workshop

        mock_db_svc = MagicMock()
        mock_db_svc.get_discovery_analysis.return_value = record
        monkeypatch.setattr(ws_mod, "DatabaseService", MagicMock(return_value=mock_db_svc))

        resp = await async_client.get("/workshops/ws-1/discovery-analysis/analysis-42")

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Analysis not found"
