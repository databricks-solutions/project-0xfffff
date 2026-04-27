import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import Base, WorkshopDB, TraceDB
from server.services.alignment_service import AlignmentService, get_judge_type_from_rubric
from server.services.database_service import DatabaseService

try:
    from server.services.alignment_service import likert_agreement_metric
except ImportError:
    likert_agreement_metric = None


# ---------------------------------------------------------------------------
# Fixtures for integration tests (real DB)
# ---------------------------------------------------------------------------


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def db_service(test_db):
    return DatabaseService(test_db)


@pytest.fixture
def workshop(test_db):
    ws = WorkshopDB(id="ws-1", name="Test Workshop", facilitator_id="f-1")
    test_db.add(ws)
    test_db.commit()
    return ws


@pytest.fixture
def traces(test_db, workshop):
    t1 = TraceDB(id="t-1", workshop_id="ws-1", input="Hello", output="Hi")
    t2 = TraceDB(id="t-2", workshop_id="ws-1", input="Bye", output="Goodbye")
    test_db.add_all([t1, t2])
    test_db.commit()
    return [t1, t2]


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


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Aligned judge registered to MLflow")
def test_aligned_judge_persisted_via_memory_augmented_update():
    """run_alignment must persist the returned MemoryAugmentedJudge directly.

    Reconstructing via make_judge(instructions=aligned_judge.instructions) flattens
    the decorated prompt ("... Distilled Guidelines (N): ...") into the base, which
    causes the next alignment to append a second "Distilled Guidelines" block on top.
    The fix: call .update()/.register() directly on the aligned_judge object returned
    by judge.align().
    """
    import inspect

    import server.services.alignment_service as svc

    source = inspect.getsource(svc.AlignmentService.run_alignment)

    assert "aligned_judge.update(" in source, (
        "run_alignment must call aligned_judge.update(...) so MLflow serializes the "
        "MemoryAugmentedJudge (clean base + semantic_memory + episodic_trace_ids)"
    )
    assert "aligned_judge_for_registration" not in source, (
        "run_alignment must not reconstruct the aligned judge via make_judge("
        "instructions=aligned_instructions) — that flattens the decorated prompt "
        "into the base and causes duplicate Distilled Guidelines blocks on re-align"
    )
    assert "instructions=aligned_instructions" not in source, (
        "aligned_instructions (decorated with 'Distilled Guidelines (N):') must not "
        "be fed back into make_judge() during registration"
    )


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Re-evaluate loads registered judge with aligned instructions")
def test_run_alignment_reuses_registered_memory_augmented_judge():
    """run_alignment must try get_scorer() before falling back to make_judge.

    Without this, the frontend's re-sent decorated prompt ("Distilled Guidelines (5):
    ...") re-enters as the new base judge, and the next MemAlign pass appends a
    second "Distilled Guidelines (7):" block on top — reproducing the duplication
    bug even after the registration fix.
    """
    import inspect

    import server.services.alignment_service as svc

    source = inspect.getsource(svc.AlignmentService.run_alignment)

    assert "from mlflow.genai.scorers import get_scorer" in source, (
        "run_alignment must import get_scorer to load previously registered judges"
    )
    assert "get_scorer(name=judge_name, experiment_id=experiment_id)" in source, (
        "run_alignment must try get_scorer(name=judge_name, experiment_id=...) "
        "before falling back to make_judge(instructions=judge_prompt)"
    )
    # Ensure the reuse path precedes make_judge in the source.
    reuse_idx = source.find("get_scorer(name=judge_name, experiment_id=experiment_id)")
    make_judge_idx = source.find("judge = make_judge(")
    assert 0 < reuse_idx < make_judge_idx, (
        "get_scorer() reuse must precede make_judge() fallback in run_alignment"
    )


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Metrics reported (guideline count, example count)")
def test_alignment_reports_guideline_and_example_counts():
    """run_alignment yields both guideline_count and example_count in the result dict."""
    import inspect

    import server.services.alignment_service as svc

    source = inspect.getsource(svc.AlignmentService.run_alignment)

    assert '"guideline_count": guideline_count' in source
    assert '"example_count": example_count' in source
    assert "len(semantic_memory)" in source
    assert "len(episodic_memory)" in source


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("MemAlign distills semantic memory (guidelines)")
def test_episodic_log_shows_two_full_examples_without_truncation():
    """The episodic memory preview must show 2 full examples, not 3 truncated ones.

    The prior behavior truncated 'inputs' to 80 chars and omitted outputs/expectations
    entirely, giving users insufficient signal about what MemAlign had learned from.
    """
    import inspect

    import server.services.alignment_service as svc

    source = inspect.getsource(svc.AlignmentService.run_alignment)

    assert "episodic_memory[:2]" in source, (
        "episodic memory preview must show exactly 2 examples"
    )
    assert "episodic_memory[:3]" not in source, (
        "old 3-example preview must be removed"
    )
    assert '[:80]' not in source, (
        "inputs_preview[:80] truncation must be removed — show full example content"
    )
    # Positive: each of the three fields should be rendered.
    assert 'f"    Inputs: {ex_dict[\'inputs\']}"' in source
    assert 'f"    Outputs: {ex_dict[\'outputs\']}"' in source
    assert 'f"    Expectations: {ex_dict[\'expectations\']}"' in source


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Re-evaluate loads registered judge with aligned instructions")
def test_re_evaluate_endpoint_passes_use_registered_judge_true():
    """The re-evaluate code path must pass use_registered_judge=True."""
    import ast
    import inspect

    import server.routers.workshops as wmod

    source = inspect.getsource(wmod.re_evaluate)
    tree = ast.parse(source)

    for node in ast.walk(tree):
        if isinstance(node, ast.keyword) and node.arg == "use_registered_judge":
            assert isinstance(node.value, ast.Constant) and node.value.value is True, (
                "re_evaluate must pass use_registered_judge=True so aligned instructions are used"
            )
            return

    pytest.fail("use_registered_judge keyword not found in re_evaluate function")


# === store_evaluation_results tests ===


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Results stored against correct prompt version")
def test_store_evaluation_results_creates_new_prompt_for_reeval(db_service, workshop, traces):
    """Re-evaluation stores results under a NEW prompt version, preserving the baseline."""
    from server.models import JudgePromptCreate

    alignment_svc = AlignmentService(db_service)

    # Create initial prompt v1
    prompt_v1 = db_service.create_judge_prompt(
        workshop.id,
        JudgePromptCreate(prompt_text="Rate quality", model_name="test"),
    )

    # Store initial evaluations
    initial_evals = [
        {"trace_id": "t-1", "predicted_rating": 4.0, "human_rating": 5.0, "reasoning": "good"},
    ]
    result_prompt = alignment_svc.store_evaluation_results(
        workshop_id=workshop.id,
        evaluations=initial_evals,
        judge_name="test_judge",
        judge_prompt="Rate quality",
        model_name="test",
        is_re_evaluation=False,
    )
    assert result_prompt.version == prompt_v1.version  # Reuses existing prompt

    # Store re-evaluation results
    reeval_evals = [
        {"trace_id": "t-1", "predicted_rating": 5.0, "human_rating": 5.0, "reasoning": "aligned"},
    ]
    reeval_prompt = alignment_svc.store_evaluation_results(
        workshop_id=workshop.id,
        evaluations=reeval_evals,
        judge_name="test_judge",
        judge_prompt="Rate quality (aligned)",
        model_name="test",
        is_re_evaluation=True,
    )
    assert reeval_prompt.version == prompt_v1.version + 1  # New version

    # Both sets of evaluations exist
    v1_evals = db_service.get_judge_evaluations(workshop.id, prompt_v1.id)
    v2_evals = db_service.get_judge_evaluations(workshop.id, reeval_prompt.id)
    assert len(v1_evals) == 1
    assert len(v2_evals) == 1
    assert v1_evals[0].predicted_rating == 4  # Original preserved
    assert v2_evals[0].predicted_rating == 5  # New stored separately


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Pre-align and post-align scores directly comparable")
def test_store_evaluation_results_initial_reuses_existing_prompt(db_service, workshop, traces):
    """Initial evaluation reuses latest prompt instead of creating a new one."""
    from server.models import JudgePromptCreate

    alignment_svc = AlignmentService(db_service)

    existing = db_service.create_judge_prompt(
        workshop.id,
        JudgePromptCreate(prompt_text="Rate quality", model_name="test"),
    )

    evals = [
        {"trace_id": "t-1", "predicted_rating": 4.0, "human_rating": 5.0, "reasoning": "ok"},
    ]
    result_prompt = alignment_svc.store_evaluation_results(
        workshop_id=workshop.id,
        evaluations=evals,
        judge_name="test_judge",
        judge_prompt="Rate quality",
        model_name="test",
        is_re_evaluation=False,
    )
    assert result_prompt.id == existing.id  # Same prompt, not a new version


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Evaluation results persisted to database")
def test_store_evaluation_results_normalizes_binary_ratings(db_service, workshop, traces):
    """Binary ratings normalized to 0/1 via threshold conversion."""
    alignment_svc = AlignmentService(db_service)

    evals = [
        {"trace_id": "t-1", "predicted_rating": 3.0, "human_rating": 1.0, "reasoning": "ok"},
        {"trace_id": "t-2", "predicted_rating": 2.0, "human_rating": 0.0, "reasoning": "bad"},
    ]
    alignment_svc.store_evaluation_results(
        workshop_id=workshop.id,
        evaluations=evals,
        judge_name="test_judge",
        judge_prompt="Is it correct?",
        model_name="test",
        judge_type="binary",
    )

    prompts = db_service.get_judge_prompts(workshop.id)
    stored = db_service.get_judge_evaluations(workshop.id, prompts[0].id)
    ratings = {e.trace_id: e.predicted_rating for e in stored}
    assert ratings["t-1"] == 1  # 3.0 >= 3 -> PASS
    assert ratings["t-2"] == 0  # 2.0 < 3 -> FAIL


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Evaluation results persisted to database")
def test_store_evaluation_results_skips_none_ratings(db_service, workshop, traces):
    """Traces with None predicted_rating are skipped, not stored with defaults."""
    alignment_svc = AlignmentService(db_service)

    evals = [
        {"trace_id": "t-1", "predicted_rating": None, "human_rating": 5.0, "reasoning": None},
        {"trace_id": "t-2", "predicted_rating": 4.0, "human_rating": 3.0, "reasoning": "ok"},
    ]
    alignment_svc.store_evaluation_results(
        workshop_id=workshop.id,
        evaluations=evals,
        judge_name="test_judge",
        judge_prompt="Rate quality",
        model_name="test",
        judge_type="likert",
    )

    prompts = db_service.get_judge_prompts(workshop.id)
    stored = db_service.get_judge_evaluations(workshop.id, prompts[0].id)
    assert len(stored) == 1
    assert stored[0].trace_id == "t-2"
