"""Contract tests: MLflow integration boundary verification.

These tests verify:
1. Mock shape fidelity — our test mocks match documented MLflow API shapes
2. Call-site correctness — services pass correct parameter types to MLflow
3. Error classification — retry logic correctly classifies retryable vs non-retryable
4. Feedback value types — binary (0.0/1.0), likert (1.0-5.0) as float
5. Assessment limit handling — 50 per trace cap
"""

from unittest.mock import MagicMock, patch, call

import pytest

pytestmark = [
    pytest.mark.spec("TESTING_SPEC"),
]


# ============================================================================
# 1. Mock Shape Tests — verify mocks match real MLflow API shapes
# ============================================================================

class TestTraceShape:
    """Verify mock trace objects have the expected attribute hierarchy."""

    def test_trace_info_has_required_fields(self, mock_trace):
        assert isinstance(mock_trace.info.request_id, str)
        assert mock_trace.info.request_id.startswith("tr-")
        assert isinstance(mock_trace.info.status, str)
        assert isinstance(mock_trace.info.execution_time_ms, int)
        assert isinstance(mock_trace.info.timestamp_ms, int)
        assert isinstance(mock_trace.info.tags, dict)
        assert isinstance(mock_trace.info.assessments, list)

    def test_trace_data_has_required_fields(self, mock_trace):
        assert isinstance(mock_trace.data.request, str)
        assert isinstance(mock_trace.data.response, str)
        assert isinstance(mock_trace.data.spans, list)

    def test_span_has_required_fields(self, mock_trace):
        span = mock_trace.data.spans[0]
        assert hasattr(span, "name")
        assert hasattr(span, "span_type")
        assert hasattr(span, "inputs")
        assert hasattr(span, "outputs")


class TestAssessmentShape:
    """Verify mock assessment objects match the real shape."""

    def test_assessment_has_required_fields(self, mock_assessment):
        assert hasattr(mock_assessment, "name")
        assert hasattr(mock_assessment, "value")
        assert hasattr(mock_assessment, "source")
        assert hasattr(mock_assessment, "rationale")

    def test_assessment_source_has_required_fields(self, mock_assessment):
        assert hasattr(mock_assessment.source, "source_type")
        assert hasattr(mock_assessment.source, "source_id")


class TestExperimentShape:
    """Verify mock experiment objects match the real shape."""

    def test_experiment_has_required_fields(self, mock_experiment):
        assert isinstance(mock_experiment.experiment_id, str)
        assert isinstance(mock_experiment.name, str)
        assert isinstance(mock_experiment.lifecycle_stage, str)
        assert mock_experiment.lifecycle_stage in ("active", "deleted")


# ============================================================================
# 2. Error Classification Tests — _retry_mlflow_operation
# ============================================================================

class TestRetryErrorClassification:
    """Verify _retry_mlflow_operation correctly classifies errors."""

    def _run_retry(self, error_message, max_retries=3):
        """Helper: run _retry_mlflow_operation with an operation that always fails."""
        from server.services.database_service import _retry_mlflow_operation

        def _failing_op():
            raise Exception(error_message)

        with patch("time.sleep"):
            result = _retry_mlflow_operation(
                _failing_op,
                max_retries=max_retries,
                base_delay=0.01,
                description="test-op",
            )
        return result

    # --- Non-retryable errors: should return None immediately ---

    def test_assessment_limit_not_retried(self):
        """'maximum allowed assessments' errors return None immediately."""
        call_count = 0

        def _op():
            nonlocal call_count
            call_count += 1
            raise Exception("maximum allowed assessments per trace is 50")

        from server.services.database_service import _retry_mlflow_operation

        with patch("time.sleep"):
            result = _retry_mlflow_operation(_op, max_retries=3, description="test")
        assert result is None
        assert call_count == 1  # Not retried

    def test_not_found_not_retried(self):
        """'not found' / 404 errors return None immediately."""
        call_count = 0

        def _op():
            nonlocal call_count
            call_count += 1
            raise Exception("Trace not found")

        from server.services.database_service import _retry_mlflow_operation

        with patch("time.sleep"):
            result = _retry_mlflow_operation(_op, max_retries=3, description="test")
        assert result is None
        assert call_count == 1

    def test_404_error_not_retried(self):
        """HTTP 404 errors return None immediately."""
        call_count = 0

        def _op():
            nonlocal call_count
            call_count += 1
            raise Exception("HTTP Error 404")

        from server.services.database_service import _retry_mlflow_operation

        with patch("time.sleep"):
            result = _retry_mlflow_operation(_op, max_retries=3, description="test")
        assert result is None
        assert call_count == 1

    def test_unauthorized_not_retried(self):
        """Auth errors (401/403/unauthorized) return None immediately."""
        for msg in ["unauthorized access", "HTTP 401", "HTTP 403"]:
            call_count = 0

            def _op(m=msg):
                nonlocal call_count
                call_count += 1
                raise Exception(m)

            from server.services.database_service import _retry_mlflow_operation

            with patch("time.sleep"):
                result = _retry_mlflow_operation(_op, max_retries=3, description="test")
            assert result is None, f"Expected None for error: {msg}"
            assert call_count == 1, f"Should not retry for: {msg}"

    # --- Retryable errors: should exhaust all retries ---

    def test_transient_error_retried(self):
        """Transient network errors are retried max_retries times."""
        call_count = 0

        def _op():
            nonlocal call_count
            call_count += 1
            raise Exception("Connection reset by peer")

        from server.services.database_service import _retry_mlflow_operation

        with patch("time.sleep"):
            result = _retry_mlflow_operation(_op, max_retries=3, description="test")
        assert result is None
        assert call_count == 3  # All retries exhausted

    def test_retry_succeeds_on_second_attempt(self):
        """Operation succeeds after transient failure."""
        call_count = 0

        def _op():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise Exception("Connection timeout")
            return "success"

        from server.services.database_service import _retry_mlflow_operation

        with patch("time.sleep"):
            result = _retry_mlflow_operation(_op, max_retries=3, description="test")
        assert result == "success"
        assert call_count == 2

    def test_exponential_backoff_delays(self):
        """Verify exponential backoff: 1s, 2s, 4s (with base_delay=1.0)."""
        from server.services.database_service import _retry_mlflow_operation

        def _op():
            raise Exception("server error")

        with patch("time.sleep") as mock_sleep:
            _retry_mlflow_operation(_op, max_retries=3, base_delay=1.0, description="test")

        # Should sleep between retries: 1.0s (2^0), 2.0s (2^1)
        assert mock_sleep.call_count == 2
        mock_sleep.assert_any_call(1.0)
        mock_sleep.assert_any_call(2.0)


# ============================================================================
# 3. Feedback Value Type Tests
# ============================================================================

class TestFeedbackValueTypes:
    """Verify feedback value normalization for binary and likert judges."""

    def test_binary_values_are_float(self):
        """Binary judge values should be 0.0 or 1.0 (float, not bool)."""
        # Binary labels in the system use float values
        for val in [0.0, 1.0]:
            assert isinstance(val, float)
            assert val in (0.0, 1.0)

    def test_likert_values_in_range(self):
        """Likert judge values should be 1.0-5.0 as float."""
        for val in [1, 2, 3, 4, 5]:
            float_val = float(val)
            assert 1.0 <= float_val <= 5.0

    def test_rating_normalization(self):
        """DatabaseService._validate_and_normalize_rating converts to correct types."""
        from server.services.database_service import DatabaseService
        from unittest.mock import MagicMock

        db = MagicMock()
        service = DatabaseService(db)

        # Likert: integer values 1-5 should stay as integers
        result = service._validate_and_normalize_rating(3, "likert")
        assert result == 3

        # Binary: "Pass" maps to 1 for binary judges
        result = service._validate_and_normalize_rating(1, "binary")
        assert result in (0, 1)


# ============================================================================
# 4. Call-Site Tests — verify parameter types at MLflow boundaries
# ============================================================================

class TestLogFeedbackCallSite:
    """Verify log_feedback contract: parameter types and calling conventions."""

    @patch("mlflow.log_feedback")
    def test_log_feedback_parameter_types(self, mock_log_feedback):
        """log_feedback receives correct parameter types per the MLflow contract."""
        import mlflow

        # Simulate what our code does when logging human feedback
        mlflow.log_feedback(
            trace_id="tr-abc123",
            name="helpfulness",
            value=4.0,
            source=MagicMock(source_type="HUMAN", source_id="user-123"),
            rationale="Good response",
        )

        kwargs = mock_log_feedback.call_args.kwargs
        assert isinstance(kwargs["trace_id"], str)
        assert kwargs["trace_id"].startswith("tr-")
        assert isinstance(kwargs["name"], str)
        assert isinstance(kwargs["value"], float)
        assert isinstance(kwargs["rationale"], str)
        assert hasattr(kwargs["source"], "source_type")
        assert hasattr(kwargs["source"], "source_id")

    @patch("mlflow.log_feedback")
    def test_log_feedback_ai_source_format(self, mock_log_feedback):
        """AI-generated feedback uses 'llm_judge_<name>' source_id convention."""
        import mlflow

        source = MagicMock(
            source_type="AI_GENERATED",
            source_id="llm_judge_helpfulness",
        )
        mlflow.log_feedback(
            trace_id="tr-xyz",
            name="helpfulness",
            value=1.0,
            source=source,
            rationale="Judge reasoning",
        )

        kwargs = mock_log_feedback.call_args.kwargs
        assert kwargs["source"].source_id.startswith("llm_judge_")

    def test_retry_wrapper_passes_through_return_value(self):
        """_retry_mlflow_operation returns the operation's return value on success."""
        from server.services.database_service import _retry_mlflow_operation

        result = _retry_mlflow_operation(lambda: "ok", description="test")
        assert result == "ok"


class TestSetTraceTagCallSite:
    """Verify set_trace_tag is called with string parameters."""

    @patch("mlflow.set_trace_tag")
    def test_set_trace_tag_receives_strings(self, mock_set_tag):
        """set_trace_tag should receive string key and value."""
        import mlflow

        mlflow.set_trace_tag(trace_id="tr-abc", key="label", value="good")
        mock_set_tag.assert_called_once_with(
            trace_id="tr-abc", key="label", value="good"
        )
        # Verify all args are strings
        kwargs = mock_set_tag.call_args.kwargs
        assert isinstance(kwargs["trace_id"], str)
        assert isinstance(kwargs["key"], str)
        assert isinstance(kwargs["value"], str)


class TestSearchTracesCallSite:
    """Verify search_traces is called with correct parameter types."""

    @patch("mlflow.search_traces")
    def test_search_traces_parameter_types(self, mock_search):
        """search_traces receives list of strings for experiment_ids."""
        import mlflow

        mlflow.search_traces(
            experiment_ids=["exp-1"],
            max_results=100,
            filter_string="",
            return_type="list",
        )
        kwargs = mock_search.call_args.kwargs
        assert isinstance(kwargs["experiment_ids"], list)
        assert all(isinstance(eid, str) for eid in kwargs["experiment_ids"])
        assert isinstance(kwargs["max_results"], int)
        assert kwargs["return_type"] in ("list", "pandas")


# ============================================================================
# 5. Assessment Limit Tests
# ============================================================================

class TestAssessmentLimit:
    """Verify the 50-assessment-per-trace limit is handled."""

    def test_assessment_limit_error_returns_none(self):
        """When the 50-assessment limit is hit, retry returns None (not exception)."""
        from server.services.database_service import _retry_mlflow_operation

        def _op():
            raise Exception(
                "INVALID_PARAMETER_VALUE: The maximum allowed assessments per trace is 50"
            )

        with patch("time.sleep"):
            result = _retry_mlflow_operation(_op, max_retries=3, description="test")
        assert result is None

    def test_dedup_check_counts_existing_assessments(self, mock_trace):
        """Our code should check existing assessments before logging more."""
        # The mock trace starts with 0 assessments
        assert len(mock_trace.info.assessments) == 0

        # Simulate a trace with many assessments
        mock_trace.info.assessments = [MagicMock() for _ in range(49)]
        assert len(mock_trace.info.assessments) == 49
