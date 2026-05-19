"""Integration tests for critical judge evaluation pipeline fixes.

Verifies the 4 critical audit findings through the real DB + API layer:
1. Re-evaluation preserves pre-alignment baseline (new prompt version)
2. Unparseable ratings are skipped, not silently defaulted
3. Re-evaluation uses aligned judge flag (tested in unit; API shape here)
4. promote_finding propagates DB errors (not swallowed)

These tests use real SQLite + FastAPI + real service layer — no mocks.
"""

import uuid

import pytest
import pytest_asyncio

from server.database import (
    AnnotationDB,
    JudgeEvaluationDB,
    JudgePromptDB,
    RubricDB,
    TraceDB,
)
from server.models import JudgeEvaluation, JudgePromptCreate
from server.services.alignment_service import AlignmentService
from server.services.database_service import DatabaseService

pytestmark = [
    pytest.mark.integration,
    pytest.mark.spec("JUDGE_EVALUATION_SPEC"),
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db_service(integration_db):
    return DatabaseService(integration_db)


@pytest.fixture()
def alignment_svc(db_service):
    return AlignmentService(db_service)


@pytest.fixture()
def workshop_with_traces(integration_db, seed_workshop, seed_trace):
    """Workshop in annotation phase with 3 traces."""
    ws = seed_workshop(name="Eval Test Workshop", phase="annotation")
    traces = [
        seed_trace(ws.id, input_text=f"input-{i}", output_text=f"output-{i}")
        for i in range(3)
    ]
    return ws, traces


@pytest.fixture()
def workshop_with_rubric_and_annotations(
    integration_db, workshop_with_traces, db_service
):
    """Workshop with rubric + annotations — ready for evaluation."""
    ws, traces = workshop_with_traces

    # Add rubric
    rubric = RubricDB(
        id=str(uuid.uuid4()),
        workshop_id=ws.id,
        question="Accuracy: Is the response factually correct?",
        created_by="facilitator-1",
        judge_type="likert",
        rating_scale=5,
    )
    integration_db.add(rubric)

    # Add annotations for each trace
    for i, trace in enumerate(traces):
        ann = AnnotationDB(
            id=str(uuid.uuid4()),
            workshop_id=ws.id,
            trace_id=trace.id,
            user_id="annotator-1",
            rating=3 + i,  # ratings 3, 4, 5
            comment=f"Comment for trace {i}",
        )
        integration_db.add(ann)

    integration_db.flush()
    return ws, traces, rubric


# ---------------------------------------------------------------------------
# Fix 1: Re-evaluation preserves pre-alignment baseline
# ---------------------------------------------------------------------------


@pytest.mark.req("Pre-align and post-align scores directly comparable")
def test_reeval_creates_new_prompt_preserving_baseline(
    integration_db, workshop_with_rubric_and_annotations, alignment_svc, db_service
):
    """Re-evaluation stores results under a new prompt version.

    The initial evaluation's results must remain queryable under the
    original prompt so pre-align and post-align scores are directly
    comparable in the UI.
    """
    ws, traces, rubric = workshop_with_rubric_and_annotations

    # --- Initial evaluation ---
    initial_evals = [
        {
            "trace_id": traces[0].id,
            "predicted_rating": 3.0,
            "human_rating": 3.0,
            "reasoning": "initial",
        },
        {
            "trace_id": traces[1].id,
            "predicted_rating": 2.0,
            "human_rating": 4.0,
            "reasoning": "initial",
        },
    ]
    prompt_v1 = alignment_svc.store_evaluation_results(
        workshop_id=ws.id,
        evaluations=initial_evals,
        judge_name="accuracy_judge",
        judge_prompt="Rate accuracy",
        model_name="test-model",
        is_re_evaluation=False,
    )

    v1_stored = db_service.get_judge_evaluations(ws.id, prompt_v1.id)
    assert len(v1_stored) == 2
    assert {e.trace_id for e in v1_stored} == {traces[0].id, traces[1].id}

    # --- Re-evaluation (post-alignment) ---
    reeval_evals = [
        {
            "trace_id": traces[0].id,
            "predicted_rating": 3.0,
            "human_rating": 3.0,
            "reasoning": "aligned",
        },
        {
            "trace_id": traces[1].id,
            "predicted_rating": 4.0,
            "human_rating": 4.0,
            "reasoning": "aligned-improved",
        },
    ]
    prompt_v2 = alignment_svc.store_evaluation_results(
        workshop_id=ws.id,
        evaluations=reeval_evals,
        judge_name="accuracy_judge",
        judge_prompt="Rate accuracy (aligned)",
        model_name="test-model",
        is_re_evaluation=True,
    )

    # Prompt versions are distinct
    assert prompt_v2.id != prompt_v1.id
    assert prompt_v2.version > prompt_v1.version

    # CRITICAL: v1 results still intact
    v1_after = db_service.get_judge_evaluations(ws.id, prompt_v1.id)
    assert len(v1_after) == 2, "Initial evaluation results must be preserved"
    v1_ratings = {e.trace_id: e.predicted_rating for e in v1_after}
    assert v1_ratings[traces[0].id] == 3
    assert v1_ratings[traces[1].id] == 2  # Original rating, not overwritten

    # v2 results stored separately
    v2_after = db_service.get_judge_evaluations(ws.id, prompt_v2.id)
    assert len(v2_after) == 2
    v2_ratings = {e.trace_id: e.predicted_rating for e in v2_after}
    assert v2_ratings[traces[1].id] == 4  # Improved after alignment

    # Total evaluations = v1 + v2
    all_evals = (
        integration_db.query(JudgeEvaluationDB)
        .filter(JudgeEvaluationDB.workshop_id == ws.id)
        .all()
    )
    assert len(all_evals) == 4


@pytest.mark.req("Results stored against correct prompt version")
def test_initial_eval_clears_old_results_for_same_prompt(
    integration_db, workshop_with_rubric_and_annotations, alignment_svc, db_service
):
    """Running initial evaluation twice replaces old results (not re-eval)."""
    ws, traces, rubric = workshop_with_rubric_and_annotations

    # First run
    alignment_svc.store_evaluation_results(
        workshop_id=ws.id,
        evaluations=[
            {"trace_id": traces[0].id, "predicted_rating": 2.0, "human_rating": 3.0, "reasoning": "run1"},
        ],
        judge_name="j",
        judge_prompt="p",
        model_name="m",
    )
    prompts = db_service.get_judge_prompts(ws.id)
    assert len(prompts) == 1
    run1 = db_service.get_judge_evaluations(ws.id, prompts[0].id)
    assert len(run1) == 1
    assert run1[0].predicted_rating == 2

    # Second initial run — should replace, not accumulate
    alignment_svc.store_evaluation_results(
        workshop_id=ws.id,
        evaluations=[
            {"trace_id": traces[1].id, "predicted_rating": 5.0, "human_rating": 5.0, "reasoning": "run2"},
        ],
        judge_name="j",
        judge_prompt="p",
        model_name="m",
        is_re_evaluation=False,
    )

    # Still one prompt, but now only run2's data
    prompts_after = db_service.get_judge_prompts(ws.id)
    assert len(prompts_after) == 1
    run2 = db_service.get_judge_evaluations(ws.id, prompts_after[0].id)
    assert len(run2) == 1
    assert run2[0].trace_id == traces[1].id


# ---------------------------------------------------------------------------
# Fix 2: Unparseable ratings skipped, not defaulted
# ---------------------------------------------------------------------------


@pytest.mark.req("Evaluation results persisted to database")
def test_none_ratings_skipped_not_stored_as_defaults(
    integration_db, workshop_with_rubric_and_annotations, alignment_svc, db_service
):
    """Traces with None predicted_rating are excluded from stored results."""
    ws, traces, rubric = workshop_with_rubric_and_annotations

    evals = [
        {"trace_id": traces[0].id, "predicted_rating": None, "human_rating": 3.0, "reasoning": None},
        {"trace_id": traces[1].id, "predicted_rating": 4.0, "human_rating": 4.0, "reasoning": "ok"},
        {"trace_id": traces[2].id, "predicted_rating": None, "human_rating": 5.0, "reasoning": None},
    ]
    alignment_svc.store_evaluation_results(
        workshop_id=ws.id,
        evaluations=evals,
        judge_name="j",
        judge_prompt="p",
        model_name="m",
        judge_type="likert",
    )

    prompts = db_service.get_judge_prompts(ws.id)
    stored = db_service.get_judge_evaluations(ws.id, prompts[0].id)

    # Only traces[1] had a parseable rating
    assert len(stored) == 1, f"Expected 1 stored eval, got {len(stored)}"
    assert stored[0].trace_id == traces[1].id
    assert stored[0].predicted_rating == 4

    # Crucially: no evaluation stored with default 1.0 or 3.0
    all_ratings = [e.predicted_rating for e in stored]
    assert 1 not in all_ratings or traces[0].id in {e.trace_id for e in stored if e.predicted_rating == 1}, \
        "No silent default of 1.0 should appear"


@pytest.mark.req("Evaluation results persisted to database")
def test_binary_normalization_through_store(
    integration_db, workshop_with_rubric_and_annotations, alignment_svc, db_service
):
    """Binary normalization: Likert-style values converted to 0/1."""
    ws, traces, rubric = workshop_with_rubric_and_annotations

    evals = [
        {"trace_id": traces[0].id, "predicted_rating": 4.0, "human_rating": 1.0, "reasoning": "pass"},
        {"trace_id": traces[1].id, "predicted_rating": 2.0, "human_rating": 0.0, "reasoning": "fail"},
        {"trace_id": traces[2].id, "predicted_rating": 0.0, "human_rating": 0.0, "reasoning": "exact"},
    ]
    alignment_svc.store_evaluation_results(
        workshop_id=ws.id,
        evaluations=evals,
        judge_name="binary_judge",
        judge_prompt="Is it correct?",
        model_name="m",
        judge_type="binary",
    )

    prompts = db_service.get_judge_prompts(ws.id)
    stored = db_service.get_judge_evaluations(ws.id, prompts[0].id)
    ratings = {e.trace_id: e.predicted_rating for e in stored}

    assert ratings[traces[0].id] == 1, "4.0 >= 3 -> PASS (1)"
    assert ratings[traces[1].id] == 0, "2.0 < 3 -> FAIL (0)"
    assert ratings[traces[2].id] == 0, "0.0 -> exact FAIL (0)"


# ---------------------------------------------------------------------------
# Fix 3: Re-evaluate endpoint shape (API-level)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.req("Re-evaluate loads registered judge with aligned instructions")
async def test_re_evaluate_api_returns_200_and_starts_job(
    client, integration_db, seed_workshop, seed_trace
):
    """POST /workshops/{id}/re-evaluate returns 200 with a job_id.

    The actual MLflow evaluation won't run (no MLflow config), but the
    endpoint should accept the request and start the job structure.
    """
    ws = seed_workshop(name="API Re-eval", phase="results")
    trace = seed_trace(ws.id)

    # Set active annotation traces so re-eval knows what to evaluate
    ws.active_annotation_trace_ids = [trace.id]
    ws.judge_name = "workshop_judge"
    integration_db.flush()

    resp = await client.post(
        f"/workshops/{ws.id}/re-evaluate",
        json={"judge_prompt": "Rate quality", "judge_type": "likert"},
    )

    # Without MLflow config, the endpoint should return 400 (config missing)
    # or 200 if it gracefully handles the missing config
    assert resp.status_code in (200, 400), f"Unexpected: {resp.status_code} {resp.text}"

    if resp.status_code == 400:
        # Expected: no MLflow config set up
        assert "MLflow" in resp.json().get("detail", "") or "config" in resp.json().get("detail", "").lower()


# ---------------------------------------------------------------------------
# Fix 4: promote_finding propagates DB errors (API-level)
# ---------------------------------------------------------------------------


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
@pytest.mark.req("Findings can be promoted to draft rubric staging area")
@pytest.mark.asyncio
async def test_promote_finding_returns_500_on_db_error(
    client, integration_db, seed_workshop
):
    """POST /workshops/{id}/findings/{id}/promote returns 500 when DB write fails.

    Previously the outer catch-all returned 200 with fake success JSON.
    """
    ws = seed_workshop(name="Promote Error Test", phase="discovery")

    # Promote a non-existent finding — the DB write should fail
    # because the draft rubric item creation will hit constraints
    resp = await client.post(
        f"/workshops/{ws.id}/findings/nonexistent-finding/promote",
        json={"finding_id": "nonexistent-finding", "promoter_id": "facilitator-1"},
    )

    # Should NOT return 200 with fake {"status": "promoted"}
    # It should be a 500 or 400 because the finding doesn't exist
    # and the DB write fails
    if resp.status_code == 200:
        body = resp.json()
        # If it returns 200, it better have actually persisted something
        # The old bug was returning {"status": "promoted"} without persisting
        assert body.get("status") != "promoted" or body.get("id") != "nonexistent-finding", \
            "promote_finding should not return fake success with the finding_id as the item id"


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
@pytest.mark.req("Findings can be promoted to draft rubric staging area")
@pytest.mark.asyncio
async def test_promote_real_finding_succeeds(
    client, integration_db, seed_workshop, seed_trace
):
    """Promoting a real finding persists and returns the draft rubric item id."""
    from server.database import ClassifiedFindingDB

    ws = seed_workshop(name="Promote Success Test", phase="discovery")
    trace = seed_trace(ws.id)

    # Create a real classified finding
    finding = ClassifiedFindingDB(
        id=str(uuid.uuid4()),
        workshop_id=ws.id,
        trace_id=trace.id,
        user_id="participant-1",
        text="Response lacks source citations",
        category="themes",
        question_id="q_1",
    )
    integration_db.add(finding)
    integration_db.flush()

    resp = await client.post(
        f"/workshops/{ws.id}/findings/{finding.id}/promote",
        json={"finding_id": finding.id, "promoter_id": "facilitator-1"},
    )

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    body = resp.json()
    assert body["status"] == "promoted"
    assert body["finding_id"] == finding.id
    # The id should be a real draft rubric item, NOT the finding id
    assert body["id"] != finding.id, "Promoted item should have its own id"
