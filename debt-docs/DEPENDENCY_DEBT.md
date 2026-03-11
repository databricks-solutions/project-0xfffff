# Dependency Debt

## Overview

The dependency debt in this codebase is relatively contained. The main issues are two unused Python packages that add bloat and attack surface, overly loose version pinning that could introduce breaking changes during deployment, and a minor dependency duplication. Frontend dependencies are well-managed with no unused packages detected.

---

## Items

### DEP-1: Unused Python Dependencies (litellm, dspy)

**Severity**: HIGH
**Location**: `pyproject.toml:41, 43`

**Description**:
```toml
"dspy>=3.0.4",
"litellm>=1.75.9",
```

Neither `litellm` nor `dspy` is imported anywhere in the codebase. Grep for `from litellm`, `import litellm`, `from dspy`, and `import dspy` returned zero results across all files.

**Impact**:
- Increased install time and image size (litellm alone pulls in 50+ transitive dependencies)
- Larger attack surface for CVEs
- Maintenance burden for version upgrades
- Developer confusion about what's actually used

**Remediation**: Remove both from `pyproject.toml` dependencies. Verify no indirect usage first with `uv pip show --files`.

**Acceptance Criteria**:
- [ ] `dspy` removed from pyproject.toml
- [ ] `litellm` removed from pyproject.toml
- [ ] `uv sync` succeeds without them
- [ ] All tests pass after removal

---

### DEP-2: Overly Loose Version Pinning

**Severity**: MEDIUM
**Location**: `pyproject.toml:24-47`

**Description**: Critical packages use `>=` pinning which allows major version jumps:

| Package | Current | Risk |
|---------|---------|------|
| `fastapi>=0.104.1` | Allows FastAPI 1.0+ with breaking changes |
| `pydantic>=2.5.0` | Allows Pydantic 3.x with breaking changes |
| `mlflow[databricks,genai]>=3.9` | Allows MLflow 4.x with breaking changes |
| `uvicorn[standard]>=0.24.0` | Allows major version changes |
| `cryptography>=41.0.0` | Security-sensitive package with loose pin |
| `sqlalchemy>=2.0.23` | ORM changes can break query patterns |

**Impact**: A `pip install` or `uv sync` could pull in a new major version with breaking API changes, causing production failures that are hard to diagnose.

**Remediation**: Use compatible release syntax to allow patch updates but block major/minor:
```toml
"fastapi>=0.104.1,<1.0.0",
"pydantic>=2.5.0,<3.0.0",
"mlflow[databricks,genai]>=3.9,<4.0.0",
"sqlalchemy>=2.0.23,<3.0.0",
```

The `uv.lock` file provides reproducible installs, but the pyproject.toml constraints are still important for communicating compatibility intent and for environments that don't use the lock file.

**Acceptance Criteria**:
- [ ] All critical packages have upper-bound version constraints
- [ ] `uv sync` and `pip install` still resolve successfully
- [ ] Documented process for bumping version constraints

---

### DEP-3: Duplicated httpx Dependency

**Severity**: LOW
**Location**: `pyproject.toml:32` (main deps) and `pyproject.toml:65` (test deps)

**Description**:
```toml
# Main dependencies
"httpx>=0.25.0",

# [project.optional-dependencies] test
"httpx>=0.25.0",  # For testing
```

`httpx` appears in both main dependencies and test optional-dependencies. Since it's in main, the test duplicate is redundant.

**Impact**: Minor confusion about whether httpx is a runtime or test dependency. If it's truly test-only, it shouldn't be in main deps.

**Remediation**: Determine if httpx is used at runtime:
- If yes: remove from `[project.optional-dependencies] test`
- If no: move to test-only and remove from main dependencies

**Acceptance Criteria**:
- [ ] `httpx` appears in exactly one dependency section
- [ ] Comment explains why it's in that section

---

## Prioritized Backlog

| Priority | ID | Title | Effort | Impact |
|----------|-----|-------|--------|--------|
| P1 | DEP-1 | Remove unused litellm and dspy | S | High - reduces bloat and attack surface |
| P2 | DEP-2 | Add upper-bound version constraints | S | Medium - prevents breaking upgrades |
| P3 | DEP-3 | Deduplicate httpx dependency | S | Low - minor cleanup |

**Effort**: S = < 2 hours, M = 2-8 hours, L = 1-3 days
