# Architecture & Modularity Debt

## Overview

The codebase has significant architectural debt around **separation of concerns**, **modularity**, and **abstraction usage**. The backend lacks a proper service layer — route handlers perform business logic, and the single `DatabaseService` class (3,692 lines, 100+ methods) acts as a god service. On the frontend, an OpenAPI-generated client exists but is widely bypassed in favor of raw `fetch()` calls, type definitions are duplicated across files, and context providers mix API, state, and storage concerns. These issues compound testing debt (untestable monoliths) and make the codebase brittle to change.

Cross-references: CQ-1 (god file workshops.py), CQ-2 (god component JudgeTuningPage), SEC-4 (unprotected endpoints), PERF-5 (dead cache), DX-8 (API client not documented).

---

## Items

### ARCH-1: God Service - DatabaseService (3,692 lines, 100+ public methods)

**Severity**: CRITICAL
**Location**: `server/services/database_service.py`

**Description**: A single class handles all database operations across every domain: workshop CRUD, user authentication, trace management, discovery findings, annotations, rubric parsing and reconstruction, MLflow configuration, participant notes, judge prompts and evaluations, facilitator config, IRR calculations, and trace randomization. Over 100 public methods with no domain boundaries.

Examples of unrelated responsibilities in one class:
- `authenticate_facilitator_from_yaml()` (line ~170) — auth logic
- `add_finding()` (line ~738) — discovery domain
- `_parse_rubric_questions()` (line ~1151) — rubric parsing
- `get_irr_data()` (line ~2500+) — statistical analysis
- `randomize_trace_assignment()` (line ~2700+) — assignment algorithm

**Impact**: Cannot test any domain in isolation. Changes to annotation logic risk breaking auth. No clear ownership boundaries. Impossible to onboard to a specific domain without understanding all 3,692 lines.

**Remediation**: Split into focused services:
- `WorkshopService` — workshop CRUD, phase management
- `AuthenticationService` — login, facilitator auth, session management
- `AnnotationService` — annotation submission, retrieval, assignment
- `RubricService` — rubric parsing, reconstruction, validation
- `TraceService` — trace CRUD, assignment, randomization
- `JudgeService` — judge prompts, evaluations, metrics
- `ParticipantService` — participant management, notes

**Acceptance Criteria**:
- [ ] No single service file exceeds 600 lines
- [ ] Each service handles exactly one domain
- [ ] Services communicate through defined interfaces, not shared state
- [ ] All existing tests still pass after split

---

### ARCH-2: Business Logic in Route Handlers (Backend)

**Severity**: CRITICAL
**Location**: `server/routers/workshops.py` (multiple locations), `server/routers/users.py`

**Description**: Route handlers perform domain logic, orchestration, and direct database operations instead of delegating to services. Routes should be thin — validate input, call a service, return output.

**Key violations**:

1. **Direct database queries in route handler** (`workshops.py:541-547`):
   ```python
   workshop_db = db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
   workshop_db.show_participant_notes = not current_value
   db.commit()
   ```
   `DatabaseService.get_workshop()` already exists but is bypassed.

2. **Complex orchestration inline in route** (`workshops.py:1100-1230`):
   Auto-evaluation logic manually creates jobs, manages state, orchestrates AlignmentService + DatabricksService + token management, and spawns background threads — all inside a route handler.

3. **Round-robin annotation assignment in route** (`workshops.py:1300-1350`):
   ```python
   for i, trace in enumerate(traces):
       annotator = annotators[i % len(annotators)]
       assignments[annotator.user_id].append(trace.id)
   ```
   Load-balancing algorithm belongs in an `AnnotationAssignmentService`.

4. **Login handler orchestrates 4 service calls with inline auth logic** (`users.py:33-69`):
   Route checks facilitator YAML auth, then regular auth, then validates workshop access, then activates user — all inline. Should be a single `auth_service.login(credentials)` call.

**Impact**: Routes are untestable without full stack. Business logic scattered across routes and services with no single source of truth. Adding a new auth method requires modifying route handlers.

**Remediation**: Extract business logic to service methods. Route handlers should be 5-15 lines: parse input, call service, return response.

**Acceptance Criteria**:
- [ ] No `db.query()` calls in any router file
- [ ] No `db.commit()` calls in any router file
- [ ] Route handlers are < 20 lines (excluding request model definitions)
- [ ] All orchestration logic lives in services

---

### ARCH-3: Generated API Client Exists but Is Widely Bypassed

**Severity**: CRITICAL
**Location**:
- `client/src/hooks/useWorkshopApi.ts` — 15+ raw `fetch()` calls
- `client/src/hooks/useDatabricksApi.ts` — 7+ raw `fetch()` calls
- `client/src/components/RubricSuggestionPanel.tsx:65`
- `client/src/components/AnnotationStartPage.tsx:51`
- `client/src/components/DiscoveryStartPage.tsx:46`
- `client/src/components/RoleBasedWorkflow.tsx:79`

**Description**: An OpenAPI-generated TypeScript client exists at `client/src/client/services/` with type-safe methods (e.g., `WorkshopsService.getFindingsWorkshopsWorkshopIdFindingsGet()`). However, 16+ locations use raw `fetch()` with manually constructed URLs:

```typescript
// useWorkshopApi.ts — raw fetch instead of generated client
const response = await fetch(`/workshops/${workshopId}/all-traces`);
const response = await fetch(`/workshops/${workshopId}/annotations-with-users`);
const response = await fetch(`/workshops/${workshopId}/aggregate-all-feedback`, { method: 'POST' });

// Components — raw fetch instead of generated client
const response = await fetch(`/workshops/${workshopId}/generate-rubric-suggestions`, { method: 'POST' });
const response = await fetch(`/workshops/${workshopId}/begin-annotation`, { method: 'POST' });
```

Some generated service methods exist for these exact endpoints but are not used (e.g., `WorkshopsService.isUserDiscoveryCompleteWorkshopsWorkshopIdUsersUserIdDiscoveryCompleteGet()` exists but `RoleBasedWorkflow.tsx:79` calls `fetch()` directly).

**Impact**: No type safety on 16+ API calls. If backend changes a response shape, TypeScript won't catch it. Endpoint URLs duplicated as strings. Error handling patterns inconsistent between raw fetch and generated client.

**Remediation**: Replace all raw `fetch()` calls with corresponding generated service methods. If a method doesn't exist in the generated client, regenerate from the current OpenAPI spec.

**Acceptance Criteria**:
- [ ] Zero raw `fetch()` calls to backend API in application code
- [ ] All API calls go through generated `WorkshopsService`, `UsersService`, `DatabricksService`
- [ ] justfile recipe exists for regenerating the client (`just generate-api-client`)
- [ ] CI check validates generated client is up-to-date with backend

---

### ARCH-4: God Components (Frontend)

**Severity**: HIGH
**Location**:
- `client/src/components/TraceViewer.tsx` — 1,650 lines
- `client/src/components/FacilitatorDashboard.tsx` — 1,325 lines
- `client/src/components/TraceDataViewer.tsx` — 730 lines
- `client/src/components/RoleBasedWorkflow.tsx` — 630 lines

**Description**: These components mix data fetching, business logic, and rendering in a single file. (CQ-2 already covers `JudgeTuningPage.tsx` at 2,754 lines.)

Specific violations:

- **FacilitatorDashboard.tsx**: Lines 1-52 import 10+ React Query hooks. Lines 71-124 compute progress metrics, user contributions, and trace coverage via complex `useMemo` + array operations. Lines 126-400+ render multiple dashboard panels. All three concerns (data, logic, UI) tightly coupled.

- **TraceViewer.tsx**: Lines 42-140 define utility functions (`isMarkdownContent()`, `isUrl()`, `isJsonString()`, `fixMalformedJson()`) that belong in `utils/`. Lines 150-500+ mix smart JSON rendering logic with the component render tree.

- **TraceDataViewer.tsx**: Lines 42-140 contain `extractLLMContent()` — a 100-line function for parsing various LLM response formats. This is domain logic, not a UI concern.

- **RoleBasedWorkflow.tsx**: Lines 48-65 contain business logic for starting phases. Lines 75-97 define inline query functions instead of using custom hooks.

**Impact**: Cannot test business logic without rendering components. Cannot reuse progress calculation or LLM content extraction outside these components. High cognitive load.

**Remediation**: Extract:
- Business logic to service modules (e.g., `services/workshopProgressService.ts`, `utils/llmResponseParser.ts`)
- Data fetching to custom hooks (e.g., `useFacilitatorDashboardData()`)
- Sub-panels to separate components
- Utility functions to `utils/`

**Acceptance Criteria**:
- [ ] No component file exceeds 500 lines
- [ ] Business logic extractable and testable without React
- [ ] Utility functions in `utils/` with independent unit tests

---

### ARCH-5: Infrastructure Code in Router Module (Jobs + Threading)

**Severity**: HIGH
**Location**: `server/routers/workshops.py:24-130, 1120+`

**Description**: The workshops router contains infrastructure that doesn't belong there:

1. **AlignmentJob dataclass with file-based persistence** (lines 24-130):
   ```python
   class AlignmentJob:
       def save(self):
           temp_path = self._meta_path + ".tmp"
           with open(temp_path, "w") as f:
               json.dump(data, f)
           os.rename(temp_path, self._meta_path)
   ```
   Job persistence (file I/O, JSON serialization, atomic writes) embedded in a router module.

2. **Background threads spawned directly in routes** (lines 1120+):
   ```python
   def run_auto_evaluation_for_new_traces():
       from server.database import SessionLocal
       thread_db = SessionLocal()
       # ...complex evaluation logic...
   threading.Thread(target=run_auto_evaluation_for_new_traces, daemon=True).start()
   ```
   Routes create database sessions in background threads with no pool management, no cancellation mechanism, and errors only caught via logging.

3. **Retry utility function** (lines 170-227):
   Generic retry logic with exponential backoff defined inline in the router.

**Impact**: Job lifecycle is untestable. Thread resource leaks possible. Retry logic is not reusable. Circular dependency risk from late imports inside threads.

**Remediation**:
- Extract `AlignmentJob` + persistence to `services/job_service.py` with a `JobRepository` abstraction
- Extract background work to `services/background_task_service.py` (or use FastAPI `BackgroundTasks`)
- Extract retry logic to `utils/retry.py` or a decorator

**Acceptance Criteria**:
- [ ] No `threading.Thread` usage in router files
- [ ] No file I/O in router files
- [ ] Job persistence abstracted behind a repository interface
- [ ] Background tasks use FastAPI's `BackgroundTasks` or a managed task queue

---

### ARCH-6: Frontend Context Providers Mix API, State, and Storage Concerns

**Severity**: HIGH
**Location**:
- `client/src/context/UserContext.tsx`
- `client/src/context/WorkshopContext.tsx`
- `client/src/context/WorkflowContext.tsx`

**Description**: Context providers are doing triple duty — API calls, state management, and localStorage persistence — all in one layer.

- **UserContext.tsx**:
  - Lines 62-121: `initializeUser()` mixes localStorage reads, `UsersService` API calls, error handling, and permission loading
  - Lines 132-159: `loadPermissions()` handles API calls AND state updates AND localStorage cleanup
  - Lines 161-169: `updateLastActive()` fires API calls with silent failures (empty catch block)

- **WorkshopContext.tsx**:
  - Lines 28-80: `getWorkshopIdFromUrl()` utility function mixes URL parsing with localStorage management
  - Lines 87-122: State initialization with direct localStorage access mixed with React Query cache clearing

- **WorkflowContext.tsx**:
  - Lines 41-54: Multiple `useQuery` hooks with inline `fetch()` calls instead of using generated services

**Impact**: Cannot test state logic without mocking APIs and localStorage. Storage strategy change (e.g., sessionStorage, IndexedDB) requires modifying context providers. Silent failures in API calls make debugging hard.

**Remediation**: Separate concerns into layers:
- `services/authService.ts` — API calls for auth
- `hooks/usePersistedState.ts` — localStorage abstraction
- Contexts hold state only, delegate API/storage to services and hooks

**Acceptance Criteria**:
- [ ] Context providers contain zero `fetch()` or service calls
- [ ] Context providers contain zero direct `localStorage` access
- [ ] API calls extracted to hooks or services
- [ ] Storage abstracted behind a custom hook

---

### ARCH-7: Ad-Hoc Authorization Pattern

**Severity**: HIGH
**Location**: `server/routers/users.py`, `server/routers/workshops.py`

**Description**: Authorization checks are implemented inline in individual route handlers rather than via middleware or decorators. Each endpoint independently decides whether and how to check permissions.

```python
# users.py:117-120 — inline role check
inviter = db_service.get_user(invitation_data.invited_by)
if not inviter or inviter.role != UserRole.FACILITATOR:
    raise HTTPException(status_code=403, detail='Only facilitators can create invitations')
```

Additionally, `server/models.py:74-127` places permission calculation logic on a Pydantic response model (`UserPermissions.for_role()`), which is a data contract, not a business logic layer.

Cross-reference: SEC-4 covers the specific unprotected endpoints. This item covers the systemic pattern.

**Impact**: Easy to forget auth on new endpoints. Authorization logic duplicated and inconsistent. Cannot audit protection from a single location. Violates the auth spec's intent to keep permission logic abstract and swappable.

**Remediation**: Create a FastAPI dependency-based auth system:
```python
async def require_role(role: UserRole):
    def dependency(user: User = Depends(get_current_user)):
        if user.role != role:
            raise HTTPException(403)
        return user
    return dependency

@router.post('/invitations/')
async def create_invitation(..., user: User = Depends(require_role(UserRole.FACILITATOR))):
```
Move `UserPermissions.for_role()` to an `AuthorizationService`.

**Acceptance Criteria**:
- [ ] All protected endpoints use a shared auth dependency
- [ ] Permission logic lives in a service, not in Pydantic models
- [ ] New endpoints require explicit auth opt-in (or opt-out with comment)
- [ ] Auth coverage auditable from a single module

---

### ARCH-8: Duplicated Type Definitions (Frontend)

**Severity**: MEDIUM
**Location**:
- `RubricSuggestion`: defined in both `RubricSuggestionPanel.tsx:34-41` and `useWorkshopApi.ts:816-823`
- `TraceData`: defined in `TraceDataViewer.tsx:21-27`, `AnnotationReviewPage.tsx:30-36`, and `FocusedAnalysisView.tsx:32-45`
- `ParticipantNote`: defined in `useWorkshopApi.ts:656-666` (should come from generated client)

**Description**: The same TypeScript interfaces are defined independently in multiple files. Some of these types already exist in the generated OpenAPI client at `client/src/client/models/` but are re-declared manually.

**Impact**: Type drift — if one definition is updated, others become stale. Increases maintenance burden. Defeats the purpose of having a generated client.

**Remediation**: Centralize shared types:
1. Import types from generated client where they exist
2. For types not in the generated client, create `client/src/types/` with shared definitions
3. Remove duplicate definitions from components and hooks

**Acceptance Criteria**:
- [ ] Each type is defined in exactly one location
- [ ] Components import from `types/` or generated client, never define inline
- [ ] No duplicate interface definitions across files

---

### ARCH-9: Duplicated Business Logic (Frontend)

**Severity**: MEDIUM
**Location**:
- Rubric parsing: `utils/rubricUtils.ts` (canonical) vs. `RubricViewPage.tsx:22-30` (`convertApiRubricToQuestions()`) vs. `AnnotationReviewPage.tsx:39-48` (`parseRubricQuestionsWithType()`)
- Rating display: `AnnotationReviewPage.tsx:103-123` (`getRatingStars()`, `getBinaryDisplay()`) with no shared utility
- Trace data conversion: `AnnotationReviewPage.tsx:30-36` (`convertTraceToTraceData()`) and `FocusedAnalysisView.tsx:73-82` (similar inline conversion)

**Description**: The same transformation logic is independently implemented in multiple components. `rubricUtils.ts` already exists as the canonical location for rubric parsing, but components implement their own local versions.

**Impact**: Bug fixes must be applied to each copy. Behavior divergence between components displaying the same data differently.

**Remediation**:
- Delete local rubric conversion functions, import from `rubricUtils.ts`
- Create `utils/ratingUtils.ts` for rating display functions
- Create `utils/traceUtils.ts` for trace data conversion

**Acceptance Criteria**:
- [ ] Each transformation function exists in exactly one utility module
- [ ] Components import from utils, never reimplement
- [ ] Utility modules have independent unit tests

---

### ARCH-10: Scattered localStorage Access

**Severity**: MEDIUM
**Location**:
- `client/src/context/UserContext.tsx` — lines 64, 78, 87, 126, 128, 142, 233 (7 call sites)
- `client/src/context/WorkshopContext.tsx` — lines 40, 42, 58, 65, 70, 115, 118, 126 (8 call sites)
- `client/src/components/AnnotationStartPage.tsx:78`

**Description**: Direct `localStorage.getItem()` and `localStorage.setItem()` calls scattered across 3+ context providers and multiple components (20+ total call sites). No abstraction layer, no key namespace management, no type safety on stored values.

**Impact**: Changing storage strategy (e.g., sessionStorage, IndexedDB for larger data) requires modifying every call site. Key name collisions possible. Stored values not validated on read.

**Remediation**: Create a `useLocalStorage<T>(key, defaultValue)` hook or a `StorageService` class that:
- Centralizes all storage keys as constants
- Provides type-safe get/set
- Handles serialization/deserialization
- Enables swapping storage backend

**Acceptance Criteria**:
- [ ] Zero direct `localStorage` calls in components or contexts
- [ ] All storage access goes through a shared abstraction
- [ ] Storage keys defined as constants in one location

---

### ARCH-11: Late/Internal Imports in workshops.py

**Severity**: MEDIUM
**Location**: `server/routers/workshops.py` — 30+ locations

**Description**: Services and utilities are imported inside function bodies rather than at module level:
- Line 310: `from server.utils.jsonpath_utils import validate_jsonpath`
- Line 352: `from server.utils.jsonpath_utils import apply_jsonpath`
- Line 622: `from server.database import SessionLocal`
- Line 1101: `from server.services.token_storage_service import token_storage`
- Line 1133: `from server.services.alignment_service import AlignmentService`
- Line 1165: `from server.models import JudgePromptCreate, JudgeEvaluation`
- Line 2060: `from server.services.databricks_service import DatabricksService`

30+ internal imports scattered throughout the file.

Cross-reference: CQ-10 covers `import time` in `database_service.py`. This item covers the broader pattern of hiding dependencies.

**Impact**: Makes dependency graph impossible to trace statically. Hides circular dependencies instead of fixing them. Complicates refactoring — moving a function may silently break a late import. Prevents tools like `isort` from managing imports.

**Remediation**: Move all imports to module level. If circular imports exist, resolve them by:
1. Extracting shared models/types to a separate module
2. Using dependency injection instead of direct imports
3. Using `TYPE_CHECKING` for type-only imports

**Acceptance Criteria**:
- [ ] Zero function-body imports (except justified circular dependency avoidance with comment)
- [ ] All dependencies visible at top of file
- [ ] `isort` runs clean

---

### ARCH-12: Direct Environment Variable Mutations in Routes

**Severity**: MEDIUM
**Location**:
- `server/routers/workshops.py:1456-1459`
- `server/routers/databricks.py:198-206`

**Description**: Route handlers directly mutate `os.environ` to configure Databricks/MLflow clients:
```python
# workshops.py:1456-1459
os.environ['DATABRICKS_HOST'] = mlflow_config.databricks_host.rstrip('/')
if not has_oauth:
    os.environ['DATABRICKS_TOKEN'] = mlflow_config.databricks_token

# databricks.py:198-206 — multiple os.environ writes and deletes
```

**Impact**: Global state mutation from request handlers. In a multi-worker/multi-thread environment, one request can overwrite another's config. No cleanup guarantee — if a route handler errors, environment may be left in a modified state. Untestable without real environment modification.

**Remediation**: Use a `DatabricksConfigService` or context manager that sets credentials for the scope of an operation without mutating global state. Or use SDK client instances with per-call configuration.

**Acceptance Criteria**:
- [ ] Zero `os.environ` writes in router files
- [ ] Credential configuration handled through service abstraction
- [ ] Configuration scoped per-operation, not global

---

### ARCH-13: Permission Logic in Pydantic Response Model

**Severity**: MEDIUM
**Location**: `server/models.py:74-127`

**Description**: `UserPermissions.for_role()` is a classmethod on a Pydantic model that maps roles to permission sets:
```python
class UserPermissions(BaseModel):
    @classmethod
    def for_role(cls, role: UserRole) -> 'UserPermissions':
        if role == UserRole.FACILITATOR:
            return cls(can_view_discovery=True, can_create_findings=False, ...)
```

Pydantic models are data contracts (request/response schemas). Role-to-permission mapping is authorization business logic.

**Impact**: Permission rules coupled to serialization schema. Cannot change permission logic without touching the API contract module. Difficult to test permission rules independently.

**Remediation**: Move to an `AuthorizationService.get_permissions_for_role(role)` method. The Pydantic model should only define the shape.

**Acceptance Criteria**:
- [ ] `UserPermissions` model has no business logic methods
- [ ] Permission mapping lives in a service
- [ ] Service is independently testable

---

### ARCH-14: React Query Key Sprawl

**Severity**: LOW
**Location**: `client/src/hooks/useWorkshopApi.ts`, various components

**Description**: Query keys are hardcoded strings scattered across hooks and components:
```typescript
['workshop', workshopId]
['traces', workshopId]
['participant-notes', workshopId]
['annotations', workshopId]
['findings', workshopId]
```

No centralized `queryKeys.ts` constants file.

**Impact**: Cache invalidation requires knowing the exact key string used in each hook. Typos create silent cache misses. Cannot grep for all queries related to a domain.

**Remediation**: Create `client/src/constants/queryKeys.ts`:
```typescript
export const queryKeys = {
  workshop: (id: string) => ['workshop', id] as const,
  traces: (workshopId: string) => ['traces', workshopId] as const,
  // ...
};
```

**Acceptance Criteria**:
- [ ] All query keys defined in `queryKeys.ts`
- [ ] Zero hardcoded query key arrays in hooks or components
- [ ] Cache invalidation uses the same key factory functions

---

### ARCH-15: Inconsistent React Query Configuration

**Severity**: LOW
**Location**: `client/src/hooks/useWorkshopApi.ts` (multiple hooks)

**Description**: Each hook has different cache/refetch settings with no shared configuration:
- `useListWorkshops()`: `staleTime: 30000`, `refetchOnMount: true`
- `useWorkshop()`: `staleTime: 10000`, `refetchInterval: 30000`
- `useAllTraces()`: `staleTime: 30 * 1000`, `gcTime: 10 * 60 * 1000`
- `useParticipantNotes()`: `refetchInterval: 15 * 1000`
- Other hooks: `refetchInterval: false` with comment "DISABLED: Was causing Chrome hangs"

**Impact**: Difficult to reason about total polling load. Inconsistent user experience (some data refreshes, some doesn't). Tuning history captured in scattered comments rather than centralized config.

**Remediation**: Define query configuration presets:
```typescript
const QUERY_PRESETS = {
  realtime: { staleTime: 5_000, refetchInterval: 10_000 },
  standard: { staleTime: 30_000, refetchOnMount: true },
  static: { staleTime: Infinity },
};
```

**Acceptance Criteria**:
- [ ] Query configuration presets defined in one location
- [ ] Each hook references a preset, not inline numbers
- [ ] Total polling load documented

---

## Prioritized Backlog

| Priority | ID | Title | Effort | Impact |
|----------|------|-------|--------|--------|
| P0 | ARCH-1 | Split DatabaseService into domain services | L | Critical - enables isolation and testing |
| P0 | ARCH-2 | Extract business logic from route handlers | L | Critical - enables thin routes and testable logic |
| P0 | ARCH-3 | Replace raw fetch() with generated API client | M | Critical - type safety across API boundary |
| P1 | ARCH-4 | Decompose god components (FacilitatorDashboard, TraceViewer, etc.) | L | High - enables component testing |
| P1 | ARCH-5 | Extract job persistence and background tasks from router | M | High - enables job lifecycle testing |
| P1 | ARCH-6 | Separate API/state/storage in context providers | M | High - enables context testing |
| P1 | ARCH-7 | Implement dependency-based auth pattern | M | High - consistent authorization |
| P2 | ARCH-8 | Centralize frontend type definitions | S | Medium - prevents type drift |
| P2 | ARCH-9 | Deduplicate business logic to shared utils | S | Medium - single source of truth |
| P2 | ARCH-10 | Abstract localStorage behind shared hook | S | Medium - enables storage changes |
| P2 | ARCH-11 | Move late imports to module level | M | Medium - dependency visibility |
| P2 | ARCH-12 | Replace direct env var mutations with service | S | Medium - thread safety |
| P2 | ARCH-13 | Move permission logic out of Pydantic model | S | Medium - separation of concerns |
| P3 | ARCH-14 | Create queryKeys.ts constants | S | Low - cache management clarity |
| P3 | ARCH-15 | Standardize React Query configuration | S | Low - consistency |

**Effort**: S = < 2 hours, M = 2-8 hours, L = 1-3 days
