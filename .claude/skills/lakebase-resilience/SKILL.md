---
name: lakebase-resilience
description: "Lakebase (serverless PostgreSQL) connection resilience patterns. Use when (1) debugging connection errors like 'Invalid authorization', 'connection is closed', or 'server closed the connection unexpectedly', (2) fixing OAuth token expiry issues, (3) improving database retry logic, (4) troubleshooting SQLite bootstrap failures, (5) working on db_config.py, database.py, or app.py lifespan. Covers: token rotation, connection pooling, retry logic, error middleware, and startup bootstrap."
---

# Lakebase (Serverless PostgreSQL) Resilience

## Architecture Overview

Databricks Lakebase is a serverless PostgreSQL service that:
- Drops idle connections randomly (~1h)
- Requires OAuth tokens for authentication (tokens expire ~1h)
- Cold-starts on first connection after idle period

The codebase has a **three-layer defense** against these behaviors.

## Key Files

| File | Responsibility |
|------|---------------|
| `server/db_config.py` | Engine creation, OAuth token manager, `creator` callable |
| `server/database.py` | `get_db()` dependency with retry, `_is_connection_error()`, error markers |
| `server/app.py` | `DatabaseErrorMiddleware` (503 safety net), lifespan table creation |
| `server/db_bootstrap.py` | Alembic bootstrap on startup (SQLite + PostgreSQL) |

## Layer 1: Connection Pool (`db_config.py`)

### OAuth Token Refresh via `creator` Callable

The OAuth token MUST be fetched at **connection time**, not engine creation time. Use SQLAlchemy's `creator` parameter:

```python
def _create_pg_connection():
    import psycopg
    token = token_manager.get_token()  # Fresh token every connection
    return psycopg.connect(
        host=config.host, port=config.port,
        dbname=config.database, user=config.user,
        password=token, sslmode=config.sslmode,
        options=f"-csearch_path={schema_name},public",
        application_name=config.app_name,
    )

engine = create_engine(
    "postgresql+psycopg://",  # Placeholder — creator overrides
    creator=_create_pg_connection,
    pool_pre_ping=True,
    pool_recycle=300,  # 5 min — serverless PG drops idle connections
    pool_size=5, max_overflow=10,
)
```

### CRITICAL: Never Bake Tokens into URLs

```python
# BAD — token expires, all new connections fail
url = f"postgresql+psycopg://{user}:{token}@{host}/{db}"
engine = create_engine(url)

# GOOD — fresh token on every new connection
engine = create_engine("postgresql+psycopg://", creator=_create_pg_connection)
```

### OAuthTokenManager

- Located in `db_config.py`
- `get_token()`: Returns cached token or refreshes via `WorkspaceClient().config.oauth_token()`
- `force_refresh()`: Resets timer so next `get_token()` call fetches fresh
- Default refresh interval: 15 minutes
- Falls back to stale token if refresh fails (better than no token)

## Layer 2: Retry in `get_db()` (`database.py`)

### Two-Phase Generator Pattern

FastAPI dependency generators must yield exactly once. Retries go in Phase 1 only:

```python
def get_db():
    max_attempts = 3
    db = None

    # Phase 1: Connection establishment WITH retries
    for attempt in range(max_attempts):
        try:
            db = SessionLocal()
            if DATABASE_BACKEND == DatabaseBackend.POSTGRESQL:
                db.execute(text("SELECT 1"))  # Verify connectivity
            break
        except Exception as e:
            if db: db.close(); db = None
            if _is_connection_error(e) and attempt < max_attempts - 1:
                _reset_connection_pool()  # Disposes pool + refreshes token
                time.sleep(0.5 * (attempt + 1))
                continue
            raise

    # Phase 2: Yield session (NO retry — mid-request errors go to middleware)
    try:
        yield db
    finally:
        if db: db.close()
```

### CRITICAL: Never Retry After Yield

```python
# BAD — causes "generator didn't stop after throw()"
for attempt in range(3):
    try:
        yield db      # If error thrown here...
    except:
        continue      # ...this tries to yield again = crash

# GOOD — separate phases
for attempt in range(3):
    try:
        db = SessionLocal()
        break
    except:
        continue
yield db  # Single yield, no retry
```

### Connection Error Detection

`_is_connection_error()` checks:
1. `isinstance(exc, (DisconnectionError, OperationalError))` — catches most SQLAlchemy errors
2. String matching against `_PG_CONNECTION_ERRORS` tuple — catches edge cases

Error markers to maintain in `_PG_CONNECTION_ERRORS`:
- `"connection is closed"` — stale pooled connection
- `"server closed the connection unexpectedly"` — idle timeout
- `"invalid authorization"` — expired OAuth token
- `"connection refused"` / `"connection timed out"` — cold start
- `"database is locked"` — SQLite concurrency

## Layer 3: Middleware Safety Net (`app.py`)

`DatabaseErrorMiddleware` catches transient errors that escape Layer 2 (mid-request failures) and returns 503:

```python
class DatabaseErrorMiddleware(BaseHTTPMiddleware):
    _TRANSIENT_MARKERS = (
        "database is locked",
        "connection refused", "connection reset",
        "server closed the connection",
        "invalid authorization",
        "connection is closed",
        # ... etc
    )
```

Keep `_TRANSIENT_MARKERS` in sync with `_PG_CONNECTION_ERRORS` in `database.py`.

## Startup Bootstrap (`app.py` lifespan + `db_bootstrap.py`)

### Table Creation Safety Net

Always call `Base.metadata.create_all()` in the lifespan as a fallback:

```python
# In lifespan, after maybe_bootstrap_db_on_startup():
Base.metadata.create_all(bind=engine, checkfirst=True)
```

This handles:
- SQLite `.db` file exists but is empty (created by first connection)
- Alembic bootstrap failed or was skipped
- Works for both SQLite and PostgreSQL (`checkfirst=True` is a no-op if tables exist)

### SQLite Bootstrap Edge Case

`_bootstrap_if_missing_sqlite` must check for **tables**, not just file existence:

```python
# BAD — SQLite creates empty file on first connection
if Path(db_path).exists():
    return  # Skips bootstrap even with zero tables!

# GOOD — check for actual tables
if Path(db_path).exists():
    tables = _list_sqlite_tables(db_path)
    if [t for t in tables if not t.startswith("sqlite_")]:
        return  # Has real tables
```

## Debugging Checklist

When you see connection errors in production logs:

1. **"Invalid authorization"** → Token expired. Verify `creator` callable is used (not URL-baked token). Check `OAuthTokenManager.get_token()` logs.
2. **"connection is closed" / "server closed the connection"** → Idle timeout. Verify `pool_recycle=300` and `pool_pre_ping=True`.
3. **"generator didn't stop after throw()"** → Retry loop wraps `yield`. Fix: two-phase `get_db()` pattern.
4. **"no such table"** on SQLite → Empty `.db` file. Fix: `Base.metadata.create_all()` safety net in lifespan.
5. **503 storms on login page** → Frontend polling without auth gate. Check `WorkflowContext` auth guards.

## Testing

```bash
just test-server  # Runs all 306+ unit tests including db_config tests
```

Key test file: `tests/unit/test_db_config.py` — covers detection logic (33+ tests).

When modifying resilience code, verify:
- `_is_connection_error()` correctly classifies new error strings
- `get_db()` retry loop doesn't wrap `yield`
- `DatabaseErrorMiddleware._TRANSIENT_MARKERS` stays in sync with `_PG_CONNECTION_ERRORS`
