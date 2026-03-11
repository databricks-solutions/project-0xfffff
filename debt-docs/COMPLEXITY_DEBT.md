# Code Complexity Debt

## Overview

Code complexity is concentrated in a small number of files on both server and client. On the backend, `workshops.py` (5,229 lines) and `database_service.py` (3,692 lines) contain functions with cyclomatic complexity exceeding 20, nesting depths of 6+ levels, and 200+ line functions that mix multiple concerns. On the frontend, `JudgeTuningPage.tsx` (2,754 lines) manages 23 useState hooks and 10 useEffect hooks in a single component, while `TraceViewer.tsx` (1,650 lines) has a 5-layer JSON parsing fallback chain. These files account for the majority of both maintenance burden and bug risk.

Cross-references: CQ-1 (god file workshops.py), CQ-2 (god component JudgeTuningPage), CQ-8 (deeply nested error handling), ARCH-1 (god service DatabaseService), ARCH-4 (god frontend components).

---

## Items

### Server Complexity

---

### CPLX-1: begin_annotation_phase() — Cyclomatic Complexity ~20

**Severity**: CRITICAL
**Location**: `server/routers/workshops.py:1301-1663` (362 lines)

**Description**: This route handler performs request parsing, trace selection, database updates, trace tagging, and auto-evaluation setup — including spawning a background thread with its own 200-line nested function (`run_auto_evaluation_background()` at lines 1437-1637).

**Complexity breakdown**:
- 27+ decision points (if statements, except clauses)
- 6+ nesting levels: route handler → conditional → for loop → try/except → if/else → inner try/except
- 13 separate try/except blocks within the nested background function (lines 1438, 1454, 1466, 1476, 1480, 1517, 1540, 1564, 1584, 1590, 1596, 1604, 1634)
- Background function captures parent scope via closure (no explicit parameters)
- Generator consumption inside a loop inside a thread inside a route handler

**Impact**: Untestable without running the full stack. A single bug in any branch is nearly impossible to isolate. Any modification risks unintended side effects in other branches.

**Remediation**: Decompose into:
1. `validate_annotation_request()` — input validation
2. `select_annotation_traces()` — trace selection logic
3. `AutoEvaluationService.start()` — background evaluation orchestration
4. Route handler becomes ~20 lines calling the above

**Acceptance Criteria**:
- [ ] No function exceeds cyclomatic complexity of 10
- [ ] Background thread logic extracted to a service
- [ ] Each decomposed function has independent unit tests

---

### CPLX-2: add_annotation() — Cyclomatic Complexity ~22

**Severity**: CRITICAL
**Location**: `server/services/database_service.py:1400-1672` (272 lines)

**Description**: The most complex function in the codebase. Handles rating validation, retry logic with multiple exception types, update-vs-create branching, and MLflow sync — all in a single method.

**Complexity breakdown**:
- 30+ decision points across all branches
- 6+ nesting levels: retry loop → try → if (existing) → validation → if/elif/else → inner try
- 3 different exception handlers (IntegrityError, OperationalError, Exception), each with their own nested if/else for retry decisions
- Final-attempt recovery logic (lines 1604-1635) adds 3 more nesting levels
- Complex rating validation (lines 1451-1492) builds 3 intermediate dicts without intermediate types:
  - `question_judge_types_by_id`
  - `question_judge_types_by_index`
  - `validated_ratings`

**Impact**: Estimated cognitive complexity of 35-40. Any change to annotation logic requires understanding all 272 lines. Rating validation bugs are extremely hard to trace.

**Remediation**: Extract to separate methods:
1. `_validate_ratings(annotation_data, rubric)` → validated ratings dict
2. `_retry_with_backoff(operation_fn)` → generic retry wrapper
3. `_update_existing_annotation(db_annotation, validated_data)` → update path
4. `_create_new_annotation(validated_data)` → create path

**Acceptance Criteria**:
- [ ] Rating validation is a standalone testable function
- [ ] Retry logic is a generic utility, not embedded in business logic
- [ ] Update and create paths are separate methods
- [ ] No function exceeds 50 lines

---

### CPLX-3: run_alignment() — Mixed Concerns, 360+ Lines

**Severity**: CRITICAL
**Location**: `server/services/alignment_service.py:944-1311` (367 lines, 6 parameters)

**Description**: A single function that handles Databricks environment setup, MLflow experiment setup, trace searching, model URI construction, optimizer setup, background thread execution with async logging, and result reporting.

**Complexity breakdown**:
- Cyclomatic complexity ~14-16
- 5+ nesting levels
- 5 sequential phases with different concerns:
  1. Databricks environment setup (lines 982-990) — credential management
  2. MLflow experiment setup (lines 1001-1005) — external service
  3. Trace search (lines 1008-1019) — data retrieval
  4. Model URI construction with OAuth vs. token branching (lines 1022-1027, 1085-1090) — config logic
  5. Background thread with log capture (lines 1165-1202) — execution management
- Complex nested dict construction for results (lines 1608-1615)

**Impact**: Cannot test any phase independently. A failure in trace search is indistinguishable from a failure in model construction. Thread management mixes with business logic.

**Remediation**: Extract each phase into a dedicated method or service. The main function becomes an orchestrator calling 5 focused operations.

**Acceptance Criteria**:
- [ ] Each phase is a separate testable method
- [ ] Thread management extracted to infrastructure layer
- [ ] Function body is < 50 lines of orchestration

---

### CPLX-4: run_evaluation_with_answer_sheet() — Complex Generator Pipeline

**Severity**: HIGH
**Location**: `server/services/alignment_service.py:380-943` (563 lines)

**Description**: Uses a generator pattern that yields both strings (progress messages) and dicts (evaluation results) without a discriminated union type. Callers must use `isinstance()` checks to differentiate.

**Complexity breakdown**:
- Cyclomatic complexity ~16-18
- 5+ nesting levels in conditional logic
- Multiple branching paths for `require_human_ratings` True/False
- Nested loops with exception handling (lines 462-471, 498-584)
- Complex trace filtering pipeline: DataFrame → dict → database query → filtered DataFrame
- Type transitions without intermediate validation

**Impact**: Generator protocol is implicit — callers must know to check `isinstance(message, dict)`. Any change to yielded structure breaks callers silently.

**Remediation**: Define an explicit result type (e.g., `EvaluationProgress` dataclass with a `type` discriminator). Split into trace preparation, evaluation execution, and result collection phases.

**Acceptance Criteria**:
- [ ] Generator yields typed dataclass, not raw strings/dicts
- [ ] Trace filtering logic is a separate function
- [ ] Function body < 100 lines

---

### CPLX-5: add_finding() — Retry Loop with 5 Nesting Levels

**Severity**: HIGH
**Location**: `server/services/database_service.py:738-870` (132 lines)

**Description**: Discovery finding creation wrapped in a retry loop with 3 different exception handlers, each with their own recovery logic.

**Complexity breakdown**:
- Cyclomatic complexity ~18
- Outer retry loop (lines 761-866)
- 5+ nesting levels: for → try → if/else → except → if
- 3 exception handlers (IntegrityError, OperationalError, Exception) with different retry decisions
- Complex recovery logic (lines 815-839)

**Impact**: Nearly identical retry pattern to `add_annotation()` — duplicated complexity.

**Remediation**: Extract generic retry wrapper (shared with CPLX-2). Business logic becomes a simple create-or-skip operation.

**Acceptance Criteria**:
- [ ] Retry logic extracted to shared utility
- [ ] Business logic < 30 lines
- [ ] Each exception type has documented recovery behavior

---

### CPLX-6: sync_annotations_to_mlflow() — Multi-Level State Tracking

**Severity**: HIGH
**Location**: `server/services/database_service.py:1972-2073` (101 lines)

**Description**: Tracks 6+ counters (`synced_count`, `total_logged`, `skipped_no_mlflow_id`, etc.) while iterating over annotations with complex question parsing and fallback logic.

**Complexity breakdown**:
- String parsing without validation (lines 1988-2004): splits question strings by colon, assumes format
- Nested loops with conditionals (lines 2027-2058): outer loop over annotations, inner checks for trace existence, MLflow ID, ratings
- Two separate error collection mechanisms (`sync_errors` and `errors` lists)
- Deep dict access patterns: `annotation_db.trace.mlflow_trace_id`

**Impact**: Question parsing is fragile — malformed question strings cause silent failures. Error tracking split across two lists makes debugging hard.

**Remediation**: Extract question parsing to `RubricParser.parse_question_titles()`. Use a single `SyncResult` dataclass for tracking counters and errors.

**Acceptance Criteria**:
- [ ] Question parsing is a standalone tested function
- [ ] Single result type tracks all sync state
- [ ] No implicit string format assumptions without validation

---

### CPLX-7: Database Schema Updates via Raw SQL

**Severity**: MEDIUM
**Location**: `server/database.py:589-733` (`_apply_schema_updates()`, 144 lines)

**Description**: Runtime schema modifications using raw SQL strings with complex conditional logic for checking table/column existence across SQLite and PostgreSQL.

**Complexity breakdown**:
- 12+ separate ALTER TABLE statements
- Each guarded by existence checks (try/except or conditional)
- Database-specific branching (SQLite vs PostgreSQL syntax differences)
- No migration framework — changes are applied imperatively on startup

**Impact**: Schema drift between environments possible. No rollback mechanism. Hard to understand current schema state.

**Remediation**: Migrate all schema changes to Alembic migrations. Remove runtime SQL.

**Acceptance Criteria**:
- [ ] All schema changes managed by Alembic
- [ ] Zero raw ALTER TABLE in application code
- [ ] Migration history is the source of truth for schema

---

### CPLX-8: Server Dependency Graph — High Fan-In/Fan-Out

**Severity**: MEDIUM
**Location**: `server/services/database_service.py`, `server/routers/workshops.py`

**Description**: Two modules sit at the center of the dependency graph with extreme coupling:

**database_service.py (fan-in: 80+ import locations)**:
- Imported by: workshops.py (50+ refs), alignment_service.py (15+ refs), judge_service.py (10+ refs), rubric_generation_service.py (5+ refs), databricks_service.py (3+ refs)
- Imports from: 14 database models, 20+ API models, 3 utility modules, 2 config modules (fan-out: 40+ imports)

**workshops.py (fan-out: 20+ internal imports)**:
- Imports from 10+ internal modules
- 30+ of those imports are late/function-level (hiding the coupling)

**Impact**: Any change to database_service.py potentially affects 5+ consumers. Cannot refactor without understanding all 80+ usage sites.

**Remediation**: Splitting DatabaseService (ARCH-1) naturally reduces fan-in. Moving late imports to module level (ARCH-11) makes coupling visible.

**Acceptance Criteria**:
- [ ] No module has fan-in > 30
- [ ] No module has fan-out > 15
- [ ] All imports at module level

---

## Client Complexity

---

### CPLX-9: JudgeTuningPage — 23 useState + 10 useEffect Hooks

**Severity**: CRITICAL
**Location**: `client/src/pages/JudgeTuningPage.tsx` (2,754 lines)

**Description**: A single component managing the entire judge tuning workflow with 23 useState hooks (lines 62-123) and 10 useEffect hooks. Related state is scattered rather than grouped.

**State clusters that should be reducers**:
- **Evaluation state** (5 vars): `evaluations`, `metrics`, `evaluationError`, `hasEvaluated`, `evaluationComplete`
- **Auto-eval state** (4 vars): `autoEvalStatus`, `autoEvalJobId`, `autoEvalDerivedPrompt`, `isPollingAutoEval`
- **Prompt state** (3 vars): `currentPrompt`, `originalPromptText`, `isModified`
- **Alignment state** (4 vars): `isRunningAlignment`, `alignmentLogs`, `alignmentResult`, `showAlignmentLogs`

**State cascading risk**: Changing `selectedQuestionIndex` triggers useEffect (line 244) → sets `currentPrompt`, `originalPromptText`, `selectedPromptId` → triggers useEffect (line 454) → sets `hasEvaluated`, `evaluationComplete`. Multiple renders and potential race conditions.

**Complex useEffect dependency arrays**:
- Line 336: `[selectedQuestionIndex, selectedQuestion, workshopId, prompts, rubric]` (5 deps)
- Line 417: `[workshopId, isPollingAutoEval, autoEvalStatus, updateAlignmentLogs]` (4 deps, polling loop)

**Impact**: Extremely high cognitive load. State bugs are nearly impossible to trace through 23 variables and 10 effects. Every re-render evaluates all hooks.

**Remediation**:
1. Extract state clusters to `useReducer` (evaluation, auto-eval, prompt, alignment)
2. Extract to custom hooks: `useAutoEvaluation()`, `useAlignmentJob()`, `usePromptManagement()`
3. Split into sub-components: `PromptEditor`, `EvaluationSection`, `AlignmentSection`, `JudgeSelector`

**Acceptance Criteria**:
- [ ] No component has > 8 useState hooks
- [ ] Related state grouped in useReducer
- [ ] Custom hooks extract reusable state logic
- [ ] Component file < 500 lines

---

### CPLX-10: handleRunAlignment() — 200+ Line Async Function

**Severity**: HIGH
**Location**: `client/src/pages/JudgeTuningPage.tsx:1308-1622` (314 lines)

**Description**: A single async function that handles alignment job submission, status polling (1-second intervals, max 180 attempts), auto-evaluation validation, result processing, and UI state updates.

**Complexity breakdown**:
- Cyclomatic complexity ~12+
- Nested try-catch-finally
- While loop polling with multiple break conditions
- Multiple sequential state updates within the loop
- Complex conditional for auto-eval (3 pre-condition checks)

**Impact**: Cannot unit test any part of this function in isolation. Polling logic, business validation, and UI updates are interleaved.

**Remediation**: Extract to a custom `useAlignmentJob()` hook that returns `{ start, status, logs, result }`. Polling logic should be a separate `usePolling()` utility.

**Acceptance Criteria**:
- [ ] Polling logic in a reusable hook
- [ ] Business validation separate from UI updates
- [ ] No function > 50 lines

---

### CPLX-11: extractLLMResponseContent() — 5-Layer Parsing Fallback

**Severity**: HIGH
**Location**: `client/src/components/TraceViewer.tsx:768-1000+` (~230 lines)

**Description**: Handles 6+ different LLM response formats with a cascading fallback chain. Each format requires different parsing logic.

**Parsing layers**:
1. Direct JSON parse
2. Flattened format (lines 796-817)
3. OpenAI/ChatCompletion format (lines 820-895)
4. Anthropic format (lines 899+)
5. Quoted object unescaping with regex
6. Character-by-character newline reconstruction

**Supporting helper functions** (also in TraceViewer.tsx):
- `fixUnescapedNewlines()` (lines 126-170): character-by-character state machine, CC ~5
- `extractJudgeResultFromMalformed()` (lines 176-213): string pattern matching, CC ~6
- `isMarkdownContent()` (lines 50-74): 4+ nested pattern checks
- `fixQuotedJsonObjects()` (lines 103-120): regex replacement with fallback

**Impact**: Very high cognitive load — unclear which parsing path will succeed for any given input. No way to test parsing independently from the component.

**Remediation**: Extract to `utils/llmResponseParser.ts` with a `parseLLMResponse(raw: unknown): ParsedResponse` function. Each format handler becomes a named function. Add comprehensive unit tests for each format.

**Acceptance Criteria**:
- [ ] Parsing logic in a standalone utility module
- [ ] Each format handler is a named, testable function
- [ ] Unit tests cover all 6 formats plus malformed input

---

### CPLX-12: extractLLMContent() — Duplicate Extraction Logic

**Severity**: HIGH
**Location**: `client/src/components/TraceDataViewer.tsx:42-212` (170 lines)

**Description**: A second LLM content extraction function, separate from the one in TraceViewer.tsx (CPLX-11). Handles 6+ format variations with nested try-catch and conditional chains.

**Complexity breakdown**:
- Cyclomatic complexity ~12+
- Overlapping responsibility with `extractLLMResponseContent()` in TraceViewer.tsx
- `extractContentFromString()` helper (lines 48-65): nested try-catch with JSON parsing fallback
- 2 useMemo hooks for computed output values

**Impact**: Two independent implementations parsing the same data formats. Bugs fixed in one aren't fixed in the other.

**Remediation**: Consolidate with CPLX-11 into a single `utils/llmResponseParser.ts`. Both components import from the shared utility.

**Acceptance Criteria**:
- [ ] Single LLM content extraction implementation
- [ ] Both TraceViewer and TraceDataViewer use the shared utility

---

### CPLX-13: FacilitatorDashboard useMemo Chains

**Severity**: MEDIUM
**Location**: `client/src/components/FacilitatorDashboard.tsx:71-188`

**Description**: Three complex `useMemo` computations that derive dashboard metrics from raw data. While the component avoids useState (good), the computation logic is dense.

**Specific computations**:
- `userContributions` (lines 93-123): nested `reduce()` with ternary on `focusPhase`, CC ~4
- `traceCoverageDetails` (lines 126-188): multiple if/else branches for phase filtering, nested ternary for reviewer counting, complex sort logic, CC ~8+
- Progress calculations (lines 71-84): deep conditional for determining active trace counts based on phase

**Impact**: Business logic for progress calculation is locked inside a React component. Cannot be tested without rendering.

**Remediation**: Extract computation functions to `services/workshopMetrics.ts`:
- `calculateUserContributions(findings, annotations, focusPhase)`
- `calculateTraceCoverage(traces, findings, annotations, phase)`
- `calculateDiscoveryProgress(workshop, traces, findings)`

**Acceptance Criteria**:
- [ ] Computation functions testable without React
- [ ] useMemo calls delegate to imported functions
- [ ] Unit tests for each metric calculation

---

### CPLX-14: Deep JSX Nesting with Inline Ternaries

**Severity**: MEDIUM
**Location**: `client/src/pages/JudgeTuningPage.tsx:1673-2754` (1,081 lines of JSX)

**Description**: The render section alone is 1,081 lines with JSX nesting reaching 8 levels, compounded by inline ternary operators at the deepest levels.

**Worst case** (lines 1812-1827):
```
<SelectContent> → {map()} → <SelectItem> → <div> → <div> → <span> + <Badge className={ternary → ternary}> → {ternary → ternary}
```
8 levels deep with 2 nested ternaries at the leaf.

**Other examples**:
- Lines 2014-2022: multiple chained `&&` conditions with complex metric display logic
- Lines 1962-1964: IIFE inside JSX with return statement
- 97 `&&` operators in the render section

**Impact**: Impossible to read without IDE support. Changes to layout risk breaking conditional logic. Cannot extract sub-sections without untangling state dependencies.

**Remediation**: Extract sub-sections to components:
- `PromptHistorySelector` — prompt dropdown with version badges
- `EvaluationMetricsCard` — metrics display with warnings
- `EvaluationResultsTable` — paginated results grid
- `AlignmentControlPanel` — alignment job controls and logs

**Acceptance Criteria**:
- [ ] No JSX nesting deeper than 5 levels
- [ ] No inline ternaries deeper than 1 level
- [ ] Each extracted component < 200 lines

---

### CPLX-15: WorkflowContext — 8-Dependency useEffect

**Severity**: MEDIUM
**Location**: `client/src/context/WorkflowContext.tsx:126`

**Description**: A single useEffect with 8 dependencies: `[traces, findings, rubric, annotations, participants, workshopId, user, workshop?.current_phase]`. Any change to any of these triggers the effect.

**Impact**: Difficult to reason about when the effect fires. Potential for cascading updates when multiple deps change in the same render cycle.

**Remediation**: Split into focused effects — one per concern (e.g., phase tracking, data loading, user state).

**Acceptance Criteria**:
- [ ] No useEffect with > 4 dependencies
- [ ] Each effect has a clear, documented trigger condition

---

### CPLX-16: 21 `as any` Type Casts in JudgeTuningPage

**Severity**: MEDIUM
**Location**: `client/src/pages/JudgeTuningPage.tsx:1811-2068`

**Description**: 21 instances of `as any` concentrated in two areas:
1. `(prompt.model_parameters as any)?.judge_name` — 5 occurrences (lines 1811, 1813, 1815, 1821, 1823)
2. `(metrics as any).total_evaluations_all` — 6 occurrences (lines 2014, 2016, 2020, 2022, 2064, 2068)

**Root cause**: `model_parameters` and metrics types are not properly defined. The backend sends fields that the TypeScript types don't declare.

**Impact**: Type system provides zero safety for these code paths. Renamed or removed backend fields won't be caught at compile time.

**Remediation**: Define proper interfaces:
```typescript
interface ModelParameters {
  judge_name?: string;
  aligned?: boolean;
  // ...other known fields
}

interface EvaluationMetrics {
  total_evaluations: number;
  total_evaluations_all?: number;
  // ...other fields
}
```

**Acceptance Criteria**:
- [ ] Zero `as any` casts in application code
- [ ] All backend response shapes have corresponding TypeScript interfaces

---

## Complexity Summary Tables

### Server — Top Functions by Cyclomatic Complexity

| Function | File | CC | Lines | Nesting |
|----------|------|----|-------|---------|
| `add_annotation()` | database_service.py | ~22 | 272 | 6+ |
| `begin_annotation_phase()` | workshops.py | ~20 | 362 | 6+ |
| `add_finding()` | database_service.py | ~18 | 132 | 5+ |
| `run_evaluation_with_answer_sheet()` | alignment_service.py | ~18 | 563 | 5+ |
| `run_alignment()` | alignment_service.py | ~16 | 367 | 5+ |
| `get_active_annotation_traces()` | database_service.py | ~14 | 95 | 4+ |
| `_calculate_eval_metrics()` | alignment_service.py | ~13 | 172 | 4+ |
| `create_tables()` | database.py | ~12 | 66 | 4+ |

### Client — Top Components/Functions by Complexity

| Component/Function | File | CC | Lines | Hooks |
|--------------------|------|----|-------|-------|
| `JudgeTuningPage` | JudgeTuningPage.tsx | — | 2,754 | 23 useState, 10 useEffect |
| `handleRunAlignment()` | JudgeTuningPage.tsx | ~12 | 314 | — |
| `extractLLMResponseContent()` | TraceViewer.tsx | ~15 | 230+ | — |
| `extractLLMContent()` | TraceDataViewer.tsx | ~12 | 170 | — |
| `traceCoverageDetails` | FacilitatorDashboard.tsx | ~8 | 62 | — |
| `loadInitialData()` | JudgeTuningPage.tsx | ~8 | 197 | — |

### File-Level Complexity

| File | LOC | Functions/Components | Single Responsibility? |
|------|-----|---------------------|----------------------|
| `workshops.py` | 5,229 | 100+ route handlers | NO — 20+ domains |
| `database_service.py` | 3,692 | 60+ methods | NO — 15+ domains |
| `JudgeTuningPage.tsx` | 2,754 | 1 component | NO — prompt editing + eval + alignment + export |
| `TraceViewer.tsx` | 1,650 | 1 component + 6 helpers | NO — JSON parsing + rendering + LLM extraction |
| `AnnotationDemo.tsx` | 1,557 | 1 component | MIXED — display + annotation + notes |
| `RubricCreationDemo.tsx` | 1,405 | 1 component | MIXED — display + creation + suggestions |
| `alignment_service.py` | 1,377 | 2 classes, 8 methods | PARTIALLY — alignment + evaluation |
| `FacilitatorDashboard.tsx` | 1,325 | 1 component | MIXED — metrics + phase control + findings |

---

## Prioritized Backlog

| Priority | ID | Title | Effort | Impact |
|----------|------|-------|--------|--------|
| P0 | CPLX-1 | Decompose begin_annotation_phase() | M | Critical — 362-line route with background thread |
| P0 | CPLX-2 | Decompose add_annotation() | M | Critical — CC 22, most complex backend function |
| P0 | CPLX-9 | Split JudgeTuningPage state into reducers + hooks | L | Critical — 23 useState, 10 useEffect |
| P0 | CPLX-3 | Decompose run_alignment() | M | Critical — 367-line mixed-concern function |
| P1 | CPLX-4 | Type and split run_evaluation_with_answer_sheet() | M | High — implicit generator protocol |
| P1 | CPLX-10 | Extract handleRunAlignment() to custom hook | M | High — 314-line async function |
| P1 | CPLX-11 | Extract LLM parsing to shared utility | M | High — 5-layer fallback chain |
| P1 | CPLX-12 | Consolidate duplicate LLM extraction | S | High — two implementations of same logic |
| P1 | CPLX-5 | Extract generic retry wrapper | S | High — duplicated retry patterns |
| P2 | CPLX-6 | Simplify sync_annotations_to_mlflow() | M | Medium — fragile string parsing |
| P2 | CPLX-13 | Extract FacilitatorDashboard computations | S | Medium — untestable business logic |
| P2 | CPLX-14 | Decompose JudgeTuningPage JSX | L | Medium — 1,081 lines of render |
| P2 | CPLX-16 | Replace `as any` with proper types | S | Medium — 21 type safety gaps |
| P2 | CPLX-15 | Split 8-dep useEffect in WorkflowContext | S | Medium — unpredictable triggers |
| P3 | CPLX-7 | Migrate runtime SQL to Alembic | M | Medium — schema drift risk |
| P3 | CPLX-8 | Reduce dependency graph fan-in/fan-out | L | Medium — enables all other refactoring |

**Effort**: S = < 2 hours, M = 2-8 hours, L = 1-3 days
