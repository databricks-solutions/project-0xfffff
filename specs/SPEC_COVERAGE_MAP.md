# Spec Test Coverage Map

**Generated**: 2026-04-16 00:07:27

This report shows test coverage for each specification's success criteria.

## Test Pyramid Summary

| Type | Count | Description |
|------|-------|-------------|
| Unit | 252 | pytest unit tests, Vitest tests |
| Integration | 4 | pytest with real DB/API |
| E2E (Mocked) | 8 | Playwright with mocked API |
| E2E (Real) | 19 | Playwright with real API |

## Coverage Summary

| Spec | Reqs | Covered | Cover% | Unit | Int | E2E-M | E2E-R | BE-only |
|------|------|---------|--------|------|-----|-------|-------|---------|
| [DISCOVERY_SPEC](#discovery-spec) | 72 | 59 | 81% | 252 | 4 | 8 | 19 | **23** |

**Total**: 59/72 requirements covered (81%)

---

## DISCOVERY_SPEC

**Coverage**: 59/72 requirements (81%)

### Uncovered Requirements

- [ ] Facilitator can switch Discovery workspace between `analysis` mode and `social` mode
- [ ] In social mode, users can create trace-level comments
- [ ] In social mode, users can create milestone-level comments
- [ ] Users can reply to comments in-thread
- [ ] Users can upvote/downvote comments (single vote per user per comment with toggle behavior)
- [ ] Thread updates appear live in the workspace while participants collaborate
- [ ] Facilitator `@assistant summarize this thread` returns a grounded summary as a thread reply
- [ ] Facilitator `@assistant` tool-availability questions for a milestone return grounded context as a thread reply
- [ ] Facilitator `@agent` starts a bounded tool-calling run and posts streamed partial output in the thread
- [ ] `@agent` run lifecycle is visible (`running`, `completed`, `failed`, `timeout`) with final persisted reply
- [ ] Non-facilitator mentions do not trigger assistant/agent execution (treated as plain text mentions)
- [ ] When follow-up questions are disabled, participant flow is GOOD/BAD + comment only
- [ ] Social mode provides a modern live collaboration experience with streamed in-thread updates for assistant/agent responses

### Backend-Only Requirements (no frontend tests)

These requirements are covered by backend tests only. UI regressions won't be caught:

- :warning: Facilitator can start Discovery phase with configurable trace limit (unit)
- :warning: Participants view traces and provide GOOD/BAD + comment (unit)
- :warning: AI generates 3 follow-up questions per trace based on feedback (unit)
- :warning: Questions build progressively on prior answers (unit)
- :warning: All 3 questions required before moving to next trace (unit)
- :warning: Error handling with retry for LLM failures (unit)
- :warning: Completion status shows % of participants finished (integration, unit)
- :warning: System aggregates feedback by trace (unit)
- :warning: Disagreements detected at 3 priority levels (deterministic, no LLM) (unit)
- :warning: LLM distills evaluation criteria with evidence from trace IDs (unit)
- :warning: LLM analyzes disagreements with follow-up questions and suggestions (unit)
- :warning: Analysis record stores which template was used (unit)
- :warning: Re-runnable — new analysis as more feedback comes in, prior analyses retained (unit)
- :warning: One feedback record per (workshop, trace, user) — upsert behavior (integration, unit)
- :warning: Q&A pairs appended in order to JSON array (integration, unit)
- :warning: Multiple analysis records per workshop allowed (history preserved) (unit)
- :warning: Draft rubric items track promotion source and promoter (unit)
- :warning: Fallback question if LLM unavailable after retries (unit)
- :warning: Form validation prevents empty submissions (unit)
- :warning: Trace-specific analysis findings appear on the trace card, pinned above feedback (collapsible) (unit)
- :warning: Promote action visibly moves items from trace feed/summary into the sidebar (unit)
- :warning: Draft rubric items show trace reference badges (interactive: hover for preview, click to scroll) (unit)
- :warning: "Create Rubric →" in sidebar transitions to rubric creation with groups pre-populated as criteria (unit)

### Covered Requirements

- [x] Facilitator can start Discovery phase with configurable trace limit (unit) **[BE-only]**
- [x] Participants view traces and provide GOOD/BAD + comment (unit) **[BE-only]**
- [x] Facilitator can select LLM model for follow-up question generation in Discovery dashboard (e2e-mocked, unit)
- [x] AI generates 3 follow-up questions per trace based on feedback (unit) **[BE-only]**
- [x] Questions build progressively on prior answers (unit) **[BE-only]**
- [x] All 3 questions required before moving to next trace (unit) **[BE-only]**
- [x] Previous Q&A visible while answering new questions (unit)
- [x] Loading spinner during LLM generation (1-3s) (unit)
- [x] Error handling with retry for LLM failures (unit) **[BE-only]**
- [x] Feedback saved incrementally (no data loss on failure) (e2e-real, unit)
- [x] Completion status shows % of participants finished (integration, unit) **[BE-only]**
- [x] Facilitator can view participant feedback details (label, comment, follow-up Q&A) (e2e-real, integration, unit)
- [x] Facilitator can trigger analysis at any time (even partial feedback) (e2e-mocked, unit)
- [x] Facilitator selects analysis template (Evaluation Criteria or Themes & Patterns) before running (e2e-mocked, unit)
- [x] System aggregates feedback by trace (unit) **[BE-only]**
- [x] Disagreements detected at 3 priority levels (deterministic, no LLM) (unit) **[BE-only]**
- [x] LLM distills evaluation criteria with evidence from trace IDs (unit) **[BE-only]**
- [x] LLM analyzes disagreements with follow-up questions and suggestions (unit) **[BE-only]**
- [x] Analysis record stores which template was used (unit) **[BE-only]**
- [x] Each analysis run creates a new record (history preserved) (e2e-mocked, unit)
- [x] Re-runnable — new analysis as more feedback comes in, prior analyses retained (unit) **[BE-only]**
- [x] Warning if < 2 participants (not an error) (e2e-mocked, unit)
- [x] Data freshness banner (participant count, last run timestamp) (unit)
- [x] Results organized by priority (HIGH → MEDIUM → LOWER) (unit)
- [x] Facilitator can promote distilled criteria to draft rubric (e2e-real, unit)
- [x] Facilitator can promote disagreement insights to draft rubric (e2e-real, unit)
- [x] Facilitator can promote raw participant feedback to draft rubric (e2e-real, unit)
- [x] Facilitator can manually add draft rubric items (e2e-real, unit)
- [x] Draft rubric items editable and removable (e2e-real, unit)
- [x] "Suggest Groups" returns LLM proposal without persisting (e2e-real, unit)
- [x] Facilitator can review, adjust, and apply group proposal (e2e-real, unit)
- [x] Manual grouping: create groups, name them, move items between groups (e2e-real, unit)
- [x] Each group maps to one rubric question (group name = question title) (e2e-real, unit)
- [x] Draft rubric items available during Rubric Creation phase (e2e-real, unit)
- [x] Source traceability maintained (which traces support each item) (e2e-real, unit)
- [x] One feedback record per (workshop, trace, user) — upsert behavior (integration, unit) **[BE-only]**
- [x] Q&A pairs appended in order to JSON array (integration, unit) **[BE-only]**
- [x] Multiple analysis records per workshop allowed (history preserved) (unit) **[BE-only]**
- [x] Draft rubric items track promotion source and promoter (unit) **[BE-only]**
- [x] LLM failures show error toast with retry (unit)
- [x] Fallback question if LLM unavailable after retries (unit) **[BE-only]**
- [x] Fallback warning banner shown only to facilitators, never to participants/SMEs (unit)
- [x] Analysis shows warning (not error) if < 2 participants (unit)
- [x] Form validation prevents empty submissions (unit) **[BE-only]**
- [x] Progressive disclosure (one question at a time) (e2e-real, unit)
- [x] Submit buttons disabled until required fields filled (unit)
- [x] Clear progress indication (X of Y traces completed) (e2e-real)
- [x] Smooth transitions between feedback states (unit)
- [x] Single two-panel workspace replaces multi-page flow (no FacilitatorDashboard discovery tabs, no FindingsReviewPage) (unit)
- [x] Trace feed shows actual trace content (input/output), not trace ID badges (unit)
- [x] Trace-specific analysis findings appear on the trace card, pinned above feedback (collapsible) (unit) **[BE-only]**
- [x] Cross-trace analysis findings appear in collapsible summary section above the feed (unit)
- [x] Overview bar shows stats inline + compact controls (Run Analysis, Add Traces, Pause, Model selector) (unit)
- [x] Draft rubric sidebar is always visible while browsing traces (e2e-mocked)
- [x] Promote action visibly moves items from trace feed/summary into the sidebar (unit) **[BE-only]**
- [x] Draft rubric items show trace reference badges (interactive: hover for preview, click to scroll) (unit) **[BE-only]**
- [x] Draft rubric items do NOT show source-type badges (Finding, Disagreement, etc.) (unit)
- [x] Disagreements color-coded by priority (red/yellow/blue) on trace cards (unit)
- [x] "Create Rubric →" in sidebar transitions to rubric creation with groups pre-populated as criteria (unit) **[BE-only]**

### Tests Without Requirement Links

These tests are tagged with the spec but don't link to specific requirements:

- `tests/unit/services/test_discovery_analysis_service.py` (test_draft_items_expose_source_trace_ids_for_display) [unit]
- `tests/unit/services/test_draft_rubric_items.py` (test_ungrouped_items_each_become_question) [unit]
- `tests/unit/services/test_draft_rubric_items.py` (test_no_items_raises_400) [unit]
- `tests/unit/services/test_draft_rubric_items.py` (test_mixed_grouped_and_ungrouped) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (renders trace ID badges for items with source_trace_ids) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (does not render trace badges for manual items with no trace IDs) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (renders source type badges for each item) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (shows item count in header) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (creates a new manual group from item controls) [unit]
- `client/src/components/DraftRubricPanel.test.tsx` (moves an item into an existing group from item controls) [unit]
- `client/src/components/DiscoveryAnalysisTab.evidence.test.tsx` (renders evidence trace IDs for findings (truncated to 8 chars)) [unit]
- `client/src/components/DiscoveryAnalysisTab.evidence.test.tsx` (shows trace ID badge for each disagreement item) [unit]

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
