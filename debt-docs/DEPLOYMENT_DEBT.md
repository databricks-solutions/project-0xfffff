# Deployment Debt

## Overview

The deployment infrastructure has critical gaps in environment configuration validation, health checks, and operational observability. The application can silently fall back to SQLite when PostgreSQL is expected, health endpoints always report healthy even when the database is broken, and there is no structured logging for production troubleshooting. Worker and connection pool configurations are inconsistent between backends.

---

## Items

### DEPLOY-1: Missing Environment Configuration Validation

**Severity**: CRITICAL
**Location**:
- `server/db_config.py:54-73, 138-160`
- `server/app.py` (startup)

**Description**:
```python
def from_env(cls) -> LakebaseConfig | None:
    host = os.getenv("PGHOST")
    database = os.getenv("PGDATABASE")
    user = os.getenv("PGUSER")
    if not all([host, database, user]):
        return None  # Silently returns None - falls back to SQLite
```

When `DATABASE_ENV=postgres` is set but required PostgreSQL variables (`PGHOST`, `PGDATABASE`, `PGUSER`) are missing:
1. Falls back to SQLite **silently** (line 159)
2. No warning about the mismatch
3. Data written to ephemeral SQLite is lost on restart
4. Token refresh errors are warned but non-fatal (line 112)

**Impact**: Production deployment can silently use wrong database. Data loss when container restarts.

**Remediation**: Fail fast if `DATABASE_ENV=postgres` but PostgreSQL config is incomplete:
```python
if os.getenv("DATABASE_ENV") == "postgres":
    config = LakebaseConfig.from_env()
    if config is None:
        raise RuntimeError("DATABASE_ENV=postgres but PGHOST/PGDATABASE/PGUSER not set")
```

**Acceptance Criteria**:
- [ ] App fails to start if DATABASE_ENV doesn't match available config
- [ ] All required env vars validated on startup
- [ ] Startup log clearly states which backend is active

---

### DEPLOY-2: CORS Allows All Origins in Production

**Severity**: CRITICAL
**Location**: `server/config.py:24`, `server/app.py:201-207`

**Description**: See SEC-2 in SECURITY_DEBT.md. Listed here as well because this is a deployment configuration issue.

```python
CORS_ORIGINS: list = ['*']  # Default allows all origins
```

**Impact**: Security vulnerability in production. See SEC-2 for details.

**Remediation**: Read CORS_ORIGINS from environment variable. Default to localhost for development.

**Acceptance Criteria**:
- [ ] CORS_ORIGINS configurable via environment variable
- [ ] Production deployment sets specific origins

---

### DEPLOY-3: Health Check Always Returns Healthy

**Severity**: HIGH
**Location**: `server/app.py:212-251`

**Description**:
```python
@app.get("/health")
async def health():
    return {"status": "healthy"}  # Always 200, even if DB is down

@app.get("/health/detailed")
async def detailed_health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    # Doesn't check:
    # - Database migrations are current
    # - Required tables exist
    # - Configuration is valid
    # - Encryption key is set
```

The basic health endpoint always returns 200. The detailed health only checks `SELECT 1` but not whether the schema is initialized or migrations applied.

**Impact**: Load balancer routes traffic to containers that can't serve requests. App appears healthy but returns 500s on every real request.

**Remediation**: Make `/health` check database connectivity and required tables:
```python
@app.get("/health")
async def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unhealthy"})
```

Add a readiness probe that validates full initialization.

**Acceptance Criteria**:
- [ ] `/health` returns 503 if database is unreachable
- [ ] `/health/detailed` checks table existence and migration status
- [ ] Startup readiness probe validates full initialization

---

### DEPLOY-4: Worker Count Inconsistency

**Severity**: HIGH
**Location**:
- `server/config.py:12` - `WORKERS: int = int(os.getenv('WORKERS', '4'))`
- `app.yaml:5` - `gunicorn server.app:app -w 2`

**Description**: `config.py` defaults to 4 workers but `app.yaml` starts gunicorn with 2. The config.py value is unused when running via gunicorn (which has its own `-w` flag).

**Impact**: Confusion about actual worker count. If the app auto-scales or is started via config.py's uvicorn path, it uses 4 workers which may exceed container resources.

**Remediation**: Align worker configuration. Use a single source of truth:
```yaml
# app.yaml
command: gunicorn server.app:app -w ${WORKERS:-2} --worker-class uvicorn.workers.UvicornWorker
```

**Acceptance Criteria**:
- [ ] Single source of truth for worker count
- [ ] Worker count matches container CPU allocation
- [ ] config.py WORKERS value used or removed

---

### DEPLOY-5: Database Pool Size Inconsistency

**Severity**: HIGH
**Location**: `server/db_config.py:215-223` (SQLite) vs `server/db_config.py:255-267` (PostgreSQL)

**Description**:
```python
# SQLite
pool_size=20, max_overflow=30, pool_recycle=3600  # 1 hour

# PostgreSQL
pool_size=5, max_overflow=10, pool_recycle=300    # 5 minutes
```

SQLite gets 4x the pool size of PostgreSQL, which is backwards. SQLite has file-level locking and benefits less from large pools. PostgreSQL (especially serverless Lakebase) has connection limits.

**Impact**: SQLite: wasted resources. PostgreSQL: potential connection exhaustion if pool is too small under load.

**Remediation**: Tune pool sizes based on backend characteristics and worker count:
- SQLite: `pool_size=5, max_overflow=10` (file-locked, less concurrency)
- PostgreSQL: `pool_size=10, max_overflow=5` (per worker, with connection limits)
- Make configurable via environment variables

**Acceptance Criteria**:
- [ ] Pool sizes appropriate for each backend
- [ ] Configurable via environment variables
- [ ] Documented rationale for default values

---

### DEPLOY-6: Migration Strategy Has No Rollback Support

**Severity**: HIGH
**Location**: `migrations/versions/` (all files), `server/database.py:589-734`

**Description**:
1. Migration files may lack complete `downgrade()` implementations
2. No documented rollback procedure
3. Schema changes in `_apply_schema_updates()` use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS` which bypass Alembic entirely
4. No pre-deployment backup strategy documented

**Impact**: Failed deployments cannot be rolled back. Schema changes outside Alembic create version drift.

**Remediation**:
1. Audit all migration files for complete `downgrade()` functions
2. Move all manual schema updates from `_apply_schema_updates()` into proper Alembic migrations
3. Document rollback procedure
4. Add pre-deployment backup requirement

**Acceptance Criteria**:
- [ ] All migrations have tested `downgrade()` functions
- [ ] Zero manual schema updates outside Alembic
- [ ] Rollback procedure documented in deployment guide
- [ ] Pre-deployment backup automated

---

### DEPLOY-7: No Structured Logging

**Severity**: MEDIUM
**Location**: Throughout `server/` (mix of `print()` and `logging.getLogger()`)

**Description**: Logs are free-form strings with no structured format:
```python
logger.warning("Database connection failed (attempt %d/%d), ...", attempt + 1, max_retries, ...)
```

No JSON logging, no request correlation IDs, no structured fields for filtering.

**Impact**: Cannot query logs for specific errors, set up alerts, or track error patterns across deployments.

**Remediation**: Implement structured JSON logging:
```python
import structlog
logger = structlog.get_logger()
logger.warning("db_connection_failed", attempt=attempt, max_retries=max_retries, error=str(e))
```

**Acceptance Criteria**:
- [ ] All logging in JSON format
- [ ] Request ID propagated through all log messages
- [ ] Log levels consistent (DEBUG for verbose, INFO for operations, WARNING for recoverable, ERROR for failures)

---

### DEPLOY-8: Build Process Missing Security and Quality Checks

**Severity**: MEDIUM
**Location**: `justfile:240-257` (ui-build recipe)

**Description**: Frontend build does not include:
- `npm audit` for vulnerability checking
- `knip` for dead code detection (installed but never run)
- Bundle size validation
- License compliance check

```bash
# justfile ui-build
npm -C {{client-dir}} install
npm -C {{client-dir}} run build
# No audit, no knip, no size check
```

**Impact**: Known vulnerabilities ship to production. Unused code bloats bundle.

**Remediation**: Add checks to build pipeline:
```bash
npm -C client audit --audit-level=moderate
npx -C client knip
# Bundle size check against budget
```

**Acceptance Criteria**:
- [ ] `npm audit` runs in CI
- [ ] `knip` runs in CI (or as justfile command)
- [ ] Bundle size budget documented and enforced

---

### DEPLOY-9: Database Backup Strategy Gaps

**Severity**: MEDIUM
**Location**: `app.yaml:14-38`

**Description**: SQLite rescue backup is optional and commented out:
```yaml
# env:
#   - name: SQLITE_VOLUME_PATH
#     valueFrom: db_backup_volume
```

When using PostgreSQL (Lakebase): no backup configuration at all. Relies entirely on Databricks infrastructure backups.

**Impact**: SQLite data loss if rescue not configured. PostgreSQL recovery depends on Databricks SLA.

**Remediation**:
1. Make SQLite backup mandatory when using SQLite backend
2. Document PostgreSQL backup options
3. Add pre-deployment backup job for major migrations

**Acceptance Criteria**:
- [ ] SQLite backup enabled by default (warn if not configured)
- [ ] PostgreSQL backup strategy documented
- [ ] Pre-migration backup procedure documented

---

### DEPLOY-10: No API Versioning

**Severity**: MEDIUM
**Location**: `server/app.py:189-193`

**Description**:
```python
app = FastAPI(
    title="Databricks App API",
    version="0.1.0",  # Hardcoded, never updated
)
```

Version is hardcoded and never incremented. No way to determine which version is deployed.

**Impact**: Cannot correlate issues to specific deployments. No API versioning for backward compatibility.

**Remediation**: Read version from `pyproject.toml` or git tag:
```python
from importlib.metadata import version
app_version = version("human-eval-workshop")
```

Add `/version` endpoint returning version and git commit.

**Acceptance Criteria**:
- [ ] Version read from pyproject.toml
- [ ] `/version` endpoint returns version and build info
- [ ] Version auto-incremented on release

---

### DEPLOY-11: No API Rate Limiting

**Severity**: LOW
**Location**: `server/app.py:196-207` (middleware configuration)

**Description**: No rate limiting middleware. Users can send unlimited requests.

**Impact**: Potential for abuse, resource exhaustion, accidental DDoS from polling bugs.

**Remediation**: Add `slowapi` middleware with per-user and per-IP limits.

**Acceptance Criteria**:
- [ ] Rate limiting configured (e.g., 100 req/min per user)
- [ ] Limits configurable via environment
- [ ] 429 responses include `Retry-After` header

---

### DEPLOY-12: No Request Timeout Configuration

**Severity**: LOW
**Location**: `server/config.py:16, 48`

**Description**: No per-request timeout. Long operations hold connections indefinitely. See PERF-9 for details.

**Acceptance Criteria**:
- [ ] Default request timeout configured
- [ ] Long operations use background tasks

---

### DEPLOY-13: CI Pipeline Missing Caching

**Severity**: LOW
**Location**: `.github/workflows/e2e-test.yml`

**Description**: CI workflow installs all dependencies from scratch on every run. No caching for:
- Python packages (`uv` cache)
- Node modules
- Playwright browsers

**Impact**: Slow CI pipeline, wasted compute.

**Remediation**: Add caching steps to CI workflow.

**Acceptance Criteria**:
- [ ] Python package cache across runs
- [ ] Node modules cache across runs
- [ ] Playwright browser cache across runs

---

## Prioritized Backlog

| Priority | ID | Title | Effort | Impact |
|----------|-----|-------|--------|--------|
| P0 | DEPLOY-1 | Validate env config on startup | S | Critical - prevents silent wrong backend |
| P0 | DEPLOY-2 | Fix CORS for production | S | Critical - security (see SEC-2) |
| P1 | DEPLOY-3 | Fix health checks to validate DB | M | High - prevents bad routing |
| P1 | DEPLOY-4 | Align worker count configuration | S | High - prevents resource mismatch |
| P1 | DEPLOY-5 | Fix pool size per backend | S | High - prevents connection issues |
| P1 | DEPLOY-6 | Audit and fix migration rollback | M | High - deployment safety |
| P2 | DEPLOY-7 | Implement structured logging | M | Medium - observability |
| P2 | DEPLOY-8 | Add security/quality checks to build | M | Medium - vulnerability prevention |
| P2 | DEPLOY-9 | Document backup strategy | S | Medium - data safety |
| P2 | DEPLOY-10 | Add API versioning | S | Medium - operational visibility |
| P3 | DEPLOY-11 | Add rate limiting | M | Low - abuse prevention |
| P3 | DEPLOY-12 | Add request timeout | S | Low - resource protection |
| P3 | DEPLOY-13 | Add CI caching | S | Low - faster pipelines |

**Effort**: S = < 2 hours, M = 2-8 hours, L = 1-3 days
