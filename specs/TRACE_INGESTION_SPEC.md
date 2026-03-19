# TRACE_INGESTION_SPEC

## Overview

Specifies how traces enter the system from MLflow experiments and CSV files, how trace identity is maintained, and how input/output content is extracted from raw trace data.

This spec addresses a class of bugs where:
1. Input/output content extraction used identical logic for both roles, causing all traces to receive the same extracted input
2. Re-ingesting traces created duplicates with new UUIDs, orphaning FK references (feedback, findings, annotations)
3. MLflow URL and host fields were silently dropped during ingestion

## Core Concepts

### Trace Identity

A trace's canonical identifier is its `mlflow_trace_id` (the MLflow `request_id`). The system uses this as the deduplication key within a workshop. Traces without an `mlflow_trace_id` (manual creation) use a generated UUID.

### Content Extraction

Raw MLflow trace data contains structured JSON for request and response. The ingestion pipeline extracts human-readable input (user's question) and output (assistant's response) from these structures. **Input extraction prefers user-role messages; output extraction prefers assistant-role messages.** This distinction is critical for multi-turn conversations where the request payload contains conversation history with both roles.

### Upsert Semantics

Re-ingesting traces with the same `mlflow_trace_id` updates existing records rather than creating duplicates. This preserves all FK references (feedback, findings, annotations).

## Behavior

### Content Extraction Pipeline

The extraction function accepts a `role_hint` parameter (`"input"` or `"output"`) that controls message role preference:

| Format | `role_hint="input"` | `role_hint="output"` |
|--------|---------------------|----------------------|
| `{"request": {"input": [...]}}` | Last user message | Last user message (this format is input-only) |
| `{"messages": [...]}` | Last **user** message | Last **assistant** message |
| List of items with `role`/`content` | Last **user** message | Last **assistant** message with `output_text` |
| `{"object": "response", "output": [...]}` | N/A (output format) | Last assistant `output_text` |
| Plain string / unrecognized | Cleaned raw text | Cleaned raw text |

### Upsert Logic

When `add_traces` receives a `TraceUpload` with a non-null `mlflow_trace_id`:
1. Query for existing `TraceDB` with matching `(workshop_id, mlflow_trace_id)`
2. If found: update `input`, `output`, `context`, `trace_metadata`, `mlflow_url`, `mlflow_host`, `mlflow_experiment_id`
3. If not found: insert new record with generated UUID

When `mlflow_trace_id` is null: always insert with generated UUID (legacy behavior).

### MLflow Metadata Persistence

All MLflow-related fields from `TraceUpload` must be persisted to `TraceDB`:
- `mlflow_trace_id`
- `mlflow_url`
- `mlflow_host`
- `mlflow_experiment_id`

## Data Model

### TraceDB (existing, no schema change)

```python
class TraceDB(Base):
    __tablename__ = "traces"
    id = Column(String, primary_key=True)           # Internal UUID
    workshop_id = Column(String, ForeignKey("workshops.id"))
    input = Column(Text, nullable=False)             # Extracted user question
    output = Column(Text, nullable=False)            # Extracted assistant response
    context = Column(JSON, nullable=True)
    trace_metadata = Column(JSON, nullable=True)
    mlflow_trace_id = Column(String, nullable=True)  # MLflow request_id (dedup key)
    mlflow_url = Column(String, nullable=True)       # Direct link to MLflow UI
    mlflow_host = Column(String, nullable=True)      # Databricks workspace host
    mlflow_experiment_id = Column(String, nullable=True)
```

### FK References (preserved by upsert)

- `DiscoveryFeedbackDB.trace_id` → `traces.id`
- `DiscoveryFindingDB.trace_id` → `traces.id`
- `AnnotationDB.trace_id` → `traces.id`
- `JudgeEvaluationDB.trace_id` → `traces.id`
- `ClassifiedFindingDB.trace_id` → `traces.id`

## Implementation

### Files

| File | Change |
|------|--------|
| `server/services/mlflow_intake_service.py` | Add `role_hint` parameter to `_extract_content_from_json`; update call sites |
| `server/services/database_service.py` | Upsert logic in `add_traces`; persist `mlflow_url`/`mlflow_host` |
| `server/routers/workshops.py` | Update CSV upload call sites to pass `role_hint` |

### Content Extraction Function Signature

```python
def _extract_content_from_json(self, json_text: str, role_hint: str = "output") -> str:
    """Extract content from JSON input/output format.

    Args:
        json_text: Raw JSON string from MLflow trace request or response.
        role_hint: "input" to prefer user messages, "output" to prefer assistant messages.
    """
```

## Success Criteria

### Trace Identity
- [ ] Traces are deduplicated by `(workshop_id, mlflow_trace_id)` — re-ingest updates, not duplicates
- [ ] `mlflow_url`, `mlflow_host`, and `mlflow_experiment_id` are persisted on ingest
- [ ] MLflow link in TraceViewer opens the correct trace in the correct experiment
- [ ] Traces without `mlflow_trace_id` get a generated UUID and insert normally

### Content Extraction
- [ ] Input extraction prefers the last user-role message from the request payload
- [ ] Output extraction prefers the last assistant-role message from the response payload
- [ ] Each trace gets its own unique extracted input (no shared-prefix duplication)
- [ ] Extraction handles: `{"messages": [...]}`, `{"request": {"input": [...]}}`, list-of-items, and `{"object": "response"}` formats
- [ ] Extraction falls back to cleaned raw text when no structured format matches

### Re-ingestion Safety
- [ ] Re-ingesting traces preserves existing `DiscoveryFeedbackDB` FK references
- [ ] Re-ingesting traces preserves existing `AnnotationDB` FK references
- [ ] Re-ingesting traces preserves existing `DiscoveryFindingDB` FK references
- [ ] `active_discovery_trace_ids` remain valid after re-ingestion

### CSV Upload
- [ ] Preview format (`request_preview`/`response_preview`) uses column values directly
- [ ] Raw format (`request`/`response`) applies content extraction with role-aware logic
- [ ] `mlflow_trace_id` from CSV `trace_id` column is used for deduplication

## Future Work

- Consider using `mlflow_trace_id` as the primary key instead of generated UUIDs
- Add a unique constraint on `(workshop_id, mlflow_trace_id)` at the database level
- Trace staleness detection (MLflow trace deleted but still referenced in workshop)
