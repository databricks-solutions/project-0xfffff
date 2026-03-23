---
name: writing-plans
description: "Use when you have a spec or requirements for a multi-step task, before touching code. Creates spec-linked implementation plans with TDD steps, exact file paths, and spec coverage tracking. Use this after brainstorming, when a user says 'plan this', 'how should we implement', or when you're about to start a multi-file feature. Covers the full loop: spec review -> file mapping -> task decomposition -> TDD steps -> coverage verification."
user_invocable: true
---

# Spec-Linked Implementation Planning

Turn a brainstorming design (or spec) into a step-by-step implementation plan that an agent can follow with zero additional context. Every plan is anchored to a governing spec — the spec's success criteria become the plan's acceptance criteria.

<HARD-GATE>
Do NOT write any implementation code until the plan is written and the user has approved it. Planning and implementation are separate phases. If you catch yourself thinking "this is simple enough to just code" — that's when a plan matters most.
</HARD-GATE>

## Why Plans Need Specs

Plans without specs drift. When you write "add a button that exports CSV," an agent implementing that step has to guess what columns to include, where the button goes, what happens on error. The spec already defines these things. By linking each plan task to specific success criteria, you eliminate guesswork and make verification automatic — the agent knows exactly what to test and how to tag it.

## Red Flags — You Are Rationalizing If You Think:

| Thought | Reality |
|---------|---------|
| "This is a small change, no plan needed" | Small changes across multiple files need coordination. Plan it. |
| "I'll figure out the order as I go" | You'll discover dependency issues mid-implementation. Map them now. |
| "The spec is the plan" | Specs define *what*, plans define *how* and *in what order*. |
| "I can hold all of this in my head" | Agents lose context. Plans persist across sessions. |
| "Let me just start with the tests" | Which tests? For which requirements? In what files? Plan first. |

## Before You Start

1. **Identify the governing spec** — if you came from brainstorming, the spec is already identified. If not, search `/specs/README.md` keyword index.
2. **Read the spec's Success Criteria** — these become your plan's verification targets.
3. **Check current coverage** — run `just spec-coverage --json` to see what's already covered.

If there's no governing spec, stop and invoke the `brainstorming` skill first.

## Plan Location

Save plans to `.claude/plans/YYYY-MM-DD-<feature-name>.md`.

After saving, append an entry to the governing spec's **Implementation Log** section. This creates a running record on each spec of what was planned and implemented against it. If the spec doesn't have an `## Implementation Log` section yet, add one at the bottom (before `## Future Work` if it exists).

### Log Entry Format

```markdown
## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-03-12 | [Admin Dashboard](../.claude/plans/2026-03-12-admin-dashboard.md) | planned | Infrastructure health + workshop metrics dashboard |
```

Update the `Status` column as work progresses: `planned` → `in-progress` → `complete`.

Note: modifying spec files is a **protected operation** — present the log entry to the user and get approval before writing to `/specs/`.

## Plan Structure

### Header (required)

Every plan starts with this header:

```markdown
# [Feature Name] Implementation Plan

**Spec:** [SPEC_NAME](../../specs/SPEC_NAME.md)
**Goal:** [One sentence — what this builds]
**Architecture:** [2-3 sentences about approach]
**Success Criteria Targeted:**
- SC-1: [Paste exact criterion from spec]
- SC-2: [Paste exact criterion from spec]
- ...

---
```

Pasting the exact success criteria text matters — it keeps the plan honest. If you find yourself wanting to rephrase a criterion, that's a sign the spec might need updating (protected operation — ask the user).

### File Map

Before defining tasks, list every file that will be created or modified:

```markdown
## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `server/routers/admin.py` | Admin health + activity endpoints |
| `client/src/pages/AdminDashboard.tsx` | Main dashboard page |
| `tests/unit/test_admin_endpoints.py` | Backend unit tests |

### Modified Files
| File | Change |
|------|--------|
| `server/app.py` | Register admin router |
| `client/src/App.tsx` | Add /admin route |
```

Design principles:
- Each file has one clear responsibility
- Files that change together live together
- Follow existing codebase patterns (check before inventing)
- Prefer smaller, focused files over large ones

### Task Decomposition

Break work into tasks. Each task produces a self-contained, testable change.

**Ordering rules:**
1. Data models and schemas first (foundation)
2. Backend logic next (services, endpoints)
3. Frontend components after that (they consume the backend)
4. Integration and wiring last (routing, registration)
5. Coverage verification as final task (always)

### Task Format

````markdown
### Task N: [Component Name]

**Spec criteria:** SC-1, SC-3
**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py`
- Test: `tests/unit/test_file.py`

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.spec("SPEC_NAME")
@pytest.mark.req("Exact success criterion text from spec")
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `just test-server-spec SPEC_NAME`
Expected: FAIL — `function` not defined

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `just test-server-spec SPEC_NAME`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/test_file.py src/path/file.py
git commit -m "feat(admin): add specific feature"
```
````

Key requirements:
- **Every test gets spec tags.** `@pytest.mark.spec("SPEC_NAME")` and `@pytest.mark.req("criterion text")` for Python. `@spec:SPEC_NAME` and `@req:criterion text` tags for Playwright/Vitest.
- **`@req` text must be verbatim from the spec.** Copy-paste the exact success criterion text. Don't paraphrase — the coverage analyzer matches on this text, so "User can log in" and "Users can log in" are different requirements. When in doubt, open the spec and copy.
- **Exact file paths always.** Not "the test file" — `tests/unit/test_admin_endpoints.py`.
- **Complete code in plan.** Not "add validation" — the actual validation code.
- **Use `just` commands for all test/lint runs.** Not `npx vitest`, `pytest`, or `npx playwright` directly — always use the `just` wrappers (`just test-server`, `just ui-test-unit`, `just e2e`, etc.). The `just` commands handle environment setup, JSON report generation, and consistent configuration. Running raw test runners skips all of that and will produce different results than CI.
- **Exact commands with expected output.** Not "run tests" — `just test-server-spec ADMIN_DASHBOARD_SPEC`, expected PASS.
- **One logical change per commit.** Small, reviewable, revertible.

### Step Granularity

Each step is one action (2-5 minutes of agent time):
- "Write the failing test" — step
- "Run it to verify it fails" — step
- "Implement the minimal code" — step
- "Run tests to verify they pass" — step
- "Commit" — step

If a step takes more than 5 minutes to describe, break it into smaller steps.

### Frontend Test Tags

For TypeScript tests, use the appropriate tagging format:

**Playwright (E2E):**
```typescript
test.use({ tag: ['@spec:SPEC_NAME', '@req:Exact success criterion text'] });

test('specific behavior', async ({ page }) => {
  // test code
});
```

**Vitest (unit):**
```typescript
// @spec SPEC_NAME
// @req Exact success criterion text

describe('component', () => {
  it('should do specific thing', () => { ... });
});
```

### Final Task: Lint and Coverage Verification

The last task in every plan runs linting and verifies that coverage improved. Including lint here catches issues that would fail CI — broken imports, unused variables, type errors — before the developer thinks they're done.

````markdown
### Task N (Final): Lint and Verify Spec Coverage

- [ ] **Step 1: Run linting**

Run: `just ui-lint` (for frontend changes)
Expected: No errors

- [ ] **Step 2: Run spec coverage**

Run: `just spec-coverage --specs SPEC_NAME`
Expected: Coverage increased from X% to Y%

- [ ] **Step 3: Check for untagged tests**

Run: `just spec-validate`
Expected: All tests tagged

- [ ] **Step 4: Run full test suite for the spec**

Run: `just test-spec SPEC_NAME`
Expected: All tests PASS

- [ ] **Step 5: Update implementation log**

Update the spec's Implementation Log entry status from `planned` to `complete`.
````

## Scope Check

If the spec covers multiple independent subsystems, consider breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own. Signs you need to split:
- Tasks have no dependencies between groups
- Different spec criteria map to entirely different code paths
- One subsystem could ship without the other

## Terminal State

After the plan is written and saved:

**"Plan saved to `.claude/plans/<filename>.md` and logged on [SPEC_NAME]. Ready to implement?"**

The pipeline is: brainstorming → **writing-plans** → implementation

Implementation uses the `verification-testing` skill to guide test writing and verification.

## Reference

- Spec index: `/specs/README.md`
- Coverage map: `/specs/SPEC_COVERAGE_MAP.md`
- Verification commands: `.claude/skills/verification-testing/SKILL.md`
- Brainstorming: `.claude/skills/brainstorming/SKILL.md`
