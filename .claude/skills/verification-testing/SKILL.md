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
| `just e2e` | Full E2E tests | After any feature change |

## Verification Workflow

### After Implementing a Feature

1. **Read the relevant spec** in `specs/` to understand success criteria
2. **Run unit tests** for the layer you changed:
   - Backend: `just test-server`
   - Frontend: `just ui-test-unit`
3. **Run linting**: `just ui-lint`
4. **Run E2E tests**: `just e2e`
5. **Add new tests** if the feature isn't covered
6. **Tag all tests with specs** - Run validation: `just spec-tagging-check`

## Reference Files

| Reference | Purpose | When to Read |
|-----------|---------|--------------|
| `e2e-patterns.md` | TestScenario builder API | When writing E2E tests |
| `mocking.md` | E2E mocking + MLflow/external service mocking | When adding new endpoints or testing integrations |
| `unit-tests.md` | pytest and vitest patterns | When writing unit tests |

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

## Spec Tagging Enforcement

**All tests MUST be tagged with spec markers** to maintain coverage tracking.

### Validation Commands

```bash
# Validate that all tests are tagged
just spec-tagging-check

# If validation fails, fix the issues and run again
# Then regenerate the coverage map
just spec-coverage
```

### Tagging Guidelines

#### Python (pytest)
Always add `@pytest.mark.spec("SPEC_NAME")` before test functions:
```python
@pytest.mark.spec("CUSTOM_LLM_PROVIDER_SPEC")
def test_create_provider(client):
    # Test implementation
```

#### Playwright E2E
Add `test.use({ tag: ['@spec:SPEC_NAME'] })` at the top of test describe block:
```typescript
test.describe('Feature Name', () => {
  test.use({ tag: ['@spec:CUSTOM_LLM_PROVIDER_SPEC'] });

  test('should do X', async ({ page }) => { ... });
  test('should do Y', async ({ page }) => { ... });
});
```

#### Vitest Unit Tests
Add `// @spec SPEC_NAME` comment at the top of the file:
```typescript
// @spec CUSTOM_LLM_PROVIDER_SPEC

describe('Feature', () => {
  it('should do something', () => { ... });
});
```

### Exit Codes

- **0**: All tests are properly tagged ✅
- **1**: Some tests are missing spec tags ❌ (fix and rerun)
- **2**: Error scanning files (check file paths)

## Critical Files

- `specs/TESTING_SPEC.md` - Full testing specification
- `client/tests/lib/README.md` - E2E test infrastructure docs
- `client/tests/lib/mocks/api-mocker.ts` - Mock handlers
- `client/tests/lib/scenario-builder.ts` - TestScenario class
- `justfile` - All test commands
- `tools/spec_tagging_validator.py` - Spec tagging validation tool
- `tools/spec_coverage_analyzer.py` - Spec coverage analyzer
