# Summarization Tool-Based Agent Implementation Plan

**Spec:** [TRACE_SUMMARIZATION_SPEC](../../specs/TRACE_SUMMARIZATION_SPEC.md)
**Goal:** Refactor summarization agent from prompt-dump to tool-equipped PydanticAI agent with span data references resolved from the trace
**Architecture:** The trace context is wrapped in a `TraceContext` dataclass and passed as a PydanticAI dependency. Five tool functions (modeled on `mlflow.genai.judges.tools`) give the agent structured access to trace data. The agent produces milestones with `SpanDataRef` references (span_name + field + optional jsonpath). A post-processing step resolves each ref to the actual value from the trace — same pattern as `span_filter_utils.py`. The old `MilestoneEvent` model is replaced by `inputs`/`outputs` lists of `SpanDataRef` per milestone. Batch orchestration and job tracking are unchanged.

**Success Criteria Targeted:**

Summarization Pipeline:
- SC-T1: Agent uses trace inspection tools to selectively examine spans (not a full-text dump)
- SC-T2: Agent tools include: get_trace_overview, list_spans, get_span_detail, get_root_span, search_spans
- SC-T3: Milestone summaries contain substantive content from spans (actual queries, results, decisions)
- SC-T4: Milestone summaries avoid mechanical flow narration (not "query received", "results returned")
- SC-P1: Agent accesses trace data through inspection tools (not a full-text dump)
- SC-P3: Agent produces an executive summary as the first pass
- SC-P4: Agent extracts milestones with relevant span data as the second pass
- SC-P5: Each milestone includes span data references resolved to actual trace values
- SC-P6: Summarization failure does not block trace ingestion
- SC-C3: Facilitator can provide optional free-text guidance for the summarization prompt

Milestone Structure:
- SC-M1: Each milestone has a number, title, and summary
- SC-M2: Each milestone has zero or more input span data references
- SC-M3: Each milestone has zero or more output span data references
- SC-M4: Span data references are resolved to actual values from the trace after agent output
- SC-M5: When jsonpath is null, the entire span inputs or outputs field is included
- SC-M6: Invalid span references resolve to null without failing the milestone
- SC-M7: The agent determines the number of milestones based on trace complexity

UI:
- SC-U1: Milestones show title, summary, and resolved span data (inputs → outputs)

Batch (unchanged, re-verified):
- SC-B1: Multiple traces are summarized concurrently up to a configurable concurrency limit
- SC-B2: Partial failures do not block the batch

---

## File Map

### Modified Files
| File | Change |
|------|--------|
| `server/services/trace_summarization_service.py` | Replace with TraceContext, 5 tools, SpanDataRef model, resolution logic, updated prompts |
| `tests/unit/services/test_trace_summarization_service.py` | Replace with tool tests, resolution tests, updated agent tests |
| `client/src/components/MilestoneView.tsx` | Replace event-based UI with input→output span data display |

---

### Task 1: Define TraceContext, SpanDataRef, and Tool Functions

**Spec criteria:** SC-T1, SC-T2, SC-M2, SC-M3
**Files:**
- Modify: `server/services/trace_summarization_service.py`
- Test: `tests/unit/services/test_trace_summarization_service.py`

- [ ] **Step 1: Write tests for TraceContext, models, and all 5 tools**

```python
import re
import pytest
from server.services.trace_summarization_service import (
    TraceContext,
    SpanDataRef,
    Milestone,
    TraceSummary,
    get_trace_overview,
    list_spans,
    get_span_detail,
    get_root_span,
    search_spans,
)

SAMPLE_TRACE_CONTEXT_DICT = {
    "spans": [
        {
            "name": "root_agent",
            "span_type": "AGENT",
            "status": "OK",
            "inputs": {"task": "Find worst performing issuers by spend active rate"},
            "outputs": {"result": "Three US issuers at 0% spend active rate: ICAs 67311, 12346, 12933"},
            "start_time_ns": 1000000000,
            "end_time_ns": 5000000000,
            "parent_span_id": None,
        },
        {
            "name": "spend_active_recommendation",
            "span_type": "TOOL",
            "status": "OK",
            "inputs": {"query": "worst performing issuers by spend active rate"},
            "outputs": {"sql": "SELECT ica, country, overall_spend_active_rate_reported FROM view_overall_spend_active_rate ORDER BY overall_spend_active_rate_reported ASC", "row_count": 240},
            "start_time_ns": 1500000000,
            "end_time_ns": 3500000000,
            "parent_span_id": "span-1",
        },
        {
            "name": "generate_response",
            "span_type": "LLM",
            "status": "OK",
            "inputs": {"context": "240 rows of issuer data"},
            "outputs": {"content": "Three US-based issuers at 0% spend active rate"},
            "start_time_ns": 3500000000,
            "end_time_ns": 4800000000,
            "parent_span_id": "span-1",
        },
        {
            "name": "error_span",
            "span_type": "TOOL",
            "status": "ERROR",
            "inputs": {"query": "test"},
            "outputs": {"error": "timeout"},
            "start_time_ns": 4800000000,
            "end_time_ns": 4900000000,
            "parent_span_id": "span-1",
        },
    ],
    "execution_time_ms": 4000,
    "status": "OK",
    "tags": {"model": "claude-sonnet-4-5"},
}


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestTraceContext:

    def test_from_dict(self):
        ctx = TraceContext.from_dict(SAMPLE_TRACE_CONTEXT_DICT)
        assert ctx.status == "OK"
        assert ctx.execution_time_ms == 4000
        assert len(ctx.spans) == 4

    def test_from_dict_missing_fields_uses_defaults(self):
        ctx = TraceContext.from_dict({"spans": []})
        assert ctx.status == "UNKNOWN"
        assert ctx.execution_time_ms == 0
        assert ctx.spans == []


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestSpanDataRefModel:

    @pytest.mark.req("Each milestone has zero or more input span data references (span_name, field, optional jsonpath)")
    def test_span_data_ref_with_jsonpath(self):
        ref = SpanDataRef(span_name="my_tool", field="outputs", jsonpath="$.sql")
        assert ref.span_name == "my_tool"
        assert ref.field == "outputs"
        assert ref.jsonpath == "$.sql"
        assert ref.value is None

    @pytest.mark.req("Each milestone has zero or more output span data references (span_name, field, optional jsonpath)")
    def test_span_data_ref_without_jsonpath(self):
        ref = SpanDataRef(span_name="my_tool", field="inputs")
        assert ref.jsonpath is None
        assert ref.value is None

    @pytest.mark.req("Each milestone has a number, title, and summary")
    def test_milestone_with_refs(self):
        m = Milestone(
            number=1,
            title="Test",
            summary="Did a thing",
            inputs=[SpanDataRef(span_name="a", field="inputs")],
            outputs=[SpanDataRef(span_name="a", field="outputs", jsonpath="$.result")],
        )
        assert len(m.inputs) == 1
        assert len(m.outputs) == 1


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
@pytest.mark.req("Agent tools include: get_trace_overview, list_spans, get_span_detail, get_root_span, search_spans")
class TestTraceTools:

    def setup_method(self):
        self.ctx = TraceContext.from_dict(SAMPLE_TRACE_CONTEXT_DICT)

    def test_get_trace_overview(self):
        result = get_trace_overview(self.ctx)
        assert result["status"] == "OK"
        assert result["execution_time_ms"] == 4000
        assert result["span_count"] == 4
        assert result["error_spans"] == ["error_span"]
        assert result["root_span_name"] == "root_agent"

    def test_list_spans_unfiltered(self):
        result = list_spans(self.ctx)
        assert len(result) == 4
        assert result[0]["name"] == "root_agent"
        assert "duration_ms" in result[0]

    def test_list_spans_filter_by_type(self):
        result = list_spans(self.ctx, filter_type="TOOL")
        assert len(result) == 2
        names = [s["name"] for s in result]
        assert "spend_active_recommendation" in names
        assert "error_span" in names

    def test_list_spans_filter_by_status(self):
        result = list_spans(self.ctx, filter_status="ERROR")
        assert len(result) == 1
        assert result[0]["name"] == "error_span"

    def test_get_span_detail(self):
        result = get_span_detail(self.ctx, span_name="spend_active_recommendation")
        assert result["name"] == "spend_active_recommendation"
        assert result["span_type"] == "TOOL"
        assert result["outputs"]["row_count"] == 240

    def test_get_span_detail_not_found(self):
        result = get_span_detail(self.ctx, span_name="nonexistent")
        assert "error" in result

    def test_get_root_span(self):
        result = get_root_span(self.ctx)
        assert result["name"] == "root_agent"
        assert "Find worst performing" in str(result["inputs"])
        assert "0% spend active rate" in str(result["outputs"])

    def test_get_root_span_no_root(self):
        ctx = TraceContext.from_dict({"spans": [
            {"name": "child", "span_type": "TOOL", "parent_span_id": "parent-1",
             "inputs": {}, "outputs": {}, "start_time_ns": 0, "end_time_ns": 1}
        ]})
        result = get_root_span(ctx)
        assert "error" in result

    def test_search_spans(self):
        result = search_spans(self.ctx, pattern="spend_active_rate")
        assert len(result) > 0
        assert any(r["span_name"] == "spend_active_recommendation" for r in result)

    def test_search_spans_no_match(self):
        result = search_spans(self.ctx, pattern="zzz_nonexistent_zzz")
        assert len(result) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server -k "TestTraceContext or TestSpanDataRefModel or TestTraceTools"`
Expected: FAIL — imports don't exist

- [ ] **Step 3: Implement TraceContext, SpanDataRef, and tool functions**

Replace the output models and add tool functions in `server/services/trace_summarization_service.py`. The new models:

```python
from dataclasses import dataclass, field as dc_field
from typing import Any

class SpanDataRef(BaseModel):
    """Reference to actual data in a trace span. Agent produces these; system resolves values."""
    span_name: str
    field: Literal["inputs", "outputs"]
    jsonpath: str | None = Field(default=None, description="JSONPath to select a subfield, e.g. '$.query'. Full field if omitted.")
    value: Any | None = Field(default=None, description="Resolved value — populated by post-processing, not the agent")

class Milestone(BaseModel):
    number: int
    title: str
    summary: str = Field(description="Agent's narrative of what happened in this phase")
    inputs: list[SpanDataRef] = Field(default_factory=list, description="Data that flowed into this phase")
    outputs: list[SpanDataRef] = Field(default_factory=list, description="Data that came out of this phase")

class TraceSummary(BaseModel):
    executive_summary: str
    milestones: list[Milestone]

@dataclass
class TraceContext:
    """Trace data passed as PydanticAI dependency. Tools inspect this."""
    spans: list[dict] = dc_field(default_factory=list)
    status: str = "UNKNOWN"
    execution_time_ms: float = 0
    tags: dict = dc_field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict) -> TraceContext:
        return cls(
            spans=d.get("spans", []),
            status=d.get("status", "UNKNOWN"),
            execution_time_ms=d.get("execution_time_ms", 0),
            tags=d.get("tags", {}),
        )
```

Tool functions (same as plan v1 — `get_trace_overview`, `list_spans`, `get_span_detail`, `get_root_span`, `search_spans`).

Remove `MilestoneEvent` and `ExecutiveSummary` models (ExecutiveSummary stays as internal pass-1 output only).

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test-server -k "TestTraceContext or TestSpanDataRefModel or TestTraceTools"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/trace_summarization_service.py tests/unit/services/test_trace_summarization_service.py
git commit -m "feat(summarization): add TraceContext, SpanDataRef model, and trace inspection tools

Modeled on mlflow.genai.judges.tools. SpanDataRef replaces MilestoneEvent
with span_name + field + optional jsonpath references."
```

---

### Task 2: Add Span Data Reference Resolution

**Spec criteria:** SC-M4, SC-M5, SC-M6, SC-P5
**Files:**
- Modify: `server/services/trace_summarization_service.py`
- Test: `tests/unit/services/test_trace_summarization_service.py`

- [ ] **Step 1: Write tests for resolve_span_data_refs**

```python
@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestSpanDataResolution:

    def setup_method(self):
        self.ctx = TraceContext.from_dict(SAMPLE_TRACE_CONTEXT_DICT)

    @pytest.mark.req("Span data references are resolved to actual values from the trace after agent output")
    def test_resolve_ref_full_field(self):
        ref = SpanDataRef(span_name="spend_active_recommendation", field="inputs")
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert resolved[0].value == {"query": "worst performing issuers by spend active rate"}

    @pytest.mark.req("Span data references are resolved to actual values from the trace after agent output")
    def test_resolve_ref_with_jsonpath(self):
        ref = SpanDataRef(span_name="spend_active_recommendation", field="outputs", jsonpath="$.row_count")
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert resolved[0].value == 240

    @pytest.mark.req("Span data references are resolved to actual values from the trace after agent output")
    def test_resolve_ref_jsonpath_string(self):
        ref = SpanDataRef(span_name="spend_active_recommendation", field="outputs", jsonpath="$.sql")
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert "SELECT ica" in resolved[0].value

    @pytest.mark.req("When jsonpath is null, the entire span inputs or outputs field is included")
    def test_resolve_ref_no_jsonpath_includes_full_field(self):
        ref = SpanDataRef(span_name="root_agent", field="outputs")
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert "result" in resolved[0].value
        assert "0% spend active rate" in str(resolved[0].value)

    @pytest.mark.req("Invalid span references (nonexistent span or path) resolve to null without failing the milestone")
    def test_resolve_ref_nonexistent_span(self):
        ref = SpanDataRef(span_name="does_not_exist", field="inputs")
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert resolved[0].value is None

    @pytest.mark.req("Invalid span references (nonexistent span or path) resolve to null without failing the milestone")
    def test_resolve_ref_bad_jsonpath(self):
        ref = SpanDataRef(span_name="root_agent", field="outputs", jsonpath="$.nonexistent_key")
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert resolved[0].value is None

    def test_resolve_multiple_refs(self):
        refs = [
            SpanDataRef(span_name="spend_active_recommendation", field="inputs", jsonpath="$.query"),
            SpanDataRef(span_name="spend_active_recommendation", field="outputs", jsonpath="$.row_count"),
        ]
        resolved = resolve_span_data_refs(refs, self.ctx)
        assert resolved[0].value == "worst performing issuers by spend active rate"
        assert resolved[1].value == 240
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server -k "TestSpanDataResolution"`
Expected: FAIL — resolve_span_data_refs not defined

- [ ] **Step 3: Implement resolve_span_data_refs**

```python
def resolve_span_data_refs(refs: list[SpanDataRef], ctx: TraceContext) -> list[SpanDataRef]:
    """Resolve SpanDataRef list to actual values from the trace.

    For each ref, finds the named span, extracts the field (inputs/outputs),
    and optionally applies JSONPath. Returns new SpanDataRef instances with
    value populated. Invalid refs get value=None.
    """
    resolved = []
    for ref in refs:
        value = None
        # Find the span
        span = next((s for s in ctx.spans if s.get("name") == ref.span_name), None)
        if span is not None:
            field_data = span.get("inputs" if ref.field == "inputs" else "outputs", {})
            if ref.jsonpath is None:
                value = field_data
            else:
                value = _apply_jsonpath(field_data, ref.jsonpath)
        resolved.append(ref.model_copy(update={"value": value}))
    return resolved


def _apply_jsonpath(data: dict | str, path: str) -> Any | None:
    """Apply a JSONPath expression to data. Returns None on failure."""
    try:
        from jsonpath_ng import parse
        if isinstance(data, str):
            import json
            data = json.loads(data)
        expr = parse(path)
        matches = [m.value for m in expr.find(data)]
        if not matches:
            return None
        return matches[0] if len(matches) == 1 else matches
    except Exception:
        return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test-server -k "TestSpanDataResolution"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/trace_summarization_service.py tests/unit/services/test_trace_summarization_service.py
git commit -m "feat(summarization): add SpanDataRef resolution from trace data

Resolves span_name + field + optional jsonpath to actual trace values.
Invalid refs resolve to null without failing."
```

---

### Task 3: Refactor Agents to Use Tools, Updated Prompts, and Resolution

**Spec criteria:** SC-T1, SC-T3, SC-T4, SC-P1, SC-P3, SC-P4, SC-P5, SC-P6, SC-C3, SC-B1, SC-B2
**Files:**
- Modify: `server/services/trace_summarization_service.py`
- Modify: `tests/unit/services/test_trace_summarization_service.py`

- [ ] **Step 1: Write tests for tool-based agent and resolution integration**

```python
@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestToolBasedAgent:

    @pytest.mark.req("Agent uses trace inspection tools to selectively examine spans (not a full-text dump)")
    def test_agents_have_tools_registered(self):
        service = TraceSummarizationService(
            endpoint_url="https://test.databricks.com/serving-endpoints",
            token="test-token",
            model_name="test-model",
        )
        summary_tool_names = {t.name for t in service.summary_agent._function_tools.values()}
        milestone_tool_names = {t.name for t in service.milestone_agent._function_tools.values()}
        expected = {"get_trace_overview", "list_spans", "get_span_detail", "get_root_span", "search_spans"}
        assert expected.issubset(summary_tool_names)
        assert expected.issubset(milestone_tool_names)

    @pytest.mark.req("Agent uses trace inspection tools to selectively examine spans (not a full-text dump)")
    def test_format_trace_for_prompt_removed(self):
        assert not hasattr(TraceSummarizationService, '_format_trace_for_prompt')

    @pytest.mark.req("Facilitator can provide optional free-text guidance for the summarization prompt")
    def test_guidance_included_in_instructions(self):
        service = TraceSummarizationService(
            endpoint_url="https://test.databricks.com/serving-endpoints",
            token="test-token",
            model_name="test-model",
            guidance="Focus on SQL queries and their results",
        )
        all_instructions = " ".join(service.milestone_agent._instructions)
        assert "Focus on SQL queries and their results" in all_instructions
```

Update `SAMPLE_TRACE_SUMMARY` to use the new model shape, and update `for_testing`:

```python
SAMPLE_EXEC_SUMMARY = ExecutiveSummary(
    executive_summary="Agent extracted owner name from TitleFlex and updated the plan."
)

SAMPLE_TRACE_SUMMARY = TraceSummary(
    executive_summary="Agent extracted owner name from TitleFlex and updated the plan.",
    milestones=[
        Milestone(
            number=1,
            title="Data Extraction",
            summary="Searched TitleFlex for owner name, found ANDREY V MIRONETS.",
            inputs=[SpanDataRef(span_name="search_titleflex", field="inputs", jsonpath="$.query")],
            outputs=[SpanDataRef(span_name="search_titleflex", field="outputs", jsonpath="$.name")],
        ),
        Milestone(
            number=2,
            title="Plan Update",
            summary="Updated plan with extraction results.",
            inputs=[SpanDataRef(span_name="generalist_agent", field="inputs")],
            outputs=[SpanDataRef(span_name="generalist_agent", field="outputs")],
        ),
    ],
)
```

Also update `SAMPLE_TRACE_CONTEXT` to include `parent_span_id` and `status` fields.

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server -k "TestToolBasedAgent"`
Expected: FAIL — agents still use old approach

- [ ] **Step 3: Rewrite agent setup, prompts, and summarize_trace**

Updated prompts:

```python
EXECUTIVE_SUMMARY_INSTRUCTIONS = """You are a trace analysis agent. You analyze execution traces from AI agents by inspecting them with your tools, then produce a concise executive summary.

Use your tools to understand what happened:
1. Call get_trace_overview to see the trace status, span count, and any errors
2. Call list_spans to see all spans and identify the important ones (tool calls, errors, key outputs)
3. Call get_root_span to see the user's original request and the final response
4. Call get_span_detail on the most important spans to see their actual inputs and outputs

Then write a 1-3 sentence executive summary focusing on:
- What was the user's goal?
- What substantive actions were taken? (name the actual tools, queries, data sources)
- What was the concrete outcome? (include specific results, numbers, findings)

Include actual data from the spans — not "a query was executed" but "queried view_spend_active_rate, returning 240 rows"."""

MILESTONE_INSTRUCTIONS = """You are a trace analysis agent. Given an executive summary and access to trace inspection tools, extract logical milestones that tell the substantive story of what happened.

Use your tools to drill into specific spans for each milestone:
1. Call list_spans to see the full span structure
2. Call get_span_detail on spans relevant to each milestone to extract actual content
3. Call search_spans if you need to find specific data across the trace

For each milestone:
- Give it a short, descriptive title that reflects the substance (not "Query Executed" but "Queried Issuer Spend Active Rates")
- Write a 1-2 sentence summary including actual data from the spans
- Add span data references for the key inputs and outputs of that phase

For span data references:
- Each ref points to a specific span's inputs or outputs
- Use jsonpath (e.g. "$.query", "$.sql", "$.result") to select the specific subfield that matters
- Omit jsonpath to include the entire inputs or outputs object
- The system will resolve these to actual values — just provide the span_name, field, and jsonpath

Anti-patterns to avoid in summaries:
- "The agent processed the query" → instead: name the actual query and data source
- "Results were returned" → instead: state what the results showed
- "A response was generated" → instead: summarize what the response concluded"""
```

Refactor `__init__` to register tools with `TraceContext` deps. Wrap tool functions for PydanticAI's `RunContext`:

```python
from pydantic_ai import Agent, RunContext

def _make_pydantic_ai_tools():
    """Create PydanticAI-compatible tool wrappers that extract deps from RunContext."""

    def pai_get_trace_overview(ctx: RunContext[TraceContext]) -> dict:
        """Get high-level trace metadata and health check."""
        return get_trace_overview(ctx.deps)

    def pai_list_spans(ctx: RunContext[TraceContext], filter_type: str | None = None, filter_status: str | None = None) -> list[dict]:
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

    return [pai_get_trace_overview, pai_list_spans, pai_get_span_detail, pai_get_root_span, pai_search_spans]
```

Update `summarize_trace` to use deps and add post-processing resolution:

```python
async def summarize_trace(self, trace_context: dict, trace_id: str | None = None) -> TraceSummary | None:
    if hasattr(self, '_test_raise_error') and self._test_raise_error:
        return None
    if hasattr(self, '_test_fail_trace_ids') and trace_id in self._test_fail_trace_ids:
        return None

    try:
        deps = TraceContext.from_dict(trace_context)

        # Pass 1: Executive summary
        exec_result = await self.summary_agent.run(
            "Analyze this trace using your tools. Explore the structure, inspect key spans, and produce an executive summary.",
            deps=deps,
        )
        executive_summary = exec_result.output.executive_summary

        # Pass 2: Milestones with span data refs
        milestone_result = await self.milestone_agent.run(
            f"Using this executive summary as a guide, extract milestones with span data references.\n\nExecutive summary: {executive_summary}",
            deps=deps,
        )

        # Post-processing: resolve SpanDataRefs to actual trace values
        summary = milestone_result.output
        for milestone in summary.milestones:
            milestone.inputs = resolve_span_data_refs(milestone.inputs, deps)
            milestone.outputs = resolve_span_data_refs(milestone.outputs, deps)

        return summary

    except Exception as e:
        logger.error(f"Trace summarization failed for {trace_id}: {e}", exc_info=True)
        return None
```

Remove `_format_trace_for_prompt`. Remove old `MilestoneEvent` model.

Update `for_testing` to include tools and `deps_type=TraceContext` on both agents.

- [ ] **Step 4: Run all summarization tests**

Run: `just test-server -k "summarization"`
Expected: All tests PASS (tools, resolution, agent, batch)

- [ ] **Step 5: Commit**

```bash
git add server/services/trace_summarization_service.py tests/unit/services/test_trace_summarization_service.py
git commit -m "feat(summarization): refactor to tool-based agent with span data resolution

Agents use get_trace_overview, list_spans, get_span_detail, get_root_span,
search_spans via PydanticAI deps. Milestones use SpanDataRef inputs/outputs
resolved to actual trace values in post-processing."
```

---

### Task 4: Update MilestoneView UI

**Spec criteria:** SC-U1
**Files:**
- Modify: `client/src/components/MilestoneView.tsx`

- [ ] **Step 1: Update TypeScript types and component**

Replace the event-based display with input→output span data display:

```typescript
interface SpanDataRef {
  span_name: string;
  field: 'inputs' | 'outputs';
  jsonpath?: string | null;
  value?: unknown;
}

interface Milestone {
  number: number;
  title: string;
  summary: string;
  inputs: SpanDataRef[];
  outputs: SpanDataRef[];
}
```

Replace `MilestoneEventItem` with a `SpanDataDisplay` component that shows:
- The span name and jsonpath as a label (e.g. `spend_active_recommendation → $.sql`)
- The resolved value (formatted JSON or plain text)
- Inputs displayed on one side, outputs on the other (or input→output flow)

Each milestone card shows:
1. Title + summary (as before)
2. **Inputs** section: list of resolved span data refs
3. **Outputs** section: list of resolved span data refs

- [ ] **Step 2: Run lint**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/MilestoneView.tsx
git commit -m "feat(summarization): update MilestoneView to show resolved span data

Replaces event-based display with input→output span data references.
Each milestone shows its resolved inputs and outputs from actual trace spans."
```

---

### Task 5 (Final): Lint and Verify

- [ ] **Step 1: Run backend linting**

Run: `just lint` (or equivalent)
Expected: No errors

- [ ] **Step 2: Run frontend linting**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 3: Run full test suite**

Run: `just test-server -k "summarization"`
Expected: All tests PASS

- [ ] **Step 4: Check for regressions**

Run: `just test-server`
Expected: No new failures

- [ ] **Step 5: Update implementation log**

Update the spec's Implementation Log entry status from `planned` to `in-progress`.
