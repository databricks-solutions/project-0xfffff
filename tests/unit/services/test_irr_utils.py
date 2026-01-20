import pytest

from server.models import Annotation
from server.services.irr_utils import (
    analyze_annotation_structure,
    detect_problematic_patterns,
    format_irr_result,
    validate_annotations_for_irr,
)


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
def test_analyze_annotation_structure_empty():
    assert analyze_annotation_structure([]) == {
        "num_raters": 0,
        "num_traces": 0,
        "total_annotations": 0,
        "completeness": 0.0,
        "rater_participation": {},
        "trace_coverage": {},
        "missing_data": False,
        "recommended_metric": None,
    }


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_analyze_annotation_structure_recommends_cohens_kappa_when_two_raters_complete():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3),
        _ann(trace_id="t1", user_id="u2", rating=3),
        _ann(trace_id="t2", user_id="u1", rating=4),
        _ann(trace_id="t2", user_id="u2", rating=4),
    ]
    analysis = analyze_annotation_structure(annotations)
    assert analysis["num_raters"] == 2
    assert analysis["num_traces"] == 2
    assert analysis["missing_data"] is False
    assert analysis["recommended_metric"] == "cohens_kappa"


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_analyze_annotation_structure_recommends_krippendorff_alpha_when_missing_data():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3),
        _ann(trace_id="t1", user_id="u2", rating=3),
        _ann(trace_id="t2", user_id="u1", rating=4),
        # u2 missing t2
    ]
    analysis = analyze_annotation_structure(annotations)
    assert analysis["num_raters"] == 2
    assert analysis["num_traces"] == 2
    assert analysis["missing_data"] is True
    assert analysis["recommended_metric"] == "krippendorff_alpha"


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.parametrize(
    "annotations, expected_error_substr",
    [
        (lambda: [], "Need at least 2 annotations"),
        (lambda: [_ann(trace_id="t1", user_id="u1", rating=3)], "Need at least 2 annotations"),
        (
            lambda: [
                # Construct an invalid annotation without triggering Pydantic validation at import time.
                # We want to test our own validation logic, not Pydantic's constructor.
                Annotation.model_construct(  # type: ignore[attr-defined]
                    id="t1:u1",
                    workshop_id="w1",
                    trace_id="t1",
                    user_id="u1",
                    rating=6,
                    ratings=None,
                    comment=None,
                ),
                _ann(trace_id="t1", user_id="u2", rating=3),
            ],
            "Invalid rating 6",
        ),
        (
            lambda: [
                _ann(trace_id="t1", user_id="u1", rating=3),
                _ann(trace_id="t2", user_id="u1", rating=4),
            ],
            "Need at least 2 raters",
        ),
        (
            lambda: [
                _ann(trace_id="t1", user_id="u1", rating=3),
                _ann(trace_id="t1", user_id="u2", rating=4),
                _ann(trace_id="t2", user_id="u1", rating=5),
                # t2 not multi-rated
            ],
            "Need at least 2 traces rated by multiple raters",
        ),
    ],
)
def test_validate_annotations_for_irr_invalid_cases(annotations, expected_error_substr):
    ok, msg = validate_annotations_for_irr(annotations())
    assert ok is False
    assert expected_error_substr in msg


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_validate_annotations_for_irr_valid_case():
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=3),
        _ann(trace_id="t1", user_id="u2", rating=4),
        _ann(trace_id="t2", user_id="u1", rating=5),
        _ann(trace_id="t2", user_id="u2", rating=5),
    ]
    ok, msg = validate_annotations_for_irr(annotations)
    assert ok is True
    assert msg == ""


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_format_irr_result_rounding_and_ready_flag():
    analysis = analyze_annotation_structure(
        [
            _ann(trace_id="t1", user_id="u1", rating=3),
            _ann(trace_id="t1", user_id="u2", rating=4),
            _ann(trace_id="t2", user_id="u1", rating=5),
            _ann(trace_id="t2", user_id="u2", rating=5),
        ]
    )
    result = format_irr_result(
        metric_name="Some Metric",
        score=0.333333,
        interpretation="ok",
        suggestions=["a"],
        analysis=analysis,
    )
    assert result["metric_used"] == "Some Metric"
    assert result["score"] == 0.333
    assert result["ready_to_proceed"] is True
    assert result["threshold"] == 0.3
    assert result["num_raters"] == 2


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_detect_problematic_patterns_basic_signals():
    # u1 always gives 1; t1 has extreme disagreement (1 vs 5)
    annotations = [
        _ann(trace_id="t1", user_id="u1", rating=1),
        _ann(trace_id="t1", user_id="u2", rating=5),
        _ann(trace_id="t2", user_id="u1", rating=1),
        _ann(trace_id="t2", user_id="u2", rating=3),
    ]
    issues = detect_problematic_patterns(annotations, db=None)
    assert any("always gives rating 1" in msg for msg in issues)
    assert any("extreme disagreement" in msg for msg in issues)
