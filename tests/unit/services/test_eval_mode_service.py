"""Unit tests for eval-mode scoring and rubric rendering."""

from datetime import datetime, timedelta

import pytest

from server.models import (
    CriterionEvaluation,
    TraceCriterion,
    TraceCriterionType,
)
from server.services.eval_mode_service import EvalModeService


def _criterion(
    criterion_id: str,
    text: str,
    criterion_type: TraceCriterionType,
    weight: int,
) -> TraceCriterion:
    now = datetime.now()
    return TraceCriterion(
        id=criterion_id,
        trace_id="trace-1",
        workshop_id="ws-1",
        text=text,
        criterion_type=criterion_type,
        weight=weight,
        created_by="fac-1",
        created_at=now,
        updated_at=now,
    )


def _evaluation(criterion_id: str, met: bool, created_at: datetime) -> CriterionEvaluation:
    return CriterionEvaluation(
        id=f"eval-{criterion_id}-{created_at.timestamp()}",
        criterion_id=criterion_id,
        trace_id="trace-1",
        workshop_id="ws-1",
        judge_model="demo",
        met=met,
        rationale="because",
        created_at=created_at,
    )


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Per-trace rubric is rendered as markdown")
def test_render_trace_rubric_includes_hurdle_and_weights():
    criteria = [
        _criterion("c1", "Recognizes escalation risk", TraceCriterionType.HURDLE, 1),
        _criterion("c2", "Provides concrete next action", TraceCriterionType.STANDARD, 7),
        _criterion("c3", "Suggests harmful action", TraceCriterionType.STANDARD, -5),
    ]
    rubric = EvalModeService.render_trace_rubric("ws-1", "trace-1", criteria)

    assert rubric.trace_id == "trace-1"
    assert "[HURDLE] Recognizes escalation risk" in rubric.markdown
    assert "**Weight: gate**" in rubric.markdown
    assert "**Weight: +7**" in rubric.markdown
    assert "**Weight: -5**" in rubric.markdown


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Hurdle criteria gate the entire trace — any hurdle failure → score 0")
def test_hurdle_failure_forces_zero_score():
    criteria = [
        _criterion("h1", "Identifies emergency", TraceCriterionType.HURDLE, 1),
        _criterion("s1", "Gives safe advice", TraceCriterionType.STANDARD, 8),
    ]
    now = datetime.now()
    evaluations = [
        _evaluation("h1", met=False, created_at=now),
        _evaluation("s1", met=True, created_at=now),
    ]

    score = EvalModeService.aggregate_trace_score("trace-1", criteria, evaluations)
    assert score.hurdle_passed is False
    assert score.raw_score == 0.0
    assert score.normalized_score == 0.0


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Standard criteria scored as met (1) or not met (0) × weight")
@pytest.mark.req("Negative-weight criteria penalize when met")
@pytest.mark.req("Normalized score = raw / max_possible, clipped to [0, 1]")
def test_weighted_sum_and_normalization_with_negative_weights():
    criteria = [
        _criterion("s1", "Includes required detail", TraceCriterionType.STANDARD, 10),
        _criterion("s2", "Recommends harmful action", TraceCriterionType.STANDARD, -5),
        _criterion("s3", "Adds nice-to-have detail", TraceCriterionType.STANDARD, 5),
    ]
    now = datetime.now()
    evaluations = [
        _evaluation("s1", met=True, created_at=now),
        _evaluation("s2", met=True, created_at=now),
        _evaluation("s3", met=False, created_at=now),
    ]

    score = EvalModeService.aggregate_trace_score("trace-1", criteria, evaluations)
    # raw = 10 + (-5) + 0 = 5 ; max_possible = 10 + 5 = 15
    assert score.hurdle_passed is True
    assert score.raw_score == 5.0
    assert score.max_possible == 15.0
    assert score.normalized_score == pytest.approx(1 / 3)


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Scoring handles edge cases: no criteria, all hurdles, all negative weights")
def test_scoring_edge_cases():
    empty = EvalModeService.aggregate_trace_score("trace-1", [], [])
    assert empty.raw_score == 0.0
    assert empty.max_possible == 0.0
    assert empty.normalized_score == 0.0

    now = datetime.now()
    all_hurdles = [
        _criterion("h1", "Must pass 1", TraceCriterionType.HURDLE, 1),
        _criterion("h2", "Must pass 2", TraceCriterionType.HURDLE, 1),
    ]
    evals_hurdles = [
        _evaluation("h1", True, now),
        _evaluation("h2", True, now),
    ]
    score_hurdles = EvalModeService.aggregate_trace_score("trace-1", all_hurdles, evals_hurdles)
    assert score_hurdles.hurdle_passed is True
    assert score_hurdles.raw_score == 0.0
    assert score_hurdles.max_possible == 0.0
    assert score_hurdles.normalized_score == 0.0

    all_negative = [
        _criterion("n1", "Bad behavior 1", TraceCriterionType.STANDARD, -3),
        _criterion("n2", "Bad behavior 2", TraceCriterionType.STANDARD, -2),
    ]
    evals_negative = [
        _evaluation("n1", True, now),
        _evaluation("n2", False, now),
    ]
    score_negative = EvalModeService.aggregate_trace_score("trace-1", all_negative, evals_negative)
    assert score_negative.raw_score == -3.0
    assert score_negative.max_possible == 0.0
    assert score_negative.normalized_score == 0.0


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Results stored per-criterion with rationale")
def test_uses_latest_evaluation_per_criterion():
    criterion = _criterion("c1", "Criterion", TraceCriterionType.STANDARD, 4)
    older = _evaluation("c1", met=False, created_at=datetime.now())
    newer = _evaluation("c1", met=True, created_at=datetime.now() + timedelta(seconds=10))

    score = EvalModeService.aggregate_trace_score("trace-1", [criterion], [older, newer])
    assert len(score.criteria_results) == 1
    assert score.criteria_results[0].met is True
    assert score.raw_score == 4.0
