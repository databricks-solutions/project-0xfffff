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
        all_instructions = " ".join(service.milestone_agent._instructions)
        assert "Focus on tool call decisions" in all_instructions


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
