"""Integration tests for annotation → MLflow sync pipeline.

Spec: ANNOTATION_SPEC
Tests the critical cross-spec data flow: annotation save → MLflow feedback logging.
These tests mock MLflow and the database to verify the sync contract.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch, PropertyMock
import os

import pytest

from server.services.database_service import DatabaseService


def _make_db_service_with_mocks(
    *,
    workshop_id="ws-1",
    rubric_question="Helpfulness: Rate helpfulness",
    mlflow_trace_id="tr-abc123",
    annotation_ratings=None,
    annotation_comment=None,
    annotation_user_id="user-1",
    annotation_rating=None,
    existing_assessments=None,
    judge_name="workshop_judge",
):
    """Build a DatabaseService with mocked DB session and return (service, annotation_db)."""
    mock_session = MagicMock()

    # Mock MLflowIntakeConfigDB query
    mock_config = MagicMock()
    mock_config.databricks_host = "https://test.databricks.com"
    mock_config.experiment_id = "exp-1"

    # Mock RubricDB query
    mock_rubric = MagicMock()
    mock_rubric.question = rubric_question
    mock_rubric.workshop_id = workshop_id

    # Mock WorkshopDB query (for legacy fallback)
    mock_workshop = MagicMock()
    mock_workshop.judge_name = judge_name

    # Setup query chain to return different mocks for different model types
    def query_side_effect(model):
        chain = MagicMock()
        model_name = getattr(model, '__name__', str(model))
        if 'MLflowIntakeConfig' in model_name:
            chain.filter.return_value.first.return_value = mock_config
        elif 'Rubric' in model_name:
            chain.filter.return_value.first.return_value = mock_rubric
        elif 'Workshop' in model_name:
            chain.filter.return_value.first.return_value = mock_workshop
        else:
            chain.filter.return_value.first.return_value = None
        return chain

    mock_session.query.side_effect = query_side_effect

    service = DatabaseService(mock_session)

    # Build annotation mock
    annotation_db = MagicMock()
    annotation_db.trace_id = "trace-1"
    annotation_db.user_id = annotation_user_id
    annotation_db.ratings = annotation_ratings
    annotation_db.rating = annotation_rating
    annotation_db.comment = annotation_comment

    # Mock trace relationship
    annotation_db.trace = MagicMock()
    annotation_db.trace.mlflow_trace_id = mlflow_trace_id

    return service, annotation_db


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.req("Annotations sync to MLflow as feedback on save (one entry per rubric question)")
class TestAnnotationMlflowSync:
    """Test that annotations sync to MLflow as feedback entries."""

    @patch.dict(os.environ, {}, clear=False)
    @patch("server.services.databricks_service.resolve_databricks_token", return_value="test-token")
    def test_sync_logs_one_feedback_per_rubric_question(self, mock_resolve_token):
        """Each rubric question rating produces one MLflow log_feedback call."""
        # resolve_databricks_token is already mocked to return "test-token"

        service, annotation_db = _make_db_service_with_mocks(
            rubric_question="Helpfulness: Rate helpfulness|||QUESTION_SEPARATOR|||Accuracy: Is it correct?",
            annotation_ratings={"rubric-1_0": 4, "rubric-1_1": 3},
        )

        with patch("mlflow.set_tracking_uri"), \
             patch("mlflow.set_experiment"), \
             patch("mlflow.set_trace_tag") as mock_tag, \
             patch("mlflow.get_trace") as mock_get_trace, \
             patch("mlflow.log_feedback") as mock_log:
            mock_trace = MagicMock()
            mock_trace.info.assessments = []
            mock_get_trace.return_value = mock_trace

            result = service._sync_annotation_with_mlflow("ws-1", annotation_db)

            assert mock_log.call_count == 2, f"Expected 2 log_feedback calls, got {mock_log.call_count}"
            assert result['logged'] == 2
            assert result['skipped'] == 0


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.req("Feedback source is HUMAN with annotator's user_id")
class TestFeedbackSource:
    """Test that MLflow feedback source is set to HUMAN with correct user_id."""

    @patch.dict(os.environ, {}, clear=False)
    @patch("server.services.databricks_service.resolve_databricks_token", return_value="test-token")
    def test_feedback_source_is_human_with_user_id(self, mock_resolve_token):
        """Feedback source type is HUMAN and source_id is the annotator's user_id."""
        # resolve_databricks_token is already mocked to return "test-token"

        service, annotation_db = _make_db_service_with_mocks(
            annotation_user_id="user-alice",
            annotation_ratings={"rubric-1_0": 5},
        )

        with patch("mlflow.set_tracking_uri"), \
             patch("mlflow.set_experiment"), \
             patch("mlflow.set_trace_tag"), \
             patch("mlflow.get_trace") as mock_get_trace, \
             patch("mlflow.log_feedback") as mock_log:
            mock_trace = MagicMock()
            mock_trace.info.assessments = []
            mock_get_trace.return_value = mock_trace

            service._sync_annotation_with_mlflow("ws-1", annotation_db)

            # Check the source argument
            call_kwargs = mock_log.call_args
            source = call_kwargs.kwargs.get('source') or call_kwargs[1].get('source')
            assert source is not None
            assert source.source_id == "user-alice"
            # source_type should be HUMAN (AssessmentSourceType.HUMAN)
            assert "HUMAN" in str(source.source_type)


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.req("MLflow trace tagged with `label: \"align\"` and `workshop_id` on annotation")
class TestMlflowTraceTagging:
    """Test that annotation triggers trace tagging with 'align' label."""

    @patch.dict(os.environ, {}, clear=False)
    @patch("server.services.databricks_service.resolve_databricks_token", return_value="test-token")
    def test_trace_tagged_with_align_and_workshop_id(self, mock_resolve_token):
        """set_trace_tag called with label=align and workshop_id."""
        # resolve_databricks_token is already mocked to return "test-token"

        service, annotation_db = _make_db_service_with_mocks(
            workshop_id="ws-test-42",
            annotation_ratings={"rubric-1_0": 4},
        )

        with patch("mlflow.set_tracking_uri"), \
             patch("mlflow.set_experiment"), \
             patch("mlflow.set_trace_tag") as mock_tag, \
             patch("mlflow.get_trace") as mock_get_trace, \
             patch("mlflow.log_feedback"):
            mock_trace = MagicMock()
            mock_trace.info.assessments = []
            mock_get_trace.return_value = mock_trace

            service._sync_annotation_with_mlflow("ws-test-42", annotation_db)

            # Verify both tags were set
            tag_calls = {call.kwargs.get('key') or call[1].get('key'): call.kwargs.get('value') or call[1].get('value') for call in mock_tag.call_args_list}
            assert tag_calls.get('align') == 'true'
            assert tag_calls.get('workshop_id') == 'ws-test-42'


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.req("Annotation comment maps to MLflow feedback rationale")
class TestCommentToRationale:
    """Test that annotation comment is passed as MLflow feedback rationale."""

    @patch.dict(os.environ, {}, clear=False)
    @patch("server.services.databricks_service.resolve_databricks_token", return_value="test-token")
    def test_comment_maps_to_rationale(self, mock_resolve_token):
        """Annotation comment is passed as the rationale parameter."""
        # resolve_databricks_token is already mocked to return "test-token"

        service, annotation_db = _make_db_service_with_mocks(
            annotation_ratings={"rubric-1_0": 4},
            annotation_comment="This response was very helpful and accurate.",
        )

        with patch("mlflow.set_tracking_uri"), \
             patch("mlflow.set_experiment"), \
             patch("mlflow.set_trace_tag"), \
             patch("mlflow.get_trace") as mock_get_trace, \
             patch("mlflow.log_feedback") as mock_log:
            mock_trace = MagicMock()
            mock_trace.info.assessments = []
            mock_get_trace.return_value = mock_trace

            service._sync_annotation_with_mlflow("ws-1", annotation_db)

            call_kwargs = mock_log.call_args
            rationale = call_kwargs.kwargs.get('rationale') or call_kwargs[1].get('rationale')
            assert rationale == "This response was very helpful and accurate."


def _build_existing_assessment(*, name, source_id, value, assessment_id="asmt-existing-1"):
    """Helper: construct a mock MLflow assessment with the shape `_sync_annotation_with_mlflow` reads."""
    from mlflow.entities import AssessmentSourceType

    mock = MagicMock()
    mock.name = name
    mock.assessment_id = assessment_id
    mock.source = MagicMock()
    mock.source.source_type = AssessmentSourceType.HUMAN
    mock.source.source_id = source_id
    mock.feedback = MagicMock()
    mock.feedback.value = value
    return mock


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.req("Annotation edits propagate to MLflow via update_assessment; identical re-syncs skip")
class TestEditOverwriteBehavior:
    """Three-way branch: no-existing -> log, same-value -> skip, different-value -> update."""

    @patch.dict(os.environ, {}, clear=False)
    @patch("server.services.databricks_service.resolve_databricks_token", return_value="test-token")
    def test_same_value_resync_skipped(self, mock_resolve_token):
        """Re-syncing the same rating value is a no-op (no log_feedback, no update_assessment)."""
        service, annotation_db = _make_db_service_with_mocks(
            annotation_user_id="user-1",
            annotation_ratings={"rubric-1_0": 4},
        )

        with patch("mlflow.set_tracking_uri"), \
             patch("mlflow.set_experiment"), \
             patch("mlflow.set_trace_tag"), \
             patch("mlflow.get_trace") as mock_get_trace, \
             patch("mlflow.log_feedback") as mock_log, \
             patch("mlflow.update_assessment") as mock_update:
            # Existing assessment has the SAME value (4) — should skip
            existing = _build_existing_assessment(
                name="helpfulness_judge", source_id="user-1", value=4,
            )
            mock_trace = MagicMock()
            mock_trace.info.assessments = [existing]
            mock_get_trace.return_value = mock_trace

            result = service._sync_annotation_with_mlflow("ws-1", annotation_db)

            assert mock_log.call_count == 0, "Should not log_feedback when value is unchanged"
            assert mock_update.call_count == 0, "Should not update_assessment when value is unchanged"
            assert result["skipped"] == 1
            assert result.get("updated", 0) == 0
            assert result.get("logged", 0) == 0

    @patch.dict(os.environ, {}, clear=False)
    @patch("server.services.databricks_service.resolve_databricks_token", return_value="test-token")
    def test_different_value_edit_overwrites(self, mock_resolve_token):
        """SME edit (new rating differs from MLflow) calls update_assessment, not log_feedback."""
        service, annotation_db = _make_db_service_with_mocks(
            annotation_user_id="user-1",
            annotation_ratings={"rubric-1_0": 2},  # SME changed their mind from 4 → 2
        )

        with patch("mlflow.set_tracking_uri"), \
             patch("mlflow.set_experiment"), \
             patch("mlflow.set_trace_tag"), \
             patch("mlflow.get_trace") as mock_get_trace, \
             patch("mlflow.log_feedback") as mock_log, \
             patch("mlflow.update_assessment") as mock_update:
            # Existing assessment has value 4, new rating is 2 — should update
            existing = _build_existing_assessment(
                name="helpfulness_judge",
                source_id="user-1",
                value=4,
                assessment_id="asmt-abc-123",
            )
            mock_trace = MagicMock()
            mock_trace.info.assessments = [existing]
            mock_get_trace.return_value = mock_trace

            result = service._sync_annotation_with_mlflow("ws-1", annotation_db)

            assert mock_log.call_count == 0, "Should NOT log_feedback on edit (would create duplicate)"
            assert mock_update.call_count == 1, "Should call update_assessment exactly once"

            # Verify the update was targeted at the correct assessment_id and carried the new value.
            # name is deliberately None — Databricks MLflow treats name as immutable on update,
            # so passing None signals "don't touch the name" via the store's field-mask pattern.
            call_kwargs = mock_update.call_args.kwargs
            assert call_kwargs["trace_id"] == "tr-abc123"
            assert call_kwargs["assessment_id"] == "asmt-abc-123"
            new_assessment = call_kwargs["assessment"]
            assert new_assessment.value == 2
            assert new_assessment.name is None, "name must be None to avoid 'assessmentName may not be updated' server error"

            assert result["updated"] == 1
            assert result.get("logged", 0) == 0
            assert result.get("skipped", 0) == 0

    @patch.dict(os.environ, {}, clear=False)
    @patch("server.services.databricks_service.resolve_databricks_token", return_value="test-token")
    def test_update_failure_does_not_log_duplicate(self, mock_resolve_token):
        """If update_assessment fails after retries, do NOT fall through to log_feedback
        (would leave duplicate entries in MLflow)."""
        service, annotation_db = _make_db_service_with_mocks(
            annotation_user_id="user-1",
            annotation_ratings={"rubric-1_0": 2},
        )

        with patch("mlflow.set_tracking_uri"), \
             patch("mlflow.set_experiment"), \
             patch("mlflow.set_trace_tag"), \
             patch("mlflow.get_trace") as mock_get_trace, \
             patch("mlflow.log_feedback") as mock_log, \
             patch("mlflow.update_assessment", side_effect=RuntimeError("MLflow unavailable")):
            existing = _build_existing_assessment(
                name="helpfulness_judge",
                source_id="user-1",
                value=4,
                assessment_id="asmt-abc-123",
            )
            mock_trace = MagicMock()
            mock_trace.info.assessments = [existing]
            mock_get_trace.return_value = mock_trace

            result = service._sync_annotation_with_mlflow("ws-1", annotation_db)

            assert mock_log.call_count == 0, "Must NOT log_feedback when update fails — would create duplicate"
            assert result.get("updated", 0) == 0
            assert result.get("logged", 0) == 0


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.req("Legacy single-rating format loads correctly alongside multi-rating format")
class TestLegacySingleRating:
    """Test that legacy single-rating annotations sync correctly."""

    @patch.dict(os.environ, {}, clear=False)
    @patch("server.services.databricks_service.resolve_databricks_token", return_value="test-token")
    def test_legacy_single_rating_syncs(self, mock_resolve_token):
        """When ratings dict is empty but legacy rating field exists, sync it."""
        # resolve_databricks_token is already mocked to return "test-token"

        service, annotation_db = _make_db_service_with_mocks(
            annotation_ratings=None,
            annotation_rating=4,
            judge_name="helpfulness_judge",
        )

        with patch("mlflow.set_tracking_uri"), \
             patch("mlflow.set_experiment"), \
             patch("mlflow.set_trace_tag"), \
             patch("mlflow.get_trace") as mock_get_trace, \
             patch("mlflow.log_feedback") as mock_log:
            mock_trace = MagicMock()
            mock_trace.info.assessments = []
            mock_get_trace.return_value = mock_trace

            result = service._sync_annotation_with_mlflow("ws-1", annotation_db)

            assert mock_log.call_count == 1
            assert result['logged'] == 1
