---
name: verification-testing
description: "Code verification and testing for the Human Evaluation Workshop. Use when (1) running tests after code changes, (2) writing new unit tests (pytest/vitest), (3) writing E2E tests with Playwright/TestScenario, (4) debugging test failures, (5) understanding what to mock in E2E tests, (6) verifying a feature implementation. Covers the full test pyramid: unit tests -> integration tests -> E2E tests."
---

# Verification & Testing

## Quick Verification Commands

Run these commands to verify code changes:

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `just test-server` | Python unit tests | After backend changes |
| `just ui-test-unit` | React unit tests | After frontend changes |
| `just ui-lint` | TypeScript/ESLint | Before committing |
| `just e2e` | All E2E tests | After any feature change |
| `just spec-coverage` | Generates spec coverage report | Before / after feature change |
| `just spec-coverage --json` | JSON coverage report to stdout | For programmatic analysis |
| `just spec-coverage --affected` | Coverage for specs affected by changes | During development |
| `just test-affected` | Run tests for affected specs only | Quick verification of changes |
| `just test-spec SPEC` | All tests (unit+integration+E2E) for a spec | Full verification of a spec |
| `just spec-validate` | Validates all tests are spec-tagged | Before committing |

## Spec Coverage Report

The spec coverage report shows **requirement-level coverage** across the test pyramid. It parses success criteria (`- [ ]` items) from spec files and tracks which requirements have tests.

### Console Output (pytest-cov style)

```bash
just spec-coverage
```

```
SPEC COVERAGE REPORT
==============================================================================
Name                                 Reqs  Cover%  Unit  Int  E2E-M  E2E-R
------------------------------------------------------------------------------
   ANNOTATION_SPEC                      9     67%     4    0      2      0
 * AUTHENTICATION_SPEC                  7     43%     5    1      1      0
 ! BUILD_AND_DEPLOY_SPEC               15      7%     1    0      0      0
   DATASETS_SPEC                        9    100%     3    0      1      1
...
------------------------------------------------------------------------------
TOTAL                                  96     45%    52    4     12      2

Legend: ! = low coverage (<50%), * = partial coverage (50-99%)
```

### JSON Output

```bash
just spec-coverage --json
```

Returns detailed JSON with:
- Per-spec requirement coverage
- Test type breakdown (unit, integration, e2e-mocked, e2e-real)
- Uncovered requirements list
- Test pyramid totals

### Affected Mode

Only show coverage for specs affected by recent changes:

```bash
# Specs affected since last commit (default)
just spec-coverage --affected

# Specs affected since specific commit/branch
just spec-coverage --affected main
just spec-coverage --affected abc123

# Run tests only for affected specs
just test-affected           # since HEAD~1
just test-affected main      # since main branch

# Combine with JSON output
just spec-coverage --affected --json
```

The affected detector maps changed files to specs using:
- File path patterns (e.g., `server/routers/users.py` -> `AUTHENTICATION_SPEC`)
- Spec markers in changed test files
- Core files like `database_service.py` affect all specs

### Filter to Specific Specs

```bash
# Only analyze specific specs
just spec-coverage --specs AUTHENTICATION_SPEC ANNOTATION_SPEC
```

### Test Type Classification

Tests are automatically classified by type:

| Type | Description | How Detected |
|------|-------------|--------------|
| `unit` | Isolated unit tests | pytest in `tests/unit/`, Vitest `*.test.ts` |
| `integration` | Real API/DB tests | pytest in `tests/integration/` or `@pytest.mark.integration` |
| `e2e-mocked` | E2E with mocked API | Playwright tests (default) |
| `e2e-real` | E2E with real API | Playwright with `@e2e-real` tag or `withRealApi()` |

## Test Tagging (Required)

Tests **must** be tagged with spec markers. Optionally, link tests to specific requirements using `@req` markers.

### Python (pytest)

```python
# Basic spec tagging
@pytest.mark.spec("AUTHENTICATION_SPEC")
def test_login(): ...

# With requirement link (recommended for requirement-level coverage)
@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.req("No permission denied errors on normal login")
def test_login_no_permission_denied(): ...

# Integration test (auto-detected from path or marker)
@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.integration
def test_login_with_real_db(): ...
```

### TypeScript/E2E (Playwright)

```typescript
// File-level tagging
test.use({ tag: ['@spec:AUTHENTICATION_SPEC'] });

// With requirement link
test.use({ tag: ['@spec:AUTHENTICATION_SPEC', '@req:No permission denied errors'] });

// Real API test (not mocked)
test.use({ tag: ['@spec:AUTHENTICATION_SPEC', '@e2e-real'] });
test('login with real API', async ({ page }) => {
  const scenario = await TestScenario.create(page).withWorkshop().withRealApi().build();
  ...
});
```

### TypeScript/Unit (Vitest)

```typescript
// @spec AUTHENTICATION_SPEC
// @req No permission denied errors on normal login

import { describe, it, expect } from 'vitest';

describe('login', () => {
  it('should authenticate', () => { ... });
});
```

## Spec-Filtered Test Commands

Run tests for a specific spec:

| Command | Purpose | Example |
|---------|---------|---------|
| `just test-spec SPEC_NAME` | **All tests** (unit+integration+E2E) | `just test-spec AUTHENTICATION_SPEC` |
| `just test-server-spec SPEC_NAME` | Python tests for a spec | `just test-server-spec AUTHENTICATION_SPEC` |
| `just ui-test-unit-spec SPEC_NAME` | Unit tests for a spec | `just ui-test-unit-spec RUBRIC_SPEC` |
| `just e2e-spec SPEC_NAME` | E2E tests for a spec (headless) | `just e2e-spec ANNOTATION_SPEC` |
| `just e2e-spec SPEC_NAME headed` | E2E with visible browser | `just e2e-spec ANNOTATION_SPEC headed` |

## Token-Efficient Test Results (for LLM Agents)

All test commands automatically write JSON reports to `.test-results/`. Use `just test-summary` for concise summaries.

```bash
# After running any test command, get a concise summary
just test-summary

# Get summary for a specific runner
just test-summary --runner pytest

# Filter by spec
just test-summary --spec AUTHENTICATION_SPEC

# Get JSON output
just test-summary --json

# Quick check: spec status (test results + coverage info)
just spec-status AUTHENTICATION_SPEC
```

### Output Format

**When tests pass** (~50 tokens):
```
PASS: 45 passed, 0 failed (1.2s)
```

**When tests fail** (~200-500 tokens):
```
FAIL: 43 passed, 2 failed (1.2s)

AUTHENTICATION_SPEC (1 failure):
  - test_login_invalid_password (tests/test_auth.py:25) [pytest]
    AssertionError: Expected 200, got 401
```

### JSON Reports Location

| Runner | Report Path |
|--------|-------------|
| pytest | `.test-results/pytest.json` |
| Playwright | `.test-results/playwright.json` |
| Vitest | `.test-results/vitest.json` |

## Spec Tools Reference

| Tool | Purpose | Usage |
|------|---------|-------|
| `spec-coverage` | Generate coverage report (console + markdown) | `just spec-coverage` |
| `spec-coverage --json` | Generate JSON coverage report | `just spec-coverage --json` |
| `spec-validate` | Ensure all tests are spec-tagged | `just spec-validate` |
| `spec-status SPEC` | Show test results + coverage for a spec | `just spec-status AUTHENTICATION_SPEC` |
| `test-summary` | Token-efficient test result summary | `just test-summary --spec SPEC_NAME` |
| `test-spec SPEC [mode] [workers]` | Run **all** tests for a spec | `just test-spec SPEC_NAME` |
| `test-server-spec SPEC` | Run Python tests for a spec | `just test-server-spec SPEC_NAME` |
| `ui-test-unit-spec SPEC` | Run unit tests for a spec | `just ui-test-unit-spec SPEC_NAME` |
| `e2e-spec SPEC [mode] [workers]` | Run E2E tests for a spec | `just e2e-spec SPEC_NAME headless 1` |

## Verification Workflow

### After Implementing a Feature

1. **Read the relevant spec** in `specs/` to understand success criteria
2. **Tag your tests** with spec and requirement markers:
   - `@pytest.mark.spec("SPEC_NAME")` + `@pytest.mark.req("requirement text")`
   - `test.use({ tag: ['@spec:SPEC_NAME', '@req:requirement text'] })`
   - `// @spec SPEC_NAME` + `// @req requirement text`
3. **Run unit tests** for the layer you changed:
   - Backend: `just test-server`
   - Frontend: `just ui-test-unit`
4. **Run E2E tests**: `just e2e-spec SPEC_NAME`
5. **Check coverage**: `just spec-coverage`
6. **Run linting**: `just ui-lint`
7. **Validate tagging**: `just spec-validate`

### Practical Examples

**"What is the coverage of AUTHENTICATION_SPEC?"**

```bash
# Quick status check
just spec-status AUTHENTICATION_SPEC

# Or generate full report
just spec-coverage

# JSON for detailed analysis
just spec-coverage --json | jq '.specs.AUTHENTICATION_SPEC'
```

**"Which requirements are uncovered?"**

```bash
just spec-coverage --json | jq '.specs | to_entries[] | select(.value.uncovered | length > 0) | {spec: .key, uncovered: .value.uncovered}'
```

**"What's the test pyramid balance?"**

```bash
just spec-coverage --json | jq '.pyramid'
# Returns: {"unit": 52, "integration": 4, "e2e-mocked": 12, "e2e-real": 2}
```

## Key Concepts

### Test Pyramid

```
        +----------+
        |   E2E    |  <- Playwright (slow, high confidence)
        +----+-----+
     +-------+-------+
     |  Integration  |  <- pytest with real DB/API
     +-------+-------+
+------------+------------+
|       Unit Tests        |  <- pytest/vitest (fast)
+-------------------------+
```

### E2E Mocking Strategy

**Mock by default** - The test infrastructure mocks all API calls unless you opt out:

```typescript
// Everything mocked (default) - classified as e2e-mocked
const scenario = await TestScenario.create(page)
  .withWorkshop()
  .build();

// Full integration (no mocks) - classified as e2e-real
const scenario = await TestScenario.create(page)
  .withWorkshop()
  .withRealApi()
  .build();
```

### Adding Mocks for New Endpoints

If you add a new API endpoint, add a mock handler in `client/tests/lib/mocks/api-mocker.ts`:

```typescript
this.routes.push({
  pattern: /\/workshops\/([a-f0-9-]+)\/your-endpoint$/i,
  get: async (route) => {
    await route.fulfill({ json: this.store.yourData });
  },
});
```

## Spec Tagging Enforcement

**All tests MUST be tagged with spec markers** to maintain coverage tracking.

### Validation Commands

```bash
# Validate that all tests are tagged
just spec-validate

# If validation fails, fix the issues and run again
# Then regenerate the coverage map
just spec-coverage
```

### Exit Codes

- **0**: All tests are properly tagged
- **1**: Some tests are missing spec tags (fix and rerun)
- **2**: Error scanning files (check file paths)

## Reference Files

| Reference | Purpose | When to Read |
|-----------|---------|--------------|
| `e2e-patterns.md` | TestScenario builder API | When writing E2E tests |
| `mocking.md` | E2E mocking + MLflow/external service mocking | When adding new endpoints |
| `unit-tests.md` | pytest and vitest patterns | When writing unit tests |
| `specs/SPEC_COVERAGE_MAP.md` | Current test coverage by spec | Checking coverage status |
| `specs/TESTING_SPEC.md` | Complete testing specification | Understanding test requirements |

## Critical Files

- `specs/SPEC_COVERAGE_MAP.md` - Auto-generated test coverage by spec
- `.test-results/` - JSON test reports (pytest.json, playwright.json, vitest.json)
- `client/tests/lib/mocks/api-mocker.ts` - Mock handlers
- `client/tests/lib/scenario-builder.ts` - TestScenario class
- `tools/spec_coverage_analyzer.py` - Generates coverage map
- `tools/spec_tagging_validator.py` - Validates test spec tagging
- `tools/test_summary.py` - Token-efficient test result summarizer
- `pyproject.toml` - pytest markers (`spec`, `req`, `integration`)

## Architecture Overview

```
+- User Commands (justfile) ----------------------------------+
|                                                             |
|  just spec-coverage [--json]                               |
|  just test-server-spec SPEC_NAME                           |
|  just e2e-spec SPEC_NAME [mode] [workers]                  |
|  just spec-validate / spec-status                          |
|                                                             |
+- Test Runners (write JSON to .test-results/) --------------+
|                                                             |
|  pytest  -> @pytest.mark.spec() + @pytest.mark.req()       |
|  Playwright -> { tag: ['@spec:...', '@req:...'] }          |
|  Vitest  -> // @spec + // @req comments                    |
|                                                             |
+- Coverage Analyzer ----------------------------------------+
|                                                             |
|  1. Parse specs for success criteria (- [ ] items)         |
|  2. Scan tests for @spec and @req markers                  |
|  3. Match tests to requirements (fuzzy matching)           |
|  4. Classify test types (unit/integration/e2e-mocked/real) |
|  5. Generate coverage report (console, JSON, markdown)     |
|                                                             |
+------------------------------------------------------------+
```
