# Spec Test Coverage Map

**Generated**: 2026-02-11 22:01:15

This report shows test coverage for each specification's success criteria.

## Test Pyramid Summary

| Type | Count | Description |
|------|-------|-------------|
| Unit | 421 | pytest unit tests, Vitest tests |
| Integration | 0 | pytest with real DB/API |
| E2E (Mocked) | 13 | Playwright with mocked API |
| E2E (Real) | 37 | Playwright with real API |

## Coverage Summary

| Spec | Reqs | Covered | Cover% | Unit | Int | E2E-M | E2E-R |
|------|------|---------|--------|------|-----|-------|-------|
| [ANNOTATION_SPEC](#annotation-spec) | 9 | 2 | 22% | 41 | 0 | 0 | 12 |
| [AUTHENTICATION_SPEC](#authentication-spec) | 7 | 5 | 71% | 11 | 0 | 3 | 0 |
| [BUILD_AND_DEPLOY_SPEC](#build-and-deploy-spec) | 15 | 1 | 6% | 43 | 0 | 0 | 0 |
| [CUSTOM_LLM_PROVIDER_SPEC](#custom-llm-provider-spec) | 15 | 0 | 0% | 13 | 0 | 7 | 0 |
| [DATASETS_SPEC](#datasets-spec) | 9 | 2 | 22% | 19 | 0 | 0 | 2 |
| [DESIGN_SYSTEM_SPEC](#design-system-spec) | 7 | 0 | 0% | 40 | 0 | 0 | 0 |
| [DISCOVERY_TRACE_ASSIGNMENT_SPEC](#discovery-trace-assignment-spec) | 13 | 3 | 23% | 14 | 0 | 2 | 3 |
| [JUDGE_EVALUATION_SPEC](#judge-evaluation-spec) | 25 | 7 | 28% | 76 | 0 | 0 | 6 |
| [RUBRIC_SPEC](#rubric-spec) | 25 | 10 | 40% | 52 | 0 | 1 | 6 |
| [TESTING_SPEC](#testing-spec) | 7 | 0 | 0% | 12 | 0 | 0 | 0 |
| [TRACE_DISPLAY_SPEC](#trace-display-spec) | 0 | 0 | 100% | 43 | 0 | 0 | 6 |
| [UI_COMPONENTS_SPEC](#ui-components-spec) | 16 | 0 | 0% | 57 | 0 | 0 | 2 |

**Total**: 30/148 requirements covered (20%)

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

- `tests/unit/routers/test_annotation_crud.py` (test_upsert_creates_new_annotation) [unit]
- `tests/unit/routers/test_annotation_crud.py` (test_upsert_updates_existing_annotation) [unit]
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
- `client/tests/e2e/annotation-flow.spec.ts` (new annotation shows "Annotation saved!" toast) [e2e-real]
- `client/tests/e2e/annotation-flow.spec.ts` (edit annotation shows "Annotation updated!" toast) [e2e-real]
- `client/tests/e2e/annotation-flow.spec.ts` (multi-line comment preserves newlines) [e2e-real]
- `client/tests/e2e/annotation-flow.spec.ts` (comment-only edit triggers updated toast) [e2e-real]
- `client/tests/e2e/annotation-flow.spec.ts` (next button enabled for annotated traces) [e2e-real]
- `client/tests/e2e/annotation-flow.spec.ts` (annotation count is accurate) [e2e-real]
- `client/tests/e2e/annotation-last-trace.spec.ts` (10 users annotating same trace simultaneously should all succeed) [e2e-real]
- `client/tests/e2e/annotation-last-trace.spec.ts` (10 users annotating 10 traces simultaneously (100 concurrent writes)) [e2e-real]

## AUTHENTICATION_SPEC

**Coverage**: 5/7 requirements (71%)

### Uncovered Requirements

- [ ] Permission API failure: User can log in with defaults
- [ ] Rapid navigation: Components wait for `isLoading = false`

### Covered Requirements

- [x] No "permission denied" errors on normal login (unit)
- [x] No page refresh required after login (unit)
- [x] Slow network: Loading indicator shown until ready (e2e-mocked)
- [x] 404 on validation: Session cleared, fresh login allowed (unit)
- [x] Error recovery: Errors cleared on new login attempt (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/routers/test_auth_edge_cases.py` (test_permission_api_failure_returns_defaults_when_user_not_found) [unit]
- `tests/unit/routers/test_auth_edge_cases.py` (test_permission_api_returns_role_based_defaults_for_valid_user) [unit]
- `tests/unit/routers/test_auth_edge_cases.py` (test_permission_api_failure_when_db_service_raises) [unit]
- `client/tests/e2e/authentication.spec.ts` (error clears on new login attempt) [e2e-mocked]
- `client/tests/e2e/facilitator-create-workshop.spec.ts` (facilitator can log in and create a workshop) [e2e-mocked]

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

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/test_build_deploy.py` (test_bootstrap_creates_db_file) [unit]
- `tests/unit/test_build_deploy.py` (test_bootstrap_full_creates_db_when_missing) [unit]
- `tests/unit/test_build_deploy.py` (test_bootstrap_skips_existing_db) [unit]
- `tests/unit/test_build_deploy.py` (test_migrations_directory_exists) [unit]
- `tests/unit/test_build_deploy.py` (test_baseline_migration_exists) [unit]
- `tests/unit/test_build_deploy.py` (test_alembic_ini_exists) [unit]
- `tests/unit/test_build_deploy.py` (test_migration_env_exists) [unit]
- `tests/unit/test_build_deploy.py` (test_lock_is_exclusive) [unit]
- `tests/unit/test_build_deploy.py` (test_lock_timeout_raises) [unit]
- `tests/unit/test_build_deploy.py` (test_vite_config_specifies_terser) [unit]
- `tests/unit/test_build_deploy.py` (test_vite_config_has_drop_debugger) [unit]
- `tests/unit/test_build_deploy.py` (test_vite_config_drop_console_current_behavior) [unit]
- `tests/unit/test_build_deploy.py` (test_vite_config_output_dir_is_build) [unit]
- `tests/unit/test_build_deploy.py` (test_release_workflow_exists) [unit]
- `tests/unit/test_build_deploy.py` (test_excludes_git_directory) [unit]
- `tests/unit/test_build_deploy.py` (test_excludes_node_modules) [unit]
- `tests/unit/test_build_deploy.py` (test_excludes_database_files) [unit]
- `tests/unit/test_build_deploy.py` (test_excludes_pycache) [unit]
- `tests/unit/test_build_deploy.py` (test_excludes_env_files) [unit]
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

**Coverage**: 2/9 requirements (22%)

### Uncovered Requirements

- [ ] Union operation combines traces from multiple datasets
- [ ] Subtract operation removes specified traces
- [ ] Same user sees same order for same dataset (deterministic)
- [ ] Different users see different orders (per-user randomization)
- [ ] Adding traces preserves existing order (incremental)
- [ ] New round triggers fresh randomization
- [ ] Facilitators see chronological order (no randomization)

### Covered Requirements

- [x] Datasets can be created with arbitrary trace lists (unit)
- [x] Dataset lineage tracked (source datasets, operations) (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/services/test_dataset_operations.py` (test_same_user_same_traces_same_order) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_order_stable_across_many_calls) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_two_users_different_orders) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_many_users_all_distinct) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_facilitator_order_is_chronological) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_incremental_addition_preserves_existing_order) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_incremental_addition_no_duplicates) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_new_round_produces_different_order) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_same_traces_new_round_still_same_order) [unit]
- `client/tests/e2e/dataset-operations.spec.ts` (facilitator creates dataset, traces appear) [e2e-real]
- `client/tests/e2e/dataset-operations.spec.ts` (two users see different trace orders) [e2e-real]
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

## DISCOVERY_TRACE_ASSIGNMENT_SPEC

**Coverage**: 3/13 requirements (23%)

### Uncovered Requirements

- [ ] Participants only see traces in current active discovery dataset
- [ ] When new discovery round starts, old traces hidden (not deleted)
- [ ] Randomization persistent across page reloads for same trace set
- [ ] When annotation dataset changes mid-round, new traces appended
- [ ] When annotation round changes, full re-randomization applied
- [ ] Randomization context includes phase and round info
- [ ] Dataset operations (union, subtract) work correctly and maintain audit trail
- [ ] Multiple participants can see same trace with different orders
- [ ] Assignment metadata properly tracks all context
- [ ] Inter-rater reliability (IRR) can be measured (same traces, different orders)

### Covered Requirements

- [x] Switching between discovery rounds hides/shows appropriate traces (unit)
- [x] Phase/round context properly scoped in database (unit)
- [x] Annotation traces randomized per (user_id, trace_set) pair (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/services/test_trace_assignment.py` (test_active_traces_only_current_round) [unit]
- `tests/unit/services/test_trace_assignment.py` (test_empty_active_traces_returns_nothing) [unit]
- `tests/unit/services/test_trace_assignment.py` (test_different_users_different_order) [unit]
- `tests/unit/services/test_trace_assignment.py` (test_order_deterministic_for_same_user) [unit]
- `tests/unit/services/test_trace_assignment.py` (test_irr_measurement_possible) [unit]
- `tests/unit/services/test_trace_assignment.py` (test_append_preserves_existing_positions) [unit]
- `tests/unit/services/test_trace_assignment.py` (test_no_reshuffle_on_addition) [unit]
- `tests/unit/services/test_trace_assignment.py` (test_new_dataset_triggers_fresh_randomization) [unit]
- `tests/unit/services/test_trace_assignment.py` (test_round_change_not_incremental) [unit]
- `client/tests/e2e/discovery-invite-traces.spec.ts` (discovery blocks until multiple participants complete; facilitator-driven phase with trace-based discovery) [e2e-mocked]
- `client/tests/e2e/facilitator-create-workshop.spec.ts` (facilitator can log in and create a workshop) [e2e-mocked]
- `client/tests/e2e/trace-visibility.spec.ts` (participant sees only current round traces) [e2e-real]
- `client/tests/e2e/trace-visibility.spec.ts` (old traces hidden after round change) [e2e-real]
- `client/tests/e2e/trace-visibility.spec.ts` (annotation order persistent across reload) [e2e-real]
- `client/src/hooks/useWorkshopApi.test.ts` (invalidateAllWorkshopQueries passes a predicate that matches workshop-related keys) [unit]
- `client/src/hooks/useWorkshopApi.test.ts` (refetchAllWorkshopQueries passes a predicate that matches workshop-related keys) [unit]

## JUDGE_EVALUATION_SPEC

**Coverage**: 7/25 requirements (28%)

### Uncovered Requirements

- [ ] Likert judges return values 1-5
- [ ] Binary judges return values 0 or 1
- [ ] Fallback conversion handles Likert-style returns for binary
- [ ] Results reload correctly in UI
- [ ] Auto-evaluation runs in background when annotation phase starts
- [ ] Judge prompt auto-derived from rubric questions
- [ ] Per-question judge_type parsed from rubric (`[JUDGE_TYPE:xxx]`)
- [ ] Binary rubrics evaluated with 0/1 scale (not 1-5)
- [ ] Auto-evaluation model stored for re-evaluation consistency
- [ ] Results appear in Judge Tuning page
- [ ] Re-evaluate loads registered judge with aligned instructions
- [ ] Uses same model as initial auto-evaluation
- [ ] Spinner stops when re-evaluation completes
- [ ] Results stored against correct prompt version
- [ ] Pre-align and post-align scores directly comparable
- [ ] MemAlign distills semantic memory (guidelines)
- [ ] Aligned judge registered to MLflow
- [ ] Metrics reported (guideline count, example count)

### Covered Requirements

- [x] Evaluation results persisted to database (unit)
- [x] Alignment jobs run asynchronously (unit)
- [x] Works for both Likert and Binary scales (unit)
- [x] Krippendorff's Alpha calculated correctly (unit)
- [x] Cohen's Kappa calculated for rater pairs (unit)
- [x] Handles edge cases (no variation, single rater) (unit)
- [x] Updates when new annotations added (unit)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/routers/test_workshops_begin_annotation.py` (test_begin_annotation_with_auto_eval_enabled) [unit]
- `tests/unit/routers/test_workshops_begin_annotation.py` (test_begin_annotation_with_auto_eval_disabled) [unit]
- `tests/unit/routers/test_workshops_begin_annotation.py` (test_begin_annotation_requires_rubric) [unit]
- `tests/unit/routers/test_workshops_router.py` (test_re_evaluate_uses_stored_auto_evaluation_model) [unit]
- `tests/unit/services/test_alignment_service.py` (test_normalize_judge_prompt_converts_placeholders_to_mlflow_style) [unit]
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_scale) [unit]
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_all_pass) [unit]
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_all_fail) [unit]
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_mixed_ratings) [unit]
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_empty) [unit]
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_threshold_conversion) [unit]
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_likert_default) [unit]
- `tests/unit/services/test_cohens_kappa.py` (test_interpret_cohens_kappa_bucket_edges) [unit]
- `tests/unit/services/test_cohens_kappa.py` (test_is_cohens_kappa_acceptable_default_threshold) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_binary) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_likert) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_mixed_prefers_binary) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_no_rubric_defaults_likert) [unit]
- `tests/unit/services/test_irr_utils.py` (test_format_irr_result_rounding_and_ready_flag) [unit]
- `client/tests/e2e/auto-evaluation.spec.ts` (begin annotation dialog shows model selection when auto-eval is available) [e2e-real]
- `client/tests/e2e/auto-evaluation.spec.ts` (annotation phase can start without auto-evaluation) [e2e-real]
- `client/tests/e2e/auto-evaluation.spec.ts` (judge tuning page displays evaluation results section) [e2e-real]
- `client/tests/e2e/auto-evaluation.spec.ts` (model dropdown shows available evaluation models) [e2e-real]
- `client/tests/e2e/judge-evaluation.spec.ts` (re-evaluation spinner stops after completion) [e2e-real]
- `client/tests/e2e/judge-evaluation.spec.ts` (pre and post alignment scores visible in results) [e2e-real]
- `client/src/components/JudgeTypeSelector.test.tsx` (renders all three judge type cards) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (displays descriptions for each judge type) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (shows features for Likert judge) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (shows features for Binary judge) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (shows features for Free-form judge) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (shows use cases for each judge type) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (calls onTypeChange when clicking Likert card) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (calls onTypeChange when clicking Binary card) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (calls onTypeChange when clicking Free-form card) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (highlights selected type with checkmark) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (does not call onTypeChange when disabled) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (applies opacity styling when disabled) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (includes 1-5 scale rating instructions) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (includes rubric placeholder) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (includes input and output placeholders) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (includes 0/1 rating instructions) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (includes criteria placeholder) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (includes example format) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (includes qualitative feedback instructions) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (includes focus placeholder) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (has pass_fail preset) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (has yes_no preset) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (has accept_reject preset) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (has safe_unsafe preset) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (has compliant_violation preset) [unit]
- `client/src/components/JudgeTypeSelector.test.tsx` (all presets have pass and fail keys) [unit]
- `client/src/utils/modelMapping.test.ts` (maps known frontend names to backend names and back) [unit]
- `client/src/utils/modelMapping.test.ts` (passes through unknown names) [unit]
- `client/src/utils/modelMapping.test.ts` (requiresDatabricks is true for mapped options) [unit]
- `client/src/utils/modelMapping.test.ts` (getModelOptions disables options when config missing) [unit]

## RUBRIC_SPEC

**Coverage**: 10/25 requirements (40%)

### Uncovered Requirements

- [ ] Facilitator can create a rubric question with title and description
- [ ] Facilitator can edit an existing rubric question
- [ ] Facilitator can delete a rubric question
- [ ] Only one rubric exists per workshop (upsert semantics)
- [ ] Rubric persists and is retrievable via GET after creation
- [ ] Rubric required before advancing to annotation phase
- [ ] No phase restriction on rubric CRUD
- [ ] Question IDs re-indexed sequentially after deletion
- [ ] Annotation data preserved when rubric questions are deleted
- [ ] Judge name auto-derived from first rubric question title
- [ ] MLflow re-sync triggered on rubric create/update (best-effort)
- [ ] AI suggestions generated from discovery findings and participant notes
- [ ] Suggestions validated: title >= 3 chars, description >= 10 chars
- [ ] Invalid judge type in suggestions defaults to likert
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
- `client/tests/e2e/rubric-creation.spec.ts` (rubric creation: facilitator can advance from discovery and create a rubric question) [e2e-mocked]
- `client/tests/e2e/rubric-judge-type.spec.ts` (default judge type is likert when not specified) [e2e-real]
- `client/tests/e2e/rubric-persistence.spec.ts` (mixed rubric with binary and likert questions persists after reload) [e2e-real]

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
