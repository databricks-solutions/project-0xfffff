# Developer Experience & Documentation Debt

## Overview

Developer experience debt spans stale workspace artifacts, missing tooling configuration, inconsistent logging patterns, and significant documentation gaps. The most impactful issue is the complete absence of architecture documentation - no system diagrams, data flow docs, or deployment architecture guide. Combined with monolithic 5000+ line files and 6+ configuration formats, onboarding friction is high. The logging inconsistency (135+ print statements mixed with proper logging) makes production debugging impractical.

---

## Items

### DX-1: Missing Architecture Documentation

**Severity**: CRITICAL
**Location**: None - entirely missing

**Description**: No architecture documentation exists anywhere in the repo:
- No system diagrams
- No data flow documentation (MLflow traces -> ingestion -> annotation -> export)
- No deployment architecture guide (local vs Databricks Apps)
- No integration documentation (SQLite/Postgres, MLflow, Databricks APIs, custom LLM providers)
- No component communication patterns (frontend state management, API client organization)

The `/doc/` directory contains only release notes and FACILITATOR_GUIDE.md. The `/specs/` directory covers behavioral specs but not architecture.

**Impact**: Onboarding takes 2x longer. Architectural decisions are implicit and easily violated. New contributors misunderstand the system. Production troubleshooting requires reading code.

**Remediation**: Create `doc/ARCHITECTURE.md` covering:
1. System overview diagram
2. Data flow: traces -> ingestion -> discovery -> rubric -> annotation -> results -> export
3. Backend layers: routers -> services -> database
4. Frontend architecture: pages, components, hooks, context, API client
5. Deployment: local dev vs Databricks Apps, database backends, volume management
6. Integration points: MLflow, Databricks SDK, custom LLM providers

**Acceptance Criteria**:
- [ ] `doc/ARCHITECTURE.md` exists with system diagram
- [ ] Data flow documented end-to-end
- [ ] Deployment architecture documented
- [ ] New contributor can understand the system from docs alone

---

### DX-2: Stale Git Artifacts and Workspace Clutter

**Severity**: HIGH
**Location**: Git staging area (from `git status`)

**Description**: Multiple deleted files not committed, temp files, and database artifacts:

**Deleted but not committed**:
- `client/bypassed-login-layout.png`
- `client/current-state.png`
- `client/debug-screenshot.png`
- `client/layout-error-check.png`
- `client/vite.config.ts.timestamp-*.mjs` (Vite temp file)
- `e2e-test-output.txt`

**Should be in .gitignore**:
- `.coverage` (pytest coverage artifacts)
- `mlflow.db` (MLflow database)
- `workshop*.db` (stale workshop databases - 4+ MB)
- `.claude/mlflow/*.log` (Claude tracing logs showing as modified)

**Impact**: Pollutes git status, confuses developers, bloats repository.

**Remediation**:
1. `git rm --cached` the deleted files
2. Add missing patterns to `.gitignore`: `*.db`, `.coverage`, `.claude/mlflow/*.log`
3. Clean up untracked files

**Acceptance Criteria**:
- [ ] `git status` is clean (no stale deletions)
- [ ] `.gitignore` covers all generated artifacts
- [ ] No database files or coverage artifacts in repo

---

### DX-3: Missing Frontend Tooling Configuration

**Severity**: HIGH
**Location**: `client/` directory

**Description**: Several expected configuration files are missing:
- **No ESLint config** - `eslint` is in package.json but no `.eslintrc.cjs` or `eslint.config.js` exists. `npm run lint` uses default rules only.
- **No Prettier config** - `prettier` is listed but no `.prettierrc` exists. Formatting is inconsistent.
- **No pre-commit hooks** - No `.pre-commit-config.yaml` or `husky` configuration. Developers can commit unformatted code, debug statements, and lint violations.

**Impact**: Inconsistent code quality across frontend. No automated enforcement of standards.

**Remediation**:
1. Create `client/eslint.config.js` with TypeScript + React rules
2. Create `client/.prettierrc` with project standards
3. Add pre-commit hooks (husky + lint-staged for frontend, pre-commit for Python)

**Acceptance Criteria**:
- [ ] ESLint config file exists and `npm run lint` enforces rules
- [ ] Prettier config exists and `npm run format` is available
- [ ] Pre-commit hooks run lint + format on staged files

---

### DX-4: 135+ Print Statements Mixed with Logging

**Severity**: HIGH
**Location**: Throughout `server/` (see CQ-5 in CODE_QUALITY_DEBT.md)

**Description**: Backend mixes `print()` with `logging.getLogger()`:
```python
# server/database.py
print('  Creating database tables...')
print(f'  Created/verified schema: {schema_name}')

# server/routers/workshops.py
print(f"  DEBUG trace_ids: {[t.id for t in traces]}")
```

135+ print statements found across the backend. No structured format, no log levels.

**Impact**: Cannot filter, aggregate, or alert on logs. Production debugging requires reading raw stdout. Overlaps with CQ-5 and DEPLOY-7.

**Remediation**: Replace all `print()` with `logger.info()` / `logger.debug()`. See DEPLOY-7 for structured logging plan.

**Acceptance Criteria**:
- [ ] Zero `print()` statements in production code
- [ ] All logging uses `logging` module with appropriate levels

---

### DX-5: Missing API Endpoint Documentation

**Severity**: MEDIUM
**Location**: `server/routers/` (all files)

**Description**: OpenAPI/Swagger descriptions are minimal:
```python
@router.post('/auth/login', response_model=AuthResponse)
async def login(login_data: UserLogin, ...):
    """Authenticate a user with email and password."""  # Too minimal
```

Missing from most endpoints:
- Parameter constraints (required fields, valid ranges)
- Error response documentation
- Request/response examples
- Authentication requirements

**Impact**: Frontend developers must read backend code to understand API contracts.

**Remediation**: Add OpenAPI descriptions with `response_model`, `responses`, and `description` parameters.

**Acceptance Criteria**:
- [ ] All endpoints have descriptive docstrings
- [ ] Error responses documented (400, 401, 403, 404, 500)
- [ ] OpenAPI UI at `/docs` is usable for API exploration

---

### DX-6: Configuration Sprawl (6+ Formats)

**Severity**: MEDIUM
**Location**: Multiple files

**Description**: Configuration is spread across 8+ files in different formats:

| File | Format | Purpose |
|------|--------|---------|
| `pyproject.toml` | TOML | Python project, tools (black, ruff, mypy, pytest) |
| `client/package.json` | JSON | Frontend deps, scripts |
| `client/vite.config.ts` | TypeScript | Build, dev server, test |
| `alembic.ini` | INI | Migration config |
| `app.yaml` | YAML | Databricks Apps deployment |
| `config/auth.yaml` | YAML | Auth configuration |
| `.env.local` | Env | Environment variables |
| `justfile` | Just | Task runner (with inline Python/shell) |

**Impact**: New developers must understand 6 different config formats. No single source of truth. Configuration validation is minimal.

**Remediation**: Document all configuration in a single guide (`doc/CONFIGURATION.md`). Add startup validation for all required config values.

**Acceptance Criteria**:
- [ ] `doc/CONFIGURATION.md` lists all config files and their purpose
- [ ] All required environment variables documented with defaults
- [ ] Startup validates required configuration

---

### DX-7: No Database Schema Documentation

**Severity**: MEDIUM
**Location**: `server/database.py`, `migrations/versions/`

**Description**: No human-readable schema documentation:
- No entity relationship diagram (ERD)
- No schema evolution timeline
- No data model explanation
- Relationships between tables undocumented

Developers must read Alembic migration code or SQLAlchemy models to understand the schema.

**Impact**: Schema relationships unclear. Easy to create queries that violate implicit constraints.

**Remediation**: Create `doc/DATABASE.md` with:
1. ERD diagram (can use Mermaid in markdown)
2. Table descriptions and relationships
3. Important constraints and invariants
4. Query patterns and recommended joins

**Acceptance Criteria**:
- [ ] `doc/DATABASE.md` exists with ERD
- [ ] All tables and key columns documented
- [ ] Updated when schema changes

---

### DX-8: Generated API Client Not Documented

**Severity**: MEDIUM
**Location**: `client/src/client/` (generated code)

**Description**:
```typescript
/* generated using openapi-typescript-codegen -- do not edit */
```

Generated from OpenAPI but no documentation on:
- How/when to regenerate
- What OpenAPI spec URL to use
- How to update when backend changes
- Whether manual edits are allowed

**Impact**: Frontend developers don't know how to update the API client when backend endpoints change.

**Remediation**: Add `client/src/client/README.md` or comments in the generator script explaining:
1. How to regenerate: `npx openapi-typescript-codegen --input http://localhost:8000/openapi.json --output src/client`
2. When to regenerate: after backend API changes
3. What not to modify: generated files

**Acceptance Criteria**:
- [ ] Regeneration process documented
- [ ] justfile recipe for regeneration
- [ ] CI check that generated code is up to date

---

### DX-9: Console Error Handling Without Structured Logging (Frontend)

**Severity**: MEDIUM
**Location**: `client/src/context/UserContext.tsx`

**Description**:
```typescript
console.error('Failed to load permissions on cached user:', permError);
console.error('Error initializing user:', e);
console.warn('Failed to load permissions, using defaults');
```

Frontend error handling goes to browser console only. No error reporting service.

**Impact**: Production errors invisible to the team. No error aggregation or alerting.

**Remediation**: Integrate an error reporting service (Sentry, LogRocket, or custom) for production error visibility.

**Acceptance Criteria**:
- [ ] Error reporting service configured
- [ ] Unhandled errors captured automatically
- [ ] Key error paths reported with context

---

### DX-10: Onboarding Friction in README

**Severity**: MEDIUM
**Location**: `README.md`, `CONTRIBUTING.md`

**Description**:
- README line 11 says "Download project-with-build.zip" but no link provided
- Setup instructions scattered between README and CONTRIBUTING.md
- No troubleshooting section
- Minimum versions buried in text (Python 3.11+, Node.js 22.16+)
- CONTRIBUTING.md has excellent spec-driven dev guidance but no:
  - Local development quick start
  - Common development tasks (how to add an endpoint, add a component)
  - Debugging tips

**Impact**: New contributors spend extra time figuring out setup and conventions.

**Remediation**: Add quick start section to README, troubleshooting FAQ, and common tasks guide.

**Acceptance Criteria**:
- [ ] README has clear quick start (clone, setup, run)
- [ ] Version requirements prominently listed
- [ ] Troubleshooting section for common issues
- [ ] CONTRIBUTING.md includes "How to add an endpoint" guide

---

### DX-11: Unresolved TODO/FIXME Comments

**Severity**: LOW
**Location**: See CQ-15 in CODE_QUALITY_DEBT.md

**Description**: 6+ TODO comments with no linked issues or clear context:
```python
# TODO: pretty sure this does nothing (no commit, no update)?
# TODO: this was ostensibly here for a reason, but I don't know what it is.
# TODO: this is a noop, actually handle connection testing?
```

**Impact**: Uncertainty about code behavior. Developer stops to investigate each one.

**Remediation**: Convert each to a GitHub issue or resolve. Remove unclear comments.

**Acceptance Criteria**:
- [ ] Every TODO has a linked GitHub issue
- [ ] Unclear TODOs resolved or removed

---

## Prioritized Backlog

| Priority | ID | Title | Effort | Impact |
|----------|-----|-------|--------|--------|
| P0 | DX-2 | Clean up stale git artifacts | S | High - immediate workspace hygiene |
| P1 | DX-1 | Create architecture documentation | L | Critical - onboarding and understanding |
| P1 | DX-3 | Add ESLint, Prettier, pre-commit hooks | M | High - code quality enforcement |
| P1 | DX-4 | Replace print() with logging | M | High - production debugging (see CQ-5) |
| P2 | DX-5 | Add API endpoint documentation | M | Medium - developer productivity |
| P2 | DX-6 | Document configuration | M | Medium - onboarding |
| P2 | DX-7 | Create database schema documentation | M | Medium - understanding |
| P2 | DX-8 | Document API client regeneration | S | Medium - maintenance |
| P2 | DX-10 | Improve README and CONTRIBUTING | M | Medium - onboarding |
| P3 | DX-9 | Add frontend error reporting | M | Medium - observability |
| P3 | DX-11 | Resolve TODO comments | S | Low - code clarity |

**Effort**: S = < 2 hours, M = 2-8 hours, L = 1-3 days
