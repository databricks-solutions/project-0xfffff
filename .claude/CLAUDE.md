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

## Improving Spec Coverage

When asked to improve coverage for a spec, use the `/spec-audit` skill. Key points:

1. **Start with `just spec-coverage --json`** — don't over-research before knowing the current state
2. **Tag existing tests first** — unlinked tests are free coverage, just add `@req` markers
3. **Only read implementation code if looking for spec drift** — not needed for tagging
4. **Vitest limitation**: only one `// @req` per file is detected; use pytest for per-test `@req`

## References

- **Workflow details**: See `CONTRIBUTING.md`
- **Brainstorming**: `.claude/skills/brainstorming/SKILL.md`
- **Writing plans**: `.claude/skills/writing-plans/SKILL.md`
- **Test patterns**: `.claude/skills/verification-testing/SKILL.md`
- **MLflow patterns**: `.claude/skills/mlflow-evaluation/SKILL.md`
- **Spec audit**: `.claude/skills/spec-audit/SKILL.md`
- **Spec index**: `/specs/README.md`
