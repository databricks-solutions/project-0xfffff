# Code Quality & Architecture Debt

## Overview

The codebase has significant code quality debt concentrated in two areas: the backend workshop router (`server/routers/workshops.py` at 5,229 lines) and the frontend judge tuning page (`client/src/pages/JudgeTuningPage.tsx` at 2,754 lines). These god files create cascading issues with testing, maintenance, and onboarding. Additionally, inconsistent error handling patterns, debug artifacts in production code, and missing type safety compound the problem.

---

## Items

### CQ-1: God File - workshops.py Router (5,229 lines)

**Severity**: CRITICAL
**Location**: `server/routers/workshops.py`

**Description**: Single file handles all workshop API endpoints including job management, trace handling, phase transitions, evaluations, alignment, and metrics. Contains functions exceeding 500 lines (`run_alignment_background()` at line 3389+, `run_evaluation_background()` at line 3583+) with 4-5 levels of nesting.

**Impact**: Untestable in isolation, high merge conflict risk, impossible to navigate, violates single responsibility principle.

**Remediation**: Split into domain-specific router modules:
- `routers/workshop_crud.py` - CRUD operations and phase management
- `routers/workshop_traces.py` - Trace ingestion and assignment
- `routers/workshop_annotations.py` - Annotation submission and retrieval
- `routers/workshop_evaluation.py` - Judge evaluation and alignment jobs
- `routers/workshop_metrics.py` - IRR, alignment metrics, results

**Acceptance Criteria**:
- [ ] No single router file exceeds 800 lines
- [ ] No single function exceeds 50 lines
- [ ] Each module has independent unit tests
- [ ] All existing E2E tests still pass

---

### CQ-2: God Component - JudgeTuningPage.tsx (2,754 lines)

**Severity**: CRITICAL
**Location**: `client/src/pages/JudgeTuningPage.tsx`

**Description**: Single React component with 49 `useState`/hook calls (lines 62-124), 16+ error/loading states, duplicated polling logic across 4 operations, and extensive `as any` casts (lines 1811, 1813, 1815, 1821, 2014, 2016, 2020, 2064, 2068, 2122, 2191, 2193, 2202, 2203).

**Impact**: Impossible to test individual features, state synchronization bugs, high cognitive load, performance issues from excessive re-renders.

**Remediation**: Extract into composed components and custom hooks:
- `useEvaluationPolling` hook for shared polling logic
- `useAlignmentJob` hook for alignment state management
- `JudgeConfigPanel`, `AlignmentPanel`, `EvaluationResultsPanel` components
- Proper TypeScript interfaces to replace all `any` types

**Acceptance Criteria**:
- [ ] No single component file exceeds 500 lines
- [ ] Zero `any` type annotations
- [ ] Polling logic extracted to a single reusable hook
- [ ] Each sub-component has unit tests

---

### CQ-3: Bare Except Clauses

**Severity**: CRITICAL
**Location**: `server/routers/workshops.py:94, 4080, 4086, 4093, 4099`

**Description**: Multiple bare `except:` statements that catch and silently swallow all exceptions including `KeyboardInterrupt` and `SystemExit`:
```python
# Line 94
except:
    pass

# Lines 4080-4099 in metrics calculation
try:
    kappa = cohen_kappa_score(human, predicted)
except:
    kappa = 0.0
```

**Impact**: Hides critical errors, makes debugging impossible, can mask data corruption.

**Remediation**: Replace with specific exception types and add logging:
```python
except (ValueError, TypeError) as e:
    logger.warning(f"Kappa calculation failed: {e}")
    kappa = 0.0
```

**Acceptance Criteria**:
- [ ] Zero bare `except:` clauses in codebase
- [ ] All exception handlers use specific types
- [ ] All caught exceptions are logged with context

---

### CQ-4: TypeScript `any` Types Throughout Frontend

**Severity**: HIGH
**Location**:
- `client/src/pages/JudgeTuningPage.tsx:70, 109` - `useState<any>(null)`
- `client/src/pages/JudgeTuningPage.tsx:1811-2203` - 14+ `as any` casts
- `client/src/context/UserContext.tsx:84, 137, 221` - `any` error types
- `client/src/pages/AnnotationDemo.tsx:205` - `any` variable

**Description**: Widespread use of `any` type defeating TypeScript's type safety. Pattern examples:
```typescript
const [mlflowConfig, setMlflowConfig] = useState<any>(null);
(prompt.model_parameters as any)?.judge_name
```

**Impact**: IDE autocomplete disabled, refactoring becomes risky, runtime errors not caught at compile time.

**Remediation**: Define proper interfaces for all `any` usages. Create types for MLflow config, alignment results, judge parameters.

**Acceptance Criteria**:
- [ ] Zero `any` annotations in production code (excluding generated code in `client/src/client/`)
- [ ] All API response types have corresponding TypeScript interfaces

---

### CQ-5: Debug Print Statements in Production Code

**Severity**: HIGH
**Location**:
- `server/routers/workshops.py:963-977` - Discovery endpoint debug prints
- `server/routers/workshops.py:2391, 2426` - Error handling prints
- `server/services/judge_service.py:64-68` - Evaluate prompt debug print
- `server/database.py` - 135+ print() calls across backend

**Description**: Debug `print()` statements left in production code:
```python
print(f"  DEBUG begin_discovery: ...")
print(f"  DEBUG trace_ids: {[t.id for t in traces]}")
print(f"  DEBUG: Taking first {trace_limit} traces...")
```

**Impact**: Exposes sensitive data in logs, clutters stdout, no log level control, unprofessional in production.

**Remediation**: Replace all `print()` with `logger.debug()` or `logger.info()` as appropriate.

**Acceptance Criteria**:
- [ ] Zero `print()` statements in `/server/` (except `make_openapi.py`)
- [ ] All logging uses the `logging` module with appropriate levels

---

### CQ-6: Console.log Statements in Production Client Code

**Severity**: HIGH
**Location**:
- `client/src/pages/JudgeTuningPage.tsx:151` and 40+ other locations
- `client/src/pages/WorkshopDemoLanding.tsx:47-48` - DEBUG_ENABLE_USER_SWITCHING flag
- `client/src/context/UserContext.tsx` - Multiple console.error calls

**Description**: `console.log`, `console.error`, and `console.warn` calls throughout client code. Combined with `drop_console: false` in `client/vite.config.ts:68`, these ship to production.

**Impact**: Performance degradation, security risk (leaks internal state to browser console), bundle size increase.

**Remediation**: Remove all console statements, re-enable `drop_console: true` in Vite config, use a structured logging service for production error reporting.

**Acceptance Criteria**:
- [ ] Zero `console.log` in production code
- [ ] `drop_console: true` in `vite.config.ts`
- [ ] `console.error` replaced with error boundary or logging service

---

### CQ-7: Duplicated Polling/Retry Logic (Client)

**Severity**: HIGH
**Location**:
- `client/src/pages/JudgeTuningPage.tsx` - 4 separate polling implementations
- `client/src/pages/AnnotationDemo.tsx:213, 816` - Retry with exponential backoff
- `client/src/pages/TraceViewerDemo.tsx:265, 463` - Polling intervals
- `client/src/components/IntakeWaitingView.tsx:43` - Fixed 5-second polling

**Description**: Nearly identical polling patterns repeated with different intervals and inconsistent error handling:
```typescript
// Pattern repeated 4+ times with variations
const pollInterval = setInterval(async () => { ... }, timeout);
await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
retryIntervalRef.current = setInterval(() => { ... }, 2000);
```

**Impact**: Maintenance nightmare, inconsistent retry behavior across features, hard to update globally.

**Remediation**: Extract to a single `usePolling(fn, interval, options)` hook with exponential backoff support.

**Acceptance Criteria**:
- [ ] Single `usePolling` hook in `/client/src/hooks/`
- [ ] All polling uses the shared hook
- [ ] Configurable backoff, max retries, and cleanup

---

### CQ-8: Deeply Nested Error Handling

**Severity**: HIGH
**Location**: `server/routers/workshops.py:1380-1640`

**Description**: 5-6 levels of nested try/except in background job processing:
```python
try:
  try:
    try:
      try:
        ...
      except Exception:
    except Exception:
  except Exception:
except Exception:
```
Lines 1384, 1428, 1476, 1480, 1584, 1596, 1604 show the nesting.

**Impact**: Extremely difficult to follow control flow, impossible to debug, high cognitive load.

**Remediation**: Use early returns and guard clauses. Extract nested operations to separate functions. Use context managers for resource cleanup.

**Acceptance Criteria**:
- [ ] Maximum nesting depth of 3 in any function
- [ ] Background job functions decomposed into steps

---

### CQ-9: Inconsistent Exception Handling Patterns

**Severity**: HIGH
**Location**: `server/routers/workshops.py`

**Description**: Three different exception handling styles mixed in the same file:
1. Lines 97, 627, 656: `except Exception as e` with logging
2. Lines 188, 2080: Specific exception types (`OperationalError`, `ValueError`)
3. Lines 94, 4080-4099: Bare `except:` (see CQ-3)

**Impact**: Inconsistent error recovery, unclear error contract, debugging harder.

**Remediation**: Establish a consistent pattern: catch specific exceptions, log with context, re-raise or return appropriate HTTP status.

**Acceptance Criteria**:
- [ ] Documented error handling pattern in CONTRIBUTING.md
- [ ] All handlers follow the documented pattern

---

### CQ-10: Redundant Imports Inside Methods

**Severity**: MEDIUM
**Location**: `server/services/database_service.py:78, 125, 137, 523, 657, 752, 1498`

**Description**: `import time` appears 8 times inside method bodies instead of once at module level.

**Impact**: Code smell, minor performance penalty, violates Python style.

**Remediation**: Move all imports to module level.

**Acceptance Criteria**:
- [ ] Zero in-function imports (except for circular dependency avoidance)

---

### CQ-11: Hardcoded Magic Numbers and Strings

**Severity**: MEDIUM
**Location**:
- `server/routers/workshops.py:21` - `JOB_DIR = "/tmp/workshop_jobs"`
- `server/routers/workshops.py:170` - `max_retries=5, base_delay=0.5`
- `server/routers/workshops.py:190` - `random.uniform(0, 0.5)` jitter
- `client/src/pages/JudgeTuningPage.tsx:114` - `'databricks-claude-sonnet-4-5'`
- `client/src/pages/JudgeTuningPage.tsx:1142, 1152` - `setTimeout(poll, 2000)` / `5000`

**Impact**: Difficult to tune behavior, scattered configuration, hard to maintain.

**Remediation**: Extract to named constants or configuration values.

**Acceptance Criteria**:
- [ ] All retry parameters in a shared config
- [ ] All polling intervals as named constants
- [ ] All model names configurable

---

### CQ-12: Manual In-Memory Cache (Thread-Unsafe)

**Severity**: MEDIUM
**Location**: `server/services/database_service.py:115-139`

**Description**: Manual cache with 30-second TTL using timestamp checking. Since `DatabaseService` is instantiated per-request, the cache is never actually reused across requests.
```python
self._cache = {}
self._cache_ttl = 30  # Useless - new instance per request
```

**Impact**: False sense of caching, wasted code, potential thread-safety issues if ever shared.

**Remediation**: Either remove the dead cache code, or implement module-level caching with proper invalidation.

**Acceptance Criteria**:
- [ ] Cache either works correctly or is removed
- [ ] If kept, thread-safe and shared across requests

---

### CQ-13: Global State in sqlite_rescue.py

**Severity**: MEDIUM
**Location**: `server/sqlite_rescue.py:57, 382, 413, 447, 486`

**Description**: Multiple global variables for state management:
```python
global _workspace_client
global _backup_timer, _backup_timer_running
global _shutdown_handlers_installed
```

**Impact**: Hidden dependencies, difficult to test, potential race conditions.

**Remediation**: Encapsulate in a class with explicit lifecycle management.

**Acceptance Criteria**:
- [ ] Zero module-level mutable globals
- [ ] State encapsulated in a testable class

---

### CQ-14: useEffect Hooks Without Proper Cleanup

**Severity**: MEDIUM
**Location**: `client/src/pages/JudgeTuningPage.tsx:180, 244, 339, 349, 420, 442, 454, 487, 494`

**Description**: Multiple useEffect hooks setting intervals/listeners. Some may have missing dependency arrays or incomplete cleanup functions.

**Impact**: Memory leaks, resource accumulation over time in long-running sessions.

**Remediation**: Audit all useEffect hooks for proper cleanup. Will be largely resolved by CQ-2 refactoring.

**Acceptance Criteria**:
- [ ] Every useEffect with intervals/listeners has a cleanup return
- [ ] React strict mode enabled to catch missing cleanups

---

### CQ-15: Commented-Out Code and Unclear TODOs

**Severity**: LOW
**Location**:
- `server/services/judge_service.py:444, 449` - `"TODO: this was ostensibly here for a reason, but I don't know what it is."`
- `server/services/irr_service.py:193` - Same unclear TODO
- `server/services/database_service.py:2711, 2739` - `"TODO: pretty sure this does nothing"`
- `server/services/databricks_service.py:250` - `"TODO: this is a noop, actually handle connection testing?"`

**Impact**: Code archaeology required to understand intent, maintenance overhead.

**Remediation**: Either fix the code or remove it. Convert actionable TODOs to GitHub issues with context.

**Acceptance Criteria**:
- [ ] Zero TODOs without linked GitHub issues
- [ ] No commented-out code blocks

---

### CQ-16: Missing Python Type Annotations

**Severity**: LOW
**Location**:
- `server/services/database_service.py:66` - `operation` param untyped
- `server/routers/workshops.py:170` - `operations_fn` untyped
- Multiple service methods missing return type hints

**Impact**: Reduced IDE support, harder to understand APIs.

**Remediation**: Add type hints to all public functions. Run mypy in strict mode.

**Acceptance Criteria**:
- [ ] All public functions have parameter and return type annotations
- [ ] mypy passes with no errors

---

### CQ-17: Naming Inconsistencies Across Backend/Frontend Boundary

**Severity**: LOW
**Location**:
- TypeScript code uses `snake_case` for API response fields (`judge_type`, `model_parameters`)
- Mixed naming in `JudgeTuningPage.tsx:147` - `pJudgeName` vs `p.model_parameters?.judge_name`

**Impact**: Slight cognitive overhead at the API boundary.

**Remediation**: Use consistent camelCase in TypeScript with transformer at the API layer.

**Acceptance Criteria**:
- [ ] Consistent naming convention within each language
- [ ] API response transformation layer if needed

---

### CQ-18: Type Ignore Suppressions

**Severity**: LOW
**Location**: `server/db_config.py:123, 125, 127`

**Description**: `# type: ignore` comments suppressing type checking instead of fixing types.

**Impact**: Undermines type safety.

**Remediation**: Fix underlying type issues.

**Acceptance Criteria**:
- [ ] Zero `# type: ignore` comments without justification

---

## Prioritized Backlog

| Priority | ID | Title | Effort | Impact |
|----------|-----|-------|--------|--------|
| P0 | CQ-3 | Replace bare except clauses | S | High - prevents silent failures |
| P0 | CQ-5 | Remove debug print statements | S | High - production hygiene |
| P0 | CQ-6 | Remove console.log + enable drop_console | S | High - production hygiene |
| P1 | CQ-1 | Split workshops.py into modules | L | Critical - enables testing and maintenance |
| P1 | CQ-2 | Decompose JudgeTuningPage | L | Critical - enables testing and maintenance |
| P1 | CQ-7 | Extract usePolling hook | M | High - reduces duplication |
| P1 | CQ-4 | Eliminate `any` types | M | High - type safety |
| P1 | CQ-8 | Flatten nested error handling | M | High - readability |
| P2 | CQ-9 | Standardize exception patterns | M | Medium - consistency |
| P2 | CQ-11 | Extract magic numbers to constants | S | Medium - maintainability |
| P2 | CQ-12 | Fix or remove dead cache code | S | Medium - correctness |
| P2 | CQ-10 | Move imports to module level | S | Low - code quality |
| P2 | CQ-13 | Encapsulate sqlite_rescue globals | M | Medium - testability |
| P2 | CQ-14 | Audit useEffect cleanup | S | Medium - memory leaks |
| P3 | CQ-15 | Resolve or remove TODOs | S | Low - clarity |
| P3 | CQ-16 | Add missing type annotations | M | Low - IDE support |
| P3 | CQ-17 | Fix naming inconsistencies | S | Low - consistency |
| P3 | CQ-18 | Remove type: ignore comments | S | Low - type safety |

**Effort**: S = < 2 hours, M = 2-8 hours, L = 1-3 days
