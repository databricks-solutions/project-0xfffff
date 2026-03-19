# Exhaustive Deps Analysis

Analysis of `react-hooks/exhaustive-deps` warnings aligned with TanStack Query best practices.

## Core Principle

> "Server state is totally different... Is persisted remotely, requires asynchronous APIs, implies shared ownership, can become 'out of date'"

Any `useEffect` that fetches data is an **anti-pattern** when TanStack Query is available. Many of these warnings are symptoms of architectural issues, not just missing dependencies.

---

## Category 1: Data Fetching Anti-Patterns

These should be refactored to use TanStack Query instead of `useEffect` + `fetch` + `setState`.

### IntakePage.tsx:100 - `loadStatus`

**Current (anti-pattern):**
```tsx
useEffect(() => {
  loadStatus();
}, [workshopId]);

const loadStatus = async () => {
  const response = await fetch(`/workshops/${workshopId}/mlflow-status`);
  const statusData = await response.json();
  setStatus(statusData);
  setConfig(prev => ({ ...prev, ...statusData.config }));
};
```

**Problem:** Manual server state management - no caching, no deduping, no background refetch, no stale detection.

**Fix:** Create a proper hook in `useWorkshopApi.ts`:
```tsx
export function useMLflowStatus(workshopId: string) {
  return useQuery({
    queryKey: ['mlflow-status', workshopId],
    queryFn: async () => {
      const response = await fetch(`/workshops/${workshopId}/mlflow-status`);
      if (!response.ok) throw new Error('Failed to fetch status');
      return response.json();
    },
    enabled: !!workshopId,
  });
}

// In IntakePage.tsx
const { data: status } = useMLflowStatus(workshopId);
```

---

### JudgeTuningPage.tsx:279 - `loadInitialData`

**Current (anti-pattern):**
```tsx
useEffect(() => {
  if (workshopId) {
    loadInitialData();
  }
}, [workshopId]);
```

**Problem:** Same anti-pattern - manual data fetching that bypasses TanStack Query's benefits.

**Fix:** The page already uses `useRubric` and `useFacilitatorAnnotations`. Verify `loadInitialData` isn't duplicating those queries. If it's fetching additional data, create proper hooks.

---

## Category 2: Derived State

These use `useEffect` to transform data from query results. Should use `select` option or `useMemo` instead.

### AnnotationDemo.tsx:350, 377, 431 - Processing `existingAnnotations`

**Current Pattern:**
```tsx
const { data: existingAnnotations } = useUserAnnotations(workshopId!, user);

// Multiple useEffects to transform this data:
useEffect(() => {
  if (existingAnnotations && existingAnnotations.length > 0) {
    existingAnnotations.forEach(annotation => {
      // ... complex transformation into savedStateRef
    });
  }
}, [existingAnnotations?.length, rubricQuestions.length]);
```

**Problem:** Using `useEffect` to derive/transform data from a query result. This is client-side computation, not server state management.

**Fix Options:**

1. **Use `select` in the query** (if transformation is always needed):
```tsx
const { data: processedAnnotations } = useUserAnnotations(workshopId!, user, {
  select: (annotations) => annotations.map(a => ({
    ...a,
    parsedRatings: parseRatings(a),
    parsedComment: parseLoadedComment(a.comment)
  }))
});
```

2. **Use `useMemo`** (for local transformations):
```tsx
const savedState = useMemo(() => {
  if (!existingAnnotations) return new Map();
  const map = new Map();
  existingAnnotations.forEach(annotation => {
    map.set(annotation.trace_id, {
      ratings: parseRatings(annotation),
      ...parseLoadedComment(annotation.comment)
    });
  });
  return map;
}, [existingAnnotations]);
```

Additionally, `parseLoadedComment` should be moved outside the component (it's a pure function with no closures).

---

### TraceViewerDemo.tsx:214 - Processing `existingFindings`

**Same pattern** - useEffect to transform TanStack Query data into a ref.

**Fix:** Use `useMemo`:
```tsx
const savedState = useMemo(() => {
  const map = new Map<string, string>();
  existingFindings?.forEach(finding => {
    map.set(finding.trace_id, finding.insight || '');
  });
  return map;
}, [existingFindings]);
```

---

### IRRResultsDemo.tsx:179 - `perMetricScores`

**Current (creates new reference every render):**
```tsx
const perMetricScores = irrResult?.details?.per_metric_scores || {};
```

**Fix:**
```tsx
const perMetricScores = useMemo(
  () => irrResult?.details?.per_metric_scores ?? {},
  [irrResult?.details?.per_metric_scores]
);
```

---

## Category 3: Client State Synchronization

These are legitimate client state sync patterns (not server state). Fix by memoizing functions.

### WorkshopContext.tsx:140, 148, 183 - `handleSetWorkshopId`

**This is legitimate client state sync** - coordinating workshopId across URL, localStorage, and UserContext. Not server state.

**Fix:** Wrap in `useCallback`:
```tsx
const handleSetWorkshopId = useCallback((id: string | null) => {
  if (id !== workshopId) {
    queryClient.invalidateQueries();
    queryClient.clear();
    setWorkshopId(id);
    setWorkshop(null);
    if (id) {
      localStorage.setItem('workshop_id', id);
    } else {
      localStorage.removeItem('workshop_id');
    }
  }
}, [workshopId, queryClient]);
```

Then add `handleSetWorkshopId` to all three useEffect dependency arrays.

---

### DBSQLExportPage.tsx:144, 156 - `saveStateToStorage`

**This is client state persistence** (localStorage), not server state.

**Fix:** Wrap in `useCallback`:
```tsx
const saveStateToStorage = useCallback((overrides = {}) => {
  localStorage.setItem(storageKey, JSON.stringify({
    state: { databricksHost, databricksToken, httpPath, catalog, schemaName, ...overrides },
    timestamp: Date.now()
  }));
}, [workshopId, databricksHost, databricksToken, httpPath, catalog, schemaName]);
```

---

## Category 4: Real Bugs

### TraceViewerDemo.tsx:437 - Missing `discoveryQuestions` in useCallback

**Current:**
```tsx
const saveFinding = useCallback(async (responses, traceId, isBackground) => {
  const content = serializeResponsesToInsight(discoveryQuestions, responses);
  // ...
}, [submitFinding, user?.id]); // BUG: missing discoveryQuestions
```

**Problem:** If `discoveryQuestions` changes, the callback will use stale questions. This is a real bug that could cause data corruption.

**Fix:** Add to deps:
```tsx
}, [submitFinding, user?.id, discoveryQuestions]);
```

---

## Category 5: Intentional Exclusions

These are cases where dependencies are intentionally excluded. Add disable comments with explanations.

### WorkflowContext.tsx:123

The effect computes and sets `completedPhases` - adding it as a dep would cause infinite loop.

```tsx
}, [traces, findings, rubric, annotations, participants, workshopId, user, workshop?.current_phase]);
// eslint-disable-next-line react-hooks/exhaustive-deps -- writes to completedPhases, cannot be a dependency
```

---

### JudgeTuningPage.tsx:301

Intentionally runs only on mount to load cached localStorage data, not on every question change.

```tsx
}, [workshopId]); // Only run on mount, not on question change
// eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes selectedQuestionIndex to only run on mount
```

---

### WorkshopDemoLanding.tsx:207

Error recovery logic that intentionally doesn't re-run when `createWorkshop` or `setWorkshopId` references change.

```tsx
}, [workshopError, workshopId, user?.role, isAutoRecovering]);
// eslint-disable-next-line react-hooks/exhaustive-deps -- error recovery should only trigger on error/workshopId changes
```

---

### WorkshopDemoLanding.tsx:306

Navigation logic that intentionally excludes `isManualNavigation` to avoid re-running when the flag changes.

```tsx
}, [user, workshop, currentPhase, currentView]);
// eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes isManualNavigation to prevent circular updates
```

---

## Summary Table

| File | Line | Issue | Category | Fix |
|------|------|-------|----------|-----|
| IntakePage.tsx | 100 | loadStatus | Data Fetching | **Create useMLflowStatus hook** |
| JudgeTuningPage.tsx | 279 | loadInitialData | Data Fetching | **Use existing TanStack hooks** |
| AnnotationDemo.tsx | 350,377,431 | parseLoadedComment, rubricQuestions | Derived State | **useMemo + move function outside** |
| TraceViewerDemo.tsx | 214 | existingFindings | Derived State | **useMemo** |
| IRRResultsDemo.tsx | 179 | perMetricScores | Derived State | **useMemo** |
| WorkshopContext.tsx | 140,148,183 | handleSetWorkshopId | Client State | **useCallback** |
| DBSQLExportPage.tsx | 144,156 | saveStateToStorage | Client State | **useCallback** |
| TraceViewerDemo.tsx | 437 | discoveryQuestions | **Real Bug** | **Add to deps** |
| WorkflowContext.tsx | 123 | completedPhases, workshop | Intentional | **Disable comment** |
| JudgeTuningPage.tsx | 301 | selectedQuestionIndex | Intentional | **Disable comment** |
| WorkshopDemoLanding.tsx | 207 | createWorkshop, etc. | Intentional | **Disable comment** |
| WorkshopDemoLanding.tsx | 306 | isManualNavigation | Intentional | **Disable comment** |

---

## Implementation Order

1. **Fix the real bug** (TraceViewerDemo:437) - Highest priority, could cause data issues
2. **Create useMLflowStatus hook** (IntakePage refactor) - Proper TanStack Query pattern
3. **useMemo fixes** (AnnotationDemo, TraceViewerDemo, IRRResultsDemo) - Remove derived state anti-pattern
4. **useCallback fixes** (WorkshopContext, DBSQLExportPage) - Stabilize function references
5. **Disable comments** for intentional exclusions - Document the reasoning
