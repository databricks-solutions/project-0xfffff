# Per-Judge Rationale — DNB Customer Hotfix

**Spec:** [ANNOTATION_SPEC](../../specs/ANNOTATION_SPEC.md) — MLflow Sync + Comment Handling success criteria
**Base commit:** `090df1d` (customer's deployed version)
**Branch:** `hotfix/dnb-alignment`

## Goal

Collect and sync an SME's rationale **per rubric question**, not just one rationale attached to the first question. After this fix, each MLflow `log_feedback` entry carries the rationale specific to that criterion — enabling MemAlign's guideline distillation to read per-judge reasoning. Also clear DNB's existing misattributed rationales from MLflow so stale cross-judge text stops feeding alignment.

## Audit-driven scope reduction

A separate `comment` consumer audit identified that only 2 of 5 current `annotation.comment` readers are live in production. The other 3 are dead-store / dead-effect / dead-UI paths. This means:

- **No need for an Option A2 "derived comment" shim** — bystanders don't need `comment` to stay populated with rationale text
- **No Phase 2 follow-up plan needed** — the A1 targets (alignment's `sme_feedback`, discovery's `aggregate_sme_feedback_for_trace`, `AnnotationReviewPage`) are all unused code paths
- **`comment` stays as pure freeform packing** going forward — no semantic overload, no drift risk

Live consumers requiring updates:
1. **MLflow sync** (`_sync_annotation_with_mlflow` at `:2211`) — needs per-question rationale wiring
2. **Edit-view load** (`parseLoadedComment` at `AnnotationDemo.tsx:298`) — needs to prefer `rationales` when present

## Root cause

Three layers scope rationale to "one per annotation":

- **UI** (`AnnotationDemo.tsx:1366`): single "Feedback for Judge Alignment" textarea. `comment: string` state.
- **Data model** (`server/database.py:364`): `annotations.comment: Text` — one field per row.
- **Sync** (`database_service.py:2286`): `rationale_for_this = rationale if (logged_count + updated_count) == 0 else None` — singular comment attached only to first log_feedback/update call.

Result: question 1's MLflow feedback carries the comment as `rationale`. Questions 2+ have `rationale=None`. MemAlign's distillation on those judges runs without per-judge reasoning.

## Approach

**UI**: Remove the singular bottom "Feedback for Judge Alignment" textarea. Add a "Why this rating?" textarea inline with each Likert/Binary rubric question. Freeform unchanged. On legacy annotation load, show a read-only banner displaying the original cross-judge comment; SMEs copy/paste into per-criterion fields as needed.

**Data**:
- New `rationales: Dict[str, str]` column (per-question rationale dict)
- New `legacy_comment: Text` column (one-time archival snapshot of the pre-Fix-1 `comment`)
- Existing `comment` column continues as the freeform-answers packing container (no dual-duty, no derivation)

**Sync logic**:
- `rationales is not None` → per-question lookup from `rationales` dict (includes explicit empty-string clears)
- `rationales is None` (legacy annotation, never touched post-deploy) → `rationale_for_this = ""` to clear misattributed MLflow data (NOT propagate the cross-judge comment)
- Skip check compares both `value` AND `rationale`, so re-labeling (same rating, new rationale) triggers `update_assessment`

**Deploy ops**: after deploy, customer triggers `POST /workshops/{id}/resync-annotations` once per workshop. This propagates the legacy-fallback clear across all existing annotations, zeroing out misattributed MLflow rationales.

## UX wording (approved)

**Per-question textarea label**: `Why this rating?` *(Optional)*

**Descriptive paragraph** (once, at the top of the rubric-questions block):
> **Important:** Your explanations below will be used to train and align the AI judge on each criterion. For each rating, focus on *why* you scored it that way — what specific aspects of the response influenced your score? This helps the AI judge learn to evaluate similarly.

**Per-question textarea placeholder**:
> Explain your reasoning for this *\{criterion name\}* rating. What specific aspects of the response influenced your score?

**Legacy-annotation banner** (amber background, at top of rubric block, above the descriptive paragraph):
> **Your previous feedback**
>
> "\{legacy_comment user-text portion\}"
>
> This comment was written before per-criterion rationales. Please redistribute it to the relevant criteria below (select and copy as needed), and edit to fit each criterion.
>
> \[Dismiss\]

No copy buttons — SMEs handle selection/paste themselves using native browser interactions.

## Files changed

### Backend
| File | Change |
|------|--------|
| `migrations/versions/0019_add_annotation_rationales.py` | New. Adds `rationales JSON NULL` and `legacy_comment TEXT NULL` to `annotations`. Backfill: `UPDATE annotations SET legacy_comment = comment WHERE comment IS NOT NULL AND legacy_comment IS NULL`. down_revision = `0018_add_summarization_jobs`. |
| `server/database.py` | `AnnotationDB`: add `rationales = Column(JSON, nullable=True)` and `legacy_comment = Column(Text, nullable=True)`. Bootstrap `ALTER TABLE` blocks (mirror `ratings` pattern). |
| `server/models.py` | `Annotation`: add `rationales: Optional[Dict[str, str]] = None` and `legacy_comment: Optional[str] = None` (read-only in API responses). `AnnotationCreate`: add `rationales` only — NOT `legacy_comment` (clients cannot write it). |
| `server/services/database_service.py` | `add_annotation` (3 paths at `:1912`, `:1940`, `:1988`): propagate `annotation_data.rationales` → `db_annotation.rationales`. In `_sync_annotation_with_mlflow`: (1) extend `existing_assessments` to capture rationale `(assessment_id, value, rationale)`; (2) resolve `rationale_for_this` via `is not None` check with legacy-clear fallback; (3) skip check compares both value AND rationale. |

### Frontend
| File | Change |
|------|--------|
| `client/src/pages/AnnotationDemo.tsx` | Rename state `comment` → `rationales: Record<string, string>`. Initialize `rationales` on load from `annotation.rationales` if non-null, else all Likert/Binary `question.id` keys → `""`. Remove bottom singular textarea (`:1355-1377`). Add descriptive paragraph at top of rubric block. Add per-question "Why this rating?" textarea for Likert/Binary items. Add legacy-comment banner with dismiss (amber bg, no copy buttons) when `annotation.legacy_comment` is set and banner not locally dismissed. `parseLoadedComment` continues parsing `comment` for freeform responses only. Update `hasAnnotationChanged` with empty-normalization so opening a legacy annotation doesn't register as a change. |
| `client/src/client/models/AnnotationCreate.ts` | Add `rationales?: Record<string, string>` (hand-edit if codegen lags). |
| `client/src/client/models/Annotation.ts` | Add `rationales?: Record<string, string>` and `legacy_comment?: string`. |

### Tests
| File | Change |
|------|--------|
| `tests/unit/services/test_annotation_mlflow_sync.py` | New class `TestPerQuestionRationale`: `test_per_question_rationale_syncs_correctly`, `test_legacy_null_rationales_clears_mlflow` (verifies `update_assessment` called with `rationale=""` for legacy rows), `test_rationale_change_triggers_update`, `test_same_value_same_rationale_skipped`. |
| `tests/unit/services/test_database_service_feedback.py` (or equivalent) | Verify `rationales` round-trips on create/update. Verify `legacy_comment` populated by backfill and readable via API; verify API writes to `AnnotationCreate` do NOT set `legacy_comment` (read-only). |

## Tasks (TDD)

### Task 1 — DB migration + columns
- [ ] Write `migrations/versions/0019_add_annotation_rationales.py`:
  - Upgrade: `ADD COLUMN rationales JSON NULL` + `ADD COLUMN legacy_comment TEXT NULL` + backfill `UPDATE annotations SET legacy_comment = comment WHERE comment IS NOT NULL`
  - Downgrade: drop both columns
- [ ] Add columns to `AnnotationDB`
- [ ] Add bootstrap `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` blocks (mirror `ratings` pattern)
- [ ] `uv run alembic upgrade head` → head = 0019; verify columns exist; verify backfill populated `legacy_comment` on rows with non-null `comment`

### Task 2 — API models
- [ ] `Annotation`: add `rationales`, `legacy_comment`
- [ ] `AnnotationCreate`: add `rationales` only (NOT `legacy_comment`)
- [ ] Existing tests still pass

### Task 3 — Persistence
- [ ] In `add_annotation` paths 1-3, propagate `annotation_data.rationales` → `db_annotation.rationales`
- [ ] Verify `legacy_comment` is preserved across updates (never written by runtime — only migration sets it)
- [ ] Returned `Annotation` model includes both `rationales` and `legacy_comment`
- [ ] Round-trip test

### Task 4 — Sync logic: per-question rationale + rationale-aware skip + legacy clear
- [ ] Extend `existing_assessments` fetch to capture rationale:
  ```python
  existing_rationale = getattr(assessment, 'rationale', None)
  existing_assessments[(name, source_id)] = (assessment_id, existing_value, existing_rationale)
  ```
- [ ] Replace rationale resolution in multi-question loop:
  ```python
  if annotation_db.rationales is not None:
      rationale_for_this = annotation_db.rationales.get(question_id, "")
  else:
      # Legacy annotation: clear misattributed MLflow rationale
      rationale_for_this = ""
  ```
- [ ] Skip check compares both (with None/empty normalization):
  ```python
  existing_norm = existing_rationale or ""
  new_norm = rationale_for_this or ""
  if existing_value == rating_value and existing_norm == new_norm:
      skipped_count += 1
      continue
  ```
- [ ] Apply same pattern to legacy single-rating loop
- [ ] Tests:
  - `test_per_question_rationale_syncs_correctly`
  - `test_legacy_null_rationales_clears_mlflow`
  - `test_rationale_change_triggers_update`
  - `test_same_value_same_rationale_skipped`

### Task 5 — Frontend state rename + load initialization
- [ ] `const [comment, setComment]` → `const [rationales, setRationales]: Record<string, string>`
- [ ] Load initialization:
  - If `annotation.rationales is not null` → load directly
  - Else → initialize with all Likert/Binary `question.id` keys mapped to `""`
- [ ] `parseLoadedComment` unchanged — still parses `comment` for freeform responses
- [ ] `hasAnnotationChanged` with empty-normalization:
  ```typescript
  const normalizeRationales = (r: Record<string, string> | null | undefined) => {
    if (!r) return {};
    return Object.fromEntries(Object.entries(r).filter(([_, v]) => v !== ''));
  };
  // Compare via JSON.stringify of normalized dicts
  ```
  Opening a legacy annotation (null → all-empty dict) doesn't register as a change; only user-typed non-empty values do.
- [ ] Update every `comment` / `setComment` site in `AnnotationDemo.tsx` → `rationales` / `setRationales`
- [ ] Save-queue / retry state types carry `rationales: Record<string, string>` instead of `comment: string`
- [ ] Submit payload includes `rationales` field

### Task 6 — Frontend UI: per-question textarea + copy
- [ ] Add descriptive paragraph at top of rubric-questions block (approved wording)
- [ ] For each rubric question of type `likert` or `binary`, render a `<Textarea>` below the rating widget:
  - Label: `Why this rating?` *(Optional)*
  - Placeholder: `Explain your reasoning for this {question.title} rating. What specific aspects of the response influenced your score?`
  - `value={rationales[question.id] || ''}`
  - `onChange={e => setRationales(prev => ({...prev, [question.id]: e.target.value}))}`
- [ ] Freeform questions unchanged
- [ ] Remove lines 1355-1377 (bottom singular block)

### Task 7 — Legacy-comment banner (simplified)
- [ ] Parse freeform markers out of `annotation.legacy_comment` (reuse existing `parseLoadedComment` logic on `legacy_comment` string) to extract the user-text portion
- [ ] Render banner at top of rubric block (above the descriptive paragraph) when:
  - `annotation.legacy_comment` is set
  - User-text portion is non-empty
  - Component-local `legacyBannerDismissed` state is false
- [ ] Banner style: amber background, border, native text selection enabled (use blockquote or `<p>` — not a `Textarea`)
- [ ] Banner content: heading "Your previous feedback", blockquote of user-text, explanation paragraph per approved wording, `[Dismiss]` button
- [ ] No copy buttons, no handlers — SMEs select + copy + paste manually
- [ ] Dismissal is component-local; resets on page reload (resetting state on reload is intentional — banner re-appears for not-yet-re-labeled annotations until SME actually saves new rationales)
- [ ] Tests: banner renders when legacy_comment non-null, banner hidden when legacy_comment null, dismiss hides it, doesn't trigger save

### Task 8 — Regenerate client types (or hand-edit)
- [ ] Run codegen if present; otherwise hand-edit `AnnotationCreate.ts` + `Annotation.ts` to add new fields

### Task 9 — Full verification + commit
- [ ] `uv run pytest tests/unit/ --no-cov` → all green
- [ ] `uv run alembic current` → `0019_add_annotation_rationales`
- [ ] `cd client && npm run build` → succeeds
- [ ] Manual dev smoke:
  - Fresh annotation: per-question fields render, no banner, submit writes `rationales`
  - Edit legacy annotation: banner appears, per-question fields empty, dismiss hides banner
  - Edit legacy, type rationales, save: `rationales` populated, `legacy_comment` preserved, `comment` reflects freeform only
  - Re-open after save: no banner (rationales now populated)
- [ ] Commit with reference to this plan

## Out of scope

- **Phase 2 / Option A1 (update dead bystanders)** — dropped. `alignment_service.sme_feedback`, `aggregate_sme_feedback_for_trace`, `AnnotationReviewPage` are unused code paths per the audit.
- **Derived `comment` from `rationales`** — not needed. `comment` stays as pure freeform packing.
- **Backfilling `rationales[first_q] = comment_stripped`** — deliberately skipped. DNB wants the wrong-attribution cross-judge rationale cleared on q1, not preserved as a no-op.
- **Spec content update** — ANNOTATION_SPEC.md wording refinement belongs on the main-based forward-port PR.
- **Facilitator UI to surface re-labeling progress** — future work.
- **Freeform-type rationale** — freeform has its own answer textarea.
- **E2E tests** — unit tests cover sync; UI verified manually on dnb-jbw.

## Risk notes

1. **Legacy-fallback clear is destructive for MLflow**: any pre-Phase-1 rationale on q1 gets cleared when the customer runs resync. For DNB this is desired ("rewrite from scratch"). A different customer might disagree; document in deploy notes.
2. **`legacy_comment` is never written at runtime** — only by migration backfill. Clean design; no drift risk, no concurrent-write considerations.
3. **Rationale-compare depends on MLflow returning rationale in `get_trace`**: low risk per MLflow 3.x docs — Assessment entities come back with rationale populated.
4. **Empty-dict vs undefined in `hasAnnotationChanged`**: normalization treats null/empty/missing as equivalent. Prevents spurious saves on view-only legacy-annotation navigation.
5. **Banner appears on every legacy-annotation open until SME saves new rationales**: intentional. Dismiss is session-scoped. SME can dismiss repeatedly without committing.
6. **Interaction with Fix 2**: clean. Fix 2 handles value-changed updates; Phase 1 extends to rationale-changed updates.
7. **Migration 0019 safety**: two nullable columns + a backfill UPDATE. Additive; no table rewrite on SQLite or Lakebase. Clean rollback via DROP COLUMN in downgrade.
8. **TS codegen lag**: autogenerated models may not pick up new fields. Hand-edit fallback.

## Deploy ops for customer

After merging and deploying Fix 1 to `dnb-jbw`:

1. **Run alembic migration** — happens automatically via app bootstrap (0019 added to chain). Populates `legacy_comment` from existing `comment` values.
2. **Trigger bulk MLflow cleanup**: `POST /workshops/{each-workshop-id}/resync-annotations` once per workshop. Legacy fallback in sync sends `rationale=""` to MLflow for every existing annotation's assessments, clearing misattributed cross-judge text.
3. **Tell SMEs** (out-of-band): "When you edit an existing annotation, you'll see your previous comment at the top of the form. Select and copy the relevant portions into the per-criterion rationale fields below, and edit to fit each criterion."

## Forward-port note

On main, `AnnotationDemo.tsx` may have evolved (TanStack refactor, eval mode). The rename + per-question textarea + banner ports cleanly in principle. The main-based PR should also:

- Update `ANNOTATION_SPEC.md`'s "MLflow Feedback Schema Alignment" table: `rationales[question_id]` → MLflow `rationale` per judge_name
- Add Success Criterion: "Per-rubric-question rationale is collected and syncs to the matching MLflow assessment"
- Update "Comment Handling" section to clarify `comment` is pure freeform packing

---

## Future Work (post-hotfix, not required for DNB)

1. **Facilitator "re-labeling progress" dashboard widget** — count of annotations with `rationales IS NULL AND legacy_comment IS NOT NULL` per workshop. Lets facilitators track SME migration progress.
2. **Clean up dead code paths** identified in the audit: `alignment_service.sme_feedback`, `aggregate_sme_feedback_for_trace`, duplicate `AnnotationReviewPage.tsx` copies.
3. **Retire `legacy_comment`** — once customer is done with re-labeling and has archived the data externally, a future migration can drop the column.
