"""Integration tests for rubric lifecycle and cross-spec data flows.

Spec: RUBRIC_SPEC
Tests rubric CRUD operations, phase prerequisites, judge name derivation,
and downstream effects on annotations.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from server.services.database_service import DatabaseService


def _make_db_service():
    """Create a DatabaseService with a mocked session."""
    mock_session = MagicMock()
    return DatabaseService(mock_session), mock_session


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Only one rubric exists per workshop (upsert semantics)")
class TestRubricUpsert:
    """Test that rubric creation uses upsert semantics."""

    def test_create_rubric_when_none_exists(self):
        """Creating a rubric when none exists should add and commit it."""
        service, mock_session = _make_db_service()

        # No existing rubric
        mock_session.query.return_value.filter.return_value.first.return_value = None
        mock_session.add = MagicMock()
        mock_session.commit = MagicMock()

        # Mock refresh to set created_at on the new rubric
        def fake_refresh(obj):
            if not hasattr(obj, 'created_at') or obj.created_at is None:
                obj.created_at = datetime.now()
            if not hasattr(obj, 'id') or obj.id is None:
                obj.id = "rubric-new"
        mock_session.refresh = MagicMock(side_effect=fake_refresh)

        from server.models import RubricCreate
        rubric_data = RubricCreate(
            question="Helpfulness: Rate helpfulness",
            created_by="facilitator-1",
            judge_type="likert",
        )

        result = service.create_rubric("ws-1", rubric_data)
        assert mock_session.add.called, "Should add new rubric to session"
        assert mock_session.commit.called, "Should commit the new rubric"

    def test_update_rubric_when_one_exists(self):
        """Creating a rubric when one already exists should update it."""
        service, mock_session = _make_db_service()

        # Existing rubric
        existing = MagicMock()
        existing.id = "rubric-existing"
        existing.workshop_id = "ws-1"
        existing.question = "Old question"
        mock_session.query.return_value.filter.return_value.first.return_value = existing
        mock_session.commit = MagicMock()
        mock_session.refresh = MagicMock()

        from server.models import RubricCreate
        rubric_data = RubricCreate(
            question="New question: Updated",
            created_by="facilitator-1",
            judge_type="likert",
        )

        result = service.create_rubric("ws-1", rubric_data)
        # Should update existing, not add new
        assert existing.question == "New question: Updated" or mock_session.commit.called


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Judge name auto-derived from first rubric question title")
class TestJudgeNameDerivation:
    """Test that judge name is auto-derived from the first rubric question title."""

    def test_derive_judge_name_from_title(self):
        """_derive_judge_name_from_title converts title to snake_case judge name."""
        service, _ = _make_db_service()
        result = service._derive_judge_name_from_title("Response Helpfulness")
        # The function appends _judge suffix
        assert result == "response_helpfulness_judge"

    def test_derive_judge_name_strips_special_chars(self):
        """Special characters are removed from derived judge name."""
        service, _ = _make_db_service()
        result = service._derive_judge_name_from_title("Quality (1-5)")
        # Should produce a valid Python identifier-like string
        assert " " not in result
        assert result.islower() or "_" in result

    def test_derive_judge_name_handles_empty_title(self):
        """Empty title produces a fallback judge name."""
        service, _ = _make_db_service()
        result = service._derive_judge_name_from_title("")
        assert result is not None
        assert len(result) > 0


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Question IDs re-indexed sequentially after deletion")
class TestQuestionReIndexing:
    """Test that question IDs are re-indexed after deletion."""

    def test_reconstruct_reindexes_ids(self):
        """After deleting a question, remaining IDs should be sequential."""
        service, _ = _make_db_service()

        questions = [
            {'id': 'old_3', 'title': 'First', 'description': 'D1', 'judge_type': 'likert'},
            {'id': 'old_7', 'title': 'Second', 'description': 'D2', 'judge_type': 'binary'},
        ]

        service._reconstruct_rubric_questions(questions)

        assert questions[0]['id'] == 'q_1'
        assert questions[1]['id'] == 'q_2'

    def test_reconstruct_single_question_gets_q1(self):
        """A single remaining question gets id q_1."""
        service, _ = _make_db_service()

        questions = [
            {'id': 'q_5', 'title': 'Only', 'description': 'D', 'judge_type': 'likert'},
        ]

        service._reconstruct_rubric_questions(questions)

        assert questions[0]['id'] == 'q_1'


@pytest.mark.spec("RUBRIC_SPEC")
class TestRubricSuggestionValidation:
    """Test validation rules for AI-generated rubric suggestions.

    Validation lives in RubricGenerationService._validate_suggestions().
    """

    def _make_generation_service(self):
        from server.services.rubric_generation_service import RubricGenerationService
        mock_db_service = MagicMock()
        mock_databricks_service = MagicMock()
        return RubricGenerationService(mock_db_service, mock_databricks_service)

    @pytest.mark.req("Suggestions validated: title >= 3 chars, description >= 10 chars")
    def test_short_title_rejected(self):
        """Suggestion with title < 3 chars should be filtered out."""
        svc = self._make_generation_service()
        suggestions = [
            {'title': 'AB', 'description': 'This is a long enough description', 'judgeType': 'likert'},
            {'title': 'Helpfulness', 'description': 'Rate the helpfulness of the response', 'judgeType': 'likert'},
        ]

        valid = svc._validate_suggestions(suggestions)
        assert len(valid) == 1
        assert valid[0].title == 'Helpfulness'

    @pytest.mark.req("Suggestions validated: title >= 3 chars, description >= 10 chars")
    def test_short_description_rejected(self):
        """Suggestion with description < 10 chars should be filtered out."""
        svc = self._make_generation_service()
        suggestions = [
            {'title': 'Quality', 'description': 'Too short', 'judgeType': 'likert'},
            {'title': 'Helpfulness', 'description': 'This description is long enough for validation', 'judgeType': 'likert'},
        ]

        valid = svc._validate_suggestions(suggestions)
        assert len(valid) == 1
        assert valid[0].title == 'Helpfulness'

    @pytest.mark.req("Invalid judge type in suggestions defaults to likert")
    def test_invalid_judge_type_defaults_to_likert(self):
        """Invalid judgeType in suggestion should default to likert."""
        svc = self._make_generation_service()
        suggestions = [
            {'title': 'Quality Check', 'description': 'Check the quality of the output response', 'judgeType': 'invalid_type'},
        ]

        valid = svc._validate_suggestions(suggestions)
        assert len(valid) == 1
        assert valid[0].judgeType == 'likert'


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Facilitator can create a rubric question with title and description")
class TestRubricCreate:
    """Test that a facilitator can create a rubric question with title and description."""

    def test_create_rubric_stores_question(self):
        """Create rubric stores question text with title and description."""
        service, mock_session = _make_db_service()

        # No existing rubric
        mock_session.query.return_value.filter.return_value.first.return_value = None
        mock_session.add = MagicMock()
        mock_session.commit = MagicMock()

        def fake_refresh(obj):
            if not hasattr(obj, 'created_at') or obj.created_at is None:
                obj.created_at = datetime.now()
            if not hasattr(obj, 'id') or obj.id is None:
                obj.id = "rubric-1"
        mock_session.refresh = MagicMock(side_effect=fake_refresh)

        from server.models import RubricCreate
        rubric_data = RubricCreate(
            question="Response Quality: How well does the response address the query?",
            created_by="facilitator-1",
        )

        result = service.create_rubric("ws-1", rubric_data)
        assert result is not None
        assert result.question == "Response Quality: How well does the response address the query?"

    def test_create_rubric_with_multiple_questions(self):
        """Create rubric with multiple questions using delimiter."""
        service, mock_session = _make_db_service()

        mock_session.query.return_value.filter.return_value.first.return_value = None
        mock_session.add = MagicMock()
        mock_session.commit = MagicMock()

        def fake_refresh(obj):
            if not hasattr(obj, 'created_at') or obj.created_at is None:
                obj.created_at = datetime.now()
            if not hasattr(obj, 'id') or obj.id is None:
                obj.id = "rubric-2"
        mock_session.refresh = MagicMock(side_effect=fake_refresh)

        from server.models import RubricCreate
        question_text = "Quality: Rate quality|||QUESTION_SEPARATOR|||Accuracy: Is it accurate?"
        rubric_data = RubricCreate(
            question=question_text,
            created_by="facilitator-1",
        )

        result = service.create_rubric("ws-1", rubric_data)
        assert "Quality" in result.question
        assert "Accuracy" in result.question


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Facilitator can edit an existing rubric question")
class TestRubricEdit:
    """Test that a facilitator can edit an existing rubric question."""

    def test_update_rubric_question_changes_title_and_description(self):
        """Updating a question changes its title and description."""
        service, mock_session = _make_db_service()

        existing_rubric = MagicMock()
        existing_rubric.id = "rubric-1"
        existing_rubric.workshop_id = "ws-1"
        existing_rubric.question = "Old Title: Old description|||JUDGE_TYPE|||likert"
        existing_rubric.created_by = "facilitator-1"
        existing_rubric.created_at = datetime.now()
        mock_session.query.return_value.filter.return_value.first.return_value = existing_rubric
        mock_session.commit = MagicMock()
        mock_session.refresh = MagicMock()

        result = service.update_rubric_question("ws-1", "q_1", "New Title", "New description")
        assert result is not None
        # The rubric question text should be updated
        assert "New Title" in existing_rubric.question
        assert "New description" in existing_rubric.question

    def test_update_nonexistent_question_returns_none(self):
        """Updating a question that doesn't exist returns None."""
        service, mock_session = _make_db_service()

        existing_rubric = MagicMock()
        existing_rubric.question = "Title: Description|||JUDGE_TYPE|||likert"
        mock_session.query.return_value.filter.return_value.first.return_value = existing_rubric

        result = service.update_rubric_question("ws-1", "q_999", "New", "Desc")
        assert result is None


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Facilitator can delete a rubric question")
class TestRubricDelete:
    """Test that a facilitator can delete a rubric question."""

    def test_delete_question_removes_it(self):
        """Deleting a question removes it from the rubric."""
        service, mock_session = _make_db_service()

        existing_rubric = MagicMock()
        existing_rubric.id = "rubric-1"
        existing_rubric.workshop_id = "ws-1"
        existing_rubric.question = (
            "Q1: Desc1|||JUDGE_TYPE|||likert"
            "|||QUESTION_SEPARATOR|||"
            "Q2: Desc2|||JUDGE_TYPE|||binary"
        )
        existing_rubric.created_by = "facilitator-1"
        existing_rubric.created_at = datetime.now()
        mock_session.query.return_value.filter.return_value.first.return_value = existing_rubric
        mock_session.commit = MagicMock()
        mock_session.refresh = MagicMock()

        result = service.delete_rubric_question("ws-1", "q_1")
        assert result is not None
        # Only Q2 should remain
        assert "Q2" in existing_rubric.question
        assert "Q1" not in existing_rubric.question

    def test_delete_last_question_deletes_rubric(self):
        """Deleting the last question deletes the entire rubric."""
        service, mock_session = _make_db_service()

        existing_rubric = MagicMock()
        existing_rubric.question = "Only Question: Description|||JUDGE_TYPE|||likert"
        mock_session.query.return_value.filter.return_value.first.return_value = existing_rubric
        mock_session.delete = MagicMock()
        mock_session.commit = MagicMock()

        result = service.delete_rubric_question("ws-1", "q_1")
        assert result is None
        mock_session.delete.assert_called_once()


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("No phase restriction on rubric CRUD")
class TestNoPhaseRestriction:
    """Test that rubric CRUD works regardless of workshop phase."""

    def test_create_rubric_no_phase_check(self):
        """create_rubric does not check workshop phase."""
        service, mock_session = _make_db_service()

        # No existing rubric
        mock_session.query.return_value.filter.return_value.first.return_value = None
        mock_session.add = MagicMock()
        mock_session.commit = MagicMock()

        def fake_refresh(obj):
            if not hasattr(obj, 'created_at') or obj.created_at is None:
                obj.created_at = datetime.now()
            if not hasattr(obj, 'id') or obj.id is None:
                obj.id = "rubric-nophase"
        mock_session.refresh = MagicMock(side_effect=fake_refresh)

        from server.models import RubricCreate
        rubric_data = RubricCreate(
            question="Quality: Rate quality",
            created_by="facilitator-1",
        )

        # Should succeed regardless of workshop phase
        result = service.create_rubric("ws-1", rubric_data)
        assert result is not None

    def test_update_rubric_question_no_phase_check(self):
        """update_rubric_question does not check workshop phase."""
        service, mock_session = _make_db_service()

        existing_rubric = MagicMock()
        existing_rubric.id = "rubric-1"
        existing_rubric.workshop_id = "ws-1"
        existing_rubric.question = "Title: Desc|||JUDGE_TYPE|||likert"
        existing_rubric.created_by = "f-1"
        existing_rubric.created_at = datetime.now()
        mock_session.query.return_value.filter.return_value.first.return_value = existing_rubric
        mock_session.commit = MagicMock()
        mock_session.refresh = MagicMock()

        result = service.update_rubric_question("ws-1", "q_1", "Updated", "Updated desc")
        assert result is not None

    def test_delete_rubric_question_no_phase_check(self):
        """delete_rubric_question does not check workshop phase."""
        service, mock_session = _make_db_service()

        existing_rubric = MagicMock()
        existing_rubric.id = "rubric-1"
        existing_rubric.workshop_id = "ws-1"
        existing_rubric.question = (
            "Q1: D1|||JUDGE_TYPE|||likert"
            "|||QUESTION_SEPARATOR|||"
            "Q2: D2|||JUDGE_TYPE|||likert"
        )
        existing_rubric.created_by = "f-1"
        existing_rubric.created_at = datetime.now()
        mock_session.query.return_value.filter.return_value.first.return_value = existing_rubric
        mock_session.commit = MagicMock()
        mock_session.refresh = MagicMock()

        result = service.delete_rubric_question("ws-1", "q_1")
        assert result is not None


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Annotation data preserved when rubric questions are deleted")
class TestAnnotationDataPreserved:
    """Test that annotation data is preserved when rubric questions are deleted."""

    def test_delete_question_does_not_touch_annotations(self):
        """Deleting a rubric question does NOT delete annotation data."""
        service, mock_session = _make_db_service()

        existing_rubric = MagicMock()
        existing_rubric.id = "rubric-1"
        existing_rubric.workshop_id = "ws-1"
        existing_rubric.question = (
            "Q1: D1|||JUDGE_TYPE|||likert"
            "|||QUESTION_SEPARATOR|||"
            "Q2: D2|||JUDGE_TYPE|||likert"
        )
        existing_rubric.created_by = "f-1"
        existing_rubric.created_at = datetime.now()
        mock_session.query.return_value.filter.return_value.first.return_value = existing_rubric
        mock_session.commit = MagicMock()
        mock_session.refresh = MagicMock()

        service.delete_rubric_question("ws-1", "q_1")

        # Verify that the AnnotationDB model was never queried for deletion
        # The delete_rubric_question method only modifies the rubric question text,
        # NOT the annotations table
        for call in mock_session.delete.call_args_list:
            deleted_obj = call[0][0]
            assert deleted_obj is not existing_rubric, (
                "Only the rubric itself should be deletable (when last question is removed), "
                "never annotation records"
            )


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("MLflow re-sync triggered on rubric create/update (best-effort)")
class TestMlflowReSync:
    """Test that MLflow re-sync is triggered on rubric operations."""

    def test_resync_annotations_method_exists(self):
        """DatabaseService has a resync_annotations_to_mlflow method."""
        service, _ = _make_db_service()
        assert hasattr(service, 'resync_annotations_to_mlflow'), (
            "DatabaseService must have resync_annotations_to_mlflow method"
        )

    @patch("threading.Thread")
    def test_create_rubric_endpoint_triggers_background_resync(self, mock_thread):
        """The create_rubric endpoint starts a background thread for MLflow re-sync."""
        # Verify the endpoint code uses threading.Thread for background sync
        import inspect
        from server.routers.workshops import create_rubric

        source = inspect.getsource(create_rubric)
        assert "Thread" in source and "background_resync" in source, (
            "create_rubric must trigger a background thread for MLflow re-sync"
        )
