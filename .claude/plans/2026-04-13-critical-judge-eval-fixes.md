# Critical Judge Evaluation Pipeline Fixes

**Specs:** [JUDGE_EVALUATION_SPEC](../../specs/JUDGE_EVALUATION_SPEC.md), [ASSISTED_FACILITATION_SPEC](../../specs/ASSISTED_FACILITATION_SPEC.md)
**Goal:** Fix 4 critical audit findings and consolidate evaluation storage logic into AlignmentService
**Architecture:** Move result-storage and rating-normalization logic from `database_service.py` and inline `workshops.py` code into `AlignmentService.store_evaluation_results()`. Fix re-evaluation to use aligned judge, preserve evaluation history across re-evaluations, reject unparseable judge output instead of silently defaulting, and stop `promote_finding` from swallowing DB errors.

**Success Criteria Targeted:**
- SC-1: Re-evaluate loads registered judge with aligned instructions
- SC-2: Pre-align and post-align scores directly comparable
- SC-3: Results stored against correct prompt version
- SC-4: Evaluation results persisted to database
- SC-5: Findings can be promoted to draft rubric staging area

---

## File Map

### Modified Files
| File | Change |
|------|--------|
| `server/services/alignment_service.py` | Add `store_evaluation_results()` method; replace silent defaults with skip+count in `run_evaluation_with_answer_sheet` |
| `server/routers/workshops.py` | Flip `use_registered_judge=True` for re-evaluate; replace all inline result-storage + `store_judge_evaluations()` calls with `alignment_service.store_evaluation_results()` |
| `server/services/database_service.py` | Deprecate `store_judge_evaluations` (keep for backwards compat but add deprecation warning); remove duplicate judge-type detection logic |
| `server/services/discovery_service.py` | Remove outer catch-all in `promote_finding` |
| `tests/unit/services/test_alignment_service.py` | Add tests for `store_evaluation_results`, unparseable output rejection |
| `tests/unit/services/test_discovery_service_v2.py` | Add test for promote_finding DB error propagation |

---

### Task 1: Add `store_evaluation_results()` to AlignmentService

**Spec criteria:** SC-2, SC-3, SC-4
**Files:**
- Modify: `server/services/alignment_service.py`
- Test: `tests/unit/services/test_alignment_service.py`

- [ ] **Step 1: Write failing tests for store_evaluation_results**

Add to `tests/unit/services/test_alignment_service.py`:

```python
@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Results stored against correct prompt version")
def test_store_evaluation_results_creates_new_prompt_version_for_reeval(db_service, workshop):
    """Re-evaluation stores results under a NEW prompt version, preserving the baseline."""
    from server.services.alignment_service import AlignmentService
    from server.models import JudgePromptCreate

    alignment_svc = AlignmentService(db_service)

    # Create initial prompt v1
    prompt_v1 = db_service.create_judge_prompt(
        workshop.id,
        JudgePromptCreate(prompt_text="Rate quality", model_name="test"),
    )

    # Store initial evaluations
    initial_evals = [
        {"trace_id": "t1", "predicted_rating": 4.0, "human_rating": 5.0, "reasoning": "good"},
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
        {"trace_id": "t1", "predicted_rating": 5.0, "human_rating": 5.0, "reasoning": "aligned"},
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
@pytest.mark.req("Evaluation results persisted to database")
def test_store_evaluation_results_normalizes_binary_ratings(db_service, workshop):
    """Binary ratings are normalized to 0/1 using the rubric's judge type."""
    from server.services.alignment_service import AlignmentService

    alignment_svc = AlignmentService(db_service)

    evals = [
        {"trace_id": "t1", "predicted_rating": 3.0, "human_rating": 1.0, "reasoning": "ok"},
    ]
    # With a binary rubric, 3.0 should become 1.0 (>=3 = PASS)
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
    assert stored[0].predicted_rating == 1  # 3.0 -> 1.0 (binary PASS)


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Pre-align and post-align scores directly comparable")
def test_store_evaluation_results_initial_eval_reuses_existing_prompt(db_service, workshop):
    """Initial evaluation reuses latest prompt instead of creating a new one."""
    from server.services.alignment_service import AlignmentService
    from server.models import JudgePromptCreate

    alignment_svc = AlignmentService(db_service)

    # Pre-create a prompt
    existing = db_service.create_judge_prompt(
        workshop.id,
        JudgePromptCreate(prompt_text="Rate quality", model_name="test"),
    )

    evals = [
        {"trace_id": "t1", "predicted_rating": 4.0, "human_rating": 5.0, "reasoning": "ok"},
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
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `just test-server -k "test_store_evaluation_results" --no-header -q`
Expected: FAIL — `store_evaluation_results` does not exist yet

- [ ] **Step 3: Implement `store_evaluation_results` on AlignmentService**

Add to `server/services/alignment_service.py` on the `AlignmentService` class:

```python
def store_evaluation_results(
    self,
    workshop_id: str,
    evaluations: list[dict],
    judge_name: str,
    judge_prompt: str,
    model_name: str,
    is_re_evaluation: bool = False,
    judge_type: str | None = None,
) -> "JudgePrompt":
    """Store evaluation results, creating a new prompt version for re-evaluations.

    For initial evaluations: reuses the latest existing prompt (or creates v1).
    For re-evaluations: always creates a new prompt version so pre-align
    and post-align results are both preserved and directly comparable.

    Args:
        evaluations: List of dicts with keys: trace_id, predicted_rating,
                     human_rating, reasoning, (optional) workshop_uuid, confidence
        judge_type: Explicit judge type. If None, detected from rubric.
        is_re_evaluation: If True, creates a new prompt version instead of reusing.
    """
    import uuid
    from server.models import JudgeEvaluation, JudgePromptCreate

    if not evaluations:
        raise ValueError("No evaluations to store")

    # Detect judge type from rubric if not explicitly provided
    if judge_type is None:
        judge_type = get_judge_type_from_rubric(self.db_service, workshop_id)
    is_binary = judge_type == "binary"

    # Get or create prompt
    existing_prompts = self.db_service.get_judge_prompts(workshop_id)

    if is_re_evaluation:
        # Always create new version for re-evaluation (preserves baseline)
        prompt_data = JudgePromptCreate(
            prompt_text=judge_prompt,
            model_name=model_name,
        )
        prompt = self.db_service.create_judge_prompt(workshop_id, prompt_data)
        logger.info(
            "Re-evaluation: created prompt v%d (preserving v%d baseline)",
            prompt.version,
            existing_prompts[0].version if existing_prompts else 0,
        )
    elif existing_prompts:
        # Reuse latest prompt for initial evaluation
        prompt = existing_prompts[0]
        # Clear old evaluations for this prompt (initial eval replaces previous)
        self.db_service.clear_judge_evaluations(workshop_id, prompt.id)
    else:
        # No prompts exist — create v1
        prompt_data = JudgePromptCreate(
            prompt_text=judge_prompt,
            model_name=model_name,
        )
        prompt = self.db_service.create_judge_prompt(workshop_id, prompt_data)

    # Build JudgeEvaluation objects with normalized ratings
    evals_to_store = []
    for eval_data in evaluations:
        predicted = eval_data.get("predicted_rating")
        if predicted is not None:
            predicted = self._normalize_rating(float(predicted), is_binary)

        human = eval_data.get("human_rating")
        if human is not None:
            try:
                human = int(human)
            except (ValueError, TypeError):
                human = None

        trace_id = eval_data.get("workshop_uuid") or eval_data["trace_id"]

        evals_to_store.append(
            JudgeEvaluation(
                id=str(uuid.uuid4()),
                workshop_id=workshop_id,
                prompt_id=prompt.id,
                trace_id=trace_id,
                predicted_rating=predicted,
                human_rating=human,
                confidence=eval_data.get("confidence"),
                reasoning=eval_data.get("reasoning"),
                predicted_feedback=judge_name,
            )
        )

    if evals_to_store:
        # Use the raw DB insert (no delete-all) since we already handle prompt versioning
        self.db_service._insert_judge_evaluations(evals_to_store)

    return prompt

@staticmethod
def _normalize_rating(value: float, is_binary: bool) -> int:
    """Normalize a rating value based on judge type.

    Binary: threshold at 3.0 for Likert-style values, 0.5 for others.
    Likert: clamp to [1, 5].
    """
    if is_binary:
        if value in (0.0, 1.0):
            return int(value)
        if 1.0 <= value <= 5.0:
            return 1 if value >= 3.0 else 0
        return 1 if value > 0.5 else 0
    else:
        return max(1, min(5, round(value)))
```

Also add a thin `_insert_judge_evaluations` method to `database_service.py` that does the insert-only (no delete):

```python
def _insert_judge_evaluations(self, evaluations: list) -> None:
    """Insert judge evaluations without clearing existing ones."""
    from server.database import JudgeEvaluationDB
    for evaluation in evaluations:
        db_eval = JudgeEvaluationDB(
            id=evaluation.id,
            workshop_id=evaluation.workshop_id,
            prompt_id=evaluation.prompt_id,
            trace_id=evaluation.trace_id,
            predicted_rating=evaluation.predicted_rating,
            human_rating=evaluation.human_rating,
            confidence=evaluation.confidence,
            reasoning=evaluation.reasoning,
            predicted_feedback=evaluation.predicted_feedback,
        )
        self.db.add(db_eval)
    self.db.commit()

def clear_judge_evaluations(self, workshop_id: str, prompt_id: str) -> None:
    """Clear evaluations for a specific prompt. Used by initial eval (not re-eval)."""
    self.db.query(JudgeEvaluationDB).filter(
        JudgeEvaluationDB.prompt_id == prompt_id
    ).delete()
    self.db.commit()
```

Note: The existing `clear_judge_evaluations` at line 3801 takes `(self, prompt_id)` but the new signature adds `workshop_id` for consistency. Check if the existing one already has it; if so, keep its signature.

- [ ] **Step 4: Run tests to confirm they pass**

Run: `just test-server -k "test_store_evaluation_results" --no-header -q`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/services/alignment_service.py server/services/database_service.py tests/unit/services/test_alignment_service.py
git commit -m "feat(judge): add AlignmentService.store_evaluation_results with prompt versioning"
```

---

### Task 2: Replace silent defaults with skip+count for unparseable judge output

**Spec criteria:** SC-4
**Files:**
- Modify: `server/services/alignment_service.py` (lines 906-915)
- Test: `tests/unit/services/test_alignment_service.py`

- [ ] **Step 1: Write failing test**

```python
@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Evaluation results persisted to database")
def test_unparseable_judge_output_skipped_not_defaulted():
    """When judge output can't be parsed, skip the trace instead of defaulting to 1.0/3.0."""
    from server.services.alignment_service import AlignmentService
    from unittest.mock import MagicMock

    db_service = MagicMock()
    svc = AlignmentService(db_service)

    # The run_evaluation_with_answer_sheet generator should report skipped traces
    # We test the skip logic by checking the result dict for skipped count
    # (Full integration test requires MLflow — here we test the extraction logic)

    # Direct test: _normalize_rating should raise on truly invalid input
    # But this is tested indirectly; the key behavior is that the generator
    # yields skip warnings and the result dict includes skipped_count

    # Test that None predicted_rating traces are skipped in store
    evals = [
        {"trace_id": "t1", "predicted_rating": None, "human_rating": 5.0, "reasoning": None},
        {"trace_id": "t2", "predicted_rating": 4.0, "human_rating": 3.0, "reasoning": "ok"},
    ]

    db_service.get_judge_prompts.return_value = []
    db_service.create_judge_prompt.return_value = MagicMock(id="p1", version=1)
    db_service._insert_judge_evaluations = MagicMock()

    svc.store_evaluation_results(
        workshop_id="w1",
        evaluations=evals,
        judge_name="j",
        judge_prompt="p",
        model_name="m",
        judge_type="likert",
    )

    # Only the parseable evaluation should be stored (t2), not t1
    stored = db_service._insert_judge_evaluations.call_args[0][0]
    assert len(stored) == 1
    assert stored[0].trace_id == "t2"
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `just test-server -k "test_unparseable_judge_output_skipped" --no-header -q`
Expected: FAIL

- [ ] **Step 3: Modify the silent default logic**

In `server/services/alignment_service.py`, replace lines 906-915:

```python
# BEFORE (silent default):
if predicted_rating is None:
    if is_binary:
        predicted_rating = 1.0
        yield f"⚠️ Could not parse rating for trace {trace_id[:8]}... - defaulting to 1.0 (PASS)"
    else:
        predicted_rating = 3.0
        yield f"⚠️ Could not parse rating for trace {trace_id[:8]}... - defaulting to 3.0 (neutral)"

# AFTER (skip + count):
if predicted_rating is None:
    skipped_count += 1
    yield f"⚠️ Skipping trace {trace_id[:8]}... - could not parse judge output into a rating"
    continue  # Skip this trace entirely
```

Also initialize `skipped_count = 0` near the top of the evaluation loop and include it in the result dict:

```python
# In the evaluation_results dict construction:
"skipped_count": skipped_count,
"extracted": len(evaluations),
"total_traces": len(evaluations) + skipped_count,
```

Also update `store_evaluation_results` to skip `None` predicted_rating entries:

```python
# In store_evaluation_results, skip None ratings:
if predicted is None:
    logger.warning("Skipping evaluation for trace %s — no predicted rating", trace_id)
    continue
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `just test-server -k "test_unparseable_judge_output_skipped" --no-header -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/alignment_service.py tests/unit/services/test_alignment_service.py
git commit -m "fix(judge): skip unparseable judge output instead of silently defaulting"
```

---

### Task 3: Fix re-evaluation to use aligned judge

**Spec criteria:** SC-1
**Files:**
- Modify: `server/routers/workshops.py` (line 5260)
- Test: `tests/unit/services/test_alignment_service.py` (update existing xfail test)

- [ ] **Step 1: Update the existing xfail test**

The test at `tests/unit/services/test_alignment_service.py:236` is currently `xfail`. Replace it with a real test:

```python
@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Re-evaluate loads registered judge with aligned instructions")
def test_re_evaluate_endpoint_passes_use_registered_judge_true(monkeypatch):
    """The re-evaluate code path passes use_registered_judge=True to alignment_service."""
    # We verify the flag is True by checking what the re-evaluate handler passes
    # to run_evaluation_with_answer_sheet. Since the handler is a background thread,
    # we test by reading the source and confirming the flag value.
    import ast
    import inspect
    import server.routers.workshops as wmod

    source = inspect.getsource(wmod.re_evaluate)
    tree = ast.parse(source)

    # Find all keyword arguments named 'use_registered_judge'
    for node in ast.walk(tree):
        if isinstance(node, ast.keyword) and node.arg == "use_registered_judge":
            # The value should be True (ast.Constant with value=True)
            assert isinstance(node.value, ast.Constant) and node.value.value is True, (
                "re_evaluate must pass use_registered_judge=True to "
                "run_evaluation_with_answer_sheet so aligned instructions are used"
            )
            return

    pytest.fail("use_registered_judge keyword not found in re_evaluate function")
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `just test-server -k "test_re_evaluate_endpoint_passes_use_registered_judge_true" --no-header -q`
Expected: FAIL — currently `False`

- [ ] **Step 3: Flip the flag**

In `server/routers/workshops.py` line 5260, change:

```python
# BEFORE:
use_registered_judge=False,  # Use the prompt directly, not the aligned judge

# AFTER:
use_registered_judge=True,  # Use the aligned judge with semantic memory from memalign
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `just test-server -k "test_re_evaluate_endpoint_passes_use_registered_judge_true" --no-header -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routers/workshops.py tests/unit/services/test_alignment_service.py
git commit -m "fix(judge): re-evaluation now uses aligned judge with semantic memory"
```

---

### Task 4: Replace inline result-storage in workshops.py with alignment_service calls

**Spec criteria:** SC-2, SC-3, SC-4
**Files:**
- Modify: `server/routers/workshops.py` (7 call sites)

- [ ] **Step 1: Replace re-evaluate result storage (lines 5269-5318)**

Replace the entire block that constructs `JudgeEvaluation` objects and calls `store_judge_evaluations` with:

```python
if result and result.get("success"):
    try:
        prompt = alignment_service.store_evaluation_results(
            workshop_id=workshop_id,
            evaluations=result.get("evaluations", []),
            judge_name=judge_name,
            judge_prompt=judge_prompt,
            model_name=evaluation_model_name,
            is_re_evaluation=True,
        )
        job.add_log(f"Stored {len(result.get('evaluations', []))} re-evaluation results under prompt v{prompt.version}")

        if "metrics" in result:
            thread_db_service.update_judge_prompt_metrics(prompt.id, result["metrics"])

        job.set_status("completed")
        job.add_log("Re-evaluation completed successfully")
    except Exception as save_err:
        job.add_log(f"Warning: Could not save results: {save_err}")
        job.set_status("completed")
```

- [ ] **Step 2: Replace start-evaluation result storage (around line 3935-3972)**

Same pattern — replace the inline `JudgeEvaluation` construction + `store_judge_evaluations` with:

```python
prompt = alignment_service.store_evaluation_results(
    workshop_id=workshop_id,
    evaluations=result.get("evaluations", []),
    judge_name=judge_name,
    judge_prompt=judge_prompt,
    model_name=evaluation_model_name,
    is_re_evaluation=False,
)
```

- [ ] **Step 3: Replace remaining call sites**

Apply the same replacement to the other 5 call sites (auto-eval at lines ~1274, ~1688, ~2716, ~4502, ~4947). Each follows the same pattern: construct `alignment_service = AlignmentService(thread_db_service)` (if not already done in scope) and call `store_evaluation_results`.

For the synchronous save endpoint at ~2716 (`save_evaluations`), the alignment_service needs to be instantiated from the request's db_service.

- [ ] **Step 4: Run full test suite**

Run: `just test-server --no-header -q`
Expected: All tests PASS (existing tests may need mock updates for `store_evaluation_results` instead of `store_judge_evaluations`)

- [ ] **Step 5: Update test mocks**

In `tests/unit/routers/test_workshops_router.py`, the `FakeDatabaseService` at line 199 mocks `store_judge_evaluations`. Update it to also support `_insert_judge_evaluations` and `clear_judge_evaluations` since `AlignmentService.store_evaluation_results` calls those.

- [ ] **Step 6: Run full test suite again**

Run: `just test-server --no-header -q`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add server/routers/workshops.py tests/unit/routers/test_workshops_router.py
git commit -m "refactor(judge): consolidate evaluation storage into AlignmentService"
```

---

### Task 5: Fix promote_finding error handling

**Spec criteria:** SC-5
**Files:**
- Modify: `server/services/discovery_service.py` (lines 1555-1562)
- Test: `tests/unit/services/test_discovery_service_v2.py`

- [ ] **Step 1: Write failing test**

```python
@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
@pytest.mark.req("Findings can be promoted to draft rubric staging area")
def test_promote_finding_propagates_db_error(self, mock_db_session):
    """promote_finding must NOT return success when the DB write fails."""
    from unittest.mock import patch

    svc = self._make_service(mock_db_session)

    with patch.object(svc.db_service, "add_draft_rubric_item", side_effect=Exception("DB locked")):
        with pytest.raises(Exception, match="DB locked"):
            svc.promote_finding("w1", "f1", "user1")
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `just test-server -k "test_promote_finding_propagates_db_error" --no-header -q`
Expected: FAIL — currently the exception is caught and fake success returned

- [ ] **Step 3: Remove the outer catch-all**

In `server/services/discovery_service.py`, lines 1555-1562, remove the outer `except Exception` block. The method becomes:

```python
def promote_finding(
    self, workshop_id: str, finding_id: str, promoter_id: str
) -> dict[str, Any]:
    """Promote a finding to draft rubric staging area."""
    self._get_workshop_or_404(workshop_id)

    # Look up finding text (graceful degradation if finding row not found)
    finding_text = ""
    source_trace_ids: list[str] = []
    try:
        from server.database import ClassifiedFindingDB

        finding_row = (
            self.db.query(ClassifiedFindingDB)
            .filter(ClassifiedFindingDB.id == finding_id, ClassifiedFindingDB.workshop_id == workshop_id)
            .first()
        )
        if finding_row:
            finding_text = str(finding_row.text or "")
            source_trace_ids = [str(finding_row.trace_id)] if finding_row.trace_id else []
    except Exception:
        pass  # Finding lookup failure is non-critical — we still create the item

    data = DraftRubricItemCreate(
        text=finding_text or f"Promoted from finding {finding_id}",
        source_type="finding",
        source_trace_ids=source_trace_ids,
    )
    # Let DB errors propagate — caller must handle or user sees 500
    item = self.db_service.add_draft_rubric_item(workshop_id, data, promoted_by=promoter_id)
    return {
        "id": item.id,
        "finding_id": finding_id,
        "promoted_by": promoter_id,
        "status": "promoted",
    }
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `just test-server -k "test_promote_finding_propagates_db_error" --no-header -q`
Expected: PASS

- [ ] **Step 5: Run existing promote tests to confirm no regressions**

Run: `just test-server -k "promote" --no-header -q`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add server/services/discovery_service.py tests/unit/services/test_discovery_service_v2.py
git commit -m "fix(discovery): promote_finding no longer swallows DB errors"
```

---

### Task 6: Deprecate old store_judge_evaluations

**Spec criteria:** SC-4
**Files:**
- Modify: `server/services/database_service.py`

- [ ] **Step 1: Add deprecation warning to store_judge_evaluations**

```python
def store_judge_evaluations(self, evaluations: List[JudgeEvaluation]) -> None:
    """Store judge evaluation results.

    .. deprecated::
        Use AlignmentService.store_evaluation_results() instead.
        This method deletes all existing evaluations for the prompt before inserting,
        which destroys pre-alignment baselines during re-evaluation.
    """
    import warnings
    warnings.warn(
        "store_judge_evaluations is deprecated. Use AlignmentService.store_evaluation_results() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    # Keep existing implementation for any remaining callers
    ...
```

- [ ] **Step 2: Verify no direct callers remain in workshops.py**

Run: `grep -n "store_judge_evaluations" server/routers/workshops.py`
Expected: No matches (all replaced in Task 4)

- [ ] **Step 3: Run full test suite**

Run: `just test-server --no-header -q`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add server/services/database_service.py
git commit -m "refactor(judge): deprecate database_service.store_judge_evaluations"
```

---

### Task 7 (Final): Lint and Verify Spec Coverage

- [ ] **Step 1: Run full backend test suite**

Run: `just test-server`
Expected: All tests PASS

- [ ] **Step 2: Run spec coverage**

Run: `just spec-coverage --specs JUDGE_EVALUATION_SPEC`
Expected: Coverage remains 100% (tests added, none removed)

Run: `just spec-coverage --specs ASSISTED_FACILITATION_SPEC`
Expected: Coverage remains 100%

- [ ] **Step 3: Verify no regressions in related specs**

Run: `just test-server -k "spec" --no-header -q`
Expected: All PASS

- [ ] **Step 4: Update implementation log on JUDGE_EVALUATION_SPEC**

Add to the Implementation Log table at the bottom of `specs/JUDGE_EVALUATION_SPEC.md`:

```markdown
| 2026-04-13 | [Critical Judge Eval Fixes](../.claude/plans/2026-04-13-critical-judge-eval-fixes.md) | in-progress | Fix re-eval aligned judge, preserve eval history, reject unparseable output, consolidate storage into AlignmentService |
```

- [ ] **Step 5: Update implementation log on ASSISTED_FACILITATION_SPEC**

Add an Implementation Log section to `specs/ASSISTED_FACILITATION_SPEC.md` if it doesn't exist:

```markdown
## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-04-13 | [Critical Judge Eval Fixes](../.claude/plans/2026-04-13-critical-judge-eval-fixes.md) | in-progress | Fix promote_finding silent DB error swallowing |
```
