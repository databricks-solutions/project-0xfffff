"""Integration tests: Annotation submission with upsert semantics."""

import pytest

pytestmark = [
    pytest.mark.integration,
    pytest.mark.spec("TESTING_SPEC"),
    pytest.mark.asyncio,
]


async def test_submit_annotation(client, seed_workshop, seed_trace):
    """POST /workshops/{id}/annotations creates an annotation."""
    ws = seed_workshop()
    trace = seed_trace(ws.id)
    resp = await client.post(f"/workshops/{ws.id}/annotations", json={
        "trace_id": trace.id,
        "user_id": "user-1",
        "rating": 4,
        "comment": "Good response",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["trace_id"] == trace.id
    assert data["user_id"] == "user-1"
    assert data["rating"] == 4
    assert data["comment"] == "Good response"


async def test_annotation_upsert_same_user_same_trace(client, seed_workshop, seed_trace):
    """Submitting again for same (user, trace) updates, not duplicates."""
    ws = seed_workshop()
    trace = seed_trace(ws.id)

    # First submission
    resp1 = await client.post(f"/workshops/{ws.id}/annotations", json={
        "trace_id": trace.id,
        "user_id": "user-1",
        "rating": 3,
        "comment": "OK",
    })
    assert resp1.status_code == 200

    # Second submission (upsert)
    resp2 = await client.post(f"/workshops/{ws.id}/annotations", json={
        "trace_id": trace.id,
        "user_id": "user-1",
        "rating": 5,
        "comment": "Actually great",
    })
    assert resp2.status_code == 200

    # Verify only one annotation exists (upsert, not duplicate)
    list_resp = await client.get(
        f"/workshops/{ws.id}/annotations", params={"user_id": "user-1"}
    )
    assert list_resp.status_code == 200
    annotations = list_resp.json()
    assert len(annotations) == 1
    assert annotations[0]["rating"] == 5
    assert annotations[0]["comment"] == "Actually great"


async def test_annotation_different_users_create_separate_records(
    client, seed_workshop, seed_trace
):
    """Different users annotating the same trace creates separate records."""
    ws = seed_workshop()
    trace = seed_trace(ws.id)

    await client.post(f"/workshops/{ws.id}/annotations", json={
        "trace_id": trace.id,
        "user_id": "user-A",
        "rating": 5,
    })
    await client.post(f"/workshops/{ws.id}/annotations", json={
        "trace_id": trace.id,
        "user_id": "user-B",
        "rating": 2,
    })

    list_resp = await client.get(f"/workshops/{ws.id}/annotations")
    assert list_resp.status_code == 200
    annotations = list_resp.json()
    assert len(annotations) == 2

    by_user = {a["user_id"]: a for a in annotations}
    assert by_user["user-A"]["rating"] == 5
    assert by_user["user-B"]["rating"] == 2


async def test_annotation_with_multi_ratings(client, seed_workshop, seed_trace):
    """Annotations support the multi-question ratings dict."""
    ws = seed_workshop()
    trace = seed_trace(ws.id)
    resp = await client.post(f"/workshops/{ws.id}/annotations", json={
        "trace_id": trace.id,
        "user_id": "user-1",
        "rating": 3,
        "ratings": {"q1": 4, "q2": 5},
        "comment": "Multi-rated",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["ratings"] == {"q1": 4, "q2": 5}


async def test_get_annotations_filtered_by_user(client, seed_workshop, seed_trace):
    """GET /workshops/{id}/annotations?user_id=X filters correctly."""
    ws = seed_workshop()
    trace = seed_trace(ws.id)

    await client.post(f"/workshops/{ws.id}/annotations", json={
        "trace_id": trace.id, "user_id": "user-X", "rating": 3,
    })
    await client.post(f"/workshops/{ws.id}/annotations", json={
        "trace_id": seed_trace(ws.id).id, "user_id": "user-Y", "rating": 4,
    })

    resp = await client.get(
        f"/workshops/{ws.id}/annotations", params={"user_id": "user-X"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["user_id"] == "user-X"
