# Fully Wired Eval Mode MVP Implementation Plan

**Spec:** [EVAL_MODE_SPEC](../../specs/EVAL_MODE_SPEC.md)
**Goal:** Finish the remaining eval-mode wiring so facilitators can run criterion-level judge evaluation (milestone scoped), compute IRR on criterion decisions, and run alignment end-to-end.
**Architecture:** Keep eval mode as a parallel path to workshop-mode rubric evaluation: per-trace criteria remain the source of truth, each criterion is evaluated independently, and we reuse existing MLflow + MemAlign integration where possible. Add lineage-aware criterion metadata so judge prompts can be scoped to the correct milestone context instead of whole-trace-only evaluation. Keep changes constrained to eval-mode routes/services plus minimal frontend controls in the existing eval workspace.

**Success Criteria Targeted:**
- SC-1: One independent judge call per criterion
- SC-2: Judge sees trace content + single criterion, not other criteria
- SC-3: Judge returns met (boolean) + rationale
- SC-4: Evaluation runs as background job with progress tracking
- SC-5: Results stored per-criterion with rationale
- SC-6: One task-level judge aligned using all criteria across all traces as examples
- SC-7: Each criterion's human met/not-met decision stored as a separate MLflow assessment on the trace
- SC-8: All assessments share the judge name; extraction yields all (not just most recent)
- SC-9: Re-evaluation compares pre/post alignment accuracy on same trace set

---

## Scope Guardrails

- In scope:
  - Eval-mode judge execution against trace criteria
  - Milestone/lineage scoping for judge context
  - Eval-mode IRR computation from criterion-level decisions
  - Eval-mode alignment wiring using criterion-level assessments
- Out of scope for this MVP:
  - New discovery UX concepts beyond existing social-mode promotion flow
  - Offline eval export enhancements
  - Broad workshop-mode refactors

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `tests/unit/services/test_eval_mode_judge_execution_service.py` | Unit tests for milestone-scoped criterion judge execution |
| `tests/unit/services/test_eval_mode_irr_service.py` | Unit tests for eval-mode IRR computations |
| `tests/unit/routers/test_eval_mode_execution_router.py` | Router tests for eval evaluate/eval-job/align endpoints |

### Modified Files
| File | Change |
|------|--------|
| `server/models.py` | Extend `TraceCriterion` model with lineage fields used for milestone scoping |
| `server/database.py` | Add lineage columns to `TraceCriterionDB` and indexes for scoped fetches |
| `migrations/versions/*_eval_mode_lineage_fields.py` | Migration for new eval criterion lineage columns |
| `server/services/eval_criteria_service.py` | Persist/read lineage fields, propagate on promote/create/update |
| `server/services/discovery_service.py` | Promote finding lineage (`evidence_milestone_refs`, `evidence_question_refs`) into trace criteria in eval mode |
| `server/services/eval_mode_service.py` | Add judge-run orchestration + eval-mode IRR helpers; keep score aggregation as source of truth |
| `server/routers/eval_mode.py` | Add `POST /evaluate`, `GET /eval-job/{job_id}`, `POST /align`, `GET /alignment-status`, and eval IRR endpoint |
| `server/services/alignment_service.py` | Add eval-mode alignment entrypoint that uses criterion-level assessments and shared eval judge name |
| `client/src/hooks/useWorkshopApi.ts` | Add hooks for eval-mode evaluate job, eval IRR, and eval alignment actions |
| `client/src/components/eval/EvalModeWorkspace.tsx` | Add facilitator controls: run eval, poll progress, view IRR/alignment status |
| `client/src/components/eval/EvalGradingPanel.tsx` | Use structured criterion lineage refs (not text regex) for milestone highlighting |
| `tests/unit/services/test_eval_criteria_service.py` | Add lineage persistence assertions |
| `tests/unit/services/test_discovery_promotion_eval_mode.py` | Verify promoted criteria carry lineage/milestone refs |
| `tests/unit/services/test_eval_mode_service.py` | Add judge-run and IRR edge-case tests |
| `tests/unit/routers/test_eval_mode_router.py` | Extend existing eval-mode route coverage for new endpoints |

---

### Task 1: Add Lineage-Aware Criterion Schema

**Spec criteria:** SC-1, SC-2  
**Files:**
- Modify: `server/models.py`, `server/database.py`, `server/services/eval_criteria_service.py`, `server/services/discovery_service.py`
- Create: `migrations/versions/*_eval_mode_lineage_fields.py`
- Test: `tests/unit/services/test_eval_criteria_service.py`, `tests/unit/services/test_discovery_promotion_eval_mode.py`

- [ ] **Step 1: Write failing tests for lineage persistence**
- [ ] **Step 2: Add fields to `TraceCriterion` and `TraceCriterionDB` (e.g., `lineage_refs`, `milestone_refs`, `lineage_scope`)**
- [ ] **Step 3: Add migration for SQLite/Postgres parity**
- [ ] **Step 4: Update create/update/promote flows to persist lineage metadata**
- [ ] **Step 5: Run tests**

Run: `just test-server -k "eval_criteria_service or discovery_promotion_eval_mode" --no-header -q`  
Expected: PASS with lineage fields covered

---

### Task 2: Implement Eval-Mode Judge Execution (Milestone Scoped)

**Spec criteria:** SC-1, SC-2, SC-3, SC-4, SC-5  
**Files:**
- Modify: `server/services/eval_mode_service.py`, `server/routers/eval_mode.py`, `server/services/database_service.py`
- Test: `tests/unit/services/test_eval_mode_judge_execution_service.py`, `tests/unit/routers/test_eval_mode_execution_router.py`

- [ ] **Step 1: Write failing tests for evaluate job lifecycle**
- [ ] **Step 2: Add `POST /workshops/{workshop_id}/evaluate` job start endpoint for eval mode**
- [ ] **Step 3: Add background runner that iterates trace criteria and makes one judge call per criterion**
- [ ] **Step 4: Build lineage-scoped prompt context (`trace summary + referenced milestone`, fallback to whole trace)**
- [ ] **Step 5: Store outputs in `criterion_evaluations` and expose progress via `GET /eval-job/{job_id}`**
- [ ] **Step 6: Run tests**

Run: `just test-server -k "eval_mode_execution or eval_mode_router" --no-header -q`  
Expected: PASS with per-criterion calls and persisted rationale

---

### Task 3: Compute Eval-Mode IRR from Criterion Decisions

**Spec criteria:** SC-5  
**Files:**
- Modify: `server/services/eval_mode_service.py`, `server/routers/eval_mode.py`, `client/src/hooks/useWorkshopApi.ts`, `client/src/components/eval/EvalModeWorkspace.tsx`
- Create: `tests/unit/services/test_eval_mode_irr_service.py`

- [ ] **Step 1: Write failing tests for eval IRR input shaping**
- [ ] **Step 2: Add eval-mode IRR function that compares HUMAN vs judge criterion decisions (per criterion across traces)**
- [ ] **Step 3: Add `GET /workshops/{workshop_id}/eval-irr` endpoint**
- [ ] **Step 4: Add minimal UI block in eval workspace showing eval IRR score + readiness**
- [ ] **Step 5: Run tests**

Run: `just test-server -k "eval_mode_irr" --no-header -q`  
Expected: PASS for sparse data, no-human-label data, and normal data cases

---

### Task 4: Wire Eval-Mode Alignment

**Spec criteria:** SC-6, SC-7, SC-8, SC-9  
**Files:**
- Modify: `server/routers/eval_mode.py`, `server/services/alignment_service.py`, `server/services/eval_criteria_service.py`, `client/src/components/eval/EvalModeWorkspace.tsx`
- Test: `tests/unit/routers/test_eval_mode_execution_router.py`, `tests/unit/services/test_eval_mode_judge_execution_service.py`

- [ ] **Step 1: Write failing tests for eval alignment trigger/status behavior**
- [ ] **Step 2: Add eval alignment route(s) that use one task-level judge name for all criterion assessments**
- [ ] **Step 3: Ensure HUMAN criterion corrections are logged as separate MLflow assessments with shared judge name**
- [ ] **Step 4: Trigger pre/post re-evaluation comparison and return alignment summary**
- [ ] **Step 5: Add fallback/guard if installed MLflow still collapses multi-assessment traces (explicit warning + actionable remediation)**
- [ ] **Step 6: Run tests**

Run: `just test-server -k "eval_mode.*align or alignment_service" --no-header -q`  
Expected: PASS for alignment trigger and pre/post comparison contract

---

### Task 5: Frontend Tight Wiring for Facilitator Flow

**Spec criteria:** SC-4, SC-5, SC-9  
**Files:**
- Modify: `client/src/hooks/useWorkshopApi.ts`, `client/src/components/eval/EvalModeWorkspace.tsx`, `client/src/components/eval/EvalGradingPanel.tsx`
- Test: `client/src/components/eval/CriterionEditor.eval.test.tsx` (extend), add eval workspace unit tests if missing

- [ ] **Step 1: Add hooks for evaluate job start/status, eval IRR, and alignment trigger/status**
- [ ] **Step 2: Add controls in `EvalModeWorkspace` for run eval + run alignment**
- [ ] **Step 3: Replace regex milestone parsing in grading panel with structured lineage refs from criterion data**
- [ ] **Step 4: Add/extend UI tests**

Run: `just ui-test-unit-spec EVAL_MODE_SPEC`  
Expected: PASS for eval workspace interactions

---

### Task 6 (Final): Verify, Lint, and Spec Coverage

- [ ] **Step 1: Run backend tests for the spec**

Run: `just test-server-spec EVAL_MODE_SPEC`  
Expected: PASS

- [ ] **Step 2: Run frontend tests for the spec**

Run: `just ui-test-unit-spec EVAL_MODE_SPEC`  
Expected: PASS

- [ ] **Step 3: Run lint checks**

Run: `just lint-ruff`  
Expected: No errors

Run: `just ui-lint`  
Expected: No errors

- [ ] **Step 4: Validate and report spec coverage**

Run: `just spec-coverage --specs EVAL_MODE_SPEC`  
Expected: Coverage increases for targeted success criteria

Run: `just spec-validate`  
Expected: Test tags valid

---

## Execution Notes

- Use the new branch `feat/eval-mode-fully-wired-mvp-plan` as the implementation branch for this plan.
- Keep all eval-mode endpoints gated by workshop mode (`mode == "eval"`), and preserve existing workshop-mode behavior unchanged.
- For lineage scoping, prefer explicit criterion metadata over text parsing; retain compatibility fallback only where needed.
- If MLflow multi-assessment extraction still collapses data in the installed version, ship a guarded fallback and document exact upgrade/patch requirement before marking alignment complete.
