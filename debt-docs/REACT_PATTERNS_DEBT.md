# React Patterns Debt

## Overview

The React frontend has strong library choices (TanStack Query, Radix UI, Tailwind) and some well-designed hooks (`useWorkshopApi.ts` has excellent optimistic update patterns). But the component architecture has significant structural debt: React Router is essentially unused — all real navigation happens via component state, breaking browser history and deep linking. The largest component (JudgeTuningPage, 2,754 lines) has 32 useState hooks and 15+ direct fetch() calls, functioning as a mini-application. There are no error boundaries, no form library, no code splitting, and contexts mix data fetching, cache orchestration, and state management. The codebase would benefit from treating React Router as the navigation backbone, decomposing page-level components, and extracting concerns that have outgrown their containers.

---

## Items

### RC-1: React Router Unused for Application Navigation

**Severity**: CRITICAL
**Location**:
- `client/src/App.tsx:16-35` — only 2 routes defined
- `client/src/pages/WorkshopDemoLanding.tsx:64-250` — internal state-based "routing"
- `client/src/context/WorkflowContext.tsx` — phase state replaces URL state
- `client/src/context/WorkshopContext.tsx:157-183` — manual `popstate` listener

**Description**: React Router v6 is installed but the application defines only 2 routes:
- `/` → `WorkshopDemoLanding`
- `/trace-viewer-demo` → `TraceDataViewerDemo`

All real navigation (intake → discovery → rubric → annotation → results → judge_tuning) happens inside `WorkshopDemoLanding` via component state:

```typescript
// WorkshopDemoLanding.tsx — acts as a component-based router
const getViewForPhaseWithState = (role, requestedPhase, state) => {
  // Maps phase → component view based on state
  // Returns 'discovery-start', 'annotation-monitor', etc.
}
```

Phase changes call `setCurrentPhase()` in WorkflowContext, which updates component state — but **never updates the URL**. Meanwhile, `WorkshopContext` has a manual `popstate` listener to sync workshop IDs from URL, creating a half-implemented URL ↔ state bridge.

**What breaks**:
- Browser back/forward doesn't work for phase navigation
- Bookmarking a specific phase is impossible
- Deep linking (e.g., sharing a URL to the annotation phase) doesn't work
- `Cmd+click` to open in new tab doesn't work for sidebar navigation
- Analytics/logging can't track page views by URL

**Remediation**: Move phase navigation into React Router:
```
/workshop/:workshopId/discovery
/workshop/:workshopId/annotation
/workshop/:workshopId/rubric
/workshop/:workshopId/judge-tuning
/workshop/:workshopId/results
```

Use `<Outlet>` for nested layouts, route loaders for data fetching, and route guards for phase gating.

**Acceptance Criteria**:
- [ ] Each workshop phase has a distinct URL
- [ ] Browser back/forward navigates between phases
- [ ] Deep linking to any phase works
- [ ] No `currentPhase` component state — URL is source of truth

---

### RC-2: JudgeTuningPage — 2,754-Line Component with 32 useState Hooks

**Severity**: CRITICAL
**Location**: `client/src/pages/JudgeTuningPage.tsx`

**Description**: This single component is 2,754 lines with:
- **32 `useState` hooks** (lines 62-123) managing:
  - Prompt editing state (5 hooks)
  - Evaluation results and metrics (4 hooks)
  - Configuration state (4 hooks)
  - Loading/error flags (5 hooks)
  - Alignment state (5 hooks)
  - Auto-evaluation state (4 hooks)
  - UI state — pagination, expanded rows, mode (5 hooks)
- **15+ direct `fetch()` calls** bypassing TanStack Query and the generated client
- **Multiple `useEffect` chains** for data loading, polling, and state synchronization
- **Manual polling** with `setInterval` for auto-evaluation status
- **Business logic** (prompt derivation, metrics calculation, model mapping) mixed with rendering
- **`any` types** on lines 70, 109 (`useState<any>`)

This component functions as a complete sub-application. It handles prompt management, evaluation execution, alignment calculation, metrics display, auto-evaluation polling, and export — each of which is a separate concern.

**State that should be server state (TanStack Query)**:
- `prompts`, `evaluations`, `metrics`, `rubric`, `mlflowConfig` — all fetched from the server
- `autoEvalStatus`, `autoEvalJobId` — server polling state

**State that should be derived (useMemo/computed)**:
- `isModified` — derivable from `currentPrompt !== originalPromptText`
- `hasEvaluated` — derivable from `evaluations.length > 0`

**State that could use useReducer**:
- The 5 alignment state hooks (`isRunningAlignment`, `alignmentLogs`, `alignmentResult`, `showAlignmentLogs`, `alignmentModel`) are a state machine

**Remediation**: Decompose into:
1. `JudgeTuningPage` — layout orchestrator only
2. `PromptEditor` — prompt creation/editing/selection
3. `EvaluationRunner` — evaluation execution and results
4. `AlignmentPanel` — human-judge alignment calculation
5. `AutoEvaluationStatus` — auto-eval polling and display
6. `useJudgePrompts()` — TanStack Query hook for prompt CRUD
7. `useEvaluations()` — TanStack Query hook for evaluation state
8. `useAutoEvaluation()` — TanStack Query hook with `refetchInterval` for polling

**Acceptance Criteria**:
- [ ] JudgeTuningPage under 300 lines
- [ ] Zero direct `fetch()` calls — all through TanStack Query hooks
- [ ] Server state managed by `useQuery`/`useMutation`, not `useState`
- [ ] No manual `setInterval` polling

---

### RC-3: No Error Boundaries Anywhere in the Application

**Severity**: HIGH
**Location**: Entire `client/src/` — zero `ErrorBoundary` components exist

**Description**: The application has no React error boundaries. If any component throws during rendering (e.g., accessing a property of `undefined`, JSON parse failure, API response shape change), the entire application crashes with a white screen.

Components most at risk:
- **TraceViewer.tsx** (1,650 lines) — complex JSON parsing with multiple fallback paths
- **JudgeTuningPage.tsx** (2,754 lines) — many data dependencies, any missing field crashes render
- **FacilitatorDashboard.tsx** (1,325 lines) — derived metrics from multiple queries

Error handling currently relies on:
- `try/catch` in event handlers (doesn't catch render errors)
- Toast notifications for API errors (doesn't catch render errors)
- Optional chaining (`?.`) to prevent null access (fragile, can still miss cases)

**Remediation**: Add error boundaries at three levels:
1. **App-level**: Catch any unhandled error with a "Something went wrong" fallback
2. **Page-level**: Each route gets a boundary so one page crashing doesn't break others
3. **Widget-level**: TraceViewer, evaluation grid, and dashboard cards each get boundaries so a single widget failure shows a graceful degradation, not a page crash

**Acceptance Criteria**:
- [ ] App-level error boundary with recovery action (reload)
- [ ] Page-level error boundaries for each phase view
- [ ] Widget-level boundaries for TraceViewer, dashboard, and evaluation components
- [ ] Error boundary logs errors to a reporting service

---

### RC-4: Large Components — 6 Components Over 500 Lines

**Severity**: HIGH
**Location**:

| Component | Lines | useState | Responsibilities |
|-----------|-------|----------|------------------|
| `pages/JudgeTuningPage.tsx` | 2,754 | 32 | Prompt editing, evaluation, alignment, auto-eval, metrics, export |
| `components/TraceViewer.tsx` | 1,650 | 0 | JSON parsing, LLM extraction, smart rendering, tab UI |
| `components/FacilitatorDashboard.tsx` | 1,325 | 6 | Metrics, phase management, trace ops, progress cards, actions |
| `components/TraceDataViewer.tsx` | 730 | 0 | Trace display, content extraction, download, SQL generation |
| `pages/WorkshopDemoLanding.tsx` | 649 | 0 | Phase routing, sidebar, layout orchestration |
| `components/RoleBasedWorkflow.tsx` | 630 | 0 | Phase navigation, role-based menu, completion badges |
| `components/FocusedAnalysisView.tsx` | 605 | 3 | Trace navigation, CSV export, annotation UI |
| `components/DatabricksModelTester.tsx` | 582 | 11 | Connection testing, model selection, chat, endpoint calling |

**Description**: Each of these components handles multiple distinct responsibilities. The React mental model is "small, composable components" — when a component exceeds ~300 lines, it usually means multiple concerns are entangled.

**TraceViewer** (1,650 lines) is particularly notable: ~90 utility functions for JSON repair, parsing, and content extraction are defined *inside* the component file. These are pure functions with no React dependencies — they belong in a `utils/` module.

**FacilitatorDashboard** (1,325 lines) renders completely different UIs based on `focusPhase` ('discovery' | 'annotation' | null). Contains 60 ternary operators and 27 `&&` conditional chains. These conditional branches are separate views that should be separate components.

**Remediation**: Apply single-responsibility principle. Extract:
- Pure utility functions → `utils/` modules
- Conditional UI branches → sub-components
- State machines (loading/error/success) → custom hooks or `useReducer`
- Business logic (metrics calculation, data transformation) → hooks

**Acceptance Criteria**:
- [ ] No component over 500 lines
- [ ] Pure utility functions in `utils/`, not in component files
- [ ] Conditional rendering branches extracted into named components

---

### RC-5: Context Providers Mix Concerns — Data Fetching, Caching, State, and Side Effects

**Severity**: HIGH
**Location**:
- `client/src/context/UserContext.tsx` (288 lines)
- `client/src/context/WorkshopContext.tsx` (208 lines)
- `client/src/context/WorkflowContext.tsx` (180 lines)

**Description**: Each context provider handles multiple cross-cutting concerns:

**UserContext** (288 lines) does:
1. Authentication (login/logout API calls)
2. Permission loading (separate API call)
3. localStorage persistence (read + write + sync)
4. User validation (checks if cached user still exists via API)
5. Activity tracking (`updateLastActive()` API call)
6. Fallback permission defaults when API fails
7. Mixed API patterns (uses both `UsersService` generated client AND raw `fetch()`)

**WorkshopContext** (208 lines) does:
1. Workshop ID state management
2. URL parsing (extracts workshop ID from path or query params)
3. UUID validation
4. localStorage persistence
5. React Query cache orchestration (`queryClient.clear()`, `invalidateQueries()`, `removeQueries()`)
6. `popstate` event listener for browser back/forward
7. User ↔ Workshop sync (when user logs in with workshop_id)
8. Hardcoded filter for a known invalid ID (`'569c0be9-...'`)

**WorkflowContext** (180 lines) does:
1. Current phase state
2. Phase progression calculation (derived from 6 TanStack Query hooks)
3. Phase auto-completion logic (rubric complete when annotations start, etc.)
4. Phase enablement rules
5. Backend ↔ frontend phase sync via useEffect

**Problems**:
- WorkshopContext calls `queryClient.clear()` 4 times — wiping the entire cache instead of targeted invalidation
- WorkflowContext has a useEffect with 9 dependencies, creating re-render risk
- UserContext mixes imperative API calls with declarative React state
- No context splits — changing workshop ID triggers permission reload, cache clear, and phase recalculation simultaneously

**Remediation**:
- Split UserContext into `AuthContext` (login/logout) and `PermissionsContext` (role/permissions)
- Move cache orchestration out of WorkshopContext into query invalidation hooks
- Replace WorkflowContext's derived state with TanStack Query selectors
- Remove localStorage sync from contexts — use a dedicated persistence hook

**Acceptance Criteria**:
- [ ] Each context has a single responsibility
- [ ] Zero `queryClient.clear()` calls in contexts
- [ ] No localStorage reads/writes in context providers
- [ ] Context updates don't trigger unnecessary re-renders of unrelated components

---

### RC-6: No Form Library — All Forms Use Manual useState

**Severity**: MEDIUM
**Location**:
- `client/src/components/UserLogin.tsx` — manual `useState` for form fields
- `client/src/pages/IntakePage.tsx` — manual `useState` for MLflow config form
- `client/src/components/DatabricksModelTester.tsx` — 11 `useState` for form state
- `client/src/components/CustomLLMProviderConfig.tsx` — 9 `useState` including `formData` object
- `client/src/components/FacilitatorUserManager.tsx` — manual `useState` for new user form
- `client/src/components/FacilitatorInvitationManager.tsx` — manual `useState` for invitation form
- `client/src/components/AnnotationStartPage.tsx` — 5 `useState` for configuration form

**Description**: Every form in the application manages field state manually:
```typescript
const [formData, setFormData] = useState({ email: '', name: '', role: 'participant' });
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

No form library (react-hook-form, formik) is used. Consequences:
- **No validation**: Only HTML5 `required` and `type="email"` — no custom validation
- **No field-level errors**: Errors are displayed as a single string, not per-field
- **No dirty tracking**: Can't tell if a form has been modified
- **No submit state management**: Manual `isLoading`/`isSubmitting` flags
- **No form reset**: Manual re-initialization of state
- **Inconsistent patterns**: Each form implements its own submission/error pattern

The `DatabricksModelTester` is the most extreme example — 11 `useState` hooks for what is essentially a single form with model selection, prompt input, and configuration fields.

**Remediation**: Adopt `react-hook-form` (already in the React ecosystem, works with Radix UI components):
- Replaces 5-11 `useState` hooks per form with a single `useForm()` call
- Built-in validation with `zod` schema (can share with Pydantic schemas)
- Field-level error display
- Dirty/touched tracking
- Submit state management

**Acceptance Criteria**:
- [ ] Form library adopted for all forms with 3+ fields
- [ ] Client-side validation with per-field error messages
- [ ] Consistent form submission pattern across all components

---

### RC-7: Conditional Rendering Complexity — FacilitatorDashboard Has 60 Ternaries

**Severity**: MEDIUM
**Location**:
- `client/src/components/FacilitatorDashboard.tsx` — 60 ternary operators, 27 `&&` chains
- `client/src/components/AnnotationStartPage.tsx:380-400` — 4-way nested ternary in button

**Description**: `FacilitatorDashboard` renders completely different layouts based on `focusPhase`:
- `focusPhase === 'discovery'` → Discovery monitoring view
- `focusPhase === 'annotation'` → Annotation monitoring view
- `focusPhase === null` → General dashboard view

These are **three different views** packed into one component with ternary operators:

```typescript
// Lines 553-837: Cards section
{focusPhase !== 'annotation' && (<Card>  // Discovery card
  {focusPhase === 'discovery' ? <Badge>Viewing</Badge> : null}
  {(currentPhase === 'discovery' || focusPhase === 'discovery') ? (
    // Discovery-specific content
  ) : (
    // General content
  )}
</Card>)}

// Similar pattern repeats for annotation card, actions, etc.
```

`AnnotationStartPage` has a 4-way nested ternary for a single button:
```typescript
{isStarting ? (<>Starting...</>)
  : totalTraces === 0 ? (<>No Traces Available</>)
  : !rubric ? (<>Rubric Required</>)
  : (<>Start Annotation Phase</>)}
```

**Impact**: Hard to read, hard to test individual branches, high cognitive complexity. Adding a new phase requires touching conditional logic throughout the file.

**Remediation**: Extract conditional branches into separate components:
```typescript
// Instead of 60 ternaries:
{focusPhase === 'discovery' && <DiscoveryMonitoringView />}
{focusPhase === 'annotation' && <AnnotationMonitoringView />}
{!focusPhase && <DashboardOverview />}
```

**Acceptance Criteria**:
- [ ] No component has more than 10 ternary operators
- [ ] Conditional rendering branches that exceed 20 lines are extracted to named components
- [ ] No nested ternaries deeper than 2 levels

---

### RC-8: useEffect Chains and Missing Dependencies

**Severity**: MEDIUM
**Location**:
- `client/src/components/CustomLLMProviderConfig.tsx:50-52` — `loadStatus` not in deps
- `client/src/context/WorkflowContext.tsx:62-126` — 9-dependency useEffect
- `client/src/pages/JudgeTuningPage.tsx` — multiple useEffect chains for data sync
- `client/src/components/IntakeWaitingView.tsx:23-45` — useEffect + setInterval for polling

**Description**: Several anti-patterns with useEffect:

**Missing dependencies**:
```typescript
// CustomLLMProviderConfig.tsx
const loadStatus = async () => { /* uses workshopId */ };
useEffect(() => {
  loadStatus();  // loadStatus recreated every render, not in deps
}, [workshopId]);
```

**Over-large dependency arrays** (re-render risk):
```typescript
// WorkflowContext.tsx — useEffect with 9 dependencies
useEffect(() => {
  // Complex phase auto-completion logic
}, [traces, findings, rubric, annotations, participants, workshopId, user, workshop?.current_phase, ...]);
```

**useEffect for data fetching** (should be TanStack Query):
```typescript
// IntakeWaitingView.tsx — manual polling
useEffect(() => {
  const loadStatus = async () => { /* fetch */ };
  loadStatus();
  const interval = setInterval(loadStatus, 5000);
  return () => clearInterval(interval);
}, [workshopId]);
```

**State cascades** (one effect triggers state that triggers another):
- JudgeTuningPage: loading prompts → sets prompts state → triggers effect to load evaluations → sets evaluations state → triggers effect to calculate metrics

**Remediation**:
- Replace data-fetching useEffects with `useQuery`
- Wrap callbacks in `useCallback` and include in dependency arrays
- Break large useEffects into smaller, focused effects
- Use `useMemo` for derived computations instead of useEffect + setState

**Acceptance Criteria**:
- [ ] Zero useEffect calls for data fetching (all use TanStack Query)
- [ ] All useEffect dependency arrays are complete (no ESLint exhaustive-deps warnings)
- [ ] No useEffect chains that could be replaced by derived state

---

### RC-9: Direct DOM Manipulation Instead of React Patterns

**Severity**: LOW
**Location**:
- `client/src/components/FocusedAnalysisView.tsx:178-186` — `document.createElement('a')` for download
- `client/src/components/TraceDataViewer.tsx:436,449` — duplicate `document.createElement('a')` for download
- `client/src/components/Pagination.tsx:70-71` — `document.addEventListener('keydown')`

**Description**: File download is implemented imperatively in 3 locations with duplicated code:
```typescript
const a = document.createElement('a');
a.href = url;
a.download = `trace_${traceId}_data.csv`;
a.click();
window.URL.revokeObjectURL(url);
```

This pattern is repeated identically in `FocusedAnalysisView` and twice in `TraceDataViewer`. It's not a React pattern violation per se (file downloads require imperative code), but the duplication is unnecessary.

**Remediation**: Extract to a shared utility:
```typescript
// utils/download.ts
export function downloadBlob(content: string, filename: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Acceptance Criteria**:
- [ ] File download logic in a single shared utility
- [ ] Zero duplicate DOM manipulation code

---

### RC-10: No Suspense Boundaries or Loading Skeletons

**Severity**: LOW
**Location**: Entire `client/src/` — zero `<Suspense>` usage

**Description**: The application uses no React Suspense boundaries. Every component manages its own loading state:
```typescript
if (isLoading) return <div>Loading...</div>;
if (error) return <div>Error: {error}</div>;
```

This creates:
- Inconsistent loading UI across the app (some show spinners, some show text, some show nothing)
- No skeleton/placeholder UI during data loading
- Full-page loading states instead of granular component-level loading
- No streaming or progressive rendering

Combined with the missing code splitting (RC-1/TP-11), there's no loading fallback for lazy-loaded routes either.

**Remediation**: Add Suspense boundaries with skeleton components, especially for route-level code splitting and data-heavy components.

**Acceptance Criteria**:
- [ ] Suspense boundaries at route level for code splitting
- [ ] Consistent loading skeleton components for data-heavy views
- [ ] TanStack Query's `suspense: true` option evaluated for key queries

---

## Prioritized Backlog

| Priority | ID | Title | Effort | Impact |
|----------|-----|-------|--------|--------|
| P0 | RC-1 | Move navigation into React Router with URL-based phases | L | Critical — browser history, deep linking, bookmarking |
| P0 | RC-2 | Decompose JudgeTuningPage (2,754 lines, 32 useState) | L | Critical — unmaintainable, untestable |
| P1 | RC-3 | Add error boundaries at app, page, and widget level | S | High — prevents white-screen crashes |
| P1 | RC-4 | Break down 6 components over 500 lines | L | High — single responsibility, testability |
| P1 | RC-5 | Split context providers into single-responsibility | M | High — reduces unnecessary re-renders |
| P2 | RC-6 | Adopt form library (react-hook-form) | M | Medium — validation, consistency |
| P2 | RC-7 | Extract conditional rendering branches into components | M | Medium — readability, testability |
| P2 | RC-8 | Fix useEffect chains and missing dependencies | M | Medium — correctness, prevents bugs |
| P3 | RC-9 | Extract DOM manipulation to shared utilities | S | Low — DRY |
| P3 | RC-10 | Add Suspense boundaries and loading skeletons | M | Low — progressive UX |

**Effort**: S = < 2 hours, M = 2-8 hours, L = 1-3 days

---

## Cross-References

| This Item | Related Items |
|-----------|---------------|
| RC-1 (Router unused) | TP-11 (no code splitting) — lazy routes need Router |
| RC-2 (JudgeTuningPage) | TP-1 (fetch bypass), TP-3 (TanStack partial adoption) |
| RC-3 (No error boundaries) | DX-9 (frontend error reporting) |
| RC-4 (Large components) | CQ-1 (god file), CQ-2 (monolithic components) |
| RC-5 (Context concerns) | TP-4 (QueryClient misconfiguration), ARCH-11 (context overload) |
| RC-6 (No form library) | TP-7 (no Pydantic validation) — form + API validation gap |
| RC-7 (Conditional complexity) | CQ-8 (deep nesting) |
| RC-8 (useEffect chains) | TP-3 (manual fetch patterns), PERF-4 (polling) |
