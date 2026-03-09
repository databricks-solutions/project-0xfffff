# Spec Test Coverage Map

**Generated**: 2026-03-04 11:06:12

This report shows test coverage for each specification's success criteria.

## Test Pyramid Summary

| Type | Count | Description |
|------|-------|-------------|
| Unit | 832 | pytest unit tests, Vitest tests |
| Integration | 50 | pytest with real DB/API |
| E2E (Mocked) | 22 | Playwright with mocked API |
| E2E (Real) | 99 | Playwright with real API |

## Coverage Summary

| Spec | Reqs | Covered | Cover% | Unit | Int | E2E-M | E2E-R | BE-only |
|------|------|---------|--------|------|-----|-------|-------|---------|
| [ANNOTATION_SPEC](#annotation-spec) | 21 | 13 | 61% | 47 | 0 | 0 | 10 | **7** |
| [ASSISTED_FACILITATION_SPEC](#assisted-facilitation-spec) | 7 | 7 | 100% | 30 | 0 | 0 | 42 | 0 |
| [AUTHENTICATION_SPEC](#authentication-spec) | 7 | 7 | 100% | 12 | 0 | 3 | 0 | **5** |
| [BUILD_AND_DEPLOY_SPEC](#build-and-deploy-spec) | 15 | 12 | 80% | 56 | 0 | 0 | 0 | **12** |
| [CUSTOM_LLM_PROVIDER_SPEC](#custom-llm-provider-spec) | 15 | 0 | 0% | 13 | 0 | 7 | 0 | 0 |
| [DATASETS_SPEC](#datasets-spec) | 9 | 9 | 100% | 33 | 0 | 0 | 2 | **7** |
| [DESIGN_SYSTEM_SPEC](#design-system-spec) | 7 | 0 | 0% | 40 | 0 | 0 | 0 | 0 |
| [DISCOVERY_SPEC](#discovery-spec) | 59 | 59 | 100% | 251 | 4 | 8 | 19 | **23** |
| [DISCOVERY_TRACE_ASSIGNMENT_SPEC](#discovery-trace-assignment-spec) | 13 | 13 | 100% | 21 | 0 | 2 | 3 | **9** |
| [JUDGE_EVALUATION_SPEC](#judge-evaluation-spec) | 25 | 25 | 100% | 87 | 0 | 0 | 9 | **18** |
| [ROLE_PERMISSIONS_SPEC](#role-permissions-spec) | 16 | 16 | 100% | 24 | 0 | 0 | 0 | **16** |
| [RUBRIC_SPEC](#rubric-spec) | 25 | 25 | 100% | 83 | 0 | 2 | 6 | **17** |
| [TESTING_SPEC](#testing-spec) | 30 | 0 | 0% | 35 | 46 | 0 | 0 | 0 |
| [TRACE_DISPLAY_SPEC](#trace-display-spec) | 0 | 0 | 100% | 43 | 0 | 0 | 6 | 0 |
| [UI_COMPONENTS_SPEC](#ui-components-spec) | 16 | 0 | 0% | 57 | 0 | 0 | 2 | 0 |

**Total**: 186/265 requirements covered (70%)

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

## ASSISTED_FACILITATION_SPEC

**Coverage**: 7/7 requirements (100%)

### Covered Requirements

- [x] Findings are classified in real-time as participants submit them (e2e-real, unit)
- [x] Facilitators see per-trace structured view with category breakdown (e2e-real, unit)
- [x] Facilitators can generate targeted questions that broadcast to all participants (e2e-real, unit)
- [x] Disagreements are auto-detected and surfaced (e2e-real, unit)
- [x] Participants see only fuzzy progress (no category bias) (e2e-real, unit)
- [x] Findings can be promoted to draft rubric staging area (e2e-real, unit)
- [x] Thresholds are configurable per category per trace (e2e-real, unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/services/test_discovery_dspy_mlflow_autolog.py` (test_dspy_mlflow_autolog_is_noop_when_env_var_unset) [unit]
- `tests/unit/services/test_discovery_dspy_mlflow_autolog.py` (test_dspy_mlflow_autolog_uses_experiment_id_from_env) [unit]
- `client/tests/e2e/example-new-infrastructure.spec.ts` (facilitator login with mocked API) [e2e-real]
- `client/tests/e2e/example-new-infrastructure.spec.ts` (workshop with multiple participants) [e2e-real]
- `client/tests/e2e/example-new-infrastructure.spec.ts` (workshop setup for rubric phase) [e2e-real]
- `client/tests/e2e/example-new-infrastructure.spec.ts` (named users for multi-browser tests) [e2e-real]
- `client/tests/e2e/example-new-infrastructure.spec.ts` (mixed mock and real API calls) [e2e-real]
- `client/tests/e2e/example-new-infrastructure.spec.ts` (full real API mode) [e2e-real]
- `client/tests/e2e/example-new-infrastructure.spec.ts` (annotation phase setup) [e2e-real]
- `client/tests/e2e/example-new-infrastructure.spec.ts` (pre-created annotations) [e2e-real]

## AUTHENTICATION_SPEC

**Coverage**: 7/7 requirements (100%)

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: No "permission denied" errors on normal login (unit)
- :warning: No page refresh required after login (unit)
- :warning: Permission API failure: User can log in with defaults (unit)
- :warning: 404 on validation: Session cleared, fresh login allowed (unit)
- :warning: Error recovery: Errors cleared on new login attempt (unit)

### Covered Requirements

- [x] No "permission denied" errors on normal login (unit) **[BE-only]**
- [x] No page refresh required after login (unit) **[BE-only]**
- [x] Slow network: Loading indicator shown until ready (e2e-mocked)
- [x] Permission API failure: User can log in with defaults (unit) **[BE-only]**
- [x] 404 on validation: Session cleared, fresh login allowed (unit) **[BE-only]**
- [x] Rapid navigation: Components wait for `isLoading = false` (unit)
- [x] Error recovery: Errors cleared on new login attempt (unit) **[BE-only]**

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

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: Assets minified and hashed (unit)
- :warning: Build directory contains all required files (unit)
- :warning: `just db-bootstrap` creates database if missing (unit)
- :warning: Migrations apply without errors (unit)
- :warning: Batch mode works for SQLite ALTER TABLE (unit)
- :warning: File lock prevents race conditions with multiple workers (unit)
- :warning: Server starts and serves frontend (unit)
- :warning: API endpoints respond correctly (unit)
- :warning: Database connection established (unit)
- :warning: Release workflow creates zip artifact (unit)
- :warning: Pre-built client included in release (unit)
- :warning: No sensitive files in artifact (unit)

### Covered Requirements

- [x] Assets minified and hashed (unit) **[BE-only]**
- [x] Build directory contains all required files (unit) **[BE-only]**
- [x] `just db-bootstrap` creates database if missing (unit) **[BE-only]**
- [x] Migrations apply without errors (unit) **[BE-only]**
- [x] Batch mode works for SQLite ALTER TABLE (unit) **[BE-only]**
- [x] File lock prevents race conditions with multiple workers (unit) **[BE-only]**
- [x] Server starts and serves frontend (unit) **[BE-only]**
- [x] API endpoints respond correctly (unit) **[BE-only]**
- [x] Database connection established (unit) **[BE-only]**
- [x] Release workflow creates zip artifact (unit) **[BE-only]**
- [x] Pre-built client included in release (unit) **[BE-only]**
- [x] No sensitive files in artifact (unit) **[BE-only]**

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

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: Union operation combines traces from multiple datasets (unit)
- :warning: Subtract operation removes specified traces (unit)
- :warning: Same user sees same order for same dataset (deterministic) (unit)
- :warning: Adding traces preserves existing order (incremental) (unit)
- :warning: New round triggers fresh randomization (unit)
- :warning: Dataset lineage tracked (source datasets, operations) (unit)
- :warning: Facilitators see chronological order (no randomization) (unit)

### Covered Requirements

- [x] Datasets can be created with arbitrary trace lists (e2e-real, unit)
- [x] Union operation combines traces from multiple datasets (unit) **[BE-only]**
- [x] Subtract operation removes specified traces (unit) **[BE-only]**
- [x] Same user sees same order for same dataset (deterministic) (unit) **[BE-only]**
- [x] Different users see different orders (per-user randomization) (e2e-real, unit)
- [x] Adding traces preserves existing order (incremental) (unit) **[BE-only]**
- [x] New round triggers fresh randomization (unit) **[BE-only]**
- [x] Dataset lineage tracked (source datasets, operations) (unit) **[BE-only]**
- [x] Facilitators see chronological order (no randomization) (unit) **[BE-only]**

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

**Coverage**: 59/59 requirements (100%)

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: Facilitator can start Discovery phase with configurable trace limit (unit)
- :warning: Participants view traces and provide GOOD/BAD + comment (unit)
- :warning: AI generates 3 follow-up questions per trace based on feedback (unit)
- :warning: Questions build progressively on prior answers (unit)
- :warning: All 3 questions required before moving to next trace (unit)
- :warning: Error handling with retry for LLM failures (unit)
- :warning: Completion status shows % of participants finished (integration, unit)
- :warning: System aggregates feedback by trace (unit)
- :warning: Disagreements detected at 3 priority levels (deterministic, no LLM) (unit)
- :warning: LLM distills evaluation criteria with evidence from trace IDs (unit)
- :warning: LLM analyzes disagreements with follow-up questions and suggestions (unit)
- :warning: Analysis record stores which template was used (unit)
- :warning: Re-runnable — new analysis as more feedback comes in, prior analyses retained (unit)
- :warning: One feedback record per (workshop, trace, user) — upsert behavior (integration, unit)
- :warning: Q&A pairs appended in order to JSON array (integration, unit)
- :warning: Multiple analysis records per workshop allowed (history preserved) (unit)
- :warning: Draft rubric items track promotion source and promoter (unit)
- :warning: Fallback question if LLM unavailable after retries (unit)
- :warning: Form validation prevents empty submissions (unit)
- :warning: Trace-specific analysis findings appear on the trace card, pinned above feedback (collapsible) (unit)
- :warning: Promote action visibly moves items from trace feed/summary into the sidebar (unit)
- :warning: Draft rubric items show trace reference badges (interactive: hover for preview, click to scroll) (unit)
- :warning: "Create Rubric →" in sidebar transitions to rubric creation with groups pre-populated as criteria (unit)

### Covered Requirements

- [x] Facilitator can start Discovery phase with configurable trace limit (unit) **[BE-only]**
- [x] Participants view traces and provide GOOD/BAD + comment (unit) **[BE-only]**
- [x] Facilitator can select LLM model for follow-up question generation in Discovery dashboard (e2e-mocked, unit)
- [x] AI generates 3 follow-up questions per trace based on feedback (unit) **[BE-only]**
- [x] Questions build progressively on prior answers (unit) **[BE-only]**
- [x] All 3 questions required before moving to next trace (unit) **[BE-only]**
- [x] Previous Q&A visible while answering new questions (unit)
- [x] Loading spinner during LLM generation (1-3s) (unit)
- [x] Error handling with retry for LLM failures (unit) **[BE-only]**
- [x] Feedback saved incrementally (no data loss on failure) (e2e-real, unit)
- [x] Completion status shows % of participants finished (integration, unit) **[BE-only]**
- [x] Facilitator can view participant feedback details (label, comment, follow-up Q&A) (e2e-real, integration, unit)
- [x] Facilitator can trigger analysis at any time (even partial feedback) (e2e-mocked, unit)
- [x] Facilitator selects analysis template (Evaluation Criteria or Themes & Patterns) before running (e2e-mocked, unit)
- [x] System aggregates feedback by trace (unit) **[BE-only]**
- [x] Disagreements detected at 3 priority levels (deterministic, no LLM) (unit) **[BE-only]**
- [x] LLM distills evaluation criteria with evidence from trace IDs (unit) **[BE-only]**
- [x] LLM analyzes disagreements with follow-up questions and suggestions (unit) **[BE-only]**
- [x] Analysis record stores which template was used (unit) **[BE-only]**
- [x] Each analysis run creates a new record (history preserved) (e2e-mocked, unit)
- [x] Re-runnable — new analysis as more feedback comes in, prior analyses retained (unit) **[BE-only]**
- [x] Warning if < 2 participants (not an error) (e2e-mocked, unit)
- [x] Data freshness banner (participant count, last run timestamp) (unit)
- [x] Results organized by priority (HIGH → MEDIUM → LOWER) (unit)
- [x] Facilitator can promote distilled criteria to draft rubric (e2e-real, unit)
- [x] Facilitator can promote disagreement insights to draft rubric (e2e-real, unit)
- [x] Facilitator can promote raw participant feedback to draft rubric (e2e-real, unit)
- [x] Facilitator can manually add draft rubric items (e2e-real, unit)
- [x] Draft rubric items editable and removable (e2e-real, unit)
- [x] "Suggest Groups" returns LLM proposal without persisting (e2e-real, unit)
- [x] Facilitator can review, adjust, and apply group proposal (e2e-real, unit)
- [x] Manual grouping: create groups, name them, move items between groups (e2e-real, unit)
- [x] Each group maps to one rubric question (group name = question title) (e2e-real, unit)
- [x] Draft rubric items available during Rubric Creation phase (e2e-real, unit)
- [x] Source traceability maintained (which traces support each item) (e2e-real, unit)
- [x] One feedback record per (workshop, trace, user) — upsert behavior (integration, unit) **[BE-only]**
- [x] Q&A pairs appended in order to JSON array (integration, unit) **[BE-only]**
- [x] Multiple analysis records per workshop allowed (history preserved) (unit) **[BE-only]**
- [x] Draft rubric items track promotion source and promoter (unit) **[BE-only]**
- [x] LLM failures show error toast with retry (unit)
- [x] Fallback question if LLM unavailable after retries (unit) **[BE-only]**
- [x] Fallback warning banner shown only to facilitators, never to participants/SMEs (unit)
- [x] Analysis shows warning (not error) if < 2 participants (unit)
- [x] Form validation prevents empty submissions (unit) **[BE-only]**
- [x] Progressive disclosure (one question at a time) (e2e-real, unit)
- [x] Submit buttons disabled until required fields filled (unit)
- [x] Clear progress indication (X of Y traces completed) (e2e-real)
- [x] Smooth transitions between feedback states (unit)
- [x] Single two-panel workspace replaces multi-page flow (no FacilitatorDashboard discovery tabs, no FindingsReviewPage) (unit)
- [x] Trace feed shows actual trace content (input/output), not trace ID badges (unit)
- [x] Trace-specific analysis findings appear on the trace card, pinned above feedback (collapsible) (unit) **[BE-only]**
- [x] Cross-trace analysis findings appear in collapsible summary section above the feed (unit)
- [x] Overview bar shows stats inline + compact controls (Run Analysis, Add Traces, Pause, Model selector) (unit)
- [x] Draft rubric sidebar is always visible while browsing traces (e2e-mocked)
- [x] Promote action visibly moves items from trace feed/summary into the sidebar (unit) **[BE-only]**
- [x] Draft rubric items show trace reference badges (interactive: hover for preview, click to scroll) (unit) **[BE-only]**
- [x] Draft rubric items do NOT show source-type badges (Finding, Disagreement, etc.) (unit)
- [x] Disagreements color-coded by priority (red/yellow/blue) on trace cards (unit)
- [x] "Create Rubric →" in sidebar transitions to rubric creation with groups pre-populated as criteria (unit) **[BE-only]**

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/services/test_discovery_analysis_service.py` (test_draft_items_expose_source_trace_ids_for_display) [unit]
- `tests/unit/services/test_draft_rubric_items.py` (test_ungrouped_items_each_become_question) [unit]
- `tests/unit/services/test_draft_rubric_items.py` (test_no_items_raises_400) [unit]
- `tests/unit/services/test_draft_rubric_items.py` (test_mixed_grouped_and_ungrouped) [unit]
- `client/src/components/DiscoveryAnalysisTab.evidence.test.tsx` (renders evidence trace IDs for findings (truncated to 8 chars)) [unit]
- `client/src/components/DiscoveryAnalysisTab.evidence.test.tsx` (shows trace ID badge for each disagreement item) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (renders trace ID badges for items with source_trace_ids) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (does not render trace badges for manual items with no trace IDs) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (renders source type badges for each item) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (shows item count in header) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (creates a new manual group from item controls) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (moves an item into an existing group from item controls) [unit]

## DISCOVERY_TRACE_ASSIGNMENT_SPEC

**Coverage**: 13/13 requirements (100%)

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: Switching between discovery rounds hides/shows appropriate traces (unit)
- :warning: Phase/round context properly scoped in database (unit)
- :warning: Annotation traces randomized per (user_id, trace_set) pair (unit)
- :warning: When annotation dataset changes mid-round, new traces appended (unit)
- :warning: When annotation round changes, full re-randomization applied (unit)
- :warning: Randomization context includes phase and round info (unit)
- :warning: Dataset operations (union, subtract) work correctly and maintain audit trail (unit)
- :warning: Multiple participants can see same trace with different orders (unit)
- :warning: Inter-rater reliability (IRR) can be measured (same traces, different orders) (unit)

### Covered Requirements

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

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `client/tests/e2e/discovery-invite-traces.spec.ts` (discovery blocks until multiple participants complete; facilitator-driven phase with trace-based discovery) [e2e-mocked]
- `client/tests/e2e/facilitator-create-workshop.spec.ts` (facilitator can log in and create a workshop) [e2e-mocked]

## JUDGE_EVALUATION_SPEC

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
- `tests/unit/services/test_evaluation_tag_overwrite.py` (test_search_tagged_traces_returns_empty_after_align_overwrite) [unit]
- `tests/unit/services/test_evaluation_tag_overwrite.py` (test_run_evaluation_yields_error_when_no_eval_tagged_traces) [unit]
- `tests/unit/services/test_irr_utils.py` (test_format_irr_result_rounding_and_ready_flag) [unit]
- `client/tests/e2e/evaluation-tagging.spec.ts` (re-evaluate endpoint tags traces before searching MLflow) [e2e-real]
- `client/tests/e2e/evaluation-tagging.spec.ts` (begin-annotation auto-eval creates job and attempts tagging) [e2e-real]
- `client/tests/e2e/evaluation-tagging.spec.ts` (begin-annotation without eval model skips auto-eval) [e2e-real]

## ROLE_PERMISSIONS_SPEC

**Coverage**: 16/16 requirements (100%)

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: Facilitator role grants: can_create_rubric, can_manage_workshop, can_assign_annotations, can_view_all_findings, can_view_all_annotations, can_view_results (unit)
- :warning: Facilitator role denies: can_annotate, can_create_findings (unit)
- :warning: SME role grants: can_annotate, can_create_findings, can_view_discovery (unit)
- :warning: SME role denies: can_create_rubric, can_manage_workshop, can_view_results, can_view_all_annotations (unit)
- :warning: Participant role grants: can_annotate, can_create_findings, can_view_discovery (unit)
- :warning: Participant role denies: can_create_rubric, can_manage_workshop, can_view_results, can_view_all_annotations (unit)
- :warning: Permissions derived from role via UserPermissions.for_role() classmethod (unit)
- :warning: Facilitator role cannot be changed via update endpoint (unit)
- :warning: Facilitator accounts cannot be deleted via delete endpoint (unit)
- :warning: Only facilitators can create invitations (unit)
- :warning: Only facilitators can advance workshop phases (unit)
- :warning: Phase advancement validates prerequisites before transitioning (unit)
- :warning: Phase advancement returns 400 if prerequisites not met (unit)
- :warning: Facilitators authenticate via YAML config (preconfigured credentials) (unit)
- :warning: SMEs and participants authenticate via database credentials (unit)
- :warning: Login response includes is_preconfigured_facilitator flag for facilitator logins (unit)

### Covered Requirements

- [x] Facilitator role grants: can_create_rubric, can_manage_workshop, can_assign_annotations, can_view_all_findings, can_view_all_annotations, can_view_results (unit) **[BE-only]**
- [x] Facilitator role denies: can_annotate, can_create_findings (unit) **[BE-only]**
- [x] SME role grants: can_annotate, can_create_findings, can_view_discovery (unit) **[BE-only]**
- [x] SME role denies: can_create_rubric, can_manage_workshop, can_view_results, can_view_all_annotations (unit) **[BE-only]**
- [x] Participant role grants: can_annotate, can_create_findings, can_view_discovery (unit) **[BE-only]**
- [x] Participant role denies: can_create_rubric, can_manage_workshop, can_view_results, can_view_all_annotations (unit) **[BE-only]**
- [x] Permissions derived from role via UserPermissions.for_role() classmethod (unit) **[BE-only]**
- [x] Facilitator role cannot be changed via update endpoint (unit) **[BE-only]**
- [x] Facilitator accounts cannot be deleted via delete endpoint (unit) **[BE-only]**
- [x] Only facilitators can create invitations (unit) **[BE-only]**
- [x] Only facilitators can advance workshop phases (unit) **[BE-only]**
- [x] Phase advancement validates prerequisites before transitioning (unit) **[BE-only]**
- [x] Phase advancement returns 400 if prerequisites not met (unit) **[BE-only]**
- [x] Facilitators authenticate via YAML config (preconfigured credentials) (unit) **[BE-only]**
- [x] SMEs and participants authenticate via database credentials (unit) **[BE-only]**
- [x] Login response includes is_preconfigured_facilitator flag for facilitator logins (unit) **[BE-only]**

## RUBRIC_SPEC

**Coverage**: 25/25 requirements (100%)

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: Questions with multi-line descriptions parse correctly (unit)
- :warning: Delimiter never appears in user input (by design) (unit)
- :warning: Parsed questions have stable UUIDs within session (unit)
- :warning: Empty/whitespace-only parts filtered out (unit)
- :warning: Facilitator can edit an existing rubric question (unit)
- :warning: Facilitator can delete a rubric question (unit)
- :warning: Only one rubric exists per workshop (upsert semantics) (unit)
- :warning: Rubric required before advancing to annotation phase (unit)
- :warning: No phase restriction on rubric CRUD (unit)
- :warning: Question IDs re-indexed sequentially after deletion (unit)
- :warning: Annotation data preserved when rubric questions are deleted (unit)
- :warning: Judge name auto-derived from first rubric question title (unit)
- :warning: MLflow re-sync triggered on rubric create/update (best-effort) (unit)
- :warning: AI suggestions generated from discovery findings and participant notes (unit)
- :warning: Suggestions validated: title >= 3 chars, description >= 10 chars (unit)
- :warning: Invalid judge type in suggestions defaults to likert (unit)
- :warning: Facilitator can accept, reject, or edit suggestions before adding to rubric (unit)

### Covered Requirements

- [x] Questions with multi-line descriptions parse correctly (unit) **[BE-only]**
- [x] Delimiter never appears in user input (by design) (unit) **[BE-only]**
- [x] Frontend and backend use same delimiter constant (unit)
- [x] Per-question judge_type parsed from `[JUDGE_TYPE:xxx]` format (e2e-real, unit)
- [x] Parsed questions have stable UUIDs within session (unit) **[BE-only]**
- [x] Empty/whitespace-only parts filtered out (unit) **[BE-only]**
- [x] Likert scale shows 1-5 rating options (e2e-real)
- [x] Binary scale shows Pass/Fail buttons (not star ratings) (e2e-real)
- [x] Binary feedback logged as 0/1 to MLflow (not 3) (e2e-real)
- [x] Mixed rubrics support different scales per question (e2e-real, unit)
- [x] Facilitator can create a rubric question with title and description (e2e-mocked, unit)
- [x] Facilitator can edit an existing rubric question (unit) **[BE-only]**
- [x] Facilitator can delete a rubric question (unit) **[BE-only]**
- [x] Only one rubric exists per workshop (upsert semantics) (unit) **[BE-only]**
- [x] Rubric persists and is retrievable via GET after creation (e2e-mocked, e2e-real)
- [x] Rubric required before advancing to annotation phase (unit) **[BE-only]**
- [x] No phase restriction on rubric CRUD (unit) **[BE-only]**
- [x] Question IDs re-indexed sequentially after deletion (unit) **[BE-only]**
- [x] Annotation data preserved when rubric questions are deleted (unit) **[BE-only]**
- [x] Judge name auto-derived from first rubric question title (unit) **[BE-only]**
- [x] MLflow re-sync triggered on rubric create/update (best-effort) (unit) **[BE-only]**
- [x] AI suggestions generated from discovery findings and participant notes (unit) **[BE-only]**
- [x] Suggestions validated: title >= 3 chars, description >= 10 chars (unit) **[BE-only]**
- [x] Invalid judge type in suggestions defaults to likert (unit) **[BE-only]**
- [x] Facilitator can accept, reject, or edit suggestions before adding to rubric (unit) **[BE-only]**

## TESTING_SPEC

**Coverage**: 0/30 requirements (0%)

### Uncovered Requirements

- [ ] `tests/integration/conftest.py` provides real-DB fixtures with transaction rollback isolation
- [ ] Integration tests run against SQLite (default) and Postgres (via testcontainers)
- [ ] `just test-integration` recipe exists and passes
- [ ] Workshop CRUD tested end-to-end through HTTP → DB → response
- [ ] Trace ingestion tested: bulk upload, retrieval, metadata persistence
- [ ] Phase transition prerequisites enforced: no discovery without traces, no annotation without rubric
- [ ] Annotation upsert semantics verified: same user+trace updates (not duplicates), different users create separate records
- [ ] Discovery finding upsert semantics verified at DB level
- [ ] All integration tests tagged with `@pytest.mark.integration` and `@pytest.mark.spec()`
- [ ] External services (MLflow, Databricks) mocked — only database is real
- [ ] Connection resilience tested (Postgres-only): pool reset disposes + refreshes OAuth, `get_db()` retries with backoff, stale connections detected via `pool_pre_ping`
- [ ] Tests are hermetic: no shared state, runnable in any order
- [ ] Contract shapes documented for all 5 MLflow domains (trace ops, feedback, evaluation, alignment, experiment management)
- [ ] Mock shape tests verify test mocks match real MLflow response structures
- [ ] Call-site tests verify services pass correct parameter types to MLflow methods
- [ ] Error classification tested: retryable vs non-retryable errors handled correctly
- [ ] Feedback value types validated: binary (0.0/1.0 float), likert (1.0-5.0 float)
- [ ] Assessment limit (50 per trace) handling tested
- [ ] Contract tests tagged with `@pytest.mark.spec("TESTING_SPEC")`
- [ ] Server unit tests pass with >20% coverage
- [ ] Client unit tests pass with >20% coverage
- [ ] Integration tests pass against real database (SQLite + Postgres)
- [ ] Contract tests verify MLflow integration boundaries
- [ ] E2E tests pass for critical flows
- [ ] Tests run in CI on every PR
- [ ] Coverage reports generated and accessible
- [ ] No flaky tests (consistent pass/fail)
- [ ] Test isolation (no shared state between tests)
- [ ] `just test-integration` recipe works
- [ ] `just test-contract` recipe works

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/contract/test_mlflow_contracts.py` (test_trace_info_has_required_fields) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_trace_data_has_required_fields) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_span_has_required_fields) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_assessment_has_required_fields) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_assessment_source_has_required_fields) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_experiment_has_required_fields) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_assessment_limit_not_retried) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_not_found_not_retried) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_404_error_not_retried) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_unauthorized_not_retried) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_transient_error_retried) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_retry_succeeds_on_second_attempt) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_exponential_backoff_delays) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_binary_values_are_float) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_likert_values_in_range) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_rating_normalization) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_log_feedback_parameter_types) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_log_feedback_ai_source_format) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_retry_wrapper_passes_through_return_value) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_set_trace_tag_receives_strings) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_search_traces_parameter_types) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_assessment_limit_error_returns_none) [unit]
- `tests/contract/test_mlflow_contracts.py` (test_dedup_check_counts_existing_assessments) [unit]
- `tests/integration/test_annotation_submission.py` (test_submit_annotation) [integration]
- `tests/integration/test_annotation_submission.py` (test_annotation_upsert_same_user_same_trace) [integration]
- `tests/integration/test_annotation_submission.py` (test_annotation_different_users_create_separate_records) [integration]
- `tests/integration/test_annotation_submission.py` (test_annotation_with_multi_ratings) [integration]
- `tests/integration/test_annotation_submission.py` (test_get_annotations_filtered_by_user) [integration]
- `tests/integration/test_connection_resilience.py` (test_disconnection_error_is_connection_error) [integration]
- `tests/integration/test_connection_resilience.py` (test_operational_error_is_connection_error) [integration]
- `tests/integration/test_connection_resilience.py` (test_generic_exception_with_connection_message) [integration]
- `tests/integration/test_connection_resilience.py` (test_generic_exception_without_connection_message) [integration]
- `tests/integration/test_connection_resilience.py` (test_known_pg_error_messages[server closed the connection unexpectedly]) [integration]
- `tests/integration/test_connection_resilience.py` (test_known_pg_error_messages[terminating connection]) [integration]
- `tests/integration/test_connection_resilience.py` (test_known_pg_error_messages[connection reset]) [integration]
- `tests/integration/test_connection_resilience.py` (test_known_pg_error_messages[ssl connection has been closed unexpectedly]) [integration]
- `tests/integration/test_connection_resilience.py` (test_known_pg_error_messages[could not connect to server]) [integration]
- `tests/integration/test_connection_resilience.py` (test_known_pg_error_messages[connection refused]) [integration]
- `tests/integration/test_connection_resilience.py` (test_known_pg_error_messages[connection timed out]) [integration]
- `tests/integration/test_connection_resilience.py` (test_known_pg_error_messages[invalid authorization]) [integration]
- `tests/integration/test_connection_resilience.py` (test_known_pg_error_messages[database is locked]) [integration]
- `tests/integration/test_connection_resilience.py` (test_reset_disposes_engine) [integration]
- `tests/integration/test_connection_resilience.py` (test_reset_refreshes_oauth_for_postgres) [integration]
- `tests/integration/test_connection_resilience.py` (test_retries_on_connection_error_then_succeeds) [integration]
- `tests/integration/test_connection_resilience.py` (test_gives_up_after_max_attempts) [integration]
- `tests/integration/test_connection_resilience.py` (test_non_connection_error_raises_immediately) [integration]
- `tests/integration/test_discovery_findings.py` (test_submit_finding) [integration]
- `tests/integration/test_discovery_findings.py` (test_finding_upsert_same_user_same_trace) [integration]
- `tests/integration/test_discovery_findings.py` (test_finding_different_users_create_separate_records) [integration]
- `tests/integration/test_discovery_findings.py` (test_get_findings_filtered_by_user) [integration]
- `tests/integration/test_discovery_findings.py` (test_findings_scoped_to_workshop) [integration]
- `tests/integration/test_phase_transitions.py` (test_advance_to_discovery_requires_traces) [integration]
- `tests/integration/test_phase_transitions.py` (test_advance_to_discovery_succeeds_with_traces) [integration]
- `tests/integration/test_phase_transitions.py` (test_advance_to_discovery_wrong_phase) [integration]
- `tests/integration/test_phase_transitions.py` (test_advance_to_rubric_requires_findings) [integration]
- `tests/integration/test_phase_transitions.py` (test_advance_to_rubric_succeeds_with_findings) [integration]
- `tests/integration/test_phase_transitions.py` (test_advance_to_annotation_requires_rubric) [integration]
- `tests/integration/test_phase_transitions.py` (test_advance_to_annotation_succeeds_with_rubric) [integration]
- `tests/integration/test_phase_transitions.py` (test_advance_to_discovery_workshop_not_found) [integration]
- `tests/integration/test_trace_ingestion.py` (test_upload_traces) [integration]
- `tests/integration/test_trace_ingestion.py` (test_upload_traces_with_metadata) [integration]
- `tests/integration/test_trace_ingestion.py` (test_upload_traces_with_mlflow_fields) [integration]
- `tests/integration/test_trace_ingestion.py` (test_get_all_traces) [integration]
- `tests/integration/test_trace_ingestion.py` (test_traces_scoped_to_workshop) [integration]
- `tests/integration/test_workshop_crud.py` (test_create_workshop) [integration]
- `tests/integration/test_workshop_crud.py` (test_get_workshop) [integration]
- `tests/integration/test_workshop_crud.py` (test_get_workshop_not_found) [integration]
- `tests/integration/test_workshop_crud.py` (test_list_workshops) [integration]
- `tests/integration/test_workshop_crud.py` (test_list_workshops_filtered_by_facilitator) [integration]
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
