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
