# Workshop ID Simplification

## Overview

The `workshop_id` parameter is threaded explicitly through every layer of the stack — **1,060 backend references** (71 service methods, 124 routes) and **1,171 frontend references** (33 files). Every call site manually passes it: URL path → React context → API service → route handler → database service → SQL WHERE clause. This creates pervasive coupling where `workshop_id` does double duty as both a **data partitioning key** and an **authorization mechanism**, but is resolved and validated repeatedly instead of once.

Cross-references: ARCH-1 (god service), ARCH-2 (business logic in routes), CQ-1 (god file workshops.py), REACT_PATTERNS_DEBT (context provider pollution).

---

## Current Flow

```
React Component
  → useWorkshopContext()           # resolve from URL/query/localStorage
  → WorkshopsService.method(workshopId, ...)   # explicit param in every API call
  → GET /workshops/{workshop_id}/...           # path param on every route
  → db_service.method(workshop_id, ...)        # explicit param on every service method
  → SELECT ... WHERE workshop_id = ?           # explicit filter on every query
```

The parameter appears at 5 distinct layers with no implicit resolution at any of them.

---

## Suggestions

### WSID-1: Backend middleware — resolve workshop_id once via FastAPI dependency

**Addresses**: Explicit `workshop_id` path param on 124 routes, manual validation in each handler

**Current pattern**:
```python
@router.get("/{workshop_id}/traces")
async def get_traces(workshop_id: str, db_service=Depends(get_database_service)):
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(404)
    traces = db_service.get_traces(workshop_id, ...)
    ...
```

**Proposed pattern**:
```python
class WorkshopContext:
    """Resolved once per request. Validates existence and access."""
    def __init__(self, workshop: Workshop, workshop_id: str):
        self.workshop = workshop
        self.workshop_id = workshop_id

async def get_workshop_context(
    workshop_id: str = Path(...),
    db_service: DatabaseService = Depends(get_database_service),
    current_user: User = Depends(get_current_user),
) -> WorkshopContext:
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")
    # Centralized access check — participant/SME must belong to this workshop
    if current_user.role in ("participant", "sme"):
        if not db_service.is_participant(workshop_id, current_user.id):
            raise HTTPException(status_code=403, detail="Not a member of this workshop")
    return WorkshopContext(workshop=workshop, workshop_id=workshop_id)

@router.get("/{workshop_id}/traces")
async def get_traces(ctx: WorkshopContext = Depends(get_workshop_context)):
    traces = db_service.get_traces(ctx.workshop_id, ...)
    ...
```

**What this buys**:
- Workshop existence + access validated exactly once per request
- Route handlers no longer repeat the lookup/404 pattern
- Authorization logic centralized instead of scattered across handlers
- Foundation for the service-scoping pattern (WSID-2)

**Incremental path**: Can be adopted route-by-route without a big-bang migration. Add the dependency, update one router file at a time.

---

### WSID-2: Scoped service instances — eliminate workshop_id from method signatures

**Addresses**: 71 `DatabaseService` methods that all accept `workshop_id` as first parameter

**Current pattern**:
```python
db_service.get_traces(workshop_id, user_id)
db_service.get_findings(workshop_id)
db_service.add_annotation(workshop_id, data)
db_service.get_rubric(workshop_id)
db_service.get_mlflow_config(workshop_id)
```

**Proposed pattern**:
```python
# Factory on the base service (or on individual domain services after ARCH-1 split)
class WorkshopScopedService:
    def __init__(self, db_service: DatabaseService, workshop_id: str):
        self._db = db_service
        self._workshop_id = workshop_id

    def get_traces(self, user_id: str | None = None) -> list[Trace]:
        return self._db.get_traces(self._workshop_id, user_id)

    def get_findings(self) -> list[DiscoveryFinding]:
        return self._db.get_findings(self._workshop_id)

    def add_annotation(self, data: AnnotationCreate) -> Annotation:
        return self._db.add_annotation(self._workshop_id, data)
    ...

# Usage in route handlers (pairs with WSID-1):
@router.get("/{workshop_id}/traces")
async def get_traces(ctx: WorkshopContext = Depends(get_workshop_context)):
    svc = ctx.scoped_service  # or Depends(get_scoped_service)
    return svc.get_traces(user_id=...)
```

**What this buys**:
- Removes `workshop_id` from every method call site
- Makes it impossible to accidentally cross workshop boundaries within a request
- Pairs naturally with the ARCH-1 god service split — each domain service can be independently scoped

**Relationship to ARCH-1**: This can be done *before* the god service split as a thin wrapper, or *during* the split by building scoping into each new domain service. The latter is cleaner but couples the two efforts.

---

### WSID-3: Frontend — scope the API client from auth state

**Addresses**: 1,171 frontend references, `useWorkshopContext()` + null-check pattern in 11+ pages, workshopId threaded into every API call and query key

**Current pattern**:
```typescript
// Repeated in every page component
const { workshopId } = useWorkshopContext();

useEffect(() => {
  if (!workshopId) return;
  loadData();
}, [workshopId]);

// Every API call passes it explicitly
WorkshopsService.getTracesWorkshopsWorkshopIdTracesGet(workshopId, userId);

// Every query key includes it
queryKey: ['traces', workshopId]
```

**Proposed pattern**:
```typescript
// Workshop API hook — resolves workshopId internally from auth/context
function useWorkshopApi() {
  const { workshopId } = useWorkshopContext();

  return useMemo(() => ({
    getTraces: (userId?: string) =>
      WorkshopsService.getTracesWorkshopsWorkshopIdTracesGet(workshopId!, userId),
    getFindings: (userId?: string) =>
      WorkshopsService.getFindingsWorkshopsWorkshopIdFindingsGet(workshopId!, userId),
    addAnnotation: (data: AnnotationCreate) =>
      WorkshopsService.addAnnotationWorkshopsWorkshopIdAnnotationsPost(workshopId!, data),
    // ...
  }), [workshopId]);
}

// Page components become cleaner
function AnnotationPage() {
  const api = useWorkshopApi();
  const { data: traces } = useQuery({
    queryKey: ['traces'],  // workshopId no longer in key — handled by scoped client
    queryFn: () => api.getTraces(userId),
  });
}
```

**What this buys**:
- Components no longer import `useWorkshopContext` for API calls
- Eliminates the `if (!workshopId) return` guard repeated in 11+ pages
- Query keys simplified (workshopId is implicit in the client scope)
- Centralizes the null-safety check for workshopId

**Note on query keys**: If multiple workshops could be viewed in a single session, you'd still want workshopId in query keys for cache isolation. But the current app is single-workshop-at-a-time, so scoped keys work.

---

### WSID-4: Store workshop_id in JWT claims (longer-term)

**Addresses**: The three-source resolution in `WorkshopContext.tsx` (URL path, query param, localStorage), auth-layer complexity

**Current state**: Workshop ID comes from URL parsing or localStorage. Login validates it but doesn't embed it in the token.

**Proposed**: When a participant/SME logs in with a `workshop_id`, embed it in the JWT. The backend can then resolve workshop context from the token itself for non-facilitator users, and facilitators can switch workshops explicitly.

**What this buys**:
- Single source of truth for "which workshop am I in"
- Backend can resolve workshop from auth header alone (no path param needed for most routes)
- Eliminates the three-source resolution logic and its edge cases
- Cleaner facilitator vs. participant auth model

**Trade-off**: Facilitators manage multiple workshops and need to switch freely. The JWT approach works best for participants (single workshop), while facilitators would continue using explicit workshop selection. This is fine — it matches the actual access pattern.

---

## Sequencing

| Order | Item | Depends On | Effort |
|-------|------|------------|--------|
| 1 | WSID-1: Backend middleware | Nothing | 2-4 hours |
| 2 | WSID-2: Scoped services | WSID-1, benefits from ARCH-1 | 1-2 days |
| 3 | WSID-3: Frontend scoped client | Nothing (independent) | 4-8 hours |
| 4 | WSID-4: JWT claims | WSID-1 | 1 day |

WSID-1 and WSID-3 are independent and can be done in parallel. WSID-2 builds on WSID-1. WSID-4 is optional but completes the picture.
