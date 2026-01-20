import pytest


@pytest.mark.spec("BUILD_AND_DEPLOY_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_health_endpoint(async_client):
    resp = await async_client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "healthy"}
