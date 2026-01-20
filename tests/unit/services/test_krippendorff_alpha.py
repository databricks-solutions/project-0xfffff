import pytest

from server.models import Annotation
from server.services.krippendorff_alpha import (
    calculate_krippendorff_alpha,
    calculate_krippendorff_alpha_per_metric,
    get_unique_question_ids,
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
def test_per_metric_returns_empty_when_no_ratings_dict_present():
    # Legacy-only annotations (ratings=None) => should return {} for per-metric computation
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3, ratings=None),
        _ann(trace_id="t1", user_id="u2", rating=3, ratings=None),
    ]
    assert calculate_krippendorff_alpha_per_metric(annotations) == {}


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_krippendorff_alpha_returns_zero_when_insufficient():
    assert calculate_krippendorff_alpha([]) == 0.0
    assert calculate_krippendorff_alpha([_ann(trace_id="t1", user_id="u1", rating=3)]) == 0.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_krippendorff_alpha_trivial_agreement_is_one():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3),
        _ann(trace_id="t1", user_id="u2", rating=3),
        _ann(trace_id="t2", user_id="u1", rating=3),
        _ann(trace_id="t2", user_id="u2", rating=3),
    ]
    assert calculate_krippendorff_alpha(annotations) == 1.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_krippendorff_alpha_handles_missing_data():
    # t2 only rated by u1; still should produce a bounded score (not crash)
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=1),
        _ann(trace_id="t1", user_id="u2", rating=5),
        _ann(trace_id="t2", user_id="u1", rating=1),
    ]
    alpha = calculate_krippendorff_alpha(annotations)
    assert -1.0 <= alpha <= 1.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_krippendorff_alpha_specific_question_id_uses_ratings_dict():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=1, ratings={"q1": 5}),
        _ann(trace_id="t1", user_id="u2", rating=1, ratings={"q1": 5}),
        _ann(trace_id="t2", user_id="u1", rating=1, ratings={"q1": 5}),
        _ann(trace_id="t2", user_id="u2", rating=1, ratings={"q1": 5}),
    ]
    assert calculate_krippendorff_alpha(annotations, question_id="q1") == 1.0
