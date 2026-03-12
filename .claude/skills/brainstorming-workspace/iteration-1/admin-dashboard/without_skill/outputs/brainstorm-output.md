# Admin Dashboard for System Health Monitoring

## Brainstorm Output

**Date**: 2026-03-11
**Request**: Build an admin dashboard for monitoring system health
**Project**: Human Evaluation Workshop (FastAPI + React/TypeScript)

---

## 1. Clarifying Questions (Self-Answered)

**Q: What does "admin" mean in this project's context?**
A: The project has a Facilitator role that serves as the admin/supervisor. The admin dashboard should be a facilitator-only view. There is no separate "system admin" role, so this would extend the existing facilitator permissions or introduce a new super-admin concept. **Assumption**: Build this as a facilitator-accessible system health page, since facilitators already have `can_manage_workshop` permissions.

**Q: What does "system health" encompass?**
A: Given the existing `/health` and `/health/detailed` endpoints in `server/app.py`, the system already tracks database connectivity, connection pool stats, and SQLite rescue status. The dashboard should surface these plus application-level metrics. **Assumption**: Cover database health, API response times (the `ProcessTimeMiddleware` already adds `X-Process-Time`), workshop activity metrics, and error rates.

**Q: Should this be a new route or integrated into the existing facilitator dashboard?**
A: The existing `GeneralDashboard.tsx` shows workshop-level stats (traces, annotations, users) and the `FacilitatorDashboard.tsx` shows phase-specific monitoring. System health is orthogonal to workshop state. **Assumption**: Create a new dedicated route/tab accessible from the sidebar or dashboard, rather than cramming it into the existing phase-oriented views.

**Q: Should it support multiple workshops or be workshop-scoped?**
A: Facilitators currently operate within a single workshop context. System health (DB, API) is global. **Assumption**: The dashboard has two sections -- global system health (not workshop-scoped) and per-workshop activity metrics using the current workshop context.

---

## 2. What Already Exists

### Backend Health Infrastructure
- **`GET /health`** -- Simple "healthy" status check (`server/app.py:228-231`)
- **`GET /health/detailed`** -- Database connectivity, connection pool stats (size, checked_in, checked_out, overflow, invalid), SQLite rescue status, timestamp (`server/app.py:234-267`)
- **`ProcessTimeMiddleware`** -- Adds `X-Process-Time` header to every response (`server/app.py:160-168`)
- **`DatabaseErrorMiddleware`** -- Catches transient DB errors (SQLite locks, PG connection drops) and returns 503 (`server/app.py:172-202`)
- **Dual-backend support** -- SQLite and Lakebase/PostgreSQL with automatic detection (`server/db_config.py`)

### Frontend Dashboard Components
- **`GeneralDashboard.tsx`** -- Workshop overview: trace count, annotation count, user count, quick navigation
- **`FacilitatorDashboard.tsx`** -- Phase monitoring, discovery/annotation progress, user management links
- **UI component library** -- Card, Badge, Progress, Tabs, Table, Skeleton (loading states) all available in `client/src/components/ui/`

### Data Available via Existing Queries
- Workshop status and phase (`WorkshopDB`)
- User count and roles (`UserDB`, `WorkshopParticipantDB`)
- Trace counts (`TraceDB`)
- Annotation counts (`AnnotationDB`)
- Discovery findings and feedback (`DiscoveryFindingDB`, `DiscoveryFeedbackDB`)
- Judge evaluations (`JudgeEvaluationDB`)

---

## 3. Proposed Feature Design

### 3.1 New Backend Endpoints

#### `GET /admin/health` (extends existing `/health/detailed`)
Returns comprehensive system health:
```python
{
    "status": "healthy" | "degraded" | "unhealthy",
    "uptime_seconds": float,
    "database": {
        "status": "connected" | "disconnected",
        "backend": "sqlite" | "postgresql",
        "connection_pool": {
            "size": int,
            "checked_in": int,
            "checked_out": int,
            "overflow": int
        },
        "sqlite_rescue": { ... }  # if applicable
    },
    "api": {
        "avg_response_time_ms": float,
        "p95_response_time_ms": float,
        "request_count_last_hour": int,
        "error_count_last_hour": int,
        "error_rate_pct": float
    },
    "timestamp": float
}
```

**Implementation notes**: Requires adding an in-memory metrics collector (e.g., a simple ring buffer in `ProcessTimeMiddleware` that stores last N request times, or integration with a lightweight metrics library). No external dependency needed -- a deque-based collector in middleware is sufficient.

#### `GET /admin/activity`
Returns cross-workshop activity summary:
```python
{
    "workshops": {
        "total": int,
        "active": int,
        "by_phase": { "intake": int, "discovery": int, ... }
    },
    "users": {
        "total": int,
        "active_last_hour": int,
        "by_role": { "facilitator": int, "sme": int, "participant": int }
    },
    "content": {
        "total_traces": int,
        "total_annotations": int,
        "total_findings": int,
        "annotations_last_hour": int
    }
}
```

#### `GET /admin/errors` (optional, v2)
Returns recent error log entries. Could read from a structured log buffer if we add one, or from the existing database error middleware's catch history.

### 3.2 New Frontend Components

#### `AdminHealthDashboard.tsx`
Top-level page component with three sections:

**Section 1: System Status Banner**
- Green/yellow/red status indicator
- Database backend type (SQLite vs PostgreSQL)
- Uptime display
- Last checked timestamp with auto-refresh (polling every 30s)

**Section 2: Infrastructure Metrics (cards grid)**
- Database connection pool utilization (Progress bar: checked_out / size)
- API response time (gauge or sparkline showing avg + p95)
- Error rate (percentage with trend indicator)
- Request throughput (requests/min)
- SQLite rescue status (if applicable): last backup time, backup configured

**Section 3: Application Activity**
- Workshop distribution by phase (horizontal stacked bar or donut chart)
- Active users in last hour
- Annotation velocity (annotations/hour trend)
- Content totals (traces, annotations, findings)

#### Routing
- Add `/admin` route in `App.tsx`
- Gate behind facilitator role check using existing `useRoleCheck` hook from `UserContext`
- Add "System Health" link in `AppSidebar.tsx` (visible only to facilitators)

### 3.3 Backend Metrics Collection

Add a lightweight in-process metrics collector:

```python
# server/middleware/metrics.py
from collections import deque
from dataclasses import dataclass
from time import time

@dataclass
class RequestMetric:
    path: str
    method: str
    status_code: int
    duration_ms: float
    timestamp: float
    is_error: bool

class MetricsCollector:
    """In-memory ring buffer for recent request metrics."""
    def __init__(self, max_size: int = 10000):
        self._buffer: deque[RequestMetric] = deque(maxlen=max_size)

    def record(self, metric: RequestMetric):
        self._buffer.append(metric)

    def get_summary(self, window_seconds: float = 3600) -> dict:
        cutoff = time() - window_seconds
        recent = [m for m in self._buffer if m.timestamp > cutoff]
        # ... compute avg, p95, error rate, count
```

This replaces the simple `ProcessTimeMiddleware` with one that also records metrics to the collector. No database writes, no external dependencies, minimal overhead.

---

## 4. File Changes Required

### New Files
| File | Purpose |
|------|---------|
| `server/middleware/metrics.py` | In-memory metrics collector |
| `server/routers/admin.py` | Admin health + activity endpoints |
| `client/src/pages/AdminHealthDashboard.tsx` | Main dashboard page |
| `client/src/hooks/useAdminApi.ts` | React Query hooks for admin endpoints |
| `tests/test_admin_endpoints.py` | Backend tests |
| `client/tests/AdminHealthDashboard.test.tsx` | Frontend tests |

### Modified Files
| File | Change |
|------|--------|
| `server/app.py` | Replace `ProcessTimeMiddleware` with metrics-aware version; register admin router |
| `server/routers/__init__.py` | Include admin router |
| `client/src/App.tsx` | Add `/admin` route |
| `client/src/components/AppSidebar.tsx` | Add "System Health" nav item (facilitator-only) |

### Spec File (if creating)
| File | Purpose |
|------|---------|
| `specs/ADMIN_DASHBOARD_SPEC.md` | Formal specification for the feature |

---

## 5. Risks and Considerations

### Performance
- The in-memory metrics collector uses a bounded deque, so memory is capped regardless of traffic volume
- Polling from the frontend every 30s is modest; the `/admin/health` endpoint should be fast since it queries pool stats (in-memory) and does a single `SELECT 1` for DB check
- The activity endpoint does aggregate queries; for SQLite these should be fast given typical workshop sizes (<1000 rows per table)

### Security
- Admin endpoints must be gated behind facilitator authentication
- The `/health` and `/health/detailed` endpoints are currently unauthenticated (common for health checks used by load balancers). The new `/admin/*` endpoints should require auth
- Connection pool stats and error details should not leak sensitive information (no credentials, no full stack traces)

### Database Backend Differences
- SQLite: connection pool is typically NullPool or a single connection -- pool stats may be less meaningful
- PostgreSQL/Lakebase: pool stats are more informative, and the rescue status section should be hidden
- The dashboard should adapt its display based on which backend is detected

### Scope Control
- v1: System status, DB health, basic activity counts -- achievable in a single sprint
- v2: Historical trends (requires persisting metrics or adding time-series), error log viewer, per-endpoint latency breakdown
- v3: Alerting thresholds, webhook notifications for degraded status

---

## 6. Implementation Sequence

1. **Backend metrics collector** (`server/middleware/metrics.py`) -- standalone, testable
2. **Integrate metrics middleware** into `server/app.py` -- replace ProcessTimeMiddleware
3. **Admin router** (`server/routers/admin.py`) with `/admin/health` and `/admin/activity`
4. **Frontend hooks** (`useAdminApi.ts`) with React Query polling
5. **Dashboard page** (`AdminHealthDashboard.tsx`) with status banner, metric cards, activity section
6. **Routing and navigation** -- wire into App.tsx and AppSidebar.tsx
7. **Tests** -- backend endpoint tests, frontend component tests
8. **Spec** -- write `ADMIN_DASHBOARD_SPEC.md` if following project conventions

---

## 7. Alternatives Considered

### External monitoring (Prometheus/Grafana)
- Overkill for a Databricks Apps deployment where the app runs in a managed container
- Adds infrastructure complexity; the app targets simplicity
- Could be a future enhancement by exposing a `/metrics` endpoint in Prometheus format

### Extending `/health/detailed` instead of new endpoints
- The existing health endpoint is typically unauthenticated for orchestrator health checks
- Mixing auth-gated admin data into a health check endpoint creates awkward auth requirements
- Better to keep health checks simple and add admin endpoints separately

### WebSocket for real-time updates
- Adds complexity (WebSocket support, connection management)
- 30-second polling is sufficient for a health dashboard that facilitators check occasionally
- Could upgrade to WebSocket in v2 if there's demand for live monitoring

---

## 8. Summary

The admin dashboard feature is well-scoped for this project. The existing infrastructure provides most of the building blocks: health endpoints, process time middleware, role-based permissions, and a comprehensive UI component library. The main new work is (a) an in-memory metrics collector to aggregate request-level data, (b) two new API endpoints behind facilitator auth, and (c) a React dashboard page that polls these endpoints and displays the data using the existing Card/Progress/Badge components. The feature fits naturally into the facilitator role's "manage workshop" permission set and the project's existing architectural patterns.
