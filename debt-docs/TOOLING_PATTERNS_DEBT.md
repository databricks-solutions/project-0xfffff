# Tooling & Pattern Misuse Debt

## Overview

The codebase adopts strong libraries (TanStack Query, FastAPI, SQLAlchemy, Alembic, Pydantic, Radix UI) but consistently underutilizes or misuses their core value propositions. The most impactful pattern: the app has a generated OpenAPI client that is almost entirely bypassed — 70+ direct `fetch()` calls exist alongside generated service methods, with duplicate type definitions in 3 separate locations. Similarly, TanStack Query is installed and partially used but many components still use manual `useEffect`+`useState`+`setInterval` patterns. On the backend, Alembic manages migrations but 15+ schema changes happen at runtime via raw SQL, creating untracked drift. These aren't missing features — they're adopted tools whose contracts are being violated.

---

## Items

### TP-1: Generated OpenAPI Client Largely Bypassed

**Severity**: CRITICAL
**Location**:
- `client/src/client/services/` — generated client (6 service classes)
- `client/src/pages/JudgeTuningPage.tsx` — 15+ direct `fetch()` calls
- `client/src/hooks/useDatabricksApi.ts` — 7 direct `fetch()` calls
- `client/src/pages/IntakePage.tsx` — 7 direct `fetch()` calls
- `client/src/components/FacilitatorDashboard.tsx` — 4 direct `fetch()` calls
- `client/src/context/UserContext.tsx:202` — manual `fetch('/users/auth/login')`
- `client/src/context/WorkflowContext.tsx:45` — manual `fetch()`

**Description**: The project generates a TypeScript API client from the OpenAPI spec (`/* generated using openapi-typescript-codegen -- do not edit */`), but **70+ endpoints are called via raw `fetch()`** instead of the generated service methods. Only a handful of call sites use `UsersService` or `WorkshopsService`.

The generated client exists to provide:
- Type-safe request/response handling
- Automatic base URL management
- Centralized auth header injection
- Request cancellation
- OpenAPI contract enforcement

All of these benefits are lost when `fetch()` is used directly.

**Impact**: No compile-time type checking on API calls. URL typos caught at runtime only. Auth headers duplicated manually. When backend endpoints change, broken `fetch()` calls are invisible until users hit them.

**Remediation**: Replace all direct `fetch()` calls with generated client service methods. If the generated client is missing endpoints (because the backend lacks `response_model`), fix the backend first (see TP-7), then regenerate.

**Acceptance Criteria**:
- [ ] Zero direct `fetch()` calls to backend API in application code
- [ ] All API calls go through generated client services
- [ ] Generated client regenerated from complete OpenAPI spec

---

### TP-2: Frontend Type Definitions Triplicated

**Severity**: HIGH
**Location**:
- `client/src/client/models/` — generated TypeScript types (53 model files)
- `client/src/context/UserContext.tsx:5-27` — manual `User` interface
- `client/src/components/AnnotationAssignmentManager.tsx:22-46` — manual `User`, `WorkshopParticipant`, `Trace` interfaces
- Various page components with inline type definitions

**Description**: Types are defined in three places that can drift:
1. **Backend Pydantic models** (`server/models.py`) — source of truth
2. **Generated TypeScript client** (`client/src/client/models/`) — derived from OpenAPI spec
3. **Manual frontend interfaces** — in context providers and components

The `User` type in `UserContext.tsx` defines `role: 'facilitator' | 'sme' | 'participant'` while the generated client type may differ. `AnnotationAssignmentManager` defines its own `User`, `WorkshopParticipant`, and `Trace` types instead of importing from the generated client.

**Impact**: Type drift between frontend and backend. Changes to Pydantic models don't propagate to manual interfaces. False type safety — code compiles but the contract is wrong.

**Remediation**: Delete all manual type definitions. Import exclusively from `@/client/models`. If the generated types are incomplete, fix the backend `response_model` declarations and regenerate.

**Acceptance Criteria**:
- [ ] Zero manual interface definitions that duplicate generated types
- [ ] All components import types from `@/client/models`
- [ ] Single source of truth: Pydantic model → OpenAPI spec → generated TypeScript

---

### TP-3: TanStack Query Partially Adopted — Manual Patterns Persist

**Severity**: HIGH
**Location**:
- `client/src/hooks/useWorkshopApi.ts` — 50+ hooks (good usage)
- `client/src/components/IntakeWaitingView.tsx:19-45` — manual `useState`/`useEffect`/`setInterval`
- `client/src/components/ProductionLogin.tsx:17-70` — manual `useState`/`fetch` with retry
- `client/src/components/RubricSuggestionPanel.tsx:54-77` — manual `useState`/`fetch`
- `client/src/pages/JudgeTuningPage.tsx:62-120` — 49 `useState` hooks for data that should be query state

**Description**: `useWorkshopApi.ts` has 50+ well-structured TanStack Query hooks. But several components bypass these entirely and use the pre-TanStack pattern:

```typescript
// IntakeWaitingView.tsx — SHOULD use useQuery with refetchInterval
const [status, setStatus] = useState(null);
const [isLoading, setIsLoading] = useState(true);
useEffect(() => {
  const loadStatus = async () => { /* manual fetch */ };
  const interval = setInterval(loadStatus, 5000); // manual polling
  return () => clearInterval(interval);
}, []);
```

TanStack Query provides `refetchInterval`, automatic loading/error states, caching, and deduplication — all reimplemented manually in these components.

**Specific bypasses**:
- **IntakeWaitingView**: Manual `setInterval` polling → should use `refetchInterval: 5000`
- **ProductionLogin**: Manual fetch with retry → should use `useQuery` with `retry: 3`
- **JudgeTuningPage**: 49 `useState` hooks managing server state → should be `useQuery`/`useMutation`
- **RubricSuggestionPanel**: Duplicates logic from `useGenerateRubricSuggestions` hook

**Impact**: Inconsistent loading/error handling. No request deduplication. No cache sharing between components. Polling doesn't respect window focus. Components have 3x the state management code they need.

**Remediation**: Migrate remaining manual patterns to existing TanStack Query hooks. For JudgeTuningPage, create dedicated hooks for evaluation state.

**Acceptance Criteria**:
- [ ] Zero `useEffect`+`fetch` patterns for server data
- [ ] Zero `setInterval` polling — all use `refetchInterval`
- [ ] All server state managed through `useQuery`/`useMutation`

---

### TP-4: TanStack Query Misconfigured — staleTime: 0 Causes Over-fetching

**Severity**: HIGH
**Location**:
- `client/src/main.tsx:7-17` — QueryClient defaults
- `client/src/App.tsx:12` — duplicate QueryClient instance
- `client/src/context/WorkshopContext.tsx:95,108,127,168` — aggressive `queryClient.clear()`

**Description**: The QueryClient is configured with `staleTime: 0` and `refetchOnMount: true`, meaning every component mount triggers a refetch. Comments in the code reveal this has already caused problems:

```typescript
// useWorkshopApi.ts — "was 10s — too aggressive for Databricks Apps"
// useAllParticipantNotes — "was 5s, too aggressive for Databricks Apps"
// WorkshopContext — "stale workshopId causes polling on login page, hammering the backend with 503 storms"
```

Additionally:
- **Two QueryClient instances**: `main.tsx` creates one with custom defaults; `App.tsx` creates another with defaults (which one wins depends on component tree)
- **`queryClient.clear()` called 4 times**: In `WorkshopContext.tsx`, any workshop ID change clears the *entire* cache, triggering re-fetches of everything
- **Inconsistent staleTime**: Some hooks set it (10s-30s), most don't (inheriting 0)
- **Inconsistent refetchOnWindowFocus**: Some enable it, some disable it "to prevent Chrome hangs"

**Impact**: Backend receives 3-5x more requests than necessary. Users experience unnecessary loading spinners. Chrome tab hangs reported. 503 error storms traced to polling.

**Remediation**:
1. Remove duplicate QueryClient — keep one with sensible defaults (`staleTime: 30_000`)
2. Replace `queryClient.clear()` with targeted `invalidateQueries({ queryKey: [...] })`
3. Set consistent staleTime/refetchOnWindowFocus across all hooks
4. Use query key factory consistently for invalidation

**Acceptance Criteria**:
- [ ] Single QueryClient instance with documented defaults
- [ ] Zero `queryClient.clear()` calls — use targeted invalidation
- [ ] Consistent staleTime across similar query types
- [ ] No comments about "too aggressive" polling

---

### TP-5: Alembic Migrations Bypassed by Runtime Schema Updates

**Severity**: CRITICAL
**Location**:
- `server/database.py:589-734` — `_apply_schema_updates()` function
- `server/database.py:651-673` — runtime unique index creation
- `server/database.py:689-713` — runtime `CREATE TABLE IF NOT EXISTS`
- `server/app.py:68` — calls `maybe_bootstrap_db_on_startup()`

**Description**: Alembic manages migrations in `migrations/versions/`, but `_apply_schema_updates()` runs raw SQL at application startup that adds columns, creates tables, and builds indexes — all outside Alembic's tracking:

```python
# database.py:603 — Column added at runtime, not in any migration
conn.execute(text("ALTER TABLE judge_prompts ADD COLUMN IF NOT EXISTS model_name VARCHAR DEFAULT 'demo'"))

# database.py:618 — Another runtime column
conn.execute(text('ALTER TABLE annotations ADD COLUMN IF NOT EXISTS ratings JSON'))

# database.py:689-713 — Entire table created at runtime
conn.execute(text('CREATE TABLE IF NOT EXISTS participant_notes (...)'))

# database.py:651-653 — Unique indexes at runtime
conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_findings_unique ...'))
```

**Runtime changes not tracked by Alembic**:
- `judge_prompts.model_name`, `judge_prompts.model_parameters`
- `annotations.ratings`
- `traces.include_in_alignment`, `traces.sme_feedback`
- `participant_notes` table
- 3 unique indexes on `discovery_findings`, `annotations`, `judge_evaluations`

Migration `0010_add_participant_notes.py` later creates the same table that `_apply_schema_updates()` already creates — redundant and potentially conflicting.

**Impact**: `alembic heads` doesn't reflect actual schema. Rollbacks impossible for runtime changes. Multiple workers running startup simultaneously can race on schema changes. Schema drift between environments.

**Remediation**: Move all `_apply_schema_updates()` logic into proper Alembic migrations. Remove the runtime function. Use `alembic revision --autogenerate` to detect drift.

**Acceptance Criteria**:
- [ ] `_apply_schema_updates()` removed or empty
- [ ] All schema changes tracked in Alembic migrations
- [ ] `alembic upgrade head` is the only way schema changes
- [ ] Zero `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE ADD COLUMN` in application code

---

### TP-6: SQLAlchemy Uses Deprecated Query API Exclusively

**Severity**: HIGH
**Location**: `server/services/database_service.py` — 93 occurrences of `.query()`

**Description**: The entire data access layer uses SQLAlchemy's legacy `Session.query()` API which was deprecated in SQLAlchemy 2.0:

```python
# Legacy pattern (used throughout):
db_workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()

# Modern pattern (not used anywhere):
from sqlalchemy import select
stmt = select(WorkshopDB).where(WorkshopDB.id == workshop_id)
db_workshop = self.db.execute(stmt).scalar_one_or_none()
```

Additionally:
- **Relationships defined but not used**: `database.py` defines `relationship()` fields, but `database_service.py` does manual JOINs with tuple unpacking instead of accessing `finding.user.name`
- **No eager loading**: Zero uses of `selectinload()`, `joinedload()`, or `lazy=` configuration
- **No `load_only()`**: JSON columns (100KB+) always fetched even when only IDs are needed

**Impact**: When SQLAlchemy drops the legacy API, the entire service layer breaks. Missing eager loading causes N+1 queries. Manual JOINs defeat the purpose of the ORM relationship system.

**Remediation**: Migrate to `select()` API. Use relationships for data access. Add `selectinload()` or `joinedload()` where relationships are traversed.

**Acceptance Criteria**:
- [ ] Zero uses of `Session.query()` — all use `select()` statement API
- [ ] Relationships used for related data access (no manual tuple unpacking)
- [ ] Eager loading strategy specified for relationship-heavy queries

---

### TP-7: Pydantic Models Not Enforced on Responses — 60+ Raw Dict Returns

**Severity**: HIGH
**Location**:
- `server/routers/workshops.py` — 50+ endpoints return raw dicts, zero use `response_model`
- `server/routers/users.py` — 12+ raw dict returns
- `server/routers/databricks.py` — 2 raw dict returns
- `server/models.py` — no `model_config` on any model

**Description**: FastAPI's `response_model` parameter enables automatic response validation, serialization, and OpenAPI schema generation. Out of 100+ endpoints, only 11 declare a `response_model`. The rest return ad-hoc dictionaries:

```python
# Typical pattern in workshops.py (50+ occurrences):
return {"message": "Judge name updated successfully", "judge_name": judge_name}
return {"error": "No traces available for preview"}
return {"status": "deleted"}
```

Pydantic models also lack configuration:
- No `model_config = ConfigDict(from_attributes=True)` — can't convert SQLAlchemy objects directly
- No `Field()` validators on emails, names, or descriptions
- Same model used for create and response (no proper Create/Update/Response variants)

**Downstream effect**: The generated TypeScript client gets `CancelablePromise<any>` return types for these endpoints because the OpenAPI spec has no response schema.

**Impact**: No response validation. Generated client types are useless (`any`). API documentation incomplete. Frontend must guess at response shapes.

**Remediation**:
1. Add `model_config = ConfigDict(from_attributes=True)` to all response models
2. Create proper Response variants (separate from Create/Update)
3. Add `response_model=` to all endpoints
4. Add `Field()` validators (email, length constraints, etc.)
5. Regenerate TypeScript client

**Acceptance Criteria**:
- [ ] All endpoints declare `response_model`
- [ ] Generated TypeScript client has zero `any` return types
- [ ] Response models separate from create/update models
- [ ] `model_config` configured on all models

---

### TP-8: FastAPI Dependency Injection Underutilized

**Severity**: MEDIUM
**Location**:
- `server/routers/workshops.py:245,258,265,275...` — manual `DatabaseService(db)` instantiation
- `server/routers/users.py:25-27` — correct `Depends()` pattern (but only here)

**Description**: `users.py` correctly defines a dependency:
```python
def get_database_service(db: Session = Depends(get_db)) -> DatabaseService:
    return DatabaseService(db)
```

But `workshops.py` (5,229 lines, 100+ endpoints) manually instantiates `DatabaseService(db)` in every handler:
```python
async def create_workshop(workshop_data: WorkshopCreate, db: Session = Depends(get_db)):
    db_service = DatabaseService(db)  # Repeated 100+ times
```

FastAPI's `Depends()` provides:
- Single point of change for service creation
- Testability via dependency overrides
- Middleware-like behavior (logging, metrics, error wrapping)
- Automatic cleanup via generator dependencies

**Impact**: Can't swap service implementations for testing without patching. No single point to add cross-cutting concerns. Boilerplate repeated 100+ times.

**Remediation**: Use `Depends(get_database_service)` across all routers.

**Acceptance Criteria**:
- [ ] `DatabaseService` injected via `Depends()` in all routers
- [ ] Zero manual `DatabaseService(db)` instantiation in handlers
- [ ] Tests use dependency overrides instead of mocks

---

### TP-9: FastAPI BackgroundTasks Unused — Manual Threading Instead

**Severity**: MEDIUM
**Location**:
- `server/routers/workshops.py:1225` — `threading.Thread(target=run_auto_evaluation_for_new_traces)`
- `server/routers/workshops.py:1302-1640` — `threading.Thread(target=run_auto_evaluation_background)`
- `server/routers/workshops.py:3468` — `threading.Thread(target=run_alignment_background)`
- `server/routers/workshops.py:3723` — `threading.Thread(target=run_evaluation_background)`
- `server/routers/workshops.py:4203` — `threading.Thread(target=run_simple_evaluation_background)`
- `server/routers/dbsql_export.py:25` — `BackgroundTasks` parameter declared but never used

**Description**: FastAPI provides `BackgroundTasks` for post-response work. Instead, 6 endpoints spawn raw daemon threads:

```python
eval_thread = threading.Thread(target=run_auto_evaluation_background, daemon=True)
eval_thread.start()
```

These threads:
- Contain `time.sleep()` calls that block the thread
- Create their own database sessions (bypassing FastAPI's session lifecycle)
- Have no error reporting back to the caller
- Are invisible to FastAPI's shutdown lifecycle (`daemon=True` means they die silently)
- Cannot be tracked, cancelled, or monitored

One endpoint (`dbsql_export.py:25`) actually accepts `BackgroundTasks` as a parameter but never calls `background_tasks.add_task()`.

**Impact**: Thread leaks if exceptions occur. No graceful shutdown. Database sessions held open. No observability into background work. Can't test background execution.

**Remediation**: Replace `threading.Thread` with `BackgroundTasks` for short tasks, or implement a proper task queue (e.g., Celery, or an async task manager) for long-running evaluations.

**Acceptance Criteria**:
- [ ] Zero `threading.Thread` usage in router handlers
- [ ] Short background work uses `BackgroundTasks`
- [ ] Long-running jobs use a tracked task system with status reporting
- [ ] All background work respects application shutdown

---

### TP-10: SQLAlchemy Model Constraints Defined at Runtime Instead of Declaratively

**Severity**: MEDIUM
**Location**:
- `server/database.py:651-673` — runtime unique index creation via raw SQL
- `server/database.py:127,147,150-151,330,381-382` — JSON columns storing relational data

**Description**: Unique constraints are created via raw SQL at application startup instead of being declared in model definitions:

```python
# Runtime (current):
conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_findings_unique ON discovery_findings (workshop_id, trace_id, user_id)'))

# Declarative (should be):
class DiscoveryFindingDB(Base):
    __table_args__ = (
        UniqueConstraint('workshop_id', 'trace_id', 'user_id', name='idx_discovery_findings_unique'),
    )
```

Additionally, 7 JSON columns store lists of IDs that should be junction tables:
- `assigned_traces = Column(JSON)` — should be many-to-many with traces
- `active_discovery_trace_ids = Column(JSON)` — should be association table
- `active_annotation_trace_ids = Column(JSON)` — should be association table
- `discovery_traces = Column(JSON)` — should be association table
- `annotation_traces = Column(JSON)` — should be association table
- `few_shot_examples = Column(JSON)` — should reference traces via junction

**Impact**: No referential integrity for JSON-stored IDs. Can't query "which traces are assigned to user X" without parsing JSON. Constraints not version-controlled. Alembic can't manage what it can't see.

**Remediation**: Move constraints into `__table_args__`. Migrate JSON ID lists to proper junction tables via Alembic.

**Acceptance Criteria**:
- [ ] All constraints declared in model `__table_args__`
- [ ] JSON columns containing ID lists migrated to junction tables
- [ ] Referential integrity enforced at database level

---

### TP-11: Vite Build Missing Code Splitting

**Severity**: LOW
**Location**:
- `client/vite.config.ts` — no `manualChunks` or dynamic imports configured
- `client/src/App.tsx` — all routes imported statically

**Description**: All page components are imported statically, creating a single bundle:

```typescript
import IntakePage from './pages/IntakePage';
import JudgeTuningPage from './pages/JudgeTuningPage'; // 2,754 lines
import AnnotationDemo from './pages/AnnotationDemo';
// ... all loaded upfront
```

Vite supports automatic code splitting via `React.lazy()` + dynamic imports:
```typescript
const JudgeTuningPage = React.lazy(() => import('./pages/JudgeTuningPage'));
```

This would split the 2,754-line JudgeTuningPage (and its dependencies) into a separate chunk loaded only when that route is visited.

**Impact**: Larger initial bundle. Slower first paint. Users download code for pages they may never visit.

**Remediation**: Use `React.lazy()` for route-level code splitting. Configure `manualChunks` to separate vendor code.

**Acceptance Criteria**:
- [ ] Route-level code splitting with `React.lazy()`
- [ ] Vendor chunk separated via `manualChunks`
- [ ] Bundle size tracked and budgeted

---

## Prioritized Backlog

| Priority | ID | Title | Effort | Impact |
|----------|-----|-------|--------|--------|
| P0 | TP-5 | Move runtime schema updates into Alembic migrations | M | Critical — untracked schema drift |
| P0 | TP-1 | Replace direct fetch() with generated API client | L | Critical — no type safety on API calls |
| P1 | TP-7 | Add response_model to all endpoints + regenerate client | L | High — enables TP-1 and TP-2 |
| P1 | TP-4 | Fix QueryClient configuration and cache invalidation | S | High — eliminates 503 storms, over-fetching |
| P1 | TP-3 | Migrate remaining manual fetch patterns to TanStack Query | M | High — consistent data fetching |
| P1 | TP-6 | Migrate from deprecated .query() to select() API | L | High — future-proofs data layer |
| P2 | TP-2 | Delete duplicate frontend types, use generated client types | S | High — single source of truth |
| P2 | TP-8 | Use Depends() for DatabaseService across all routers | S | Medium — testability, DRY |
| P2 | TP-9 | Replace threading.Thread with BackgroundTasks or task queue | M | Medium — observability, lifecycle |
| P2 | TP-10 | Move constraints to model declarations, migrate JSON→tables | M | Medium — data integrity |
| P3 | TP-11 | Add route-level code splitting | S | Low — performance |

**Effort**: S = < 2 hours, M = 2-8 hours, L = 1-3 days

---

## Cross-References

| This Item | Related Items |
|-----------|---------------|
| TP-1 (fetch bypass) | ARCH-3, CQ-4 (any types) |
| TP-2 (type duplication) | ARCH-4 |
| TP-3 (TanStack partial) | CQ-7 (polling duplication), PERF-4 (no backoff) |
| TP-4 (QueryClient config) | PERF-4, CQ-7 |
| TP-5 (Alembic bypass) | DEPLOY-6 (no rollback), DX-7 (no schema docs) |
| TP-6 (deprecated query API) | PERF-2 (N+1 queries) |
| TP-7 (no response_model) | DX-5 (API docs), SEC-5 (password_hash exposure) |
| TP-8 (DI underused) | CQ-1 (god file workshops.py) |
| TP-9 (manual threading) | PERF-7 (blocking sleep in async) |
| TP-10 (runtime constraints) | PERF-1 (missing indexes) |
