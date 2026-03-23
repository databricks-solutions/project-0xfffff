"""Integration tests: Workshop CRUD through HTTP → DB → response."""

import pytest

pytestmark = [
    pytest.mark.integration,
    pytest.mark.spec("TESTING_SPEC"),
    pytest.mark.asyncio,
]


async def test_create_workshop(client):
    """POST /workshops/ creates a workshop and returns 201."""
    resp = await client.post("/workshops/", json={
        "name": "My Workshop",
        "description": "A test workshop",
        "facilitator_id": "fac-1",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Workshop"
    assert data["facilitator_id"] == "fac-1"
    assert data["current_phase"] == "intake"
    assert "id" in data


async def test_get_workshop(client, seed_workshop):
    """GET /workshops/{id} retrieves the workshop."""
    ws = seed_workshop(name="Fetch Me")
    resp = await client.get(f"/workshops/{ws.id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Fetch Me"


async def test_get_workshop_not_found(client):
    """GET /workshops/{id} returns 404 for missing workshop."""
    resp = await client.get("/workshops/nonexistent-id")
    assert resp.status_code == 404


async def test_list_workshops(client, seed_workshop):
    """GET /workshops/ returns all workshops."""
    seed_workshop(name="WS-A")
    seed_workshop(name="WS-B")
    resp = await client.get("/workshops/")
    assert resp.status_code == 200
    names = [w["name"] for w in resp.json()]
    assert "WS-A" in names
    assert "WS-B" in names


async def test_list_workshops_filtered_by_facilitator(client, seed_workshop):
    """GET /workshops/?facilitator_id=X filters results."""
    seed_workshop(name="Owned", facilitator_id="fac-A")
    seed_workshop(name="Other", facilitator_id="fac-B")
    resp = await client.get("/workshops/", params={"facilitator_id": "fac-A"})
    assert resp.status_code == 200
    data = resp.json()
    assert all(w["facilitator_id"] == "fac-A" for w in data)
    assert any(w["name"] == "Owned" for w in data)
