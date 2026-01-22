---
name: verification-testing
description: "Code verification and testing for the Human Evaluation Workshop. Use when (1) running tests after code changes, (2) writing new unit tests (pytest/vitest), (3) writing E2E tests with Playwright/TestScenario, (4) debugging test failures, (5) understanding what to mock in E2E tests, (6) verifying a feature implementation. Covers the full test pyramid: unit tests -> integration tests -> E2E tests."
---

# Verification & Testing

## Quick Verification Commands

Run these commands to verify code changes:

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `just test-server` | All Python unit tests | After backend changes |
| `just ui-test-unit` | All React unit tests | After frontend changes |
| `just ui-lint` | TypeScript/ESLint | Before committing |
| `just e2e` | All E2E tests | After any feature change |
| `just spec-coverage` | Generates spec coverage map | Before / after feature change |
| `just spec-validate` | Validates all tests are spec-tagged | Before committing |

## Spec-Filtered Test Commands

These commands efficiently run tests for a specific spec. Replace `SPEC_NAME` with the actual spec (e.g., `AUTHENTICATION_SPEC`):

| Command | Purpose | Example |
|---------|---------|---------|
| `just test-server-spec SPEC_NAME` | Python tests for a spec | `just test-server-spec AUTHENTICATION_SPEC` |
| `just ui-test-unit-spec SPEC_NAME` | Unit tests for a spec | `just ui-test-unit-spec RUBRIC_SPEC` |
| `just e2e-spec SPEC_NAME` | E2E tests for a spec (headless) | `just e2e-spec ANNOTATION_SPEC` |
| `just e2e-spec SPEC_NAME headed` | E2E tests for a spec (visible browser) | `just e2e-spec ANNOTATION_SPEC headed` |
| `just e2e-spec SPEC_NAME headless 4` | E2E tests with 4 workers | `just e2e-spec ANNOTATION_SPEC headless 4` |

## Test Tagging (Required)

Tests **must** be tagged with spec markers to track coverage and enable spec-based filtering. This is critical for maintaining the SPEC_COVERAGE_MAP and enabling commands like "Run all tests for AUTHENTICATION_SPEC".

### Python (pytest)

```python
@pytest.mark.spec("AUTHENTICATION_SPEC")
def test_login(): ...
```

### TypeScript/E2E (Playwright)

File-level tagging (applies to all tests in the file):
```typescript
import { test } from '@playwright/test';

test.use({ tag: ['@spec:AUTHENTICATION_SPEC'] });

test('login succeeds', async ({ page }) => { ... });
```

Or test-level tagging:
```typescript
test('login succeeds', { tag: ['@spec:AUTHENTICATION_SPEC'] }, async ({ page }) => { ... });
```

### TypeScript/Unit (Vitest)

File-level comment:
```typescript
// @spec AUTHENTICATION_SPEC

import { describe, it, expect } from 'vitest';

describe('login', () => {
  it('should authenticate', () => { ... });
});
```

Or describe-level:
```typescript
describe('@spec:AUTHENTICATION_SPEC - Auth flow', () => {
  it('should authenticate', () => { ... });
});
```

## Spec-Based Test Filtering

Once tests are properly tagged, you can run tests for specific specs efficiently:

### Run All Tests for a Spec (Python)

```bash
# Run only AUTHENTICATION_SPEC tests
just test-server-spec AUTHENTICATION_SPEC

# For multiple specs, run each separately
just test-server-spec AUTHENTICATION_SPEC
just test-server-spec RUBRIC_SPEC
```

### Run All Tests for a Spec (E2E - Playwright)

```bash
# Run tests tagged with @spec:AUTHENTICATION_SPEC (headless)
just e2e-spec AUTHENTICATION_SPEC

# Run in headed mode for debugging
just e2e-spec AUTHENTICATION_SPEC headed

# Run with multiple workers for speed
just e2e-spec AUTHENTICATION_SPEC headless 4
```

### Check Spec Coverage

```bash
# Validate all tests are properly tagged
just spec-validate

# Generate detailed coverage report
just spec-coverage

# View SPEC_COVERAGE_MAP.md for coverage details
```

## Spec Tools Reference

| Tool | Purpose | Usage |
|------|---------|-------|
| `spec-validate` | Ensures all tests are spec-tagged (fails if not) | `just spec-validate` |
| `spec-coverage` | Generates SPEC_COVERAGE_MAP.md report | `just spec-coverage` |
| `test-server-spec SPEC` | Run Python tests for a spec | `just test-server-spec SPEC_NAME` |
| `ui-test-unit-spec SPEC` | Run unit tests for a spec | `just ui-test-unit-spec SPEC_NAME` |
| `e2e-spec SPEC [mode] [workers]` | Run E2E tests for a spec | `just e2e-spec SPEC_NAME headless 1` |


## Verification Workflow

### After Implementing a Feature

1. **Read the relevant spec** in `specs/` to understand success criteria
2. **Tag your tests** with the spec name before running:
   - Use `@pytest.mark.spec("SPEC_NAME")` for pytest
   - Use `test.use({ tag: ['@spec:SPEC_NAME'] })` for Playwright
   - Use `// @spec SPEC_NAME` for Vitest
3. **Run unit tests** for the layer you changed:
   - Backend: `just test-server` or `uv run pytest -m spec-<SPEC_NAME>`
   - Frontend: `just ui-test-unit`
4. **Run spec-specific E2E tests**: `just e2e headless "@spec:SPEC_NAME"`
5. **Validate tagging**: `uv run spec-tagging-validator`
6. **Run linting**: `just ui-lint`
7. **Generate coverage map**: `just spec-coverage`
8. **Before committing**: Ensure all new tests are tagged

## Practical Example Workflows

### "Run all tests for AUTHENTICATION_SPEC"

```bash
# Run Python tests for AUTHENTICATION_SPEC
just test-server-spec AUTHENTICATION_SPEC

# Run unit tests for AUTHENTICATION_SPEC
just ui-test-unit-spec AUTHENTICATION_SPEC

# Run E2E tests for AUTHENTICATION_SPEC
just e2e-spec AUTHENTICATION_SPEC

# Or with visible browser to debug
just e2e-spec AUTHENTICATION_SPEC headed
```

### "What is the coverage of RUBRIC_SPEC?"

```bash
# Generate or view the coverage map
just spec-coverage

# View coverage details
cat specs/SPEC_COVERAGE_MAP.md | grep -A20 "RUBRIC_SPEC"
```

### "I just added new tests - ensure they're tagged"

```bash
# Run the validator to catch untagged tests
just spec-validate

# If it fails, add tags to your tests:
# - pytest: @pytest.mark.spec("SPEC_NAME")
# - Playwright: test.use({ tag: ['@spec:SPEC_NAME'] })
# - Vitest: // @spec SPEC_NAME

# Then regenerate coverage
just spec-coverage
```

### "Speed up E2E tests for a specific spec"

```bash
# Run with 4 workers (faster on multi-core machines)
just e2e-spec ANNOTATION_SPEC headless 4

# Run in headed mode for debugging
just e2e-spec ANNOTATION_SPEC headed 1
```

## Reference Files

| Reference | Purpose | When to Read |
|-----------|---------|--------------|
| `e2e-patterns.md` | TestScenario builder API | When writing E2E tests |
| `mocking.md` | E2E mocking + MLflow/external service mocking | When adding new endpoints or testing integrations |
| `unit-tests.md` | pytest and vitest patterns | When writing unit tests |
| `specs/SPEC_COVERAGE_MAP.md` | Current test coverage by spec | When checking what tests exist for a spec |
| `specs/TESTING_SPEC.md` | Complete testing specification | When understanding testing requirements |

## Key Concepts

### Test Pyramid

```
        ┌─────────┐
        │   E2E   │  ← Playwright (slow, high confidence)
        └────┬────┘
     ┌───────┴───────┐
     │  Integration  │  ← API tests (medium speed)
     └───────┬───────┘
┌────────────┴────────────┐
│       Unit Tests        │  ← pytest/vitest (fast)
└─────────────────────────┘
```

### E2E Mocking Strategy

**Mock by default** - The test infrastructure mocks all API calls unless you opt out:

```typescript
// Everything mocked (default)
const scenario = await TestScenario.create(page)
  .withWorkshop()
  .build();

// Selective real API
const scenario = await TestScenario.create(page)
  .withWorkshop()
  .withReal('/users/auth/login')  // Only auth is real
  .build();

// Full integration (no mocks)
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

## Critical Files

- `specs/TESTING_SPEC.md` - Full testing specification
- `specs/SPEC_COVERAGE_MAP.md` - Auto-generated test coverage by spec
- `client/tests/lib/README.md` - E2E test infrastructure docs
- `client/tests/lib/mocks/api-mocker.ts` - Mock handlers
- `client/tests/lib/scenario-builder.ts` - TestScenario class
- `justfile` - All test commands including spec-filtered variants
- `tools/spec_tagging_validator.py` - Validates test spec tagging
- `tools/spec_coverage_analyzer.py` - Generates coverage map
- `pyproject.toml` - pytest markers and test configuration

## Architecture Overview

The spec-based testing system provides these layers:

```
┌─ User Commands (justfile) ──────────────────────────────┐
│                                                          │
│  just test-server-spec SPEC_NAME                        │
│  just ui-test-unit-spec SPEC_NAME                       │
│  just e2e-spec SPEC_NAME [mode] [workers]               │
│  just spec-validate / spec-coverage                     │
│                                                          │
├─ Test Runners ─────────────────────────────────────────┤
│                                                          │
│  pytest (Python)  → @pytest.mark.spec("SPEC_NAME")      │
│  Playwright (E2E) → test.use({ tag: ['@spec:...'] })    │
│  Vitest (Unit)    → // @spec SPEC_NAME comments         │
│                                                          │
├─ Analysis Tools ───────────────────────────────────────┤
│                                                          │
│  spec-tagging-validator  → Enforces tagging             │
│  spec-coverage-analyzer  → Generates SPEC_COVERAGE_MAP  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```
