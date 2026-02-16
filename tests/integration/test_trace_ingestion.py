"""Integration tests: Trace bulk upload and retrieval."""

import pytest

pytestmark = [
    pytest.mark.integration,
    pytest.mark.spec("TESTING_SPEC"),
    pytest.mark.asyncio,
]


async def test_upload_traces(client, seed_workshop):
    """POST /workshops/{id}/traces bulk-uploads traces."""
    ws = seed_workshop()
    traces = [
        {"input": "Hello", "output": "Hi there"},
        {"input": "What?", "output": "I said hi"},
    ]
    resp = await client.post(f"/workshops/{ws.id}/traces", json=traces)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["input"] == "Hello"
    assert data[1]["output"] == "I said hi"


async def test_upload_traces_with_metadata(client, seed_workshop):
    """Traces preserve context and trace_metadata fields."""
    ws = seed_workshop()
    traces = [
        {
            "input": "q",
            "output": "a",
            "context": {"source": "chatbot"},
            "trace_metadata": {"model": "gpt-4", "latency_ms": 120},
        }
    ]
    resp = await client.post(f"/workshops/{ws.id}/traces", json=traces)
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["context"] == {"source": "chatbot"}
    assert data[0]["trace_metadata"]["model"] == "gpt-4"


async def test_upload_traces_with_mlflow_fields(client, seed_workshop):
    """Traces preserve mlflow_trace_id (mlflow_experiment_id stored but not in response)."""
    ws = seed_workshop()
    traces = [
        {
            "input": "q",
            "output": "a",
            "mlflow_trace_id": "tr-abc123",
            "mlflow_experiment_id": "exp-456",
        }
    ]
    resp = await client.post(f"/workshops/{ws.id}/traces", json=traces)
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["mlflow_trace_id"] == "tr-abc123"


async def test_get_all_traces(client, seed_workshop, seed_trace):
    """GET /workshops/{id}/all-traces returns all traces."""
    ws = seed_workshop()
    seed_trace(ws.id, input_text="first")
    seed_trace(ws.id, input_text="second")
    resp = await client.get(f"/workshops/{ws.id}/all-traces")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    inputs = {t["input"] for t in data}
    assert inputs == {"first", "second"}


async def test_traces_scoped_to_workshop(client, seed_workshop, seed_trace):
    """Traces for one workshop don't appear in another."""
    ws_a = seed_workshop(name="A")
    ws_b = seed_workshop(name="B")
    seed_trace(ws_a.id, input_text="only-in-A")
    seed_trace(ws_b.id, input_text="only-in-B")
    resp_a = await client.get(f"/workshops/{ws_a.id}/all-traces")
    resp_b = await client.get(f"/workshops/{ws_b.id}/all-traces")
    assert all(t["input"] == "only-in-A" for t in resp_a.json())
    assert all(t["input"] == "only-in-B" for t in resp_b.json())
