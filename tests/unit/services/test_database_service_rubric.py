"""Tests for rubric parsing in DatabaseService.

Specs: RUBRIC_SPEC, JUDGE_EVALUATION_SPEC
"""

import pytest

from server.services.database_service import DatabaseService


# === Per-Question Judge Type Parsing Tests (RUBRIC_SPEC lines 71-91) ===


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Per-question judge_type parsed from `[JUDGE_TYPE:xxx]` format")
def test_parse_rubric_questions_with_judge_type_binary():
    """Parses [JUDGE_TYPE:binary] delimiter format (older format).

    Spec: RUBRIC_SPEC lines 71-91
    - Per-question judge_type can be specified using delimiter
    """
    db_service = DatabaseService(None)

    # Using the |||JUDGE_TYPE||| delimiter format
    raw = "Accuracy: Is the response correct?|||JUDGE_TYPE|||binary"
    questions = db_service._parse_rubric_questions(raw)

    assert len(questions) == 1
    assert questions[0]['title'] == 'Accuracy'
    assert questions[0]['description'] == 'Is the response correct?'
    assert questions[0]['judge_type'] == 'binary'


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Per-question judge_type parsed from `[JUDGE_TYPE:xxx]` format")
def test_parse_rubric_questions_with_judge_type_likert():
    """Parses [JUDGE_TYPE:likert] explicitly.

    Spec: RUBRIC_SPEC lines 71-91
    """
    db_service = DatabaseService(None)

    raw = "Quality: Rate the response 1-5|||JUDGE_TYPE|||likert"
    questions = db_service._parse_rubric_questions(raw)

    assert len(questions) == 1
    assert questions[0]['title'] == 'Quality'
    assert questions[0]['judge_type'] == 'likert'


@pytest.mark.spec("RUBRIC_SPEC")
def test_parse_rubric_questions_default_to_likert():
    """Defaults to 'likert' when no judge type specified.

    Spec: RUBRIC_SPEC lines 86-89
    - Default to 'likert' if not specified
    """
    db_service = DatabaseService(None)

    # No judge type delimiter
    raw = "Clarity: Is the response clear?"
    questions = db_service._parse_rubric_questions(raw)

    assert len(questions) == 1
    assert questions[0]['title'] == 'Clarity'
    assert questions[0]['judge_type'] == 'likert'


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Mixed rubrics support different scales per question")
def test_parse_rubric_questions_mixed_types():
    """Handles mixed rubric with different judge types per question.

    Spec: RUBRIC_SPEC lines 71-91
    - Mixed rubrics support different scales per question
    """
    db_service = DatabaseService(None)

    QUESTION_DELIMITER = '|||QUESTION_SEPARATOR|||'
    raw = (
        "Accuracy: Pass/fail check|||JUDGE_TYPE|||binary"
        + QUESTION_DELIMITER +
        "Quality: Rate 1-5|||JUDGE_TYPE|||likert"
        + QUESTION_DELIMITER +
        "Completeness: Is it complete?"  # No type = default to likert
    )
    questions = db_service._parse_rubric_questions(raw)

    assert len(questions) == 3
    assert questions[0]['title'] == 'Accuracy'
    assert questions[0]['judge_type'] == 'binary'
    assert questions[1]['title'] == 'Quality'
    assert questions[1]['judge_type'] == 'likert'
    assert questions[2]['title'] == 'Completeness'
    assert questions[2]['judge_type'] == 'likert'  # Default


@pytest.mark.spec("RUBRIC_SPEC")
def test_parse_rubric_questions_with_freeform():
    """Parses freeform judge type.

    Spec: RUBRIC_SPEC lines 71-91
    """
    db_service = DatabaseService(None)

    raw = "Feedback: Provide detailed feedback|||JUDGE_TYPE|||freeform"
    questions = db_service._parse_rubric_questions(raw)

    assert len(questions) == 1
    assert questions[0]['judge_type'] == 'freeform'


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Empty/whitespace-only parts filtered out")
def test_parse_rubric_questions_empty_input():
    """Handles empty input gracefully.

    Spec: RUBRIC_SPEC lines 299 (Success Criteria)
    - Empty/whitespace-only parts filtered out
    """
    db_service = DatabaseService(None)

    assert db_service._parse_rubric_questions(None) == []
    assert db_service._parse_rubric_questions("") == []
    assert db_service._parse_rubric_questions("   ") == []


@pytest.mark.spec("RUBRIC_SPEC")
@pytest.mark.req("Questions with multi-line descriptions parse correctly")
def test_parse_rubric_questions_multiline_description():
    """Handles multi-line descriptions correctly.

    Spec: RUBRIC_SPEC lines 315-327 (Test 2)
    """
    db_service = DatabaseService(None)

    raw = "Question 1: Line 1 of description\nLine 2 of description\n\nLine 3 after blank"
    questions = db_service._parse_rubric_questions(raw)

    assert len(questions) == 1
    assert questions[0]['title'] == 'Question 1'
    # Description should preserve newlines
    assert 'Line 1' in questions[0]['description']
    assert 'Line 2' in questions[0]['description']


# === Reconstruct Rubric Questions Tests ===


@pytest.mark.spec("RUBRIC_SPEC")
def test_reconstruct_rubric_questions_with_judge_type():
    """Reconstructs questions with judge type delimiter.

    Spec: RUBRIC_SPEC lines 159-163
    """
    db_service = DatabaseService(None)

    questions = [
        {'id': 'q_1', 'title': 'Accuracy', 'description': 'Is it correct?', 'judge_type': 'binary'},
        {'id': 'q_2', 'title': 'Quality', 'description': 'Rate quality', 'judge_type': 'likert'},
    ]

    result = db_service._reconstruct_rubric_questions(questions)

    assert '|||QUESTION_SEPARATOR|||' in result
    assert '|||JUDGE_TYPE|||binary' in result
    assert '|||JUDGE_TYPE|||likert' in result


@pytest.mark.spec("RUBRIC_SPEC")
def test_reconstruct_rubric_questions_empty():
    """Handles empty questions list.

    Spec: RUBRIC_SPEC
    """
    db_service = DatabaseService(None)

    assert db_service._reconstruct_rubric_questions([]) == ''
    assert db_service._reconstruct_rubric_questions(None) == ''


# === Round-trip Tests ===


@pytest.mark.spec("RUBRIC_SPEC")
def test_parse_reconstruct_roundtrip():
    """Parse and reconstruct should be reversible.

    Spec: RUBRIC_SPEC lines 21-35 (rubricUtils.test.ts round-trip test)
    """
    db_service = DatabaseService(None)

    original_questions = [
        {'id': 'q_1', 'title': 'Test A', 'description': 'Description A', 'judge_type': 'binary'},
        {'id': 'q_2', 'title': 'Test B', 'description': 'Description B', 'judge_type': 'likert'},
    ]

    reconstructed = db_service._reconstruct_rubric_questions(original_questions)
    parsed = db_service._parse_rubric_questions(reconstructed)

    assert len(parsed) == len(original_questions)
    for orig, parsed_q in zip(original_questions, parsed):
        assert parsed_q['title'] == orig['title']
        assert parsed_q['description'] == orig['description']
        assert parsed_q['judge_type'] == orig['judge_type']


# === Judge Type Detection Tests (JUDGE_EVALUATION_SPEC lines 38-86) ===


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_get_judge_type_from_rubric_binary(monkeypatch):
    """Binary rubric returns 'binary' judge type.

    Spec: JUDGE_EVALUATION_SPEC lines 38-86
    """
    from server.services.alignment_service import get_judge_type_from_rubric

    class MockRubric:
        question = "Accuracy: Is correct?|||JUDGE_TYPE|||binary"
        judge_type = None

    class MockDbService:
        def get_rubric(self, workshop_id):
            return MockRubric()

        def _parse_rubric_questions(self, text):
            return [{'title': 'Accuracy', 'description': 'Is correct?', 'judge_type': 'binary'}]

    result = get_judge_type_from_rubric(MockDbService(), "w1")
    assert result == 'binary'


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_get_judge_type_from_rubric_likert(monkeypatch):
    """Likert rubric returns 'likert' judge type.

    Spec: JUDGE_EVALUATION_SPEC lines 38-86
    """
    from server.services.alignment_service import get_judge_type_from_rubric

    class MockRubric:
        question = "Quality: Rate 1-5|||JUDGE_TYPE|||likert"
        judge_type = None

    class MockDbService:
        def get_rubric(self, workshop_id):
            return MockRubric()

        def _parse_rubric_questions(self, text):
            return [{'title': 'Quality', 'description': 'Rate 1-5', 'judge_type': 'likert'}]

    result = get_judge_type_from_rubric(MockDbService(), "w1")
    assert result == 'likert'


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_get_judge_type_from_rubric_mixed_prefers_binary(monkeypatch):
    """Mixed rubric with binary questions returns 'binary'.

    Spec: JUDGE_EVALUATION_SPEC lines 66-72
    - If rubric has binary questions, prefer binary (most restrictive)
    """
    from server.services.alignment_service import get_judge_type_from_rubric

    class MockRubric:
        question = "mixed"
        judge_type = None

    class MockDbService:
        def get_rubric(self, workshop_id):
            return MockRubric()

        def _parse_rubric_questions(self, text):
            return [
                {'title': 'Accuracy', 'description': 'Pass/fail', 'judge_type': 'binary'},
                {'title': 'Quality', 'description': 'Rate 1-5', 'judge_type': 'likert'},
            ]

    result = get_judge_type_from_rubric(MockDbService(), "w1")
    assert result == 'binary'


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_get_judge_type_from_rubric_no_rubric_defaults_likert():
    """No rubric defaults to 'likert'.

    Spec: JUDGE_EVALUATION_SPEC
    """
    from server.services.alignment_service import get_judge_type_from_rubric

    class MockDbService:
        def get_rubric(self, workshop_id):
            return None

    result = get_judge_type_from_rubric(MockDbService(), "w1")
    assert result == 'likert'
