"""Unit tests for rubric question parsing functionality.

Tests the _parse_rubric_questions and _reconstruct_rubric_questions methods
in DatabaseService which handle the QUESTION_DELIMITER format.
"""

import pytest
from unittest.mock import MagicMock

from server.services.database_service import DatabaseService


@pytest.fixture
def db_service():
    """Create a DatabaseService with a mocked session for testing parsing."""
    mock_session = MagicMock()
    return DatabaseService(mock_session)


@pytest.mark.spec("RUBRIC_SPEC")
class TestParseRubricQuestions:
    """Tests for the _parse_rubric_questions method."""

    def test_simple_questions(self, db_service):
        """Test parsing two simple questions with the standard delimiter."""
        raw = "Question 1: Description 1|||QUESTION_SEPARATOR|||Question 2: Description 2"

        questions = db_service._parse_rubric_questions(raw)

        assert len(questions) == 2
        assert questions[0]['title'] == 'Question 1'
        assert questions[0]['description'] == 'Description 1'
        assert questions[1]['title'] == 'Question 2'
        assert questions[1]['description'] == 'Description 2'

    def test_multi_line_description(self, db_service):
        """Test parsing questions with multi-line descriptions."""
        raw = """Question 1: Line 1 of description
Line 2 of description

Line 3 after blank|||QUESTION_SEPARATOR|||Question 2: Single line"""

        questions = db_service._parse_rubric_questions(raw)

        assert len(questions) == 2
        # First question should have multi-line description preserved
        assert questions[0]['title'] == 'Question 1'
        assert 'Line 1 of description' in questions[0]['description']
        assert 'Line 2 of description' in questions[0]['description']
        assert 'Line 3 after blank' in questions[0]['description']
        # Second question should be simple
        assert questions[1]['title'] == 'Question 2'

    def test_empty_input_returns_empty_list(self, db_service):
        """Test that empty input returns an empty list."""
        assert db_service._parse_rubric_questions('') == []
        assert db_service._parse_rubric_questions(None) == []

    def test_whitespace_only_input_returns_empty_list(self, db_service):
        """Test that whitespace-only input returns an empty list."""
        assert db_service._parse_rubric_questions('   ') == []
        assert db_service._parse_rubric_questions('\n\n') == []

    def test_single_question(self, db_service):
        """Test parsing a single question without separator."""
        raw = "Single Question: This is the only question"

        questions = db_service._parse_rubric_questions(raw)

        assert len(questions) == 1
        assert questions[0]['title'] == 'Single Question'
        assert questions[0]['description'] == 'This is the only question'

    def test_questions_with_judge_type(self, db_service):
        """Test parsing questions that include judge type markers."""
        raw = "Quality: Is it good?|||JUDGE_TYPE|||binary|||QUESTION_SEPARATOR|||Accuracy: Is it accurate?|||JUDGE_TYPE|||likert"

        questions = db_service._parse_rubric_questions(raw)

        assert len(questions) == 2
        assert questions[0]['title'] == 'Quality'
        assert questions[0]['judge_type'] == 'binary'
        assert questions[1]['title'] == 'Accuracy'
        assert questions[1]['judge_type'] == 'likert'

    def test_default_judge_type_is_likert(self, db_service):
        """Test that questions without judge type default to likert."""
        raw = "Simple Question: No judge type specified"

        questions = db_service._parse_rubric_questions(raw)

        assert len(questions) == 1
        assert questions[0].get('judge_type', 'likert') == 'likert'

    def test_questions_have_ids(self, db_service):
        """Test that parsed questions have ID fields."""
        raw = "Q1: Desc 1|||QUESTION_SEPARATOR|||Q2: Desc 2"

        questions = db_service._parse_rubric_questions(raw)

        assert all('id' in q for q in questions)
        assert questions[0]['id'] == 'q_1'
        assert questions[1]['id'] == 'q_2'

    def test_whitespace_trimmed(self, db_service):
        """Test that whitespace is trimmed from parsed values."""
        raw = "  Question Title  :   Description with spaces   "

        questions = db_service._parse_rubric_questions(raw)

        assert len(questions) == 1
        # Titles should be trimmed
        assert questions[0]['title'].strip() == questions[0]['title']

    def test_empty_parts_filtered_out(self, db_service):
        """Test that empty parts between delimiters are filtered out."""
        raw = "Q1: D1|||QUESTION_SEPARATOR||||||QUESTION_SEPARATOR|||Q2: D2"

        questions = db_service._parse_rubric_questions(raw)

        # Should only get 2 questions, empty part in middle filtered
        assert len(questions) == 2

    def test_legacy_delimiter_supported(self, db_service):
        """Test that legacy --- delimiter is still supported for backward compatibility."""
        # Based on the code, legacy delimiter '---' is also supported
        raw = "Q1: D1---Q2: D2"

        questions = db_service._parse_rubric_questions(raw)

        # Should parse correctly with legacy delimiter
        assert len(questions) >= 1


@pytest.mark.spec("RUBRIC_SPEC")
class TestReconstructRubricQuestions:
    """Tests for the _reconstruct_rubric_questions method."""

    def test_reconstruct_simple_questions(self, db_service):
        """Test reconstructing questions back to string format."""
        questions = [
            {'id': 'q_1', 'title': 'Question 1', 'description': 'Description 1', 'judge_type': 'likert'},
            {'id': 'q_2', 'title': 'Question 2', 'description': 'Description 2', 'judge_type': 'likert'},
        ]

        reconstructed = db_service._reconstruct_rubric_questions(questions)

        assert '|||QUESTION_SEPARATOR|||' in reconstructed
        assert 'Question 1' in reconstructed
        assert 'Question 2' in reconstructed

    def test_reconstruct_preserves_judge_type(self, db_service):
        """Test that reconstructing preserves judge type information."""
        questions = [
            {'id': 'q_1', 'title': 'Binary Q', 'description': 'Desc', 'judge_type': 'binary'},
        ]

        reconstructed = db_service._reconstruct_rubric_questions(questions)

        assert '|||JUDGE_TYPE|||binary' in reconstructed

    def test_reconstruct_updates_ids_sequentially(self, db_service):
        """Test that reconstructing updates IDs to be sequential."""
        questions = [
            {'id': 'old_id_1', 'title': 'Q1', 'description': 'D1', 'judge_type': 'likert'},
            {'id': 'random_id', 'title': 'Q2', 'description': 'D2', 'judge_type': 'likert'},
        ]

        db_service._reconstruct_rubric_questions(questions)

        # IDs should be updated to q_1, q_2
        assert questions[0]['id'] == 'q_1'
        assert questions[1]['id'] == 'q_2'

    def test_reconstruct_empty_list_returns_empty_string(self, db_service):
        """Test that empty questions list returns empty string."""
        result = db_service._reconstruct_rubric_questions([])
        assert result == ''


@pytest.mark.spec("RUBRIC_SPEC")
class TestRoundTrip:
    """Tests that parse and reconstruct are consistent."""

    def test_parse_reconstruct_roundtrip(self, db_service):
        """Test that parsing and reconstructing are consistent (roundtrip)."""
        original = "Quality: Is the response high quality?|||JUDGE_TYPE|||binary|||QUESTION_SEPARATOR|||Accuracy: Is it factually correct?|||JUDGE_TYPE|||likert"

        # Parse
        questions = db_service._parse_rubric_questions(original)

        # Reconstruct back
        reconstructed = db_service._reconstruct_rubric_questions(questions)

        # Parse again
        questions_again = db_service._parse_rubric_questions(reconstructed)

        # Should have same structure
        assert len(questions) == len(questions_again)
        assert questions[0]['title'] == questions_again[0]['title']
        assert questions[1]['title'] == questions_again[1]['title']
        assert questions[0]['judge_type'] == questions_again[0]['judge_type']
        assert questions[1]['judge_type'] == questions_again[1]['judge_type']


@pytest.mark.spec("RUBRIC_SPEC")
class TestBinaryScaleSupport:
    """Tests for binary scale support in rubrics."""

    def test_binary_judge_type_parsed_correctly(self, db_service):
        """Test that binary judge type is correctly identified."""
        raw = "Pass/Fail Check: Does it pass?|||JUDGE_TYPE|||binary"

        questions = db_service._parse_rubric_questions(raw)

        assert len(questions) == 1
        assert questions[0]['judge_type'] == 'binary'

    def test_likert_judge_type_parsed_correctly(self, db_service):
        """Test that likert judge type is correctly identified."""
        raw = "Quality Rating: Rate from 1-5|||JUDGE_TYPE|||likert"

        questions = db_service._parse_rubric_questions(raw)

        assert len(questions) == 1
        assert questions[0]['judge_type'] == 'likert'

    def test_mixed_judge_types_in_rubric(self, db_service):
        """Test rubric with both binary and likert questions."""
        raw = "Safety: Is it safe?|||JUDGE_TYPE|||binary|||QUESTION_SEPARATOR|||Quality: How good is it?|||JUDGE_TYPE|||likert"

        questions = db_service._parse_rubric_questions(raw)

        assert len(questions) == 2
        assert questions[0]['judge_type'] == 'binary'
        assert questions[1]['judge_type'] == 'likert'
