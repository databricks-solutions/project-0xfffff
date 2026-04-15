# Spec Test Coverage Map

**Generated**: 2026-04-15 11:36:42

This report shows test coverage for each specification's success criteria.

## Test Pyramid Summary

| Type | Count | Description |
|------|-------|-------------|
| Unit | 89 | pytest unit tests, Vitest tests |
| Integration | 0 | pytest with real DB/API |
| E2E (Mocked) | 0 | Playwright with mocked API |
| E2E (Real) | 7 | Playwright with real API |

## Coverage Summary

| Spec | Reqs | Covered | Cover% | Unit | Int | E2E-M | E2E-R | BE-only |
|------|------|---------|--------|------|-----|-------|-------|---------|
| [TRACE_DISPLAY_SPEC](#trace-display-spec) | 18 | 18 | 100% | 89 | 0 | 0 | 7 | **10** |

**Total**: 18/18 requirements covered (100%)

---

## TRACE_DISPLAY_SPEC

**Coverage**: 18/18 requirements (100%)

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: JSONPath fields are optional and clearly labeled as such (unit)
- :warning: Multiple JSONPath matches are concatenated with newlines (unit)
- :warning: Facilitator can configure span attribute filter with span name, span type, attribute key, and attribute value (unit)
- :warning: Filter criteria are AND-combined and first matching span wins (unit)
- :warning: Span filter is applied before JSONPath extraction in TraceViewer (unit)
- :warning: Empty filter config results in no filtering and root trace data is used (unit)
- :warning: String span inputs and outputs are returned as-is without double-serialization (unit)
- :warning: All backend services that consume trace input/output apply the same span filter and JSONPath pipeline as the TraceViewer (unit)
- :warning: JSONPath evaluation does not noticeably slow down trace display (unit)
- :warning: Preview responds within 500ms (unit)

### Covered Requirements

- [x] Facilitator can configure input/output JSONPath in settings panel (e2e-real)
- [x] JSONPath fields are optional and clearly labeled as such (unit) **[BE-only]**
- [x] Preview shows extraction results against first workshop trace (e2e-real)
- [x] TraceViewer applies JSONPath when configured (unit)
- [x] Multiple JSONPath matches are concatenated with newlines (unit) **[BE-only]**
- [x] System falls back to raw display when JSONPath is not configured, JSON parsing fails, JSONPath query fails, or JSONPath returns null/empty (e2e-real, unit)
- [x] Settings are persisted per workshop (e2e-real)
- [x] Facilitator can configure span attribute filter with span name, span type, attribute key, and attribute value (unit) **[BE-only]**
- [x] Filter criteria are AND-combined and first matching span wins (unit) **[BE-only]**
- [x] Attribute value input is disabled until attribute key has a value (unit)
- [x] Span filter preview shows match status and filtered inputs/outputs against first trace (e2e-real)
- [x] Span filter is applied before JSONPath extraction in TraceViewer (unit) **[BE-only]**
- [x] Empty filter config results in no filtering and root trace data is used (unit) **[BE-only]**
- [x] String span inputs and outputs are returned as-is without double-serialization (unit) **[BE-only]**
- [x] All backend services that consume trace input/output apply the same span filter and JSONPath pipeline as the TraceViewer (unit) **[BE-only]**
- [x] JSONPath evaluation does not noticeably slow down trace display (unit) **[BE-only]**
- [x] Preview responds within 500ms (unit) **[BE-only]**
- [x] Invalid JSONPath syntax shows helpful error message in preview (e2e-real, unit)

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
