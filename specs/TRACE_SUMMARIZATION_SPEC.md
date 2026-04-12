# TRACE_SUMMARIZATION_SPEC

## Overview

Provides LLM-powered trace summarization at ingestion time. An agent analyzes the full MLflow trace (span hierarchy, tool calls, inputs/outputs) and produces a structured "milestone view" — an executive summary followed by numbered milestones with relevant data selected from actual spans.

This is an opt-in feature configured per-workshop by the facilitator. It's most valuable for complex agent traces with many spans, tool calls, and transfers.

## Core Concepts

### Executive Summary
A high-level narrative (1-3 sentences) of what happened in the trace. Generated first, then used to guide milestone extraction.

### Milestone
A logical phase of the trace's execution. Each milestone has a title, a summary description, and a set of events selected from the trace's actual spans. The agent decides how many milestones are appropriate based on trace complexity — there is no fixed target.

### Milestone Event
A relevant sub-event within a milestone, drawn from actual span data. Events have a type (e.g., tool call, transfer, result), a label, a summary, and selected input/output data from the corresponding span.

### Two-Pass Generation
1. **Pass 1 — Executive summary**: LLM receives the full trace and produces a high-level narrative
2. **Pass 2 — Milestone extraction**: LLM uses the executive summary to identify milestones and select relevant span data for each

## Behavior

### Summarization Trigger
Summarization runs at ingestion time when:
- The workshop has `summarization_enabled = true`
- A `summarization_model` is configured (non-null, non-empty)

When disabled or not configured, traces are ingested normally without summaries.

### Agent Input
The agent receives the full trace context:
- All spans with their names, types, inputs, outputs, status, and timing
- Parent-child span relationships (hierarchy)
- Trace-level metadata (status, execution time, tags)

### Agent Output
A structured JSON object stored on the trace:

```json
{
  "executive_summary": "Created a 5-step plan to extract owner names...",
  "milestones": [
    {
      "number": 1,
      "title": "Data Extraction",
      "summary": "Extracted owner name from TitleFlex (ANDREY V MIRONETS) and searched for seller names in inbound communications (none found).",
      "events": [
        {
          "type": "transfer",
          "label": "Successfully transferred to generalist_agent",
          "span_name": "generalist_agent",
          "data": { "inputs": "...", "outputs": "..." }
        },
        {
          "type": "result",
          "label": "Plan updated! Explanation: Completed extraction...",
          "span_name": "update_plan",
          "data": { "plan_update_explanation": "..." }
        }
      ]
    }
  ]
}
```

### Event Types
The agent selects the most descriptive type for each event:
- `tool_call` — A tool was invoked
- `transfer` — Control passed to another agent/component
- `result` — A significant output or decision point
- `error` — An error or failure occurred

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

## Implementation

### Files

| File | Change |
|------|--------|
| `server/services/trace_summarization_service.py` | **New** — Agent logic for two-pass summarization |
| `server/services/mlflow_intake_service.py` | Call summarization after trace extraction |
| `server/models.py` | Add `summarization_*` fields to Workshop, add `summary` to Trace |
| `server/database.py` | Add columns to WorkshopDB and TraceDB |
| `migrations/versions/XXXX_add_summarization.py` | **New** — Alembic migration |
| `server/routers/workshops.py` | Add settings endpoints, expose summary in trace responses |
| `client/src/components/TraceViewer.tsx` | Milestone view as default with toggle |
| `client/src/components/SummarizationSettings.tsx` | **New** — Facilitator config UI |

### Summarization Service

Uses `DatabricksService.call_chat_completion()` (same pattern as `discovery_analysis_service.py`):

```python
class TraceSummarizationService:
    def __init__(self, databricks_service: DatabricksService):
        self.databricks_service = databricks_service

    async def summarize_trace(
        self,
        trace_context: dict,
        model: str,
        guidance: str | None = None,
    ) -> dict | None:
        """Two-pass summarization: executive summary → milestones."""
```

### API Endpoints

```
PUT  /workshops/{workshop_id}/summarization-settings
     Request: { summarization_enabled, summarization_model, summarization_guidance }
     Response: Updated Workshop

POST /workshops/{workshop_id}/resummarize
     Triggers re-summarization of all traces (or selected trace_ids)
     Response: { queued: int }
```

## Success Criteria

### Configuration
- [ ] Facilitator can enable/disable trace summarization per workshop
- [ ] Facilitator can select a model for summarization from available Databricks endpoints
- [ ] Facilitator can provide optional free-text guidance for the summarization prompt
- [ ] Settings are persisted per workshop

### Summarization Pipeline
- [ ] Summarization runs at ingestion time when enabled and model is configured
- [ ] Agent receives full trace context (all spans, inputs, outputs, hierarchy)
- [ ] Agent produces an executive summary as the first pass
- [ ] Agent extracts milestones with relevant span data as the second pass
- [ ] Each milestone event references actual span data (not purely generated)
- [ ] Summarization failure does not block trace ingestion
- [ ] Summary is stored as JSON on the trace record

### Milestone Structure
- [ ] Each milestone has a number, title, and summary
- [ ] Each milestone has zero or more events with type, label, span reference, and data
- [ ] Event types are one of: tool_call, transfer, result, error
- [ ] The agent determines the number of milestones based on trace complexity

### UI — Milestone View
- [ ] Milestone view is the default display when a summary exists
- [ ] User can toggle between milestone view and the existing trace viewer
- [ ] Milestone view shows executive summary at the top
- [ ] Milestones are numbered and show title, summary, and expandable events
- [ ] When no summary exists, the existing trace viewer is shown (no toggle)

### Re-ingestion
- [ ] Re-ingesting with summarization enabled regenerates summaries
- [ ] Re-ingesting with summarization disabled preserves existing summaries
- [ ] Facilitator can trigger re-summarization without full re-ingestion

### Batch Summarization
- [ ] Multiple traces are summarized concurrently up to a configurable concurrency limit
- [ ] Ingestion API returns immediately; summarization runs in the background
- [ ] Progress is trackable (completed, total, failed counts)
- [ ] Failed individual traces are retried up to 2 times with exponential backoff
- [ ] Partial failures do not block the batch — failed traces are ingested with `summary = null`
- [ ] Rate limit responses (429) trigger backoff, not failure

### Performance
- [ ] A batch of 100 traces completes summarization within a reasonable wall-clock time given the concurrency limit and model latency
- [ ] Concurrent LLM calls do not exceed the serving endpoint's rate limit
- [ ] Summarization does not block the ingestion API response
- [ ] Individual trace summarization errors are logged with trace ID, error type, and retry count

## Future Work

- Summary quality scoring / automatic retry on poor results
- Per-trace re-summarization from the trace viewer
- Summary comparison across model versions
- Export milestone views alongside raw data

## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-04-11 | [Trace Summarization](../.claude/plans/2026-04-11-trace-summarization.md) | planned | Two-pass LLM summarization with batch orchestration and milestone view UI |

## Related Specs

- [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md) — Trace intake pipeline
- [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md) — JSONPath and span filter display
- [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md) — LLM provider configuration
- [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md) — TraceViewer component
