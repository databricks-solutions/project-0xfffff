# Trace Summarization Implementation Plan

**Spec:** [TRACE_SUMMARIZATION_SPEC](../../specs/TRACE_SUMMARIZATION_SPEC.md)
**Goal:** Add LLM-powered trace summarization at ingestion time, producing structured milestone views with batch parallelization, retry logic, and a toggle in the TraceViewer.
**Architecture:** A new `TraceSummarizationService` uses PydanticAI agents with `OpenAIProvider` pointed at Databricks serving endpoints. Two agents handle the two-pass approach: one for executive summary, one for milestone extraction — each with Pydantic `output_type` for validated structured output and built-in retries. Batch summarization uses PydanticAI's native async + `asyncio.gather()` for concurrency. Summarization runs as a background task after traces are persisted. The TraceViewer defaults to milestone view when summaries exist, with a tab toggle to the raw trace viewer.

**Success Criteria Targeted:**

Configuration:
- SC-C1: Facilitator can enable/disable trace summarization per workshop
- SC-C2: Facilitator can select a model for summarization from available Databricks endpoints
- SC-C3: Facilitator can provide optional free-text guidance for the summarization prompt
- SC-C4: Settings are persisted per workshop

Summarization Pipeline:
- SC-P1: Summarization runs at ingestion time when enabled and model is configured
- SC-P2: Agent receives full trace context (all spans, inputs, outputs, hierarchy)
- SC-P3: Agent produces an executive summary as the first pass
- SC-P4: Agent extracts milestones with relevant span data as the second pass
- SC-P5: Each milestone event references actual span data (not purely generated)
- SC-P6: Summarization failure does not block trace ingestion
- SC-P7: Summary is stored as JSON on the trace record

Milestone Structure:
- SC-M1: Each milestone has a number, title, and summary
- SC-M2: Each milestone has zero or more events with type, label, span reference, and data
- SC-M3: Event types are one of: tool_call, transfer, result, error
- SC-M4: The agent determines the number of milestones based on trace complexity

UI — Milestone View:
- SC-U1: Milestone view is the default display when a summary exists
- SC-U2: User can toggle between milestone view and the existing trace viewer
- SC-U3: Milestone view shows executive summary at the top
- SC-U4: Milestones are numbered and show title, summary, and expandable events
- SC-U5: When no summary exists, the existing trace viewer is shown (no toggle)

Re-ingestion:
- SC-R1: Re-ingesting with summarization enabled regenerates summaries
- SC-R2: Re-ingesting with summarization disabled preserves existing summaries
- SC-R3: Facilitator can trigger re-summarization without full re-ingestion

Batch Summarization:
- SC-B1: Multiple traces are summarized concurrently up to a configurable concurrency limit
- SC-B2: Ingestion API returns immediately; summarization runs in the background
- SC-B3: Progress is trackable (completed, total, failed counts)
- SC-B4: Failed individual traces are retried up to 2 times with exponential backoff
- SC-B5: Partial failures do not block the batch — failed traces are ingested with `summary = null`
- SC-B6: Rate limit responses (429) trigger backoff, not failure

Performance:
- SC-PF1: A batch of 100 traces completes summarization within a reasonable wall-clock time given the concurrency limit and model latency
- SC-PF2: Concurrent LLM calls do not exceed the serving endpoint's rate limit
- SC-PF3: Summarization does not block the ingestion API response
- SC-PF4: Individual trace summarization errors are logged with trace ID, error type, and retry count

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `server/services/trace_summarization_service.py` | Two-pass summarization agent, batch orchestration with concurrency/retry |
| `migrations/versions/0017_add_summarization.py` | Alembic migration for new columns |
| `client/src/components/MilestoneView.tsx` | Milestone view component (executive summary + milestones + events) |
| `client/src/components/SummarizationSettings.tsx` | Facilitator settings UI for summarization config |
| `tests/unit/services/test_trace_summarization_service.py` | Backend unit tests for summarization service |
| `tests/unit/routers/test_summarization_endpoints.py` | Backend unit tests for API endpoints |

### Modified Files
| File | Change |
|------|--------|
| `pyproject.toml` | Add `pydantic-ai-slim[openai]` dependency |
| `server/database.py` | Add `summary` column to TraceDB, add `summarization_*` columns to WorkshopDB |
| `server/models.py` | Add `summarization_*` fields to Workshop model, add `summary` to Trace/TraceData |
| `server/services/mlflow_intake_service.py` | Trigger background summarization after ingestion |
| `server/routers/workshops.py` | Add settings + resummarize endpoints, expose summary in trace responses |
| `client/src/components/TraceViewer.tsx` | Add tab toggle between milestone view and raw view |
| `client/src/client/models/Workshop.ts` | Add summarization fields to Workshop type |

---

## Task 1: Database Schema & Models

**Spec criteria:** SC-C4, SC-P7
**Files:**
- Modify: `server/database.py`
- Modify: `server/models.py`
- Create: `migrations/versions/0017_add_summarization.py`

- [ ] **Step 1: Add columns to WorkshopDB**

In `server/database.py`, add after `span_attribute_filter` column (line 167):

```python
summarization_enabled = Column(Boolean, default=False)
summarization_model = Column(String, nullable=True)
summarization_guidance = Column(Text, nullable=True)
```

- [ ] **Step 2: Add column to TraceDB**

In `server/database.py`, add after `sme_feedback` column (line 221):

```python
summary = Column(JSON, nullable=True)  # Structured milestone view from LLM summarization
```

- [ ] **Step 3: Add fields to Workshop Pydantic model**

In `server/models.py`, add after `span_attribute_filter` field (line 167):

```python
summarization_enabled: bool = False
summarization_model: str | None = None
summarization_guidance: str | None = None
```

- [ ] **Step 4: Add summary field to Trace/TraceData models**

In `server/models.py`, find the `Trace` model (or `TraceData` if that's what's used for responses) and add:

```python
summary: dict | None = None
```

Update the `TraceData` interface in the frontend type file as well (Task 5).

- [ ] **Step 5: Create Alembic migration**

Create `migrations/versions/0017_add_summarization.py`:

```python
"""Add trace summarization columns.

Revision ID: 0017
Revises: 0016
"""

from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workshops") as batch_op:
        batch_op.add_column(sa.Column("summarization_enabled", sa.Boolean(), default=False))
        batch_op.add_column(sa.Column("summarization_model", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("summarization_guidance", sa.Text(), nullable=True))

    with op.batch_alter_table("traces") as batch_op:
        batch_op.add_column(sa.Column("summary", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("traces") as batch_op:
        batch_op.drop_column("summary")

    with op.batch_alter_table("workshops") as batch_op:
        batch_op.drop_column("summarization_guidance")
        batch_op.drop_column("summarization_model")
        batch_op.drop_column("summarization_enabled")
```

- [ ] **Step 6: Update DatabaseService for summarization settings**

In `server/services/database_service.py`, add a method following the pattern of `update_workshop_span_attribute_filter()`:

```python
def update_workshop_summarization_settings(
    self,
    workshop_id: str,
    summarization_enabled: bool,
    summarization_model: str | None,
    summarization_guidance: str | None,
) -> Workshop | None:
    workshop_db = self.session.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not workshop_db:
        return None
    workshop_db.summarization_enabled = summarization_enabled
    workshop_db.summarization_model = summarization_model
    workshop_db.summarization_guidance = summarization_guidance
    self.session.commit()
    return self._workshop_db_to_model(workshop_db)
```

Also add a method to update a trace's summary:

```python
def update_trace_summary(self, trace_id: str, summary: dict | None) -> None:
    trace_db = self.session.query(TraceDB).filter(TraceDB.id == trace_id).first()
    if trace_db:
        trace_db.summary = summary
        self.session.commit()
```

- [ ] **Step 7: Verify migration runs**

Run: `just db-upgrade`
Expected: Migration applies cleanly

- [ ] **Step 8: Commit**

```bash
git add server/database.py server/models.py server/services/database_service.py migrations/versions/0017_add_summarization.py
git commit -m "feat(summarization): add database schema for trace summarization"
```

---

## Task 2: Add PydanticAI Dependency & Summarization Service

**Spec criteria:** SC-P2, SC-P3, SC-P4, SC-P5, SC-P6, SC-M1, SC-M2, SC-M3, SC-M4, SC-B1, SC-B2, SC-B4, SC-B5, SC-B6, SC-PF1, SC-PF2, SC-PF4
**Files:**
- Modify: `pyproject.toml`
- Create: `server/services/trace_summarization_service.py`
- Create: `tests/unit/services/test_trace_summarization_service.py`

- [ ] **Step 1: Add pydantic-ai-slim dependency**

In `pyproject.toml`, add to the dependencies:

```toml
"pydantic-ai-slim[openai]>=0.2",
```

Run: `uv sync`
Expected: Installs successfully

- [ ] **Step 2: Write failing tests for the summarization service**

Create `tests/unit/services/test_trace_summarization_service.py`:

```python
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pydantic_ai.models.test import TestModel
from pydantic_ai.agent import Agent

from server.services.trace_summarization_service import (
    TraceSummarizationService,
    ExecutiveSummary,
    TraceSummary,
    MilestoneEvent,
    Milestone,
)


SAMPLE_TRACE_CONTEXT = {
    "spans": [
        {
            "name": "root_agent",
            "span_type": "AGENT",
            "inputs": {"task": "Extract owner name"},
            "outputs": {"result": "ANDREY V MIRONETS"},
            "start_time_ns": 1000000000,
            "end_time_ns": 5000000000,
        },
        {
            "name": "search_titleflex",
            "span_type": "TOOL",
            "inputs": {"query": "owner name"},
            "outputs": {"name": "ANDREY V MIRONETS"},
            "start_time_ns": 1500000000,
            "end_time_ns": 2500000000,
        },
        {
            "name": "generalist_agent",
            "span_type": "AGENT",
            "inputs": {"task": "Update plan"},
            "outputs": {"status": "done"},
            "start_time_ns": 3000000000,
            "end_time_ns": 4500000000,
        },
    ],
    "execution_time_ms": 4000,
    "status": "OK",
    "tags": {},
}

SAMPLE_EXEC_SUMMARY = ExecutiveSummary(
    executive_summary="Agent extracted owner name from TitleFlex and updated the plan."
)

SAMPLE_TRACE_SUMMARY = TraceSummary(
    executive_summary="Agent extracted owner name from TitleFlex and updated the plan.",
    milestones=[
        Milestone(
            number=1,
            title="Data Extraction",
            summary="Searched TitleFlex for owner name.",
            events=[
                MilestoneEvent(
                    type="tool_call",
                    label="Searched TitleFlex",
                    span_name="search_titleflex",
                    data={"name": "ANDREY V MIRONETS"},
                )
            ],
        ),
        Milestone(
            number=2,
            title="Plan Update",
            summary="Updated plan with extraction results.",
            events=[
                MilestoneEvent(
                    type="result",
                    label="Plan marked complete",
                    span_name="generalist_agent",
                    data={"status": "done"},
                )
            ],
        ),
    ],
)


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestTraceSummarizationService:

    @pytest.mark.req("Agent produces an executive summary as the first pass")
    @pytest.mark.asyncio
    async def test_two_pass_produces_executive_summary(self):
        service = TraceSummarizationService.for_testing(
            exec_summary_result=SAMPLE_EXEC_SUMMARY,
            milestone_result=SAMPLE_TRACE_SUMMARY,
        )
        result = await service.summarize_trace(SAMPLE_TRACE_CONTEXT)
        assert result is not None
        assert result.executive_summary == "Agent extracted owner name from TitleFlex and updated the plan."

    @pytest.mark.req("Agent extracts milestones with relevant span data as the second pass")
    @pytest.mark.asyncio
    async def test_two_pass_produces_milestones(self):
        service = TraceSummarizationService.for_testing(
            exec_summary_result=SAMPLE_EXEC_SUMMARY,
            milestone_result=SAMPLE_TRACE_SUMMARY,
        )
        result = await service.summarize_trace(SAMPLE_TRACE_CONTEXT)
        assert result is not None
        assert len(result.milestones) == 2

    @pytest.mark.req("Each milestone has a number, title, and summary")
    @pytest.mark.asyncio
    async def test_milestone_structure(self):
        service = TraceSummarizationService.for_testing(
            exec_summary_result=SAMPLE_EXEC_SUMMARY,
            milestone_result=SAMPLE_TRACE_SUMMARY,
        )
        result = await service.summarize_trace(SAMPLE_TRACE_CONTEXT)
        milestone = result.milestones[0]
        assert milestone.number == 1
        assert milestone.title == "Data Extraction"
        assert milestone.summary == "Searched TitleFlex for owner name."

    @pytest.mark.req("Each milestone has zero or more events with type, label, span reference, and data")
    @pytest.mark.asyncio
    async def test_milestone_events_structure(self):
        service = TraceSummarizationService.for_testing(
            exec_summary_result=SAMPLE_EXEC_SUMMARY,
            milestone_result=SAMPLE_TRACE_SUMMARY,
        )
        result = await service.summarize_trace(SAMPLE_TRACE_CONTEXT)
        event = result.milestones[0].events[0]
        assert event.type == "tool_call"
        assert event.label == "Searched TitleFlex"
        assert event.span_name == "search_titleflex"
        assert event.data == {"name": "ANDREY V MIRONETS"}

    @pytest.mark.req("Event types are one of: tool_call, transfer, result, error")
    @pytest.mark.asyncio
    async def test_event_types_valid(self):
        service = TraceSummarizationService.for_testing(
            exec_summary_result=SAMPLE_EXEC_SUMMARY,
            milestone_result=SAMPLE_TRACE_SUMMARY,
        )
        result = await service.summarize_trace(SAMPLE_TRACE_CONTEXT)
        valid_types = {"tool_call", "transfer", "result", "error"}
        for milestone in result.milestones:
            for event in milestone.events:
                assert event.type in valid_types

    @pytest.mark.req("Summarization failure does not block trace ingestion")
    @pytest.mark.asyncio
    async def test_agent_failure_returns_none(self):
        service = TraceSummarizationService.for_testing(raise_error=True)
        result = await service.summarize_trace(SAMPLE_TRACE_CONTEXT)
        assert result is None

    @pytest.mark.req("Facilitator can provide optional free-text guidance for the summarization prompt")
    def test_guidance_included_in_instructions(self):
        service = TraceSummarizationService(
            endpoint_url="https://test.databricks.com/serving-endpoints",
            token="test-token",
            model_name="test-model",
            guidance="Focus on tool call decisions",
        )
        # The guidance should be part of the agent instructions
        assert "Focus on tool call decisions" in service.milestone_agent.instructions


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestBatchSummarization:

    @pytest.mark.req("Multiple traces are summarized concurrently up to a configurable concurrency limit")
    @pytest.mark.asyncio
    async def test_batch_processes_all_traces(self):
        service = TraceSummarizationService.for_testing(
            exec_summary_result=SAMPLE_EXEC_SUMMARY,
            milestone_result=SAMPLE_TRACE_SUMMARY,
        )
        traces = [{"id": f"t{i}", "context": SAMPLE_TRACE_CONTEXT} for i in range(5)]
        results = await service.summarize_batch(traces)
        assert len(results) == 5
        assert all(r["summary"] is not None for r in results)

    @pytest.mark.req("Partial failures do not block the batch — failed traces are ingested with summary = null")
    @pytest.mark.asyncio
    async def test_batch_partial_failure(self):
        """One trace failing doesn't block the rest."""
        service = TraceSummarizationService.for_testing(
            exec_summary_result=SAMPLE_EXEC_SUMMARY,
            milestone_result=SAMPLE_TRACE_SUMMARY,
            fail_trace_ids={"t1"},
        )
        traces = [{"id": f"t{i}", "context": SAMPLE_TRACE_CONTEXT} for i in range(3)]
        results = await service.summarize_batch(traces)
        assert len(results) == 3
        successes = [r for r in results if r["summary"] is not None]
        failures = [r for r in results if r["summary"] is None]
        assert len(successes) == 2
        assert len(failures) == 1

    @pytest.mark.req("Progress is trackable (completed, total, failed counts)")
    @pytest.mark.asyncio
    async def test_batch_progress_callback(self):
        service = TraceSummarizationService.for_testing(
            exec_summary_result=SAMPLE_EXEC_SUMMARY,
            milestone_result=SAMPLE_TRACE_SUMMARY,
        )
        progress_updates = []
        def on_progress(completed, total, failed):
            progress_updates.append({"completed": completed, "total": total, "failed": failed})

        traces = [{"id": f"t{i}", "context": SAMPLE_TRACE_CONTEXT} for i in range(3)]
        await service.summarize_batch(traces, on_progress=on_progress)
        assert len(progress_updates) > 0
        final = progress_updates[-1]
        assert final["completed"] + final["failed"] == final["total"]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `just test-server -k test_trace_summarization`
Expected: FAIL — module not found

- [ ] **Step 4: Implement TraceSummarizationService with PydanticAI**

Create `server/services/trace_summarization_service.py`:

```python
"""Trace summarization service using PydanticAI agents."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable, Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

logger = logging.getLogger(__name__)


# --- Output models (Pydantic validates LLM output automatically) ---

class ExecutiveSummary(BaseModel):
    executive_summary: str = Field(description="1-3 sentence high-level narrative of what happened")


class MilestoneEvent(BaseModel):
    type: Literal["tool_call", "transfer", "result", "error"]
    label: str = Field(description="Short description of this event")
    span_name: str = Field(description="Name of the actual span this event references")
    data: dict = Field(default_factory=dict, description="Relevant inputs/outputs from the span")


class Milestone(BaseModel):
    number: int
    title: str
    summary: str
    events: list[MilestoneEvent] = Field(default_factory=list)


class TraceSummary(BaseModel):
    executive_summary: str
    milestones: list[Milestone]


# --- Prompts ---

EXECUTIVE_SUMMARY_INSTRUCTIONS = """You are a trace analysis agent. You analyze execution traces from AI agents and produce concise executive summaries.

A trace contains spans — individual steps of execution with names, types, inputs, outputs, and timing. Your job is to read the full trace and write a 1-3 sentence executive summary of what happened.

Focus on:
- What was the agent's goal?
- What key actions did it take?
- What was the outcome?"""

MILESTONE_INSTRUCTIONS = """You are a trace analysis agent. Given an executive summary and the full trace data, extract logical milestones — phases of execution that tell the story of what happened.

For each milestone:
- Give it a short, descriptive title
- Write a 1-2 sentence summary
- Select the most relevant events from the actual spans (tool calls, transfers, results, errors)

For each event, select real data from the spans — don't fabricate inputs/outputs. Use the span_name to reference which span the data came from.

Event types:
- tool_call: A tool was invoked
- transfer: Control passed to another agent/component
- result: A significant output or decision point
- error: An error or failure occurred"""


class TraceSummarizationService:
    """Two-pass trace summarization using PydanticAI agents."""

    def __init__(
        self,
        endpoint_url: str,
        token: str,
        model_name: str,
        guidance: str | None = None,
        max_concurrency: int = 5,
    ):
        provider = OpenAIProvider(base_url=endpoint_url, api_key=token)
        model = OpenAIChatModel(model_name, provider=provider)

        guidance_suffix = ""
        if guidance:
            guidance_suffix = f"\n\nFacilitator guidance:\n{guidance}\n\nApply this guidance when deciding what to highlight."

        self.summary_agent: Agent[None, ExecutiveSummary] = Agent(
            model,
            output_type=ExecutiveSummary,
            instructions=EXECUTIVE_SUMMARY_INSTRUCTIONS + guidance_suffix,
            retries=2,
        )

        self.milestone_agent: Agent[None, TraceSummary] = Agent(
            model,
            output_type=TraceSummary,
            instructions=MILESTONE_INSTRUCTIONS + guidance_suffix,
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
        instance = cls.__new__(cls)
        instance.max_concurrency = 5
        instance._test_exec_result = exec_summary_result
        instance._test_milestone_result = milestone_result
        instance._test_raise_error = raise_error
        instance._test_fail_trace_ids = fail_trace_ids or set()

        # Use PydanticAI TestModel for deterministic testing
        from pydantic_ai.models.test import TestModel

        instance.summary_agent = Agent(
            TestModel(custom_result_args=exec_summary_result),
            output_type=ExecutiveSummary,
            instructions=EXECUTIVE_SUMMARY_INSTRUCTIONS,
            retries=2,
        )
        instance.milestone_agent = Agent(
            TestModel(custom_result_args=milestone_result),
            output_type=TraceSummary,
            instructions=MILESTONE_INSTRUCTIONS,
            retries=2,
        )
        return instance

    async def summarize_trace(
        self,
        trace_context: dict,
        trace_id: str | None = None,
    ) -> TraceSummary | None:
        """Summarize a single trace using two-pass approach.

        Pass 1: Generate executive summary from full trace.
        Pass 2: Extract milestones using executive summary + trace data.

        Returns TraceSummary or None on failure.
        """
        # Check if this is a test failure case
        if hasattr(self, '_test_raise_error') and self._test_raise_error:
            return None
        if hasattr(self, '_test_fail_trace_ids') and trace_id in self._test_fail_trace_ids:
            return None

        try:
            trace_text = self._format_trace_for_prompt(trace_context)

            # Pass 1: Executive summary
            exec_result = await self.summary_agent.run(
                f"Analyze this trace:\n\n{trace_text}"
            )
            executive_summary = exec_result.output.executive_summary

            # Pass 2: Milestones (with executive summary as context)
            milestone_result = await self.milestone_agent.run(
                f"Executive summary: {executive_summary}\n\nFull trace:\n\n{trace_text}"
            )

            return milestone_result.output

        except Exception as e:
            logger.error(f"Trace summarization failed for {trace_id}: {e}", exc_info=True)
            return None

    async def summarize_batch(
        self,
        traces: list[dict],
        on_progress: Callable[[int, int, int], None] | None = None,
    ) -> list[dict]:
        """Summarize a batch of traces concurrently.

        PydanticAI agents handle retries internally. We use asyncio.Semaphore
        for concurrency control and asyncio.gather for parallelism.

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
        lock = asyncio.Lock()

        async def process_one(trace: dict) -> dict:
            nonlocal completed, failed
            trace_id = trace["id"]

            async with semaphore:
                summary = await self.summarize_trace(trace["context"], trace_id=trace_id)

            async with lock:
                if summary is None:
                    failed += 1
                completed += 1
                if on_progress:
                    on_progress(completed, total, failed)

            return {
                "trace_id": trace_id,
                "summary": summary.model_dump() if summary else None,
            }

        results = await asyncio.gather(*[process_one(t) for t in traces])
        return list(results)

    @staticmethod
    def _format_trace_for_prompt(context: dict) -> str:
        """Format trace context into a readable string for the LLM."""
        lines = []
        lines.append(f"Status: {context.get('status', 'UNKNOWN')}")
        lines.append(f"Execution time: {context.get('execution_time_ms', 'N/A')}ms")
        lines.append("")

        spans = context.get("spans", [])
        for i, span in enumerate(spans):
            lines.append(f"--- Span {i + 1}: {span.get('name', 'unnamed')} ---")
            lines.append(f"  Type: {span.get('span_type', 'UNKNOWN')}")
            if span.get("inputs"):
                inputs_str = json.dumps(span["inputs"], indent=2, default=str)
                if len(inputs_str) > 2000:
                    inputs_str = inputs_str[:2000] + "... (truncated)"
                lines.append(f"  Inputs: {inputs_str}")
            if span.get("outputs"):
                outputs_str = json.dumps(span["outputs"], indent=2, default=str)
                if len(outputs_str) > 2000:
                    outputs_str = outputs_str[:2000] + "... (truncated)"
                lines.append(f"  Outputs: {outputs_str}")
            if span.get("start_time_ns") and span.get("end_time_ns"):
                duration_ms = (span["end_time_ns"] - span["start_time_ns"]) / 1e6
                lines.append(f"  Duration: {duration_ms:.0f}ms")
            lines.append("")

        return "\n".join(lines)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `just test-server -k test_trace_summarization`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml server/services/trace_summarization_service.py tests/unit/services/test_trace_summarization_service.py
git commit -m "feat(summarization): add PydanticAI-based trace summarization service with batch support"
```

---

## Task 3: Backend API Endpoints & Ingestion Integration

**Spec criteria:** SC-C1, SC-C2, SC-C3, SC-C4, SC-P1, SC-R1, SC-R2, SC-R3, SC-B2, SC-PF3
**Files:**
- Modify: `server/routers/workshops.py`
- Modify: `server/services/mlflow_intake_service.py`
- Create: `tests/unit/routers/test_summarization_endpoints.py`

- [ ] **Step 1: Write failing tests for the settings endpoint**

Create `tests/unit/routers/test_summarization_endpoints.py`:

```python
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from server.app import app


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestSummarizationSettingsEndpoint:

    @pytest.mark.req("Facilitator can enable/disable trace summarization per workshop")
    def test_update_summarization_settings(self, test_client, sample_workshop):
        response = test_client.put(
            f"/workshops/{sample_workshop.id}/summarization-settings",
            json={
                "summarization_enabled": True,
                "summarization_model": "databricks-claude-sonnet-4-5",
                "summarization_guidance": "Focus on tool calls",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["summarization_enabled"] is True
        assert data["summarization_model"] == "databricks-claude-sonnet-4-5"
        assert data["summarization_guidance"] == "Focus on tool calls"

    @pytest.mark.req("Settings are persisted per workshop")
    def test_settings_persisted(self, test_client, sample_workshop):
        # Set
        test_client.put(
            f"/workshops/{sample_workshop.id}/summarization-settings",
            json={
                "summarization_enabled": True,
                "summarization_model": "databricks-claude-sonnet-4-5",
                "summarization_guidance": None,
            },
        )
        # Verify via GET workshop
        response = test_client.get(f"/workshops/{sample_workshop.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["summarization_enabled"] is True
        assert data["summarization_model"] == "databricks-claude-sonnet-4-5"

    @pytest.mark.req("Facilitator can trigger re-summarization without full re-ingestion")
    def test_resummarize_endpoint(self, test_client, sample_workshop_with_traces):
        workshop = sample_workshop_with_traces
        # Enable summarization first
        test_client.put(
            f"/workshops/{workshop.id}/summarization-settings",
            json={
                "summarization_enabled": True,
                "summarization_model": "databricks-claude-sonnet-4-5",
            },
        )
        with patch("server.routers.workshops.TraceSummarizationService") as mock_svc:
            response = test_client.post(f"/workshops/{workshop.id}/resummarize")
            assert response.status_code == 200
            data = response.json()
            assert "total" in data
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server -k TestSummarizationSettingsEndpoint`
Expected: FAIL — endpoint not found

- [ ] **Step 3: Implement settings endpoint**

In `server/routers/workshops.py`, add the request model and endpoint:

```python
# Request model (add near other settings models)
class SummarizationSettingsUpdate(BaseModel):
    summarization_enabled: bool = False
    summarization_model: str | None = None
    summarization_guidance: str | None = None


@router.put("/{workshop_id}/summarization-settings")
async def update_summarization_settings(
    workshop_id: str, body: SummarizationSettingsUpdate, db: Session = Depends(get_db)
) -> Workshop:
    """Update trace summarization settings for a workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    updated = db_service.update_workshop_summarization_settings(
        workshop_id,
        summarization_enabled=body.summarization_enabled,
        summarization_model=body.summarization_model,
        summarization_guidance=body.summarization_guidance,
    )
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update summarization settings")
    return updated
```

- [ ] **Step 4: Implement resummarize endpoint**

```python
@router.post("/{workshop_id}/resummarize")
async def resummarize_traces(
    workshop_id: str,
    body: dict | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Trigger re-summarization of workshop traces.

    Runs in background. Returns immediately with job info.
    Optionally accepts {"trace_ids": [...]} to limit scope.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")
    if not workshop.summarization_enabled or not workshop.summarization_model:
        raise HTTPException(status_code=400, detail="Summarization not configured")

    traces = db_service.get_traces(workshop_id)
    if not traces:
        return {"total": 0, "message": "No traces to summarize"}

    # Filter to specific trace IDs if provided
    trace_ids = (body or {}).get("trace_ids")
    if trace_ids:
        traces = [t for t in traces if t.id in trace_ids]

    # Build batch input
    batch = [{"id": t.id, "context": t.context} for t in traces if t.context]

    # Launch background summarization
    import asyncio
    from server.services.trace_summarization_service import TraceSummarizationService
    from server.services.token_storage_service import token_storage

    databricks_token = token_storage.get_token(workshop_id) or db_service.get_databricks_token(workshop_id)
    if not databricks_token:
        raise HTTPException(status_code=400, detail="Databricks token not found")

    mlflow_config = db_service.get_mlflow_config(workshop_id)
    if not mlflow_config:
        raise HTTPException(status_code=400, detail="MLflow config not found")

    endpoint_url = f"https://{mlflow_config.databricks_host}/serving-endpoints"

    async def run_summarization():
        svc = TraceSummarizationService(
            endpoint_url=endpoint_url,
            token=databricks_token,
            model_name=workshop.summarization_model,
            guidance=workshop.summarization_guidance,
        )
        results = await svc.summarize_batch(batch)
        for result in results:
            if result["summary"] is not None:
                db_service.update_trace_summary(result["trace_id"], result["summary"])

    asyncio.create_task(run_summarization())

    return {
        "total": len(batch),
        "message": f"Summarization started for {len(batch)} traces",
    }
```

- [ ] **Step 5: Hook summarization into ingestion**

In `server/routers/workshops.py`, modify `ingest_mlflow_traces` (around line 2918) to trigger summarization after ingestion:

```python
# After successful ingestion (after line 2921):
# Trigger background summarization if enabled
if workshop.summarization_enabled and workshop.summarization_model:
    try:
        traces = db_service.get_traces(workshop_id)
        unsummarized = [t for t in traces if t.context and not t.summary]
        if unsummarized:
            batch = [{"id": t.id, "context": t.context} for t in unsummarized]
            endpoint_url = f"https://{config_with_token.databricks_host}/serving-endpoints"

            async def run_summarization():
                from server.services.trace_summarization_service import TraceSummarizationService
                svc = TraceSummarizationService(
                    endpoint_url=endpoint_url,
                    token=config_with_token.databricks_token,
                    model_name=workshop.summarization_model,
                    guidance=workshop.summarization_guidance,
                )
                results = await svc.summarize_batch(batch)
                for r in results:
                    if r["summary"] is not None:
                        db_service.update_trace_summary(r["trace_id"], r["summary"])

            import asyncio
            asyncio.create_task(run_summarization())
    except Exception as e:
        logger.warning(f"Failed to start background summarization: {e}")
```

- [ ] **Step 6: Run tests**

Run: `just test-server -k "test_summarization"`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add server/routers/workshops.py server/services/mlflow_intake_service.py tests/unit/routers/test_summarization_endpoints.py
git commit -m "feat(summarization): add settings + resummarize endpoints, hook into ingestion"
```

---

## Task 4: Frontend — Milestone View Component

**Spec criteria:** SC-U1, SC-U2, SC-U3, SC-U4, SC-U5
**Files:**
- Create: `client/src/components/MilestoneView.tsx`
- Modify: `client/src/components/TraceViewer.tsx`
- Modify: `client/src/client/models/Workshop.ts` (or equivalent type file)

- [ ] **Step 1: Update TypeScript types**

Add to the Workshop type:
```typescript
summarization_enabled?: boolean;
summarization_model?: string | null;
summarization_guidance?: string | null;
```

Add `summary` to TraceData interface in `TraceViewer.tsx`:
```typescript
export interface TraceData {
  // ... existing fields ...
  summary?: {
    executive_summary: string;
    milestones: Array<{
      number: number;
      title: string;
      summary: string;
      events: Array<{
        type: 'tool_call' | 'transfer' | 'result' | 'error';
        label: string;
        span_name: string;
        data: Record<string, unknown>;
      }>;
    }>;
  } | null;
}
```

- [ ] **Step 2: Create MilestoneView component**

Create `client/src/components/MilestoneView.tsx`:

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface MilestoneEvent {
  type: 'tool_call' | 'transfer' | 'result' | 'error';
  label: string;
  span_name: string;
  data: Record<string, unknown>;
}

interface Milestone {
  number: number;
  title: string;
  summary: string;
  events: MilestoneEvent[];
}

interface MilestoneViewProps {
  executiveSummary: string;
  milestones: Milestone[];
}

const EVENT_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  tool_call: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: 'tool' },
  transfer: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: 'transfer' },
  result: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'result' },
  error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'error' },
};

function EventBadge({ type }: { type: string }) {
  const style = EVENT_TYPE_STYLES[type] || EVENT_TYPE_STYLES.result;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function MilestoneEventItem({ event }: { event: MilestoneEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasData = event.data && Object.keys(event.data).length > 0;

  return (
    <div className="ml-6 border-l-2 border-gray-200 dark:border-gray-700 pl-4 py-2">
      <div className="flex items-start gap-2">
        <EventBadge type={event.type} />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-700 dark:text-gray-300">{event.label}</span>
          {hasData && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {expanded ? 'See less' : 'See more'}
            </button>
          )}
        </div>
      </div>
      {expanded && hasData && (
        <pre className="mt-2 ml-0 p-3 bg-gray-50 dark:bg-gray-800 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto">
          {JSON.stringify(event.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function MilestoneView({ executiveSummary, milestones }: MilestoneViewProps) {
  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-700 dark:text-gray-300 italic">
          {executiveSummary}
        </p>
      </div>

      {/* Milestones */}
      <div className="space-y-3">
        {milestones.map((milestone) => (
          <MilestoneCard key={milestone.number} milestone={milestone} />
        ))}
      </div>
    </div>
  );
}

function MilestoneCard({ milestone }: { milestone: Milestone }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-sm font-semibold">
          {milestone.number}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {milestone.title}
          </h3>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 ml-10 mb-2">
            {milestone.summary}
          </p>
          {milestone.events.length > 0 && (
            <div className="ml-4">
              {milestone.events.map((event, i) => (
                <MilestoneEventItem key={i} event={event} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add milestone view toggle to TraceViewer**

In `client/src/components/TraceViewer.tsx`, update the component:

1. Import MilestoneView and Tabs components
2. Add a state for view mode (default to milestone when summary exists)
3. Wrap the existing content + milestone view in tabs

```tsx
// At top of TraceViewer component:
import { MilestoneView } from './MilestoneView';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';

// Inside TraceViewer function, after existing hooks:
const hasSummary = !!trace.summary?.milestones?.length;
const [viewMode, setViewMode] = useState<'milestone' | 'trace'>(
  hasSummary ? 'milestone' : 'trace'
);

// In the JSX — wrap existing content:
{hasSummary ? (
  <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'milestone' | 'trace')}>
    <TabsList className="grid w-full grid-cols-2 mb-4">
      <TabsTrigger value="milestone">Milestone View</TabsTrigger>
      <TabsTrigger value="trace">Trace Details</TabsTrigger>
    </TabsList>
    <TabsContent value="milestone">
      <MilestoneView
        executiveSummary={trace.summary!.executive_summary}
        milestones={trace.summary!.milestones}
      />
    </TabsContent>
    <TabsContent value="trace">
      {/* Existing TraceViewer content (input/output sections) */}
    </TabsContent>
  </Tabs>
) : (
  /* Existing TraceViewer content unchanged */
)}
```

- [ ] **Step 4: Run frontend tests**

Run: `just ui-test-unit`
Expected: Existing tests still pass

- [ ] **Step 5: Commit**

```bash
git add client/src/components/MilestoneView.tsx client/src/components/TraceViewer.tsx client/src/client/models/Workshop.ts
git commit -m "feat(summarization): add MilestoneView component with tab toggle in TraceViewer"
```

---

## Task 5: Frontend — Summarization Settings UI

**Spec criteria:** SC-C1, SC-C2, SC-C3
**Files:**
- Create: `client/src/components/SummarizationSettings.tsx`
- Modify: Parent component that hosts facilitator settings (likely `JsonPathSettings.tsx` or dashboard)

- [ ] **Step 1: Create SummarizationSettings component**

Create `client/src/components/SummarizationSettings.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useWorkshop, useAvailableModels } from '../hooks';
import { Button } from './ui/button';
import { Switch } from './ui/switch';

interface SummarizationSettingsProps {
  workshopId: string;
}

export function SummarizationSettings({ workshopId }: SummarizationSettingsProps) {
  const { data: workshop, refetch } = useWorkshop(workshopId);
  const { data: models } = useAvailableModels(workshopId);
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState<string>('');
  const [guidance, setGuidance] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (workshop) {
      setEnabled(workshop.summarization_enabled ?? false);
      setModel(workshop.summarization_model ?? '');
      setGuidance(workshop.summarization_guidance ?? '');
    }
  }, [workshop]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/workshops/${workshopId}/summarization-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summarization_enabled: enabled,
          summarization_model: model || null,
          summarization_guidance: guidance || null,
        }),
      });
      refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        Trace Summarization
      </h3>
      <p className="text-xs text-gray-500">
        When enabled, traces will be automatically summarized into a milestone view at ingestion time.
      </p>

      <div className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <span className="text-sm">{enabled ? 'Enabled' : 'Disabled'}</span>
      </div>

      {enabled && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            >
              <option value="">Select a model...</option>
              {(models || []).map((m: { name: string }) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Guidance (optional)
            </label>
            <textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="e.g., Focus on tool call decisions and error recovery..."
              rows={3}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            />
          </div>
        </>
      )}

      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Wire into facilitator settings**

Add the SummarizationSettings component to the same location where JsonPathSettings is rendered (likely in the facilitator dashboard or settings panel). Follow the existing pattern for how JsonPathSettings is included.

- [ ] **Step 3: Run frontend lint and tests**

Run: `just ui-lint && just ui-test-unit`
Expected: No errors, existing tests pass

- [ ] **Step 4: Commit**

```bash
git add client/src/components/SummarizationSettings.tsx
git commit -m "feat(summarization): add facilitator settings UI for trace summarization"
```

---

## Task 6 (Final): Lint and Verify Spec Coverage

- [ ] **Step 1: Run backend linting**

Run: `just lint` (or equivalent)
Expected: No errors

- [ ] **Step 2: Run frontend linting**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 3: Run all backend tests**

Run: `just test-server`
Expected: All PASS, no regressions

- [ ] **Step 4: Run all frontend tests**

Run: `just ui-test-unit`
Expected: All PASS, no regressions

- [ ] **Step 5: Run spec coverage**

Run: `just spec-coverage --specs TRACE_SUMMARIZATION_SPEC`
Expected: Coverage shows tagged tests for the new spec

- [ ] **Step 6: Update implementation log**

Add to `specs/TRACE_SUMMARIZATION_SPEC.md`:

```markdown
## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-04-11 | [Trace Summarization](../.claude/plans/2026-04-11-trace-summarization.md) | complete | Two-pass LLM summarization with batch orchestration and milestone view UI |
```
