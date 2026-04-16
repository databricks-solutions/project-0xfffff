# Spec Test Coverage Map

**Generated**: 2026-04-16 10:26:26

This report shows test coverage for each specification's success criteria.

## Test Pyramid Summary

| Type | Count | Description |
|------|-------|-------------|
| Unit | 36 | pytest unit tests, Vitest tests |
| Integration | 0 | pytest with real DB/API |
| E2E (Mocked) | 1 | Playwright with mocked API |
| E2E (Real) | 0 | Playwright with real API |

## Coverage Summary

| Spec | Reqs | Covered | Cover% | Unit | Int | E2E-M | E2E-R | BE-only |
|------|------|---------|--------|------|-----|-------|-------|---------|
| [EVAL_MODE_SPEC](#eval-mode-spec) | 35 | 17 | 48% | 36 | 0 | 1 | 0 | **17** |

**Total**: 17/35 requirements covered (48%)

---

## EVAL_MODE_SPEC

**Coverage**: 17/35 requirements (48%)

### Uncovered Requirements

- [ ] Criteria can be authored directly (without discovery)
- [ ] Discovery analysis can run agent loops over trace spans as alternative to summaries
- [ ] Richer findings surface example-specific observations
- [ ] Negative-weight criteria penalize when met
- [ ] Normalized score = raw / max_possible, clipped to [0, 1]
- [ ] Evaluation runs as background job with progress tracking
- [ ] Judge scores optionally hidden from human reviewer
- [ ] One task-level judge aligned using all criteria across all traces as examples
- [ ] Each criterion's human met/not-met decision stored as a separate MLflow assessment on the trace
- [ ] All assessments share the judge name; extraction yields all (not just most recent)
- [ ] Semantic memory distills guidelines from overlapping criteria patterns
- [ ] Episodic memory indexes specific criterion examples for retrieval
- [ ] Aligned judge registered to MLflow
- [ ] Re-hydration rebuilds episodic memory from trace assessments without external state
- [ ] Re-evaluation compares pre/post alignment accuracy on same trace set
- [ ] Export produces trace → criteria mapping
- [ ] Export includes scoring configuration (types, weights, aggregation rules)
- [ ] Exported eval can be re-run via `mlflow.genai.evaluate()`

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: Workshop can be created with `mode: "eval"` (unit)
- :warning: Mode is immutable after creation (unit)
- :warning: Eval-mode workshops do not use the global rubric system (unit)
- :warning: Existing workshop-mode behavior is unchanged (unit)
- :warning: Facilitator can create criteria on a specific trace (unit)
- :warning: Each criterion has a type (standard or hurdle) and weight (-10 to +10) (unit)
- :warning: Criteria can be promoted from discovery findings (unit)
- :warning: Criteria are editable and deletable (unit)
- :warning: Per-trace rubric is rendered as markdown (unit)
- :warning: Discovery analysis uses trace summaries when available (unit)
- :warning: Hurdle criteria gate the entire trace — any hurdle failure → score 0 (unit)
- :warning: Standard criteria scored as met (1) or not met (0) × weight (unit)
- :warning: Scoring handles edge cases: no criteria, all hurdles, all negative weights (unit)
- :warning: One independent judge call per criterion (unit)
- :warning: Judge sees trace content + single criterion, not other criteria (unit)
- :warning: Judge returns met (boolean) + rationale (unit)
- :warning: Results stored per-criterion with rationale (unit)

### Covered Requirements

- [x] Workshop can be created with `mode: "eval"` (unit) **[BE-only]**
- [x] Mode is immutable after creation (unit) **[BE-only]**
- [x] Eval-mode workshops do not use the global rubric system (unit) **[BE-only]**
- [x] Existing workshop-mode behavior is unchanged (unit) **[BE-only]**
- [x] Facilitator can create criteria on a specific trace (unit) **[BE-only]**
- [x] Each criterion has a type (standard or hurdle) and weight (-10 to +10) (unit) **[BE-only]**
- [x] Criteria can be promoted from discovery findings (unit) **[BE-only]**
- [x] Criteria are editable and deletable (unit) **[BE-only]**
- [x] Per-trace rubric is rendered as markdown (unit) **[BE-only]**
- [x] Discovery analysis uses trace summaries when available (unit) **[BE-only]**
- [x] Hurdle criteria gate the entire trace — any hurdle failure → score 0 (unit) **[BE-only]**
- [x] Standard criteria scored as met (1) or not met (0) × weight (unit) **[BE-only]**
- [x] Scoring handles edge cases: no criteria, all hurdles, all negative weights (unit) **[BE-only]**
- [x] One independent judge call per criterion (unit) **[BE-only]**
- [x] Judge sees trace content + single criterion, not other criteria (unit) **[BE-only]**
- [x] Judge returns met (boolean) + rationale (unit) **[BE-only]**
- [x] Results stored per-criterion with rationale (unit) **[BE-only]**

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `client/tests/e2e/eval-mode-workflow.spec.ts` (eval mode supports per-trace criteria and scoring) [e2e-mocked]
- `client/src/components/eval/CriterionEditor.eval.test.tsx` (shows empty state when no criteria) [unit]
- `client/src/components/eval/CriterionEditor.eval.test.tsx` (submits a new criterion) [unit]

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
