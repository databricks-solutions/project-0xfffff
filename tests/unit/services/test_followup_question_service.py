"""Tests for FollowUpQuestionService.

Covers question generation, progressive context, retry/fallback behavior.
"""

from unittest.mock import MagicMock, patch

import pytest

from server.services.followup_question_service import (
    FALLBACK_QUESTIONS,
    FOLLOWUP_SYSTEM_PROMPT,
    FollowUpQuestionService,
    MAX_RETRIES,
)


def _make_trace(input_text="Hello", output_text="Hi there"):
    mock = MagicMock()
    mock.input = input_text
    mock.output = output_text
    return mock


def _make_feedback(label="good", comment="Great answer", qna=None):
    mock = MagicMock()
    mock.feedback_label = label
    mock.comment = comment
    mock.followup_qna = qna or []
    return mock


# ============================================================================
# Basic generation
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("AI generates 3 follow-up questions per trace based on feedback")
@pytest.mark.unit
def test_generate_returns_fallback_when_no_llm_config():
    """Generate returns fallback questions when no LLM config is provided."""
    svc = FollowUpQuestionService()
    trace = _make_trace()
    feedback = _make_feedback()

    q1, is_fb1 = svc.generate(trace, feedback, 1)
    assert q1 == FALLBACK_QUESTIONS[0]
    assert is_fb1 is True

    q2, is_fb2 = svc.generate(trace, feedback, 2)
    assert q2 == FALLBACK_QUESTIONS[1]
    assert is_fb2 is True

    q3, is_fb3 = svc.generate(trace, feedback, 3)
    assert q3 == FALLBACK_QUESTIONS[2]
    assert is_fb3 is True


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("All 3 questions required before moving to next trace")
@pytest.mark.unit
def test_generate_rejects_invalid_question_number():
    """Reject question numbers outside 1-3 range."""
    svc = FollowUpQuestionService()
    trace = _make_trace()
    feedback = _make_feedback()

    with pytest.raises(ValueError, match="question_number must be 1-3"):
        svc.generate(trace, feedback, 0)

    with pytest.raises(ValueError, match="question_number must be 1-3"):
        svc.generate(trace, feedback, 4)


# ============================================================================
# Progressive context
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Questions build progressively on prior answers")
@pytest.mark.unit
def test_build_user_prompt_includes_prior_qna():
    """User prompt includes prior Q&A for progressive questioning."""
    svc = FollowUpQuestionService()
    trace = _make_trace(input_text="What is 2+2?", output_text="4")
    feedback = _make_feedback(
        label="bad",
        comment="Too terse",
        qna=[
            {"question": "What was missing?", "answer": "An explanation of the math"},
        ],
    )

    prompt = svc._build_user_prompt(trace, feedback)

    assert "What is 2+2?" in prompt
    assert "4" in prompt
    assert "bad" in prompt
    assert "Too terse" in prompt
    assert "Q1: What was missing?" in prompt
    assert "A1: An explanation of the math" in prompt


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Questions build progressively on prior answers")
@pytest.mark.unit
def test_build_user_prompt_empty_qna():
    """User prompt shows '(none yet)' when no prior Q&A exists."""
    svc = FollowUpQuestionService()
    trace = _make_trace()
    feedback = _make_feedback(qna=[])

    prompt = svc._build_user_prompt(trace, feedback)
    assert "(none yet)" in prompt


# ============================================================================
# Retry and fallback
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Error handling with retry for LLM failures")
@pytest.mark.unit
def test_generate_retries_then_falls_back():
    """Generate retries on failure then falls back to fallback question."""
    svc = FollowUpQuestionService()
    trace = _make_trace()
    feedback = _make_feedback()

    with patch.object(svc, "_call_llm", side_effect=Exception("LLM down")):
        question, is_fallback = svc.generate(
            trace, feedback, 1,
            workspace_url="https://example.com",
            databricks_token="token",
            model_name="test-model",
        )

    assert question == FALLBACK_QUESTIONS[0]
    assert is_fallback is True


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Fallback question if LLM unavailable after retries")
@pytest.mark.unit
def test_generate_fallback_after_retries():
    """Fallback question returned after all retries exhausted."""
    svc = FollowUpQuestionService()
    trace = _make_trace()
    feedback = _make_feedback()

    call_count = 0

    def failing_llm(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        raise RuntimeError("Service unavailable")

    with patch.object(svc, "_call_llm", side_effect=failing_llm):
        question, is_fallback = svc.generate(
            trace, feedback, 2,
            workspace_url="https://example.com",
            databricks_token="token",
            model_name="test-model",
        )

    assert call_count == MAX_RETRIES
    assert question == FALLBACK_QUESTIONS[1]
    assert is_fallback is True


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Error handling with retry for LLM failures")
@pytest.mark.unit
def test_generate_succeeds_on_second_retry():
    """Generate succeeds after transient LLM failure."""
    svc = FollowUpQuestionService()
    trace = _make_trace()
    feedback = _make_feedback()

    call_count = 0

    def eventually_succeeds(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            raise RuntimeError("Transient error")
        return "What specifically about the tone bothered you?"

    with patch.object(svc, "_call_llm", side_effect=eventually_succeeds):
        question, is_fallback = svc.generate(
            trace, feedback, 1,
            workspace_url="https://example.com",
            databricks_token="token",
            model_name="test-model",
        )

    assert question == "What specifically about the tone bothered you?"
    assert is_fallback is False
    assert call_count == 2


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Fallback question if LLM unavailable after retries")
@pytest.mark.unit
def test_generate_returns_demo_fallback():
    """Demo model returns fallback questions directly."""
    svc = FollowUpQuestionService()
    trace = _make_trace()
    feedback = _make_feedback()

    # model_name="demo" should skip LLM entirely
    question, is_fallback = svc.generate(
        trace, feedback, 3,
        workspace_url="https://example.com",
        databricks_token="token",
        model_name="demo",
    )

    assert question == FALLBACK_QUESTIONS[2]
    assert is_fallback is True


# ============================================================================
# Custom LLM params
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("AI generates 3 follow-up questions per trace based on feedback")
@pytest.mark.unit
def test_generate_uses_custom_llm_when_custom_params_provided():
    """generate() passes custom_base_url/model_name/api_key through to _call_llm."""
    svc = FollowUpQuestionService()
    trace = _make_trace()
    feedback = _make_feedback()

    with patch.object(svc, "_call_llm", return_value="What about edge cases?") as mock_call:
        question, is_fallback = svc.generate(
            trace, feedback, 1,
            custom_base_url="https://custom.example.com",
            custom_model_name="custom-model-v1",
            custom_api_key="custom-key-abc",
        )

    assert question == "What about edge cases?"
    assert is_fallback is False
    mock_call.assert_called_once()

    call_kwargs = mock_call.call_args[1]
    assert call_kwargs["custom_base_url"] == "https://custom.example.com"
    assert call_kwargs["custom_model_name"] == "custom-model-v1"
    assert call_kwargs["custom_api_key"] == "custom-key-abc"


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Fallback question if LLM unavailable after retries")
@pytest.mark.unit
def test_generate_falls_back_when_custom_llm_fails():
    """generate() returns fallback when custom LLM fails all retries."""
    svc = FollowUpQuestionService()
    trace = _make_trace()
    feedback = _make_feedback()

    with patch.object(svc, "_call_llm", side_effect=Exception("custom LLM error")):
        question, is_fallback = svc.generate(
            trace, feedback, 2,
            custom_base_url="https://custom.example.com",
            custom_model_name="custom-model-v1",
            custom_api_key="custom-key-abc",
        )

    assert question == FALLBACK_QUESTIONS[1]
    assert is_fallback is True


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Fallback question if LLM unavailable after retries")
@pytest.mark.unit
def test_generate_returns_fallback_when_no_config():
    """generate() returns fallback immediately when neither Databricks nor custom params given."""
    svc = FollowUpQuestionService()
    trace = _make_trace()
    feedback = _make_feedback()

    # No workspace_url, no databricks_token, no model_name, no custom params
    q1, is_fb1 = svc.generate(trace, feedback, 1)
    assert q1 == FALLBACK_QUESTIONS[0]
    assert is_fb1 is True

    q2, is_fb2 = svc.generate(trace, feedback, 2)
    assert q2 == FALLBACK_QUESTIONS[1]
    assert is_fb2 is True

    q3, is_fb3 = svc.generate(trace, feedback, 3)
    assert q3 == FALLBACK_QUESTIONS[2]
    assert is_fb3 is True
