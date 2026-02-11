import pytest

from server.models import Annotation
from server.services.irr_service import calculate_irr_for_workshop


def _ann(*, trace_id: str, user_id: str, rating: int, ratings=None) -> Annotation:
    return Annotation(
        id=f"{trace_id}:{user_id}",
        workshop_id="w1",
        trace_id=trace_id,
        user_id=user_id,
        rating=rating,
        ratings=ratings,
        comment=None,
    )


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_irr_for_workshop_returns_error_details_when_invalid():
    result = calculate_irr_for_workshop("w1", annotations=[], db=None)
    assert result.workshop_id == "w1"
    assert result.score == 0.0
    assert result.ready_to_proceed is False
    assert result.details
    assert result.details["metric_used"] == "none"
    assert "Need at least 2 annotations" in result.details["error"]


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_irr_for_workshop_perfect_agreement():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3, ratings={"q1": 3}),
        _ann(trace_id="t1", user_id="u2", rating=3, ratings={"q1": 3}),
        _ann(trace_id="t2", user_id="u1", rating=4, ratings={"q1": 4}),
        _ann(trace_id="t2", user_id="u2", rating=4, ratings={"q1": 4}),
    ]
    result = calculate_irr_for_workshop("w1", annotations=annotations, db=None)
    assert result.details
    assert result.details["metric_used"] == "Pairwise Agreement"
    assert result.score == 100.0
    assert result.ready_to_proceed is True
    assert "per_metric_scores" in result.details


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_irr_for_workshop_with_missing_data():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=1, ratings={"q1": 1}),
        _ann(trace_id="t1", user_id="u2", rating=5, ratings={"q1": 5}),
        _ann(trace_id="t2", user_id="u1", rating=1, ratings={"q1": 1}),
        _ann(trace_id="t2", user_id="u2", rating=5, ratings={"q1": 5}),
        _ann(trace_id="t3", user_id="u1", rating=1, ratings={"q1": 1}),
        # u2 missing t3
    ]
    result = calculate_irr_for_workshop("w1", annotations=annotations, db=None)
    assert result.details
    assert result.details["metric_used"] == "Pairwise Agreement"
    assert 0.0 <= result.score <= 100.0
    assert "per_metric_scores" in result.details


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_irr_per_metric_scores_include_agreement_details():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3, ratings={"q1": 3, "q2": 1}),
        _ann(trace_id="t1", user_id="u2", rating=4, ratings={"q1": 4, "q2": 1}),
        _ann(trace_id="t2", user_id="u1", rating=3, ratings={"q1": 3, "q2": 0}),
        _ann(trace_id="t2", user_id="u2", rating=3, ratings={"q1": 3, "q2": 0}),
    ]
    result = calculate_irr_for_workshop("w1", annotations=annotations, db=None)
    assert result.details
    per_metric = result.details["per_metric_scores"]
    assert "q1" in per_metric
    assert "q2" in per_metric

    # Check that each metric has the expected fields
    q1 = per_metric["q1"]
    assert "score" in q1
    assert "exact_agreement" in q1
    assert "adjacent_agreement" in q1
    assert "interpretation" in q1
    assert "acceptable" in q1
    assert "is_binary" in q1
    assert "krippendorff_alpha" in q1
