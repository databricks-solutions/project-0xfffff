"""Tests for span filter utilities."""

import json

import pytest

from server.utils.span_filter_utils import apply_span_filter, find_matching_span


# ---------------------------------------------------------------------------
# Sample span data
# ---------------------------------------------------------------------------

SAMPLE_SPANS = [
    {
        "name": "AgentExecutor",
        "span_type": "CHAIN",
        "inputs": {"question": "What is the weather?"},
        "outputs": {"answer": "It is sunny."},
        "attributes": {"framework": "langchain"},
    },
    {
        "name": "AzureChatOpenAI",
        "span_type": "CHAT_MODEL",
        "inputs": {"messages": [{"role": "user", "content": "What is the weather?"}]},
        "outputs": {"choices": [{"message": {"content": "It is sunny."}}]},
        "attributes": {"model": "gpt-4", "provider": "azure"},
    },
    {
        "name": "Retriever",
        "span_type": "RETRIEVER",
        "inputs": {"query": "weather"},
        "outputs": {"documents": ["doc1", "doc2"]},
        "attributes": {},
    },
]


# ---------------------------------------------------------------------------
# find_matching_span tests
# ---------------------------------------------------------------------------


@pytest.mark.spec("TRACE_DISPLAY_SPEC")
class TestFindMatchingSpan:
    @pytest.mark.req("Facilitator can configure span attribute filter with span name, span type, attribute key, and attribute value")
    def test_match_by_span_name(self):
        result = find_matching_span(SAMPLE_SPANS, {"span_name": "AzureChatOpenAI"})
        assert result is not None
        assert result["name"] == "AzureChatOpenAI"

    @pytest.mark.req("Facilitator can configure span attribute filter with span name, span type, attribute key, and attribute value")
    def test_match_by_span_type(self):
        result = find_matching_span(SAMPLE_SPANS, {"span_type": "CHAT_MODEL"})
        assert result is not None
        assert result["name"] == "AzureChatOpenAI"

    @pytest.mark.req("Facilitator can configure span attribute filter with span name, span type, attribute key, and attribute value")
    def test_match_by_attribute_key_value(self):
        result = find_matching_span(
            SAMPLE_SPANS, {"attribute_key": "model", "attribute_value": "gpt-4"}
        )
        assert result is not None
        assert result["name"] == "AzureChatOpenAI"

    @pytest.mark.req("Facilitator can configure span attribute filter with span name, span type, attribute key, and attribute value")
    def test_match_by_attribute_key_only(self):
        """Match any span that has the attribute key, regardless of value."""
        result = find_matching_span(SAMPLE_SPANS, {"attribute_key": "framework"})
        assert result is not None
        assert result["name"] == "AgentExecutor"

    @pytest.mark.req("Filter criteria are AND-combined and first matching span wins")
    def test_match_combined_filters(self):
        result = find_matching_span(
            SAMPLE_SPANS, {"span_name": "AzureChatOpenAI", "span_type": "CHAT_MODEL"}
        )
        assert result is not None
        assert result["name"] == "AzureChatOpenAI"

    @pytest.mark.req("Filter criteria are AND-combined and first matching span wins")
    def test_no_match_wrong_name(self):
        result = find_matching_span(SAMPLE_SPANS, {"span_name": "NonExistent"})
        assert result is None

    @pytest.mark.req("Filter criteria are AND-combined and first matching span wins")
    def test_no_match_wrong_type(self):
        result = find_matching_span(SAMPLE_SPANS, {"span_type": "UNKNOWN"})
        assert result is None

    @pytest.mark.req("Filter criteria are AND-combined and first matching span wins")
    def test_no_match_wrong_attribute_value(self):
        result = find_matching_span(
            SAMPLE_SPANS, {"attribute_key": "model", "attribute_value": "gpt-3.5"}
        )
        assert result is None

    @pytest.mark.req("Filter criteria are AND-combined and first matching span wins")
    def test_no_match_combined_mismatch(self):
        """Name matches but type doesn't."""
        result = find_matching_span(
            SAMPLE_SPANS, {"span_name": "AzureChatOpenAI", "span_type": "CHAIN"}
        )
        assert result is None

    @pytest.mark.req("Empty filter config results in no filtering and root trace data is used")
    def test_empty_spans(self):
        result = find_matching_span([], {"span_name": "AzureChatOpenAI"})
        assert result is None

    @pytest.mark.req("Empty filter config results in no filtering and root trace data is used")
    def test_empty_filter(self):
        result = find_matching_span(SAMPLE_SPANS, {})
        assert result is None

    @pytest.mark.req("Empty filter config results in no filtering and root trace data is used")
    def test_none_inputs(self):
        assert find_matching_span(None, {"span_name": "X"}) is None
        assert find_matching_span(SAMPLE_SPANS, None) is None

    @pytest.mark.req("Filter criteria are AND-combined and first matching span wins")
    def test_first_match_wins(self):
        spans = [
            {"name": "A", "span_type": "CHAIN", "inputs": "i1", "outputs": "o1", "attributes": {}},
            {"name": "A", "span_type": "CHAIN", "inputs": "i2", "outputs": "o2", "attributes": {}},
        ]
        result = find_matching_span(spans, {"span_name": "A"})
        assert result["inputs"] == "i1"

    @pytest.mark.req("Filter criteria are AND-combined and first matching span wins")
    def test_span_without_attributes_key(self):
        spans = [{"name": "X", "span_type": "CHAIN", "inputs": "i", "outputs": "o"}]
        result = find_matching_span(spans, {"attribute_key": "model"})
        assert result is None


# ---------------------------------------------------------------------------
# apply_span_filter tests
# ---------------------------------------------------------------------------


@pytest.mark.spec("TRACE_DISPLAY_SPEC")
class TestApplySpanFilter:
    @pytest.mark.req("Span filter is applied before JSONPath extraction in TraceViewer")
    def test_returns_span_inputs_outputs_on_match(self):
        context = {"spans": SAMPLE_SPANS}
        inputs, outputs = apply_span_filter(context, {"span_name": "AzureChatOpenAI"})
        assert inputs is not None
        assert outputs is not None
        # Should be JSON serialized
        parsed_inputs = json.loads(inputs)
        assert parsed_inputs["messages"][0]["content"] == "What is the weather?"

    @pytest.mark.req("Filter criteria are AND-combined and first matching span wins")
    def test_returns_none_when_no_match(self):
        context = {"spans": SAMPLE_SPANS}
        inputs, outputs = apply_span_filter(context, {"span_name": "NonExistent"})
        assert inputs is None
        assert outputs is None

    @pytest.mark.req("Empty filter config results in no filtering and root trace data is used")
    def test_returns_none_when_no_filter(self):
        context = {"spans": SAMPLE_SPANS}
        inputs, outputs = apply_span_filter(context, None)
        assert inputs is None
        assert outputs is None

    @pytest.mark.req("Empty filter config results in no filtering and root trace data is used")
    def test_returns_none_when_no_context(self):
        inputs, outputs = apply_span_filter(None, {"span_name": "X"})
        assert inputs is None
        assert outputs is None

    @pytest.mark.req("Empty filter config results in no filtering and root trace data is used")
    def test_returns_none_when_no_spans_key(self):
        inputs, outputs = apply_span_filter({"tags": {}}, {"span_name": "X"})
        assert inputs is None
        assert outputs is None

    @pytest.mark.req("String span inputs and outputs are returned as-is without double-serialization")
    def test_string_inputs_returned_as_is(self):
        context = {
            "spans": [
                {
                    "name": "StringSpan",
                    "span_type": "LLM",
                    "inputs": "plain text input",
                    "outputs": "plain text output",
                    "attributes": {},
                }
            ]
        }
        inputs, outputs = apply_span_filter(context, {"span_name": "StringSpan"})
        assert inputs == "plain text input"
        assert outputs == "plain text output"

    @pytest.mark.req("Empty filter config results in no filtering and root trace data is used")
    def test_none_inputs_outputs(self):
        context = {
            "spans": [
                {
                    "name": "NullSpan",
                    "span_type": "LLM",
                    "inputs": None,
                    "outputs": None,
                    "attributes": {},
                }
            ]
        }
        inputs, outputs = apply_span_filter(context, {"span_name": "NullSpan"})
        assert inputs is None
        assert outputs is None
