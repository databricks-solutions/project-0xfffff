# Spec Test Coverage Map

**Generated**: 2026-02-17 06:50:34

This report shows test coverage for each specification's success criteria.

## Test Pyramid Summary

| Type | Count | Description |
|------|-------|-------------|
| Unit | 24 | pytest unit tests, Vitest tests |
| Integration | 0 | pytest with real DB/API |
| E2E (Mocked) | 0 | Playwright with mocked API |
| E2E (Real) | 0 | Playwright with real API |

## Coverage Summary

| Spec | Reqs | Covered | Cover% | Unit | Int | E2E-M | E2E-R |
|------|------|---------|--------|------|-----|-------|-------|
| [DISCOVERY_SPEC](#discovery-spec) | 47 | 12 | 25% | 24 | 0 | 0 | 0 |

**Total**: 12/47 requirements covered (25%)

---

## DISCOVERY_SPEC

**Coverage**: 12/47 requirements (25%)

### Uncovered Requirements

- [ ] Previous Q&A visible while answering new questions
- [ ] Loading spinner during LLM generation (1-3s)
- [ ] Facilitator can trigger analysis at any time (even partial feedback)
- [ ] Facilitator selects analysis template (Evaluation Criteria or Themes & Patterns) before running
- [ ] System aggregates feedback by trace
- [ ] Disagreements detected at 3 priority levels (deterministic, no LLM)
- [ ] LLM distills evaluation criteria with evidence from trace IDs
- [ ] LLM analyzes disagreements with follow-up questions and suggestions
- [ ] Analysis record stores which template was used
- [ ] Each analysis run creates a new record (history preserved)
- [ ] Re-runnable — new analysis as more feedback comes in, prior analyses retained
- [ ] Warning if < 2 participants (not an error)
- [ ] Data freshness banner (participant count, last run timestamp)
- [ ] Results organized by priority (HIGH → MEDIUM → LOWER)
- [ ] Facilitator can promote distilled criteria to draft rubric
- [ ] Facilitator can promote disagreement insights to draft rubric
- [ ] Facilitator can promote raw participant feedback to draft rubric
- [ ] Facilitator can manually add draft rubric items
- [ ] Draft rubric items editable and removable
- [ ] "Suggest Groups" returns LLM proposal without persisting
- [ ] Facilitator can review, adjust, and apply group proposal
- [ ] Manual grouping: create groups, name them, move items between groups
- [ ] Each group maps to one rubric question (group name = question title)
- [ ] Draft rubric items available during Rubric Creation phase
- [ ] Source traceability maintained (which traces support each item)
- [ ] Multiple analysis records per workshop allowed (history preserved)
- [ ] Draft rubric items track promotion source and promoter
- [ ] LLM failures show error toast with retry
- [ ] Analysis shows warning (not error) if < 2 participants
- [ ] Progressive disclosure (one question at a time)
- [ ] Submit buttons disabled until required fields filled
- [ ] Clear progress indication (X of Y traces completed)
- [ ] Smooth transitions between feedback states
- [ ] Disagreements color-coded by priority (red/yellow/blue)
- [ ] Criteria show evidence (supporting trace IDs)

### Covered Requirements

- [x] Facilitator can start Discovery phase with configurable trace limit (unit)
- [x] Participants view traces and provide GOOD/BAD + comment (unit)
- [x] AI generates 3 follow-up questions per trace based on feedback (unit)
- [x] Questions build progressively on prior answers (unit)
- [x] All 3 questions required before moving to next trace (unit)
- [x] Error handling with retry for LLM failures (unit)
- [x] Feedback saved incrementally (no data loss on failure) (unit)
- [x] Completion status shows % of participants finished (unit)
- [x] One feedback record per (workshop, trace, user) — upsert behavior (unit)
- [x] Q&A pairs appended in order to JSON array (unit)
- [x] Fallback question if LLM unavailable after retries (unit)
- [x] Form validation prevents empty submissions (unit)

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
