# Spec Test Coverage Map

**Generated**: 2026-02-10 10:47:20

This report shows test coverage for each specification's success criteria.

## Test Pyramid Summary

| Type | Count | Description |
|------|-------|-------------|
| Unit | 161 | pytest unit tests, Vitest tests |
| Integration | 0 | pytest with real DB/API |
| E2E (Mocked) | 6 | Playwright with mocked API |
| E2E (Real) | 31 | Playwright with real API |

## Coverage Summary

| Spec | Reqs | Covered | Cover% | Unit | Int | E2E-M | E2E-R |
|------|------|---------|--------|------|-----|-------|-------|
| [ANNOTATION_SPEC](#annotation-spec) | 9 | 2 | 22% | 41 | 0 | 0 | 6 |
| [AUTHENTICATION_SPEC](#authentication-spec) | 7 | 4 | 57% | 11 | 0 | 2 | 0 |
| [BUILD_AND_DEPLOY_SPEC](#build-and-deploy-spec) | 15 | 1 | 6% | 9 | 0 | 0 | 0 |
| [CUSTOM_LLM_PROVIDER_SPEC](#custom-llm-provider-spec) | 15 | 0 | 0% | 13 | 0 | 1 | 0 |
| [DATASETS_SPEC](#datasets-spec) | 9 | 2 | 22% | 9 | 0 | 0 | 1 |
| [DESIGN_SYSTEM_SPEC](#design-system-spec) | 7 | 0 | 0% | 4 | 0 | 1 | 0 |
| [DISCOVERY_TRACE_ASSIGNMENT_SPEC](#discovery-trace-assignment-spec) | 13 | 3 | 23% | 8 | 0 | 1 | 1 |
| [JUDGE_EVALUATION_SPEC](#judge-evaluation-spec) | 25 | 7 | 28% | 43 | 0 | 0 | 7 |
| [RUBRIC_SPEC](#rubric-spec) | 10 | 0 | 0% | 16 | 0 | 1 | 6 |
| [TESTING_SPEC](#testing-spec) | 7 | 0 | 0% | 3 | 0 | 0 | 0 |
| [TRACE_DISPLAY_SPEC](#trace-display-spec) | 0 | 0 | 100% | 4 | 0 | 0 | 6 |
| [UI_COMPONENTS_SPEC](#ui-components-spec) | 16 | 0 | 0% | 0 | 0 | 0 | 4 |

**Total**: 19/133 requirements covered (14%)

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
- `client/tests/e2e/annotation-flow.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/annotation-last-trace.spec.ts` (file-level) [e2e-real]

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

- `tests/unit/routers/test_auth_edge_cases.py` (test_permission_api_failure_returns_defaults_when_user_not_found) [unit]
- `tests/unit/routers/test_auth_edge_cases.py` (test_permission_api_returns_role_based_defaults_for_valid_user) [unit]
- `tests/unit/routers/test_auth_edge_cases.py` (test_permission_api_failure_when_db_service_raises) [unit]
- `client/tests/e2e/facilitator-create-workshop.spec.ts` (file-level) [e2e-mocked]
- `client/tests/e2e/authentication.spec.ts` (file-level) [e2e-mocked]

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

- `tests/unit/test_sqlite_rescue.py` (test_default_database_url) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_valid_volume_path) [unit]
- `tests/unit/test_sqlite_rescue.py` (test_extracts_volume_root) [unit]
- `tests/unit/test_build_deploy.py` (test_bootstrap_creates_db_file) [unit]
- `tests/unit/test_build_deploy.py` (test_migrations_directory_exists) [unit]
- `tests/unit/test_build_deploy.py` (test_lock_is_exclusive) [unit]
- `tests/unit/test_build_deploy.py` (test_vite_config_specifies_terser) [unit]
- `tests/unit/test_build_deploy.py` (test_release_workflow_exists) [unit]

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
- `client/tests/e2e/custom-llm-provider.spec.ts` (file-level) [e2e-mocked]

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
- `tests/unit/services/test_dataset_operations.py` (test_two_users_different_orders) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_facilitator_order_is_chronological) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_incremental_addition_preserves_existing_order) [unit]
- `tests/unit/services/test_dataset_operations.py` (test_new_round_produces_different_order) [unit]
- `client/tests/e2e/dataset-operations.spec.ts` (file-level) [e2e-real]
- `client/src/utils/traceUtils.test.ts` (file-level) [unit]
- `client/src/utils/traceUtils.test.ts` (file-level) [unit]

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

- `client/tests/e2e/design-system.spec.ts` (file-level) [e2e-mocked]
- `client/src/test/design-system.test.ts` (file-level) [unit]
- `client/src/test/design-system.test.ts` (file-level) [unit]
- `client/src/lib/utils.test.ts` (file-level) [unit]
- `client/src/lib/utils.test.ts` (file-level) [unit]

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
- `tests/unit/services/test_trace_assignment.py` (test_different_users_different_order) [unit]
- `tests/unit/services/test_trace_assignment.py` (test_append_preserves_existing_positions) [unit]
- `tests/unit/services/test_trace_assignment.py` (test_new_dataset_triggers_fresh_randomization) [unit]
- `client/tests/e2e/trace-visibility.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/discovery-invite-traces.spec.ts` (file-level) [e2e-mocked]
- `client/src/hooks/useWorkshopApi.test.ts` (file-level) [unit]

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
- `tests/unit/services/test_irr_utils.py` (test_format_irr_result_rounding_and_ready_flag) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_binary) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_likert) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_mixed_prefers_binary) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_no_rubric_defaults_likert) [unit]
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
- `client/tests/e2e/judge-evaluation.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/judge-evaluation.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/judge-evaluation.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/auto-evaluation.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/auto-evaluation.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/auto-evaluation.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/auto-evaluation.spec.ts` (file-level) [e2e-real]
- `client/src/utils/modelMapping.test.ts` (file-level) [unit]

## RUBRIC_SPEC

**Coverage**: 0/10 requirements (0%)

### Uncovered Requirements

- [ ] Questions with multi-line descriptions parse correctly
- [ ] Delimiter never appears in user input (by design)
- [ ] Frontend and backend use same delimiter constant
- [ ] Likert scale shows 1-5 rating options
- [ ] Binary scale shows Pass/Fail buttons (not star ratings)
- [ ] Binary feedback logged as 0/1 to MLflow (not 3)
- [ ] Per-question judge_type parsed from `[JUDGE_TYPE:xxx]` format
- [ ] Mixed rubrics support different scales per question
- [ ] Parsed questions have stable UUIDs within session
- [ ] Empty/whitespace-only parts filtered out

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/services/test_rubric_parsing.py` (test_simple_questions) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_reconstruct_simple_questions) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_parse_reconstruct_roundtrip) [unit]
- `tests/unit/services/test_rubric_parsing.py` (test_binary_judge_type_parsed_correctly) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_with_judge_type_binary) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_with_judge_type_likert) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_default_to_likert) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_mixed_types) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_with_freeform) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_empty_input) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_multiline_description) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_reconstruct_rubric_questions_with_judge_type) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_reconstruct_rubric_questions_empty) [unit]
- `tests/unit/services/test_database_service_rubric.py` (test_parse_reconstruct_roundtrip) [unit]
- `client/tests/e2e/rubric-judge-type.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/rubric-judge-type.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/rubric-judge-type.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/rubric-judge-type.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/rubric-judge-type.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/rubric-persistence.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/rubric-creation.spec.ts` (file-level) [e2e-mocked]
- `client/src/utils/rubricUtils.test.ts` (file-level) [unit]
- `client/src/utils/rubricUtils.test.ts` (file-level) [unit]

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
- `tests/unit/test_testing_infrastructure.py` (test_conftest_has_spec_option) [unit]
- `tests/unit/test_testing_infrastructure.py` (test_e2e_workflow_exists) [unit]

## TRACE_DISPLAY_SPEC

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/utils/test_jsonpath_utils.py` (test_simple_extraction) [unit]
- `tests/unit/utils/test_jsonpath_utils.py` (test_valid_jsonpath) [unit]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/jsonpath-trace-display.spec.ts` (file-level) [e2e-real]
- `client/src/hooks/useJsonPathExtraction.test.ts` (file-level) [unit]
- `client/src/hooks/useJsonPathExtraction.test.ts` (file-level) [unit]

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

- `client/tests/e2e/ui-components.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/ui-components.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/ui-components.spec.ts` (file-level) [e2e-real]
- `client/tests/e2e/ui-components.spec.ts` (file-level) [e2e-real]

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
