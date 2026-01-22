# Spec Test Coverage Map

**Generated**: 2026-01-22 13:36:18

This report shows test coverage for each specification's success criteria.

## Test Pyramid Summary

| Type | Count | Description |
|------|-------|-------------|
| Unit | 100 | pytest unit tests, Vitest tests |
| Integration | 0 | pytest with real DB/API |
| E2E (Mocked) | 7 | Playwright with mocked API |
| E2E (Real) | 44 | Playwright with real API |

## Coverage Summary

| Spec | Reqs | Covered | Cover% | Unit | Int | E2E-M | E2E-R |
|------|------|---------|--------|------|-----|-------|-------|
| [ANNOTATION_SPEC](#annotation-spec) | 9 | 2 | 22% | 4 | 0 | 0 | 5 |
| [ASSISTED_FACILITATION_SPEC](#assisted-facilitation-spec) | 7 | 7 | 100% | 26 | 0 | 5 | 34 |
| [AUTHENTICATION_SPEC](#authentication-spec) | 7 | 4 | 57% | 8 | 0 | 1 | 0 |
| [BUILD_AND_DEPLOY_SPEC](#build-and-deploy-spec) | 15 | 1 | 6% | 1 | 0 | 0 | 0 |
| [DATASETS_SPEC](#datasets-spec) | 9 | 3 | 33% | 3 | 0 | 0 | 0 |
| [DESIGN_SYSTEM_SPEC](#design-system-spec) | 7 | 1 | 14% | 1 | 0 | 0 | 0 |
| [DISCOVERY_TRACE_ASSIGNMENT_SPEC](#discovery-trace-assignment-spec) | 13 | 4 | 30% | 4 | 0 | 1 | 0 |
| [JUDGE_EVALUATION_SPEC](#judge-evaluation-spec) | 13 | 10 | 76% | 29 | 0 | 0 | 0 |
| [RUBRIC_SPEC](#rubric-spec) | 7 | 1 | 14% | 1 | 0 | 0 | 0 |
| [TRACE_DISPLAY_SPEC](#trace-display-spec) | 0 | 0 | 100% | 23 | 0 | 0 | 5 |
| [UI_COMPONENTS_SPEC](#ui-components-spec) | 16 | 0 | 0% | 0 | 0 | 0 | 0 |

**Total**: 33/103 requirements covered (32%)

---

## ANNOTATION_SPEC

**Coverage**: 2/9 requirements (22%)

### Uncovered Requirements

- [ ] Users can edit previously submitted annotations
- [ ] Toast shows "Annotation saved!" for new submissions
- [ ] Toast shows "Annotation updated!" only when changes detected
- [ ] No toast when navigating without changes
- [ ] Multi-line comments preserved throughout the stack
- [ ] Comments display with proper line breaks
- [ ] Next button enabled for annotated traces (allows re-navigation)

### Covered Requirements

- [x] Changes automatically save on navigation (Next/Previous) (e2e-real, unit)
- [x] Annotation count reflects unique submissions (not re-submissions) (e2e-real, unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `client/tests/e2e/annotation-last-trace.spec.ts` (file-level) [e2e-real]

## ASSISTED_FACILITATION_SPEC

**Coverage**: 7/7 requirements (100%)

### Covered Requirements

- [x] Findings are classified in real-time as participants submit them (e2e-mocked, e2e-real)
- [x] Facilitators see per-trace structured view with category breakdown (e2e-mocked, e2e-real)
- [x] Facilitators can generate targeted questions that broadcast to all participants (e2e-real, unit)
- [x] Disagreements are auto-detected and surfaced (e2e-real)
- [x] Participants see only fuzzy progress (no category bias) (e2e-real)
- [x] Findings can be promoted to draft rubric staging area (e2e-real)
- [x] Thresholds are configurable per category per trace (e2e-real)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/services/test_database_discovery_questions.py` (test_db) [unit]
- `tests/unit/services/test_database_discovery_questions.py` (test_get_discovery_questions_empty) [unit]
- `tests/unit/services/test_database_discovery_questions.py` (test_add_discovery_question_creates_question) [unit]
- `tests/unit/services/test_database_discovery_questions.py` (test_add_discovery_question_increments_question_id) [unit]
- `tests/unit/services/test_database_discovery_questions.py` (test_get_discovery_questions_returns_all_for_user) [unit]
- `tests/unit/services/test_database_discovery_questions.py` (test_get_discovery_questions_isolates_by_user) [unit]
- `tests/unit/services/test_database_discovery_questions.py` (test_get_discovery_questions_isolates_by_trace) [unit]
- `tests/unit/services/test_database_discovery_questions.py` (test_add_discovery_question_with_optional_fields) [unit]
- `tests/unit/services/test_discovery_dspy_mlflow_autolog.py` (test_dspy_mlflow_autolog_is_noop_when_env_var_unset) [unit]
- `tests/unit/services/test_discovery_dspy_mlflow_autolog.py` (test_dspy_mlflow_autolog_uses_experiment_id_from_env) [unit]
- `tests/unit/services/test_discovery_service_v2.py` (test_get_fuzzy_progress_empty) [unit]
- `tests/unit/services/test_discovery_service_v2.py` (test_get_fuzzy_progress_empty) [unit]
- `tests/unit/services/test_discovery_service_v2.py` (test_get_fuzzy_progress_exploring) [unit]
- `tests/unit/services/test_discovery_service_v2.py` (test_get_trace_discovery_state_structure) [unit]
- `tests/unit/services/test_discovery_service_v2.py` (test_promote_finding_structure) [unit]
- `tests/unit/services/test_discovery_service_v2.py` (test_update_trace_thresholds_structure) [unit]
- `tests/unit/services/test_discovery_service_v2.py` (test_submit_finding_v2_classification) [unit]
- `tests/unit/services/test_classification_service.py` (test_classify_finding_locally_themes) [unit]
- `tests/unit/services/test_classification_service.py` (test_classify_finding_locally_themes) [unit]
- `tests/unit/services/test_classification_service.py` (test_classify_finding_locally_missing_info) [unit]
- `tests/unit/services/test_classification_service.py` (test_classify_finding_locally_failure_modes) [unit]
- `tests/unit/services/test_classification_service.py` (test_classify_finding_locally_boundary_conditions) [unit]
- `tests/unit/services/test_classification_service.py` (test_classify_finding_locally_edge_cases) [unit]
- `tests/unit/services/test_classification_service.py` (test_classify_finding_returns_valid_category) [unit]
- `tests/unit/services/test_classification_service.py` (test_all_categories_are_valid) [unit]
- `client/tests/e2e/assisted-facilitation.spec.ts` (file-level) [e2e-mocked]
- `client/tests/e2e/assisted-facilitation-rubric-promotion.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/assisted-facilitation-classification.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/assisted-facilitation-discovery.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/assisted-facilitation-dashboard.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/example-new-infrastructure.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/example-new-infrastructure.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/example-new-infrastructure.spec.ts` (file-level) [e2e-real]

## AUTHENTICATION_SPEC

**Coverage**: 4/7 requirements (57%)

### Uncovered Requirements

- [ ] Slow network: Loading indicator shown until ready
- [ ] Permission API failure: User can log in with defaults
- [ ] Rapid navigation: Components wait for `isLoading = false`

### Covered Requirements

- [x] No "permission denied" errors on normal login (unit)
- [x] No page refresh required after login (unit)
- [x] 404 on validation: Session cleared, fresh login allowed (unit)
- [x] Error recovery: Errors cleared on new login attempt (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `client/tests/e2e/facilitator-create-workshop.spec.ts` (file-level) [e2e-mocked]

## BUILD_AND_DEPLOY_SPEC

**Coverage**: 1/15 requirements (6%)

### Uncovered Requirements

- [ ] Production build completes without errors
- [ ] Console statements removed in production
- [ ] Assets minified and hashed
- [ ] Build directory contains all required files
- [ ] `just db-bootstrap` creates database if missing
- [ ] Migrations apply without errors
- [ ] Batch mode works for SQLite ALTER TABLE
- [ ] File lock prevents race conditions with multiple workers
- [ ] Full deployment completes successfully
- [ ] API endpoints respond correctly
- [ ] Database connection established
- [ ] Release workflow creates zip artifact
- [ ] Pre-built client included in release
- [ ] No sensitive files in artifact

### Covered Requirements

- [x] Server starts and serves frontend (unit)

## DATASETS_SPEC

**Coverage**: 3/9 requirements (33%)

### Uncovered Requirements

- [ ] Union operation combines traces from multiple datasets
- [ ] Subtract operation removes specified traces
- [ ] Same user sees same order for same dataset (deterministic)
- [ ] Adding traces preserves existing order (incremental)
- [ ] New round triggers fresh randomization
- [ ] Facilitators see chronological order (no randomization)

### Covered Requirements

- [x] Datasets can be created with arbitrary trace lists (unit)
- [x] Different users see different orders (per-user randomization) (unit)
- [x] Dataset lineage tracked (source datasets, operations) (unit)

## DESIGN_SYSTEM_SPEC

**Coverage**: 1/7 requirements (14%)

### Uncovered Requirements

- [ ] Primary purple consistent across all components
- [ ] Dark mode fully functional
- [ ] All text meets WCAG AA contrast
- [ ] Focus indicators visible
- [ ] Badges use secondary color scheme
- [ ] Buttons use appropriate variants

### Covered Requirements

- [x] No hardcoded colors in components (unit)

## DISCOVERY_TRACE_ASSIGNMENT_SPEC

**Coverage**: 4/13 requirements (30%)

### Uncovered Requirements

- [ ] Participants only see traces in current active discovery dataset
- [ ] When new discovery round starts, old traces hidden (not deleted)
- [ ] Randomization persistent across page reloads for same trace set
- [ ] When annotation dataset changes mid-round, new traces appended
- [ ] When annotation round changes, full re-randomization applied
- [ ] Randomization context includes phase and round info
- [ ] Dataset operations (union, subtract) work correctly and maintain audit trail
- [ ] Multiple participants can see same trace with different orders
- [ ] Inter-rater reliability (IRR) can be measured (same traces, different orders)

### Covered Requirements

- [x] Switching between discovery rounds hides/shows appropriate traces (unit)
- [x] Phase/round context properly scoped in database (unit)
- [x] Annotation traces randomized per (user_id, trace_set) pair (unit)
- [x] Assignment metadata properly tracks all context (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `client/tests/e2e/discovery-invite-traces.spec.ts` (file-level) [e2e-mocked]

## JUDGE_EVALUATION_SPEC

**Coverage**: 10/13 requirements (76%)

### Uncovered Requirements

- [ ] Binary judges return values 0 or 1
- [ ] Fallback conversion handles Likert-style returns for binary
- [ ] Results reload correctly in UI

### Covered Requirements

- [x] Likert judges return values 1-5 (unit)
- [x] Evaluation results persisted to database (unit)
- [x] Alignment jobs run asynchronously (unit)
- [x] Optimized prompt saved to judge (unit)
- [x] Alignment metrics reported (unit)
- [x] Works for both Likert and Binary scales (unit)
- [x] Krippendorff's Alpha calculated correctly (unit)
- [x] Cohen's Kappa calculated for rater pairs (unit)
- [x] Handles edge cases (no variation, single rater) (unit)
- [x] Updates when new annotations added (unit)

## RUBRIC_SPEC

**Coverage**: 1/7 requirements (14%)

### Uncovered Requirements

- [ ] Delimiter never appears in user input (by design)
- [ ] Frontend and backend use same delimiter constant
- [ ] Likert scale shows 1-5 rating options
- [ ] Binary scale shows custom pass/fail labels
- [ ] Parsed questions have stable UUIDs within session
- [ ] Empty/whitespace-only parts filtered out

### Covered Requirements

- [x] Questions with multi-line descriptions parse correctly (unit)

## TRACE_DISPLAY_SPEC

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/utils/test_jsonpath_utils.py` (test_simple_extraction) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_simple_extraction) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_nested_extraction) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_array_index_extraction) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_array_extraction_multiple) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_no_match_returns_failure) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_invalid_json_returns_failure) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_null_result_returns_failure) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_empty_jsonpath_returns_failure) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_invalid_jsonpath_syntax_returns_failure) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_empty_string_result_returns_failure) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_numeric_value_converted_to_string) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_boolean_value_converted_to_string) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_deeply_nested_extraction) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_array_with_mixed_values) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_whitespace_in_jsonpath_trimmed) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_valid_jsonpath) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_valid_jsonpath) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_valid_nested_jsonpath) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_valid_array_jsonpath) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_valid_wildcard_jsonpath) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_empty_jsonpath_is_valid) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_invalid_jsonpath_syntax) [unit]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (file-level) [e2e-real]

## UI_COMPONENTS_SPEC

**Coverage**: 0/16 requirements (0%)

### Uncovered Requirements

- [ ] Page navigation works correctly (first, prev, next, last)
- [ ] Items per page selector updates page size
- [ ] Quick jump navigates to valid pages
- [ ] Keyboard shortcuts work when enabled
- [ ] Disabled states shown for unavailable actions
- [ ] Page info accurately reflects data
- [ ] JSON arrays render as tables
- [ ] SQL queries formatted with line breaks
- [ ] CSV export includes all table data
- [ ] Copy to clipboard works for all content
- [ ] Invalid JSON shows error + fallback
- [ ] Responsive layout on different screens
- [ ] Keyboard navigation works throughout
- [ ] Screen reader announces state changes
- [ ] Focus visible and managed correctly
- [ ] Color contrast meets WCAG AA

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
