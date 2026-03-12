import pytest
from types import SimpleNamespace

from server.services.alignment_service import AlignmentService

try:
    from server.services.alignment_service import likert_agreement_metric
except ImportError:
    likert_agreement_metric = None


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Judge prompt auto-derived from rubric questions")
def test_normalize_judge_prompt_converts_placeholders_to_mlflow_style():
    prompt = "Rate {{ inputs }} vs {{ outputs }} and also {input}/{output}"
    normalized = AlignmentService._normalize_judge_prompt(prompt)
    assert "{{ inputs }}" in normalized
    assert "{{ outputs }}" in normalized
    # Ensure legacy single-brace placeholders are not left behind
    assert "{input}" not in normalized
    assert "{output}" not in normalized


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Alignment metrics reported")
@pytest.mark.skipif(likert_agreement_metric is None, reason="likert_agreement_metric not yet implemented")
def test_likert_agreement_metric_from_store_is_one_when_equal():
    ex = SimpleNamespace(_store={"result": 3})
    pred = SimpleNamespace(_store={"result": 3})
    assert likert_agreement_metric(ex, pred) == 1.0


@pytest.mark.skipif(likert_agreement_metric is None, reason="likert_agreement_metric not yet implemented")
def test_likert_agreement_metric_clamps_and_scales():
    # human=1, llm=5 -> abs diff 4 on range 4 => score 0.0
    ex = SimpleNamespace(_store={"result": 1})
    pred = SimpleNamespace(_store={"result": 5})
    assert likert_agreement_metric(ex, pred) == 0.0


def test_calculate_eval_metrics_empty_returns_defaults():
    metrics = AlignmentService._calculate_eval_metrics([])
    assert metrics["total_evaluations"] == 0
    assert metrics["accuracy"] == 0.0
    assert metrics["correlation"] == 0.0
    assert metrics["confusion_matrix"] == [[0] * 5 for _ in range(5)]


def test_calculate_eval_metrics_simple_case():
    evaluations = [
        {"human_rating": 1, "predicted_rating": 1},
        {"human_rating": 5, "predicted_rating": 4.6},  # rounds to 5
        {"human_rating": 3, "predicted_rating": 2.1},  # rounds to 2 (mismatch)
    ]
    metrics = AlignmentService._calculate_eval_metrics(evaluations)
    assert metrics["total_evaluations"] == 3
    assert 0.0 <= metrics["accuracy"] <= 1.0
    assert isinstance(metrics["confusion_matrix"], list)


# === Binary Scale Tests (JUDGE_EVALUATION_SPEC lines 65-132) ===


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Binary rubrics evaluated with 0/1 scale (not 1-5)")
@pytest.mark.req("Binary judges return values 0 or 1")
def test_calculate_eval_metrics_binary_scale():
    """Binary metrics use 2x2 confusion matrix and pass/fail agreement.

    Spec: JUDGE_EVALUATION_SPEC lines 65-79
    - Binary rubrics evaluated with 0/1 scale (not 1-5)
    - Binary judges return values 0 or 1
    - Metrics include pass/fail agreement
    """
    evaluations = [
        {"human_rating": 1, "predicted_rating": 1},  # TP (True Positive - both pass)
        {"human_rating": 0, "predicted_rating": 0},  # TN (True Negative - both fail)
        {"human_rating": 1, "predicted_rating": 0},  # FN (False Negative - human pass, pred fail)
    ]
    metrics = AlignmentService._calculate_eval_metrics(evaluations, judge_type='binary')

    assert metrics['judge_type'] == 'binary'
    assert metrics['total_evaluations'] == 3
    # 2x2 confusion matrix for binary
    assert len(metrics['confusion_matrix']) == 2
    assert len(metrics['confusion_matrix'][0]) == 2
    # Pass/fail agreement keys
    assert 'pass' in metrics['agreement_by_rating']
    assert 'fail' in metrics['agreement_by_rating']


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Binary judges return values 0 or 1")
def test_calculate_eval_metrics_binary_all_pass():
    """Binary metrics handle all-pass case with perfect agreement.

    Spec: JUDGE_EVALUATION_SPEC lines 119-132
    - When all values are the same and match, kappa should be 1.0
    """
    evaluations = [
        {"human_rating": 1, "predicted_rating": 1},
        {"human_rating": 1, "predicted_rating": 1},
    ]
    metrics = AlignmentService._calculate_eval_metrics(evaluations, judge_type='binary')

    assert metrics['correlation'] == 1.0  # Perfect agreement
    assert metrics['accuracy'] == 1.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Binary judges return values 0 or 1")
def test_calculate_eval_metrics_binary_all_fail():
    """Binary metrics handle all-fail case with perfect agreement.

    Spec: JUDGE_EVALUATION_SPEC lines 119-132
    """
    evaluations = [
        {"human_rating": 0, "predicted_rating": 0},
        {"human_rating": 0, "predicted_rating": 0},
    ]
    metrics = AlignmentService._calculate_eval_metrics(evaluations, judge_type='binary')

    assert metrics['correlation'] == 1.0  # Perfect agreement
    assert metrics['accuracy'] == 1.0


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Binary judges return values 0 or 1")
def test_calculate_eval_metrics_binary_mixed_ratings():
    """Binary metrics calculate correctly for mixed ratings.

    Spec: JUDGE_EVALUATION_SPEC lines 65-79
    """
    evaluations = [
        {"human_rating": 1, "predicted_rating": 1},  # Match
        {"human_rating": 0, "predicted_rating": 1},  # Mismatch
        {"human_rating": 1, "predicted_rating": 0},  # Mismatch
        {"human_rating": 0, "predicted_rating": 0},  # Match
    ]
    metrics = AlignmentService._calculate_eval_metrics(evaluations, judge_type='binary')

    # 2/4 correct = 50% accuracy
    assert metrics['accuracy'] == 0.5
    assert metrics['total_evaluations'] == 4


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Binary judges return values 0 or 1")
def test_calculate_eval_metrics_binary_empty():
    """Binary metrics handle empty evaluations.

    Spec: JUDGE_EVALUATION_SPEC
    """
    metrics = AlignmentService._calculate_eval_metrics([], judge_type='binary')

    assert metrics['judge_type'] == 'binary'
    assert metrics['total_evaluations'] == 0
    assert metrics['accuracy'] == 0.0
    assert metrics['correlation'] == 0.0
    assert metrics['confusion_matrix'] == [[0, 0], [0, 0]]


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Fallback conversion handles Likert-style returns for binary")
def test_calculate_eval_metrics_binary_threshold_conversion():
    """Binary metrics convert float values using 0.5 threshold.

    Spec: JUDGE_EVALUATION_SPEC lines 119-132
    - Values >= 0.5 are treated as pass (1)
    - Values < 0.5 are treated as fail (0)
    """
    evaluations = [
        {"human_rating": 0.8, "predicted_rating": 0.9},  # Both pass
        {"human_rating": 0.3, "predicted_rating": 0.2},  # Both fail
        {"human_rating": 0.6, "predicted_rating": 0.4},  # Human pass, pred fail
    ]
    metrics = AlignmentService._calculate_eval_metrics(evaluations, judge_type='binary')

    # 2/3 correct (first two match, third doesn't)
    assert metrics['total_evaluations'] == 3
    assert abs(metrics['accuracy'] - 0.6667) < 0.01


# === Likert Scale Tests (JUDGE_EVALUATION_SPEC lines 45-64) ===


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Likert judges return values 1-5")
def test_calculate_eval_metrics_likert_default():
    """Likert metrics use 5x5 confusion matrix by default.

    Spec: JUDGE_EVALUATION_SPEC lines 45-64
    """
    evaluations = [
        {"human_rating": 1, "predicted_rating": 1},
        {"human_rating": 3, "predicted_rating": 3},
        {"human_rating": 5, "predicted_rating": 5},
    ]
    metrics = AlignmentService._calculate_eval_metrics(evaluations)  # Default is likert

    assert metrics.get('judge_type', 'likert') == 'likert'
    assert len(metrics['confusion_matrix']) == 5
    assert len(metrics['confusion_matrix'][0]) == 5
    # All ratings 1-5 should be in agreement_by_rating
    for rating in ['1', '2', '3', '4', '5']:
        assert rating in metrics['agreement_by_rating']


@pytest.mark.xfail(reason="Vacuous stub — needs real MLflow integration test")
@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("MemAlign distills semantic memory (guidelines)")
def test_alignment_extracts_semantic_memory():
    """Vacuous: needs real MLflow integration test, not mock-everything."""
    assert False, "TODO: replace with non-vacuous test (current version mocks all of mlflow)"


@pytest.mark.xfail(reason="Vacuous stub — needs real MLflow integration test")
@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Aligned judge registered to MLflow")
def test_aligned_judge_registered_to_mlflow():
    """Vacuous: needs real MLflow integration test, not mock-everything."""
    assert False, "TODO: replace with non-vacuous test (current version mocks all of mlflow)"


@pytest.mark.xfail(reason="Vacuous stub — needs real MLflow integration test")
@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Metrics reported (guideline count, example count)")
def test_alignment_reports_guideline_and_example_counts():
    """Vacuous: needs real MLflow integration test, not mock-everything."""
    assert False, "TODO: replace with non-vacuous test (current version mocks all of mlflow)"


@pytest.mark.xfail(reason="Vacuous stub — needs real MLflow integration test")
@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Re-evaluate loads registered judge with aligned instructions")
def test_reevaluation_loads_registered_judge_via_get_scorer():
    """Vacuous: needs real MLflow integration test, not mock-everything."""
    assert False, "TODO: replace with non-vacuous test (current version mocks all of mlflow)"
