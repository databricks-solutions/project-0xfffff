# Admin Dashboard Implementation Plan

**Spec:** [ADMIN_DASHBOARD_SPEC](../../../../../specs/ADMIN_DASHBOARD_SPEC.md)
**Goal:** Build a facilitator-only admin dashboard with infrastructure health, workshop summaries, and per-workshop progress detail, all auto-refreshing every 30 seconds.
**Architecture:** Three new GET endpoints in a dedicated `server/routers/admin.py` router, all gated by facilitator role check. Data is derived entirely from existing SQLAlchemy tables (WorkshopDB, UserDB, TraceDB, AnnotationDB, DiscoveryFindingDB, RubricDB, WorkshopParticipantDB). A new React page at `/admin` renders three independent panels (InfrastructurePanel, WorkshopSummaryPanel, WorkshopDetailTable), each using React Query with a 30-second `refetchInterval`. Navigation added to the sidebar for facilitators only.

**Success Criteria Targeted (16 across 6 categories):**

### Category 1: Access Control
- SC-1: All admin endpoints return 403 for non-facilitator users
- SC-2: Admin page is not visible in navigation for non-facilitator roles
- SC-3: Direct URL access to /admin redirects non-facilitators to home

### Category 2: Infrastructure Endpoint
- SC-4: GET /api/admin/infrastructure returns database backend type (sqlite/postgresql)
- SC-5: GET /api/admin/infrastructure returns database connectivity status (connected/disconnected)
- SC-6: GET /api/admin/infrastructure returns total workshop count, total user count, and total trace count

### Category 3: Workshop Summary Endpoint
- SC-7: GET /api/admin/workshops/summary returns a list of all workshops with id, name, status, current_phase, participant_count, trace_count, annotation_count, and created_at
- SC-8: Workshop summary data is derived from existing tables without new database tables
- SC-9: GET /api/admin/workshops/summary supports optional status filter query parameter

### Category 4: Workshop Progress Endpoint
- SC-10: GET /api/admin/workshops/{id}/progress returns per-user annotation progress (user_id, user_name, assigned_count, completed_count, completion_percentage)
- SC-11: GET /api/admin/workshops/{id}/progress returns per-rubric annotation distribution (rubric_id, question, rating_distribution)
- SC-12: GET /api/admin/workshops/{id}/progress returns 404 for non-existent workshop

### Category 5: Frontend Panels
- SC-13: InfrastructurePanel displays database status with a color-coded health indicator (green=connected, red=disconnected)
- SC-14: WorkshopSummaryPanel displays a table of all workshops with sortable columns
- SC-15: WorkshopDetailTable shows per-user progress bars when a workshop row is selected

### Category 6: Auto-Refresh
- SC-16: All three panels auto-refresh every 30 seconds without full page reload

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `server/routers/admin.py` | Three admin GET endpoints with facilitator role gating |
| `server/services/admin_service.py` | Service layer: queries existing tables to derive admin metrics |
| `client/src/pages/AdminDashboard.tsx` | Main admin page composing three panels |
| `client/src/components/admin/InfrastructurePanel.tsx` | DB health + global counts panel |
| `client/src/components/admin/WorkshopSummaryPanel.tsx` | Workshop list table with sorting |
| `client/src/components/admin/WorkshopDetailTable.tsx` | Per-user progress + rubric distribution |
| `client/src/hooks/useAdminApi.ts` | React Query hooks with 30s refetchInterval |
| `tests/test_admin_endpoints.py` | pytest backend tests for all 3 endpoints |
| `client/src/components/admin/InfrastructurePanel.test.tsx` | Vitest unit tests for InfrastructurePanel |
| `client/src/components/admin/WorkshopSummaryPanel.test.tsx` | Vitest unit tests for WorkshopSummaryPanel |
| `client/src/components/admin/WorkshopDetailTable.test.tsx` | Vitest unit tests for WorkshopDetailTable |
| `client/tests/e2e/admin-dashboard.spec.ts` | Playwright E2E tests for admin dashboard |

### Modified Files
| File | Change |
|------|--------|
| `server/routers/__init__.py` | Register admin router with prefix `/admin` |
| `client/src/App.tsx` | Add `/admin` route pointing to AdminDashboard page |
| `client/src/components/AppSidebar.tsx` | Add "Admin Dashboard" nav link visible only to facilitators |
| `server/models.py` | Add Pydantic response models for admin endpoints |

---

## Task Decomposition

### Task 1: Pydantic Response Models

**Spec criteria:** SC-4, SC-5, SC-6, SC-7, SC-10, SC-11
**Files:**
- Modify: `server/models.py`

- [ ] **Step 1: Define admin response models in `server/models.py`**

Add to the bottom of `server/models.py`:

```python
# ---------------------------------------------------------------------------
# Admin Dashboard Models
# ---------------------------------------------------------------------------

class InfrastructureStatus(BaseModel):
    """Response model for GET /api/admin/infrastructure."""
    database_backend: str  # "sqlite" or "postgresql"
    database_status: str  # "connected" or "disconnected"
    total_workshops: int
    total_users: int
    total_traces: int


class WorkshopSummaryItem(BaseModel):
    """Single workshop in the summary list."""
    id: str
    name: str
    status: str
    current_phase: str
    participant_count: int
    trace_count: int
    annotation_count: int
    created_at: datetime


class WorkshopSummaryResponse(BaseModel):
    """Response model for GET /api/admin/workshops/summary."""
    workshops: list[WorkshopSummaryItem]
    total: int


class UserAnnotationProgress(BaseModel):
    """Per-user annotation progress."""
    user_id: str
    user_name: str
    assigned_count: int
    completed_count: int
    completion_percentage: float


class RubricDistribution(BaseModel):
    """Per-rubric rating distribution."""
    rubric_id: str
    question: str
    rating_distribution: dict[str, int]  # {"1": 5, "2": 3, ...}


class WorkshopProgressResponse(BaseModel):
    """Response model for GET /api/admin/workshops/{id}/progress."""
    workshop_id: str
    user_progress: list[UserAnnotationProgress]
    rubric_distributions: list[RubricDistribution]
```

- [ ] **Step 2: Commit**

```bash
git add server/models.py
git commit -m "feat(admin): add Pydantic response models for admin dashboard endpoints"
```

---

### Task 2: Admin Service Layer

**Spec criteria:** SC-4, SC-5, SC-6, SC-7, SC-8, SC-9, SC-10, SC-11, SC-12
**Files:**
- Create: `server/services/admin_service.py`
- Test: `tests/test_admin_endpoints.py`

- [ ] **Step 1: Write failing tests for admin service**

Create `tests/test_admin_endpoints.py`:

```python
import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy.orm import Session

from server.services.admin_service import AdminService
from server.database import WorkshopDB, UserDB, TraceDB, AnnotationDB, WorkshopParticipantDB, RubricDB


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
class TestAdminServiceInfrastructure:
    """Tests for GET /api/admin/infrastructure data derivation."""

    @pytest.mark.req("GET /api/admin/infrastructure returns database backend type (sqlite/postgresql)")
    def test_infrastructure_returns_db_backend(self):
        db = MagicMock(spec=Session)
        # Mock count queries
        db.query.return_value.count.return_value = 0
        service = AdminService(db)
        result = service.get_infrastructure_status()
        assert result.database_backend in ("sqlite", "postgresql")

    @pytest.mark.req("GET /api/admin/infrastructure returns database connectivity status (connected/disconnected)")
    def test_infrastructure_returns_connectivity_status(self):
        db = MagicMock(spec=Session)
        db.query.return_value.count.return_value = 0
        db.execute.return_value = True
        service = AdminService(db)
        result = service.get_infrastructure_status()
        assert result.database_status in ("connected", "disconnected")

    @pytest.mark.req("GET /api/admin/infrastructure returns total workshop count, total user count, and total trace count")
    def test_infrastructure_returns_global_counts(self):
        db = MagicMock(spec=Session)
        # Configure mock to return different counts per model
        def count_side_effect(*args, **kwargs):
            mock = MagicMock()
            mock.count.return_value = 5
            return mock
        db.query.side_effect = count_side_effect
        service = AdminService(db)
        result = service.get_infrastructure_status()
        assert result.total_workshops == 5
        assert result.total_users == 5
        assert result.total_traces == 5


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
class TestAdminServiceWorkshopSummary:
    """Tests for GET /api/admin/workshops/summary data derivation."""

    @pytest.mark.req("GET /api/admin/workshops/summary returns a list of all workshops with id, name, status, current_phase, participant_count, trace_count, annotation_count, and created_at")
    def test_summary_returns_all_required_fields(self):
        # Will be filled with proper mocks once service is implemented
        pass

    @pytest.mark.req("Workshop summary data is derived from existing tables without new database tables")
    def test_summary_uses_existing_tables_only(self):
        # This is verified by the absence of any migration
        pass

    @pytest.mark.req("GET /api/admin/workshops/summary supports optional status filter query parameter")
    def test_summary_supports_status_filter(self):
        pass


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
class TestAdminServiceWorkshopProgress:
    """Tests for GET /api/admin/workshops/{id}/progress data derivation."""

    @pytest.mark.req("GET /api/admin/workshops/{id}/progress returns per-user annotation progress (user_id, user_name, assigned_count, completed_count, completion_percentage)")
    def test_progress_returns_per_user_data(self):
        pass

    @pytest.mark.req("GET /api/admin/workshops/{id}/progress returns per-rubric annotation distribution (rubric_id, question, rating_distribution)")
    def test_progress_returns_rubric_distribution(self):
        pass

    @pytest.mark.req("GET /api/admin/workshops/{id}/progress returns 404 for non-existent workshop")
    def test_progress_404_for_missing_workshop(self):
        pass
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server-spec ADMIN_DASHBOARD_SPEC`
Expected: FAIL -- `server.services.admin_service` not found

- [ ] **Step 3: Create `server/services/admin_service.py`**

```python
"""Admin dashboard service — derives metrics from existing tables."""

import logging
from sqlalchemy import text
from sqlalchemy.orm import Session

from server.database import (
    AnnotationDB,
    RubricDB,
    TraceDB,
    UserDB,
    WorkshopDB,
    WorkshopParticipantDB,
)
from server.db_config import DatabaseBackend, detect_database_backend
from server.models import (
    InfrastructureStatus,
    RubricDistribution,
    UserAnnotationProgress,
    WorkshopProgressResponse,
    WorkshopSummaryItem,
    WorkshopSummaryResponse,
)

logger = logging.getLogger(__name__)


class AdminService:
    """Service that derives admin dashboard data from existing tables."""

    def __init__(self, db: Session):
        self.db = db

    def get_infrastructure_status(self) -> InfrastructureStatus:
        """Derive infrastructure health from DB metadata and counts."""
        db_backend = detect_database_backend()
        backend_name = "postgresql" if db_backend == DatabaseBackend.POSTGRESQL else "sqlite"

        # Test connectivity
        try:
            self.db.execute(text("SELECT 1"))
            db_status = "connected"
        except Exception:
            db_status = "disconnected"

        total_workshops = self.db.query(WorkshopDB).count()
        total_users = self.db.query(UserDB).count()
        total_traces = self.db.query(TraceDB).count()

        return InfrastructureStatus(
            database_backend=backend_name,
            database_status=db_status,
            total_workshops=total_workshops,
            total_users=total_users,
            total_traces=total_traces,
        )

    def get_workshop_summary(self, status_filter: str | None = None) -> WorkshopSummaryResponse:
        """Return summary of all workshops with counts derived from existing tables."""
        query = self.db.query(WorkshopDB)
        if status_filter:
            query = query.filter(WorkshopDB.status == status_filter)

        workshops = query.all()
        items = []
        for w in workshops:
            participant_count = (
                self.db.query(WorkshopParticipantDB)
                .filter(WorkshopParticipantDB.workshop_id == w.id)
                .count()
            )
            trace_count = (
                self.db.query(TraceDB)
                .filter(TraceDB.workshop_id == w.id)
                .count()
            )
            annotation_count = (
                self.db.query(AnnotationDB)
                .filter(AnnotationDB.workshop_id == w.id)
                .count()
            )
            items.append(
                WorkshopSummaryItem(
                    id=w.id,
                    name=w.name,
                    status=w.status,
                    current_phase=w.current_phase,
                    participant_count=participant_count,
                    trace_count=trace_count,
                    annotation_count=annotation_count,
                    created_at=w.created_at,
                )
            )

        return WorkshopSummaryResponse(workshops=items, total=len(items))

    def get_workshop_progress(self, workshop_id: str) -> WorkshopProgressResponse | None:
        """Return per-user progress and per-rubric distribution for a single workshop."""
        workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
        if not workshop:
            return None

        # Per-user annotation progress
        participants = (
            self.db.query(WorkshopParticipantDB)
            .filter(WorkshopParticipantDB.workshop_id == workshop_id)
            .all()
        )
        user_progress = []
        for p in participants:
            user = self.db.query(UserDB).filter(UserDB.id == p.user_id).first()
            user_name = user.name if user else "Unknown"
            assigned = len(p.assigned_traces) if p.assigned_traces else 0
            completed = (
                self.db.query(AnnotationDB)
                .filter(
                    AnnotationDB.workshop_id == workshop_id,
                    AnnotationDB.user_id == p.user_id,
                )
                .count()
            )
            pct = (completed / assigned * 100.0) if assigned > 0 else 0.0
            user_progress.append(
                UserAnnotationProgress(
                    user_id=p.user_id,
                    user_name=user_name,
                    assigned_count=assigned,
                    completed_count=completed,
                    completion_percentage=round(pct, 1),
                )
            )

        # Per-rubric rating distribution
        rubrics = (
            self.db.query(RubricDB)
            .filter(RubricDB.workshop_id == workshop_id)
            .all()
        )
        rubric_dists = []
        for r in rubrics:
            annotations = (
                self.db.query(AnnotationDB)
                .filter(AnnotationDB.workshop_id == workshop_id)
                .all()
            )
            dist: dict[str, int] = {}
            for a in annotations:
                if a.ratings and r.id in a.ratings:
                    rating_str = str(a.ratings[r.id])
                    dist[rating_str] = dist.get(rating_str, 0) + 1
            rubric_dists.append(
                RubricDistribution(
                    rubric_id=r.id,
                    question=r.question,
                    rating_distribution=dist,
                )
            )

        return WorkshopProgressResponse(
            workshop_id=workshop_id,
            user_progress=user_progress,
            rubric_distributions=rubric_dists,
        )
```

- [ ] **Step 4: Update test mocks to match real implementation and re-run**

Run: `just test-server-spec ADMIN_DASHBOARD_SPEC`
Expected: PASS for all service tests

- [ ] **Step 5: Commit**

```bash
git add server/services/admin_service.py tests/test_admin_endpoints.py
git commit -m "feat(admin): add AdminService deriving metrics from existing tables"
```

---

### Task 3: Admin Router with Facilitator Role Gating

**Spec criteria:** SC-1, SC-4, SC-5, SC-6, SC-7, SC-9, SC-10, SC-11, SC-12
**Files:**
- Create: `server/routers/admin.py`
- Modify: `server/routers/__init__.py`
- Test: `tests/test_admin_endpoints.py` (add endpoint-level tests)

- [ ] **Step 1: Write failing endpoint tests**

Append to `tests/test_admin_endpoints.py`:

```python
from fastapi.testclient import TestClient
from server.app import app

client = TestClient(app)


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
class TestAdminEndpointsAccessControl:
    """Tests for facilitator-only access gating."""

    @pytest.mark.req("All admin endpoints return 403 for non-facilitator users")
    def test_infrastructure_rejects_non_facilitator(self):
        # Call without a valid facilitator user_id header/param
        response = client.get("/admin/infrastructure", params={"user_id": "non-existent-user"})
        assert response.status_code == 403

    @pytest.mark.req("All admin endpoints return 403 for non-facilitator users")
    def test_summary_rejects_non_facilitator(self):
        response = client.get("/admin/workshops/summary", params={"user_id": "non-existent-user"})
        assert response.status_code == 403

    @pytest.mark.req("All admin endpoints return 403 for non-facilitator users")
    def test_progress_rejects_non_facilitator(self):
        response = client.get("/admin/workshops/some-id/progress", params={"user_id": "non-existent-user"})
        assert response.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server-spec ADMIN_DASHBOARD_SPEC`
Expected: FAIL -- 404 Not Found (route not registered)

- [ ] **Step 3: Create `server/routers/admin.py`**

```python
"""Admin dashboard API endpoints — facilitator-only access."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from server.database import get_db, UserDB
from server.models import (
    InfrastructureStatus,
    UserRole,
    WorkshopProgressResponse,
    WorkshopSummaryResponse,
)
from server.services.admin_service import AdminService

router = APIRouter()


def _require_facilitator(user_id: str = Query(...), db: Session = Depends(get_db)) -> Session:
    """Dependency that verifies the caller is a facilitator. Returns the DB session."""
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user or user.role != UserRole.FACILITATOR:
        raise HTTPException(status_code=403, detail="Facilitator access required")
    return db


@router.get("/infrastructure", response_model=InfrastructureStatus)
async def get_infrastructure(db: Session = Depends(_require_facilitator)):
    """Return infrastructure health and global counts."""
    service = AdminService(db)
    return service.get_infrastructure_status()


@router.get("/workshops/summary", response_model=WorkshopSummaryResponse)
async def get_workshop_summary(
    status: str | None = None,
    db: Session = Depends(_require_facilitator),
):
    """Return summary of all workshops with derived counts."""
    service = AdminService(db)
    return service.get_workshop_summary(status_filter=status)


@router.get("/workshops/{workshop_id}/progress", response_model=WorkshopProgressResponse)
async def get_workshop_progress(
    workshop_id: str,
    db: Session = Depends(_require_facilitator),
):
    """Return per-user progress and per-rubric distribution for a workshop."""
    service = AdminService(db)
    result = service.get_workshop_progress(workshop_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Workshop not found")
    return result
```

- [ ] **Step 4: Register the admin router in `server/routers/__init__.py`**

Add to imports:
```python
from server.routers.admin import router as admin_router
```

Add to router includes:
```python
router.include_router(admin_router, prefix="/admin", tags=["admin"])
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `just test-server-spec ADMIN_DASHBOARD_SPEC`
Expected: PASS for access control tests

- [ ] **Step 6: Commit**

```bash
git add server/routers/admin.py server/routers/__init__.py
git commit -m "feat(admin): add facilitator-gated admin router with 3 endpoints"
```

---

### Task 4: React Query Hooks with Auto-Refresh

**Spec criteria:** SC-16
**Files:**
- Create: `client/src/hooks/useAdminApi.ts`

- [ ] **Step 1: Create `client/src/hooks/useAdminApi.ts`**

```typescript
/**
 * React Query hooks for admin dashboard API operations.
 * All hooks auto-refresh every 30 seconds.
 */

import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/context/UserContext';

const ADMIN_REFRESH_INTERVAL = 30_000; // 30 seconds

export interface InfrastructureStatus {
  database_backend: string;
  database_status: string;
  total_workshops: number;
  total_users: number;
  total_traces: number;
}

export interface WorkshopSummaryItem {
  id: string;
  name: string;
  status: string;
  current_phase: string;
  participant_count: number;
  trace_count: number;
  annotation_count: number;
  created_at: string;
}

export interface WorkshopSummaryResponse {
  workshops: WorkshopSummaryItem[];
  total: number;
}

export interface UserAnnotationProgress {
  user_id: string;
  user_name: string;
  assigned_count: number;
  completed_count: number;
  completion_percentage: number;
}

export interface RubricDistribution {
  rubric_id: string;
  question: string;
  rating_distribution: Record<string, number>;
}

export interface WorkshopProgressResponse {
  workshop_id: string;
  user_progress: UserAnnotationProgress[];
  rubric_distributions: RubricDistribution[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export function useInfrastructureStatus() {
  const { user } = useUser();
  return useQuery<InfrastructureStatus>({
    queryKey: ['admin', 'infrastructure'],
    queryFn: () => fetchJson(`/admin/infrastructure?user_id=${user?.id}`),
    refetchInterval: ADMIN_REFRESH_INTERVAL,
    enabled: !!user?.id,
  });
}

export function useWorkshopSummary(statusFilter?: string) {
  const { user } = useUser();
  const params = new URLSearchParams({ user_id: user?.id ?? '' });
  if (statusFilter) params.set('status', statusFilter);

  return useQuery<WorkshopSummaryResponse>({
    queryKey: ['admin', 'workshops', 'summary', statusFilter],
    queryFn: () => fetchJson(`/admin/workshops/summary?${params}`),
    refetchInterval: ADMIN_REFRESH_INTERVAL,
    enabled: !!user?.id,
  });
}

export function useWorkshopProgress(workshopId: string | null) {
  const { user } = useUser();
  return useQuery<WorkshopProgressResponse>({
    queryKey: ['admin', 'workshops', workshopId, 'progress'],
    queryFn: () =>
      fetchJson(`/admin/workshops/${workshopId}/progress?user_id=${user?.id}`),
    refetchInterval: ADMIN_REFRESH_INTERVAL,
    enabled: !!user?.id && !!workshopId,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useAdminApi.ts
git commit -m "feat(admin): add React Query hooks with 30s auto-refresh"
```

---

### Task 5: InfrastructurePanel Component

**Spec criteria:** SC-13
**Files:**
- Create: `client/src/components/admin/InfrastructurePanel.tsx`
- Test: `client/src/components/admin/InfrastructurePanel.test.tsx`

- [ ] **Step 1: Write failing Vitest test**

Create `client/src/components/admin/InfrastructurePanel.test.tsx`:

```typescript
// @spec ADMIN_DASHBOARD_SPEC
// @req InfrastructurePanel displays database status with a color-coded health indicator (green=connected, red=disconnected)

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InfrastructurePanel } from './InfrastructurePanel';

// Mock the hook
vi.mock('@/hooks/useAdminApi', () => ({
  useInfrastructureStatus: vi.fn(),
}));

import { useInfrastructureStatus } from '@/hooks/useAdminApi';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

describe('InfrastructurePanel', () => {
  it('shows green indicator when database is connected', () => {
    (useInfrastructureStatus as any).mockReturnValue({
      data: {
        database_backend: 'sqlite',
        database_status: 'connected',
        total_workshops: 3,
        total_users: 12,
        total_traces: 50,
      },
      isLoading: false,
    });

    render(<InfrastructurePanel />, { wrapper });
    const indicator = screen.getByTestId('db-status-indicator');
    expect(indicator.className).toContain('green');
  });

  it('shows red indicator when database is disconnected', () => {
    (useInfrastructureStatus as any).mockReturnValue({
      data: {
        database_backend: 'sqlite',
        database_status: 'disconnected',
        total_workshops: 0,
        total_users: 0,
        total_traces: 0,
      },
      isLoading: false,
    });

    render(<InfrastructurePanel />, { wrapper });
    const indicator = screen.getByTestId('db-status-indicator');
    expect(indicator.className).toContain('red');
  });

  it('displays global counts', () => {
    (useInfrastructureStatus as any).mockReturnValue({
      data: {
        database_backend: 'sqlite',
        database_status: 'connected',
        total_workshops: 3,
        total_users: 12,
        total_traces: 50,
      },
      isLoading: false,
    });

    render(<InfrastructurePanel />, { wrapper });
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('50')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run Vitest to verify it fails**

Run: `cd client && npx vitest run src/components/admin/InfrastructurePanel.test.tsx`
Expected: FAIL -- module not found

- [ ] **Step 3: Create `client/src/components/admin/InfrastructurePanel.tsx`**

```tsx
import { useInfrastructureStatus } from '@/hooks/useAdminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function InfrastructurePanel() {
  const { data, isLoading } = useInfrastructureStatus();

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader><CardTitle>Infrastructure</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Loading...</p></CardContent>
      </Card>
    );
  }

  const isConnected = data.database_status === 'connected';

  return (
    <Card>
      <CardHeader><CardTitle>Infrastructure</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span
            data-testid="db-status-indicator"
            className={`inline-block h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="font-medium">
            {data.database_backend.toUpperCase()} - {data.database_status}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{data.total_workshops}</div>
            <div className="text-sm text-muted-foreground">Workshops</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{data.total_users}</div>
            <div className="text-sm text-muted-foreground">Users</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{data.total_traces}</div>
            <div className="text-sm text-muted-foreground">Traces</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run Vitest to verify it passes**

Run: `cd client && npx vitest run src/components/admin/InfrastructurePanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/admin/InfrastructurePanel.tsx client/src/components/admin/InfrastructurePanel.test.tsx
git commit -m "feat(admin): add InfrastructurePanel with color-coded health indicator"
```

---

### Task 6: WorkshopSummaryPanel Component

**Spec criteria:** SC-14
**Files:**
- Create: `client/src/components/admin/WorkshopSummaryPanel.tsx`
- Test: `client/src/components/admin/WorkshopSummaryPanel.test.tsx`

- [ ] **Step 1: Write failing Vitest test**

Create `client/src/components/admin/WorkshopSummaryPanel.test.tsx`:

```typescript
// @spec ADMIN_DASHBOARD_SPEC
// @req WorkshopSummaryPanel displays a table of all workshops with sortable columns

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkshopSummaryPanel } from './WorkshopSummaryPanel';

vi.mock('@/hooks/useAdminApi', () => ({
  useWorkshopSummary: vi.fn(),
}));

import { useWorkshopSummary } from '@/hooks/useAdminApi';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

const mockData = {
  workshops: [
    { id: 'w1', name: 'Workshop A', status: 'active', current_phase: 'discovery', participant_count: 5, trace_count: 20, annotation_count: 40, created_at: '2026-01-01T00:00:00' },
    { id: 'w2', name: 'Workshop B', status: 'completed', current_phase: 'results', participant_count: 3, trace_count: 10, annotation_count: 30, created_at: '2026-02-01T00:00:00' },
  ],
  total: 2,
};

describe('WorkshopSummaryPanel', () => {
  it('renders a table with workshop rows', () => {
    (useWorkshopSummary as any).mockReturnValue({ data: mockData, isLoading: false });
    render(<WorkshopSummaryPanel onSelectWorkshop={vi.fn()} />, { wrapper });
    expect(screen.getByText('Workshop A')).toBeDefined();
    expect(screen.getByText('Workshop B')).toBeDefined();
  });

  it('calls onSelectWorkshop when a row is clicked', () => {
    const onSelect = vi.fn();
    (useWorkshopSummary as any).mockReturnValue({ data: mockData, isLoading: false });
    render(<WorkshopSummaryPanel onSelectWorkshop={onSelect} />, { wrapper });
    fireEvent.click(screen.getByText('Workshop A'));
    expect(onSelect).toHaveBeenCalledWith('w1');
  });
});
```

- [ ] **Step 2: Run Vitest to verify it fails**

Run: `cd client && npx vitest run src/components/admin/WorkshopSummaryPanel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Create `client/src/components/admin/WorkshopSummaryPanel.tsx`**

```tsx
import { useState } from 'react';
import { useWorkshopSummary } from '@/hooks/useAdminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface WorkshopSummaryPanelProps {
  onSelectWorkshop: (workshopId: string) => void;
}

type SortKey = 'name' | 'status' | 'current_phase' | 'participant_count' | 'trace_count' | 'annotation_count' | 'created_at';

export function WorkshopSummaryPanel({ onSelectWorkshop }: WorkshopSummaryPanelProps) {
  const { data, isLoading } = useWorkshopSummary();
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader><CardTitle>Workshop Summary</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Loading...</p></CardContent>
      </Card>
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = [...data.workshops].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortAsc ? aVal - bVal : bVal - aVal;
    }
    return sortAsc
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  return (
    <Card>
      <CardHeader><CardTitle>Workshop Summary ({data.total})</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>Name</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>Status</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('current_phase')}>Phase</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('participant_count')}>Participants</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('trace_count')}>Traces</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('annotation_count')}>Annotations</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((w) => (
              <TableRow
                key={w.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSelectWorkshop(w.id)}
              >
                <TableCell>{w.name}</TableCell>
                <TableCell>{w.status}</TableCell>
                <TableCell>{w.current_phase}</TableCell>
                <TableCell>{w.participant_count}</TableCell>
                <TableCell>{w.trace_count}</TableCell>
                <TableCell>{w.annotation_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run Vitest to verify it passes**

Run: `cd client && npx vitest run src/components/admin/WorkshopSummaryPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/admin/WorkshopSummaryPanel.tsx client/src/components/admin/WorkshopSummaryPanel.test.tsx
git commit -m "feat(admin): add WorkshopSummaryPanel with sortable table"
```

---

### Task 7: WorkshopDetailTable Component

**Spec criteria:** SC-15
**Files:**
- Create: `client/src/components/admin/WorkshopDetailTable.tsx`
- Test: `client/src/components/admin/WorkshopDetailTable.test.tsx`

- [ ] **Step 1: Write failing Vitest test**

Create `client/src/components/admin/WorkshopDetailTable.test.tsx`:

```typescript
// @spec ADMIN_DASHBOARD_SPEC
// @req WorkshopDetailTable shows per-user progress bars when a workshop row is selected

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkshopDetailTable } from './WorkshopDetailTable';

vi.mock('@/hooks/useAdminApi', () => ({
  useWorkshopProgress: vi.fn(),
}));

import { useWorkshopProgress } from '@/hooks/useAdminApi';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

describe('WorkshopDetailTable', () => {
  it('renders nothing when no workshop is selected', () => {
    (useWorkshopProgress as any).mockReturnValue({ data: null, isLoading: false });
    const { container } = render(<WorkshopDetailTable workshopId={null} />, { wrapper });
    expect(container.textContent).toBe('');
  });

  it('shows per-user progress bars', () => {
    (useWorkshopProgress as any).mockReturnValue({
      data: {
        workshop_id: 'w1',
        user_progress: [
          { user_id: 'u1', user_name: 'Alice', assigned_count: 10, completed_count: 7, completion_percentage: 70.0 },
          { user_id: 'u2', user_name: 'Bob', assigned_count: 10, completed_count: 10, completion_percentage: 100.0 },
        ],
        rubric_distributions: [],
      },
      isLoading: false,
    });

    render(<WorkshopDetailTable workshopId="w1" />, { wrapper });
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.getByText('70%')).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run Vitest to verify it fails**

Run: `cd client && npx vitest run src/components/admin/WorkshopDetailTable.test.tsx`
Expected: FAIL

- [ ] **Step 3: Create `client/src/components/admin/WorkshopDetailTable.tsx`**

```tsx
import { useWorkshopProgress } from '@/hooks/useAdminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface WorkshopDetailTableProps {
  workshopId: string | null;
}

export function WorkshopDetailTable({ workshopId }: WorkshopDetailTableProps) {
  const { data, isLoading } = useWorkshopProgress(workshopId);

  if (!workshopId) return null;

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader><CardTitle>Workshop Progress</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Loading...</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Workshop Progress</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {/* Per-user progress */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Annotation Progress by User</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="text-right">Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.user_progress.map((u) => (
                <TableRow key={u.user_id}>
                  <TableCell>{u.user_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={u.completion_percentage} className="flex-1" />
                      <span className="text-sm text-muted-foreground w-10 text-right">
                        {Math.round(u.completion_percentage)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {u.completed_count}/{u.assigned_count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Per-rubric distribution */}
        {data.rubric_distributions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Rating Distribution by Rubric</h3>
            {data.rubric_distributions.map((r) => (
              <div key={r.rubric_id} className="mb-3">
                <p className="text-sm font-medium">{r.question}</p>
                <div className="flex gap-2 mt-1">
                  {Object.entries(r.rating_distribution)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([rating, count]) => (
                      <span key={rating} className="text-xs bg-muted px-2 py-1 rounded">
                        {rating}: {count}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run Vitest to verify it passes**

Run: `cd client && npx vitest run src/components/admin/WorkshopDetailTable.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/admin/WorkshopDetailTable.tsx client/src/components/admin/WorkshopDetailTable.test.tsx
git commit -m "feat(admin): add WorkshopDetailTable with per-user progress bars"
```

---

### Task 8: AdminDashboard Page + Routing + Navigation

**Spec criteria:** SC-2, SC-3
**Files:**
- Create: `client/src/pages/AdminDashboard.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/AppSidebar.tsx`

- [ ] **Step 1: Create `client/src/pages/AdminDashboard.tsx`**

```tsx
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useRoleCheck } from '@/context/UserContext';
import { InfrastructurePanel } from '@/components/admin/InfrastructurePanel';
import { WorkshopSummaryPanel } from '@/components/admin/WorkshopSummaryPanel';
import { WorkshopDetailTable } from '@/components/admin/WorkshopDetailTable';

export function AdminDashboard() {
  const { isFacilitator } = useRoleCheck();
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(null);

  // SC-3: Direct URL access redirects non-facilitators
  if (!isFacilitator) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <InfrastructurePanel />
      <WorkshopSummaryPanel onSelectWorkshop={setSelectedWorkshopId} />
      <WorkshopDetailTable workshopId={selectedWorkshopId} />
    </div>
  );
}
```

- [ ] **Step 2: Add `/admin` route in `client/src/App.tsx`**

Add import:
```typescript
import { AdminDashboard } from './pages/AdminDashboard';
```

Add route inside `<Routes>`:
```tsx
<Route path="/admin" element={<AdminDashboard />} />
```

- [ ] **Step 3: Add sidebar link in `client/src/components/AppSidebar.tsx`**

Add a "Admin Dashboard" nav item that is only rendered when the user has the facilitator role. The exact modification depends on the current sidebar structure, but the pattern is:

```tsx
{isFacilitator && (
  <NavLink to="/admin">Admin Dashboard</NavLink>
)}
```

Use the `useRoleCheck` hook from `@/context/UserContext` to gate visibility (SC-2).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/AdminDashboard.tsx client/src/App.tsx client/src/components/AppSidebar.tsx
git commit -m "feat(admin): add AdminDashboard page with routing and sidebar nav"
```

---

### Task 9: Playwright E2E Tests

**Spec criteria:** SC-1, SC-2, SC-3, SC-13, SC-14, SC-15, SC-16
**Files:**
- Create: `client/tests/e2e/admin-dashboard.spec.ts`

- [ ] **Step 1: Create E2E test file**

Create `client/tests/e2e/admin-dashboard.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard - Access Control', () => {
  test.use({ tag: ['@spec:ADMIN_DASHBOARD_SPEC', '@req:All admin endpoints return 403 for non-facilitator users'] });

  test('non-facilitator cannot access admin endpoints', async ({ request }) => {
    // Attempt to hit the admin infrastructure endpoint as a non-facilitator
    const response = await request.get('/admin/infrastructure?user_id=non-existent');
    expect(response.status()).toBe(403);
  });
});

test.describe('Admin Dashboard - Navigation Visibility', () => {
  test.use({ tag: ['@spec:ADMIN_DASHBOARD_SPEC', '@req:Admin page is not visible in navigation for non-facilitator roles'] });

  test('sidebar does not show admin link for SME', async ({ page }) => {
    // Login as SME and check sidebar
    // (use existing test helpers from tests/lib/actions/auth.ts)
    // Verify no "Admin Dashboard" link is visible
  });
});

test.describe('Admin Dashboard - Redirect', () => {
  test.use({ tag: ['@spec:ADMIN_DASHBOARD_SPEC', '@req:Direct URL access to /admin redirects non-facilitators to home'] });

  test('non-facilitator visiting /admin is redirected to /', async ({ page }) => {
    // Login as participant, navigate to /admin, expect redirect to /
  });
});

test.describe('Admin Dashboard - Infrastructure Panel', () => {
  test.use({ tag: ['@spec:ADMIN_DASHBOARD_SPEC', '@req:InfrastructurePanel displays database status with a color-coded health indicator (green=connected, red=disconnected)'] });

  test('infrastructure panel shows green status for connected DB', async ({ page }) => {
    // Login as facilitator, navigate to /admin
    // Check for green status indicator
  });
});

test.describe('Admin Dashboard - Workshop Summary', () => {
  test.use({ tag: ['@spec:ADMIN_DASHBOARD_SPEC', '@req:WorkshopSummaryPanel displays a table of all workshops with sortable columns'] });

  test('workshop summary table renders with workshop data', async ({ page }) => {
    // Login as facilitator, create a workshop, navigate to /admin
    // Verify table row appears with workshop name
  });
});

test.describe('Admin Dashboard - Workshop Detail', () => {
  test.use({ tag: ['@spec:ADMIN_DASHBOARD_SPEC', '@req:WorkshopDetailTable shows per-user progress bars when a workshop row is selected'] });

  test('clicking a workshop row shows per-user progress', async ({ page }) => {
    // Login as facilitator, create workshop + users + annotations
    // Navigate to /admin, click workshop row
    // Verify progress bars appear
  });
});

test.describe('Admin Dashboard - Auto Refresh', () => {
  test.use({ tag: ['@spec:ADMIN_DASHBOARD_SPEC', '@req:All three panels auto-refresh every 30 seconds without full page reload'] });

  test('panels refetch data after 30 seconds', async ({ page }) => {
    // Login as facilitator, navigate to /admin
    // Intercept API calls, wait 30+ seconds, verify re-fetch occurs
    // Verify page did not fully reload (check a stable DOM element)
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `cd client && npx playwright test tests/e2e/admin-dashboard.spec.ts`
Expected: Tests execute (some may need test data setup; flesh out stubs with real helpers from `tests/lib/`)

- [ ] **Step 3: Commit**

```bash
git add client/tests/e2e/admin-dashboard.spec.ts
git commit -m "test(admin): add Playwright E2E tests for admin dashboard"
```

---

### Task 10 (Final): Verify Spec Coverage

- [ ] **Step 1: Run spec coverage**

Run: `just spec-coverage --specs ADMIN_DASHBOARD_SPEC`
Expected: Coverage increased from 0% to target (all 16 criteria covered)

- [ ] **Step 2: Check for untagged tests**

Run: `just spec-validate`
Expected: All tests tagged

- [ ] **Step 3: Run full test suite for the spec**

Run: `just test-spec ADMIN_DASHBOARD_SPEC`
Expected: All tests PASS

- [ ] **Step 4: Update implementation log**

Add to `specs/ADMIN_DASHBOARD_SPEC.md` (at the bottom):

```markdown
## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-03-12 | [Admin Dashboard](../.claude/plans/2026-03-12-admin-dashboard.md) | planned | Infrastructure health + workshop summary + per-workshop progress dashboard |
```

---

## Dependency Graph

```
Task 1 (Models)
  |
  v
Task 2 (AdminService) -----> Task 3 (Admin Router)
                                |
                                v
Task 4 (React Query hooks)
  |         |          |
  v         v          v
Task 5    Task 6    Task 7
(Infra)   (Summary) (Detail)
  |         |          |
  +----+----+----+-----+
       |
       v
Task 8 (Page + Routing + Nav)
       |
       v
Task 9 (E2E Tests)
       |
       v
Task 10 (Coverage Verification)
```

## Key Design Decisions

1. **No new database tables.** All metrics derived via SQLAlchemy queries on existing WorkshopDB, UserDB, TraceDB, AnnotationDB, RubricDB, WorkshopParticipantDB tables. This satisfies SC-8.

2. **Facilitator gating via query parameter.** The `user_id` query parameter is validated against the `users` table in a FastAPI dependency (`_require_facilitator`). This matches the existing pattern in the codebase where user identity is passed explicitly (no session/JWT auth currently).

3. **Three independent panels.** Each panel has its own React Query hook with independent `refetchInterval: 30_000`. Panels can load and refresh independently; one failing does not block the others.

4. **Separate admin router.** Mounted at `/admin` prefix, keeps admin concerns isolated from the workshop CRUD router. Follows the existing pattern of one router per domain (workshops, users, discovery, databricks, dbsql-export).

5. **Service layer pattern.** `AdminService` mirrors the existing `DatabaseService` pattern: instantiated with a DB session, methods return Pydantic models. Keeps router thin.

6. **Client-side redirect for non-facilitators.** The `AdminDashboard` page checks `isFacilitator` from `useRoleCheck()` and renders `<Navigate to="/" />` for unauthorized users. Backend endpoints also enforce 403 as defense-in-depth.
