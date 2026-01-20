from datetime import datetime

import pytest

from server.models import Workshop, WorkshopPhase, WorkshopStatus


@pytest.mark.spec("DISCOVERY_TRACE_ASSIGNMENT_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_workshop_404_when_missing(async_client, override_get_db, monkeypatch):
    import server.routers.workshops as workshops_router

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            assert workshop_id == "missing"
            return None

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.get("/workshops/missing")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Workshop not found"


@pytest.mark.spec("DISCOVERY_TRACE_ASSIGNMENT_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_traces_requires_user_id(async_client, override_get_db):
    resp = await async_client.get("/workshops/w1/traces")
    assert resp.status_code == 400
    assert "user_id is required" in resp.json()["detail"]


@pytest.mark.spec("DISCOVERY_TRACE_ASSIGNMENT_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_workshop_success(async_client, override_get_db, monkeypatch):
    import server.routers.workshops as workshops_router

    workshop = Workshop(
        id="w1",
        name="W",
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
            assert workshop_id == "w1"
            return workshop

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.get("/workshops/w1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "w1"
    assert body["current_phase"] == "intake"
