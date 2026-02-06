# Spec Test Coverage Map

**Generated**: 2026-02-05 22:18:08

This report shows which tests cover each specification.
Tests are tagged using framework-specific conventions:

- **pytest**: `@pytest.mark.spec("SPEC_NAME")`
- **Playwright**: `{ tag: ['@spec:SPEC_NAME'] }` or `@spec:SPEC_NAME` in test title
- **Vitest**: `// @spec SPEC_NAME` comment or `describe('@spec:SPEC_NAME', ...)`

---

## Coverage Summary

| Spec | pytest | Playwright | Vitest | Total | Status |
|------|--------|------------|--------|-------|--------|
| [ANNOTATION_SPEC](#annotation-spec) | 6 | 2 | 0 | 8 | ✅ Covered |
| [AUTHENTICATION_SPEC](#authentication-spec) | 11 | 2 | 0 | 13 | ✅ Covered |
| [BUILD_AND_DEPLOY_SPEC](#build-and-deploy-spec) | 9 | 0 | 0 | 9 | ✅ Covered |
| [CUSTOM_LLM_PROVIDER_SPEC](#custom-llm-provider-spec) | 13 | 1 | 0 | 14 | ✅ Covered |
| [DATASETS_SPEC](#datasets-spec) | 7 | 1 | 2 | 10 | ✅ Covered |
| [DESIGN_SYSTEM_SPEC](#design-system-spec) | 0 | 1 | 4 | 5 | ✅ Covered |
| [DISCOVERY_TRACE_ASSIGNMENT_SPEC](#discovery-trace-assignment-spec) | 7 | 2 | 1 | 10 | ✅ Covered |
| [JUDGE_EVALUATION_SPEC](#judge-evaluation-spec) | 42 | 6 | 1 | 49 | ✅ Covered |
| [RUBRIC_SPEC](#rubric-spec) | 14 | 7 | 2 | 23 | ✅ Covered |
| [TESTING_SPEC](#testing-spec) | 3 | 0 | 0 | 3 | ✅ Covered |
| [TRACE_DISPLAY_SPEC](#trace-display-spec) | 2 | 6 | 2 | 10 | ✅ Covered |
| [UI_COMPONENTS_SPEC](#ui-components-spec) | 0 | 2 | 0 | 2 | 🟡 Partial |

**Coverage**: 12/12 specs (100%)

---

## ANNOTATION_SPEC

### pytest

- `tests/unit/routers/test_annotation_crud.py` (test_upsert_creates_new_annotation)
- `tests/unit/routers/test_annotation_crud.py` (test_upsert_updates_existing_annotation)
- `tests/unit/routers/test_annotation_last_trace.py` (test_all_10_annotations_can_be_saved)
- `tests/unit/routers/test_annotation_last_trace.py` (test_10th_annotation_specifically)
- `tests/unit/routers/test_annotation_last_trace.py` (test_multiple_annotators_can_save_10th_annotation)
- `tests/unit/routers/test_annotation_last_trace.py` (test_facilitator_sees_10_completed)

### Playwright (E2E)

- `client/tests/e2e/annotation-flow.spec.ts`
- `client/tests/e2e/annotation-last-trace.spec.ts`

## AUTHENTICATION_SPEC

### pytest

- `tests/unit/routers/test_auth_edge_cases.py` (test_permission_api_failure_returns_defaults_when_user_not_found)
- `tests/unit/routers/test_auth_edge_cases.py` (test_permission_api_returns_role_based_defaults_for_valid_user)
- `tests/unit/routers/test_auth_edge_cases.py` (test_permission_api_failure_when_db_service_raises)
- `tests/unit/routers/test_users_router.py` (test_users_login_facilitator_path)
- `tests/unit/routers/test_users_router.py` (test_users_login_invalid_credentials_returns_401)
- `tests/unit/routers/test_users_router.py` (test_user_permissions_derived_from_role)
- `tests/unit/services/test_token_storage_service.py` (test_store_and_get_token_roundtrip)
- `tests/unit/services/test_token_storage_service.py` (test_get_token_returns_none_when_missing)
- `tests/unit/services/test_token_storage_service.py` (test_expired_token_is_removed_on_read)
- `tests/unit/services/test_token_storage_service.py` (test_cleanup_expired_tokens_counts_removed)
- `tests/unit/services/test_token_storage_service.py` (test_remove_token)

### Playwright (E2E)

- `client/tests/e2e/facilitator-create-workshop.spec.ts`
- `client/tests/e2e/authentication.spec.ts`

## BUILD_AND_DEPLOY_SPEC

### pytest

- `tests/unit/test_sqlite_rescue.py` (test_default_database_url)
- `tests/unit/test_sqlite_rescue.py` (test_valid_volume_path)
- `tests/unit/test_sqlite_rescue.py` (test_extracts_volume_root)
- `tests/unit/test_build_deploy.py` (test_bootstrap_creates_db_file)
- `tests/unit/test_build_deploy.py` (test_migrations_directory_exists)
- `tests/unit/test_build_deploy.py` (test_lock_is_exclusive)
- `tests/unit/test_build_deploy.py` (test_vite_config_specifies_terser)
- `tests/unit/test_build_deploy.py` (test_release_workflow_exists)
- `tests/unit/test_health_smoke.py` (test_health_endpoint)

## CUSTOM_LLM_PROVIDER_SPEC

### pytest

- `tests/unit/routers/test_custom_llm_provider_router.py` (test_get_custom_llm_provider_not_configured)
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_get_custom_llm_provider_configured)
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_create_custom_llm_provider)
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_delete_custom_llm_provider)
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_test_custom_llm_provider_success)
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_test_custom_llm_provider_auth_failure)
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_test_custom_llm_provider_no_config)
- `tests/unit/routers/test_custom_llm_provider_router.py` (test_test_custom_llm_provider_no_api_key)
- `tests/unit/services/test_judge_custom_provider.py` (test_custom_provider_sets_proxy_url_in_mlflow_configuration)
- `tests/unit/services/test_judge_custom_provider.py` (test_build_chat_completions_url_with_v1_suffix)
- `tests/unit/services/test_judge_custom_provider.py` (test_build_chat_completions_url_already_has_suffix)
- `tests/unit/services/test_judge_custom_provider.py` (test_build_chat_completions_url_strips_trailing_slash)
- `tests/unit/services/test_judge_custom_provider.py` (test_custom_provider_api_key_stored_with_correct_key_format)

### Playwright (E2E)

- `client/tests/e2e/custom-llm-provider.spec.ts`

## DATASETS_SPEC

### pytest

- `tests/unit/routers/test_dbsql_export_router.py` (test_dbsql_export_success)
- `tests/unit/routers/test_dbsql_export_router.py` (test_dbsql_export_status_happy_path)
- `tests/unit/services/test_dataset_operations.py` (test_same_user_same_traces_same_order)
- `tests/unit/services/test_dataset_operations.py` (test_two_users_different_orders)
- `tests/unit/services/test_dataset_operations.py` (test_facilitator_order_is_chronological)
- `tests/unit/services/test_dataset_operations.py` (test_incremental_addition_preserves_existing_order)
- `tests/unit/services/test_dataset_operations.py` (test_new_round_produces_different_order)

### Playwright (E2E)

- `client/tests/e2e/dataset-operations.spec.ts`

### Vitest (Unit)

- `client/src/utils/traceUtils.test.ts`
- `client/src/utils/traceUtils.test.ts`

## DESIGN_SYSTEM_SPEC

### Playwright (E2E)

- `client/tests/e2e/design-system.spec.ts`

### Vitest (Unit)

- `client/src/test/design-system.test.ts`
- `client/src/test/design-system.test.ts`
- `client/src/lib/utils.test.ts`
- `client/src/lib/utils.test.ts`

## DISCOVERY_TRACE_ASSIGNMENT_SPEC

### pytest

- `tests/unit/routers/test_workshops_router.py` (test_get_workshop_404_when_missing)
- `tests/unit/routers/test_workshops_router.py` (test_get_traces_requires_user_id)
- `tests/unit/routers/test_workshops_router.py` (test_get_workshop_success)
- `tests/unit/services/test_trace_assignment.py` (test_active_traces_only_current_round)
- `tests/unit/services/test_trace_assignment.py` (test_different_users_different_order)
- `tests/unit/services/test_trace_assignment.py` (test_append_preserves_existing_positions)
- `tests/unit/services/test_trace_assignment.py` (test_new_dataset_triggers_fresh_randomization)

### Playwright (E2E)

- `client/tests/e2e/trace-visibility.spec.ts`
- `client/tests/e2e/discovery-invite-traces.spec.ts`

### Vitest (Unit)

- `client/src/hooks/useWorkshopApi.test.ts`

## JUDGE_EVALUATION_SPEC

### pytest

- `tests/unit/routers/test_workshops_begin_annotation.py` (test_begin_annotation_with_auto_eval_enabled)
- `tests/unit/routers/test_workshops_begin_annotation.py` (test_begin_annotation_with_auto_eval_disabled)
- `tests/unit/routers/test_workshops_begin_annotation.py` (test_begin_annotation_requires_rubric)
- `tests/unit/routers/test_workshops_router.py` (test_re_evaluate_uses_stored_auto_evaluation_model)
- `tests/unit/routers/test_databricks_router.py` (test_databricks_test_connection_success)
- `tests/unit/routers/test_databricks_router.py` (test_databricks_call_endpoint_success)
- `tests/unit/routers/test_databricks_router.py` (test_databricks_chat_endpoint_success)
- `tests/unit/routers/test_databricks_router.py` (test_databricks_judge_evaluate_without_workshop_id_uses_request_config)
- `tests/unit/services/test_irr_utils.py` (test_analyze_annotation_structure_empty)
- `tests/unit/services/test_irr_utils.py` (test_analyze_annotation_structure_recommends_cohens_kappa_when_two_raters_complete)
- `tests/unit/services/test_irr_utils.py` (test_analyze_annotation_structure_recommends_krippendorff_alpha_when_missing_data)
- `tests/unit/services/test_irr_utils.py` (test_validate_annotations_for_irr_invalid_cases)
- `tests/unit/services/test_irr_utils.py` (test_validate_annotations_for_irr_valid_case)
- `tests/unit/services/test_irr_utils.py` (test_format_irr_result_rounding_and_ready_flag)
- `tests/unit/services/test_irr_utils.py` (test_detect_problematic_patterns_basic_signals)
- `tests/unit/services/test_irr_service.py` (test_calculate_irr_for_workshop_returns_error_details_when_invalid)
- `tests/unit/services/test_irr_service.py` (test_calculate_irr_for_workshop_uses_cohens_kappa_when_two_raters_complete)
- `tests/unit/services/test_irr_service.py` (test_calculate_irr_for_workshop_uses_krippendorff_when_missing_data)
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_binary)
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_likert)
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_mixed_prefers_binary)
- `tests/unit/services/test_database_service_rubric.py` (test_get_judge_type_from_rubric_no_rubric_defaults_likert)
- `tests/unit/services/test_krippendorff_alpha.py` (test_get_unique_question_ids_sorted)
- `tests/unit/services/test_krippendorff_alpha.py` (test_per_metric_returns_empty_when_no_ratings_dict_present)
- `tests/unit/services/test_krippendorff_alpha.py` (test_calculate_krippendorff_alpha_returns_zero_when_insufficient)
- `tests/unit/services/test_krippendorff_alpha.py` (test_calculate_krippendorff_alpha_trivial_agreement_is_one)
- `tests/unit/services/test_krippendorff_alpha.py` (test_calculate_krippendorff_alpha_handles_missing_data)
- `tests/unit/services/test_krippendorff_alpha.py` (test_calculate_krippendorff_alpha_specific_question_id_uses_ratings_dict)
- `tests/unit/services/test_alignment_service.py` (test_normalize_judge_prompt_converts_placeholders_to_mlflow_style)
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_scale)
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_all_pass)
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_all_fail)
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_mixed_ratings)
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_empty)
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_binary_threshold_conversion)
- `tests/unit/services/test_alignment_service.py` (test_calculate_eval_metrics_likert_default)
- `tests/unit/services/test_cohens_kappa.py` (test_calculate_cohens_kappa_raises_on_empty)
- `tests/unit/services/test_cohens_kappa.py` (test_calculate_cohens_kappa_raises_if_not_exactly_two_raters)
- `tests/unit/services/test_cohens_kappa.py` (test_calculate_cohens_kappa_requires_two_paired_traces)
- `tests/unit/services/test_cohens_kappa.py` (test_calculate_cohens_kappa_perfect_agreement_is_one)
- `tests/unit/services/test_cohens_kappa.py` (test_interpret_cohens_kappa_bucket_edges)
- `tests/unit/services/test_cohens_kappa.py` (test_is_cohens_kappa_acceptable_default_threshold)

### Playwright (E2E)

- `client/tests/e2e/judge-evaluation.spec.ts`
- `client/tests/e2e/judge-evaluation.spec.ts`
- `client/tests/e2e/auto-evaluation.spec.ts`
- `client/tests/e2e/auto-evaluation.spec.ts`
- `client/tests/e2e/auto-evaluation.spec.ts`
- `client/tests/e2e/auto-evaluation.spec.ts`

### Vitest (Unit)

- `client/src/utils/modelMapping.test.ts`

## RUBRIC_SPEC

### pytest

- `tests/unit/services/test_rubric_parsing.py` (test_simple_questions)
- `tests/unit/services/test_rubric_parsing.py` (test_reconstruct_simple_questions)
- `tests/unit/services/test_rubric_parsing.py` (test_parse_reconstruct_roundtrip)
- `tests/unit/services/test_rubric_parsing.py` (test_binary_judge_type_parsed_correctly)
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_with_judge_type_binary)
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_with_judge_type_likert)
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_default_to_likert)
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_mixed_types)
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_with_freeform)
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_empty_input)
- `tests/unit/services/test_database_service_rubric.py` (test_parse_rubric_questions_multiline_description)
- `tests/unit/services/test_database_service_rubric.py` (test_reconstruct_rubric_questions_with_judge_type)
- `tests/unit/services/test_database_service_rubric.py` (test_reconstruct_rubric_questions_empty)
- `tests/unit/services/test_database_service_rubric.py` (test_parse_reconstruct_roundtrip)

### Playwright (E2E)

- `client/tests/e2e/rubric-judge-type.spec.ts`
- `client/tests/e2e/rubric-judge-type.spec.ts`
- `client/tests/e2e/rubric-judge-type.spec.ts`
- `client/tests/e2e/rubric-judge-type.spec.ts`
- `client/tests/e2e/rubric-judge-type.spec.ts`
- `client/tests/e2e/rubric-persistence.spec.ts`
- `client/tests/e2e/rubric-creation.spec.ts`

### Vitest (Unit)

- `client/src/utils/rubricUtils.test.ts`
- `client/src/utils/rubricUtils.test.ts`

## TESTING_SPEC

### pytest

- `tests/unit/test_testing_infrastructure.py` (test_mock_db_session_fixture_exists)
- `tests/unit/test_testing_infrastructure.py` (test_conftest_has_spec_option)
- `tests/unit/test_testing_infrastructure.py` (test_e2e_workflow_exists)

## TRACE_DISPLAY_SPEC

### pytest

- `tests/unit/utils/test_jsonpath_utils.py` (test_simple_extraction)
- `tests/unit/utils/test_jsonpath_utils.py` (test_valid_jsonpath)

### Playwright (E2E)

- `client/tests/e2e/jsonpath-trace-display.spec.ts`
- `client/tests/e2e/jsonpath-trace-display.spec.ts`
- `client/tests/e2e/jsonpath-trace-display.spec.ts`
- `client/tests/e2e/jsonpath-trace-display.spec.ts`
- `client/tests/e2e/jsonpath-trace-display.spec.ts`
- `client/tests/e2e/jsonpath-trace-display.spec.ts`

### Vitest (Unit)

- `client/src/hooks/useJsonPathExtraction.test.ts`
- `client/src/hooks/useJsonPathExtraction.test.ts`

## UI_COMPONENTS_SPEC

### Playwright (E2E)

- `client/tests/e2e/ui-components.spec.ts`
- `client/tests/e2e/ui-components.spec.ts`
