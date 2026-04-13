import pytest

from server.services.trace_summarization_service import (
    ExecutiveSummary,
    Milestone,
    SpanDataRef,
    TraceContext,
    TraceSummary,
    TraceSummarizationService,
    get_root_span,
    get_span_detail,
    get_trace_overview,
    list_spans,
    resolve_span_data_refs,
    search_spans,
)


SAMPLE_TRACE_CONTEXT = {
    "spans": [
        {
            "name": "root_agent",
            "span_type": "AGENT",
            "status": "OK",
            "inputs": {"task": "Find worst performing issuers by spend active rate"},
            "outputs": {
                "result": "Three US issuers at 0% spend active rate: ICAs 67311, 12346, 12933"
            },
            "start_time_ns": 1000000000,
            "end_time_ns": 5000000000,
            "parent_span_id": None,
        },
        {
            "name": "spend_active_recommendation",
            "span_type": "TOOL",
            "status": "OK",
            "inputs": {"query": "worst performing issuers by spend active rate"},
            "outputs": {
                "sql": "SELECT ica, country, overall_spend_active_rate_reported "
                "FROM view_overall_spend_active_rate "
                "ORDER BY overall_spend_active_rate_reported ASC",
                "row_count": 240,
            },
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


SAMPLE_EXEC_SUMMARY = ExecutiveSummary(
    executive_summary="Agent queried view_overall_spend_active_rate, returning 240 rows "
    "showing three US issuers at 0% spend active rate."
)

SAMPLE_TRACE_SUMMARY = TraceSummary(
    executive_summary="Agent queried view_overall_spend_active_rate, returning 240 rows "
    "showing three US issuers at 0% spend active rate.",
    milestones=[
        Milestone(
            number=1,
            title="Queried Issuer Spend Active Rates",
            summary="Invoked spend_active_recommendation tool which queried "
            "view_overall_spend_active_rate, returning 240 rows.",
            inputs=[
                SpanDataRef(
                    span_name="spend_active_recommendation",
                    field="inputs",
                    jsonpath="$.query",
                )
            ],
            outputs=[
                SpanDataRef(
                    span_name="spend_active_recommendation",
                    field="outputs",
                    jsonpath="$.sql",
                ),
                SpanDataRef(
                    span_name="spend_active_recommendation",
                    field="outputs",
                    jsonpath="$.row_count",
                ),
            ],
        ),
        Milestone(
            number=2,
            title="Synthesized Findings",
            summary="Identified ICAs 67311, 12346, 12933 as critical performers at 0% spend active rate.",
            inputs=[
                SpanDataRef(
                    span_name="generate_response", field="inputs"
                )
            ],
            outputs=[
                SpanDataRef(
                    span_name="generate_response",
                    field="outputs",
                    jsonpath="$.content",
                )
            ],
        ),
    ],
)


# --- TraceContext ---


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestTraceContext:
    def test_from_dict(self):
        ctx = TraceContext.from_dict(SAMPLE_TRACE_CONTEXT)
        assert ctx.status == "OK"
        assert ctx.execution_time_ms == 4000
        assert len(ctx.spans) == 4

    def test_from_dict_missing_fields_uses_defaults(self):
        ctx = TraceContext.from_dict({"spans": []})
        assert ctx.status == "UNKNOWN"
        assert ctx.execution_time_ms == 0
        assert ctx.spans == []


# --- SpanDataRef model ---


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestSpanDataRefModel:
    @pytest.mark.req(
        "Each milestone has zero or more input span data references (span_name, field, optional jsonpath)"
    )
    def test_span_data_ref_with_jsonpath(self):
        ref = SpanDataRef(span_name="my_tool", field="outputs", jsonpath="$.sql")
        assert ref.span_name == "my_tool"
        assert ref.field == "outputs"
        assert ref.jsonpath == "$.sql"
        assert ref.value is None

    @pytest.mark.req(
        "Each milestone has zero or more output span data references (span_name, field, optional jsonpath)"
    )
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


# --- Tool functions ---


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
@pytest.mark.req(
    "Agent tools include: get_trace_overview, list_spans, get_span_detail, get_root_span, search_spans"
)
class TestTraceTools:
    def setup_method(self):
        self.ctx = TraceContext.from_dict(SAMPLE_TRACE_CONTEXT)

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
        ctx = TraceContext.from_dict(
            {
                "spans": [
                    {
                        "name": "child",
                        "span_type": "TOOL",
                        "parent_span_id": "parent-1",
                        "inputs": {},
                        "outputs": {},
                        "start_time_ns": 0,
                        "end_time_ns": 1,
                    }
                ]
            }
        )
        result = get_root_span(ctx)
        assert "error" in result

    def test_search_spans(self):
        result = search_spans(self.ctx, pattern="spend_active_rate")
        assert len(result) > 0
        assert any(
            r["span_name"] == "spend_active_recommendation" for r in result
        )

    def test_search_spans_no_match(self):
        result = search_spans(self.ctx, pattern="zzz_nonexistent_zzz")
        assert len(result) == 0


# --- Span data resolution ---


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestSpanDataResolution:
    def setup_method(self):
        self.ctx = TraceContext.from_dict(SAMPLE_TRACE_CONTEXT)

    @pytest.mark.req(
        "Span data references are resolved to actual values from the trace after agent output"
    )
    def test_resolve_ref_full_field(self):
        ref = SpanDataRef(span_name="spend_active_recommendation", field="inputs")
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert resolved[0].value == {
            "query": "worst performing issuers by spend active rate"
        }

    @pytest.mark.req(
        "Span data references are resolved to actual values from the trace after agent output"
    )
    def test_resolve_ref_with_jsonpath(self):
        ref = SpanDataRef(
            span_name="spend_active_recommendation",
            field="outputs",
            jsonpath="$.row_count",
        )
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert resolved[0].value == 240

    @pytest.mark.req(
        "Span data references are resolved to actual values from the trace after agent output"
    )
    def test_resolve_ref_jsonpath_string(self):
        ref = SpanDataRef(
            span_name="spend_active_recommendation",
            field="outputs",
            jsonpath="$.sql",
        )
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert "SELECT ica" in resolved[0].value

    @pytest.mark.req(
        "When jsonpath is null, the entire span inputs or outputs field is included"
    )
    def test_resolve_ref_no_jsonpath_includes_full_field(self):
        ref = SpanDataRef(span_name="root_agent", field="outputs")
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert "result" in resolved[0].value
        assert "0% spend active rate" in str(resolved[0].value)

    @pytest.mark.req(
        "Invalid span references (nonexistent span or path) resolve to null without failing the milestone"
    )
    def test_resolve_ref_nonexistent_span(self):
        ref = SpanDataRef(span_name="does_not_exist", field="inputs")
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert resolved[0].value is None

    @pytest.mark.req(
        "Invalid span references (nonexistent span or path) resolve to null without failing the milestone"
    )
    def test_resolve_ref_bad_jsonpath(self):
        ref = SpanDataRef(
            span_name="root_agent", field="outputs", jsonpath="$.nonexistent_key"
        )
        resolved = resolve_span_data_refs([ref], self.ctx)
        assert resolved[0].value is None

    def test_resolve_multiple_refs(self):
        refs = [
            SpanDataRef(
                span_name="spend_active_recommendation",
                field="inputs",
                jsonpath="$.query",
            ),
            SpanDataRef(
                span_name="spend_active_recommendation",
                field="outputs",
                jsonpath="$.row_count",
            ),
        ]
        resolved = resolve_span_data_refs(refs, self.ctx)
        assert resolved[0].value == "worst performing issuers by spend active rate"
        assert resolved[1].value == 240


# --- Tool-based agent ---


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestToolBasedAgent:
    @pytest.mark.req(
        "Agent uses trace inspection tools to selectively examine spans (not a full-text dump)"
    )
    def test_agents_have_tools_registered(self):
        service = TraceSummarizationService(
            endpoint_url="https://test.databricks.com/serving-endpoints",
            token="test-token",
            model_name="test-model",
        )
        summary_tool_names = set(service.summary_agent._function_toolset.tools.keys())
        milestone_tool_names = set(service.milestone_agent._function_toolset.tools.keys())
        expected = {
            "pai_get_trace_overview",
            "pai_list_spans",
            "pai_get_span_detail",
            "pai_get_root_span",
            "pai_search_spans",
        }
        assert expected.issubset(summary_tool_names)
        assert expected.issubset(milestone_tool_names)

    @pytest.mark.req(
        "Agent uses trace inspection tools to selectively examine spans (not a full-text dump)"
    )
    def test_format_trace_for_prompt_removed(self):
        """The old text-dump method should no longer exist."""
        assert not hasattr(TraceSummarizationService, "_format_trace_for_prompt")

    @pytest.mark.req(
        "Facilitator can provide optional free-text guidance for the summarization prompt"
    )
    def test_guidance_included_in_instructions(self):
        service = TraceSummarizationService(
            endpoint_url="https://test.databricks.com/serving-endpoints",
            token="test-token",
            model_name="test-model",
            guidance="Focus on SQL queries and their results",
        )
        all_instructions = " ".join(service.milestone_agent._instructions)
        assert "Focus on SQL queries and their results" in all_instructions


# --- Two-pass summarization ---


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
        assert "240 rows" in result.executive_summary

    @pytest.mark.req(
        "Agent extracts milestones with relevant span data as the second pass"
    )
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
        assert milestone.title == "Queried Issuer Spend Active Rates"
        assert "spend_active_recommendation" in milestone.summary

    @pytest.mark.req(
        "Each milestone includes span data references resolved to actual trace values"
    )
    @pytest.mark.asyncio
    async def test_milestone_refs_resolved(self):
        service = TraceSummarizationService.for_testing(
            exec_summary_result=SAMPLE_EXEC_SUMMARY,
            milestone_result=SAMPLE_TRACE_SUMMARY,
        )
        result = await service.summarize_trace(SAMPLE_TRACE_CONTEXT)
        milestone = result.milestones[0]
        # Inputs should be resolved
        assert len(milestone.inputs) == 1
        assert milestone.inputs[0].value == "worst performing issuers by spend active rate"
        # Outputs should be resolved
        assert len(milestone.outputs) == 2
        assert "SELECT ica" in milestone.outputs[0].value
        assert milestone.outputs[1].value == 240

    @pytest.mark.req("Summarization failure does not block trace ingestion")
    @pytest.mark.asyncio
    async def test_agent_failure_returns_none(self):
        service = TraceSummarizationService.for_testing(raise_error=True)
        result = await service.summarize_trace(SAMPLE_TRACE_CONTEXT)
        assert result is None


# --- Batch summarization ---


@pytest.mark.spec("TRACE_SUMMARIZATION_SPEC")
class TestBatchSummarization:
    @pytest.mark.req(
        "Multiple traces are summarized concurrently up to a configurable concurrency limit"
    )
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

    @pytest.mark.req(
        "Partial failures do not block the batch — failed traces are ingested with summary = null"
    )
    @pytest.mark.asyncio
    async def test_batch_partial_failure(self):
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
            progress_updates.append(
                {"completed": completed, "total": total, "failed": failed}
            )

        traces = [{"id": f"t{i}", "context": SAMPLE_TRACE_CONTEXT} for i in range(3)]
        await service.summarize_batch(traces, on_progress=on_progress)
        assert len(progress_updates) > 0
        final = progress_updates[-1]
        assert final["completed"] + final["failed"] == final["total"]
