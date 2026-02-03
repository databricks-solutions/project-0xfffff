import pytest

from server.services.alignment_service import AlignmentService


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
def test_normalize_judge_prompt_converts_placeholders_to_mlflow_style():
    prompt = "Rate {{ inputs }} vs {{ outputs }} and also {input}/{output}"
    normalized = AlignmentService._normalize_judge_prompt(prompt)
    assert "{{ inputs }}" in normalized
    assert "{{ outputs }}" in normalized
    # Ensure legacy single-brace placeholders are not left behind
    assert "{input}" not in normalized
    assert "{output}" not in normalized


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
