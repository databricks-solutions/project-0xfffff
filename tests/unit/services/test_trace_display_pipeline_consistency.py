"""Tests for TRACE_DISPLAY_SPEC consistency requirement.

Verifies that all backend services consuming trace input/output apply the
same span-filter-then-JSONPath pipeline.  Three code paths are checked:

1. preview_jsonpath endpoint  (server/routers/workshops.py)
2. preview_span_filter endpoint  (server/routers/workshops.py)
3. DiscoveryAnalysisService.aggregate_feedback  (server/services/discovery_analysis_service.py)

Each path should:
  - Apply span_attribute_filter first (when configured) to select a child span
  - Apply JSONPath extraction second (when configured) to extract a value
"""

import json
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import (
    Base,
    DiscoveryFeedbackDB,
    TraceDB,
    WorkshopDB,
)
from server.services.database_service import DatabaseService
from server.services.discovery_analysis_service import DiscoveryAnalysisService
from server.utils.jsonpath_utils import apply_jsonpath
from server.utils.span_filter_utils import apply_span_filter

# ---------------------------------------------------------------------------
# Shared test data: a workshop with span filter + JSONPath configured
# ---------------------------------------------------------------------------

SPAN_FILTER_CONFIG = {"span_name": "ChatModel", "span_type": "CHAT_MODEL"}

INPUT_JSONPATH = "$.messages[0].content"
OUTPUT_JSONPATH = "$.response.text"

# The root trace has complex JSON; the child span has simpler content.
ROOT_INPUT = json.dumps({"raw": "root-level input"})
ROOT_OUTPUT = json.dumps({"raw": "root-level output"})

SPAN_INPUT = json.dumps({"messages": [{"content": "What is AI?"}]})
SPAN_OUTPUT = json.dumps({"response": {"text": "AI is artificial intelligence."}})

TRACE_CONTEXT = {
    "spans": [
        {
            "name": "RootChain",
            "span_type": "CHAIN",
            "inputs": json.loads(ROOT_INPUT),
            "outputs": json.loads(ROOT_OUTPUT),
            "attributes": {},
        },
        {
            "name": "ChatModel",
            "span_type": "CHAT_MODEL",
            "inputs": json.loads(SPAN_INPUT),
            "outputs": json.loads(SPAN_OUTPUT),
            "attributes": {"model": "gpt-4"},
        },
    ]
}

# Expected final values after span filter + JSONPath
EXPECTED_INPUT = "What is AI?"
EXPECTED_OUTPUT = "AI is artificial intelligence."


# ---------------------------------------------------------------------------
# Fixtures (in-memory SQLite, same pattern as test_discovery_analysis_service)
# ---------------------------------------------------------------------------


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def db_service(test_db):
    return DatabaseService(test_db)


@pytest.fixture
def workshop(test_db):
    ws = WorkshopDB(
        id="ws-pipeline",
        name="Pipeline Consistency Test",
        facilitator_id="fac-1",
        input_jsonpath=INPUT_JSONPATH,
        output_jsonpath=OUTPUT_JSONPATH,
        span_attribute_filter=SPAN_FILTER_CONFIG,
        active_discovery_trace_ids=["t-1"],
        discovery_started=True,
        current_phase="discovery",
    )
    test_db.add(ws)
    test_db.commit()
    return ws


@pytest.fixture
def trace_with_spans(test_db, workshop):
    t = TraceDB(
        id="t-1",
        workshop_id="ws-pipeline",
        input=ROOT_INPUT,
        output=ROOT_OUTPUT,
        context=TRACE_CONTEXT,
    )
    test_db.add(t)
    test_db.commit()
    return t


@pytest.fixture
def discovery_feedback(test_db, workshop, trace_with_spans):
    fb = DiscoveryFeedbackDB(
        id="fb-1",
        workshop_id="ws-pipeline",
        trace_id="t-1",
        user_id="u-1",
        feedback_label="good",
        comment="Looks correct",
    )
    test_db.add(fb)
    test_db.commit()
    return fb


# ============================================================================
# Test: Span filter + JSONPath pipeline produces correct results
# ============================================================================


@pytest.mark.spec("TRACE_DISPLAY_SPEC")
@pytest.mark.req(
    "All backend services that consume trace input/output apply the same span filter and JSONPath pipeline as the TraceViewer"
)
class TestTraceDisplayPipelineConsistency:
    """Verify span-filter-then-JSONPath pipeline is applied consistently."""

    def test_pipeline_produces_expected_values(self):
        """Sanity check: the span filter + JSONPath pipeline extracts the expected values."""
        # Step 1: Apply span filter
        span_input, span_output = apply_span_filter(TRACE_CONTEXT, SPAN_FILTER_CONFIG)
        assert span_input is not None, "Span filter should match the ChatModel span"
        assert span_output is not None, "Span filter should match the ChatModel span"

        # Step 2: Apply JSONPath on span-filtered results
        extracted_input, ok_in = apply_jsonpath(span_input, INPUT_JSONPATH)
        assert ok_in is True
        assert extracted_input == EXPECTED_INPUT

        extracted_output, ok_out = apply_jsonpath(span_output, OUTPUT_JSONPATH)
        assert ok_out is True
        assert extracted_output == EXPECTED_OUTPUT

    def test_discovery_analysis_applies_pipeline(
        self, test_db, db_service, workshop, trace_with_spans, discovery_feedback
    ):
        """DiscoveryAnalysisService.aggregate_feedback applies span filter then JSONPath."""
        analysis_service = DiscoveryAnalysisService(db_service, MagicMock())
        aggregated = analysis_service.aggregate_feedback("ws-pipeline")

        assert "t-1" in aggregated, "Trace t-1 should appear in aggregated feedback"
        trace_data = aggregated["t-1"]

        # The service should have applied the pipeline:
        # span filter selects ChatModel span -> JSONPath extracts content
        assert trace_data["input"] == EXPECTED_INPUT
        assert trace_data["output"] == EXPECTED_OUTPUT

    def test_discovery_analysis_uses_root_without_filter(
        self, test_db, db_service, trace_with_spans, discovery_feedback
    ):
        """Without span filter, discovery analysis uses root trace input/output."""
        # Create a workshop without span filter or JSONPath
        ws_no_filter = WorkshopDB(
            id="ws-no-filter",
            name="No Filter Workshop",
            facilitator_id="fac-1",
            active_discovery_trace_ids=["t-nf"],
            discovery_started=True,
            current_phase="discovery",
        )
        test_db.add(ws_no_filter)
        test_db.flush()

        t = TraceDB(
            id="t-nf",
            workshop_id="ws-no-filter",
            input=ROOT_INPUT,
            output=ROOT_OUTPUT,
            context=TRACE_CONTEXT,
        )
        test_db.add(t)

        fb = DiscoveryFeedbackDB(
            id="fb-nf",
            workshop_id="ws-no-filter",
            trace_id="t-nf",
            user_id="u-1",
            feedback_label="good",
            comment="No filter test",
        )
        test_db.add(fb)
        test_db.commit()

        analysis_service = DiscoveryAnalysisService(db_service, MagicMock())
        aggregated = analysis_service.aggregate_feedback("ws-no-filter")

        assert "t-nf" in aggregated
        # Without filter/JSONPath, raw input/output should be used
        assert aggregated["t-nf"]["input"] == ROOT_INPUT
        assert aggregated["t-nf"]["output"] == ROOT_OUTPUT

    def test_preview_jsonpath_and_discovery_produce_same_result(
        self, test_db, db_service, workshop, trace_with_spans, discovery_feedback
    ):
        """preview_jsonpath endpoint logic and discovery analysis produce identical results.

        This test manually replicates the preview_jsonpath endpoint logic
        (from server/routers/workshops.py) and compares its output to
        the discovery analysis service output to verify pipeline consistency.
        """
        # --- Replicate preview_jsonpath endpoint logic ---
        workshop_obj = db_service.get_workshop("ws-pipeline")
        traces = db_service.get_traces("ws-pipeline")
        first_trace = traces[0]

        base_input = first_trace.input
        base_output = first_trace.output
        span_filter = workshop_obj.span_attribute_filter

        if span_filter:
            context = first_trace.context if first_trace.context else None
            span_input, span_output = apply_span_filter(context, span_filter)
            if span_input is not None:
                base_input = span_input
            if span_output is not None:
                base_output = span_output

        input_result, input_success = apply_jsonpath(base_input, workshop_obj.input_jsonpath)
        output_result, output_success = apply_jsonpath(base_output, workshop_obj.output_jsonpath)

        preview_input = input_result if input_success else base_input
        preview_output = output_result if output_success else base_output

        # --- Get discovery analysis output ---
        analysis_service = DiscoveryAnalysisService(db_service, MagicMock())
        aggregated = analysis_service.aggregate_feedback("ws-pipeline")

        discovery_input = aggregated["t-1"]["input"]
        discovery_output = aggregated["t-1"]["output"]

        # --- Both should produce the same final extracted values ---
        assert preview_input == discovery_input, (
            f"Pipeline inconsistency: preview_jsonpath returned '{preview_input}' "
            f"but discovery_analysis returned '{discovery_input}'"
        )
        assert preview_output == discovery_output, (
            f"Pipeline inconsistency: preview_jsonpath returned '{preview_output}' "
            f"but discovery_analysis returned '{discovery_output}'"
        )

        # Both should equal the expected extracted values
        assert preview_input == EXPECTED_INPUT
        assert preview_output == EXPECTED_OUTPUT

    def test_preview_span_filter_and_discovery_produce_same_result(
        self, test_db, db_service, workshop, trace_with_spans, discovery_feedback
    ):
        """preview_span_filter endpoint logic and discovery analysis produce identical results.

        Replicates the preview_span_filter endpoint logic and compares output.
        """
        # --- Replicate preview_span_filter endpoint logic ---
        workshop_obj = db_service.get_workshop("ws-pipeline")
        traces = db_service.get_traces("ws-pipeline")
        first_trace = traces[0]
        context = first_trace.context if first_trace.context else None

        inputs_str, outputs_str = apply_span_filter(context, SPAN_FILTER_CONFIG)

        # Apply JSONPath on top of span-filtered results
        final_input = inputs_str
        final_output = outputs_str
        if inputs_str is not None and workshop_obj.input_jsonpath:
            extracted, ok = apply_jsonpath(inputs_str, workshop_obj.input_jsonpath)
            if ok:
                final_input = extracted
        if outputs_str is not None and workshop_obj.output_jsonpath:
            extracted, ok = apply_jsonpath(outputs_str, workshop_obj.output_jsonpath)
            if ok:
                final_output = extracted

        # --- Get discovery analysis output ---
        analysis_service = DiscoveryAnalysisService(db_service, MagicMock())
        aggregated = analysis_service.aggregate_feedback("ws-pipeline")

        discovery_input = aggregated["t-1"]["input"]
        discovery_output = aggregated["t-1"]["output"]

        # --- Both should produce the same final extracted values ---
        assert final_input == discovery_input, (
            f"Pipeline inconsistency: preview_span_filter returned '{final_input}' "
            f"but discovery_analysis returned '{discovery_input}'"
        )
        assert final_output == discovery_output, (
            f"Pipeline inconsistency: preview_span_filter returned '{final_output}' "
            f"but discovery_analysis returned '{discovery_output}'"
        )

    def test_pipeline_order_is_span_filter_then_jsonpath(self):
        """The pipeline must apply span filter BEFORE JSONPath.

        If the order were reversed (JSONPath on root then span filter),
        results would differ because root data has different structure.
        """
        # JSONPath on root input (wrong order) would fail because root
        # doesn't have $.messages[0].content
        root_extracted, root_ok = apply_jsonpath(ROOT_INPUT, INPUT_JSONPATH)
        assert root_ok is False, "JSONPath on root input should fail (no messages key)"

        # Correct order: span filter first, then JSONPath on span content
        span_input, _ = apply_span_filter(TRACE_CONTEXT, SPAN_FILTER_CONFIG)
        span_extracted, span_ok = apply_jsonpath(span_input, INPUT_JSONPATH)
        assert span_ok is True
        assert span_extracted == EXPECTED_INPUT

    def test_get_display_text_applies_full_pipeline(self):
        """get_display_text applies span filter then JSONPath."""
        from server.utils.trace_display_utils import get_display_text
        from server.models import Trace, Workshop

        workshop = Workshop(
            id="ws", name="test", facilitator_id="f",
            input_jsonpath=INPUT_JSONPATH,
            output_jsonpath=OUTPUT_JSONPATH,
            span_attribute_filter=SPAN_FILTER_CONFIG,
        )
        trace = Trace(
            id="t", workshop_id="ws", input=ROOT_INPUT, output=ROOT_OUTPUT,
            context=TRACE_CONTEXT, trace_metadata={}, mlflow_trace_id="m",
        )
        result_input, result_output = get_display_text(trace, workshop)
        assert result_input == EXPECTED_INPUT
        assert result_output == EXPECTED_OUTPUT

    def test_get_display_text_no_config(self):
        """get_display_text returns raw input/output when no filters configured."""
        from server.utils.trace_display_utils import get_display_text
        from server.models import Trace, Workshop

        workshop = Workshop(id="ws", name="test", facilitator_id="f")
        trace = Trace(
            id="t", workshop_id="ws", input=ROOT_INPUT, output=ROOT_OUTPUT,
            context=TRACE_CONTEXT, trace_metadata={}, mlflow_trace_id="m",
        )
        result_input, result_output = get_display_text(trace, workshop)
        assert result_input == ROOT_INPUT
        assert result_output == ROOT_OUTPUT

    def test_all_consumers_use_display_pipeline(self):
        """Verify that all known backend consumers use the trace display pipeline.

        Services that read trace input/output for LLM evaluation or analysis
        must go through the shared get_display_text helper. This structural
        check ensures no service reads trace.input/trace.output without
        applying the pipeline.
        """
        import importlib
        import inspect

        helper_consumers = [
            "server.services.discovery_analysis_service",
            "server.services.judge_service",
            "server.services.discovery_service",
        ]

        for module_name in helper_consumers:
            mod = importlib.import_module(module_name)
            source = inspect.getsource(mod)

            assert "get_display_text" in source, (
                f"{module_name} does not reference get_display_text"
            )
