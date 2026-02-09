# Testing Debt

## Overview

The codebase has significant testing gaps, particularly in backend services and frontend components. Of 13 backend services, only 1 has partial test coverage. Of 60+ frontend components, fewer than 10 have tests. Critical paths like judge evaluation, MLflow intake, encryption, and password handling are completely untested. The test infrastructure also lacks factories and fixtures for common entities, leading to duplicated mock code across test files.

---

## Items

### TD-1: Backend Services - Zero Test Coverage (8 services)

**Severity**: CRITICAL
**Location**: The following services have NO test files:

| Service | Methods | Risk |
|---------|---------|------|
| `server/services/databricks_service.py` | 13+ methods (`call_serving_endpoint`, `list_serving_endpoints`, `test_connection`) | Production LLM calls untested |
| `server/services/judge_service.py` | 8 methods (`evaluate_prompt`, `_evaluate_with_mlflow`, `_calculate_performance_metrics`, `export_judge`, `select_few_shot_examples`) | Core evaluation logic untested |
| `server/services/mlflow_intake_service.py` | 5+ methods (`configure_mlflow`, `search_traces`, `fetch_trace_details`, `ingest_traces`) | Critical data pipeline untested |
| `server/services/rubric_generation_service.py` | 3+ methods (`generate_rubric_suggestions`) | AI feature response parsing untested |
| `server/services/dbsql_export_service.py` | 4+ methods (`export_workshop_data`, `read_table`, `insert_overwrite_table`) | Data export untested |
| `server/utils/encryption.py` | `encrypt`, `decrypt`, `is_encrypted` | Security-critical, zero coverage |
| `server/utils/password.py` | `hash_password`, `verify_password`, `validate_password_strength` | Auth utilities untested |
| `server/utils/config.py` | `load_auth_config`, `get_facilitator_config` | Config loading untested |

**Impact**: Core business logic for evaluation, data intake, and security has zero validation. Regressions will reach production undetected.

**Remediation**: Write unit tests for each service. Mock external dependencies (MLflow, Databricks SDK). Prioritize by production risk.

**Acceptance Criteria**:
- [ ] Every service file has a corresponding test file
- [ ] All public methods have at least one test
- [ ] Security utilities (encryption, password) have round-trip and edge case tests
- [ ] Coverage for services reaches 80%+

---

### TD-2: Frontend Components - Near-Zero Test Coverage

**Severity**: CRITICAL
**Location**: 50+ components with NO tests including:

| Component | Lines | Risk |
|-----------|-------|------|
| `client/src/pages/IntakePage.tsx` | 707 | MLflow intake flow untested |
| `client/src/pages/JudgeTuningPage.tsx` | 2754 | Most complex page, zero tests |
| `client/src/pages/AnnotationReviewPage.tsx` | - | Review workflow untested |
| `client/src/pages/DBSQLExportPage.tsx` | - | Export flow untested |
| `client/src/pages/FindingsReviewPage.tsx` | - | Results untested |
| `client/src/components/FacilitatorDashboard.tsx` | 1325 | Most complex component, zero tests |
| `client/src/components/AnnotationStartPage.tsx` | 408 | Annotation workflow untested |
| `client/src/components/RubricViewPage.tsx` | 169 | Rubric editing untested |
| `client/src/components/RubricSuggestionPanel.tsx` | - | AI suggestions untested |
| `client/src/components/CustomLLMProviderConfig.tsx` | - | LLM config untested |
| `client/src/components/JsonPathSettings.tsx` | - | Settings untested |
| `client/src/components/RoleBasedWorkflow.tsx` | - | Role routing untested |

**Coverage Summary**: ~7% of components tested (4 of 60+).

**Impact**: UI regressions will not be caught. Form validation, error states, loading states, and conditional rendering all untested.

**Remediation**: Prioritize tests for complex components (FacilitatorDashboard, JudgeTuningPage, IntakePage). Use React Testing Library for behavior tests.

**Acceptance Criteria**:
- [ ] All pages have at least rendering + basic interaction tests
- [ ] Complex components (>500 lines) have comprehensive test suites
- [ ] Coverage for components reaches 60%+

---

### TD-3: Workshop Router - Massive Endpoint Coverage Gap

**Severity**: CRITICAL
**Location**: `server/routers/workshops.py` (5,229 lines, 100+ endpoints)

**Description**: Only 3 test cases exist for the entire workshop router:
- `GET /workshops/{id}` - basic retrieval
- `GET /workshops/{id}/traces` - trace listing
- Edge case for missing workshop

**Missing test coverage for**:
- Annotation submission and editing
- Trace assignment and reassignment
- Phase transition logic
- Conflict resolution
- Background job lifecycle (alignment, evaluation)
- Discovery findings CRUD
- Participant notes
- JSONPath settings
- Auto-assign annotations

**Impact**: The largest and most complex file in the codebase has <5% test coverage.

**Remediation**: Systematically add tests for each endpoint group. Pair with CQ-1 (splitting the router) to make testing tractable.

**Acceptance Criteria**:
- [ ] Every HTTP endpoint has at least one success and one failure test
- [ ] Phase transition logic has boundary tests
- [ ] Background job handlers have lifecycle tests

---

### TD-4: Missing E2E Workflow Coverage

**Severity**: CRITICAL
**Location**: `client/tests/e2e/`

**Description**: E2E tests cover ~15% of user flows. Currently tested:
- Facilitator login + workshop creation
- Discovery phase with participant invites
- Rubric creation workflow
- Basic annotation
- Auto-evaluation with judge

**Missing E2E flows**:
- Complete annotation-to-results workflow
- Judge tuning/evaluation iteration cycle
- DBSQL export workflow
- Multi-workshop participant flows
- Facilitator dashboard interactions
- Error recovery flows (network failures, partial submissions)
- Concurrent annotation handling
- Large-scale trace ingestion (1000+ traces)

**Impact**: End-to-end regressions in major workflows will not be caught.

**Remediation**: Add E2E tests for each major user flow, prioritized by usage frequency and risk.

**Acceptance Criteria**:
- [ ] Complete annotation-to-results E2E test
- [ ] Judge tuning E2E test
- [ ] DBSQL export E2E test
- [ ] At least 60% of major workflows covered

---

### TD-5: Missing Spec Tags on Client Tests

**Severity**: HIGH
**Location**: Client test files in `client/src/`

**Description**: Only 18 spec tags across 9 files. 50+ client test files have zero `@spec:` annotations. The project's spec-driven development model requires all tests to be tagged per `CLAUDE.md`.

**Currently tagged files**:
- `JudgeTypeSelector.test.tsx` (4 tags)
- `Pagination.test.tsx` (2 tags)
- `useWorkshopApi.test.ts` (1 tag)
- `rubricUtils.test.ts` (2 tags)

**Impact**: Cannot filter tests by spec, cannot verify spec coverage, violates project conventions.

**Remediation**: Add spec tags to all existing client tests. Include spec tags in test templates for new tests.

**Acceptance Criteria**:
- [ ] 100% of test files have at least one `@spec:` tag
- [ ] `just spec-tagging-check` passes with zero violations

---

### TD-6: Test Infrastructure - Missing Factories and Fixtures

**Severity**: HIGH
**Location**: `tests/conftest.py` (96 lines)

**Description**: `conftest.py` has basic fixtures (`async_client`, `mock_db_session`, `override_get_db`) but is missing:
- Workshop factory for different phases/states
- Trace data builders for common scenarios
- Annotation factory for bulk test data
- Mock MLflow/Databricks services at fixture level
- Frontend API response mock utilities

Each test file reimplements `FakeDatabaseService` or similar mocks independently.

**Impact**: Duplicated setup code, inconsistent mocks, high effort to write new tests.

**Remediation**: Create shared factories and fixtures:
```python
# conftest.py additions
@pytest.fixture
def workshop_factory():
    def _create(phase=WorkshopPhase.INTAKE, traces=5, annotations=0):
        ...
    return _create
```

**Acceptance Criteria**:
- [ ] Workshop, trace, annotation, and rubric factories exist
- [ ] Mock services are shared via fixtures
- [ ] New tests can use factories instead of manual setup

---

### TD-7: Untested Hook - useDatabricksApi

**Severity**: HIGH
**Location**: `client/src/hooks/useDatabricksApi.ts` - NO corresponding test file

**Description**: The Databricks API integration hook has zero test coverage. Other hooks (`useWorkshopApi`, `useJsonPathExtraction`) have tests.

**Impact**: Databricks connection testing, endpoint listing, and model evaluation untested.

**Remediation**: Create `useDatabricksApi.test.ts` with mocked API responses.

**Acceptance Criteria**:
- [ ] Test file exists with tests for each hook function
- [ ] Error handling and loading states tested

---

### TD-8: Shallow/Trivial Tests

**Severity**: HIGH
**Location**:
- `client/src/components/LoadingSpinner.test.tsx` - Only 3 assertions, missing timeout states, error scenarios, accessibility
- `client/src/components/TraceDataViewer.test.tsx` - Likely snapshot-only testing without behavior validation
- `client/src/hooks/useWorkshopApi.test.ts` - Only 2 test functions for an extensive API hook

**Impact**: Tests pass but provide false confidence. Changes to these components could introduce undetected regressions.

**Remediation**: Add meaningful assertions for behavior, edge cases, and error states.

**Acceptance Criteria**:
- [ ] Each test file has tests for success, error, and edge cases
- [ ] No snapshot-only tests without behavioral assertions alongside

---

### TD-9: Flaky E2E Test Patterns

**Severity**: MEDIUM
**Location**:
- `client/tests/e2e/facilitator-create-workshop.spec.ts:18` - `waitForTimeout(500)` hardcoded wait
- Other E2E tests use conditional click logic that hides flakiness

**Description**: Fixed timeouts instead of polling with assertions:
```typescript
await page.waitForTimeout(500);  // Hardcoded wait
const createNewButton = page.getByRole('button', { name: /Create New/i });
if (await createNewButton.isVisible().catch(() => false)) {
  await createNewButton.click();
}
```

**Impact**: Tests pass locally but may fail in CI under load. Conditional logic masks real failures.

**Remediation**: Replace `waitForTimeout` with `expect.poll()` or `waitForSelector`. Remove conditional try/catch in assertions.

**Acceptance Criteria**:
- [ ] Zero `waitForTimeout` calls in E2E tests
- [ ] All assertions use `expect.poll()` or Playwright auto-waiting

---

### TD-10: Over-Mocked Tests (Testing Implementation Details)

**Severity**: MEDIUM
**Location**:
- `tests/unit/services/test_alignment_service.py` - Tests private `_normalize_judge_prompt` method
- `tests/unit/routers/test_databricks_router.py` - FakeService doesn't validate error conditions

**Description**: Tests mock internal implementation details instead of testing behavior through public interfaces. This makes refactoring break tests unnecessarily.

**Impact**: Brittle tests that break on implementation changes but pass on behavioral regressions.

**Remediation**: Test through public interfaces. Mock at boundaries (HTTP, database) not internal methods.

**Acceptance Criteria**:
- [ ] No tests directly call private methods (prefixed with `_`)
- [ ] Mocks validate both success and error paths

---

### TD-11: Missing Edge Case Coverage

**Severity**: MEDIUM
**Location**: Various

**Description**: Known untested edge cases:
- Database: Transaction rollback, concurrent writes, large result sets
- Router: Error paths for service initialization (`server/routers/databricks.py:27-28`)
- UI: Pagination with 0 items, rubric with special characters, traces >1MB, concurrent API calls

**Impact**: Edge cases are where most production bugs hide.

**Remediation**: Add targeted edge case tests for each critical path.

**Acceptance Criteria**:
- [ ] Each service has at least 2 edge case tests
- [ ] Empty state, large data, and concurrent access tested

---

### TD-12: Duplicated Mock Patterns

**Severity**: MEDIUM
**Location**: Multiple test files in `tests/unit/routers/`

**Description**: Each router test reimplements `FakeDatabaseService`:
```python
class FakeDatabaseService:
    def get_workshop(self, workshop_id: str):
        assert workshop_id == "w1"
        return workshop
```
Mock validates input but doesn't simulate realistic DB behavior (missing error cases, empty results).

**Impact**: Inconsistent mock behavior, duplicated code, easy to miss error paths.

**Remediation**: Create a shared `FakeDatabaseService` in `conftest.py` with configurable behavior.

**Acceptance Criteria**:
- [ ] Single shared mock service with configurable responses
- [ ] Error injection support for failure path testing

---

## Prioritized Backlog

| Priority | ID | Title | Effort | Impact |
|----------|-----|-------|--------|--------|
| P0 | TD-1 | Add tests for encryption.py and password.py | S | Critical - security code untested |
| P0 | TD-1 | Add tests for judge_service.py | M | Critical - core evaluation untested |
| P0 | TD-1 | Add tests for databricks_service.py | M | Critical - production LLM calls |
| P0 | TD-3 | Add workshop router endpoint tests | L | Critical - largest file, <5% coverage |
| P1 | TD-1 | Add tests for mlflow_intake_service.py | M | Critical - data pipeline |
| P1 | TD-2 | Add tests for FacilitatorDashboard, JudgeTuningPage | L | Critical - most complex UI |
| P1 | TD-4 | Add annotation-to-results E2E test | M | Critical - major workflow gap |
| P1 | TD-6 | Create test factories and shared fixtures | M | High - accelerates all future testing |
| P2 | TD-5 | Add spec tags to all client tests | S | High - project convention |
| P2 | TD-7 | Add useDatabricksApi tests | S | High - untested hook |
| P2 | TD-4 | Add judge tuning and DBSQL export E2E tests | M | High - workflow gaps |
| P2 | TD-8 | Deepen shallow test suites | M | High - false confidence |
| P3 | TD-9 | Fix flaky E2E patterns | S | Medium - CI reliability |
| P3 | TD-10 | Refactor over-mocked tests | M | Medium - test maintainability |
| P3 | TD-11 | Add edge case tests | M | Medium - production resilience |
| P3 | TD-12 | Consolidate duplicated mocks | S | Medium - test DX |

**Effort**: S = < 2 hours, M = 2-8 hours, L = 1-3 days

**Coverage Summary**:

| Layer | Current | Target |
|-------|---------|--------|
| Backend Services | ~15% | 80% |
| Backend Routers | ~5% (workshops) | 70% |
| Backend Utils | ~20% | 90% |
| Frontend Pages | 0% | 60% |
| Frontend Components | ~7% | 60% |
| Frontend Hooks | ~33% | 90% |
| E2E Workflows | ~15% | 60% |
