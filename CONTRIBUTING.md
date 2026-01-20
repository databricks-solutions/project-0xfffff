# Contributing with Coding Agents

This repository is designed for effective collaboration with coding agents. We use **spec-driven development** where specifications define behavior, tests verify implementation, and guardrails ensure quality.

## Quick Start

1. Read `.claude/CLAUDE.md` for agent instructions
2. Find specs via `/specs/README.md` keyword index
3. Run `/verify affected` after changes

---

## The Spec-Driven System

### How It Works

```
┌─────────────┐     defines      ┌─────────────┐     verified by    ┌─────────────┐
│    Specs    │ ───────────────► │    Code     │ ◄───────────────── │    Tests    │
│  /specs/    │                  │  /server/   │                    │  /tests/    │
│             │                  │  /client/   │                    │             │
└─────────────┘                  └─────────────┘                    └─────────────┘
       │                                                                   │
       │                    linked via spec markers                        │
       └───────────────────────────────────────────────────────────────────┘
                              @pytest.mark.spec("SPEC_NAME")
```

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Specifications | `/specs/*.md` | Source of truth for behavior |
| Spec Index | `/specs/README.md` | Keyword-searchable index |
| Coverage Map | `/specs/SPEC_COVERAGE_MAP.md` | Which tests verify which specs |
| Agent Config | `.claude/CLAUDE.md` | Instructions for coding agents |
| Guardrails | `.claude/settings.json` | Tool permissions and restrictions |
| Skills | `.claude/skills/` | Domain-specific agent knowledge |

---

## Guardrails

### Protected Operations

These operations require explicit user approval:

| Operation | Why Protected |
|-----------|---------------|
| Edit `/specs/*` | Specs are source of truth |
| Create migrations | Schema changes need review |
| Edit auth logic | Security-sensitive |
| `git push` | Affects shared state |
| Delete files | Destructive |

### Blocked Operations

These are blocked entirely via `.claude/settings.json`:

- `rm -rf` - Destructive
- `git push --force` - Rewrites history
- `git reset --hard` - Loses work
- Direct spec file writes - Must go through review

### Automatic Approvals

Safe operations are pre-approved:

- Running tests (`just test-*`)
- Linting (`just ui-lint`)
- Git status/diff/log
- Reading any file

---

## Workflow

### Implementing a Feature

```
1. UNDERSTAND
   └─► Search /specs/README.md for keywords
   └─► Read the relevant spec
   └─► Check /specs/SPEC_COVERAGE_MAP.md for existing tests

2. IMPLEMENT
   └─► Follow spec requirements exactly
   └─► If spec is unclear, STOP and ask

3. TEST
   └─► Write tests tagged to the spec
   └─► @pytest.mark.spec("SPEC_NAME")
   └─► { tag: ['@spec:SPEC_NAME'] }

4. VERIFY
   └─► Run /verify affected
   └─► All tests must pass

5. UPDATE COVERAGE (if new tests)
   └─► uv run spec-coverage-analyzer
```

### Fixing a Bug

```
1. Identify which spec governs the behavior
2. Read spec to understand correct behavior
3. Fix the bug
4. Add regression test tagged to spec
5. Verify
```

### When Stuck

| Situation | Action |
|-----------|--------|
| Spec doesn't cover this case | Ask user, suggest spec update |
| Tests failing after fix | Don't mark complete, report failure |
| Unclear requirements | Ask for clarification |
| Need to modify protected file | Request explicit approval |

---

## Test Tagging

**All tests must be tagged to a spec.** This links verification to requirements.

### pytest
```python
@pytest.mark.spec("AUTHENTICATION_SPEC")
def test_login_creates_session():
    ...
```

### Playwright
```typescript
test('login redirects to dashboard', {
  tag: ['@spec:AUTHENTICATION_SPEC']
}, async ({ page }) => {
  ...
});
```

### Vitest
```typescript
// @spec AUTHENTICATION_SPEC
describe('useAuth hook', () => {
  ...
});
```

### Regenerate Coverage Map
```bash
uv run spec-coverage-analyzer
```

---

## Verification Commands

| Command | Scope | When to Use |
|---------|-------|-------------|
| `/verify` | All tests | Before completing any task |
| `/verify affected` | Changed files only | Quick check during development |
| `/verify backend` | Python only | Backend-only changes |
| `/verify frontend` | TS/React only | Frontend-only changes |
| `/verify e2e` | E2E only | UI integration changes |

### Manual Commands

```bash
just test-server     # Python unit tests
just ui-test-unit    # React unit tests
just ui-lint         # TypeScript/ESLint
just e2e             # End-to-end tests
```

---

## Skills

Skills provide domain-specific patterns. Load when needed:

| Skill | Use For |
|-------|---------|
| `verification-testing` | Writing tests, mocking patterns, E2E scenarios |
| `mlflow-evaluation` | Evaluation code, scorers, trace analysis |

Skills live in `.claude/skills/` with reference docs for deep dives.

---

## Environment Setup

### Prerequisites
- Python 3.11+
- Node.js 22.16+
- `just` task runner

### Setup
```bash
./setup.sh           # Install all dependencies
```

### Run Locally
```bash
just dev             # Start backend + frontend
# Or separately:
just server          # Backend only (port 8000)
just ui              # Frontend only (port 5173)
```

### Database
```bash
just db-upgrade      # Run migrations
just db-bootstrap    # Reset with sample data
```

---

## File Structure

```
/
├── .claude/
│   ├── CLAUDE.md           # Agent instructions
│   ├── settings.json       # Tool permissions
│   ├── commands/           # Slash commands (/verify)
│   └── skills/             # Domain knowledge
├── specs/
│   ├── README.md           # Keyword index
│   ├── SPEC_COVERAGE_MAP.md # Test-to-spec mapping
│   └── *_SPEC.md           # Individual specs
├── server/                 # FastAPI backend
├── client/                 # React frontend
├── tests/                  # Python tests
└── justfile                # Task runner commands
```

---

## Adding a New Spec

1. Create `/specs/NEW_SPEC.md` following existing format
2. Add to `/specs/README.md` index with keywords
3. Add to `KNOWN_SPECS` in `tools/spec_coverage_analyzer.py`
4. Write tests tagged to the new spec
5. Run `uv run spec-coverage-analyzer`

---

## Principles

1. **Specs are authoritative** - Code follows specs, not the other way around
2. **Tests prove compliance** - Every spec requirement has a tagged test
3. **Guardrails prevent accidents** - Protected operations need approval
4. **Progressive disclosure** - CLAUDE.md is brief, details in skills/docs
5. **Verify before done** - No task is complete until tests pass
