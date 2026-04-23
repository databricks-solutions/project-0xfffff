# MLflow Sync: Overwrite on Annotation Edit — DNB Customer Hotfix

**Spec:** [ANNOTATION_SPEC](../../specs/ANNOTATION_SPEC.md) — "MLflow Sync" success criteria
**Base commit:** `090df1d` (customer's deployed version)
**Branch:** `hotfix/dnb-alignment`

## Goal

When an SME edits an annotation, the updated rating/rationale must overwrite the prior MLflow assessment instead of being silently skipped. Keep "true duplicate" skipping (same value re-sync = no-op) so `resync_annotations_to_mlflow` doesn't churn MLflow on every rubric edit.

## Root cause

`server/services/database_service.py:_sync_annotation_with_mlflow`:
- Lines 2086-2099: fetches MLflow assessments, stores `{(name, source_id)}` set
- Line 2143: skips entire `log_feedback` call if the tuple exists

No update path anywhere. MLflow silently retains the pre-edit value. Proven bug when an SME edits: SQLite gets the new rating, MLflow keeps the old.

## Spec ambiguity (resolved for this fix)

`ANNOTATION_SPEC.md:327` says *"Duplicate feedback entries are detected and skipped"* — ambiguous about whether "duplicate" means same `(name, user_id)` (current impl) or same `(name, user_id, value)`. The spec also has an explicit Edit Annotation Flow (line 77+) and a "Changes automatically save on navigation" criterion (line 312), which only make sense if edits reach MLflow.

**Interpretation adopted:** "duplicate" = same value. Identical re-syncs skip (preserve spec intent of no-op resync); edits with changed values overwrite via `mlflow.update_assessment`.

This interpretation gets documented in the plan, not in the spec itself. Spec wording refinement deferred to the main-based forward-port PR.

## Approach

Use MLflow 3.10's `mlflow.update_assessment(trace_id, assessment_id, assessment)` (confirmed available). This mutates the existing assessment in place — unlike `override_feedback` which appends a new entry with the old marked invalid. Mutation avoids MemAlign's `dspy_utils` seeing multiple entries per judge for the same user and triggering "Found N human assessments" warnings.

For each rubric-question sync:

1. Look up existing `(name, source_id)` assessment — now capture `assessment_id` and current `value` too
2. **If no existing entry** → `log_feedback` (unchanged)
3. **If existing entry, same value** → skip, increment `skipped` count (unchanged — preserves "Duplicate feedback entries skipped" for no-op resync)
4. **If existing entry, different value** → construct `Feedback(name, value, source, rationale)`, call `mlflow.update_assessment(trace_id, assessment_id, feedback)` with retry (new behavior)

On `update_assessment` failure across retries: log a warning, do NOT fall through to `log_feedback` (would create a duplicate that MemAlign would see). Worst case is staleness in MLflow, which is strictly better than duplication or total loss.

## Files changed

### Modified
| File | Change |
|------|--------|
| `server/services/database_service.py` | `existing_assessments: set[(name, source_id)]` → `dict[(name, source_id), tuple[str, Any]]` = `(assessment_id, value)`. Replace skip logic at `:2143` (multi-question loop) and `:2181` (legacy rating loop) with three-way branch. Extend returned `result` to include `{'logged', 'skipped', 'updated'}` counts. |
| `tests/unit/services/test_annotation_mlflow_sync.py` | Split `test_existing_assessment_skipped` into `test_same_value_resync_skipped` (old semantics preserved) and `test_different_value_edit_overwrites` (new behavior verifies `update_assessment` called once). Add `test_update_failure_does_not_log_duplicate`. |

### No new files, no UI changes, no schema migration

## Tasks (TDD)

### Task 1 — Extend `existing_assessments` to capture assessment_id + value
- [ ] Change from `set[(name, source_id)]` to `dict[(name, source_id), tuple[str, Any]]` = `(assessment_id, value)`
- [ ] Extract `assessment.assessment_id` and `assessment.feedback.value` from each assessment
- [ ] Gracefully handle missing `assessment_id` (defensive — shouldn't happen on MLflow 3.x but don't crash): exclude from dict so downstream falls through to "log new"
- [ ] Existing tests should still pass — this is a data-fetch change only; downstream logic unchanged yet

### Task 2 — Multi-question loop: three-way branch with `update_assessment`
- [ ] Replace skip logic at `:2143` with:
  - No existing entry → proceed to `log_feedback` (unchanged)
  - Existing entry with same value → skip, increment `skipped` count (unchanged semantics)
  - Existing entry with different value → construct `Feedback(name, value, source, rationale)`, call `mlflow.update_assessment(trace_id, assessment_id, feedback)` wrapped in `_retry_mlflow_operation`
- [ ] On update failure: log warning, do NOT fall through to `log_feedback`
- [ ] `test_existing_assessment_skipped` will fail after this task (expected — Task 4 fixes it)

### Task 3 — Legacy single-rating loop: same treatment
- [ ] Apply the same three-way branch at `:2181`
- [ ] If the two loops become structurally similar, extract a private helper `_upsert_feedback(...)` — only if net LOC drops

### Task 4 — Split and update the duplicate-detection tests
- [ ] Split `TestDuplicateDetection.test_existing_assessment_skipped` into:
  - `test_same_value_resync_skipped` — mock existing assessment with `feedback.value == 4` and incoming rating == 4: no `log_feedback`, no `update_assessment`, `result['skipped'] == 1`
  - `test_different_value_edit_overwrites` — mock existing with `value == 4`, incoming rating == 2: `update_assessment` called once with the new `Feedback`, `log_feedback` NOT called, `result['updated'] == 1`
- [ ] Add `test_update_failure_does_not_log_duplicate` — `update_assessment` raises on all retries; verify `log_feedback` is NOT called, warning logged
- [ ] Update the `@pytest.mark.req` tag on the class to reflect refined semantics (e.g., `"Annotation edits propagate to MLflow via update_assessment; identical re-syncs skip"`)

### Task 5 — Full verification + commit
- [ ] `uv run pytest tests/unit/ --no-cov` → all green
- [ ] Commit with reference to this plan

## Out of scope

- **Spec content update** — ANNOTATION_SPEC.md wording refinement belongs on the main-based forward-port PR
- **Schema migration** — none required
- **UI changes** — none. Frontend already detects and sends edits; the bug is purely in the sync side
- **Retroactive MLflow cleanup** — annotations edited *before* deploy still have stale MLflow values. This fix only corrects going-forward behavior. If retroactive cleanup is needed, add a one-shot admin script in a follow-up
- **Post-discussion re-annotation history preservation** — see Future Work section below

## Risk notes

1. **Databricks MLflow treats `name` as immutable on update** (discovered during dnb-jbw deploy testing). Passing a non-null `name` in the Feedback — even the same name as the existing assessment — triggers `INVALID_PARAMETER_VALUE: The field 'assessmentName' may not be updated`. Workaround: construct `Feedback(name=None, value=X, source=Y, rationale=Z)`. The Databricks REST store at `databricks_rest_store.py:638` uses a field-mask pattern — `name=None` excludes `"assessment_name"` from the update mask, so the server preserves the original name and only mutates the provided fields. Verified in MLflow 3.10 source and deploy testing.
2. **`update_assessment` timestamps**: the MLflow docs say mutation happens in place. Whether `create_time_ms` is updated or preserved isn't explicit — needs to be verified against a real MLflow instance during `dnb-jbw` testing. Either way, MemAlign's "most recent wins" rule still picks the updated entry.
2. **MemAlign interaction**: with this fix, each `(judge_name, user_id, trace)` tuple has exactly one assessment — no more "Found N human assessments" warnings from same-user re-annotation. Multi-SME warnings (N different users on the same trace) remain, as expected.
3. **Missing `assessment_id`**: if a legacy assessment somehow lacks an ID (defensive — shouldn't happen on MLflow 3.x), we fall through to `log_feedback`, creating a duplicate. MemAlign's warning would surface this if it ever happened.
4. **Rationale scoping**: rationale is currently only attached to the first rubric question's feedback (separate bug — Fix 1 addresses this). Under Fix 2, editing question 1's comment will correctly overwrite the MLflow rationale; editing other questions' rationale still won't since the rationale is not attached in the first place. Fix 1 resolves the underlying gap.

## Forward-port note

On `main`, `_sync_annotation_with_mlflow` may have evolved post-auth-migration. The three-way branch logic should port cleanly — MLflow's Feedback/Assessment API shape is version-stable in 3.x. Spec wording update to disambiguate "duplicate" from "identical-value" goes in the main-based PR, along with the Future Work section append for post-discussion re-annotation.

---

## Future Work — post-discussion re-annotation (round tracking)

### Current implementation

Always uses `update_assessment` on edit. This treats all edits as **in-session corrections** (the common case) and optimizes for clean MLflow state and clean MemAlign alignment logs.

### Not captured today

**Post-discussion re-annotation**, where an SME revises their rating based on a rubric clarification or group discussion. In that case, the pre-edit value has analytical meaning:
- Measuring how SMEs shifted after discussion (calibration effect)
- Distinguishing rubric ambiguity (resolved by clarification) from genuine disagreement (persists)
- Detecting groupthink vs. principled re-evaluation
- Comparing IRR across rounds

Under this hotfix, those analyses are impossible because pre-edit values are gone from MLflow.

### Proposed approach when this becomes a requirement

1. **Schema**: add `WorkshopDB.last_snapshot_at: datetime | None` column
2. **UI**: facilitator-triggered "Snapshot before next round" button writes the current timestamp to that column
3. **Sync logic**: `_sync_annotation_with_mlflow` becomes:

   ```python
   if workshop.last_snapshot_at and existing.create_time_ms < workshop.last_snapshot_at:
       # Pre-snapshot value — preserve it
       mlflow.override_feedback(trace_id, assessment_id, value=new_val, ...)
   else:
       # No snapshot, or edit is post-snapshot — mutate
       mlflow.update_assessment(trace_id, assessment_id, new_feedback)
   ```

4. **Analysis**: queries can filter `trace.info.assessments` by `valid=False` to see pre-snapshot ratings per SME per trace. MemAlign will still see both entries for each user (noise) but pick the valid/most-recent one. Consider follow-up to `dspy_utils` upstream to filter by `valid`.

### Why not bundled into this hotfix

- Requires a schema migration (protected on this branch; adds complexity to customer deploy)
- Requires new UI for the facilitator snapshot button
- Customer has not requested post-discussion analysis
- The value-compare skip in this hotfix avoids MLflow churn on bulk resyncs, so current behavior is safe for multi-round workshops — edits just won't preserve history

### Where this should be tracked upstream

- **Plan file (here)**: technical detail + rationale
- **GitHub issue on upstream**: team visibility and backlog triage
- **`specs/ANNOTATION_SPEC.md` "Future Work (Out of Scope)"**: canonical record (appended as part of the main-based forward-port PR)
