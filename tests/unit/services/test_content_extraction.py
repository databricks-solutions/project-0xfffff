"""Tests for role-aware content extraction from MLflow trace JSON.

Covers TRACE_INGESTION_SPEC success criteria:
- Input extraction prefers last user-role message
- Output extraction prefers last assistant-role message
- Each trace gets unique extracted input (no shared-prefix duplication)
- Handles all documented JSON formats
- Falls back to cleaned raw text for unrecognized formats
"""
import pytest

from server.services.mlflow_intake_service import MLflowIntakeService


@pytest.fixture
def service():
    """Create an MLflowIntakeService with a mock db_service."""
    return MLflowIntakeService(db_service=None)


# --- {"messages": [...]} format (the primary bug) ---

MULTI_TURN_MESSAGES = '{"messages": [' \
    '{"role": "user", "content": "What is AI?"},' \
    '{"role": "assistant", "content": "AI is artificial intelligence."},' \
    '{"role": "user", "content": "Tell me more about neural networks."}' \
    ']}'


@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("input_prefers_user_message")
class TestMessagesFormatInputExtraction:
    """Input extraction from {"messages": [...]} should prefer user messages."""

    def test_multi_turn_returns_last_user_message(self, service):
        result = service._extract_content_from_json(MULTI_TURN_MESSAGES, role_hint="input")
        assert result == "Tell me more about neural networks."

    def test_multi_turn_does_not_return_assistant_message(self, service):
        result = service._extract_content_from_json(MULTI_TURN_MESSAGES, role_hint="input")
        assert "artificial intelligence" not in result

    def test_single_user_message(self, service):
        data = '{"messages": [{"role": "user", "content": "Hello"}]}'
        result = service._extract_content_from_json(data, role_hint="input")
        assert result == "Hello"


@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("output_prefers_assistant_message")
class TestMessagesFormatOutputExtraction:
    """Output extraction from {"messages": [...]} should prefer assistant messages."""

    def test_multi_turn_returns_last_assistant_message(self, service):
        result = service._extract_content_from_json(MULTI_TURN_MESSAGES, role_hint="output")
        assert result == "AI is artificial intelligence."

    def test_single_assistant_message(self, service):
        data = '{"messages": [{"role": "assistant", "content": "Here is the answer."}]}'
        result = service._extract_content_from_json(data, role_hint="output")
        assert result == "Here is the answer."


# --- Unique extraction per trace (the customer bug) ---

@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("unique_input_per_trace")
class TestUniqueInputPerTrace:
    """Different traces with shared conversation prefix must extract different inputs."""

    def test_different_last_user_messages_produce_different_inputs(self, service):
        trace_a = '{"messages": [' \
            '{"role": "user", "content": "Shared question"},' \
            '{"role": "assistant", "content": "Shared answer"},' \
            '{"role": "user", "content": "Unique question A"}' \
            ']}'
        trace_b = '{"messages": [' \
            '{"role": "user", "content": "Shared question"},' \
            '{"role": "assistant", "content": "Shared answer"},' \
            '{"role": "user", "content": "Unique question B"}' \
            ']}'
        input_a = service._extract_content_from_json(trace_a, role_hint="input")
        input_b = service._extract_content_from_json(trace_b, role_hint="input")
        assert input_a != input_b
        assert input_a == "Unique question A"
        assert input_b == "Unique question B"


# --- {"request": {"input": [...]}} format ---

@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("handles_request_input_format")
class TestRequestInputFormat:
    """The {"request": {"input": [...]}} format should extract user content."""

    def test_extracts_user_message(self, service):
        data = '{"request": {"input": [{"role": "user", "content": "How does Python work?"}]}}'
        result = service._extract_content_from_json(data, role_hint="input")
        assert result == "How does Python work?"


# --- Default role_hint is "output" for backward compatibility ---

@pytest.mark.spec("TRACE_INGESTION_SPEC")
class TestDefaultRoleHint:
    """Default role_hint should be 'output' for backward compatibility."""

    def test_default_prefers_assistant(self, service):
        result = service._extract_content_from_json(MULTI_TURN_MESSAGES)
        assert result == "AI is artificial intelligence."


# --- Fallback behavior ---

@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("extraction_fallback")
class TestFallbackBehavior:
    """Unrecognized formats fall back to cleaned raw text."""

    def test_plain_string(self, service):
        result = service._extract_content_from_json('"Just a plain string"', role_hint="input")
        assert result == "Just a plain string"

    def test_none_returns_empty(self, service):
        result = service._extract_content_from_json(None, role_hint="input")
        assert result == ""

    def test_empty_string_returns_empty(self, service):
        result = service._extract_content_from_json("", role_hint="input")
        assert result == ""
