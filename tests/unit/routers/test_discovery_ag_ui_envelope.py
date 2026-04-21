import json

from server.routers.discovery import _extract_ag_ui_payload_body


def _valid_run_input_payload() -> dict[str, object]:
    return {
        "threadId": "discovery-trace-1",
        "runId": "run-1",
        "state": {},
        "messages": [{"id": "msg-1", "role": "user", "content": "hello"}],
        "tools": [],
        "context": [],
        "forwardedProps": {},
    }


def test_extract_ag_ui_payload_body_unwraps_top_level_body():
    envelope = {
        "method": "agent/run",
        "params": {"agentId": "thread_assistant"},
        "body": _valid_run_input_payload(),
    }
    unwrapped = _extract_ag_ui_payload_body(json.dumps(envelope).encode("utf-8"))
    assert json.loads(unwrapped) == _valid_run_input_payload()


def test_extract_ag_ui_payload_body_keeps_direct_payload():
    direct = _valid_run_input_payload()
    unwrapped = _extract_ag_ui_payload_body(json.dumps(direct).encode("utf-8"))
    assert json.loads(unwrapped) == direct
