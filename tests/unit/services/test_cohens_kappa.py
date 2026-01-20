import pytest

from server.models import Annotation
from server.services.cohens_kappa import calculate_cohens_kappa, interpret_cohens_kappa, is_cohens_kappa_acceptable


def _ann(*, trace_id: str, user_id: str, rating: int) -> Annotation:
    return Annotation(
        id=f"{trace_id}:{user_id}",
        workshop_id="w1",
        trace_id=trace_id,
        user_id=user_id,
        rating=rating,
        ratings=None,
        comment=None,
    )


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_cohens_kappa_raises_on_empty():
    with pytest.raises(ValueError, match="No annotations"):
        calculate_cohens_kappa([])


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_cohens_kappa_raises_if_not_exactly_two_raters():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3),
        _ann(trace_id="t2", user_id="u1", rating=4),
        _ann(trace_id="t1", user_id="u2", rating=3),
        _ann(trace_id="t2", user_id="u3", rating=4),
    ]
    with pytest.raises(ValueError, match="requires exactly 2 raters"):
        calculate_cohens_kappa(annotations)


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_cohens_kappa_requires_two_paired_traces():
    # Only one trace rated by both raters
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3),
        _ann(trace_id="t1", user_id="u2", rating=3),
        _ann(trace_id="t2", user_id="u1", rating=4),
    ]
    with pytest.raises(ValueError, match="at least 2 paired"):
        calculate_cohens_kappa(annotations)


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_calculate_cohens_kappa_perfect_agreement_is_one():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3),
        _ann(trace_id="t1", user_id="u2", rating=3),
        _ann(trace_id="t2", user_id="u1", rating=4),
        _ann(trace_id="t2", user_id="u2", rating=4),
    ]
    assert calculate_cohens_kappa(annotations) == 1.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_interpret_cohens_kappa_bucket_edges():
    assert interpret_cohens_kappa(-0.1).startswith("Poor")
    assert interpret_cohens_kappa(0.0).startswith("Slight")
    assert interpret_cohens_kappa(0.3).startswith("Fair")
    assert interpret_cohens_kappa(0.5).startswith("Moderate")
    assert interpret_cohens_kappa(0.7).startswith("Substantial")
    assert interpret_cohens_kappa(0.9).startswith("Almost")


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_is_cohens_kappa_acceptable_default_threshold():
    assert is_cohens_kappa_acceptable(0.3) is True
    assert is_cohens_kappa_acceptable(0.299) is False
