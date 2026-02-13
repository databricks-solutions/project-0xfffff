# Performance Debt

## Overview

The codebase has performance debt primarily in the database layer (missing indexes, N+1 query patterns, no pagination on list endpoints) and in the frontend (inefficient polling without backoff, dead cache code, large JSON columns fetched unnecessarily). While the current scale may tolerate these issues, they will become blockers as workshops grow to hundreds of traces and dozens of concurrent users.

---

## Items

### PERF-1: Missing Database Indexes on Foreign Keys

**Severity**: HIGH
**Location**: `server/database.py:90-407` (model definitions)

**Description**: Frequently filtered/joined columns lack indexes:

| Table | Column(s) | Used in | Current Index |
|-------|-----------|---------|---------------|
| `discovery_findings` | `workshop_id`, `trace_id`, `user_id` | Filter queries in database_service.py | None |
| `annotations` | `workshop_id`, `trace_id`, `user_id` | Filter queries throughout | None |
| `traces` | `workshop_id` | Lines 496, 502, 543, 588, 676, 721 in database_service.py | None |
| `judge_evaluations` | `workshop_id`, `prompt_id`, `trace_id` | Evaluation queries | None |
| `participant_notes` | `workshop_id`, `user_id` | Already indexed (only one) | `ix_participant_notes_workshop_user` |

Only one index exists: `ix_participant_notes_workshop_user` on line 714 of database.py.

**Impact**: Full table scans on every query. For a workshop with 1000 traces and 50 annotations per trace, queries that should be O(log n) are O(n). PostgreSQL partially mitigates this with query planning, but SQLite does not.

**Remediation**: Add composite indexes via Alembic migration:
```python
Index('ix_annotations_workshop_trace', 'workshop_id', 'trace_id')
Index('ix_annotations_workshop_user', 'workshop_id', 'user_id')
Index('ix_traces_workshop', 'workshop_id')
Index('ix_findings_workshop_trace', 'workshop_id', 'trace_id')
Index('ix_evaluations_workshop_prompt', 'workshop_id', 'prompt_id')
```

**Acceptance Criteria**:
- [ ] Indexes added for all frequently filtered foreign keys
- [ ] Alembic migration created (not manual ALTER TABLE)
- [ ] Query performance validated with EXPLAIN on representative data

---

### PERF-2: N+1 Query Patterns in Database Service

**Severity**: HIGH
**Location**: `server/services/database_service.py:217-257`

**Description**: List operations fetch all records then process individually:
```python
db_workshops = query.all()
return [self._workshop_from_db(w) for w in db_workshops]
```

The `get_workshops_for_user()` method (line 237-240) queries all workshop_ids, then makes a second query for full workshop objects. `get_findings_with_user_details()` (lines 897-906) does a JOIN but still loads all columns for both tables regardless of what's needed.

**Impact**: For a user in 20 workshops, each with 100 traces, this can generate hundreds of database round trips per request.

**Remediation**:
- Use SQLAlchemy `joinedload()` or `selectinload()` for eager loading relationships
- Combine multi-step queries into single statements
- Use `load_only()` to select specific columns

**Acceptance Criteria**:
- [ ] No queries inside loops (verified by code review)
- [ ] Relationship loading strategy documented per query
- [ ] Response times validated under load (50+ workshops)

---

### PERF-3: No Pagination on List Endpoints

**Severity**: HIGH
**Location**: `server/routers/workshops.py:229-252` and others

**Description**: List endpoints return entire result sets with no limit:
```python
@router.get("/")
async def list_workshops(...) -> List[Workshop]:
    return db_service.get_workshops_for_user(user_id)  # No limit
```

Affected endpoints:
- `list_workshops()` - all workshops
- `get_discovery_findings()` - all findings
- `get_participant_notes()` - all notes
- `get_all_annotations()` - all annotations

**Impact**: With 1000+ workshops or traces, response payloads become megabytes, causing timeouts and high memory usage.

**Remediation**: Add `skip` and `limit` query parameters:
```python
@router.get("/")
async def list_workshops(skip: int = 0, limit: int = 50, ...) -> List[Workshop]:
    return db_service.get_workshops_for_user(user_id, skip=skip, limit=limit)
```

**Acceptance Criteria**:
- [ ] All list endpoints support `skip` and `limit` parameters
- [ ] Default limit of 50, maximum limit of 200
- [ ] Response includes total count for pagination UI

---

### PERF-4: Frontend Polling Without Exponential Backoff

**Severity**: MEDIUM
**Location**:
- `client/src/components/IntakeWaitingView.tsx:43` - Fixed 5-second interval
- `client/src/pages/JudgeTuningPage.tsx:1142, 1152` - Fixed 2s/5s intervals
- `client/src/pages/AnnotationDemo.tsx` - Various fixed intervals

**Description**:
```typescript
const interval = setInterval(loadStatus, 5000);  // Fixed forever
```

Polling runs at fixed intervals regardless of:
- Whether status has changed
- How many users are polling simultaneously
- Server load

With 100 users in intake phase = 1200 requests/minute to the same endpoint.

**Impact**: Unnecessary server load, wasted bandwidth, poor mobile experience.

**Remediation**: Implement exponential backoff in the shared `usePolling` hook (see CQ-7):
- Start at 2s, increase to 30s if no change
- Stop polling when terminal state reached
- Use `ETag` or `If-Modified-Since` for conditional requests

**Acceptance Criteria**:
- [ ] All polling uses exponential backoff
- [ ] Terminal states stop polling
- [ ] Server load tested with 50+ concurrent users

---

### PERF-5: Dead Cache Code (Per-Request Instance)

**Severity**: MEDIUM
**Location**: `server/services/database_service.py:113-139`

**Description**:
```python
def __init__(self, db: Session):
    self.db = db
    self._cache = {}
    self._cache_ttl = 30  # 30 seconds
```

`DatabaseService` is instantiated per-request (line 245 in workshops.py: `db_service = DatabaseService(db)`). The cache is created and destroyed with each request, so the 30-second TTL is never utilized.

**Impact**: Dead code that provides false sense of caching. Adds complexity without benefit.

**Remediation**: Either:
1. Remove the dead cache code entirely, OR
2. Implement module-level cache (e.g., `functools.lru_cache` or Redis) that persists across requests

**Acceptance Criteria**:
- [ ] Cache either works correctly or is removed
- [ ] If kept, validated that cache hits occur in practice

---

### PERF-6: Large JSON Columns Fetched Unnecessarily

**Severity**: MEDIUM
**Location**: `server/database.py:127, 147, 150-151, 199-200`

**Description**:
```python
assigned_traces = Column(JSON, default=list)           # Line 127 - per-user trace list
active_discovery_trace_ids = Column(JSON, default=list) # Line 150 - could be thousands
active_annotation_trace_ids = Column(JSON, default=list) # Line 151 - could be thousands
context = Column(JSON, nullable=True)                   # Line 199 - full trace context
trace_metadata = Column(JSON, nullable=True)            # Line 200 - arbitrary metadata
```

These columns are always loaded even when only the workshop name or trace ID is needed. For a workshop with 5000 traces, `active_annotation_trace_ids` alone could be 100KB.

**Impact**: Excessive memory usage and network transfer for simple queries.

**Remediation**:
- Use `load_only()` in queries that don't need JSON columns
- Consider moving trace ID lists to junction tables
- For PostgreSQL: use `jsonb` with partial indexes

**Acceptance Criteria**:
- [ ] List/summary endpoints don't load JSON columns
- [ ] Detail endpoints load JSON columns selectively

---

### PERF-7: Blocking `time.sleep()` in Async Context

**Severity**: MEDIUM
**Location**: `server/routers/workshops.py:170-201`

**Description**:
```python
def _retry_db_operations(operations_fn, db_session, max_retries=5, base_delay=0.5):
    for attempt in range(max_retries):
        try:
            return operations_fn()
        except OperationalError as e:
            time.sleep(delay)  # Blocks the event loop
```

`time.sleep()` blocks the async event loop. During retries (up to 5 with exponential backoff), no other requests can be processed on that worker.

**Impact**: Under high concurrency with database contention, this can cascade into thread pool exhaustion.

**Remediation**: Use `asyncio.sleep()` in an async function, or run the synchronous retry in a thread pool:
```python
await asyncio.sleep(delay)
```

**Acceptance Criteria**:
- [ ] Zero `time.sleep()` calls in async code paths
- [ ] Retry logic uses `asyncio.sleep()` or runs in executor

---

### PERF-8: Production Bundle Includes Console Statements

**Severity**: LOW
**Location**: `client/vite.config.ts:67-69`

**Description**:
```typescript
terserOptions: {
  compress: {
    drop_console: false,  // TODO: Re-enable for production
  },
},
```

All `console.log`, `console.error`, `console.warn` from both application code and dependencies are included in the production bundle.

**Impact**: ~5-10KB unnecessary bundle size, minor runtime overhead from string formatting.

**Remediation**: Set `drop_console: true`. Replace needed error reporting with a dedicated service.

**Acceptance Criteria**:
- [ ] `drop_console: true` in vite.config.ts
- [ ] No runtime errors after enabling (replace needed console calls first)

---

### PERF-9: No Request Timeout for Heavy Operations

**Severity**: LOW
**Location**: `server/config.py:16, 48`

**Description**: No per-request timeout configured. Long-running operations (large trace ingestion, evaluation jobs) can hold connections open indefinitely.

```python
KEEP_ALIVE_TIMEOUT: int = int(os.getenv('KEEP_ALIVE_TIMEOUT', '65'))
'timeout_graceful_shutdown': 30,
# No request-level timeout
```

**Impact**: Resource exhaustion under high load or with large uploads.

**Remediation**: Add request timeout middleware or per-endpoint timeouts for heavy operations.

**Acceptance Criteria**:
- [ ] Default request timeout of 60 seconds
- [ ] Long-running operations use background tasks instead
- [ ] Timeout configurable via environment variable

---

## Prioritized Backlog

| Priority | ID | Title | Effort | Impact |
|----------|-----|-------|--------|--------|
| P1 | PERF-1 | Add database indexes for foreign keys | M | High - immediate query speedup |
| P1 | PERF-3 | Add pagination to list endpoints | M | High - prevents timeouts at scale |
| P1 | PERF-2 | Fix N+1 query patterns | M | High - reduces DB round trips |
| P2 | PERF-4 | Implement exponential backoff in polling | M | Medium - reduces server load |
| P2 | PERF-5 | Fix or remove dead cache code | S | Medium - removes dead code |
| P2 | PERF-7 | Replace time.sleep with asyncio.sleep | S | Medium - unblocks event loop |
| P2 | PERF-6 | Selective column loading for JSON | M | Medium - reduces memory/bandwidth |
| P3 | PERF-8 | Enable drop_console in Vite build | S | Low - bundle size |
| P3 | PERF-9 | Add request timeout middleware | S | Low - resource protection |

**Effort**: S = < 2 hours, M = 2-8 hours, L = 1-3 days
