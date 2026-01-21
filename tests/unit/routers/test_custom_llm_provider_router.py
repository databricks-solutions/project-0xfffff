"""Unit tests for custom LLM provider API endpoints.

These tests verify the success criteria from CUSTOM_LLM_PROVIDER_SPEC.md:
- Configuration: Users can configure custom LLM provider via API
- Connection Testing: Test endpoint verifies connection works
- Status: Get endpoint returns current configuration status
- Delete: Remove configuration cleanly
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from server.database import CustomLLMProviderConfigDB
from server.models import Workshop, WorkshopPhase, WorkshopStatus


@pytest.mark.spec("CUSTOM_LLM_PROVIDER_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_custom_llm_provider_not_configured(async_client, override_get_db, monkeypatch):
    """GET returns not_configured status when no provider is set up."""
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=False,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_custom_llm_provider_config(self, workshop_id: str):
            return None

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.get("/workshops/w1/custom-llm-provider")
    assert resp.status_code == 200
    body = resp.json()
    assert body["workshop_id"] == "w1"
    assert body["is_configured"] is False
    assert body["is_enabled"] is False
    assert body["has_api_key"] is False


@pytest.mark.spec("CUSTOM_LLM_PROVIDER_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_custom_llm_provider_configured(async_client, override_get_db, monkeypatch):
    """GET returns configuration status when provider is configured."""
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=False,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )

    config = CustomLLMProviderConfigDB(
        id="cfg1",
        workshop_id="w1",
        provider_name="Azure OpenAI",
        base_url="https://my-resource.openai.azure.com/openai/deployments/gpt-4",
        model_name="gpt-4",
        is_enabled=True,
    )

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_custom_llm_provider_config(self, workshop_id: str):
            return config

    # Mock token storage to indicate key exists
    with patch("server.routers.workshops.token_storage") as mock_token_storage:
        mock_token_storage.get_token.return_value = "fake-api-key"
        monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

        resp = await async_client.get("/workshops/w1/custom-llm-provider")
        assert resp.status_code == 200
        body = resp.json()
        assert body["workshop_id"] == "w1"
        assert body["is_configured"] is True
        assert body["is_enabled"] is True
        assert body["provider_name"] == "Azure OpenAI"
        assert body["base_url"] == "https://my-resource.openai.azure.com/openai/deployments/gpt-4"
        assert body["model_name"] == "gpt-4"
        assert body["has_api_key"] is True


@pytest.mark.spec("CUSTOM_LLM_PROVIDER_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_custom_llm_provider(async_client, override_get_db, monkeypatch):
    """POST creates custom LLM provider configuration."""
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=False,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )

    created_config = None

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def create_custom_llm_provider_config(self, workshop_id: str, config_data):
            nonlocal created_config
            created_config = CustomLLMProviderConfigDB(
                id="cfg1",
                workshop_id=workshop_id,
                provider_name=config_data.provider_name,
                base_url=config_data.base_url,
                model_name=config_data.model_name,
                is_enabled=True,
            )
            return created_config

    # Mock token storage
    with patch("server.routers.workshops.token_storage") as mock_token_storage:
        monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

        resp = await async_client.post(
            "/workshops/w1/custom-llm-provider",
            json={
                "provider_name": "Azure OpenAI",
                "base_url": "https://my-resource.openai.azure.com/openai/deployments/gpt-4",
                "api_key": "my-secret-key",
                "model_name": "gpt-4",
            },
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["is_configured"] is True
        assert body["provider_name"] == "Azure OpenAI"
        assert body["has_api_key"] is True

        # Verify token was stored
        mock_token_storage.store_token.assert_called_once()
        call_args = mock_token_storage.store_token.call_args
        assert "custom_llm_w1" in call_args[0][0]
        assert call_args[0][1] == "my-secret-key"


@pytest.mark.spec("CUSTOM_LLM_PROVIDER_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_delete_custom_llm_provider(async_client, override_get_db, monkeypatch):
    """DELETE removes custom LLM provider configuration."""
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=False,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )

    deleted = False

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def delete_custom_llm_provider_config(self, workshop_id: str):
            nonlocal deleted
            deleted = True
            return True

    with patch("server.routers.workshops.token_storage") as mock_token_storage:
        monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

        resp = await async_client.delete("/workshops/w1/custom-llm-provider")
        assert resp.status_code == 204
        assert deleted is True

        # Verify token was removed
        mock_token_storage.delete_token.assert_called_once()
        call_args = mock_token_storage.delete_token.call_args
        assert "custom_llm_w1" in call_args[0][0]


@pytest.mark.spec("CUSTOM_LLM_PROVIDER_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_test_custom_llm_provider_success(async_client, override_get_db, monkeypatch):
    """POST /test verifies connection to custom LLM provider."""
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=False,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )

    config = CustomLLMProviderConfigDB(
        id="cfg1",
        workshop_id="w1",
        provider_name="Azure OpenAI",
        base_url="https://my-resource.openai.azure.com/openai/deployments/gpt-4",
        model_name="gpt-4",
        is_enabled=True,
    )

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_custom_llm_provider_config(self, workshop_id: str):
            return config

    # Mock token storage and httpx
    with patch("server.routers.workshops.token_storage") as mock_token_storage:
        mock_token_storage.get_token.return_value = "fake-api-key"

        with patch("server.routers.workshops.httpx.AsyncClient") as mock_client_cls:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)

            monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

            resp = await async_client.post("/workshops/w1/custom-llm-provider/test")
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
            assert "Azure OpenAI" in body["message"]
            assert "response_time_ms" in body


@pytest.mark.spec("CUSTOM_LLM_PROVIDER_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_test_custom_llm_provider_auth_failure(async_client, override_get_db, monkeypatch):
    """POST /test returns error on authentication failure."""
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=False,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )

    config = CustomLLMProviderConfigDB(
        id="cfg1",
        workshop_id="w1",
        provider_name="Azure OpenAI",
        base_url="https://my-resource.openai.azure.com/openai/deployments/gpt-4",
        model_name="gpt-4",
        is_enabled=True,
    )

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_custom_llm_provider_config(self, workshop_id: str):
            return config

    with patch("server.routers.workshops.token_storage") as mock_token_storage:
        mock_token_storage.get_token.return_value = "invalid-key"

        with patch("server.routers.workshops.httpx.AsyncClient") as mock_client_cls:
            mock_response = MagicMock()
            mock_response.status_code = 401
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)

            monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

            resp = await async_client.post("/workshops/w1/custom-llm-provider/test")
            assert resp.status_code == 200  # Returns 200 with success=false
            body = resp.json()
            assert body["success"] is False
            assert "AUTH_FAILED" in body.get("error_code", "")


@pytest.mark.spec("CUSTOM_LLM_PROVIDER_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_test_custom_llm_provider_no_config(async_client, override_get_db, monkeypatch):
    """POST /test returns 404 when no provider is configured."""
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=False,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_custom_llm_provider_config(self, workshop_id: str):
            return None

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post("/workshops/w1/custom-llm-provider/test")
    assert resp.status_code == 404
    assert "not configured" in resp.json()["detail"].lower()


@pytest.mark.spec("CUSTOM_LLM_PROVIDER_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_test_custom_llm_provider_no_api_key(async_client, override_get_db, monkeypatch):
    """POST /test returns error when API key is missing."""
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=False,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )

    config = CustomLLMProviderConfigDB(
        id="cfg1",
        workshop_id="w1",
        provider_name="Azure OpenAI",
        base_url="https://my-resource.openai.azure.com/openai/deployments/gpt-4",
        model_name="gpt-4",
        is_enabled=True,
    )

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_custom_llm_provider_config(self, workshop_id: str):
            return config

    with patch("server.routers.workshops.token_storage") as mock_token_storage:
        mock_token_storage.get_token.return_value = None  # No API key

        monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

        resp = await async_client.post("/workshops/w1/custom-llm-provider/test")
        assert resp.status_code == 400
        assert "api key" in resp.json()["detail"].lower()
