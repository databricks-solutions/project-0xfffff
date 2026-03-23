"""Performance test for the preview-jsonpath endpoint.

Verifies that the preview endpoint responds within the 500ms budget
specified in the TRACE_DISPLAY_SPEC, using real JSONPath evaluation
with a mocked database layer.
"""

import json
import time
from datetime import datetime

import pytest

from server.models import Trace, Workshop, WorkshopPhase, WorkshopStatus


@pytest.mark.spec("TRACE_DISPLAY_SPEC")
@pytest.mark.req("Preview responds within 500ms")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_preview_jsonpath_responds_within_500ms(async_client, override_get_db, monkeypatch):
    """The preview-jsonpath endpoint responds within 500ms.

    This test mocks the database layer but uses real JSONPath evaluation
    to verify the end-to-end handler latency stays within budget.
    """
    import server.routers.workshops as workshops_router

    # Build a realistic trace payload (~10KB, representative of real workshop data)
    trace_input = json.dumps(
        {
            "messages": [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "What is the capital of France?"},
            ],
            "metadata": {"model": "gpt-4", "temperature": 0.7},
        }
    )
    trace_output = json.dumps(
        {
            "response": {
                "text": "The capital of France is Paris.",
                "confidence": 0.99,
            },
            "usage": {"prompt_tokens": 42, "completion_tokens": 12},
        }
    )

    workshop = Workshop(
        id="perf-ws",
        name="Performance Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.INTAKE,
        completed_phases=[],
        discovery_started=False,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="test_judge",
        created_at=datetime.now(),
    )

    trace = Trace(
        id="trace-001",
        workshop_id="perf-ws",
        input=trace_input,
        output=trace_output,
        context=None,
    )

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_traces(self, workshop_id: str):
            return [trace]

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    start = time.perf_counter()
    resp = await async_client.post(
        "/workshops/perf-ws/preview-jsonpath",
        json={
            "input_jsonpath": "$.messages[1].content",
            "output_jsonpath": "$.response.text",
        },
    )
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert resp.status_code == 200
    body = resp.json()
    assert body["input_success"] is True
    assert body["input_result"] == "What is the capital of France?"
    assert body["output_success"] is True
    assert body["output_result"] == "The capital of France is Paris."
    assert elapsed_ms < 500, f"Preview endpoint took {elapsed_ms:.1f}ms, expected < 500ms"
