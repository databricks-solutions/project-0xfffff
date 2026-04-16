import pytest

from server.models import Annotation
from server.services.pairwise_agreement import (
    calculate_pairwise_agreement,
    calculate_pairwise_agreement_per_metric,
    get_pairwise_improvement_suggestions,
    get_unique_question_ids,
    interpret_pairwise_agreement,
    is_pairwise_agreement_acceptable,
)


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
def test_get_unique_question_ids_sorted():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3, ratings={"q2": 2, "q1": 1}),
        _ann(trace_id="t1", user_id="u2", rating=3, ratings={"q3": 5}),
    ]
    assert get_unique_question_ids(annotations) == ["q1", "q2", "q3"]


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_pairwise_agreement_returns_zero_when_insufficient():
    assert calculate_pairwise_agreement([]) == 0.0
    assert calculate_pairwise_agreement([_ann(trace_id="t1", user_id="u1", rating=3)]) == 0.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_pairwise_agreement_perfect_agreement():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=4),
        _ann(trace_id="t1", user_id="u2", rating=4),
        _ann(trace_id="t2", user_id="u1", rating=3),
        _ann(trace_id="t2", user_id="u2", rating=3),
    ]
    assert calculate_pairwise_agreement(annotations, mode="exact") == 100.0
    assert calculate_pairwise_agreement(annotations, mode="adjacent") == 100.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_pairwise_agreement_complete_disagreement():
    # Ratings 1 vs 5 — not exact, not adjacent
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=1),
        _ann(trace_id="t1", user_id="u2", rating=5),
        _ann(trace_id="t2", user_id="u1", rating=1),
        _ann(trace_id="t2", user_id="u2", rating=5),
    ]
    assert calculate_pairwise_agreement(annotations, mode="exact") == 0.0
    assert calculate_pairwise_agreement(annotations, mode="adjacent") == 0.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_pairwise_agreement_adjacent_but_not_exact():
    # Ratings 3 vs 4 — not exact match, but within ±1
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3),
        _ann(trace_id="t1", user_id="u2", rating=4),
        _ann(trace_id="t2", user_id="u1", rating=3),
        _ann(trace_id="t2", user_id="u2", rating=4),
    ]
    assert calculate_pairwise_agreement(annotations, mode="exact") == 0.0
    assert calculate_pairwise_agreement(annotations, mode="adjacent") == 100.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_pairwise_agreement_multi_rater():
    # 3 raters on one trace: ratings [3, 4, 3]
    # Pairs: (3,4)=adj, (3,3)=exact, (4,3)=adj -> 3 pairs total
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3),
        _ann(trace_id="t1", user_id="u2", rating=4),
        _ann(trace_id="t1", user_id="u3", rating=3),
        # Add second trace so validation works (2+ traces needed)
        _ann(trace_id="t2", user_id="u1", rating=3),
        _ann(trace_id="t2", user_id="u2", rating=3),
    ]
    exact = calculate_pairwise_agreement(annotations, mode="exact")
    adjacent = calculate_pairwise_agreement(annotations, mode="adjacent")
    # t1: 1 exact out of 3 pairs = 33.3%, t2: 1 exact out of 1 pair = 100%
    # Total: 2 exact out of 4 pairs = 50%
    assert exact == pytest.approx(50.0)
    # t1: 3 adjacent out of 3 pairs, t2: 1 out of 1 -> 4/4 = 100%
    assert adjacent == pytest.approx(100.0)


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_pairwise_agreement_missing_data():
    # t2 only has one rater — should be skipped (no pairs)
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3),
        _ann(trace_id="t1", user_id="u2", rating=3),
        _ann(trace_id="t2", user_id="u1", rating=4),
    ]
    assert calculate_pairwise_agreement(annotations, mode="exact") == 100.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_pairwise_agreement_binary():
    # Binary: 0 vs 1 via ratings dict (legacy rating field requires >= 1)
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=1, ratings={"q1": 1}),
        _ann(trace_id="t1", user_id="u2", rating=1, ratings={"q1": 0}),
        _ann(trace_id="t2", user_id="u1", rating=1, ratings={"q1": 1}),
        _ann(trace_id="t2", user_id="u2", rating=1, ratings={"q1": 1}),
    ]
    assert calculate_pairwise_agreement(annotations, question_id="q1", mode="exact") == 50.0
    # Adjacent: |1-0| = 1, within ±1 → agrees
    assert calculate_pairwise_agreement(annotations, question_id="q1", mode="adjacent") == 100.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_pairwise_agreement_with_question_id():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=1, ratings={"q1": 5}),
        _ann(trace_id="t1", user_id="u2", rating=1, ratings={"q1": 5}),
        _ann(trace_id="t2", user_id="u1", rating=1, ratings={"q1": 3}),
        _ann(trace_id="t2", user_id="u2", rating=1, ratings={"q1": 3}),
    ]
    assert calculate_pairwise_agreement(annotations, question_id="q1", mode="exact") == 100.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_per_metric_returns_empty_when_no_ratings_dict():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3, ratings=None),
        _ann(trace_id="t1", user_id="u2", rating=3, ratings=None),
    ]
    assert calculate_pairwise_agreement_per_metric(annotations) == {}


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_per_metric_returns_scores_per_question():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3, ratings={"q1": 3, "q2": 1}),
        _ann(trace_id="t1", user_id="u2", rating=3, ratings={"q1": 4, "q2": 1}),
        _ann(trace_id="t2", user_id="u1", rating=3, ratings={"q1": 3, "q2": 0}),
        _ann(trace_id="t2", user_id="u2", rating=3, ratings={"q1": 3, "q2": 0}),
    ]
    result = calculate_pairwise_agreement_per_metric(annotations)
    assert "q1" in result
    assert "q2" in result
    # q1: t1=(3,4) not exact, t2=(3,3) exact -> exact=50%, adjacent=100%
    assert result["q1"]["exact_agreement"] == pytest.approx(50.0)
    assert result["q1"]["adjacent_agreement"] == pytest.approx(100.0)
    # q2: t1=(1,1) exact, t2=(0,0) exact -> exact=100%, adjacent=100%
    assert result["q2"]["exact_agreement"] == pytest.approx(100.0)


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_interpret_pairwise_agreement():
    assert interpret_pairwise_agreement(95) == "Excellent agreement"
    assert interpret_pairwise_agreement(80) == "Good agreement"
    assert interpret_pairwise_agreement(65) == "Moderate agreement"
    assert interpret_pairwise_agreement(55) == "Fair agreement"
    assert interpret_pairwise_agreement(30) == "Poor agreement"


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_is_pairwise_agreement_acceptable():
    assert is_pairwise_agreement_acceptable(75.0) is True
    assert is_pairwise_agreement_acceptable(80.0) is True
    assert is_pairwise_agreement_acceptable(74.9) is False
    assert is_pairwise_agreement_acceptable(0.0) is False


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_get_pairwise_improvement_suggestions_no_suggestions_when_acceptable():
    assert get_pairwise_improvement_suggestions(80.0, 90.0, is_binary=False) == []
    assert get_pairwise_improvement_suggestions(80.0, 80.0, is_binary=True) == []


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_get_pairwise_improvement_suggestions_returns_suggestions_when_low():
    suggestions = get_pairwise_improvement_suggestions(30.0, 60.0, is_binary=False)
    assert len(suggestions) > 0
    # Should suggest discussing disagreements
    assert any("disagree" in s.lower() or "discuss" in s.lower() for s in suggestions)
