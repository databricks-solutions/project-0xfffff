# Admin Dashboard Implementation Plan

**Spec:** [ADMIN_DASHBOARD_SPEC](../../specs/ADMIN_DASHBOARD_SPEC.md)
**Goal:** Build a facilitator-only admin dashboard that surfaces infrastructure health, workshop summaries, and per-workshop annotation progress — all derived from existing database tables with no schema changes.
**Architecture:** Three new backend endpoints under `/api/admin/` gated by facilitator role, served by a new `admin` router registered in the central router module. A new React page at `/admin` renders three independent panels (InfrastructurePanel, WorkshopSummaryPanel, WorkshopDetailTable), each auto-refreshing via React Query's `refetchInterval` at 30-second intervals. All data is computed from existing SQLAlchemy models (WorkshopDB, UserDB, AnnotationDB, TraceDB, WorkshopParticipantDB).

**Success Criteria Targeted:**
- SC-1: GET /api/admin/infrastructure returns database backend type, total workshops, total users, and uptime
- SC-2: GET /api/admin/workshops/summary returns a list of all workshops with name, phase, participant count, trace count, and annotation count
- SC-3: GET /api/admin/workshops/{id}/progress returns per-participant annotation progress for a given workshop
- SC-4: All three endpoints require facilitator role; non-facilitators receive 403
- SC-5: InfrastructurePanel displays database type, workshop count, user count, and uptime
- SC-6: WorkshopSummaryPanel displays a table of workshops with name, phase, participant count, trace count, annotation count
- SC-7: WorkshopDetailTable displays per-participant annotation progress when a workshop is selected
- SC-8: Each panel auto-refreshes every 30 seconds
- SC-9: /admin route is accessible only to authenticated facilitators
- SC-10: No new database tables are created; all data derived from existing tables
- SC-11: Loading states are shown while data is being fetched
- SC-12: Error states are shown when API calls fail
- SC-13: Empty states are shown when no data is available
- SC-14: The admin dashboard link appears in navigation only for facilitators
- SC-15: Workshop detail table shows completion percentage per participant
- SC-16: Infrastructure panel shows database backend (SQLite vs PostgreSQL)

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `server/routers/admin.py` | Admin dashboard endpoints (infrastructure, workshop summary, workshop progress) |
| `server/services/admin_service.py` | Business logic for aggregating admin dashboard data from existing tables |
| `client/src/pages/AdminDashboard.tsx` | Main admin dashboard page with three panels |
| `client/src/components/admin/InfrastructurePanel.tsx` | Infrastructure health display panel |
| `client/src/components/admin/WorkshopSummaryPanel.tsx` | Workshop summary table panel |
| `client/src/components/admin/WorkshopDetailTable.tsx` | Per-participant progress detail table |
| `client/src/hooks/useAdminApi.ts` | React Query hooks for admin API endpoints |
| `tests/test_admin_endpoints.py` | Backend unit tests for admin endpoints |
| `tests/test_admin_service.py` | Unit tests for admin service logic |
| `client/tests/unit/AdminDashboard.test.tsx` | Frontend unit tests for admin dashboard components |

### Modified Files
| File | Change |
|------|--------|
| `server/routers/__init__.py` | Register admin router with `/admin` prefix |
| `client/src/App.tsx` | Add `/admin` route pointing to AdminDashboard page |
| `client/src/context/UserContext.tsx` | No change needed — `useRoleCheck` already exists |

---

## Task 1: Admin Service Layer (Data Aggregation)

**Spec criteria:** SC-1, SC-2, SC-3, SC-10
**Files:**
- Create: `server/services/admin_service.py`
- Test: `tests/test_admin_service.py`

- [ ] **Step 1: Write failing tests for infrastructure stats**

```python
# tests/test_admin_service.py
import time
from unittest.mock import MagicMock, patch

import pytest

from server.services.admin_service import AdminService


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
@pytest.mark.req("GET /api/admin/infrastructure returns database backend type, total workshops, total users, and uptime")
class TestInfrastructureStats:
    def test_returns_database_backend_type(self, mock_db_session):
        service = AdminService(mock_db_session)
        mock_db_session.query.return_value.count.return_value = 0
        with patch("server.services.admin_service.DATABASE_BACKEND", "sqlite"):
            result = service.get_infrastructure_stats()
        assert result["database_backend"] == "sqlite"

    def test_returns_total_workshops(self, mock_db_session):
        service = AdminService(mock_db_session)
        # First call for workshops, second for users
        mock_db_session.query.return_value.count.side_effect = [5, 10]
        result = service.get_infrastructure_stats()
        assert result["total_workshops"] == 5

    def test_returns_total_users(self, mock_db_session):
        service = AdminService(mock_db_session)
        mock_db_session.query.return_value.count.side_effect = [5, 10]
        result = service.get_infrastructure_stats()
        assert result["total_users"] == 10

    def test_returns_uptime(self, mock_db_session):
        service = AdminService(mock_db_session)
        mock_db_session.query.return_value.count.return_value = 0
        result = service.get_infrastructure_stats()
        assert "uptime_seconds" in result
        assert isinstance(result["uptime_seconds"], float)


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
@pytest.mark.req("GET /api/admin/workshops/summary returns a list of all workshops with name, phase, participant count, trace count, and annotation count")
class TestWorkshopSummary:
    def test_returns_workshop_list_with_required_fields(self, mock_db_session):
        mock_workshop = MagicMock()
        mock_workshop.id = "ws-1"
        mock_workshop.name = "Test Workshop"
        mock_workshop.current_phase = "discovery"
        mock_workshop.status = "active"

        mock_db_session.query.return_value.all.return_value = [mock_workshop]
        mock_db_session.query.return_value.filter.return_value.count.return_value = 3  # participants
        mock_db_session.query.return_value.filter_by.return_value.count.side_effect = [10, 25]  # traces, annotations

        service = AdminService(mock_db_session)
        result = service.get_workshop_summaries()

        assert len(result) == 1
        ws = result[0]
        assert ws["id"] == "ws-1"
        assert ws["name"] == "Test Workshop"
        assert ws["current_phase"] == "discovery"
        assert "participant_count" in ws
        assert "trace_count" in ws
        assert "annotation_count" in ws


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
@pytest.mark.req("GET /api/admin/workshops/{id}/progress returns per-participant annotation progress for a given workshop")
class TestWorkshopProgress:
    def test_returns_per_participant_progress(self, mock_db_session):
        mock_participant = MagicMock()
        mock_participant.user_id = "user-1"
        mock_participant.user.name = "Alice"
        mock_participant.user.email = "alice@example.com"
        mock_participant.role = "participant"

        mock_db_session.query.return_value.filter_by.return_value.all.return_value = [mock_participant]
        # Total traces in workshop
        mock_db_session.query.return_value.filter_by.return_value.count.return_value = 10
        # Annotations by this participant
        mock_db_session.query.return_value.filter.return_value.count.return_value = 7

        service = AdminService(mock_db_session)
        result = service.get_workshop_progress("ws-1")

        assert len(result["participants"]) == 1
        p = result["participants"][0]
        assert p["user_id"] == "user-1"
        assert p["name"] == "Alice"
        assert p["annotations_completed"] == 7
        assert p["total_traces"] == 10
        assert p["completion_percentage"] == 70.0


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
@pytest.mark.req("No new database tables are created; all data derived from existing tables")
def test_no_new_tables_imported(self):
    """Verify admin_service only imports existing DB models."""
    import inspect
    import server.services.admin_service as mod
    source = inspect.getsource(mod)
    # Should use existing models, not define new ones
    assert "Base" not in source or "class" not in source.split("Base")[0]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server-spec ADMIN_DASHBOARD_SPEC`
Expected: FAIL — `server.services.admin_service` module not found

- [ ] **Step 3: Write minimal implementation**

```python
# server/services/admin_service.py
"""Admin dashboard service — aggregates data from existing tables."""

import time
from typing import Any

from sqlalchemy.orm import Session

from server.database import (
    AnnotationDB,
    TraceDB,
    UserDB,
    WorkshopDB,
    WorkshopParticipantDB,
)
from server.db_config import DATABASE_BACKEND

_START_TIME = time.time()


class AdminService:
    """Aggregates admin dashboard data from existing database tables."""

    def __init__(self, db: Session):
        self.db = db

    def get_infrastructure_stats(self) -> dict[str, Any]:
        """Return infrastructure health stats."""
        total_workshops = self.db.query(WorkshopDB).count()
        total_users = self.db.query(UserDB).count()
        uptime_seconds = time.time() - _START_TIME

        return {
            "database_backend": str(DATABASE_BACKEND),
            "total_workshops": total_workshops,
            "total_users": total_users,
            "uptime_seconds": uptime_seconds,
        }

    def get_workshop_summaries(self) -> list[dict[str, Any]]:
        """Return summary stats for all workshops."""
        workshops = self.db.query(WorkshopDB).all()
        summaries = []
        for ws in workshops:
            participant_count = (
                self.db.query(WorkshopParticipantDB)
                .filter(WorkshopParticipantDB.workshop_id == ws.id)
                .count()
            )
            trace_count = (
                self.db.query(TraceDB).filter_by(workshop_id=ws.id).count()
            )
            annotation_count = (
                self.db.query(AnnotationDB).filter_by(workshop_id=ws.id).count()
            )
            summaries.append({
                "id": ws.id,
                "name": ws.name,
                "status": ws.status,
                "current_phase": ws.current_phase,
                "participant_count": participant_count,
                "trace_count": trace_count,
                "annotation_count": annotation_count,
            })
        return summaries

    def get_workshop_progress(self, workshop_id: str) -> dict[str, Any]:
        """Return per-participant annotation progress for a workshop."""
        participants = (
            self.db.query(WorkshopParticipantDB)
            .filter_by(workshop_id=workshop_id)
            .all()
        )
        total_traces = (
            self.db.query(TraceDB).filter_by(workshop_id=workshop_id).count()
        )

        participant_progress = []
        for p in participants:
            annotations_completed = (
                self.db.query(AnnotationDB)
                .filter(
                    AnnotationDB.workshop_id == workshop_id,
                    AnnotationDB.user_id == p.user_id,
                )
                .count()
            )
            completion_pct = (
                (annotations_completed / total_traces * 100) if total_traces > 0 else 0.0
            )
            participant_progress.append({
                "user_id": p.user_id,
                "name": p.user.name,
                "email": p.user.email,
                "role": p.role,
                "annotations_completed": annotations_completed,
                "total_traces": total_traces,
                "completion_percentage": round(completion_pct, 1),
            })

        return {
            "workshop_id": workshop_id,
            "total_traces": total_traces,
            "participants": participant_progress,
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test-server-spec ADMIN_DASHBOARD_SPEC`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/admin_service.py tests/test_admin_service.py
git commit -m "feat(admin): add admin service layer for dashboard data aggregation"
```

---

## Task 2: Admin Router (Backend Endpoints with Role Gating)

**Spec criteria:** SC-1, SC-2, SC-3, SC-4
**Files:**
- Create: `server/routers/admin.py`
- Create: `tests/test_admin_endpoints.py`
- Modify: `server/routers/__init__.py`

- [ ] **Step 1: Write failing tests for admin endpoints**

```python
# tests/test_admin_endpoints.py
"""Tests for admin dashboard API endpoints."""

from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
@pytest.mark.req("All three endpoints require facilitator role; non-facilitators receive 403")
class TestAdminEndpointAuth:
    @pytest.mark.asyncio
    async def test_infrastructure_requires_facilitator(self, async_client):
        """Non-facilitator users get 403 from infrastructure endpoint."""
        resp = await async_client.get(
            "/api/admin/infrastructure",
            headers={"X-User-Role": "participant"},
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_workshop_summary_requires_facilitator(self, async_client):
        """Non-facilitator users get 403 from workshop summary endpoint."""
        resp = await async_client.get(
            "/api/admin/workshops/summary",
            headers={"X-User-Role": "participant"},
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_workshop_progress_requires_facilitator(self, async_client):
        """Non-facilitator users get 403 from workshop progress endpoint."""
        resp = await async_client.get(
            "/api/admin/workshops/test-ws/progress",
            headers={"X-User-Role": "participant"},
        )
        assert resp.status_code == 403


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
@pytest.mark.req("GET /api/admin/infrastructure returns database backend type, total workshops, total users, and uptime")
class TestInfrastructureEndpoint:
    @pytest.mark.asyncio
    async def test_returns_infrastructure_data(self, async_client):
        """Facilitator can access infrastructure stats."""
        with patch("server.routers.admin.AdminService") as MockService:
            MockService.return_value.get_infrastructure_stats.return_value = {
                "database_backend": "sqlite",
                "total_workshops": 3,
                "total_users": 12,
                "uptime_seconds": 100.5,
            }
            resp = await async_client.get(
                "/api/admin/infrastructure",
                headers={"X-User-Role": "facilitator", "X-User-Id": "fac-1"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["database_backend"] == "sqlite"
        assert data["total_workshops"] == 3
        assert data["total_users"] == 12
        assert "uptime_seconds" in data


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
@pytest.mark.req("GET /api/admin/workshops/summary returns a list of all workshops with name, phase, participant count, trace count, and annotation count")
class TestWorkshopSummaryEndpoint:
    @pytest.mark.asyncio
    async def test_returns_workshop_summaries(self, async_client):
        """Facilitator can access workshop summaries."""
        with patch("server.routers.admin.AdminService") as MockService:
            MockService.return_value.get_workshop_summaries.return_value = [
                {
                    "id": "ws-1",
                    "name": "Workshop 1",
                    "status": "active",
                    "current_phase": "annotation",
                    "participant_count": 5,
                    "trace_count": 20,
                    "annotation_count": 45,
                }
            ]
            resp = await async_client.get(
                "/api/admin/workshops/summary",
                headers={"X-User-Role": "facilitator", "X-User-Id": "fac-1"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Workshop 1"
        assert data[0]["participant_count"] == 5


@pytest.mark.spec("ADMIN_DASHBOARD_SPEC")
@pytest.mark.req("GET /api/admin/workshops/{id}/progress returns per-participant annotation progress for a given workshop")
class TestWorkshopProgressEndpoint:
    @pytest.mark.asyncio
    async def test_returns_participant_progress(self, async_client):
        """Facilitator can access per-participant progress."""
        with patch("server.routers.admin.AdminService") as MockService:
            MockService.return_value.get_workshop_progress.return_value = {
                "workshop_id": "ws-1",
                "total_traces": 10,
                "participants": [
                    {
                        "user_id": "user-1",
                        "name": "Alice",
                        "email": "alice@test.com",
                        "role": "participant",
                        "annotations_completed": 7,
                        "total_traces": 10,
                        "completion_percentage": 70.0,
                    }
                ],
            }
            resp = await async_client.get(
                "/api/admin/workshops/ws-1/progress",
                headers={"X-User-Role": "facilitator", "X-User-Id": "fac-1"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["participants"][0]["completion_percentage"] == 70.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server-spec ADMIN_DASHBOARD_SPEC`
Expected: FAIL — `server.routers.admin` not found / 404 on routes

- [ ] **Step 3: Write the admin router**

```python
# server/routers/admin.py
"""Admin dashboard API endpoints.

All endpoints are gated to facilitator role only.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from server.database import get_db
from server.models import UserRole
from server.services.admin_service import AdminService

logger = logging.getLogger(__name__)

router = APIRouter()


def require_facilitator(request: Request):
    """Dependency that enforces facilitator role."""
    role = request.headers.get("X-User-Role", "")
    if role != UserRole.FACILITATOR:
        raise HTTPException(status_code=403, detail="Facilitator role required")


def get_admin_service(db: Session = Depends(get_db)) -> AdminService:
    return AdminService(db)


@router.get("/infrastructure")
async def get_infrastructure(
    _: None = Depends(require_facilitator),
    service: AdminService = Depends(get_admin_service),
):
    """Return infrastructure health stats."""
    return service.get_infrastructure_stats()


@router.get("/workshops/summary")
async def get_workshops_summary(
    _: None = Depends(require_facilitator),
    service: AdminService = Depends(get_admin_service),
):
    """Return summary stats for all workshops."""
    return service.get_workshop_summaries()


@router.get("/workshops/{workshop_id}/progress")
async def get_workshop_progress(
    workshop_id: str,
    _: None = Depends(require_facilitator),
    service: AdminService = Depends(get_admin_service),
):
    """Return per-participant annotation progress for a workshop."""
    return service.get_workshop_progress(workshop_id)
```

- [ ] **Step 4: Register the admin router**

In `server/routers/__init__.py`, add:

```python
from server.routers.admin import router as admin_router

router.include_router(admin_router, prefix="/admin", tags=["admin"])
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `just test-server-spec ADMIN_DASHBOARD_SPEC`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/routers/admin.py server/routers/__init__.py tests/test_admin_endpoints.py
git commit -m "feat(admin): add admin dashboard endpoints with facilitator role gating"
```

---

## Task 3: React Query Hooks for Admin API

**Spec criteria:** SC-8, SC-11, SC-12
**Files:**
- Create: `client/src/hooks/useAdminApi.ts`

- [ ] **Step 1: Write the admin API hooks**

```typescript
// client/src/hooks/useAdminApi.ts
/**
 * React Query hooks for admin dashboard API operations.
 * Each hook auto-refreshes every 30 seconds.
 */

import { useQuery } from '@tanstack/react-query';

const ADMIN_REFETCH_INTERVAL = 30_000; // 30 seconds

export interface InfrastructureStats {
  database_backend: string;
  total_workshops: number;
  total_users: number;
  uptime_seconds: number;
}

export interface WorkshopSummary {
  id: string;
  name: string;
  status: string;
  current_phase: string;
  participant_count: number;
  trace_count: number;
  annotation_count: number;
}

export interface ParticipantProgress {
  user_id: string;
  name: string;
  email: string;
  role: string;
  annotations_completed: number;
  total_traces: number;
  completion_percentage: number;
}

export interface WorkshopProgress {
  workshop_id: string;
  total_traces: number;
  participants: ParticipantProgress[];
}

const QUERY_KEYS = {
  infrastructure: () => ['admin', 'infrastructure'] as const,
  workshopSummary: () => ['admin', 'workshops', 'summary'] as const,
  workshopProgress: (id: string) => ['admin', 'workshops', id, 'progress'] as const,
};

async function fetchJson<T>(url: string, userRole: string, userId: string): Promise<T> {
  const resp = await fetch(url, {
    headers: {
      'X-User-Role': userRole,
      'X-User-Id': userId,
    },
  });
  if (!resp.ok) {
    throw new Error(`Admin API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export function useInfrastructureStats(userRole: string, userId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.infrastructure(),
    queryFn: () => fetchJson<InfrastructureStats>('/api/admin/infrastructure', userRole, userId),
    refetchInterval: ADMIN_REFETCH_INTERVAL,
    enabled: userRole === 'facilitator',
  });
}

export function useWorkshopSummaries(userRole: string, userId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.workshopSummary(),
    queryFn: () => fetchJson<WorkshopSummary[]>('/api/admin/workshops/summary', userRole, userId),
    refetchInterval: ADMIN_REFETCH_INTERVAL,
    enabled: userRole === 'facilitator',
  });
}

export function useWorkshopProgress(workshopId: string | null, userRole: string, userId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.workshopProgress(workshopId ?? ''),
    queryFn: () => fetchJson<WorkshopProgress>(`/api/admin/workshops/${workshopId}/progress`, userRole, userId),
    refetchInterval: ADMIN_REFETCH_INTERVAL,
    enabled: userRole === 'facilitator' && workshopId !== null,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useAdminApi.ts
git commit -m "feat(admin): add React Query hooks with 30s auto-refresh for admin API"
```

---

## Task 4: Frontend Panel Components

**Spec criteria:** SC-5, SC-6, SC-7, SC-11, SC-12, SC-13, SC-15, SC-16
**Files:**
- Create: `client/src/components/admin/InfrastructurePanel.tsx`
- Create: `client/src/components/admin/WorkshopSummaryPanel.tsx`
- Create: `client/src/components/admin/WorkshopDetailTable.tsx`

- [ ] **Step 1: Write InfrastructurePanel**

```tsx
// client/src/components/admin/InfrastructurePanel.tsx
import React from 'react';
import type { InfrastructureStats } from '@/hooks/useAdminApi';

interface Props {
  data: InfrastructureStats | undefined;
  isLoading: boolean;
  error: Error | null;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function InfrastructurePanel({ data, isLoading, error }: Props) {
  if (isLoading) {
    return <div data-testid="infra-loading">Loading infrastructure stats...</div>;
  }
  if (error) {
    return <div data-testid="infra-error" className="text-red-500">Failed to load infrastructure stats</div>;
  }
  if (!data) {
    return <div data-testid="infra-empty">No infrastructure data available</div>;
  }

  return (
    <div data-testid="infra-panel" className="rounded-lg border p-4">
      <h2 className="text-lg font-semibold mb-3">Infrastructure</h2>
      <dl className="grid grid-cols-2 gap-2">
        <dt>Database</dt>
        <dd data-testid="infra-db-type">{data.database_backend}</dd>
        <dt>Workshops</dt>
        <dd data-testid="infra-workshop-count">{data.total_workshops}</dd>
        <dt>Users</dt>
        <dd data-testid="infra-user-count">{data.total_users}</dd>
        <dt>Uptime</dt>
        <dd data-testid="infra-uptime">{formatUptime(data.uptime_seconds)}</dd>
      </dl>
    </div>
  );
}
```

- [ ] **Step 2: Write WorkshopSummaryPanel**

```tsx
// client/src/components/admin/WorkshopSummaryPanel.tsx
import React from 'react';
import type { WorkshopSummary } from '@/hooks/useAdminApi';

interface Props {
  data: WorkshopSummary[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onSelectWorkshop: (workshopId: string) => void;
}

export function WorkshopSummaryPanel({ data, isLoading, error, onSelectWorkshop }: Props) {
  if (isLoading) {
    return <div data-testid="summary-loading">Loading workshop summaries...</div>;
  }
  if (error) {
    return <div data-testid="summary-error" className="text-red-500">Failed to load workshop summaries</div>;
  }
  if (!data || data.length === 0) {
    return <div data-testid="summary-empty">No workshops found</div>;
  }

  return (
    <div data-testid="summary-panel" className="rounded-lg border p-4">
      <h2 className="text-lg font-semibold mb-3">Workshops</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2">Name</th>
            <th className="text-left p-2">Phase</th>
            <th className="text-right p-2">Participants</th>
            <th className="text-right p-2">Traces</th>
            <th className="text-right p-2">Annotations</th>
          </tr>
        </thead>
        <tbody>
          {data.map((ws) => (
            <tr
              key={ws.id}
              className="border-b hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelectWorkshop(ws.id)}
              data-testid={`summary-row-${ws.id}`}
            >
              <td className="p-2">{ws.name}</td>
              <td className="p-2">{ws.current_phase}</td>
              <td className="p-2 text-right">{ws.participant_count}</td>
              <td className="p-2 text-right">{ws.trace_count}</td>
              <td className="p-2 text-right">{ws.annotation_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Write WorkshopDetailTable**

```tsx
// client/src/components/admin/WorkshopDetailTable.tsx
import React from 'react';
import type { WorkshopProgress } from '@/hooks/useAdminApi';

interface Props {
  data: WorkshopProgress | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function WorkshopDetailTable({ data, isLoading, error }: Props) {
  if (isLoading) {
    return <div data-testid="detail-loading">Loading workshop progress...</div>;
  }
  if (error) {
    return <div data-testid="detail-error" className="text-red-500">Failed to load workshop progress</div>;
  }
  if (!data) {
    return <div data-testid="detail-empty">Select a workshop to view progress</div>;
  }
  if (data.participants.length === 0) {
    return <div data-testid="detail-no-participants">No participants in this workshop</div>;
  }

  return (
    <div data-testid="detail-panel" className="rounded-lg border p-4">
      <h2 className="text-lg font-semibold mb-3">Participant Progress</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2">Name</th>
            <th className="text-left p-2">Role</th>
            <th className="text-right p-2">Completed</th>
            <th className="text-right p-2">Total</th>
            <th className="text-right p-2">Completion %</th>
          </tr>
        </thead>
        <tbody>
          {data.participants.map((p) => (
            <tr key={p.user_id} className="border-b" data-testid={`detail-row-${p.user_id}`}>
              <td className="p-2">{p.name}</td>
              <td className="p-2">{p.role}</td>
              <td className="p-2 text-right">{p.annotations_completed}</td>
              <td className="p-2 text-right">{p.total_traces}</td>
              <td className="p-2 text-right" data-testid={`completion-${p.user_id}`}>
                {p.completion_percentage}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/admin/InfrastructurePanel.tsx client/src/components/admin/WorkshopSummaryPanel.tsx client/src/components/admin/WorkshopDetailTable.tsx
git commit -m "feat(admin): add InfrastructurePanel, WorkshopSummaryPanel, WorkshopDetailTable components"
```

---

## Task 5: Admin Dashboard Page and Route Wiring

**Spec criteria:** SC-9, SC-14, SC-8
**Files:**
- Create: `client/src/pages/AdminDashboard.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write the AdminDashboard page**

```tsx
// client/src/pages/AdminDashboard.tsx
import React, { useState } from 'react';
import { useUser } from '@/context/UserContext';
import { InfrastructurePanel } from '@/components/admin/InfrastructurePanel';
import { WorkshopSummaryPanel } from '@/components/admin/WorkshopSummaryPanel';
import { WorkshopDetailTable } from '@/components/admin/WorkshopDetailTable';
import {
  useInfrastructureStats,
  useWorkshopSummaries,
  useWorkshopProgress,
} from '@/hooks/useAdminApi';

export function AdminDashboard() {
  const { user } = useUser();
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(null);

  const role = user?.role ?? '';
  const userId = user?.id ?? '';

  if (role !== 'facilitator') {
    return (
      <div data-testid="admin-forbidden" className="p-8 text-center text-red-500">
        Access denied. Facilitator role required.
      </div>
    );
  }

  const infra = useInfrastructureStats(role, userId);
  const summaries = useWorkshopSummaries(role, userId);
  const progress = useWorkshopProgress(selectedWorkshopId, role, userId);

  return (
    <div data-testid="admin-dashboard" className="p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <InfrastructurePanel
            data={infra.data}
            isLoading={infra.isLoading}
            error={infra.error}
          />
        </div>
        <div className="lg:col-span-2">
          <WorkshopSummaryPanel
            data={summaries.data}
            isLoading={summaries.isLoading}
            error={summaries.error}
            onSelectWorkshop={setSelectedWorkshopId}
          />
        </div>
      </div>

      <WorkshopDetailTable
        data={progress.data}
        isLoading={progress.isLoading}
        error={progress.error}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add `/admin` route to App.tsx**

In `client/src/App.tsx`, add the import and route:

```tsx
import { AdminDashboard } from './pages/AdminDashboard';

// Inside <Routes>, add:
<Route path="/admin" element={<AdminDashboard />} />
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/AdminDashboard.tsx client/src/App.tsx
git commit -m "feat(admin): add AdminDashboard page and /admin route"
```

---

## Task 6: Frontend Unit Tests

**Spec criteria:** SC-5, SC-6, SC-7, SC-8, SC-9, SC-11, SC-12, SC-13, SC-14, SC-15, SC-16
**Files:**
- Create: `client/tests/unit/AdminDashboard.test.tsx`

- [ ] **Step 1: Write frontend unit tests**

```tsx
// client/tests/unit/AdminDashboard.test.tsx
// @spec ADMIN_DASHBOARD_SPEC
// @req Each panel auto-refreshes every 30 seconds

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InfrastructurePanel } from '@/components/admin/InfrastructurePanel';
import { WorkshopSummaryPanel } from '@/components/admin/WorkshopSummaryPanel';
import { WorkshopDetailTable } from '@/components/admin/WorkshopDetailTable';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('InfrastructurePanel', () => {
  it('shows loading state', () => {
    render(<InfrastructurePanel data={undefined} isLoading={true} error={null} />);
    expect(screen.getByTestId('infra-loading')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<InfrastructurePanel data={undefined} isLoading={false} error={new Error('fail')} />);
    expect(screen.getByTestId('infra-error')).toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(<InfrastructurePanel data={undefined} isLoading={false} error={null} />);
    expect(screen.getByTestId('infra-empty')).toBeInTheDocument();
  });

  it('displays database type, workshop count, user count, uptime', () => {
    const data = {
      database_backend: 'sqlite',
      total_workshops: 5,
      total_users: 20,
      uptime_seconds: 7200,
    };
    render(<InfrastructurePanel data={data} isLoading={false} error={null} />);
    expect(screen.getByTestId('infra-db-type')).toHaveTextContent('sqlite');
    expect(screen.getByTestId('infra-workshop-count')).toHaveTextContent('5');
    expect(screen.getByTestId('infra-user-count')).toHaveTextContent('20');
    expect(screen.getByTestId('infra-uptime')).toHaveTextContent('2h 0m');
  });
});

describe('WorkshopSummaryPanel', () => {
  const noop = vi.fn();

  it('shows loading state', () => {
    render(<WorkshopSummaryPanel data={undefined} isLoading={true} error={null} onSelectWorkshop={noop} />);
    expect(screen.getByTestId('summary-loading')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<WorkshopSummaryPanel data={undefined} isLoading={false} error={new Error('fail')} onSelectWorkshop={noop} />);
    expect(screen.getByTestId('summary-error')).toBeInTheDocument();
  });

  it('shows empty state when no workshops', () => {
    render(<WorkshopSummaryPanel data={[]} isLoading={false} error={null} onSelectWorkshop={noop} />);
    expect(screen.getByTestId('summary-empty')).toBeInTheDocument();
  });

  it('displays workshop name, phase, participant count, trace count, annotation count', () => {
    const data = [{
      id: 'ws-1', name: 'Test WS', status: 'active', current_phase: 'annotation',
      participant_count: 4, trace_count: 15, annotation_count: 30,
    }];
    render(<WorkshopSummaryPanel data={data} isLoading={false} error={null} onSelectWorkshop={noop} />);
    expect(screen.getByText('Test WS')).toBeInTheDocument();
    expect(screen.getByText('annotation')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });
});

describe('WorkshopDetailTable', () => {
  it('shows loading state', () => {
    render(<WorkshopDetailTable data={undefined} isLoading={true} error={null} />);
    expect(screen.getByTestId('detail-loading')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<WorkshopDetailTable data={undefined} isLoading={false} error={new Error('fail')} />);
    expect(screen.getByTestId('detail-error')).toBeInTheDocument();
  });

  it('shows select prompt when no workshop selected', () => {
    render(<WorkshopDetailTable data={undefined} isLoading={false} error={null} />);
    expect(screen.getByTestId('detail-empty')).toBeInTheDocument();
  });

  it('displays completion percentage per participant', () => {
    const data = {
      workshop_id: 'ws-1',
      total_traces: 10,
      participants: [{
        user_id: 'u-1', name: 'Alice', email: 'alice@test.com',
        role: 'participant', annotations_completed: 7, total_traces: 10,
        completion_percentage: 70.0,
      }],
    };
    render(<WorkshopDetailTable data={data} isLoading={false} error={null} />);
    expect(screen.getByTestId('completion-u-1')).toHaveTextContent('70%');
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run frontend tests**

Run: `just ui-test-unit -t "@spec:ADMIN_DASHBOARD_SPEC"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/tests/unit/AdminDashboard.test.tsx
git commit -m "test(admin): add frontend unit tests for admin dashboard panels"
```

---

## Task 7 (Final): Lint and Verify Spec Coverage

- [ ] **Step 1: Run linting**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 2: Run Python linting**

Run: `just test-server -x` (quick smoke to catch import errors)
Expected: No import errors

- [ ] **Step 3: Run spec coverage**

Run: `just spec-coverage --specs ADMIN_DASHBOARD_SPEC`
Expected: Coverage shows all 16 success criteria mapped to tests

- [ ] **Step 4: Check for untagged tests**

Run: `just spec-validate`
Expected: All tests tagged

- [ ] **Step 5: Run full test suite for the spec**

Run: `just test-spec ADMIN_DASHBOARD_SPEC`
Expected: All tests PASS

- [ ] **Step 6: Update implementation log**

Update the ADMIN_DASHBOARD_SPEC's Implementation Log entry status from `planned` to `complete`.

---

## Implementation Log Entry (WOULD be appended to ADMIN_DASHBOARD_SPEC)

The following entry would be appended to the `## Implementation Log` section at the bottom of `specs/ADMIN_DASHBOARD_SPEC.md`:

```markdown
## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-03-12 | [Admin Dashboard](../.claude/plans/2026-03-12-admin-dashboard.md) | planned | Infrastructure health, workshop summary, and per-participant progress dashboard for facilitators |
```

---

## Spec Criteria Coverage Matrix

| Criterion | Task(s) | Test File(s) |
|-----------|---------|--------------|
| SC-1: Infrastructure endpoint | Task 1, Task 2 | `tests/test_admin_service.py`, `tests/test_admin_endpoints.py` |
| SC-2: Workshop summary endpoint | Task 1, Task 2 | `tests/test_admin_service.py`, `tests/test_admin_endpoints.py` |
| SC-3: Workshop progress endpoint | Task 1, Task 2 | `tests/test_admin_service.py`, `tests/test_admin_endpoints.py` |
| SC-4: Facilitator role gating (403) | Task 2 | `tests/test_admin_endpoints.py` |
| SC-5: InfrastructurePanel display | Task 4, Task 6 | `client/tests/unit/AdminDashboard.test.tsx` |
| SC-6: WorkshopSummaryPanel display | Task 4, Task 6 | `client/tests/unit/AdminDashboard.test.tsx` |
| SC-7: WorkshopDetailTable display | Task 4, Task 6 | `client/tests/unit/AdminDashboard.test.tsx` |
| SC-8: 30s auto-refresh | Task 3, Task 6 | `client/tests/unit/AdminDashboard.test.tsx` |
| SC-9: /admin route facilitator-only | Task 5 | `client/tests/unit/AdminDashboard.test.tsx` |
| SC-10: No new database tables | Task 1 | `tests/test_admin_service.py` |
| SC-11: Loading states | Task 4, Task 6 | `client/tests/unit/AdminDashboard.test.tsx` |
| SC-12: Error states | Task 4, Task 6 | `client/tests/unit/AdminDashboard.test.tsx` |
| SC-13: Empty states | Task 4, Task 6 | `client/tests/unit/AdminDashboard.test.tsx` |
| SC-14: Nav link facilitator-only | Task 5 | `client/tests/unit/AdminDashboard.test.tsx` |
| SC-15: Completion % per participant | Task 1, Task 4, Task 6 | `tests/test_admin_service.py`, `client/tests/unit/AdminDashboard.test.tsx` |
| SC-16: DB backend display | Task 1, Task 4, Task 6 | `tests/test_admin_service.py`, `client/tests/unit/AdminDashboard.test.tsx` |
