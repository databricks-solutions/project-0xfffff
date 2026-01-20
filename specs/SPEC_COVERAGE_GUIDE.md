# Spec Test Coverage Guide

This guide explains how to tag tests for spec coverage tracking and use the coverage analysis tools.

## Quick Start

### Tag Your Tests

Each test framework uses a specific convention to declare which spec it covers:

**pytest** - Use the `@pytest.mark.spec` marker:
```python
import pytest

@pytest.mark.spec("ANNOTATION_SPEC")
def test_annotation_saves_correctly():
    ...
```

**Playwright** - Use the `tag` option:
```typescript
test('annotation editing flow', {
  tag: ['@spec:ANNOTATION_SPEC'],
}, async ({ page }) => {
  ...
});
```

**Vitest** - Use a comment before the describe block:
```typescript
// @spec ANNOTATION_SPEC
describe('AnnotationForm', () => {
  ...
});
```

### Run Coverage Analysis

```bash
just spec-coverage
```

This will scan all test files for spec markers and generate `specs/SPEC_COVERAGE_MAP.md`.

## Spec Names

Use these exact spec names (case-sensitive):

| Spec Name | Domain |
|-----------|--------|
| `ANNOTATION_SPEC` | Annotation system |
| `AUTHENTICATION_SPEC` | Auth & sessions |
| `BUILD_AND_DEPLOY_SPEC` | Build & deployment |
| `DATASETS_SPEC` | Trace datasets |
| `DESIGN_SYSTEM_SPEC` | Design system |
| `DISCOVERY_TRACE_ASSIGNMENT_SPEC` | Trace assignment |
| `JUDGE_EVALUATION_SPEC` | Judge & alignment |
| `RUBRIC_SPEC` | Rubric management |
| `UI_COMPONENTS_SPEC` | UI components |

## Tagging Conventions by Framework

### pytest

Add the marker before individual test functions or classes:

```python
import pytest

# Tag a single test
@pytest.mark.spec("RUBRIC_SPEC")
def test_rubric_parsing():
    ...

# Tag all tests in a class
@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
class TestAlignmentService:
    def test_normalize_prompt(self):
        ...

    def test_calculate_metrics(self):
        ...

# A test can cover multiple specs
@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.spec("RUBRIC_SPEC")
def test_annotation_with_rubric():
    ...
```

You can run tests for a specific spec using pytest markers:
```bash
uv run pytest -m "spec"  # All spec-tagged tests
```

### Playwright

Use the `tag` option in the test configuration:

```typescript
// Single spec
test('user can create annotation', {
  tag: ['@spec:ANNOTATION_SPEC'],
}, async ({ page }) => {
  ...
});

// Multiple specs
test('rubric affects annotation form', {
  tag: ['@spec:ANNOTATION_SPEC', '@spec:RUBRIC_SPEC'],
}, async ({ page }) => {
  ...
});

// Using describe for multiple tests
test.describe('Annotation flows', {
  tag: ['@spec:ANNOTATION_SPEC'],
}, () => {
  test('can submit new annotation', async ({ page }) => {
    ...
  });

  test('can edit existing annotation', async ({ page }) => {
    ...
  });
});
```

Run tests for a specific spec:
```bash
npm -C client run test -- --grep @spec:ANNOTATION_SPEC
```

### Vitest

Use a comment at the top of the file or before describe blocks:

```typescript
// @spec RUBRIC_SPEC
describe('rubricUtils', () => {
  it('parses rubric questions', () => {
    ...
  });
});

// Or use the describe tag syntax
describe('@spec:RUBRIC_SPEC rubricUtils', () => {
  ...
});
```

## Coverage Report

The analyzer generates `specs/SPEC_COVERAGE_MAP.md` with:

- **Summary table** showing test counts per framework
- **Status indicators**:
  - ✅ Covered (3+ tests)
  - 🟡 Partial (1-2 tests)
  - ❌ Uncovered (no tests)
- **Per-spec details** listing all tagged tests

Example output:
```
| Spec | pytest | Playwright | Vitest | Total | Status |
|------|--------|------------|--------|-------|--------|
| ANNOTATION_SPEC | 2 | 1 | 0 | 3 | ✅ Covered |
| RUBRIC_SPEC | 0 | 1 | 1 | 2 | 🟡 Partial |
| DATASETS_SPEC | 0 | 0 | 0 | 0 | ❌ Uncovered |
```

## How the Analyzer Works

The analyzer (`tools/spec_coverage_analyzer.py`) scans:

1. **pytest tests** in `tests/` for `@pytest.mark.spec("...")`
2. **Playwright tests** in `client/tests/e2e/` for `tag: ['@spec:...']`
3. **Vitest tests** in `client/src/` for `// @spec ...` comments

It uses regex patterns to detect the markers - no runtime execution needed.

## Best Practices

1. **Tag at the right granularity** - Tag individual tests for precise tracking, or describe blocks for broader coverage

2. **One spec per feature** - Don't tag a test with multiple specs unless it genuinely tests both

3. **Tag tests, not assertions** - The marker goes on the test function, not inside it

4. **Keep specs updated** - If you add a new spec, update `KNOWN_SPECS` in `tools/spec_coverage_analyzer.py`

5. **Run before PRs** - Include `just spec-coverage` in your PR checklist to track coverage changes

## Troubleshooting

**"Unknown spec referenced"** - The spec name in your tag doesn't match a known spec. Check spelling and case.

**Test not detected** - Ensure you're using the exact syntax shown above. The analyzer uses regex matching.

**Coverage not updating** - Run `just spec-coverage` to regenerate the report. The file isn't auto-updated.

## Files

- `specs/SPEC_COVERAGE_MAP.md` - Generated coverage report
- `tools/spec_coverage_analyzer.py` - Scanner and report generator
- `pyproject.toml` - Contains pytest marker registration
- `justfile` - Contains `spec-coverage` recipe
