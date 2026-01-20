# Claude Code Instructions

## Purpose

Human Evaluation Workshop - a collaborative platform for annotating and evaluating LLM traces with MLflow integration. Built for Databricks Apps deployment.

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, Alembic (SQLite)
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Testing**: pytest, Vitest, Playwright
- **Task runner**: `just` (see `justfile`)

## Key Directories

| Directory | Contents |
|-----------|----------|
| `/specs/` | Declarative specifications (source of truth) |
| `/server/` | FastAPI backend |
| `/client/` | React frontend |
| `/tests/` | Python tests |
| `/client/tests/` | Frontend unit + E2E tests |

## Spec-Driven Development

**This repo uses specs as source of truth.** Before implementing:

1. Search `/specs/README.md` for relevant spec (keyword indexed)
2. Read the spec - it defines expected behavior and success criteria
3. Check `/specs/SPEC_COVERAGE_MAP.md` for existing test coverage

## Core Rules

- **Read spec before coding** - No feature work without understanding the spec
- **Tag all tests to specs** - Use `@pytest.mark.spec("SPEC_NAME")` or equivalent
- **Verify before completing** - Run tests, ensure they pass
- **Ask if spec is unclear** - Don't guess at undefined behavior

## Protected Operations (Ask First)

- Modifying files in `/specs/`
- Creating database migrations
- Changing auth logic
- Deleting files
- Destructive git operations

## Commands

```bash
just test-server     # Python unit tests
just ui-test-unit    # React unit tests
just ui-lint         # TypeScript/ESLint
just e2e mode (headless|headed) extra-args      # End-to-end tests
```

if you want to do something not covered here consult @justfile

## References

- **Workflow details**: See `CONTRIBUTING.md`
- **Test patterns**: `.claude/skills/verification-testing/SKILL.md`
- **MLflow patterns**: `.claude/skills/mlflow-evaluation/SKILL.md`
- **Spec index**: `/specs/README.md`
