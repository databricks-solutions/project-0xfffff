# Spec Test Coverage Map

**Generated**: 2026-03-13 10:35:28

This report shows test coverage for each specification's success criteria.

## Test Pyramid Summary

| Type | Count | Description |
|------|-------|-------------|
| Unit | 136 | pytest unit tests, Vitest tests |
| Integration | 0 | pytest with real DB/API |
| E2E (Mocked) | 0 | Playwright with mocked API |
| E2E (Real) | 19 | Playwright with real API |

## Coverage Summary

| Spec | Reqs | Covered | Cover% | Unit | Int | E2E-M | E2E-R | BE-only |
|------|------|---------|--------|------|-----|-------|-------|---------|
| [ANNOTATION_SPEC](#annotation-spec) | 21 | 13 | 61% | 47 | 0 | 0 | 10 | **7** |
| [JUDGE_EVALUATION_SPEC](#judge-evaluation-spec) | 25 | 25 | 100% | 89 | 0 | 0 | 9 | **18** |

**Total**: 38/46 requirements covered (82%)

---

## ANNOTATION_SPEC

**Coverage**: 13/21 requirements (61%)

### Uncovered Requirements

- [ ] No toast when navigating without changes
- [ ] Comments display with proper line breaks
- [ ] Bulk resync re-exports all annotations when rubric titles change
- [ ] Failed saves are queued and retried automatically with exponential backoff
- [ ] Navigation is optimistic (UI advances immediately, save completes in background)
- [ ] Navigation debounced at 300ms to prevent duplicate saves
- [ ] Freeform question responses are optional (not required for navigation)
- [ ] Freeform responses are encoded in the comment field as JSON

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: Users can edit previously submitted annotations (unit)
- :warning: Annotations sync to MLflow as feedback on save (one entry per rubric question) (unit)
- :warning: MLflow trace tagged with `label: "align"` and `workshop_id` on annotation (unit)
- :warning: Feedback source is HUMAN with annotator's user_id (unit)
- :warning: Annotation comment maps to MLflow feedback rationale (unit)
- :warning: Duplicate feedback entries are detected and skipped (unit)
- :warning: Legacy single-rating format loads correctly alongside multi-rating format (unit)

### Covered Requirements

- [x] Users can edit previously submitted annotations (unit) **[BE-only]**
- [x] Changes automatically save on navigation (Next/Previous) (e2e-real, unit)
- [x] Toast shows "Annotation saved!" for new submissions (e2e-real)
- [x] Toast shows "Annotation updated!" only when changes detected (e2e-real)
- [x] Multi-line comments preserved throughout the stack (e2e-real)
- [x] Next button enabled for annotated traces (allows re-navigation) (e2e-real)
- [x] Annotation count reflects unique submissions (not re-submissions) (e2e-real, unit)
- [x] Annotations sync to MLflow as feedback on save (one entry per rubric question) (unit) **[BE-only]**
- [x] MLflow trace tagged with `label: "align"` and `workshop_id` on annotation (unit) **[BE-only]**
- [x] Feedback source is HUMAN with annotator's user_id (unit) **[BE-only]**
- [x] Annotation comment maps to MLflow feedback rationale (unit) **[BE-only]**
- [x] Duplicate feedback entries are detected and skipped (unit) **[BE-only]**
- [x] Legacy single-rating format loads correctly alongside multi-rating format (unit) **[BE-only]**

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/routers/test_annotation_crud.py` (test_upsert_creates_new_annotation) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_create_discovery_note) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_create_annotation_note) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_create_note_defaults_to_discovery_phase) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_create_note_without_trace_id) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_create_note_missing_workshop_returns_404) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_create_note_service_error_returns_500) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_get_all_notes) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_get_notes_filtered_by_user) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_get_notes_filtered_by_discovery_phase) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_get_notes_filtered_by_annotation_phase) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_get_notes_filtered_by_user_and_phase) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_get_notes_missing_workshop_returns_404) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_delete_note_success) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_delete_nonexistent_note_returns_404) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_delete_note_missing_workshop_returns_404) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_multiple_notes_same_user_same_trace_append) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_notes_from_both_phases_coexist) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_toggle_participant_notes_enables) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_toggle_participant_notes_disables) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_toggle_missing_workshop_returns_404) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_multiple_annotators_notes_during_annotation) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_participant_note_create_model_defaults) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_participant_note_create_model_with_annotation_phase) [unit]
- `tests/unit/routers/test_participant_notes.py` (test_participant_note_model_serialization) [unit]
- `tests/unit/services/test_database_service_participant_notes.py` (test_add_participant_note_discovery) [unit]
- `tests/unit/services/test_database_service_participant_notes.py` (test_add_participant_note_annotation) [unit]
- `tests/unit/services/test_database_service_participant_notes.py` (test_add_participant_note_without_trace) [unit]
- `tests/unit/services/test_database_service_participant_notes.py` (test_add_participant_note_always_creates_new) [unit]
- `tests/unit/services/test_database_service_participant_notes.py` (test_get_participant_notes_no_filters) [unit]
- `tests/unit/services/test_database_service_participant_notes.py` (test_get_participant_notes_filtered_by_user) [unit]
- `tests/unit/services/test_database_service_participant_notes.py` (test_get_participant_notes_filtered_by_phase) [unit]
- `tests/unit/services/test_database_service_participant_notes.py` (test_get_participant_notes_filtered_by_user_and_phase) [unit]
- `tests/unit/services/test_database_service_participant_notes.py` (test_get_participant_notes_empty_result) [unit]
- `tests/unit/services/test_database_service_participant_notes.py` (test_delete_participant_note_success) [unit]
- `tests/unit/services/test_database_service_participant_notes.py` (test_delete_participant_note_not_found) [unit]

- [x] Participants only see traces in current active discovery dataset (e2e-real, unit)
- [x] When new discovery round starts, old traces hidden (not deleted) (e2e-real)
- [x] Switching between discovery rounds hides/shows appropriate traces (unit) **[BE-only]**
- [x] Phase/round context properly scoped in database (unit) **[BE-only]**
- [x] Annotation traces randomized per (user_id, trace_set) pair (unit) **[BE-only]**
- [x] Randomization persistent across page reloads for same trace set (e2e-real, unit)
- [x] When annotation dataset changes mid-round, new traces appended (unit) **[BE-only]**
- [x] When annotation round changes, full re-randomization applied (unit) **[BE-only]**
- [x] Randomization context includes phase and round info (unit) **[BE-only]**
- [x] Dataset operations (union, subtract) work correctly and maintain audit trail (unit) **[BE-only]**
- [x] Multiple participants can see same trace with different orders (unit) **[BE-only]**
- [x] Assignment metadata properly tracks all context (unit)
- [x] Inter-rater reliability (IRR) can be measured (same traces, different orders) (unit) **[BE-only]**

**Coverage**: 25/25 requirements (100%)

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: Fallback conversion handles Likert-style returns for binary (unit)
- :warning: Evaluation results persisted to database (unit)
- :warning: Results reload correctly in UI (unit)
- :warning: Judge prompt auto-derived from rubric questions (unit)
- :warning: Per-question judge_type parsed from rubric (`[JUDGE_TYPE:xxx]`) (unit)
- :warning: Binary rubrics evaluated with 0/1 scale (not 1-5) (unit)
- :warning: Re-evaluate loads registered judge with aligned instructions (unit)
- :warning: Uses same model as initial auto-evaluation (unit)
- :warning: Results stored against correct prompt version (unit)
- :warning: Alignment jobs run asynchronously (unit)
- :warning: MemAlign distills semantic memory (guidelines) (unit)
- :warning: Aligned judge registered to MLflow (unit)
- :warning: Metrics reported (guideline count, example count) (unit)
- :warning: Works for both Likert and Binary scales (unit)
- :warning: Krippendorff's Alpha calculated correctly (unit)
- :warning: Cohen's Kappa calculated for rater pairs (unit)
- :warning: Handles edge cases (no variation, single rater) (unit)
- :warning: Updates when new annotations added (unit)

### Covered Requirements

- [x] Likert judges return values 1-5 (unit)
- [x] Binary judges return values 0 or 1 (unit)
- [x] Fallback conversion handles Likert-style returns for binary (unit) **[BE-only]**
- [x] Evaluation results persisted to database (unit) **[BE-only]**
- [x] Results reload correctly in UI (unit) **[BE-only]**
- [x] Auto-evaluation runs in background when annotation phase starts (e2e-real, unit)
- [x] Judge prompt auto-derived from rubric questions (unit) **[BE-only]**
- [x] Per-question judge_type parsed from rubric (`[JUDGE_TYPE:xxx]`) (unit) **[BE-only]**
- [x] Binary rubrics evaluated with 0/1 scale (not 1-5) (unit) **[BE-only]**
- [x] Auto-evaluation model stored for re-evaluation consistency (e2e-real)
- [x] Results appear in Judge Tuning page (e2e-real)
- [x] Re-evaluate loads registered judge with aligned instructions (unit) **[BE-only]**
- [x] Uses same model as initial auto-evaluation (unit) **[BE-only]**
- [x] Spinner stops when re-evaluation completes (e2e-real)
- [x] Results stored against correct prompt version (unit) **[BE-only]**
- [x] Pre-align and post-align scores directly comparable (e2e-real)
- [x] Alignment jobs run asynchronously (unit) **[BE-only]**
- [x] MemAlign distills semantic memory (guidelines) (unit) **[BE-only]**
- [x] Aligned judge registered to MLflow (unit) **[BE-only]**
- [x] Metrics reported (guideline count, example count) (unit) **[BE-only]**
- [x] Works for both Likert and Binary scales (unit) **[BE-only]**
- [x] Krippendorff's Alpha calculated correctly (unit) **[BE-only]**
- [x] Cohen's Kappa calculated for rater pairs (unit) **[BE-only]**
- [x] Handles edge cases (no variation, single rater) (unit) **[BE-only]**
- [x] Updates when new annotations added (unit) **[BE-only]**

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/routers/test_workshops_begin_annotation.py` (test_begin_annotation_requires_rubric) [unit]
- `tests/unit/routers/test_workshops_re_evaluate.py` (test_re_evaluate_tags_traces_before_evaluation) [unit]
- `tests/unit/routers/test_workshops_re_evaluate.py` (test_re_evaluate_tags_traces_fallback_when_no_active_annotation_ids) [unit]
- `tests/unit/services/test_alignment_service.py` (test_likert_agreement_metric_from_store_is_one_when_equal) [unit]
- `tests/unit/services/test_cohens_kappa.py` (test_interpret_cohens_kappa_bucket_edges) [unit]
- `tests/unit/services/test_cohens_kappa.py` (test_is_cohens_kappa_acceptable_default_threshold) [unit]
- `tests/unit/services/test_evaluation_tag_overwrite.py` (test_search_tagged_traces_uses_dedicated_align_key) [unit]
- `tests/unit/services/test_evaluation_tag_overwrite.py` (test_run_evaluation_yields_error_when_no_eval_tagged_traces) [unit]
- `tests/unit/services/test_irr_utils.py` (test_format_irr_result_rounding_and_ready_flag) [unit]
- `client/tests/e2e/evaluation-tagging.spec.ts` (re-evaluate endpoint tags traces before searching MLflow) [e2e-real]
- `client/tests/e2e/evaluation-tagging.spec.ts` (begin-annotation auto-eval creates job and attempts tagging) [e2e-real]
- `client/tests/e2e/evaluation-tagging.spec.ts` (begin-annotation without eval model skips auto-eval) [e2e-real]

---

## How to Tag Tests

### pytest
```python
@pytest.mark.spec("SPEC_NAME")
@pytest.mark.req("Requirement text from success criteria")
def test_something(): ...
```

### Playwright
```typescript
test.use({ tag: ['@spec:SPEC_NAME', '@req:Requirement text'] });
```

### Vitest
```typescript
// @spec SPEC_NAME
// @req Requirement text from success criteria
```
