# Trace Ingestion Bugfix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three trace ingestion bugs: role-blind content extraction, duplicate traces on re-ingest, and dropped MLflow metadata fields.

**Architecture:** Add `role_hint` parameter to `_extract_content_from_json` so input extraction prefers user messages and output extraction prefers assistant messages. Change `add_traces` to upsert by `(workshop_id, mlflow_trace_id)` instead of always creating new UUIDs, and persist all MLflow metadata fields.

**Tech Stack:** Python, SQLAlchemy, pytest

**Spec:** `/specs/TRACE_INGESTION_SPEC.md`

---

## Chunk 1: Content Extraction — role_hint parameter

### Task 1: Add role_hint to `_extract_content_from_json`

**Files:**
- Modify: `server/services/mlflow_intake_service.py:209-335` (the `_extract_content_from_json` method)
- Create: `tests/unit/services/test_content_extraction.py`

- [ ] **Step 1: Write failing tests for role-aware extraction**

Create `tests/unit/services/test_content_extraction.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/unit/services/test_content_extraction.py -v`
Expected: FAIL — `_extract_content_from_json()` does not accept `role_hint` parameter

- [ ] **Step 3: Implement role_hint parameter**

In `server/services/mlflow_intake_service.py`, modify `_extract_content_from_json` (line 209):

Change the signature:
```python
def _extract_content_from_json(self, json_text: str, role_hint: str = "output") -> str:
```

In the `{"messages": [...]}` handler (around line 242-272), replace the current logic:

```python
      # Handle messages format: {"messages": [...]}
      if isinstance(data, dict) and 'messages' in data:
        messages = data['messages']
        if not messages:
          return json_text

        if role_hint == "input":
          # Input extraction: prefer last user message
          for message in reversed(messages):
            if isinstance(message, dict) and message.get('role') == 'user' and 'content' in message:
              content = message['content']
              if isinstance(content, str):
                content = content.replace('\\n', '\n')
              return content
          # Fallback: first message with content
          for message in messages:
            if isinstance(message, dict) and 'content' in message:
              content = message['content']
              if isinstance(content, str):
                content = content.replace('\\n', '\n')
              return content
        else:
          # Output extraction: prefer last assistant message
          for message in reversed(messages):
            if isinstance(message, dict) and message.get('role') == 'assistant' and 'content' in message:
              content = message['content']
              if isinstance(content, str):
                content = content.replace('\\n', '\n')
              return content
          # Fallback: last message with content
          if messages and isinstance(messages[-1], dict) and 'content' in messages[-1]:
            content = messages[-1]['content']
            if isinstance(content, str):
              content = content.replace('\\n', '\n')
            return content
```

Leave all other format handlers unchanged — they already handle their specific formats correctly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/unit/services/test_content_extraction.py -v`
Expected: All PASS

- [ ] **Step 5: Update call sites to pass role_hint**

In `server/services/mlflow_intake_service.py`:

**search_traces** (lines 61-65): Change to:
```python
            input_content = self._extract_content_from_json(
              getattr(trace.data, 'request', None) if hasattr(trace, 'data') else None,
              role_hint="input",
            )
            output_content = self._extract_content_from_json(
              getattr(trace.data, 'response', None) if hasattr(trace, 'data') else None,
              role_hint="output",
            )
```

**ingest_traces** (lines 119-124): Change to:
```python
          input_content = self._extract_content_from_json(
            getattr(full_trace.data, 'request', None) if hasattr(full_trace, 'data') else None,
            role_hint="input",
          )
          output_content = self._extract_content_from_json(
            getattr(full_trace.data, 'response', None) if hasattr(full_trace, 'data') else None,
            role_hint="output",
          )
```

- [ ] **Step 6: Re-run tests**

Run: `python -m pytest tests/unit/services/test_content_extraction.py -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add server/services/mlflow_intake_service.py tests/unit/services/test_content_extraction.py
git commit -m "fix: add role_hint to content extraction so input prefers user messages

_extract_content_from_json now accepts role_hint='input'|'output'.
For the {'messages': [...]} format, input extraction returns the last
user message instead of the last assistant message. This fixes the bug
where all traces received the same extracted input from shared
conversation history.

Spec: TRACE_INGESTION_SPEC (Content Extraction criteria)"
```

---

## Chunk 2: Upsert and MLflow metadata persistence

### Task 2: Fix `add_traces` to upsert and persist MLflow fields

**Files:**
- Modify: `server/services/database_service.py:462-500` (the `add_traces` method)
- Create: `tests/unit/services/test_trace_upsert.py`

- [ ] **Step 1: Write failing tests for upsert and MLflow field persistence**

Create `tests/unit/services/test_trace_upsert.py`:

```python
"""Tests for trace upsert logic and MLflow metadata persistence.

Covers TRACE_INGESTION_SPEC success criteria:
- Traces deduplicated by (workshop_id, mlflow_trace_id)
- mlflow_url, mlflow_host, mlflow_experiment_id persisted
- Traces without mlflow_trace_id insert normally
- Re-ingestion preserves FK references
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from server.database import Base, TraceDB, DiscoveryFeedbackDB, DiscoveryFindingDB, WorkshopDB
from server.models import TraceUpload
from server.services.database_service import DatabaseService


@pytest.fixture
def db_session():
    """Create an in-memory SQLite database with all tables."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def db_service(db_session):
    return DatabaseService(db_session)


@pytest.fixture
def workshop(db_session):
    """Create a test workshop."""
    ws = WorkshopDB(id="ws-1", name="Test Workshop", current_phase="intake")
    db_session.add(ws)
    db_session.commit()
    return ws


@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("mlflow_fields_persisted")
class TestMlflowFieldsPersisted:
    """mlflow_url, mlflow_host, mlflow_experiment_id must be stored."""

    def test_mlflow_url_and_host_persisted(self, db_service, db_session, workshop):
        traces = db_service.add_traces("ws-1", [TraceUpload(
            input="Q", output="A",
            mlflow_trace_id="tr-abc",
            mlflow_url="https://host.com/ml/experiments/123/traces?selectedEvaluationId=tr-abc",
            mlflow_host="https://host.com",
            mlflow_experiment_id="123",
        )])
        assert len(traces) == 1
        db_trace = db_session.query(TraceDB).filter_by(id=traces[0].id).first()
        assert db_trace.mlflow_url == "https://host.com/ml/experiments/123/traces?selectedEvaluationId=tr-abc"
        assert db_trace.mlflow_host == "https://host.com"
        assert db_trace.mlflow_experiment_id == "123"


@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("dedup_by_mlflow_trace_id")
class TestUpsertByMlflowTraceId:
    """Re-ingest with same mlflow_trace_id updates instead of duplicating."""

    def test_reingest_updates_existing_trace(self, db_service, db_session, workshop):
        # First ingest
        traces_v1 = db_service.add_traces("ws-1", [TraceUpload(
            input="Old Q", output="Old A", mlflow_trace_id="tr-abc",
        )])
        original_id = traces_v1[0].id

        # Re-ingest same mlflow_trace_id with new content
        traces_v2 = db_service.add_traces("ws-1", [TraceUpload(
            input="New Q", output="New A", mlflow_trace_id="tr-abc",
            mlflow_url="https://new-url.com",
        )])
        updated_id = traces_v2[0].id

        # Same internal ID — no duplicate
        assert updated_id == original_id
        # Content updated
        db_trace = db_session.query(TraceDB).filter_by(id=original_id).first()
        assert db_trace.input == "New Q"
        assert db_trace.output == "New A"
        assert db_trace.mlflow_url == "https://new-url.com"
        # Only one trace in DB
        all_traces = db_session.query(TraceDB).filter_by(workshop_id="ws-1").all()
        assert len(all_traces) == 1

    def test_different_mlflow_trace_ids_create_separate_traces(self, db_service, workshop):
        db_service.add_traces("ws-1", [
            TraceUpload(input="Q1", output="A1", mlflow_trace_id="tr-1"),
            TraceUpload(input="Q2", output="A2", mlflow_trace_id="tr-2"),
        ])
        traces = db_service.get_traces("ws-1")
        assert len(traces) == 2


@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("null_mlflow_id_inserts")
class TestNullMlflowTraceId:
    """Traces without mlflow_trace_id always insert with new UUID."""

    def test_null_mlflow_trace_id_inserts(self, db_service, workshop):
        db_service.add_traces("ws-1", [TraceUpload(input="Q1", output="A1")])
        db_service.add_traces("ws-1", [TraceUpload(input="Q2", output="A2")])
        traces = db_service.get_traces("ws-1")
        assert len(traces) == 2


@pytest.mark.spec("TRACE_INGESTION_SPEC")
@pytest.mark.req("reingest_preserves_fk")
class TestReIngestPreservesFK:
    """Re-ingesting traces must not orphan FK references."""

    def test_feedback_fk_survives_reingest(self, db_service, db_session, workshop):
        # Ingest trace
        traces = db_service.add_traces("ws-1", [TraceUpload(
            input="Q", output="A", mlflow_trace_id="tr-abc",
        )])
        trace_id = traces[0].id

        # Create feedback referencing this trace
        feedback = DiscoveryFeedbackDB(
            id=str(uuid.uuid4()), workshop_id="ws-1",
            trace_id=trace_id, user_id="u-1",
            feedback_label="good", comment="Nice",
        )
        db_session.add(feedback)
        db_session.commit()

        # Re-ingest same trace
        traces_v2 = db_service.add_traces("ws-1", [TraceUpload(
            input="Updated Q", output="Updated A", mlflow_trace_id="tr-abc",
        )])

        # Same ID — FK still valid
        assert traces_v2[0].id == trace_id
        fb = db_session.query(DiscoveryFeedbackDB).filter_by(trace_id=trace_id).first()
        assert fb is not None
        assert fb.comment == "Nice"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/unit/services/test_trace_upsert.py -v`
Expected: FAIL — `mlflow_url` not persisted, no upsert logic

- [ ] **Step 3: Implement upsert and MLflow field persistence in add_traces**

In `server/services/database_service.py`, replace the `add_traces` method (lines ~462-500):

```python
  def add_traces(self, workshop_id: str, traces: List[TraceUpload]) -> List[Trace]:
    """Add traces to a workshop, upserting by (workshop_id, mlflow_trace_id).

    If a trace with the same mlflow_trace_id already exists in the workshop,
    update its content instead of creating a duplicate. This preserves FK
    references from feedback, findings, and annotations.
    """
    db_traces = []

    for trace_data in traces:
      existing = None
      if trace_data.mlflow_trace_id:
        existing = (
          self.db.query(TraceDB)
          .filter(
            TraceDB.workshop_id == workshop_id,
            TraceDB.mlflow_trace_id == trace_data.mlflow_trace_id,
          )
          .first()
        )

      if existing:
        # Update existing trace — preserves its id (and all FK references)
        existing.input = trace_data.input
        existing.output = trace_data.output
        existing.context = trace_data.context
        existing.trace_metadata = trace_data.trace_metadata
        existing.mlflow_url = trace_data.mlflow_url
        existing.mlflow_host = trace_data.mlflow_host
        existing.mlflow_experiment_id = trace_data.mlflow_experiment_id
        db_traces.append(existing)
      else:
        # Insert new trace
        trace_id = str(uuid.uuid4())
        db_trace = TraceDB(
          id=trace_id,
          workshop_id=workshop_id,
          input=trace_data.input,
          output=trace_data.output,
          context=trace_data.context,
          trace_metadata=trace_data.trace_metadata,
          mlflow_trace_id=trace_data.mlflow_trace_id,
          mlflow_url=trace_data.mlflow_url,
          mlflow_host=trace_data.mlflow_host,
          mlflow_experiment_id=trace_data.mlflow_experiment_id,
        )
        self.db.add(db_trace)
        db_traces.append(db_trace)

    self.db.commit()

    # Refresh and create response objects after commit
    created_traces = []
    for db_trace in db_traces:
      self.db.refresh(db_trace)
      created_traces.append(self._trace_from_db(db_trace))

    return created_traces
```

Key changes:
1. Upsert: query for existing trace by `(workshop_id, mlflow_trace_id)` before inserting
2. Persist `mlflow_url` and `mlflow_host` (previously missing)
3. Use `_trace_from_db` helper (which already includes all fields) instead of manual Trace construction

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/unit/services/test_trace_upsert.py -v`
Expected: All PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `python -m pytest tests/ -x -q --timeout=30`
Expected: No regressions

- [ ] **Step 6: Commit**

```bash
git add server/services/database_service.py tests/unit/services/test_trace_upsert.py
git commit -m "fix: upsert traces by mlflow_trace_id and persist mlflow_url/mlflow_host

add_traces now checks for existing traces with the same
(workshop_id, mlflow_trace_id) before inserting. If found, it updates
the existing record instead of creating a duplicate. This preserves
all FK references (feedback, findings, annotations) on re-ingest.

Also fixes mlflow_url and mlflow_host being silently dropped during
trace ingestion.

Spec: TRACE_INGESTION_SPEC (Trace Identity + Re-ingestion Safety criteria)"
```

---

## Chunk 3: Spec and plan files

### Task 3: Commit spec and plan

- [ ] **Step 1: Add the spec and plan files**

```bash
git add specs/TRACE_INGESTION_SPEC.md specs/README.md docs/superpowers/plans/2026-03-13-trace-ingestion-bugfix.md
git commit -m "spec: add TRACE_INGESTION_SPEC for trace ingestion identity and extraction

Defines success criteria for content extraction (role-aware),
trace deduplication (upsert by mlflow_trace_id), and MLflow metadata
persistence. Covers the root cause of customer-reported Q&A mismatch,
broken MLflow links, and orphaned FK references on re-ingest."
```
