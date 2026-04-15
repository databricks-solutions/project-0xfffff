"""Shared trace display pipeline: span filter -> JSONPath extraction."""

from __future__ import annotations

from typing import TYPE_CHECKING

from server.utils.jsonpath_utils import apply_jsonpath
from server.utils.span_filter_utils import apply_span_filter

if TYPE_CHECKING:
    from server.models import Trace, Workshop


def get_display_text(trace: Trace, workshop: Workshop | None) -> tuple[str, str]:
    """Apply the span filter + JSONPath pipeline to get display-ready input/output.

    This is the single source of truth for transforming raw trace data into the
    text that the UI shows and that backend services (judges, discovery, etc.)
    should use.

    Order: span attribute filter first, then JSONPath extraction.
    """
    input_text = trace.input or ""
    output_text = trace.output or ""

    if workshop is None:
        return input_text, output_text

    # Step 1: Span attribute filter
    span_input, span_output = apply_span_filter(
        trace.context,
        workshop.span_attribute_filter,
    )
    if span_input is not None:
        input_text = span_input
    if span_output is not None:
        output_text = span_output

    # Step 2: JSONPath extraction
    extracted, ok = apply_jsonpath(input_text, workshop.input_jsonpath)
    if ok:
        input_text = extracted
    extracted, ok = apply_jsonpath(output_text, workshop.output_jsonpath)
    if ok:
        output_text = extracted

    return input_text, output_text
