"""Tests for eval-mode judge execution: context builder, prompt, parsing, and IRR."""

from datetime import datetime, timedelta

import pytest

from server.models import (
    CriterionEvaluation,
    Trace,
    TraceCriterion,
    TraceCriterionType,
)
from server.services.eval_mode_service import EvalModeService


def _trace(trace_id: str = "t1", summary: dict | None = None) -> Trace:
    return Trace(
        id=trace_id,
        workshop_id="ws-1",
        input="User asked about laptop recommendations",
        output="I recommend the ThinkPad X1 Carbon with 16GB RAM",
        summary=summary,
    )


def _criterion(
    criterion_id: str = "c1",
    text: str = "Recommends a laptop with at least 16GB RAM",
    milestone_refs: list[str] | None = None,
) -> TraceCriterion:
    now = datetime.now()
    return TraceCriterion(
        id=criterion_id,
        trace_id="t1",
        workshop_id="ws-1",
        text=text,
        criterion_type=TraceCriterionType.STANDARD,
        weight=5,
        milestone_refs=milestone_refs or [],
        created_by="fac-1",
        created_at=now,
        updated_at=now,
    )


# ------------------------------------------------------------------
# Context Builder
# ------------------------------------------------------------------


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Judge sees trace content + single criterion, not other criteria")
def test_build_judge_context_falls_back_to_full_trace():
    trace = _trace()
    criterion = _criterion()
    ctx = EvalModeService.build_judge_context(trace, criterion)
    assert "User asked about laptop" in ctx
    assert "ThinkPad X1 Carbon" in ctx


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Judge sees trace content + single criterion, not other criteria")
def test_build_judge_context_uses_milestone_refs():
    summary = {
        "executive_summary": "Laptop shopping assistance",
        "milestones": [
            {"id": "m1", "title": "Greeting", "detail": "Agent greets user"},
            {"id": "m2", "title": "RAM Discussion", "detail": "Agent discusses 16GB vs 32GB RAM options"},
            {"id": "m3", "title": "Final Recommendation", "detail": "Agent recommends ThinkPad"},
        ],
    }
    trace = _trace(summary=summary)
    criterion = _criterion(milestone_refs=["t1:m2"])
    ctx = EvalModeService.build_judge_context(trace, criterion)
    assert "RAM Discussion" in ctx
    assert "16GB vs 32GB" in ctx
    assert "Greeting" not in ctx


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Judge sees trace content + single criterion, not other criteria")
def test_build_judge_context_includes_executive_summary():
    summary = {
        "executive_summary": "Laptop shopping session",
        "milestones": [
            {"id": "m1", "title": "RAM Check", "detail": "Checked RAM"},
        ],
    }
    trace = _trace(summary=summary)
    criterion = _criterion(milestone_refs=["t1:m1"])
    ctx = EvalModeService.build_judge_context(trace, criterion)
    assert "Laptop shopping session" in ctx
    assert "RAM Check" in ctx


# ------------------------------------------------------------------
# Prompt Builder
# ------------------------------------------------------------------


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("One independent judge call per criterion")
def test_build_criterion_judge_prompt_contains_criterion_text():
    ctx = "Input: hello\nOutput: world"
    criterion = _criterion(text="Response mentions RAM specifications")
    prompt = EvalModeService.build_criterion_judge_prompt(ctx, criterion)
    assert "Response mentions RAM specifications" in prompt
    assert "hello" in prompt
    assert "Standard" in prompt


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("One independent judge call per criterion")
def test_build_criterion_judge_prompt_hurdle_type():
    ctx = "Input: test"
    criterion = _criterion()
    criterion.criterion_type = TraceCriterionType.HURDLE
    prompt = EvalModeService.build_criterion_judge_prompt(ctx, criterion)
    assert "HURDLE" in prompt


# ------------------------------------------------------------------
# Response Parser
# ------------------------------------------------------------------


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Judge returns met (boolean) + rationale")
def test_parse_judge_response_json():
    raw = '{"met": true, "rationale": "Criterion satisfied because..."}'
    met, rationale = EvalModeService.parse_judge_response(raw)
    assert met is True
    assert "Criterion satisfied" in rationale


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Judge returns met (boolean) + rationale")
def test_parse_judge_response_json_in_markdown():
    raw = '```json\n{"met": false, "rationale": "Not met"}\n```'
    met, rationale = EvalModeService.parse_judge_response(raw)
    assert met is False
    assert "Not met" in rationale


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Judge returns met (boolean) + rationale")
def test_parse_judge_response_fallback_text():
    raw = 'The criterion is met because the response includes RAM info. "met": true'
    met, rationale = EvalModeService.parse_judge_response(raw)
    assert met is True


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Judge returns met (boolean) + rationale")
def test_parse_judge_response_unparseable():
    raw = "I think this is good."
    met, rationale = EvalModeService.parse_judge_response(raw)
    assert met is False
    assert "Could not parse" in rationale


# ------------------------------------------------------------------
# Eval IRR
# ------------------------------------------------------------------


def _evaluation(criterion_id: str, judge_model: str, met: bool, offset_s: int = 0) -> CriterionEvaluation:
    return CriterionEvaluation(
        id=f"ev-{criterion_id}-{judge_model}-{offset_s}",
        criterion_id=criterion_id,
        trace_id="t1",
        workshop_id="ws-1",
        judge_model=judge_model,
        met=met,
        rationale="test",
        created_at=datetime.now() + timedelta(seconds=offset_s),
    )


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Results stored per-criterion with rationale")
def test_eval_irr_perfect_agreement():
    criteria = [_criterion("c1"), _criterion("c2")]
    evals = [
        _evaluation("c1", "HUMAN", True),
        _evaluation("c1", "demo", True),
        _evaluation("c2", "HUMAN", False),
        _evaluation("c2", "demo", False),
    ]
    result = EvalModeService.calculate_eval_irr(criteria, evals)
    assert result["agreement_pct"] == 100.0
    assert result["agreeing_pairs"] == 2
    assert result["ready_to_proceed"] is True


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Results stored per-criterion with rationale")
def test_eval_irr_partial_agreement():
    criteria = [_criterion("c1"), _criterion("c2")]
    evals = [
        _evaluation("c1", "HUMAN", True),
        _evaluation("c1", "demo", True),
        _evaluation("c2", "HUMAN", True),
        _evaluation("c2", "demo", False),
    ]
    result = EvalModeService.calculate_eval_irr(criteria, evals)
    assert result["agreement_pct"] == 50.0
    assert result["agreeing_pairs"] == 1
    assert result["total_pairs"] == 2
    assert result["ready_to_proceed"] is False


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Results stored per-criterion with rationale")
def test_eval_irr_no_paired_data():
    criteria = [_criterion("c1")]
    evals = [_evaluation("c1", "HUMAN", True)]
    result = EvalModeService.calculate_eval_irr(criteria, evals)
    assert result["total_pairs"] == 0
    assert result["ready_to_proceed"] is False


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Results stored per-criterion with rationale")
def test_eval_irr_uses_latest_evaluation():
    """When multiple evals exist for same criterion+judge, use the latest."""
    criteria = [_criterion("c1")]
    evals = [
        _evaluation("c1", "HUMAN", False, offset_s=0),
        _evaluation("c1", "HUMAN", True, offset_s=10),
        _evaluation("c1", "demo", True),
    ]
    result = EvalModeService.calculate_eval_irr(criteria, evals)
    assert result["agreement_pct"] == 100.0
    assert result["per_criterion"]["c1"]["human_met"] is True
