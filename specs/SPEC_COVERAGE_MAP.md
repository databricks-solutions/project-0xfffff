# Spec Test Coverage Map

**Generated**: 2026-01-20 12:07:35

This report shows which tests cover each specification.
Tests are tagged using framework-specific conventions:

- **pytest**: `@pytest.mark.spec("SPEC_NAME")`
- **Playwright**: `{ tag: ['@spec:SPEC_NAME'] }` or `@spec:SPEC_NAME` in test title
- **Vitest**: `// @spec SPEC_NAME` comment or `describe('@spec:SPEC_NAME', ...)`

---

## Coverage Summary

| Spec | pytest | Playwright | Vitest | Total | Status |
|------|--------|------------|--------|-------|--------|
| [ANNOTATION_SPEC](#annotation-spec) | 4 | 1 | 0 | 5 | ✅ Covered |
| [AUTHENTICATION_SPEC](#authentication-spec) | 8 | 1 | 0 | 9 | ✅ Covered |
| [BUILD_AND_DEPLOY_SPEC](#build-and-deploy-spec) | 1 | 0 | 0 | 1 | 🟡 Partial |
| [DATASETS_SPEC](#datasets-spec) | 2 | 0 | 1 | 3 | ✅ Covered |
| [DESIGN_SYSTEM_SPEC](#design-system-spec) | 0 | 0 | 1 | 1 | 🟡 Partial |
| [DISCOVERY_TRACE_ASSIGNMENT_SPEC](#discovery-trace-assignment-spec) | 3 | 1 | 1 | 5 | ✅ Covered |
| [JUDGE_EVALUATION_SPEC](#judge-evaluation-spec) | 28 | 0 | 1 | 29 | ✅ Covered |
| [RUBRIC_SPEC](#rubric-spec) | 0 | 1 | 1 | 2 | 🟡 Partial |
| [UI_COMPONENTS_SPEC](#ui-components-spec) | 0 | 0 | 0 | 0 | ❌ Uncovered |

**Coverage**: 8/9 specs (88%)

---

## ANNOTATION_SPEC

### pytest

- `tests/unit/routers/test_annotation_last_trace.py` (test_all_10_annotations_can_be_saved)
- `tests/unit/routers/test_annotation_last_trace.py` (test_10th_annotation_specifically)
- `tests/unit/routers/test_annotation_last_trace.py` (test_multiple_annotators_can_save_10th_annotation)
- `tests/unit/routers/test_annotation_last_trace.py` (test_facilitator_sees_10_completed)

### Playwright (E2E)

- `client/tests/e2e/annotation-last-trace.spec.ts`

## AUTHENTICATION_SPEC

### pytest

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

## BUILD_AND_DEPLOY_SPEC

### pytest

- `tests/unit/test_health_smoke.py` (test_health_endpoint)

## DATASETS_SPEC

### pytest

- `tests/unit/routers/test_dbsql_export_router.py` (test_dbsql_export_success)
- `tests/unit/routers/test_dbsql_export_router.py` (test_dbsql_export_status_happy_path)

### Vitest (Unit)

- `client/src/utils/traceUtils.test.ts`

## DESIGN_SYSTEM_SPEC

### Vitest (Unit)

- `client/src/lib/utils.test.ts`

## DISCOVERY_TRACE_ASSIGNMENT_SPEC

### pytest

- `tests/unit/routers/test_workshops_router.py` (test_get_workshop_404_when_missing)
- `tests/unit/routers/test_workshops_router.py` (test_get_traces_requires_user_id)
- `tests/unit/routers/test_workshops_router.py` (test_get_workshop_success)

### Playwright (E2E)

- `client/tests/e2e/discovery-invite-traces.spec.ts`

### Vitest (Unit)

- `client/src/hooks/useWorkshopApi.test.ts`

## JUDGE_EVALUATION_SPEC

### pytest

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
- `tests/unit/services/test_krippendorff_alpha.py` (test_get_unique_question_ids_sorted)
- `tests/unit/services/test_krippendorff_alpha.py` (test_per_metric_returns_empty_when_no_ratings_dict_present)
- `tests/unit/services/test_krippendorff_alpha.py` (test_calculate_krippendorff_alpha_returns_zero_when_insufficient)
- `tests/unit/services/test_krippendorff_alpha.py` (test_calculate_krippendorff_alpha_trivial_agreement_is_one)
- `tests/unit/services/test_krippendorff_alpha.py` (test_calculate_krippendorff_alpha_handles_missing_data)
- `tests/unit/services/test_krippendorff_alpha.py` (test_calculate_krippendorff_alpha_specific_question_id_uses_ratings_dict)
- `tests/unit/services/test_alignment_service.py` (test_normalize_judge_prompt_converts_placeholders_to_mlflow_style)
- `tests/unit/services/test_alignment_service.py` (test_likert_agreement_metric_from_store_is_one_when_equal)
- `tests/unit/services/test_cohens_kappa.py` (test_calculate_cohens_kappa_raises_on_empty)
- `tests/unit/services/test_cohens_kappa.py` (test_calculate_cohens_kappa_raises_if_not_exactly_two_raters)
- `tests/unit/services/test_cohens_kappa.py` (test_calculate_cohens_kappa_requires_two_paired_traces)
- `tests/unit/services/test_cohens_kappa.py` (test_calculate_cohens_kappa_perfect_agreement_is_one)
- `tests/unit/services/test_cohens_kappa.py` (test_interpret_cohens_kappa_bucket_edges)
- `tests/unit/services/test_cohens_kappa.py` (test_is_cohens_kappa_acceptable_default_threshold)

### Vitest (Unit)

- `client/src/utils/modelMapping.test.ts`

## RUBRIC_SPEC

### Playwright (E2E)

- `client/tests/e2e/rubric-creation.spec.ts`

### Vitest (Unit)

- `client/src/utils/rubricUtils.test.ts`

## UI_COMPONENTS_SPEC

❌ **No tests tagged for this spec**

To add coverage, tag tests with:
- pytest: `@pytest.mark.spec("UI_COMPONENTS_SPEC")`
- Playwright: `{ tag: ['@spec:UI_COMPONENTS_SPEC'] }`
- Vitest: `// @spec UI_COMPONENTS_SPEC`
