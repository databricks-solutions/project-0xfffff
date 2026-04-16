"""Trace summarization service using PydanticAI agents with trace inspection tools."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from dataclasses import field as dc_field
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from pydantic_ai import messages as pai_messages
from pydantic_ai.run import AgentRunResultEvent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

logger = logging.getLogger(__name__)


# --- Output models ---


class ExecutiveSummary(BaseModel):
    executive_summary: str = Field(description="1-3 sentence high-level narrative of what happened")


class SpanDataRef(BaseModel):
    """Reference to actual data in a trace span. Agent produces these; system resolves values."""

    span_name: str
    field: Literal["inputs", "outputs"]
    jsonpath: str | None = Field(
        default=None,
        description="JSONPath to select a subfield, e.g. '$.query'. Full field if omitted.",
    )
    value: Any | None = Field(
        default=None,
        description="Resolved value — populated by post-processing, not the agent",
    )


class Milestone(BaseModel):
    number: int
    title: str
    summary: str = Field(description="Agent's narrative of what happened in this phase")
    inputs: list[SpanDataRef] = Field(default_factory=list, description="Data that flowed into this phase")
    outputs: list[SpanDataRef] = Field(default_factory=list, description="Data that came out of this phase")


class TraceSummary(BaseModel):
    executive_summary: str
    milestones: list[Milestone]


class ThreadAgentAnswer(BaseModel):
    answer: str = Field(description="Direct, grounded answer to the facilitator's prompt.")


# --- Trace context (PydanticAI dependency) ---


@dataclass
class TraceContext:
    """Trace data passed as PydanticAI dependency. Tools inspect this."""

    spans: list[dict] = dc_field(default_factory=list)
    status: str = "UNKNOWN"
    execution_time_ms: float = 0
    tags: dict = dc_field(default_factory=dict)
    list_thread_comments_fn: Callable[[int, bool], list[dict[str, Any]]] | None = None
    create_thread_reply_comment_fn: Callable[[str], dict[str, Any]] | None = None
    create_rubric_criterion_fn: Callable[[dict[str, Any]], dict[str, Any]] | None = None

    @classmethod
    def from_dict(cls, d: dict) -> TraceContext:
        return cls(
            spans=d.get("spans", []),
            status=d.get("status", "UNKNOWN"),
            execution_time_ms=d.get("execution_time_ms", 0),
            tags=d.get("tags", {}),
        )


# --- Tool functions (plain, testable without PydanticAI) ---


def _span_duration_ms(span: dict) -> float | None:
    start = span.get("start_time_ns")
    end = span.get("end_time_ns")
    if start is not None and end is not None:
        return (end - start) / 1e6
    return None


def get_trace_overview(ctx: TraceContext) -> dict:
    """Get high-level trace metadata and health check."""
    error_spans = [s["name"] for s in ctx.spans if s.get("status") == "ERROR"]
    root = next((s for s in ctx.spans if s.get("parent_span_id") is None), None)
    return {
        "status": ctx.status,
        "execution_time_ms": ctx.execution_time_ms,
        "span_count": len(ctx.spans),
        "error_spans": error_spans,
        "root_span_name": root["name"] if root else None,
    }


def list_spans(
    ctx: TraceContext,
    filter_type: str | None = None,
    filter_status: str | None = None,
) -> list[dict]:
    """List all spans with optional filtering by type or status."""
    results = []
    for span in ctx.spans:
        if filter_type and span.get("span_type") != filter_type:
            continue
        if filter_status and span.get("status") != filter_status:
            continue
        results.append(
            {
                "name": span.get("name", "unnamed"),
                "span_type": span.get("span_type", "UNKNOWN"),
                "status": span.get("status", "UNKNOWN"),
                "duration_ms": _span_duration_ms(span),
            }
        )
    return results


def get_span_detail(ctx: TraceContext, span_name: str) -> dict:
    """Get full inputs and outputs for a specific span."""
    for span in ctx.spans:
        if span.get("name") == span_name:
            return {
                "name": span.get("name"),
                "span_type": span.get("span_type"),
                "status": span.get("status"),
                "inputs": span.get("inputs", {}),
                "outputs": span.get("outputs", {}),
                "duration_ms": _span_duration_ms(span),
            }
    return {"error": f"Span '{span_name}' not found"}


def get_root_span(ctx: TraceContext) -> dict:
    """Get the entry point span with user request and final response."""
    root = next((s for s in ctx.spans if s.get("parent_span_id") is None), None)
    if root is None:
        return {"error": "No root span found"}
    return {
        "name": root.get("name"),
        "inputs": root.get("inputs", {}),
        "outputs": root.get("outputs", {}),
        "duration_ms": _span_duration_ms(root),
    }


_MAX_SEARCH_PATTERN_LEN = 200


def search_spans(ctx: TraceContext, pattern: str) -> list[dict]:
    """Regex search across span inputs and outputs.

    Pattern length is capped to avoid catastrophic backtracking (ReDoS) from
    agent-generated patterns.
    """
    if len(pattern) > _MAX_SEARCH_PATTERN_LEN:
        return [{"error": f"Pattern too long ({len(pattern)} chars, max {_MAX_SEARCH_PATTERN_LEN})"}]
    matches = []
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error:
        return [{"error": f"Invalid regex: {pattern}"}]

    for span in ctx.spans:
        span_name = span.get("name", "unnamed")
        for field_name in ("inputs", "outputs"):
            text = json.dumps(span.get(field_name, {}), default=str)
            if regex.search(text):
                matches.append(
                    {
                        "span_name": span_name,
                        "field": field_name,
                        "match": regex.findall(text)[:3],
                    }
                )
    return matches


def list_thread_comments(ctx: TraceContext, limit: int = 8, include_agent: bool = False) -> list[dict]:
    """List recent thread comments via the injected callback."""
    if not callable(ctx.list_thread_comments_fn):
        return [{"error": "Thread comments unavailable in this context"}]
    safe_limit = max(1, min(int(limit), 25))
    try:
        return ctx.list_thread_comments_fn(safe_limit, bool(include_agent))
    except Exception as exc:  # pragma: no cover - defensive callback guard
        return [{"error": f"Failed to list thread comments: {exc!s}"}]


def create_thread_reply_comment(ctx: TraceContext, body: str) -> dict:
    """Create a thread reply comment via the injected callback."""
    if not callable(ctx.create_thread_reply_comment_fn):
        return {"error": "Thread reply creation unavailable in this context"}
    text = str(body or "").strip()
    if not text:
        return {"error": "Reply body is required"}
    try:
        return ctx.create_thread_reply_comment_fn(text)
    except Exception as exc:  # pragma: no cover - defensive callback guard
        return {"error": f"Failed to create thread reply: {exc!s}"}


def create_rubric_criterion(ctx: TraceContext, payload: dict[str, Any]) -> dict:
    """Create a rubric/criterion item via an injected callback."""
    if not callable(ctx.create_rubric_criterion_fn):
        return {"error": "Rubric criterion creation unavailable in this context"}
    try:
        return ctx.create_rubric_criterion_fn(payload)
    except Exception as exc:  # pragma: no cover - defensive callback guard
        return {"error": f"Failed to create rubric criterion: {exc!s}"}


# --- Span data reference resolution ---


def _resolve_jsonpath(data: Any, path: str) -> Any | None:
    """Apply a JSONPath expression to data. Returns the raw value, not stringified."""
    try:
        from jsonpath_ng import parse

        if isinstance(data, str):
            data = json.loads(data)
        expr = parse(path.strip())
        matches = [m.value for m in expr.find(data)]
        if not matches:
            return None
        return matches[0] if len(matches) == 1 else matches
    except Exception:
        return None


def resolve_span_data_refs(refs: list[SpanDataRef], ctx: TraceContext) -> list[SpanDataRef]:
    """Resolve SpanDataRef list to actual values from the trace.

    For each ref, finds the named span, extracts the field (inputs/outputs),
    and optionally applies JSONPath. Returns new SpanDataRef instances with
    value populated. Invalid refs get value=None.
    """
    resolved = []
    for ref in refs:
        value = None
        span = next((s for s in ctx.spans if s.get("name") == ref.span_name), None)
        if span is not None:
            field_data = span.get(ref.field, {})
            if ref.jsonpath is None:
                value = field_data
            else:
                value = _resolve_jsonpath(field_data, ref.jsonpath)
        resolved.append(ref.model_copy(update={"value": value}))
    return resolved


def _summarize_tool_result(result_part: Any, max_len: int = 180) -> str:
    try:
        if hasattr(result_part, "model_response_str"):
            text = str(result_part.model_response_str() or "").strip()
        else:
            text = str(getattr(result_part, "content", "") or "").strip()
    except Exception:
        text = ""
    compact = " ".join(text.split())
    if not compact:
        return "completed"
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 1] + "…"


# --- Prompts ---

EXECUTIVE_SUMMARY_INSTRUCTIONS = """\
You are a CTO providing an executive summary of an AI agent's execution \
trajectory to non-technical subject matter experts. Your audience evaluates \
the quality of AI agent behavior — they need to understand what the agent \
did and whether it did it well, not the technical plumbing.
{use_case_section}\
Use your tools to understand what happened:
1. Call get_trace_overview to see the trace status, span count, and any errors
2. Call list_spans to see all spans and identify the important ones (tool calls, errors, key outputs)
3. Call get_root_span to see the user's original request and the final response
4. Call get_span_detail on the most important spans to see their actual inputs and outputs

Then write a 1-3 sentence executive summary focusing on:
- What was the user's goal?
- What substantive actions were taken? (name the actual tools, queries, data sources)
- What was the concrete outcome? (include specific results, numbers, findings)

Write for non-technical readers. Use plain language, not developer jargon. \
Include actual data — not "a query was executed" but \
"queried issuer spend active rates, returning 240 rows"."""

MILESTONE_INSTRUCTIONS = """\
You are a CTO providing a milestone breakdown of an AI agent's execution \
trajectory to non-technical subject matter experts who evaluate agent quality. \
They need to see what the agent did at each step and the actual data that \
flowed through — but presented in a readable, non-technical way.
{use_case_section}\
Use your tools to drill into specific spans for each milestone:
1. Call list_spans to see the full span structure
2. Call get_span_detail on spans relevant to each milestone to extract actual content
3. Call search_spans if you need to find specific data across the trace

For each milestone:
- Give it a short, descriptive title that reflects the substance \
(not "Query Executed" but "Queried Issuer Spend Active Rates")
- Write a 1-2 sentence summary including actual data from the spans
- Add span data references for the key inputs and outputs of that phase

For span data references (inputs and outputs lists):
- Each ref points to a specific span's inputs or outputs
- Use jsonpath to select the specific subfield that matters for understanding quality
- Prefer paths that resolve to human-readable text, markdown, or simple values
- Prefer user-facing content: the question asked, the answer given, the data found
- Omit technical metadata (token counts, model IDs, response_metadata, additional_kwargs) \
unless it is critical to evaluating quality (e.g. an error message)
- When a span contains both raw JSON and a formatted/text version, prefer the text version
- Omit jsonpath to include the entire field only when the whole object is readable

Anti-patterns to avoid:
- Selecting paths that resolve to nested JSON blobs with internal framework fields
- Including system prompts, tool schemas, or model configuration as milestone data
- "The agent processed the query" → instead: name the actual query and data source
- "Results were returned" → instead: state what the results showed
- "A response was generated" → instead: summarize what the response concluded"""

THREAD_AGENT_INSTRUCTIONS = """\
You are a discovery thread agent helping a facilitator evaluate an AI trajectory.
Use tools to inspect the trace deeply before answering.

Guidance:
- Answer the facilitator's specific prompt directly.
- Ground claims in concrete trace evidence (spans, inputs, outputs, errors, timings).
- Avoid rigid report templates and avoid boilerplate section headers.
- Keep the response concise but substantive.
- If the facilitator asks to create a criterion, use `create_rubric_criterion` directly.
"""


# --- PydanticAI tool wrappers ---


def _make_pydantic_ai_tools() -> list:
    """Create PydanticAI-compatible tool wrappers that extract deps from RunContext."""

    def pai_get_trace_overview(ctx: RunContext[TraceContext]) -> dict:
        """Get high-level trace metadata and health check."""
        return get_trace_overview(ctx.deps)

    def pai_list_spans(
        ctx: RunContext[TraceContext],
        filter_type: str | None = None,
        filter_status: str | None = None,
    ) -> list[dict]:
        """List all spans with optional filtering by type or status."""
        return list_spans(ctx.deps, filter_type=filter_type, filter_status=filter_status)

    def pai_get_span_detail(ctx: RunContext[TraceContext], span_name: str) -> dict:
        """Get full inputs and outputs for a specific span."""
        return get_span_detail(ctx.deps, span_name=span_name)

    def pai_get_root_span(ctx: RunContext[TraceContext]) -> dict:
        """Get the entry point span with user request and final response."""
        return get_root_span(ctx.deps)

    def pai_search_spans(ctx: RunContext[TraceContext], pattern: str) -> list[dict]:
        """Regex search across span inputs and outputs."""
        return search_spans(ctx.deps, pattern=pattern)

    def pai_list_thread_comments(
        ctx: RunContext[TraceContext],
        limit: int = 8,
        include_agent: bool = False,
    ) -> list[dict]:
        """List recent comments from the current discussion thread."""
        return list_thread_comments(ctx.deps, limit=limit, include_agent=include_agent)

    def pai_create_thread_reply_comment(
        ctx: RunContext[TraceContext],
        body: str,
    ) -> dict:
        """Create a reply comment in the current discussion thread."""
        return create_thread_reply_comment(ctx.deps, body=body)

    def pai_create_rubric_criterion(
        ctx: RunContext[TraceContext],
        text: str,
        criterion_type: str = "standard",
        weight: int = 1,
        weight_percent: float | None = None,
        lineage: dict[str, Any] | None = None,
        source_comment_ids: list[str] | None = None,
    ) -> dict:
        """Create rubric criterion from discussion context."""
        return create_rubric_criterion(
            ctx.deps,
            {
                "text": text,
                "criterion_type": criterion_type,
                "weight": weight,
                "weight_percent": weight_percent,
                "lineage": lineage,
                "source_comment_ids": source_comment_ids,
            },
        )

    return [
        pai_get_trace_overview,
        pai_list_spans,
        pai_get_span_detail,
        pai_get_root_span,
        pai_search_spans,
        pai_list_thread_comments,
        pai_create_thread_reply_comment,
        pai_create_rubric_criterion,
    ]


# --- Service ---


class TraceSummarizationService:
    """Two-pass trace summarization using PydanticAI agents with tools."""

    # Retry settings for 429 rate limit errors
    MAX_429_RETRIES = 4
    INITIAL_BACKOFF_S = 2.0

    def __init__(
        self,
        endpoint_url: str,
        token: str,
        model_name: str,
        guidance: str | None = None,
        use_case_description: str | None = None,
        max_concurrency: int = 3,
    ):
        provider = OpenAIProvider(base_url=endpoint_url, api_key=token)
        model = OpenAIChatModel(model_name, provider=provider)

        use_case_section = ""
        if use_case_description:
            use_case_section = (
                f"\nUse case context: {use_case_description}\n"
                "Ground your analysis in this use case — focus on domain-relevant "
                "observations rather than generic quality assessments.\n\n"
            )

        exec_instructions = EXECUTIVE_SUMMARY_INSTRUCTIONS.format(use_case_section=use_case_section)
        milestone_instructions = MILESTONE_INSTRUCTIONS.format(use_case_section=use_case_section)

        guidance_suffix = ""
        if guidance:
            guidance_suffix = (
                f"\n\nFacilitator guidance:\n{guidance}\n\n"
                "Apply this guidance when deciding what to highlight and which spans to inspect."
            )

        tools = _make_pydantic_ai_tools()

        self.summary_agent: Agent[TraceContext, ExecutiveSummary] = Agent(
            model,
            deps_type=TraceContext,
            output_type=ExecutiveSummary,
            instructions=exec_instructions + guidance_suffix,
            tools=tools,
            retries=2,
        )

        self.milestone_agent: Agent[TraceContext, TraceSummary] = Agent(
            model,
            deps_type=TraceContext,
            output_type=TraceSummary,
            instructions=milestone_instructions + guidance_suffix,
            tools=tools,
            retries=2,
        )
        self.thread_agent: Agent[TraceContext, str] = Agent(
            model,
            deps_type=TraceContext,
            output_type=str,
            instructions=THREAD_AGENT_INSTRUCTIONS + guidance_suffix,
            tools=tools,
            retries=2,
        )

        self.max_concurrency = max_concurrency

    @classmethod
    def for_testing(
        cls,
        exec_summary_result: ExecutiveSummary | None = None,
        milestone_result: TraceSummary | None = None,
        raise_error: bool = False,
        fail_trace_ids: set[str] | None = None,
    ) -> TraceSummarizationService:
        """Create a service with test model agents for unit testing."""
        from pydantic_ai.models.test import TestModel

        instance = cls.__new__(cls)
        instance.max_concurrency = 5
        instance._test_exec_result = exec_summary_result
        instance._test_milestone_result = milestone_result
        instance._test_raise_error = raise_error
        instance._test_fail_trace_ids = fail_trace_ids or set()

        tools = _make_pydantic_ai_tools()

        instance.summary_agent = Agent(
            TestModel(custom_output_args=exec_summary_result),
            deps_type=TraceContext,
            output_type=ExecutiveSummary,
            instructions=EXECUTIVE_SUMMARY_INSTRUCTIONS,
            tools=tools,
            retries=2,
        )
        instance.milestone_agent = Agent(
            TestModel(custom_output_args=milestone_result),
            deps_type=TraceContext,
            output_type=TraceSummary,
            instructions=MILESTONE_INSTRUCTIONS,
            tools=tools,
            retries=2,
        )
        instance.thread_agent = Agent(
            TestModel(custom_output_text="test-answer"),
            deps_type=TraceContext,
            output_type=str,
            instructions=THREAD_AGENT_INSTRUCTIONS,
            tools=tools,
            retries=2,
        )
        return instance

    @staticmethod
    def _is_rate_limit_error(exc: Exception) -> bool:
        """Check if an exception is a 429 rate limit error."""
        # httpx response errors (PydanticAI → openai SDK → httpx)
        if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429:
            return True
        # openai SDK wraps 429 as RateLimitError
        try:
            from openai import RateLimitError

            if isinstance(exc, RateLimitError):
                return True
        except ImportError:
            pass
        # Check nested cause
        if exc.__cause__ and exc.__cause__ is not exc:
            return TraceSummarizationService._is_rate_limit_error(exc.__cause__)
        return False

    async def _run_with_429_retry(self, coro_factory, trace_id: str | None = None):
        """Run an async callable with retry on 429 rate limit errors."""
        for attempt in range(self.MAX_429_RETRIES + 1):
            try:
                return await coro_factory()
            except Exception as e:
                if self._is_rate_limit_error(e) and attempt < self.MAX_429_RETRIES:
                    backoff = self.INITIAL_BACKOFF_S * (2 ** attempt)
                    logger.warning(
                        "Rate limited (429) on trace %s, attempt %d/%d — retrying in %.1fs",
                        trace_id, attempt + 1, self.MAX_429_RETRIES, backoff,
                    )
                    await asyncio.sleep(backoff)
                    continue
                if self._is_rate_limit_error(e):
                    logger.error(
                        "Rate limit retries exhausted for trace %s after %d attempts",
                        trace_id,
                        self.MAX_429_RETRIES + 1,
                    )
                raise
        raise RuntimeError("Unreachable retry loop exit")

    async def summarize_trace(
        self,
        trace_context: dict,
        trace_id: str | None = None,
        on_event: Callable[[dict[str, Any]], None] | None = None,
    ) -> TraceSummary | None:
        """Two-pass summarization with tool-based trace inspection.

        Pass 1: Agent explores trace via tools → executive summary
        Pass 2: Agent uses executive summary + tools → milestones with span data refs
        Post-processing: Resolve SpanDataRefs to actual trace values
        """
        if hasattr(self, "_test_raise_error") and self._test_raise_error:
            return None

        if hasattr(self, "_test_fail_trace_ids") and trace_id in self._test_fail_trace_ids:
            return None

        def _emit(event: dict[str, Any]) -> None:
            if on_event:
                on_event(event)

        started_at = time.perf_counter()
        try:
            deps = TraceContext.from_dict(trace_context)
            tool_call_counter = 0

            async def _run_agent_with_events(
                *,
                phase: str,
                prompt: str,
                agent: Agent[Any, Any],
            ) -> Any:
                nonlocal tool_call_counter
                final_output: Any = None
                async for event in agent.run_stream_events(prompt, deps=deps):
                    if isinstance(event, pai_messages.PartStartEvent):
                        part = event.part
                        if isinstance(part, pai_messages.ThinkingPart) and part.content:
                            _emit({"event": "reasoning_delta", "phase": phase, "reasoning": part.content})
                        continue

                    if isinstance(event, pai_messages.PartDeltaEvent):
                        delta = event.delta
                        if isinstance(delta, pai_messages.ThinkingPartDelta) and delta.content_delta:
                            _emit({"event": "reasoning_delta", "phase": phase, "reasoning": delta.content_delta})
                        continue

                    if isinstance(event, pai_messages.FunctionToolCallEvent):
                        part = event.part
                        tool_call_counter += 1
                        _emit(
                            {
                                "event": "tool_start",
                                "phase": phase,
                                "tool_name": part.tool_name,
                                "tool_call_id": part.tool_call_id,
                                "tool_call_index": tool_call_counter,
                            }
                        )
                        continue

                    if isinstance(event, pai_messages.FunctionToolResultEvent):
                        result_part = event.result
                        _emit(
                            {
                                "event": "tool_result",
                                "phase": phase,
                                "tool_name": getattr(result_part, "tool_name", None),
                                "tool_call_id": getattr(result_part, "tool_call_id", None),
                                "result_summary": _summarize_tool_result(result_part),
                            }
                        )
                        continue

                    if isinstance(event, AgentRunResultEvent):
                        final_output = getattr(event.result, "output", None)

                return final_output

            logger.info(
                "Trace summarization started trace_id=%s spans=%d",
                trace_id,
                len(deps.spans),
            )
            _emit({"event": "run_started"})

            # Pass 1: Executive summary (agent uses tools to explore)
            exec_result = await self._run_with_429_retry(
                lambda: _run_agent_with_events(
                    phase="executive_summary",
                    prompt=(
                        "Analyze this trace using your tools. Explore the structure, "
                        "inspect key spans, and produce an executive summary."
                    ),
                    agent=self.summary_agent,
                ),
                trace_id=trace_id,
            )
            if not exec_result:
                return None
            executive_summary = exec_result.executive_summary
            logger.debug(
                "Trace summarization pass1 complete trace_id=%s elapsed_s=%.2f",
                trace_id,
                time.perf_counter() - started_at,
            )

            # Pass 2: Milestones with span data refs
            milestone_result = await self._run_with_429_retry(
                lambda: _run_agent_with_events(
                    phase="milestones",
                    prompt=(
                        "Using this executive summary as a guide, extract milestones "
                        "with span data references.\n\n"
                        f"Executive summary: {executive_summary}"
                    ),
                    agent=self.milestone_agent,
                ),
                trace_id=trace_id,
            )
            logger.debug(
                "Trace summarization pass2 complete trace_id=%s elapsed_s=%.2f",
                trace_id,
                time.perf_counter() - started_at,
            )

            # Post-processing: resolve refs to actual trace values
            if not milestone_result:
                return None
            summary = milestone_result
            for milestone in summary.milestones:
                milestone.inputs = resolve_span_data_refs(milestone.inputs, deps)
                milestone.outputs = resolve_span_data_refs(milestone.outputs, deps)

            logger.info(
                "Trace summarization succeeded trace_id=%s milestones=%d elapsed_s=%.2f",
                trace_id,
                len(summary.milestones),
                time.perf_counter() - started_at,
            )
            return summary

        except asyncio.CancelledError:
            logger.warning(
                "Trace summarization cancelled trace_id=%s elapsed_s=%.2f",
                trace_id,
                time.perf_counter() - started_at,
            )
            _emit({"event": "run_failed", "error": "Cancelled"})
            raise
        except Exception as e:
            logger.error(
                "Trace summarization failed trace_id=%s error_type=%s error=%s elapsed_s=%.2f",
                trace_id,
                type(e).__name__,
                e,
                time.perf_counter() - started_at,
                exc_info=True,
            )
            _emit({"event": "run_failed", "error": str(e)})
            return None

    async def answer_thread_prompt(
        self,
        trace_context: dict,
        prompt: str,
        trace_id: str | None = None,
        list_thread_comments_fn: Callable[[int, bool], list[dict[str, Any]]] | None = None,
        create_thread_reply_comment_fn: Callable[[str], dict[str, Any]] | None = None,
        on_partial: Callable[[str], None] | None = None,
        on_event: Callable[[dict[str, Any]], None] | None = None,
    ) -> str | None:
        """Run a single free-form, tool-calling answer for discovery thread prompts."""
        started_at = time.perf_counter()
        try:
            deps = TraceContext.from_dict(trace_context)
            deps.list_thread_comments_fn = list_thread_comments_fn
            deps.create_thread_reply_comment_fn = create_thread_reply_comment_fn

            async def _run_streaming_answer() -> str:
                latest_text = ""
                text_by_index: dict[int, str] = {}
                final_text = ""
                async for event in self.thread_agent.run_stream_events(prompt, deps=deps):
                    if isinstance(event, pai_messages.PartStartEvent):
                        part = event.part
                        if isinstance(part, pai_messages.ThinkingPart):
                            if on_event and part.content:
                                on_event({"event": "reasoning_delta", "reasoning": part.content})
                        elif isinstance(part, pai_messages.TextPart):
                            text_by_index[event.index] = part.content or ""
                        continue

                    if isinstance(event, pai_messages.PartDeltaEvent):
                        delta = event.delta
                        if isinstance(delta, pai_messages.ThinkingPartDelta):
                            if on_event and delta.content_delta:
                                on_event({"event": "reasoning_delta", "reasoning": delta.content_delta})
                        elif isinstance(delta, pai_messages.TextPartDelta):
                            current = text_by_index.get(event.index, "")
                            current = f"{current}{delta.content_delta or ''}"
                            text_by_index[event.index] = current
                            assembled = "".join(text_by_index.get(i, "") for i in sorted(text_by_index)).strip()
                            if assembled and assembled != latest_text:
                                latest_text = assembled
                                if on_partial:
                                    on_partial(assembled)
                        elif isinstance(delta, pai_messages.ToolCallPartDelta):
                            if on_event and delta.tool_name_delta:
                                on_event({"event": "reasoning_delta", "reasoning": f"tool_call_delta:{delta.tool_name_delta}"})
                        continue

                    if isinstance(event, pai_messages.FunctionToolCallEvent):
                        part = event.part
                        if on_event:
                            on_event(
                                {
                                    "event": "tool_start",
                                    "tool_name": part.tool_name,
                                    "tool_call_id": part.tool_call_id,
                                }
                            )
                        continue

                    if isinstance(event, pai_messages.FunctionToolResultEvent):
                        result_part = event.result
                        tool_name = getattr(result_part, "tool_name", None)
                        tool_call_id = getattr(result_part, "tool_call_id", None)
                        if on_event:
                            on_event(
                                {
                                    "event": "tool_result",
                                    "tool_name": tool_name,
                                    "tool_call_id": tool_call_id,
                                    "result_summary": "completed",
                                }
                            )
                        continue

                    if isinstance(event, AgentRunResultEvent):
                        final_text = str(getattr(event.result, "output", "") or "").strip()

                if final_text and final_text != latest_text and on_partial:
                    on_partial(final_text)
                return final_text or latest_text

            answer = (await self._run_with_429_retry(_run_streaming_answer, trace_id=trace_id)).strip()
            if not answer:
                return None
            logger.info(
                "Thread agent answer succeeded trace_id=%s elapsed_s=%.2f",
                trace_id,
                time.perf_counter() - started_at,
            )
            return answer
        except asyncio.CancelledError:
            logger.warning(
                "Thread agent answer cancelled trace_id=%s elapsed_s=%.2f",
                trace_id,
                time.perf_counter() - started_at,
            )
            raise
        except Exception:
            logger.exception("Thread agent answer failed trace_id=%s", trace_id)
            return None

    async def summarize_batch(
        self,
        traces: list[dict],
        on_progress: Callable[[int, int, int], None] | None = None,
        on_trace_event: Callable[[str, dict[str, Any]], None] | None = None,
    ) -> list[dict]:
        """Summarize a batch of traces concurrently.

        Args:
            traces: List of dicts with 'id' and 'context' keys
            on_progress: Callback(completed, total, failed) for progress tracking

        Returns:
            List of dicts with 'trace_id' and 'summary' (None on failure)
        """
        semaphore = asyncio.Semaphore(self.max_concurrency)
        total = len(traces)
        completed = 0
        failed = 0
        batch_started_at = time.perf_counter()
        lock = asyncio.Lock()
        # Stagger task starts so we don't burst all concurrent tasks at once
        task_index = 0
        index_lock = asyncio.Lock()
        logger.info(
            "Batch summarization started traces=%d max_concurrency=%d",
            total,
            self.max_concurrency,
        )

        async def process_one(trace: dict) -> dict:
            nonlocal completed, failed, task_index
            trace_id = trace["id"]
            error_msg = None
            trace_started_at = time.perf_counter()
            events: list[dict[str, Any]] = []

            def _record_event(event: dict[str, Any]) -> None:
                payload = {"timestamp_ms": int(time.time() * 1000), **event}
                events.append(payload)
                if on_trace_event:
                    on_trace_event(trace_id, payload)

            # Stagger: each task waits a bit before acquiring the semaphore
            async with index_lock:
                my_index = task_index
                task_index += 1
            if my_index > 0:
                await asyncio.sleep(min(my_index * 0.5, 3.0))

            async with semaphore:
                try:
                    summary = await self.summarize_trace(trace["context"], trace_id=trace_id, on_event=_record_event)
                except asyncio.CancelledError:
                    logger.warning(
                        "Batch trace task cancelled trace_id=%s elapsed_s=%.2f",
                        trace_id,
                        time.perf_counter() - trace_started_at,
                    )
                    raise
                except Exception as e:
                    summary = None
                    error_msg = str(e)
                    logger.error(
                        "Unhandled trace exception trace_id=%s error_type=%s error=%s",
                        trace_id,
                        type(e).__name__,
                        e,
                        exc_info=True,
                    )

            if summary is None and not error_msg:
                last_error = next(
                    (evt for evt in reversed(events) if evt.get("event") == "run_failed" and evt.get("error")),
                    None,
                )
                if isinstance(last_error, dict):
                    error_msg = str(last_error.get("error") or "No summary produced")
                else:
                    error_msg = "No summary produced"

            async with lock:
                if summary is None:
                    failed += 1
                completed += 1
                logger.info(
                    "Batch summarization progress completed=%d/%d failed=%d trace_id=%s trace_elapsed_s=%.2f",
                    completed,
                    total,
                    failed,
                    trace_id,
                    time.perf_counter() - trace_started_at,
                )
                if on_progress:
                    on_progress(completed, total, failed)

            result = {
                "trace_id": trace_id,
                "summary": summary.model_dump() if summary else None,
                "events": events,
            }
            if error_msg:
                result["error"] = error_msg
            return result

        results = await asyncio.gather(*[process_one(t) for t in traces])
        logger.info(
            "Batch summarization finished completed=%d failed=%d total=%d elapsed_s=%.2f",
            completed,
            failed,
            total,
            time.perf_counter() - batch_started_at,
        )
        return list(results)
