# TRACE_SUMMARIZATION_SPEC

## Overview

Provides LLM-powered trace summarization at ingestion time. An agent analyzes the full MLflow trace (span hierarchy, tool calls, inputs/outputs) and produces a structured "milestone view" — an executive summary followed by numbered milestones with relevant data selected from actual spans.

This is an opt-in feature configured per-workshop by the facilitator. It's most valuable for complex agent traces with many spans, tool calls, and transfers.

## Core Concepts

### Executive Summary
A high-level narrative (1-3 sentences) of what happened in the trace. Generated first, then used to guide milestone extraction.

### Milestone
A logical phase of the trace's execution. Each milestone has a title, a narrative summary, and references to the actual span data that flowed through that phase. The agent decides how many milestones are appropriate based on trace complexity — there is no fixed target.

### Span Data Reference
A pointer to actual data in a trace span. Each reference specifies a span name, whether it's the span's inputs or outputs, and an optional JSONPath to select a specific subfield. The agent produces these references; the system resolves them to actual values from the trace — following the same pattern as the existing span attribute filter and JSONPath extraction (see TRACE_DISPLAY_SPEC).

This ensures milestone data is ground truth from the trace, not LLM-generated summaries of it.

### Two-Pass Generation
1. **Pass 1 — Executive summary**: Agent uses trace inspection tools to explore the trace structure and key spans, then produces a high-level narrative of what happened substantively
2. **Pass 2 — Milestone extraction**: Agent uses the executive summary as a guide, then uses trace inspection tools to drill into specific spans and extract milestones with actual content from the trace

## Behavior

### Summarization Trigger
Summarization runs at ingestion time when:
- The workshop has `summarization_enabled = true`
- A `summarization_model` is configured (non-null, non-empty)

When disabled or not configured, traces are ingested normally without summaries.

### Agent Input
The agent accesses trace data through tools rather than receiving the full trace as text. The trace context is provided as a PydanticAI dependency, and the agent calls tools to selectively inspect the trace:

1. **Overview first**: `get_trace_overview` and `list_spans` to understand structure
2. **Selective drilling**: `get_span_detail` on spans that matter (tool calls, errors, key outputs)
3. **Content search**: `search_spans` to find specific data across the trace

This tool-based approach produces better summaries because the agent decides what's important rather than trying to summarize a truncated text dump.

### Agent Tools

The summarization agent has access to trace inspection tools modeled on [`mlflow.genai.judges.tools`](https://github.com/mlflow/mlflow/tree/master/mlflow/genai/judges/tools). These tools operate on the in-memory trace context (the trace data is already available at ingestion time).

| Tool | Signature | Purpose |
|------|-----------|---------|
| `get_trace_overview` | `() → { status, execution_time_ms, span_count, error_spans, root_span_name }` | High-level trace metadata and health check |
| `list_spans` | `(filter_type?: str, filter_status?: str) → [{ name, span_type, status, duration_ms }]` | All spans with optional filtering by type or status |
| `get_span_detail` | `(span_name: str) → { name, span_type, status, inputs, outputs, duration_ms }` | Full inputs and outputs for a specific span (no truncation) |
| `get_root_span` | `() → { name, inputs, outputs, duration_ms }` | Entry point span with user request and final response |
| `search_spans` | `(pattern: str) → [{ span_name, field, match }]` | Regex search across span inputs and outputs |

Tools are registered as PydanticAI tools with the trace context passed via dependency injection.

### Prompt Guidance

The summarization prompts should instruct the agent to extract substance, not narrate flow.

**Executive summary pass:**
- Use tools to understand what the trace accomplished, not just its structure
- Focus on: what was the user's goal, what substantive actions were taken, what was the outcome
- Include actual data: queries run, results found, decisions made

**Milestone pass:**
- Milestones should describe what was discovered/decided/produced at each phase
- Quote or reference actual span content: SQL queries, API responses, extracted data, error messages
- Avoid mechanical flow narration ("step received", "results returned", "response generated")
- Event data should contain the substantive content from spans, not metadata about the span

**Anti-patterns to avoid:**
- "The agent processed the query" → "The agent queried `view_spend_active_rate` for issuers with lowest spend active rates"
- "Results were returned to the agent" → "240 rows returned, showing three US issuers at 0% spend active rate"
- "The agent synthesized a response" → "Identified ICAs 67311, 12346, 12933 as critical performers and recommended immediate investigation"

### Agent Output
A structured JSON object stored on the trace. The agent produces milestone titles, summaries, and span data references. The system resolves references to actual values from the trace in a post-processing step.

**Agent produces (before resolution):**

```json
{
  "executive_summary": "Queried issuer spend active rates, found 3 US issuers at 0%, recommended investigation",
  "milestones": [
    {
      "number": 1,
      "title": "Queried Issuer Spend Active Rates",
      "summary": "Agent invoked spend_active_recommendation tool which queried view_overall_spend_active_rate, returning 240 rows of issuer performance data ordered by spend active rate ascending.",
      "inputs": [
        { "span_name": "spend_active_recommendation", "field": "inputs", "jsonpath": "$.query" }
      ],
      "outputs": [
        { "span_name": "spend_active_recommendation", "field": "outputs", "jsonpath": "$.sql" },
        { "span_name": "spend_active_recommendation", "field": "outputs", "jsonpath": "$.row_count" }
      ]
    }
  ]
}
```

**After resolution (stored on trace):**

```json
{
  "executive_summary": "Queried issuer spend active rates, found 3 US issuers at 0%, recommended investigation",
  "milestones": [
    {
      "number": 1,
      "title": "Queried Issuer Spend Active Rates",
      "summary": "Agent invoked spend_active_recommendation tool which queried view_overall_spend_active_rate, returning 240 rows of issuer performance data ordered by spend active rate ascending.",
      "inputs": [
        { "span_name": "spend_active_recommendation", "field": "inputs", "jsonpath": "$.query", "value": "worst performing issuers by spend active rate" }
      ],
      "outputs": [
        { "span_name": "spend_active_recommendation", "field": "outputs", "jsonpath": "$.sql", "value": "SELECT ica, country, overall_spend_active_rate_reported FROM view_overall_spend_active_rate ORDER BY overall_spend_active_rate_reported ASC" },
        { "span_name": "spend_active_recommendation", "field": "outputs", "jsonpath": "$.row_count", "value": 240 }
      ]
    }
  ]
}
```

When `jsonpath` is null, the entire span inputs or outputs field is included as the value.

### Facilitator Guidance
The facilitator can provide optional free-text guidance that is injected into the summarization prompt. Examples:
- "Focus on tool call decisions and why each tool was chosen"
- "Highlight error recovery and fallback handling"
- "Emphasize data extraction steps and what was found vs. missing"

When no guidance is provided, the agent uses a generic summarization prompt.

### Batch Summarization
Ingestion typically involves 20–100 traces. Summarization must handle this efficiently:

- **Parallel execution**: Multiple traces are summarized concurrently, up to a configurable concurrency limit (default: 5). Each trace's two-pass summarization is independent.
- **Progress tracking**: The ingestion response returns immediately with a job/task reference. Progress is tracked (e.g., `{ completed: 45, total: 80, failed: 2 }`).
- **Per-trace retries**: If a single trace's summarization fails (LLM error, timeout, malformed response), it is retried up to 2 times with exponential backoff before being marked as failed.
- **Partial failure tolerance**: Failed summarizations do not block or fail the overall batch. Traces that fail summarization are ingested normally with `summary = null`.
- **Rate limiting**: Respects Databricks serving endpoint rate limits. Backs off on 429 responses.

### Error Handling
- Summarization failures (after retries) do not block trace ingestion — the trace is stored with `summary = null`
- Failed summarizations are logged with trace ID, error type, and retry count for debugging
- The batch status endpoint reports per-trace success/failure

### Re-ingestion
When traces are re-ingested (upsert by `mlflow_trace_id`):
- If summarization is enabled: existing summary is regenerated
- If summarization is disabled: existing summary is preserved (not cleared)

### Facilitator Visibility — Job Tracking

Summarization is a background operation that can take minutes for large batches. The facilitator needs visibility into whether it's running, how far along it is, and what the outcome was.

**Job lifecycle:**
1. Summarization triggered (ingestion with summarization enabled, or manual re-summarize) → a `SummarizationJob` row is created in the database with status `pending`
2. The API response includes the `job_id`
3. The background task updates the job row as traces complete: incrementing `completed` and `failed` counts
4. Frontend polls a status endpoint using the `job_id`
5. On completion, job status becomes `completed` (or `failed` if the entire batch errored). Per-trace failures are recorded in `failed_traces`

**Job data available to the facilitator:**
- `status`: pending, running, completed, failed
- `total`: total traces in the batch
- `completed_traces`: list of trace IDs that have been successfully summarized
- `failed_traces`: list of `{ trace_id, error }` for traces that failed after retries
- `created_at` / `updated_at`: timestamps

Derived counts (`completed`, `failed`, `pending`) are computed from the list lengths.

**Job persistence:** Jobs are stored in the database (not files or memory), so they survive restarts, redeploys, and page refreshes.

### Facilitator Visibility — Progress UI

The SummarizationSettings component shows the state of the most recent summarization job:

- **While running:** Progress indicator with "Summarizing traces... 45/80 complete (2 failed)". Auto-polls the job status endpoint.
- **On completion:** Result summary — "78 succeeded, 2 failed". Failed traces listed with error descriptions.
- **Retry:** Facilitator can retry failed traces, which creates a new job for just those traces.
- **Idle:** Shows last job result summary (if any) and aggregate summary coverage stats.

The progress section appears below the existing configuration controls (enable/disable, model, guidance).

### Facilitator Visibility — Summary Indicators

The facilitator's trace list (FacilitatorDashboard Traces tab) shows summary coverage:

- **Per-trace indicator:** Each trace shows whether it has a summary (e.g., a small icon or badge)
- **Aggregate count:** "45/80 traces summarized" visible in the trace list header or SummarizationSettings

This lets the facilitator see at a glance which traces are covered without clicking into each one.

### Re-summarization from UI

The existing `POST /resummarize` endpoint is surfaced in the SummarizationSettings UI:

- **Re-summarize button** with two options: "All traces" or "Only unsummarized traces"
- **Confirmation dialog** before starting (re-summarizing all traces overwrites existing summaries)
- Triggers a tracked job with the same progress UI as ingestion-triggered summarization
- Button is disabled while a summarization job is already running

## Data Model

### TraceDB Extension

```python
class TraceDB(Base):
    # ... existing fields ...
    summary = Column(JSON, nullable=True)  # Structured milestone view
```

### Workshop Extension

```python
class Workshop(BaseModel):
    # ... existing fields ...
    summarization_enabled: bool = False
    summarization_model: str | None = None
    summarization_guidance: str | None = None
```

### WorkshopDB Extension

```python
class WorkshopDB(Base):
    # ... existing fields ...
    summarization_enabled = Column(Boolean, default=False)
    summarization_model = Column(String, nullable=True)
    summarization_guidance = Column(Text, nullable=True)
```

### SummarizationJobDB

```python
class SummarizationJobDB(Base):
    __tablename__ = "summarization_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False, index=True)
    status = Column(String, default="pending")  # pending, running, completed, failed
    total = Column(Integer, default=0)
    completed_traces = Column(JSON, default=list)  # [trace_id, ...]
    failed_traces = Column(JSON, default=list)  # [{ trace_id, error }, ...]
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
```

### SummarizationJob (Pydantic)

```python
class SummarizationJob(BaseModel):
    id: str
    workshop_id: str
    status: str  # pending, running, completed, failed
    total: int = 0
    completed_traces: list[str] = []  # trace IDs
    failed_traces: list[dict] = []  # [{ trace_id, error }]
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def completed(self) -> int:
        return len(self.completed_traces)

    @computed_field
    @property
    def failed(self) -> int:
        return len(self.failed_traces)
```

### Summarization Models (Pydantic)

```python
class SpanDataRef(BaseModel):
    """Reference to actual data in a trace span. Agent produces these; system resolves values."""
    span_name: str
    field: Literal["inputs", "outputs"]
    jsonpath: str | None = None  # e.g. "$.query" — full field if omitted
    value: Any | None = None     # Populated by post-processing, not the agent

class Milestone(BaseModel):
    number: int
    title: str
    summary: str                            # Agent's narrative of what happened
    inputs: list[SpanDataRef] = []          # Data that flowed into this phase
    outputs: list[SpanDataRef] = []         # Data that came out of this phase

class TraceSummary(BaseModel):
    executive_summary: str
    milestones: list[Milestone]
```

## Implementation

### Files

| File | Change |
|------|--------|
| `server/services/trace_summarization_service.py` | **New** — Agent logic for two-pass summarization |
| `server/services/mlflow_intake_service.py` | Call summarization after trace extraction |
| `server/models.py` | Add `summarization_*` fields to Workshop, add `summary` to Trace |
| `server/database.py` | Add columns to WorkshopDB and TraceDB |
| `migrations/versions/XXXX_add_summarization.py` | **New** — Alembic migration |
| `server/routers/workshops.py` | Add settings endpoints, job status endpoints, expose summary in trace responses |
| `server/database.py` | Add `SummarizationJobDB` table and CRUD methods |
| `migrations/versions/XXXX_add_summarization_jobs.py` | **New** — Alembic migration for `summarization_jobs` table |
| `client/src/components/TraceViewer.tsx` | Milestone view as default with toggle |
| `client/src/components/SummarizationSettings.tsx` | **New** — Facilitator config UI with progress tracking and re-summarize controls |

### Summarization Service

Uses PydanticAI agents with trace inspection tools:

```python
class TraceSummarizationService:
    """Two-pass trace summarization using PydanticAI agents with tools."""

    def __init__(
        self,
        endpoint_url: str,
        token: str,
        model_name: str,
        guidance: str | None = None,
        max_concurrency: int = 5,
    ):
        # PydanticAI agents with trace inspection tools registered
        # Tools: get_trace_overview, list_spans, get_span_detail, get_root_span, search_spans
        # Trace context passed via PydanticAI dependency injection

    async def summarize_trace(self, trace_context: dict, trace_id: str | None = None) -> TraceSummary | None:
        """Two-pass summarization with tool-based trace inspection.

        Pass 1: Agent explores trace via tools → executive summary
        Pass 2: Agent uses executive summary + tools → milestones with span data
        """
```

### API Endpoints

```
PUT  /workshops/{workshop_id}/summarization-settings
     Request: { summarization_enabled, summarization_model, summarization_guidance }
     Response: Updated Workshop

POST /workshops/{workshop_id}/resummarize
     Triggers re-summarization of all traces or only unsummarized traces
     Request: { mode: "all" | "unsummarized" | "failed", trace_ids?: string[] }
     Response: { job_id: string, total: int, message: string }

GET  /workshops/{workshop_id}/summarization-job/{job_id}
     Poll progress of a summarization job
     Response: SummarizationJob { id, status, completed, total, failed, failed_traces, created_at, updated_at }

GET  /workshops/{workshop_id}/summarization-status
     Lightweight summary coverage stats (no job needed)
     Response: { traces_with_summaries: int, traces_without_summaries: int, last_job: SummarizationJob | null }
```

The `ingest-mlflow-traces` endpoint also returns `summarization_job_id` when summarization is triggered:

```
POST /workshops/{workshop_id}/ingest-mlflow-traces
     Response: { trace_count: int, summarization_job_id?: string }
```

## Success Criteria

### Configuration
- [ ] Facilitator can enable/disable trace summarization per workshop
- [ ] Facilitator can select a model for summarization from available Databricks endpoints
- [ ] Facilitator can provide optional free-text guidance for the summarization prompt
- [ ] Settings are persisted per workshop

### Summarization Pipeline
- [ ] Summarization runs at ingestion time when enabled and model is configured
- [ ] Agent accesses trace data through inspection tools (not a full-text dump)
- [ ] Agent produces an executive summary as the first pass
- [ ] Agent extracts milestones with relevant span data as the second pass
- [ ] Each milestone includes span data references resolved to actual trace values
- [ ] Span data references are resolved in a post-processing step (not LLM-generated values)
- [ ] Agent uses trace inspection tools to selectively examine spans (not a full-text dump)
- [ ] Agent tools include: get_trace_overview, list_spans, get_span_detail, get_root_span, search_spans
- [ ] Milestone summaries contain substantive content from spans (actual queries, results, decisions)
- [ ] Milestone summaries avoid mechanical flow narration (not "query received", "results returned")
- [ ] Summarization failure does not block trace ingestion
- [ ] Summary is stored as JSON on the trace record

### Milestone Structure
- [ ] Each milestone has a number, title, and summary
- [ ] Each milestone has zero or more input span data references (span_name, field, optional jsonpath)
- [ ] Each milestone has zero or more output span data references (span_name, field, optional jsonpath)
- [ ] Span data references are resolved to actual values from the trace after agent output
- [ ] When jsonpath is null, the entire span inputs or outputs field is included
- [ ] Invalid span references (nonexistent span or path) resolve to null without failing the milestone
- [ ] The agent determines the number of milestones based on trace complexity

### UI — Milestone View
- [ ] Milestone view is the default display when a summary exists
- [ ] User can toggle between milestone view and the existing trace viewer
- [ ] Milestone view shows executive summary at the top
- [ ] Milestones are numbered and show title, summary, and resolved span data (inputs → outputs)
- [ ] When no summary exists, the existing trace viewer is shown (no toggle)

### Re-ingestion
- [ ] Re-ingesting with summarization enabled regenerates summaries
- [ ] Re-ingesting with summarization disabled preserves existing summaries
- [ ] Facilitator can trigger re-summarization without full re-ingestion

### Batch Summarization
- [ ] Multiple traces are summarized concurrently up to a configurable concurrency limit
- [ ] Ingestion API returns immediately; summarization runs in the background
- [ ] A `SummarizationJob` database row is created when summarization starts
- [ ] The ingestion response includes `summarization_job_id` when summarization is triggered
- [ ] The job row is updated as each trace completes (trace ID appended to `completed_traces` or `failed_traces`)
- [ ] Failed individual traces are retried up to 2 times with exponential backoff
- [ ] Partial failures do not block the batch — failed traces are ingested with `summary = null`
- [ ] Rate limit responses (429) trigger backoff, not failure

### Performance
- [ ] A batch of 100 traces completes summarization within a reasonable wall-clock time given the concurrency limit and model latency
- [ ] Concurrent LLM calls do not exceed the serving endpoint's rate limit
- [ ] Summarization does not block the ingestion API response
- [ ] Individual trace summarization errors are logged with trace ID, error type, and retry count

### Facilitator UX — Status & Progress
- [ ] `GET /workshops/{id}/summarization-job/{job_id}` returns job status with completed/total/failed counts
- [ ] `GET /workshops/{id}/summarization-status` returns summary coverage stats and last job info
- [ ] SummarizationSettings shows a progress indicator while a summarization job is running
- [ ] Progress indicator shows completed/total/failed counts (e.g., "Summarizing... 45/80 complete, 2 failed")
- [ ] Progress updates automatically via polling while the job is active
- [ ] On completion, succeeded/failed counts are displayed in SummarizationSettings
- [ ] Failed traces are listed with their error descriptions
- [ ] Facilitator can retry failed traces from the completion view (creates a new job for just those traces)

### Facilitator UX — Re-summarization
- [ ] Re-summarize button exists in SummarizationSettings (disabled while a job is running)
- [ ] Facilitator can choose to re-summarize all traces or only unsummarized traces
- [ ] Confirmation dialog is shown before starting re-summarization
- [ ] `POST /resummarize` accepts a `mode` parameter: "all", "unsummarized", or "failed"
- [ ] Re-summarization creates a tracked `SummarizationJob` with the same progress UI

### Facilitator UX — Summary Indicators
- [ ] Trace list in FacilitatorDashboard shows a visual indicator for traces that have summaries
- [ ] Aggregate count of summarized vs. unsummarized traces is visible (e.g., "45/80 traces summarized")
- [ ] Last summarization timestamp is visible in SummarizationSettings
- [ ] `summarization-status` endpoint provides the data for these indicators without requiring a job

### Facilitator UX — Discovery Trace Summaries
- [ ] DiscoveryTraceCard defaults to summary view when a summary exists
- [ ] Facilitator can toggle between summary view and raw user/assistant content
- [ ] Summary view shows the executive summary text
- [ ] Summary view has expandable milestones with titles and descriptions

## Future Work

- Summary quality scoring / automatic retry on poor results
- Per-trace re-summarization from the trace viewer
- Summary comparison across model versions
- Export milestone views alongside raw data

## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-04-11 | [Trace Summarization](../.claude/plans/2026-04-11-trace-summarization.md) | planned | Two-pass LLM summarization with batch orchestration and milestone view UI |
| 2026-04-13 | [Facilitator UX](../.claude/plans/2026-04-13-summarization-facilitator-ux.md) | complete | DB-backed job tracking, progress UI, re-summarize button, summary indicators |
| 2026-04-13 | [Tool-Based Agent](../.claude/plans/2026-04-13-summarization-tool-based-agent.md) | planned | Refactor from text-dump to tool-equipped PydanticAI agent with trace inspection tools |

## Related Specs

- [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md) — Trace intake pipeline
- [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md) — JSONPath and span filter display
- [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md) — LLM provider configuration
- [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md) — TraceViewer component
