"""Integration tests: Phase transition prerequisites enforced at HTTP level."""

import uuid

import pytest

from server.database import DiscoveryFindingDB, RubricDB

pytestmark = [
    pytest.mark.integration,
    pytest.mark.spec("TESTING_SPEC"),
    pytest.mark.asyncio,
]


# ---------------------------------------------------------------------------
# INTAKE -> DISCOVERY: requires traces
# ---------------------------------------------------------------------------

async def test_advance_to_discovery_requires_traces(client, seed_workshop):
    """Cannot advance to discovery when no traces exist."""
    ws = seed_workshop(phase="intake")
    resp = await client.post(f"/workshops/{ws.id}/advance-to-discovery")
    assert resp.status_code == 400
    assert "No traces uploaded" in resp.json()["detail"]


async def test_advance_to_discovery_succeeds_with_traces(client, seed_workshop, seed_trace):
    """Advance to discovery succeeds when traces are present."""
    ws = seed_workshop(phase="intake")
    seed_trace(ws.id)
    resp = await client.post(f"/workshops/{ws.id}/advance-to-discovery")
    assert resp.status_code == 200
    assert resp.json()["phase"] == "discovery"


async def test_advance_to_discovery_wrong_phase(client, seed_workshop, seed_trace):
    """Cannot advance to discovery from a non-intake phase."""
    ws = seed_workshop(phase="annotation")
    seed_trace(ws.id)
    resp = await client.post(f"/workshops/{ws.id}/advance-to-discovery")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# DISCOVERY -> RUBRIC: requires findings
# ---------------------------------------------------------------------------

async def test_advance_to_rubric_requires_findings(client, seed_workshop):
    """Cannot advance to rubric when no findings exist."""
    ws = seed_workshop(phase="discovery")
    resp = await client.post(f"/workshops/{ws.id}/advance-to-rubric")
    assert resp.status_code == 400
    assert "No discovery findings" in resp.json()["detail"]


async def test_advance_to_rubric_succeeds_with_findings(
    client, seed_workshop, seed_trace, integration_db
):
    """Advance to rubric succeeds when findings are present."""
    ws = seed_workshop(phase="discovery")
    trace = seed_trace(ws.id)
    finding = DiscoveryFindingDB(
        id=str(uuid.uuid4()),
        workshop_id=ws.id,
        trace_id=trace.id,
        user_id="user-1",
        insight="Interesting pattern",
    )
    integration_db.add(finding)
    integration_db.flush()

    resp = await client.post(f"/workshops/{ws.id}/advance-to-rubric")
    assert resp.status_code == 200
    assert resp.json()["phase"] == "rubric"


# ---------------------------------------------------------------------------
# RUBRIC -> ANNOTATION: requires rubric
# ---------------------------------------------------------------------------

async def test_advance_to_annotation_requires_rubric(client, seed_workshop):
    """Cannot advance to annotation when no rubric exists."""
    ws = seed_workshop(phase="rubric")
    resp = await client.post(f"/workshops/{ws.id}/advance-to-annotation")
    assert resp.status_code == 400
    assert "Rubric must be created" in resp.json()["detail"]


async def test_advance_to_annotation_succeeds_with_rubric(
    client, seed_workshop, integration_db
):
    """Advance to annotation succeeds when rubric is present."""
    ws = seed_workshop(phase="rubric")
    rubric = RubricDB(
        id=str(uuid.uuid4()),
        workshop_id=ws.id,
        question="Is the response helpful?",
        created_by="facilitator-1",
    )
    integration_db.add(rubric)
    integration_db.flush()

    resp = await client.post(f"/workshops/{ws.id}/advance-to-annotation")
    assert resp.status_code == 200
    assert resp.json()["phase"] == "annotation"


# ---------------------------------------------------------------------------
# 404 for missing workshop
# ---------------------------------------------------------------------------

async def test_advance_to_discovery_workshop_not_found(client):
    """Phase transition returns 404 for missing workshop."""
    resp = await client.post("/workshops/no-such-id/advance-to-discovery")
    assert resp.status_code == 404
