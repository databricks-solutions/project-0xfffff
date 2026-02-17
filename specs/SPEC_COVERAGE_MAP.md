# Spec Test Coverage Map

**Generated**: 2026-02-17 06:17:43

This report shows test coverage for each specification's success criteria.

## Test Pyramid Summary

| Type | Count | Description |
|------|-------|-------------|
| Unit | 539 | pytest unit tests, Vitest tests |
| Integration | 0 | pytest with real DB/API |
| E2E (Mocked) | 13 | Playwright with mocked API |
| E2E (Real) | 35 | Playwright with real API |

## Coverage Summary

| Spec | Reqs | Covered | Cover% | Unit | Int | E2E-M | E2E-R |
|------|------|---------|--------|------|-----|-------|-------|
| [ANNOTATION_SPEC](#annotation-spec) | 21 | 13 | 61% | 47 | 0 | 0 | 10 |
| [AUTHENTICATION_SPEC](#authentication-spec) | 7 | 7 | 100% | 12 | 0 | 3 | 0 |
| [BUILD_AND_DEPLOY_SPEC](#build-and-deploy-spec) | 15 | 12 | 80% | 56 | 0 | 0 | 0 |
| [CUSTOM_LLM_PROVIDER_SPEC](#custom-llm-provider-spec) | 15 | 0 | 0% | 13 | 0 | 7 | 0 |
| [DATASETS_SPEC](#datasets-spec) | 9 | 9 | 100% | 33 | 0 | 0 | 2 |
| [DESIGN_SYSTEM_SPEC](#design-system-spec) | 7 | 0 | 0% | 40 | 0 | 0 | 0 |
| [DISCOVERY_SPEC](#discovery-spec) | 47 | 12 | 25% | 24 | 0 | 0 | 0 |
| [DISCOVERY_TRACE_ASSIGNMENT_SPEC](#discovery-trace-assignment-spec) | 13 | 13 | 100% | 21 | 0 | 2 | 3 |
| [JUDGE_EVALUATION_SPEC](#judge-evaluation-spec) | 25 | 25 | 100% | 83 | 0 | 0 | 6 |
| [ROLE_PERMISSIONS_SPEC](#role-permissions-spec) | 16 | 16 | 100% | 24 | 0 | 0 | 0 |
| [RUBRIC_SPEC](#rubric-spec) | 25 | 22 | 88% | 74 | 0 | 1 | 6 |
| [TESTING_SPEC](#testing-spec) | 7 | 0 | 0% | 12 | 0 | 0 | 0 |
| [TRACE_DISPLAY_SPEC](#trace-display-spec) | 0 | 0 | 100% | 43 | 0 | 0 | 6 |
| [UI_COMPONENTS_SPEC](#ui-components-spec) | 16 | 0 | 0% | 57 | 0 | 0 | 2 |

**Total**: 129/223 requirements covered (57%)

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

### Covered Requirements

- [x] Users can edit previously submitted annotations (unit)
- [x] Changes automatically save on navigation (Next/Previous) (e2e-real, unit)
- [x] Toast shows "Annotation saved!" for new submissions (e2e-real)
- [x] Toast shows "Annotation updated!" only when changes detected (e2e-real)
- [x] Multi-line comments preserved throughout the stack (e2e-real)
- [x] Next button enabled for annotated traces (allows re-navigation) (e2e-real)
- [x] Annotation count reflects unique submissions (not re-submissions) (e2e-real, unit)
- [x] Annotations sync to MLflow as feedback on save (one entry per rubric question) (unit)
- [x] MLflow trace tagged with `label: "align"` and `workshop_id` on annotation (unit)
- [x] Feedback source is HUMAN with annotator's user_id (unit)
- [x] Annotation comment maps to MLflow feedback rationale (unit)
- [x] Duplicate feedback entries are detected and skipped (unit)
- [x] Legacy single-rating format loads correctly alongside multi-rating format (unit)

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

## AUTHENTICATION_SPEC

**Coverage**: 7/7 requirements (100%)

### Covered Requirements

- [x] No "permission denied" errors on normal login (unit)
- [x] No page refresh required after login (unit)
- [x] Slow network: Loading indicator shown until ready (e2e-mocked)
- [x] Permission API failure: User can log in with defaults (unit)
- [x] 404 on validation: Session cleared, fresh login allowed (unit)
- [x] Rapid navigation: Components wait for `isLoading = false` (unit)
- [x] Error recovery: Errors cleared on new login attempt (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/routers/test_auth_edge_cases.py` (test_permission_api_failure_returns_defaults_when_user_not_found) [unit]
- `tests/unit/routers/test_auth_edge_cases.py` (test_permission_api_returns_role_based_defaults_for_valid_user) [unit]
- `client/tests/e2e/authentication.spec.ts` (error clears on new login attempt) [e2e-mocked]
- `client/tests/e2e/facilitator-create-workshop.spec.ts` (facilitator can log in and create a workshop) [e2e-mocked]

## BUILD_AND_DEPLOY_SPEC

**Coverage**: 12/15 requirements (80%)

### Uncovered Requirements

- [ ] Production build completes without errors
- [ ] Console statements removed in production
- [ ] Full deployment completes successfully

### Covered Requirements

- [x] Assets minified and hashed (unit)
- [x] Build directory contains all required files (unit)
- [x] `just db-bootstrap` creates database if missing (unit)
- [x] Migrations apply without errors (unit)
- [x] Batch mode works for SQLite ALTER TABLE (unit)
- [x] File lock prevents race conditions with multiple workers (unit)
- [x] Server starts and serves frontend (unit)
- [x] API endpoints respond correctly (unit)
- [x] Database connection established (unit)
- [x] Release workflow creates zip artifact (unit)
- [x] Pre-built client included in release (unit)
- [x] No sensitive files in artifact (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/test_sqlite_rescue.py` (test_default_database_url) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_sqlite_triple_slash_url) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_sqlite_double_slash_url) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_non_sqlite_url_returns_none) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_volume_backup_path_direct) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_volume_path_appends_workshop_db) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_volume_path_with_trailing_slash) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_backup_path_takes_precedence) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_custom_backup_interval) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_backup_interval_zero_disables) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_valid_volume_path) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_valid_nested_path) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_empty_path_is_invalid) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_none_path_is_invalid) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_non_volumes_prefix_is_invalid) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_incomplete_volume_path_is_invalid) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_just_volumes_root_is_invalid) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_case_sensitive_volumes_prefix) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_extracts_volume_root) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_extracts_root_from_nested_path) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_returns_none_for_short_path) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_returns_none_for_empty_path) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_exact_volume_path_returns_self) [unit]

## CUSTOM_LLM_PROVIDER_SPEC

**Coverage**: 0/15 requirements (0%)

### Uncovered Requirements

- [ ] Users can configure custom LLM provider via UI
- [ ] Base URL, API key, and model name are captured
- [ ] API key is stored securely in memory (not database)
- [ ] Configuration persists across page refreshes (except API key which requires re-entry after 24h)
- [ ] "Test Connection" button verifies endpoint is reachable
- [ ] Clear error messages for common failures (auth, timeout, invalid URL)
- [ ] Response time is displayed on success
- [ ] When custom provider is enabled, judge evaluation uses the custom endpoint
- [ ] `proxy_url` parameter is correctly passed to MLflow
- [ ] Evaluation results are identical in format to Databricks FMAPI results
- [ ] Errors from custom provider are properly surfaced to UI
- [ ] Custom provider option appears in model selector when configured
- [ ] Clear indication of which provider is being used
- [ ] Easy to switch between Databricks and custom provider
- [ ] Configuration can be updated without losing other workshop data

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/routers/test_custom_llm_provider_router.py` (test_get_custom_llm_provider_not_configured) [unit]
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_get_custom_llm_provider_configured) [unit]
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_create_custom_llm_provider) [unit]
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_delete_custom_llm_provider) [unit]
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_test_custom_llm_provider_success) [unit]
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_test_custom_llm_provider_auth_failure) [unit]
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_test_custom_llm_provider_no_config) [unit]
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_test_custom_llm_provider_no_api_key) [unit]
- `tests/unit/services/test_judge_custom_provider.py` (test_custom_provider_sets_proxy_url_in_mlflow_configuration) [unit]
- `tests/unit/services/test_judge_custom_provider.py` (test_build_chat_completions_url_with_v1_suffix) [unit]
- `tests/unit/services/test_judge_custom_provider.py` (test_build_chat_completions_url_already_has_suffix) [unit]
- `tests/unit/services/test_judge_custom_provider.py` (test_build_chat_completions_url_strips_trailing_slash) [unit]
- `tests/unit/services/test_judge_custom_provider.py` (test_custom_provider_api_key_stored_with_correct_key_format) [unit]
- `client/tests/e2e/custom-llm-provider.spec.ts` (facilitator can access custom LLM provider config in judge tuning) [e2e-mocked]
- `client/tests/e2e/custom-llm-provider.spec.ts` (facilitator can configure and test custom LLM provider) [e2e-mocked]
- `client/tests/e2e/custom-llm-provider.spec.ts` (facilitator can delete custom LLM provider configuration) [e2e-mocked]
- `client/tests/e2e/custom-llm-provider.spec.ts` (shows stored badge after saving API key) [e2e-mocked]
- `client/tests/e2e/custom-llm-provider.spec.ts` (validation requires all fields) [e2e-mocked]
- `client/tests/e2e/custom-llm-provider.spec.ts` (custom provider appears in model selector when configured) [e2e-mocked]
- `client/tests/e2e/custom-llm-provider.spec.ts` (switch between providers works) [e2e-mocked]

## DATASETS_SPEC

**Coverage**: 9/9 requirements (100%)

### Covered Requirements

- [x] Datasets can be created with arbitrary trace lists (e2e-real, unit)
- [x] Union operation combines traces from multiple datasets (unit)
- [x] Subtract operation removes specified traces (unit)
- [x] Same user sees same order for same dataset (deterministic) (unit)
- [x] Different users see different orders (per-user randomization) (e2e-real, unit)
- [x] Adding traces preserves existing order (incremental) (unit)
- [x] New round triggers fresh randomization (unit)
- [x] Dataset lineage tracked (source datasets, operations) (unit)
- [x] Facilitators see chronological order (no randomization) (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/services/test_dataset_operations.py` (test_union_preserves_first_occurrence_order) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_union_three_datasets) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_union_with_empty_dataset) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_union_identical_datasets) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_union_result_has_no_duplicates) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_subtract_empty_removal_set) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_subtract_all_traces) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_subtract_nonexistent_traces_ignored) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_subtract_single_trace) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_subtract_result_has_correct_length) [unit]
- `client/src/utils/traceUtils.test.ts` (converts basic API trace fields) [unit]
- `client/src/utils/traceUtils.test.ts` (normalizes null optional fields to undefined) [unit]
- `client/src/utils/traceUtils.test.ts` (normalizes empty string optional fields to undefined) [unit]
- `client/src/utils/traceUtils.test.ts` (normalizes zero/falsy optional fields to undefined) [unit]
- `client/src/utils/traceUtils.test.ts` (preserves valid MLflow metadata) [unit]
- `client/src/utils/traceUtils.test.ts` (preserves complex JSON input/output) [unit]
- `client/src/utils/traceUtils.test.ts` (handles trace with only required fields) [unit]
- `client/src/utils/traceUtils.test.ts` (handles trace with complex context object) [unit]

## DESIGN_SYSTEM_SPEC

**Coverage**: 0/7 requirements (0%)

### Uncovered Requirements

- [ ] Primary purple consistent across all components
- [ ] Dark mode fully functional
- [ ] All text meets WCAG AA contrast
- [ ] Focus indicators visible
- [ ] No hardcoded colors in components
- [ ] Badges use secondary color scheme
- [ ] Buttons use appropriate variants

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `client/src/lib/utils.test.ts` (combines multiple class strings) [unit]
- `client/src/lib/utils.test.ts` (handles single class) [unit]
- `client/src/lib/utils.test.ts` (handles empty input) [unit]
- `client/src/lib/utils.test.ts` (handles empty strings) [unit]
- `client/src/lib/utils.test.ts` (resolves padding conflicts (later wins)) [unit]
- `client/src/lib/utils.test.ts` (resolves margin conflicts) [unit]
- `client/src/lib/utils.test.ts` (resolves text size conflicts) [unit]
- `client/src/lib/utils.test.ts` (resolves background color conflicts) [unit]
- `client/src/lib/utils.test.ts` (resolves text color conflicts) [unit]
- `client/src/lib/utils.test.ts` (allows different utility categories to coexist) [unit]
- `client/src/lib/utils.test.ts` (resolves directional padding conflicts) [unit]
- `client/src/lib/utils.test.ts` (keeps non-conflicting directional utilities) [unit]
- `client/src/lib/utils.test.ts` (filters out falsy values) [unit]
- `client/src/lib/utils.test.ts` (filters out undefined values) [unit]
- `client/src/lib/utils.test.ts` (filters out null values) [unit]
- `client/src/lib/utils.test.ts` (handles conditional expression with true) [unit]
- `client/src/lib/utils.test.ts` (handles conditional expression with false) [unit]
- `client/src/lib/utils.test.ts` (handles ternary expressions) [unit]
- `client/src/lib/utils.test.ts` (handles array of classes) [unit]
- `client/src/lib/utils.test.ts` (handles mixed array and string inputs) [unit]
- `client/src/lib/utils.test.ts` (filters falsy values from arrays) [unit]
- `client/src/lib/utils.test.ts` (handles object with boolean values) [unit]
- `client/src/lib/utils.test.ts` (handles object with all true values) [unit]
- `client/src/lib/utils.test.ts` (handles empty object) [unit]
- `client/src/lib/utils.test.ts` (combines object and string inputs) [unit]
- `client/src/lib/utils.test.ts` (handles button variant pattern) [unit]
- `client/src/lib/utils.test.ts` (handles disabled state override) [unit]
- `client/src/lib/utils.test.ts` (handles responsive classes) [unit]
- `client/src/lib/utils.test.ts` (handles dark mode classes) [unit]
- `client/src/test/design-system.test.ts` (has a :root block) [unit]
- `client/src/test/design-system.test.ts` (defines --primary CSS variable) [unit]
- `client/src/test/design-system.test.ts` (defines --primary-foreground CSS variable) [unit]
- `client/src/test/design-system.test.ts` (defines --background CSS variable) [unit]
- `client/src/test/design-system.test.ts` (defines --foreground CSS variable) [unit]
- `client/src/test/design-system.test.ts` (has a .dark block) [unit]
- `client/src/test/design-system.test.ts` (overrides --primary in dark mode) [unit]
- `client/src/test/design-system.test.ts` (overrides --background in dark mode) [unit]
- `client/src/test/design-system.test.ts` (overrides --foreground in dark mode) [unit]
- `client/src/test/design-system.test.ts` (dark mode --primary differs from light mode --primary) [unit]
- `client/src/test/design-system.test.ts` (component .tsx files avoid hardcoded hex colors) [unit]

## DISCOVERY_SPEC

**Coverage**: 12/47 requirements (25%)

### Uncovered Requirements

- [ ] Previous Q&A visible while answering new questions
- [ ] Loading spinner during LLM generation (1-3s)
- [ ] Facilitator can trigger analysis at any time (even partial feedback)
- [ ] Facilitator selects analysis template (Evaluation Criteria or Themes & Patterns) before running
- [ ] System aggregates feedback by trace
- [ ] Disagreements detected at 3 priority levels (deterministic, no LLM)
- [ ] LLM distills evaluation criteria with evidence from trace IDs
- [ ] LLM analyzes disagreements with follow-up questions and suggestions
- [ ] Analysis record stores which template was used
- [ ] Each analysis run creates a new record (history preserved)
- [ ] Re-runnable — new analysis as more feedback comes in, prior analyses retained
- [ ] Warning if < 2 participants (not an error)
- [ ] Data freshness banner (participant count, last run timestamp)
- [ ] Results organized by priority (HIGH → MEDIUM → LOWER)
- [ ] Facilitator can promote distilled criteria to draft rubric
- [ ] Facilitator can promote disagreement insights to draft rubric
- [ ] Facilitator can promote raw participant feedback to draft rubric
- [ ] Facilitator can manually add draft rubric items
- [ ] Draft rubric items editable and removable
- [ ] "Suggest Groups" returns LLM proposal without persisting
- [ ] Facilitator can review, adjust, and apply group proposal
- [ ] Manual grouping: create groups, name them, move items between groups
- [ ] Each group maps to one rubric question (group name = question title)
- [ ] Draft rubric items available during Rubric Creation phase
- [ ] Source traceability maintained (which traces support each item)
- [ ] Multiple analysis records per workshop allowed (history preserved)
- [ ] Draft rubric items track promotion source and promoter
- [ ] LLM failures show error toast with retry
- [ ] Analysis shows warning (not error) if < 2 participants
- [ ] Progressive disclosure (one question at a time)
- [ ] Submit buttons disabled until required fields filled
- [ ] Clear progress indication (X of Y traces completed)
- [ ] Smooth transitions between feedback states
- [ ] Disagreements color-coded by priority (red/yellow/blue)
- [ ] Criteria show evidence (supporting trace IDs)

### Covered Requirements

- [x] Facilitator can start Discovery phase with configurable trace limit (unit)
- [x] Participants view traces and provide GOOD/BAD + comment (unit)
- [x] AI generates 3 follow-up questions per trace based on feedback (unit)
- [x] Questions build progressively on prior answers (unit)
- [x] All 3 questions required before moving to next trace (unit)
- [x] Error handling with retry for LLM failures (unit)
- [x] Feedback saved incrementally (no data loss on failure) (unit)
- [x] Completion status shows % of participants finished (unit)
- [x] One feedback record per (workshop, trace, user) — upsert behavior (unit)
- [x] Q&A pairs appended in order to JSON array (unit)
- [x] Fallback question if LLM unavailable after retries (unit)
- [x] Form validation prevents empty submissions (unit)

## DISCOVERY_TRACE_ASSIGNMENT_SPEC

**Coverage**: 13/13 requirements (100%)

### Covered Requirements

- [x] Participants only see traces in current active discovery dataset (e2e-real, unit)
- [x] When new discovery round starts, old traces hidden (not deleted) (e2e-real)
- [x] Switching between discovery rounds hides/shows appropriate traces (unit)
- [x] Phase/round context properly scoped in database (unit)
- [x] Annotation traces randomized per (user_id, trace_set) pair (unit)
- [x] Randomization persistent across page reloads for same trace set (e2e-real, unit)
- [x] When annotation dataset changes mid-round, new traces appended (unit)
- [x] When annotation round changes, full re-randomization applied (unit)
- [x] Randomization context includes phase and round info (unit)
- [x] Dataset operations (union, subtract) work correctly and maintain audit trail (unit)
- [x] Multiple participants can see same trace with different orders (unit)
- [x] Assignment metadata properly tracks all context (unit)
- [x] Inter-rater reliability (IRR) can be measured (same traces, different orders) (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `client/tests/e2e/discovery-invite-traces.spec.ts` (discovery blocks until multiple participants complete; facilitator-driven phase with trace-based discovery) [e2e-mocked]
- `client/tests/e2e/facilitator-create-workshop.spec.ts` (facilitator can log in and create a workshop) [e2e-mocked]
- `client/src/hooks/useWorkshopApi.test.ts` (invalidateAllWorkshopQueries passes a predicate that matches workshop-related keys) [unit]
- `client/src/hooks/useWorkshopApi.test.ts` (refetchAllWorkshopQueries passes a predicate that matches workshop-related keys) [unit]

## JUDGE_EVALUATION_SPEC

**Coverage**: 25/25 requirements (100%)

### Covered Requirements

- [x] Likert judges return values 1-5 (unit)
- [x] Binary judges return values 0 or 1 (unit)
- [x] Fallback conversion handles Likert-style returns for binary (unit)
- [x] Evaluation results persisted to database (unit)
- [x] Results reload correctly in UI (unit)
- [x] Auto-evaluation runs in background when annotation phase starts (e2e-real, unit)
- [x] Judge prompt auto-derived from rubric questions (unit)
- [x] Per-question judge_type parsed from rubric (`[JUDGE_TYPE:xxx]`) (unit)
- [x] Binary rubrics evaluated with 0/1 scale (not 1-5) (unit)
- [x] Auto-evaluation model stored for re-evaluation consistency (e2e-real)
- [x] Results appear in Judge Tuning page (e2e-real)
- [x] Re-evaluate loads registered judge with aligned instructions (unit)
- [x] Uses same model as initial auto-evaluation (unit)
- [x] Spinner stops when re-evaluation completes (e2e-real)
- [x] Results stored against correct prompt version (unit)
- [x] Pre-align and post-align scores directly comparable (e2e-real)
- [x] Alignment jobs run asynchronously (unit)
- [x] MemAlign distills semantic memory (guidelines) (unit)
- [x] Aligned judge registered to MLflow (unit)
- [x] Metrics reported (guideline count, example count) (unit)
- [x] Works for both Likert and Binary scales (unit)
- [x] Krippendorff's Alpha calculated correctly (unit)
- [x] Cohen's Kappa calculated for rater pairs (unit)
- [x] Handles edge cases (no variation, single rater) (unit)
- [x] Updates when new annotations added (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/routers/test_workshops_begin_annotation.py` (test_begin_annotation_requires_rubric) [unit]
- `tests/unit/services/test_alignment_service.py` (test_likert_agreement_metric_from_store_is_one_when_equal) [unit]
- `tests/unit/services/test_cohens_kappa.py` (test_interpret_cohens_kappa_bucket_edges) [unit]
- `tests/unit/services/test_cohens_kappa.py` (test_is_cohens_kappa_acceptable_default_threshold) [unit]
- `tests/unit/services/test_irr_utils.py` (test_format_irr_result_rounding_and_ready_flag) [unit]
- `client/src/utils/modelMapping.test.ts` (maps known frontend names to backend names and back) [unit]
- `client/src/utils/modelMapping.test.ts` (passes through unknown names) [unit]
- `client/src/utils/modelMapping.test.ts` (requiresDatabricks is true for mapped options) [unit]
- `client/src/utils/modelMapping.test.ts` (getModelOptions disables options when config missing) [unit]

## ROLE_PERMISSIONS_SPEC

**Coverage**: 16/16 requirements (100%)

### Covered Requirements

- [x] Facilitator role grants: can_create_rubric, can_manage_workshop, can_assign_annotations, can_view_all_findings, can_view_all_annotations, can_view_results (unit)
- [x] Facilitator role denies: can_annotate, can_create_findings (unit)
- [x] SME role grants: can_annotate, can_create_findings, can_view_discovery (unit)
- [x] SME role denies: can_create_rubric, can_manage_workshop, can_view_results, can_view_all_annotations (unit)
- [x] Participant role grants: can_annotate, can_create_findings, can_view_discovery (unit)
- [x] Participant role denies: can_create_rubric, can_manage_workshop, can_view_results, can_view_all_annotations (unit)
- [x] Permissions derived from role via UserPermissions.for_role() classmethod (unit)
- [x] Facilitator role cannot be changed via update endpoint (unit)
- [x] Facilitator accounts cannot be deleted via delete endpoint (unit)
- [x] Only facilitators can create invitations (unit)
- [x] Only facilitators can advance workshop phases (unit)
- [x] Phase advancement validates prerequisites before transitioning (unit)
- [x] Phase advancement returns 400 if prerequisites not met (unit)
- [x] Facilitators authenticate via YAML config (preconfigured credentials) (unit)
- [x] SMEs and participants authenticate via database credentials (unit)
- [x] Login response includes is_preconfigured_facilitator flag for facilitator logins (unit)

## RUBRIC_SPEC

**Coverage**: 22/25 requirements (88%)

### Uncovered Requirements

- [ ] Rubric required before advancing to annotation phase
- [ ] AI suggestions generated from discovery findings and participant notes
- [ ] Facilitator can accept, reject, or edit suggestions before adding to rubric

### Covered Requirements

- [x] Questions with multi-line descriptions parse correctly (unit)
- [x] Delimiter never appears in user input (by design) (unit)
- [x] Frontend and backend use same delimiter constant (unit)
- [x] Per-question judge_type parsed from `[JUDGE_TYPE:xxx]` format (unit)
- [x] Parsed questions have stable UUIDs within session (unit)
- [x] Empty/whitespace-only parts filtered out (unit)
- [x] Likert scale shows 1-5 rating options (e2e-real)
- [x] Binary scale shows Pass/Fail buttons (not star ratings) (e2e-real)
- [x] Binary feedback logged as 0/1 to MLflow (not 3) (e2e-real)
- [x] Mixed rubrics support different scales per question (e2e-real, unit)
- [x] Facilitator can create a rubric question with title and description (unit)
- [x] Facilitator can edit an existing rubric question (unit)
- [x] Facilitator can delete a rubric question (unit)
- [x] Only one rubric exists per workshop (upsert semantics) (unit)
- [x] Rubric persists and is retrievable via GET after creation (e2e-mocked, e2e-real)
- [x] No phase restriction on rubric CRUD (unit)
- [x] Question IDs re-indexed sequentially after deletion (unit)
- [x] Annotation data preserved when rubric questions are deleted (unit)
- [x] Judge name auto-derived from first rubric question title (unit)
- [x] MLflow re-sync triggered on rubric create/update (best-effort) (unit)
- [x] Suggestions validated: title >= 3 chars, description >= 10 chars (unit)
- [x] Invalid judge type in suggestions defaults to likert (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_default_to_likert) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_with_freeform) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_reconstruct_rubric_questions_with_judge_type) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_reconstruct_rubric_questions_empty) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_parse_reconstruct_roundtrip) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_simple_questions) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_empty_input_returns_empty_list) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_whitespace_only_input_returns_empty_list) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_single_question) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_default_judge_type_is_likert) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_whitespace_trimmed) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_legacy_delimiter_supported) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_reconstruct_simple_questions) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_reconstruct_preserves_judge_type) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_reconstruct_updates_ids_sequentially) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_reconstruct_empty_list_returns_empty_string) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_parse_reconstruct_roundtrip) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_binary_judge_type_parsed_correctly) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_likert_judge_type_parsed_correctly) [unit]
- `client/tests/e2e/rubric-judge-type.spec.ts` (default judge type is likert when not specified) [e2e-real]

## TESTING_SPEC

**Coverage**: 0/7 requirements (0%)

### Uncovered Requirements

- [ ] Server unit tests pass with >20% coverage
- [ ] Client unit tests pass with >20% coverage
- [ ] E2E tests pass for critical flows
- [ ] Tests run in CI on every PR
- [ ] Coverage reports generated and accessible
- [ ] No flaky tests (consistent pass/fail)
- [ ] Test isolation (no shared state between tests)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/test_testing_infrastructure.py` (test_mock_db_session_fixture_exists) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_mock_db_session_has_rollback) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_async_client_fixture_works) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_override_get_db_provides_session) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_conftest_has_spec_option) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_conftest_has_collection_modifier) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_spec_marker_filters_this_test) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_e2e_workflow_exists) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_workflow_runs_pytest) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_workflow_runs_playwright) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_workflow_installs_playwright_browsers) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_workflow_triggers_on_pull_request) [unit]

## TRACE_DISPLAY_SPEC

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

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
- `tests/unit/utils/test_jsonpath_utils.py` (test_valid_nested_jsonpath) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_valid_array_jsonpath) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_valid_wildcard_jsonpath) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_empty_jsonpath_is_valid) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_invalid_jsonpath_syntax) [unit]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (facilitator can configure JSONPath settings and preview extraction) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (TraceViewer displays extracted content when JSONPath is configured) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (TraceViewer shows content when JSONPath is not configured) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (JSONPath extraction falls back to raw display on no match) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (multiple JSONPath matches are concatenated with newlines) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (invalid JSONPath shows error message to user) [e2e-real]
- `client/src/hooks/useJsonPathExtraction.test.ts` (returns original data when no jsonPath is provided) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (returns original data when jsonPath is empty string) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (returns original data when jsonPath is whitespace only) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (extracts simple value from JSON) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (extracts nested value) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (extracts array element by index) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (extracts multiple values with wildcard and joins with newlines) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (returns original data when JSONPath returns no matches) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (returns original data when JSON is invalid) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (returns original data when result is null) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (converts numeric values to strings) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (converts boolean values to strings) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (serializes object values to JSON) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (filters out null values from multiple results) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (returns success: false when no jsonPath is provided) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (returns success: true with extracted value) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (returns success: false when no matches found) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (returns success: false for invalid JSON) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (extracts deeply nested value) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (joins multiple matches with newlines) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (handles empty array result as failure) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (extracts from typical LLM response format) [unit]

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

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `client/tests/e2e/ui-components.spec.ts` (pagination in annotation view navigates between pages) [e2e-real]
- `client/tests/e2e/ui-components.spec.ts` (trace viewer renders trace content) [e2e-real]
- `client/src/components/Pagination.test.tsx` (renders null when totalPages <= 1) [unit]
- `client/src/components/Pagination.test.tsx` (1) [unit]
- `client/src/components/Pagination.test.tsx` (shows correct item range and total) [unit]
- `client/src/components/Pagination.test.tsx` (shows correct range on first page) [unit]
- `client/src/components/Pagination.test.tsx` (shows correct range on last page with partial items) [unit]
- `client/src/components/Pagination.test.tsx` (calls onPageChange on next click) [unit]
- `client/src/components/Pagination.test.tsx` (calls onPageChange on previous click) [unit]
- `client/src/components/Pagination.test.tsx` (calls onPageChange on first page click) [unit]
- `client/src/components/Pagination.test.tsx` (calls onPageChange on last page click) [unit]
- `client/src/components/Pagination.test.tsx` (disables previous/first buttons on first page) [unit]
- `client/src/components/Pagination.test.tsx` (disables next/last buttons on last page) [unit]
- `client/src/components/Pagination.test.tsx` (highlights current page) [unit]
- `client/src/components/Pagination.test.tsx` (navigates to clicked page number) [unit]
- `client/src/components/Pagination.test.tsx` (shows ellipsis for large page counts) [unit]
- `client/src/components/Pagination.test.tsx` (does not show selector by default) [unit]
- `client/src/components/Pagination.test.tsx` (shows selector when showItemsPerPageSelector is true) [unit]
- `client/src/components/Pagination.test.tsx` (calls onItemsPerPageChange when selection changes) [unit]
- `client/src/components/Pagination.test.tsx` (shows correct options (10, 25, 50, 100)) [unit]
- `client/src/components/Pagination.test.tsx` (does not show quick jump by default) [unit]
- `client/src/components/Pagination.test.tsx` (shows quick jump when showQuickJump is true) [unit]
- `client/src/components/Pagination.test.tsx` (navigates to valid page when Go is clicked) [unit]
- `client/src/components/Pagination.test.tsx` (navigates when Enter is pressed in quick jump input) [unit]
- `client/src/components/Pagination.test.tsx` (disables Go button for invalid page numbers) [unit]
- `client/src/components/Pagination.test.tsx` (does not show keyboard hints by default) [unit]
- `client/src/components/Pagination.test.tsx` (shows keyboard hints when showKeyboardShortcuts is true) [unit]
- `client/src/components/Pagination.test.tsx` (navigates to next page with ArrowRight) [unit]
- `client/src/components/Pagination.test.tsx` (navigates to previous page with ArrowLeft) [unit]
- `client/src/components/Pagination.test.tsx` (navigates to first page with Home key) [unit]
- `client/src/components/Pagination.test.tsx` (navigates to last page with End key) [unit]
- `client/src/components/Pagination.test.tsx` (does not navigate on ArrowRight when on last page) [unit]
- `client/src/components/Pagination.test.tsx` (does not navigate on ArrowLeft when on first page) [unit]
- `client/src/components/Pagination.test.tsx` (does not handle keyboard when showKeyboardShortcuts is false) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (renders with valid JSON output) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (renders error state for invalid JSON output) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (displays MLflow trace ID badge when provided) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (shows context section when showContext is true and context exists) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (hides context section when showContext is false) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (extracts content from OpenAI chat completion format) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (extracts content from text completion format) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (extracts content from Anthropic Claude format) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (concatenates multiple text blocks) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (extracts rationale from judge evaluation output) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (extracts JSON-encoded judge result from message content) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (renders result array as table when clicking Data Table tab) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (shows Download CSV button when Data Table tab is active) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (displays SQL query with formatting) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (shows Download SQL button when query_text exists) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (has Copy buttons for input and output sections) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (switches between Response and Raw JSON tabs for LLM content) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (switches between Data Table and Raw JSON tabs for SQL results) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (shows raw JSON when no LLM content or table data detected) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (handles double-stringified JSON) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (shows collapsible metadata section for LLM responses) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (handles empty result array) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (handles messages array format) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (handles Databricks agent response format) [unit]
- `client/src/components/TraceDataViewer.test.tsx` (handles flattened chat completion format) [unit]

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
