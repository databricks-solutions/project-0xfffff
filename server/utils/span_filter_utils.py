"""Span filter utilities for selecting a specific span's inputs/outputs from trace context."""

import json
from typing import Any


def find_matching_span(spans: list[dict[str, Any]], filter_config: dict[str, Any]) -> dict[str, Any] | None:
    """Find the first span matching the filter configuration.

    Filter config supports:
        {"span_name": "AzureChatOpenAI"}         - match by span name
        {"span_type": "CHAT_MODEL"}               - match by span type
        {"attribute_key": "model", "attribute_value": "gpt-4"} - match by attribute key/value

    Multiple keys can be combined (all must match).

    Returns the first matching span dict, or None.
    """
    if not spans or not filter_config:
        return None

    for span in spans:
        if _span_matches(span, filter_config):
            return span

    return None


def _span_matches(span: dict[str, Any], filter_config: dict[str, Any]) -> bool:
    """Check if a span matches all criteria in the filter config."""
    # Match by span_name
    if "span_name" in filter_config:
        if span.get("name") != filter_config["span_name"]:
            return False

    # Match by span_type
    if "span_type" in filter_config:
        if span.get("span_type") != filter_config["span_type"]:
            return False

    # Match by attribute key/value
    if "attribute_key" in filter_config:
        key = filter_config["attribute_key"]
        expected_value = filter_config.get("attribute_value")
        attributes = span.get("attributes", {})
        if not isinstance(attributes, dict):
            return False
        actual_value = attributes.get(key)
        if actual_value is None:
            return False
        if expected_value is not None and str(actual_value) != str(expected_value):
            return False

    return True


def apply_span_filter(
    context: dict[str, Any] | None,
    filter_config: dict[str, Any] | None,
) -> tuple[str | None, str | None]:
    """Find matching span and return its (inputs_json, outputs_json).

    Args:
        context: The trace context dict (must contain a "spans" list)
        filter_config: The span attribute filter configuration

    Returns:
        (inputs_json, outputs_json) from the matching span, or (None, None)
        if no filter is configured or no span matches.
    """
    if not filter_config or not context:
        return None, None

    spans = context.get("spans")
    if not spans or not isinstance(spans, list):
        return None, None

    matched = find_matching_span(spans, filter_config)
    if not matched:
        return None, None

    inputs = matched.get("inputs")
    outputs = matched.get("outputs")

    # Serialize to JSON string if not already a string
    inputs_str = _to_json_string(inputs) if inputs is not None else None
    outputs_str = _to_json_string(outputs) if outputs is not None else None

    return inputs_str, outputs_str


def _to_json_string(value: Any) -> str:
    """Convert a value to a JSON string for display."""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, indent=2, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)
