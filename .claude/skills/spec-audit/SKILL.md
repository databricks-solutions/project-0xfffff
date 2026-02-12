---
name: spec-audit
description: "Audit and improve spec coverage for a given spec. Use when (1) a spec has low or 0% requirement coverage, (2) tests exist but lack @req tags, (3) code behaviors have drifted from the spec's success criteria, (4) you need to identify unspecified behaviors in the codebase. Covers the full audit loop: analyze coverage -> tag existing tests -> identify spec gaps -> propose spec updates."
user_invocable: true
---

# Spec Coverage Audit

## When to Use

- A spec shows low coverage in `just spec-coverage`
- Tests are tagged `@spec:X` but not linked to requirements (`@req`)
- You suspect the spec's success criteria don't match the implemented code
- Issue #85 work items for filling spec gaps

## Audit Workflow

Follow these steps **in order**. Do not over-research — each step builds on the previous one.

### Step 1: Get the current state (< 2 minutes)

Run these in parallel:

```bash
# Current coverage numbers (JSON for programmatic use)
just spec-coverage --json | jq '.specs.SPEC_NAME'

# The spec's success criteria
# Read specs/SPEC_NAME.md — focus on the "Success Criteria" section
```

From the JSON output, note:
- `covered` / `total` requirements
- `uncovered` — requirements needing `@req` tags or new tests
- `unlinked_tests` — tests tagged `@spec` but missing `@req` (these are the quick wins)

### Step 2: Delegate to spec-tester agents

**For a single spec**: Spawn one `spec-tester` agent with the spec name and uncovered requirements list.

**For multiple specs**: Spawn `spec-tester` agents **in parallel**, one per spec:

```
Spawn these spec-tester agents in parallel:
- Agent 1: RUBRIC_SPEC, mode=tag-only, requirements: [list from Step 1]
- Agent 2: BUILD_AND_DEPLOY_SPEC, mode=tag-only, requirements: [list from Step 1]
- Agent 3: AUTHENTICATION_SPEC, mode=full, requirements: [list from Step 1]
```

**For a large spec with many requirements**: Split into requirement groups and spawn parallel agents:

```
Spawn these spec-tester agents in parallel for RUBRIC_SPEC:
- Agent 1: requirements in "Parsing & Serialization" category
- Agent 2: requirements in "CRUD Lifecycle" category
- Agent 3: requirements in "AI-Powered Generation" category
```

Each agent reads the spec, tags existing tests, writes new tests if needed, and verifies.

### Step 3: Collect results and verify

After agents return, run the global check:

```bash
just spec-coverage    # verify overall improvement
just test-server      # full suite still passes
```

### Step 4: Identify spec drift (only if asked)

**Only do this if the user asks to find unspecified behaviors.**

This requires reading implementation code — spawn parallel Explore agents per layer:

```
Spawn these explore agents in parallel:
- Agent 1: Read all router endpoints for this spec's domain, list business rules
- Agent 2: Read all service methods for this spec's domain, list edge cases and side effects
- Agent 3: Read all frontend components for this spec's domain, list user interactions
```

Compare findings to the spec's success criteria. Look for:
- **CRUD operations** not in success criteria (create, edit, delete)
- **Phase/workflow preconditions** (must be in phase X, must have Y first)
- **Side effects** (background jobs, MLflow sync, cache invalidation)
- **Validation rules** (input constraints, error responses)
- **AI/external service integration** (generation, export, sync)

### Step 5: Propose spec additions (protected operation)

Draft new success criteria grouped by category. Present to user before editing — `/specs/` files require approval.

## Tagging Reference

| Framework | Format | Scope |
|-----------|--------|-------|
| pytest | `@pytest.mark.req("Exact text from success criteria")` | Per-test (decorator) |
| Playwright | `tag: ['@spec:X', '@req:Exact text from success criteria']` | Per-test (in test options) |
| Vitest | `// @req Exact text from success criteria` | **Per-file only** (analyzer limitation) |

**Critical**: The `@req` text must match a `- [ ]` item from the spec exactly.

**Vitest limitation**: The analyzer caches one `@req` per vitest file. If a file covers multiple requirements, add `@req` markers to pytest or Playwright tests for the additional requirements instead.

## Anti-Patterns

- **Don't spawn broad research agents** before reading the coverage JSON. The JSON tells you exactly what's covered and uncovered.
- **Don't read all implementation code up front.** Start with tagging existing tests (Step 2). Only read implementation code for spec drift (Step 4).
- **Don't write new tests before tagging existing ones.** Unlinked tests are free coverage — just add markers.
- **Don't guess at `@req` text.** Copy it exactly from the spec's `- [ ]` items.
- **Don't put multiple `// @req` comments in one vitest file** expecting them all to be picked up. Only the first one works.
- **Don't run each spec sequentially** when auditing multiple specs. Spawn parallel agents.

## Example: Auditing RUBRIC_SPEC

```bash
# Step 1: Get state
just spec-coverage --json | jq '.specs.RUBRIC_SPEC'
# Shows: 0/10 covered, 51 unlinked tests

# Step 2: Spawn spec-tester agent
# Agent reads spec, tags 10 existing tests with @req markers

# Step 3: Verify
just test-spec RUBRIC_SPEC   # 30 passed
just spec-coverage           # RUBRIC_SPEC now 10/10 (100%)

# Step 4: Spec drift analysis (user asked)
# Spawned 3 explore agents in parallel -> found 15 unspecified behaviors

# Step 5: Proposed 15 new success criteria -> user approved -> 10/25 covered
```

## Example: Auditing all low-coverage specs in parallel

```bash
# Step 1: Get state for all specs
just spec-coverage --json | jq '[.specs | to_entries[] | select(.value.coverage_pct < 50)] | .[].key'
# Returns: RUBRIC_SPEC, BUILD_AND_DEPLOY_SPEC, DESIGN_SYSTEM_SPEC, UI_COMPONENTS_SPEC

# Step 2: Spawn 4 spec-tester agents in parallel (one per spec, mode=tag-only)
# Each agent independently reads its spec, tags tests, verifies

# Step 3: Collect results, run full suite
just test-server && just spec-coverage
```

## Reference

- Spec files: `specs/*.md`
- Coverage analyzer: `tools/spec_coverage_analyzer.py`
- Coverage map: `specs/SPEC_COVERAGE_MAP.md`
- Spec-tester agent: `.claude/agents/spec-tester.md`
- Test tagging conventions: `.claude/skills/verification-testing/SKILL.md`
