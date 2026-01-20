import pytest


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_databricks_test_connection_success(async_client, monkeypatch):
    import server.routers.databricks as databricks_router

    class FakeService:
        def test_connection(self):
            return {
                "status": "connected",
                "workspace_url": "https://example.cloud.databricks.com",
                "endpoints_count": 2,
                "error": None,
                "message": "ok",
            }

    def fake_create(*, workspace_url: str, token: str):
        assert workspace_url == "https://example.cloud.databricks.com"
        assert token == "tok"
        return FakeService()

    monkeypatch.setattr(databricks_router, "create_databricks_service", fake_create)

    resp = await async_client.post(
        "/databricks/test-connection",
        json={"workspace_url": "https://example.cloud.databricks.com", "token": "tok"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "connected"
    assert body["endpoints_count"] == 2


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_databricks_call_endpoint_success(async_client, monkeypatch):
    import server.routers.databricks as databricks_router

    class FakeService:
        def call_serving_endpoint(self, **params):
            assert params["endpoint_name"] == "ep"
            assert params["prompt"] == "hello"
            assert params["temperature"] == 0.0
            return {"choices": [{"text": "ok"}]}

    monkeypatch.setattr(
        databricks_router,
        "create_databricks_service",
        lambda *, workspace_url, token: FakeService(),
    )

    resp = await async_client.post(
        "/databricks/call",
        json={
            "request": {"endpoint_name": "ep", "prompt": "hello", "temperature": 0.0},
            "config": {"workspace_url": "x", "token": "y"},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["endpoint_name"] == "ep"
    assert body["data"] == {"choices": [{"text": "ok"}]}


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_databricks_chat_endpoint_success(async_client, monkeypatch):
    import server.routers.databricks as databricks_router

    class FakeService:
        def call_chat_completion(self, **params):
            assert params["endpoint_name"] == "ep"
            assert params["messages"] == [{"role": "user", "content": "hi"}]
            return {"choices": [{"message": {"content": "ok"}}]}

    monkeypatch.setattr(
        databricks_router,
        "create_databricks_service",
        lambda *, workspace_url, token: FakeService(),
    )

    resp = await async_client.post(
        "/databricks/chat",
        json={
            "request": {
                "endpoint_name": "ep",
                "messages": [{"role": "user", "content": "hi"}],
                "temperature": 0.2,
            },
            "config": {"workspace_url": "x", "token": "y"},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["endpoint_name"] == "ep"


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_databricks_judge_evaluate_without_workshop_id_uses_request_config(async_client, monkeypatch):
    import server.routers.databricks as databricks_router

    class FakeDatabricksService:
        def __init__(self, *, workspace_url: str, token: str, init_sdk: bool):
            assert workspace_url == "https://example.cloud.databricks.com"
            assert token == "tok"
            assert init_sdk is True

        def call_serving_endpoint(self, *, endpoint_name: str, prompt: str, temperature: float, max_tokens: int):
            assert endpoint_name == "ep"
            assert prompt == "hello"
            return {"choices": [{"message": {"content": "ok"}}]}

    monkeypatch.setattr(databricks_router, "DatabricksService", FakeDatabricksService)

    resp = await async_client.post(
        "/databricks/judge-evaluate",
        json={
            "endpoint_name": "ep",
            "prompt": "hello",
            "config": {"workspace_url": "https://example.cloud.databricks.com", "token": "tok"},
            "temperature": 0.0,
            "max_tokens": 10,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["endpoint_name"] == "ep"
