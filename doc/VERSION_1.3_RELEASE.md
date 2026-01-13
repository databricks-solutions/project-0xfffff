# Release v1.3.0

## 🎯 Highlights

This release includes major infrastructure improvements for database migrations and test coverage, plus critical bug fixes for binary judge evaluation.

## 🗄️ Database Migrations with Alembic (by Forrest Murray)

Added proper database schema management using Alembic:

### Migration Files
| Migration | Description |
|-----------|-------------|
| `0001_baseline.py` | Initial schema baseline |
| `0002_legacy_schema_fixes.py` | Legacy schema compatibility fixes |
| `0003_judge_schema_updates.py` | Judge table schema updates |

### New Commands (via justfile)
```bash
just db-upgrade      # Run Alembic migrations to head
just db-stamp        # Stamp current migration state
just db-revision     # Create new migration (autogenerate)
just db-bootstrap    # Bootstrap database (runs on app startup)
```

### FastAPI Lifecycle Integration
Database bootstrap now runs automatically on FastAPI startup - no manual intervention required.

## 🧪 Comprehensive Test Coverage (by Forrest Murray)

### Server Unit Tests
- `tests/unit/routers/` - Router tests for databricks, dbsql_export, users, workshops
- `tests/unit/services/` - Service tests for alignment, cohens_kappa, irr, krippendorff_alpha, token_storage

### Client Unit Tests
- Frontend component and hook tests

### E2E Tests with Playwright
```bash
just e2e              # Run all E2E tests (headless)
just e2e headed       # Run with browser visible
just e2e ui           # Run with Playwright UI
```

Test scenarios:
- Rubric creation flow
- Workshop management flow

## 🐛 Binary Judge Evaluation Fix

## 🐛 Bug Fixes

### Binary Judge Returns Wrong Values

**Problem:** When using a binary rubric (expecting 0 or 1 / PASS or FAIL), MLflow was returning `3.0` (Likert-style) instead of binary values. All evaluations were rejected as invalid.

**Root Cause:** 
1. `feedback_value_type=bool` doesn't force models to output boolean values - it only affects parsing
2. Prompt instructions were appended at the end where models pay less attention
3. No fallback handling for when models ignore binary format instructions

**Solution (3 Fixes):**

1. **Strong Binary Prompt Instructions (Prepended)**
   ```python
   # Before: Weak instruction appended at end
   prompt += "Return 1 if meets criteria, 0 if not."
   
   # After: Strong instructions PREPENDED to prompt
   binary_prefix = """## CRITICAL OUTPUT FORMAT REQUIREMENT
   You are a BINARY judge. Output EXACTLY "0" or "1"...
   """
   prompt = binary_prefix + prompt
   ```

2. **Use `float` Instead of `bool`**
   ```python
   # Before (unreliable)
   feedback_type = bool
   
   # After (more reliable)
   feedback_type = float
   ```

3. **Fallback Threshold Conversion**
   ```python
   # If model returns Likert-style (1-5), convert to binary:
   # >= 3 = PASS (1.0)
   # < 3 = FAIL (0.0)
   if 1 <= value <= 5:
       binary_value = 1.0 if value >= 3 else 0.0
   ```

### Database Indentation Error

Fixed `IndentationError` in `server/database.py` that prevented server startup due to mixed 2-space and 4-space indentation.

## ✨ New Features

### MLflow GenAI Claude Skills

Added comprehensive Claude skills for MLflow GenAI in `.cursor/skills/`:

| Skill | Description |
|-------|-------------|
| `mlflow-genai.md` | Core APIs, judge types, model URIs, common issues |
| `mlflow-genai-evaluation.md` | make_judge API, binary/Likert patterns, validation |
| `mlflow-genai-tracing.md` | Autologging, searching traces, OpenTelemetry |

These skills provide context-aware assistance when working with MLflow GenAI evaluation code.

## 📊 Expected Behavior After Upgrade

**Before v1.3.0:**
```
🔍 Raw MLflow response: type=<class 'float'>, value=3.0
ERROR: Invalid binary rating 3.0 - must be 0 or 1, rejecting
Extracted 0/10 evaluations with scores
```

**After v1.3.0:**
```
🔍 Raw MLflow response: type=<class 'float'>, value=3.0
⚠️ FALLBACK: Model returned Likert-style 3.0 - converting to 1.0 using threshold (>=3 = PASS)
Extracted 10/10 evaluations with scores
```

## 🔧 Files Changed

### Database & Migrations
- `migrations/versions/0001_baseline.py` - Initial schema
- `migrations/versions/0002_legacy_schema_fixes.py` - Legacy fixes
- `migrations/versions/0003_judge_schema_updates.py` - Judge schema
- `server/db_bootstrap.py` - Bootstrap module
- `alembic.ini` - Alembic configuration
- `justfile` - Database commands

### Tests
- `tests/unit/routers/*.py` - Router unit tests (4 files)
- `tests/unit/services/*.py` - Service unit tests (6 files)
- `tests/conftest.py` - Test fixtures
- `client/tests/e2e/*.ts` - E2E tests (3 files)

### Bug Fixes
- `server/services/alignment_service.py` - Binary judge fixes
- `server/database.py` - Indentation fix

### Documentation
- `doc/CHANGELOG.md` - Updated changelog
- `.cursor/skills/mlflow-genai*.md` - New skills (3 files)

## 👥 Contributors

- **Forrest Murray** - Database migrations, Alembic setup, test coverage (server + client + E2E)
- **Wenwen Xie** - Binary judge fixes, MLflow GenAI skills

## 📋 Upgrade Instructions

1. Pull the latest changes:
   ```bash
   git pull origin main
   ```

2. Restart the server:
   ```bash
   uv run uvicorn server.app:app --reload --port 8000
   ```

3. Re-run any failed binary judge evaluations - they should now succeed with the fallback conversion.

## 🔗 Related Documentation

- [MLflow GenAI Documentation](https://mlflow.org/docs/latest/genai/)
- [CHANGELOG.md](CHANGELOG.md) - Full version history
