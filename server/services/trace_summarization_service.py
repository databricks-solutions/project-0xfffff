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
            TestModel(custom_output_args=exec_summary_result),
            output_type=ExecutiveSummary,
            instructions=EXECUTIVE_SUMMARY_INSTRUCTIONS,
            retries=2,
        )
        instance.milestone_agent = Agent(
            TestModel(custom_output_args=milestone_result),
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
