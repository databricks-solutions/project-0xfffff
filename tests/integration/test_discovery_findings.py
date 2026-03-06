"""Integration tests: Discovery finding submission with upsert semantics."""

import pytest

pytestmark = [
    pytest.mark.integration,
    pytest.mark.spec("TESTING_SPEC"),
    pytest.mark.asyncio,
]


async def test_submit_finding(client, seed_workshop, seed_trace):
    """POST /workshops/{id}/findings creates a discovery finding."""
    ws = seed_workshop()
    trace = seed_trace(ws.id)
    resp = await client.post(f"/workshops/{ws.id}/findings", json={
        "trace_id": trace.id,
        "user_id": "user-1",
        "insight": "Model hallucinates dates",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["trace_id"] == trace.id
    assert data["insight"] == "Model hallucinates dates"


async def test_finding_upsert_same_user_same_trace(client, seed_workshop, seed_trace):
    """Submitting again for same (workshop, trace, user) updates the insight."""
    ws = seed_workshop()
    trace = seed_trace(ws.id)

    # First submission
    await client.post(f"/workshops/{ws.id}/findings", json={
        "trace_id": trace.id,
        "user_id": "user-1",
        "insight": "First thought",
    })

    # Second submission (upsert)
    await client.post(f"/workshops/{ws.id}/findings", json={
        "trace_id": trace.id,
        "user_id": "user-1",
        "insight": "Revised thought",
    })

    # Verify only one finding exists with the updated insight
    list_resp = await client.get(
        f"/workshops/{ws.id}/findings", params={"user_id": "user-1"}
    )
    assert list_resp.status_code == 200
    findings = list_resp.json()
    assert len(findings) == 1
    assert findings[0]["insight"] == "Revised thought"


async def test_finding_different_users_create_separate_records(
    client, seed_workshop, seed_trace
):
    """Different users can submit findings for the same trace."""
    ws = seed_workshop()
    trace = seed_trace(ws.id)

    await client.post(f"/workshops/{ws.id}/findings", json={
        "trace_id": trace.id,
        "user_id": "user-A",
        "insight": "A's insight",
    })
    await client.post(f"/workshops/{ws.id}/findings", json={
        "trace_id": trace.id,
        "user_id": "user-B",
        "insight": "B's insight",
    })

    list_resp = await client.get(f"/workshops/{ws.id}/findings")
    assert list_resp.status_code == 200
    findings = list_resp.json()
    assert len(findings) == 2

    by_user = {f["user_id"]: f for f in findings}
    assert by_user["user-A"]["insight"] == "A's insight"
    assert by_user["user-B"]["insight"] == "B's insight"


async def test_get_findings_filtered_by_user(client, seed_workshop, seed_trace):
    """GET /workshops/{id}/findings?user_id=X filters correctly."""
    ws = seed_workshop()

    await client.post(f"/workshops/{ws.id}/findings", json={
        "trace_id": seed_trace(ws.id).id,
        "user_id": "user-X",
        "insight": "X's insight",
    })
    await client.post(f"/workshops/{ws.id}/findings", json={
        "trace_id": seed_trace(ws.id).id,
        "user_id": "user-Y",
        "insight": "Y's insight",
    })

    resp = await client.get(
        f"/workshops/{ws.id}/findings", params={"user_id": "user-X"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["user_id"] == "user-X"


async def test_findings_scoped_to_workshop(client, seed_workshop, seed_trace):
    """Findings from one workshop don't appear in another."""
    ws_a = seed_workshop(name="A")
    ws_b = seed_workshop(name="B")

    await client.post(f"/workshops/{ws_a.id}/findings", json={
        "trace_id": seed_trace(ws_a.id).id,
        "user_id": "user-1",
        "insight": "In workshop A",
    })

    resp = await client.get(f"/workshops/{ws_b.id}/findings")
    assert resp.status_code == 200
    assert len(resp.json()) == 0
