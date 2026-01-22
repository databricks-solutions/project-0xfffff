---
name: verification-testing
description: "Code verification and testing for the Human Evaluation Workshop. Use when (1) checking implementation progress against specs, (2) running tests after code changes, (3) writing new tests, (4) debugging test failures. Covers unit tests, integration tests, and E2E tests."
---

# Verification & Testing

## Common Questions (Start Here)

### "How far along is SPEC_NAME implementation?"

**Use `just spec-status` - do NOT run tests unnecessarily.**

```bash
just spec-status SPEC_NAME
```

This shows coverage percentage and any recent test results. To get detailed uncovered requirements:

```bash
just spec-coverage --specs SPEC_NAME --json | jq '{
  coverage: .specs.SPEC_NAME.coverage_percent,
  covered: .specs.SPEC_NAME.covered_count,
  total: .specs.SPEC_NAME.requirement_count,
  uncovered: .specs.SPEC_NAME.uncovered
}'
```

**Summarize results for the user** - don't just dump JSON output.

### "Which tests cover SPEC_NAME?"

```bash
# Python tests
grep -r "@pytest.mark.spec(\"SPEC_NAME\")" tests/

# E2E tests
grep -l "@spec:SPEC_NAME" client/tests/e2e/*.spec.ts

# All test counts by type
just spec-coverage --specs SPEC_NAME --json | jq '.specs.SPEC_NAME.tests_by_type'
```

### "Are the tests passing?"

**Only run tests if the user asks to verify implementation works**, not just to check progress.

```bash
# After running tests, get concise summary
just test-summary

# Or filter by spec
just test-summary --spec SPEC_NAME
```

### "Which requirements are uncovered?"

```bash
just spec-coverage --json | jq '.specs | to_entries[] | select(.value.uncovered | length > 0) | {spec: .key, uncovered: .value.uncovered}'
```

---

## Quick Commands Reference

| Command | Purpose |
|---------|---------|
| `just spec-status SPEC_NAME` | Coverage + recent test results for a spec |
| `just spec-coverage` | Full coverage report (all specs) |
| `just spec-coverage --affected` | Coverage for specs affected by recent changes |
| `just test-summary` | Concise test results after running tests |
| `just test-server` | Run all Python unit tests |
| `just ui-test-unit` | Run all React unit tests |
| `just e2e` | Run all E2E tests |
| `just e2e-spec SPEC_NAME` | Run E2E tests for a specific spec |

## Running Tests for a Specific Spec

```bash
# Python unit tests
just test-server-spec SPEC_NAME

# React unit tests
just ui-test-unit-spec SPEC_NAME

# E2E tests (headless by default)
just e2e-spec SPEC_NAME

# E2E with visible browser
just e2e-spec SPEC_NAME headed
```

## Test Tagging

All tests must be tagged with spec markers:

**Python (pytest):**
```python
@pytest.mark.spec("SPEC_NAME")
@pytest.mark.req("requirement text")  # optional, links to specific requirement
def test_something(): ...
```

**Playwright (E2E):**
```typescript
test.use({ tag: ['@spec:SPEC_NAME', '@req:requirement text'] });
```

**Vitest (unit):**
```typescript
// @spec SPEC_NAME
// @req requirement text
```

## Test File Locations

| Type | Location | Tag Format |
|------|----------|------------|
| Python unit | `tests/unit/` | `@pytest.mark.spec("SPEC")` |
| Python integration | `tests/integration/` | `@pytest.mark.spec("SPEC")` |
| React unit | `client/src/**/*.test.ts` | `// @spec SPEC` comment |
| E2E | `client/tests/e2e/*.spec.ts` | `test.use({ tag: ['@spec:SPEC'] })` |

## Verification Workflow

After implementing a feature:

1. **Check coverage**: `just spec-status SPEC_NAME`
2. **Run relevant tests**:
   - Backend changes: `just test-server-spec SPEC_NAME`
   - Frontend changes: `just ui-test-unit-spec SPEC_NAME`
   - Full feature: `just e2e-spec SPEC_NAME`
3. **Get results**: `just test-summary`
4. **Lint**: `just ui-lint`

## Reference Files

For detailed patterns, see:
- `e2e-patterns.md` - TestScenario builder API for E2E tests
- `mocking.md` - How to mock API endpoints in E2E tests
- `unit-tests.md` - pytest and vitest patterns
