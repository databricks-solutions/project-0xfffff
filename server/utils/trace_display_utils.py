"""Shared trace display pipeline: span filter -> JSONPath extraction."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from server.utils.jsonpath_utils import apply_jsonpath
from server.utils.span_filter_utils import apply_span_filter

if TYPE_CHECKING:
    from server.models import Trace, Workshop


def get_display_text(
    trace: Trace,
    workshop: Workshop | None,
    *,
    include_milestone_context: bool = False,
    milestone_refs: list[str] | None = None,
) -> tuple[str, str]:
    """Apply the span filter + JSONPath pipeline to get display-ready input/output.

    This is the single source of truth for transforming raw trace data into the
    text that the UI shows and that backend services (judges, discovery, etc.)
    should use.

    Order: span attribute filter first, then JSONPath extraction, then optional
    milestone context enrichment.

    Args:
        include_milestone_context: When True, appends structured milestone
            summary from ``trace.summary`` to the output text so that
            downstream consumers (e.g. LLM judges) can reason about the
            agent's trajectory, not just its final response.
        milestone_refs: Optional list of milestone references (e.g.
            ``["m2", "m5"]``) to restrict which milestones are included.
            When ``None``, all milestones are included.
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

    # Step 3: Milestone context enrichment
    if include_milestone_context:
        context = format_milestone_context(
            getattr(trace, "summary", None),
            milestone_refs=milestone_refs,
        )
        if context:
            output_text = f"{output_text}\n\n{context}"

    return input_text, output_text


def format_milestone_context(
    summary: dict[str, Any] | None,
    *,
    milestone_refs: list[str] | None = None,
) -> str:
    """Format a trace's milestone summary into text suitable for LLM judge context.

    Args:
        summary: The ``trace.summary`` dict produced by TraceSummarizationService.
        milestone_refs: Optional filter — only include milestones whose ref
            (e.g. ``"m2"``) appears in this list.  ``None`` means include all.

    Returns:
        Formatted string, or empty string if no relevant milestones exist.
    """
    if not isinstance(summary, dict):
        return ""

    lines: list[str] = []

    executive = str(summary.get("executive_summary") or "").strip()
    if executive:
        lines.append("--- Agent Trajectory Summary ---")
        lines.append(executive)

    milestones = summary.get("milestones")
    if not isinstance(milestones, list) or not milestones:
        return "\n".join(lines)

    wanted: set[str] | None = None
    if milestone_refs is not None:
        wanted = {ref.lower().strip() for ref in milestone_refs}

    included: list[dict] = []
    for m in milestones:
        if not isinstance(m, dict):
            continue
        number = m.get("number")
        ref = f"m{number}" if number is not None else None
        if wanted is not None and ref and ref.lower() not in wanted:
            continue
        included.append(m)

    if not included:
        return "\n".join(lines)

    lines.append("")
    lines.append("--- Milestones ---")
    for m in included:
        number = m.get("number")
        title = str(m.get("title") or "").strip()
        ms_summary = str(m.get("summary") or m.get("description") or "").strip()
        header = f"m{number}" if number is not None else "m?"
        if title:
            header = f"{header}: {title}"
        lines.append(f"[{header}]")
        if ms_summary:
            lines.append(ms_summary)

    return "\n".join(lines)
