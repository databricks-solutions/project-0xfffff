"""Tests for DiscoveryAnalysisService.

Covers feedback aggregation, deterministic disagreement detection,
LLM distillation, full pipeline, and history preservation per
DISCOVERY_SPEC Step 2.
"""

import json
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from server.models import (
    AnalysisTemplate,
    DiscoveryFeedback,
    DistillationOutput,
    FeedbackLabel,
    Finding,
    DisagreementAnalysis,
)
from server.services.discovery_analysis_service import (
    DiscoveryAnalysisService,
    EVALUATION_CRITERIA_PROMPT,
    THEMES_PATTERNS_PROMPT,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_feedback(trace_id, user_id, label, comment, qna=None):
    """Create a DiscoveryFeedback model instance."""
    return DiscoveryFeedback(
        id=f"fb-{trace_id}-{user_id}",
        workshop_id="ws-1",
        trace_id=trace_id,
        user_id=user_id,
        feedback_label=FeedbackLabel(label),
        comment=comment,
        followup_qna=qna or [],
        created_at=datetime(2025, 1, 1),
        updated_at=datetime(2025, 1, 1),
    )


def _make_trace(trace_id, input_text, output_text):
    """Create a mock trace object with id, input, output."""
    mock = MagicMock()
    mock.id = trace_id
    mock.input = input_text
    mock.output = output_text
    return mock


def _make_workshop(workshop_id="ws-1", input_jsonpath=None, output_jsonpath=None):
    """Create a mock workshop object."""
    mock = MagicMock()
    mock.id = workshop_id
    mock.input_jsonpath = input_jsonpath
    mock.output_jsonpath = output_jsonpath
    return mock


def _make_analysis_record(
    record_id="a-1",
    workshop_id="ws-1",
    template_used="evaluation_criteria",
    analysis_data="Summary text",
    findings=None,
    disagreements=None,
    participant_count=2,
    model_used="test-model",
):
    """Create a mock DiscoveryAnalysisDB record."""
    mock = MagicMock()
    mock.id = record_id
    mock.workshop_id = workshop_id
    mock.template_used = template_used
    mock.analysis_data = analysis_data
    mock.findings = findings or []
    mock.disagreements = disagreements or {"high": [], "medium": [], "lower": []}
    mock.participant_count = participant_count
    mock.model_used = model_used
    mock.created_at = datetime(2025, 1, 1, 12, 0, 0)
    mock.updated_at = datetime(2025, 1, 1, 12, 0, 0)
    return mock


def _llm_response(distillation_output: dict) -> dict:
    """Wrap a distillation dict as a chat completion response."""
    return {
        "choices": [{
            "message": {
                "content": json.dumps(distillation_output),
            }
        }]
    }


@pytest.fixture
def db_service():
    return MagicMock()


@pytest.fixture
def databricks_service():
    return MagicMock()


@pytest.fixture
def service(db_service, databricks_service):
    return DiscoveryAnalysisService(db_service, databricks_service)


# ============================================================================
# Aggregation
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("System aggregates feedback by trace")
@pytest.mark.unit
class TestAggregation:
    """Tests for aggregate_feedback method."""

    def test_groups_feedback_by_trace_id(self, service, db_service):
        """Feedback entries are grouped by their trace_id."""
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "good", "Nice"),
            _make_feedback("t-1", "u-2", "bad", "Poor"),
            _make_feedback("t-2", "u-1", "good", "Fine"),
        ]
        db_service.get_workshop.return_value = _make_workshop()
        db_service.get_traces.return_value = [
            _make_trace("t-1", "What is AI?", "AI is ..."),
            _make_trace("t-2", "What is ML?", "ML is ..."),
        ]

        result = service.aggregate_feedback("ws-1")

        assert set(result.keys()) == {"t-1", "t-2"}
        assert len(result["t-1"]["feedback_entries"]) == 2
        assert len(result["t-2"]["feedback_entries"]) == 1

    def test_includes_trace_input_output(self, service, db_service):
        """Each aggregated trace includes the trace input and output."""
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "good", "Nice"),
        ]
        db_service.get_workshop.return_value = _make_workshop()
        db_service.get_traces.return_value = [
            _make_trace("t-1", "What is AI?", "AI stands for artificial intelligence."),
        ]

        result = service.aggregate_feedback("ws-1")

        assert result["t-1"]["input"] == "What is AI?"
        assert result["t-1"]["output"] == "AI stands for artificial intelligence."

    def test_feedback_entry_fields(self, service, db_service):
        """Each feedback entry includes user, label, comment, and followup_qna."""
        qna = [{"question": "Why?", "answer": "Because reasons"}]
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "bad", "Not great", qna=qna),
        ]
        db_service.get_workshop.return_value = _make_workshop()
        db_service.get_traces.return_value = [
            _make_trace("t-1", "input", "output"),
        ]

        result = service.aggregate_feedback("ws-1")

        entry = result["t-1"]["feedback_entries"][0]
        assert entry["user"] == "u-1"
        assert entry["label"] == "bad"
        assert entry["comment"] == "Not great"
        assert entry["followup_qna"] == qna

    def test_returns_empty_dict_when_no_feedback(self, service, db_service):
        """Returns empty dict when no feedback exists."""
        db_service.get_discovery_feedback.return_value = []

        result = service.aggregate_feedback("ws-1")

        assert result == {}


# ============================================================================
# Disagreement Detection
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Disagreements detected at 3 priority levels (deterministic, no LLM)")
@pytest.mark.unit
class TestDisagreementDetection:
    """Tests for detect_disagreements method - deterministic, no LLM."""

    def test_high_priority_good_vs_bad(self, service):
        """GOOD vs BAD labels on the same trace yield HIGH priority."""
        aggregated = {
            "t-1": {
                "input": "x", "output": "y",
                "feedback_entries": [
                    {"user": "u-1", "label": "good", "comment": "a"},
                    {"user": "u-2", "label": "bad", "comment": "b"},
                ],
            },
        }

        result = service.detect_disagreements(aggregated)

        assert result["high"] == ["t-1"]
        assert result["medium"] == []
        assert result["lower"] == []

    def test_medium_priority_all_bad(self, service):
        """All BAD labels on the same trace yield MEDIUM priority."""
        aggregated = {
            "t-1": {
                "input": "x", "output": "y",
                "feedback_entries": [
                    {"user": "u-1", "label": "bad", "comment": "Issue A"},
                    {"user": "u-2", "label": "bad", "comment": "Issue B"},
                ],
            },
        }

        result = service.detect_disagreements(aggregated)

        assert result["high"] == []
        assert result["medium"] == ["t-1"]
        assert result["lower"] == []

    def test_lower_priority_all_good(self, service):
        """All GOOD labels on the same trace yield LOWER priority."""
        aggregated = {
            "t-1": {
                "input": "x", "output": "y",
                "feedback_entries": [
                    {"user": "u-1", "label": "good", "comment": "Strength A"},
                    {"user": "u-2", "label": "good", "comment": "Strength B"},
                ],
            },
        }

        result = service.detect_disagreements(aggregated)

        assert result["high"] == []
        assert result["medium"] == []
        assert result["lower"] == ["t-1"]

    def test_single_reviewer_skipped(self, service):
        """Traces with only one reviewer are not classified as disagreements."""
        aggregated = {
            "t-solo": {
                "input": "x", "output": "y",
                "feedback_entries": [
                    {"user": "u-1", "label": "good", "comment": "Solo review"},
                ],
            },
        }

        result = service.detect_disagreements(aggregated)

        assert result["high"] == []
        assert result["medium"] == []
        assert result["lower"] == []

    def test_multiple_traces_classified_correctly(self, service):
        """Multiple traces each classified into the correct tier."""
        aggregated = {
            "t-high": {
                "input": "a", "output": "b",
                "feedback_entries": [
                    {"user": "u-1", "label": "good", "comment": "x"},
                    {"user": "u-2", "label": "bad", "comment": "y"},
                ],
            },
            "t-med": {
                "input": "c", "output": "d",
                "feedback_entries": [
                    {"user": "u-1", "label": "bad", "comment": "x"},
                    {"user": "u-2", "label": "bad", "comment": "y"},
                ],
            },
            "t-low": {
                "input": "e", "output": "f",
                "feedback_entries": [
                    {"user": "u-1", "label": "good", "comment": "x"},
                    {"user": "u-2", "label": "good", "comment": "y"},
                ],
            },
            "t-solo": {
                "input": "g", "output": "h",
                "feedback_entries": [
                    {"user": "u-1", "label": "good", "comment": "z"},
                ],
            },
        }

        result = service.detect_disagreements(aggregated)

        assert result["high"] == ["t-high"]
        assert result["medium"] == ["t-med"]
        assert result["lower"] == ["t-low"]

    def test_case_insensitive_labels(self, service):
        """Labels are compared case-insensitively."""
        aggregated = {
            "t-1": {
                "input": "x", "output": "y",
                "feedback_entries": [
                    {"user": "u-1", "label": "GOOD", "comment": "a"},
                    {"user": "u-2", "label": "BAD", "comment": "b"},
                ],
            },
        }

        result = service.detect_disagreements(aggregated)

        assert result["high"] == ["t-1"]


# ============================================================================
# LLM Distillation
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("LLM distills evaluation criteria with evidence from trace IDs")
@pytest.mark.unit
class TestDistillation:
    """Tests for the distill method - LLM call and response parsing."""

    def test_distill_parses_json_response(self, service, databricks_service):
        """distill() parses a valid JSON LLM response into DistillationOutput."""
        distillation_data = {
            "findings": [
                {
                    "text": "Response accuracy is critical",
                    "evidence_trace_ids": ["t-1", "t-2"],
                    "priority": "high",
                },
            ],
            "high_priority_disagreements": [
                {
                    "trace_id": "t-1",
                    "summary": "Rating split on accuracy",
                    "underlying_theme": "Factual correctness",
                    "followup_questions": ["What counts as accurate?"],
                    "facilitator_suggestions": ["Define accuracy standards"],
                },
            ],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "Key criteria around accuracy and tone.",
        }

        databricks_service.call_chat_completion.return_value = _llm_response(distillation_data)

        aggregated = {
            "t-1": {
                "input": "Q", "output": "A",
                "feedback_entries": [
                    {"user": "u-1", "label": "good", "comment": "Accurate"},
                    {"user": "u-2", "label": "bad", "comment": "Inaccurate"},
                ],
            },
        }
        disagreements = {"high": ["t-1"], "medium": [], "lower": []}

        result = service.distill("evaluation_criteria", aggregated, disagreements, "test-model")

        assert isinstance(result, DistillationOutput)
        assert len(result.findings) == 1
        assert result.findings[0].text == "Response accuracy is critical"
        assert result.findings[0].evidence_trace_ids == ["t-1", "t-2"]
        assert result.findings[0].priority == "high"
        assert len(result.high_priority_disagreements) == 1
        assert result.high_priority_disagreements[0].trace_id == "t-1"
        assert result.high_priority_disagreements[0].followup_questions == ["What counts as accurate?"]
        assert result.high_priority_disagreements[0].facilitator_suggestions == ["Define accuracy standards"]
        assert result.summary == "Key criteria around accuracy and tone."

    def test_distill_uses_correct_template_prompt(self, service, databricks_service):
        """distill() uses the evaluation_criteria prompt for that template."""
        databricks_service.call_chat_completion.return_value = _llm_response({
            "findings": [],
            "high_priority_disagreements": [],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "No findings.",
        })

        service.distill("evaluation_criteria", {}, {"high": [], "medium": [], "lower": []}, "m")

        call_args = databricks_service.call_chat_completion.call_args
        user_message = call_args[1]["messages"][1]["content"]
        assert "Distill specific, actionable evaluation criteria" in user_message

    def test_distill_uses_themes_patterns_template(self, service, databricks_service):
        """distill() uses the themes_patterns prompt when specified."""
        databricks_service.call_chat_completion.return_value = _llm_response({
            "findings": [],
            "high_priority_disagreements": [],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "No themes.",
        })

        service.distill("themes_patterns", {}, {"high": [], "medium": [], "lower": []}, "m")

        call_args = databricks_service.call_chat_completion.call_args
        user_message = call_args[1]["messages"][1]["content"]
        assert "Identify emergent themes, recurring patterns" in user_message

    def test_distill_handles_json_in_markdown_code_block(self, service, databricks_service):
        """distill() can parse JSON wrapped in markdown code blocks."""
        markdown_response = '```json\n{"findings": [], "high_priority_disagreements": [], "medium_priority_disagreements": [], "lower_priority_disagreements": [], "summary": "From code block"}\n```'
        databricks_service.call_chat_completion.return_value = {
            "choices": [{"message": {"content": markdown_response}}],
        }

        result = service.distill("evaluation_criteria", {}, {"high": [], "medium": [], "lower": []}, "m")

        assert result.summary == "From code block"

    def test_distill_raises_on_empty_response(self, service, databricks_service):
        """distill() raises when LLM returns empty content."""
        databricks_service.call_chat_completion.return_value = {
            "choices": [{"message": {"content": ""}}],
        }

        with pytest.raises(Exception, match="Empty response"):
            service.distill("evaluation_criteria", {}, {"high": [], "medium": [], "lower": []}, "m")

    def test_distill_raises_on_llm_failure(self, service, databricks_service):
        """distill() raises when LLM call fails."""
        databricks_service.call_chat_completion.side_effect = Exception("Connection error")

        with pytest.raises(Exception, match="LLM call failed"):
            service.distill("evaluation_criteria", {}, {"high": [], "medium": [], "lower": []}, "m")


# ============================================================================
# Disagreement Analysis in LLM Output
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("LLM analyzes disagreements with follow-up questions and suggestions")
@pytest.mark.unit
class TestDisagreementAnalysisInLLM:
    """Tests that LLM output includes structured disagreement analysis
    with follow-up questions and facilitator suggestions."""

    def test_disagreement_analysis_has_followup_questions(self, service, databricks_service):
        """LLM disagreement analysis includes follow-up questions."""
        distillation_data = {
            "findings": [],
            "high_priority_disagreements": [
                {
                    "trace_id": "t-1",
                    "summary": "One says accurate, one says wrong",
                    "underlying_theme": "Factual correctness",
                    "followup_questions": [
                        "What specific facts were contested?",
                        "Can you cite sources for the correct answer?",
                    ],
                    "facilitator_suggestions": ["Have both reviewers compare evidence"],
                },
            ],
            "medium_priority_disagreements": [
                {
                    "trace_id": "t-2",
                    "summary": "Both bad but different reasons",
                    "underlying_theme": "Response quality",
                    "followup_questions": ["Which issue is more impactful?"],
                    "facilitator_suggestions": ["Prioritize by user impact"],
                },
            ],
            "lower_priority_disagreements": [],
            "summary": "Disagreements analyzed.",
        }
        databricks_service.call_chat_completion.return_value = _llm_response(distillation_data)

        result = service.distill("evaluation_criteria", {}, {"high": ["t-1"], "medium": ["t-2"], "lower": []}, "m")

        high = result.high_priority_disagreements[0]
        assert high.followup_questions == [
            "What specific facts were contested?",
            "Can you cite sources for the correct answer?",
        ]
        assert high.facilitator_suggestions == ["Have both reviewers compare evidence"]

        medium = result.medium_priority_disagreements[0]
        assert medium.followup_questions == ["Which issue is more impactful?"]
        assert medium.facilitator_suggestions == ["Prioritize by user impact"]

    def test_disagreement_analysis_has_suggestions(self, service, databricks_service):
        """LLM disagreement analysis includes facilitator suggestions."""
        distillation_data = {
            "findings": [],
            "high_priority_disagreements": [
                {
                    "trace_id": "t-1",
                    "summary": "Split rating",
                    "underlying_theme": "Tone assessment",
                    "followup_questions": ["Is tone subjective here?"],
                    "facilitator_suggestions": [
                        "Create tone rubric with examples",
                        "Discuss as a group",
                    ],
                },
            ],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "Suggestions provided.",
        }
        databricks_service.call_chat_completion.return_value = _llm_response(distillation_data)

        result = service.distill("evaluation_criteria", {}, {"high": ["t-1"], "medium": [], "lower": []}, "m")

        assert result.high_priority_disagreements[0].facilitator_suggestions == [
            "Create tone rubric with examples",
            "Discuss as a group",
        ]


# ============================================================================
# Full Pipeline (run_analysis)
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Analysis record stores which template was used")
@pytest.mark.unit
class TestRunAnalysisTemplateStorage:
    """Tests that run_analysis stores the template used."""

    def test_stores_template_in_record(self, service, db_service, databricks_service):
        """run_analysis passes the template to save_discovery_analysis."""
        # Setup aggregation
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "good", "Nice"),
            _make_feedback("t-1", "u-2", "bad", "Poor"),
        ]
        db_service.get_workshop.return_value = _make_workshop()
        db_service.get_traces.return_value = [
            _make_trace("t-1", "Q", "A"),
        ]

        # Setup LLM response
        databricks_service.call_chat_completion.return_value = _llm_response({
            "findings": [{"text": "Criterion A", "evidence_trace_ids": ["t-1"], "priority": "high"}],
            "high_priority_disagreements": [],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "Analysis complete.",
        })

        # Setup save to return a mock record
        saved_record = _make_analysis_record(
            template_used="evaluation_criteria",
            analysis_data="Analysis complete.",
        )
        db_service.save_discovery_analysis.return_value = saved_record

        result = service.run_analysis("ws-1", "evaluation_criteria", "test-model")

        # Verify template was passed to save
        save_call = db_service.save_discovery_analysis.call_args
        assert save_call[1]["template_used"] == "evaluation_criteria"
        assert result["template_used"] == "evaluation_criteria"

    def test_stores_themes_patterns_template(self, service, db_service, databricks_service):
        """run_analysis correctly stores themes_patterns template."""
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "good", "Nice"),
        ]
        db_service.get_workshop.return_value = _make_workshop()
        db_service.get_traces.return_value = [
            _make_trace("t-1", "Q", "A"),
        ]
        databricks_service.call_chat_completion.return_value = _llm_response({
            "findings": [],
            "high_priority_disagreements": [],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "Themes analysis.",
        })
        saved_record = _make_analysis_record(template_used="themes_patterns")
        db_service.save_discovery_analysis.return_value = saved_record

        service.run_analysis("ws-1", "themes_patterns", "test-model")

        save_call = db_service.save_discovery_analysis.call_args
        assert save_call[1]["template_used"] == "themes_patterns"


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Each analysis run creates a new record (history preserved)")
@pytest.mark.unit
class TestRunAnalysisNewRecord:
    """Tests that each run_analysis call creates a new record via save_discovery_analysis."""

    def test_each_run_calls_save(self, service, db_service, databricks_service):
        """Each run_analysis invocation calls save_discovery_analysis (creating a new record)."""
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "good", "Nice"),
        ]
        db_service.get_workshop.return_value = _make_workshop()
        db_service.get_traces.return_value = [
            _make_trace("t-1", "Q", "A"),
        ]
        databricks_service.call_chat_completion.return_value = _llm_response({
            "findings": [],
            "high_priority_disagreements": [],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "Summary.",
        })

        # First run
        db_service.save_discovery_analysis.return_value = _make_analysis_record(record_id="a-1")
        result1 = service.run_analysis("ws-1", "evaluation_criteria", "test-model")

        # Second run
        db_service.save_discovery_analysis.return_value = _make_analysis_record(record_id="a-2")
        result2 = service.run_analysis("ws-1", "evaluation_criteria", "test-model")

        assert db_service.save_discovery_analysis.call_count == 2
        assert result1["id"] == "a-1"
        assert result2["id"] == "a-2"


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Re-runnable \u2014 new analysis as more feedback comes in, prior analyses retained")
@pytest.mark.unit
class TestRerunnable:
    """Tests that analysis is re-runnable and prior analyses are retained."""

    def test_rerun_with_more_feedback_creates_new_record(self, service, db_service, databricks_service):
        """Re-running analysis after more feedback arrives creates a new record
        (old one untouched)."""
        db_service.get_workshop.return_value = _make_workshop()
        db_service.get_traces.return_value = [
            _make_trace("t-1", "Q", "A"),
        ]
        databricks_service.call_chat_completion.return_value = _llm_response({
            "findings": [{"text": "Criterion", "evidence_trace_ids": ["t-1"], "priority": "medium"}],
            "high_priority_disagreements": [],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "First run summary.",
        })

        # First run with 1 feedback
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "good", "Nice"),
        ]
        db_service.save_discovery_analysis.return_value = _make_analysis_record(
            record_id="a-first", participant_count=1
        )
        result1 = service.run_analysis("ws-1", "evaluation_criteria", "test-model")

        # Second run with 2 feedbacks (more feedback came in)
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "good", "Nice"),
            _make_feedback("t-1", "u-2", "bad", "Poor"),
        ]
        db_service.save_discovery_analysis.return_value = _make_analysis_record(
            record_id="a-second", participant_count=2
        )
        result2 = service.run_analysis("ws-1", "evaluation_criteria", "test-model")

        # Both records created (not updated)
        assert db_service.save_discovery_analysis.call_count == 2
        assert result1["id"] == "a-first"
        assert result2["id"] == "a-second"

        # Second run has more participants
        second_save_call = db_service.save_discovery_analysis.call_args_list[1]
        assert second_save_call[1]["participant_count"] == 2


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Multiple analysis records per workshop allowed (history preserved)")
@pytest.mark.unit
class TestMultipleAnalysesPerWorkshop:
    """Tests that multiple analyses per workshop are stored as separate records."""

    def test_different_templates_create_separate_records(self, service, db_service, databricks_service):
        """Running analysis with different templates creates separate records."""
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "good", "Nice"),
            _make_feedback("t-1", "u-2", "bad", "Poor"),
        ]
        db_service.get_workshop.return_value = _make_workshop()
        db_service.get_traces.return_value = [
            _make_trace("t-1", "Q", "A"),
        ]
        databricks_service.call_chat_completion.return_value = _llm_response({
            "findings": [],
            "high_priority_disagreements": [],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "Summary.",
        })

        # Run with evaluation_criteria template
        db_service.save_discovery_analysis.return_value = _make_analysis_record(
            record_id="a-eval", template_used="evaluation_criteria"
        )
        service.run_analysis("ws-1", "evaluation_criteria", "test-model")

        # Run with themes_patterns template
        db_service.save_discovery_analysis.return_value = _make_analysis_record(
            record_id="a-theme", template_used="themes_patterns"
        )
        service.run_analysis("ws-1", "themes_patterns", "test-model")

        assert db_service.save_discovery_analysis.call_count == 2

        first_call = db_service.save_discovery_analysis.call_args_list[0]
        second_call = db_service.save_discovery_analysis.call_args_list[1]
        assert first_call[1]["template_used"] == "evaluation_criteria"
        assert second_call[1]["template_used"] == "themes_patterns"

    def test_same_template_twice_creates_two_records(self, service, db_service, databricks_service):
        """Running the same template twice on the same workshop creates two records."""
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "good", "Nice"),
        ]
        db_service.get_workshop.return_value = _make_workshop()
        db_service.get_traces.return_value = [
            _make_trace("t-1", "Q", "A"),
        ]
        databricks_service.call_chat_completion.return_value = _llm_response({
            "findings": [],
            "high_priority_disagreements": [],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "Summary.",
        })

        db_service.save_discovery_analysis.return_value = _make_analysis_record(record_id="a-1")
        service.run_analysis("ws-1", "evaluation_criteria", "test-model")

        db_service.save_discovery_analysis.return_value = _make_analysis_record(record_id="a-2")
        service.run_analysis("ws-1", "evaluation_criteria", "test-model")

        assert db_service.save_discovery_analysis.call_count == 2


# ============================================================================
# Full pipeline correctness
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("System aggregates feedback by trace")
@pytest.mark.unit
class TestRunAnalysisPipeline:
    """Tests the full run_analysis pipeline: aggregate -> detect -> distill -> store."""

    def test_run_analysis_full_flow(self, service, db_service, databricks_service):
        """Full pipeline: aggregates, detects disagreements, calls LLM, saves record."""
        # Two users with opposing labels on t-1
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "good", "Accurate answer"),
            _make_feedback("t-1", "u-2", "bad", "Inaccurate answer"),
            _make_feedback("t-2", "u-1", "good", "Good tone"),
        ]
        db_service.get_workshop.return_value = _make_workshop()
        db_service.get_traces.return_value = [
            _make_trace("t-1", "Q1", "A1"),
            _make_trace("t-2", "Q2", "A2"),
        ]

        distillation_data = {
            "findings": [
                {"text": "Accuracy matters", "evidence_trace_ids": ["t-1"], "priority": "high"},
                {"text": "Tone is appreciated", "evidence_trace_ids": ["t-2"], "priority": "low"},
            ],
            "high_priority_disagreements": [
                {
                    "trace_id": "t-1",
                    "summary": "Accuracy dispute",
                    "underlying_theme": "Factual correctness",
                    "followup_questions": ["What standard?"],
                    "facilitator_suggestions": ["Define accuracy"],
                },
            ],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "Accuracy is the top concern.",
        }
        databricks_service.call_chat_completion.return_value = _llm_response(distillation_data)

        saved_record = _make_analysis_record(
            record_id="a-full",
            findings=[
                {"text": "Accuracy matters", "evidence_trace_ids": ["t-1"], "priority": "high"},
                {"text": "Tone is appreciated", "evidence_trace_ids": ["t-2"], "priority": "low"},
            ],
            disagreements={
                "high": [{"trace_id": "t-1", "summary": "Accuracy dispute"}],
                "medium": [],
                "lower": [],
            },
            participant_count=2,
        )
        db_service.save_discovery_analysis.return_value = saved_record

        result = service.run_analysis("ws-1", "evaluation_criteria", "test-model")

        # Verify save was called with correct data
        save_call = db_service.save_discovery_analysis.call_args[1]
        assert save_call["workshop_id"] == "ws-1"
        assert save_call["template_used"] == "evaluation_criteria"
        assert save_call["participant_count"] == 2
        assert save_call["model_used"] == "test-model"
        assert len(save_call["findings"]) == 2
        assert save_call["findings"][0]["text"] == "Accuracy matters"

        # Verify returned dict
        assert result["id"] == "a-full"
        assert result["workshop_id"] == "ws-1"

    def test_run_analysis_raises_when_no_feedback(self, service, db_service):
        """run_analysis raises ValueError when no feedback exists."""
        db_service.get_discovery_feedback.return_value = []

        with pytest.raises(ValueError, match="No discovery feedback"):
            service.run_analysis("ws-1", "evaluation_criteria", "test-model")

    def test_run_analysis_counts_unique_participants(self, service, db_service, databricks_service):
        """run_analysis counts unique users across all feedback entries."""
        db_service.get_discovery_feedback.return_value = [
            _make_feedback("t-1", "u-1", "good", "A"),
            _make_feedback("t-2", "u-1", "bad", "B"),
            _make_feedback("t-1", "u-2", "good", "C"),
            _make_feedback("t-2", "u-3", "bad", "D"),
        ]
        db_service.get_workshop.return_value = _make_workshop()
        db_service.get_traces.return_value = [
            _make_trace("t-1", "Q1", "A1"),
            _make_trace("t-2", "Q2", "A2"),
        ]
        databricks_service.call_chat_completion.return_value = _llm_response({
            "findings": [],
            "high_priority_disagreements": [],
            "medium_priority_disagreements": [],
            "lower_priority_disagreements": [],
            "summary": "Summary.",
        })
        db_service.save_discovery_analysis.return_value = _make_analysis_record(participant_count=3)

        service.run_analysis("ws-1", "evaluation_criteria", "test-model")

        save_call = db_service.save_discovery_analysis.call_args[1]
        assert save_call["participant_count"] == 3
