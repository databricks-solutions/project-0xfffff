# Spec Test Coverage Map

**Generated**: 2026-01-22 12:20:18

This report shows test coverage for each specification's success criteria.

## Test Pyramid Summary

| Type | Count | Description |
|------|-------|-------------|
| Unit | 12 | pytest unit tests, Vitest tests |
| Integration | 0 | pytest with real DB/API |
| E2E (Mocked) | 1 | Playwright with mocked API |
| E2E (Real) | 1 | Playwright with real API |

## Coverage Summary

| Spec | Reqs | Covered | Cover% | Unit | Int | E2E-M | E2E-R |
|------|------|---------|--------|------|-----|-------|-------|
| [ANNOTATION_SPEC](#annotation-spec) | 9 | 0 | 0% | 4 | 0 | 0 | 1 |
| [AUTHENTICATION_SPEC](#authentication-spec) | 7 | 0 | 0% | 8 | 0 | 1 | 0 |

**Total**: 0/16 requirements covered (0%)

---

## ANNOTATION_SPEC

**Coverage**: 0/9 requirements (0%)

### Uncovered Requirements

- [ ] Users can edit previously submitted annotations
- [ ] Changes automatically save on navigation (Next/Previous)
- [ ] Toast shows "Annotation saved!" for new submissions
- [ ] Toast shows "Annotation updated!" only when changes detected
- [ ] No toast when navigating without changes
- [ ] Multi-line comments preserved throughout the stack
- [ ] Comments display with proper line breaks
- [ ] Next button enabled for annotated traces (allows re-navigation)
- [ ] Annotation count reflects unique submissions (not re-submissions)

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/routers/test_annotation_last_trace.py` (test_all_10_annotations_can_be_saved) [unit]
- `tests/unit/routers/test_annotation_last_trace.py` (test_10th_annotation_specifically) [unit]
- `tests/unit/routers/test_annotation_last_trace.py` (test_multiple_annotators_can_save_10th_annotation) [unit]
- `tests/unit/routers/test_annotation_last_trace.py` (test_facilitator_sees_10_completed) [unit]
- `client/tests/e2e/annotation-last-trace.spec.ts` (file-level) [e2e-real]

## AUTHENTICATION_SPEC

**Coverage**: 0/7 requirements (0%)

### Uncovered Requirements

- [ ] No "permission denied" errors on normal login
- [ ] No page refresh required after login
- [ ] Slow network: Loading indicator shown until ready
- [ ] Permission API failure: User can log in with defaults
- [ ] 404 on validation: Session cleared, fresh login allowed
- [ ] Rapid navigation: Components wait for `isLoading = false`
- [ ] Error recovery: Errors cleared on new login attempt

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/routers/test_users_router.py` (test_users_login_facilitator_path) [unit]
- `tests/unit/routers/test_users_router.py` (test_users_login_invalid_credentials_returns_401) [unit]
- `tests/unit/routers/test_users_router.py` (test_user_permissions_derived_from_role) [unit]
- `tests/unit/services/test_token_storage_service.py` (test_store_and_get_token_roundtrip) [unit]
- `tests/unit/services/test_token_storage_service.py` (test_get_token_returns_none_when_missing) [unit]
- `tests/unit/services/test_token_storage_service.py` (test_expired_token_is_removed_on_read) [unit]
- `tests/unit/services/test_token_storage_service.py` (test_cleanup_expired_tokens_counts_removed) [unit]
- `tests/unit/services/test_token_storage_service.py` (test_remove_token) [unit]
- `client/tests/e2e/facilitator-create-workshop.spec.ts` (file-level) [e2e-mocked]

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
