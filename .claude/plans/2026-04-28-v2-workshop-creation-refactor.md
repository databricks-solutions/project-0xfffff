# V2 Workshop Creation Refactor

**Date:** 2026-04-28
**Status:** Draft — awaiting Phase 0 spec revisions and user approval before code work
**Branch:** `feat/social-mode` (work-in-progress; coordinate with existing `SprintWorkspacePage` route)
**Inputs:**
- `.claude/plans/2026-04-27-v2-first-principles-architecture.md` (V2 shape; ownership model)
- `.claude/plans/2026-04-27-v2-codebase-audit-keep-cut-refactor.md` (keep/cut/refactor signals)
- `.claude/plans/2026-04-27-v2-sprint-primitive-design.md` (locked V2 design)

---

## Goal

Reshape the **workshop creation surface** to match V2:
- Workshop becomes a **thin container** (name, description, facilitator_id, mode, MLflow intake config) with no phase machinery and no bootstrap of sub-resources.
- Identity stays in Databricks; Trace and Judge stay in MLflow; Rubric stays a local entity (versioning deferred).
- Phase-advance endpoints retire; sprint state replaces them downstream.
- Sweep the creation-adjacent debt at the same time.

## Architecture (3 sentences)

V1 modeled `Workshop` as a phase-keyed god-entity that embedded rubric text, judge name, phase flags, active trace ID lists, and discovery/annotation config inline. V2 strips it to a thin container — name, description, facilitator, mode, MLflow source — with all phase machinery and runtime config moving to a future `Sprint` primitive. Workshop creation becomes a single insert; rubric/judge/trace/participant inclusion is a **sprint-time** concern, not a workshop-creation concern, because those entities belong to MLflow / Databricks (or are deferred local entities).

## Out of scope (follow-on plans)

- **Sprint state machine, recommender, SME feed, procrastinate workers** — full V2 runtime
- **Trace catalog redesign** — `TraceDB` stays as today's MLflow projection per "leave unchanged for now"
- **Rubric versioning + cross-workshop reuse** — deferred per user direction
- **Judge MLflow-interop layer reshape** — `JudgePromptDB` stays as-is; reframed as MLflow interop record in a later plan
- **`discovery_feedback.followup_qna` → `discovery_comment` migration** — orthogonal
- **`database_service.py` / `routers/workshops.py` monolith split** — independently large; separate plan
- **Three Known Discrepancies** other than `update_workshop_participant`:
  - Phase-advance role enforcement → **resolved by removing phase-advance endpoints in this plan**
  - `can_annotate` check on `POST /annotations` → orthogonal; defer

## In-flight coordination

Before Phase 3, **stop and confirm with the user**:
- `client/src/App.tsx:71` already routes `/workshop/:workshopId` → `SprintWorkspacePage` (added on `feat/social-mode`).
- Is `SprintWorkspacePage` load-bearing or scaffolding?
- Should the new `WorkshopConfiguratorPage` route to `/workshop/:id` after create, hand off to `SprintWorkspacePage`, or land somewhere else?

## Governing specs

| Spec | Why it governs creation | V2 change required |
|---|---|---|
| `DISCOVERY_SPEC.md` | Owns the workshop lifecycle narrative | Retire phase-machine wording; intro sprint primitive (or stub `SPRINT_SPEC`); add Implementation Log |
| `ROLE_PERMISSIONS_SPEC.md` | Phase-advance perms + Known Discrepancies | Remove phase-advance perms; close `update_workshop_participant` no-op discrepancy; mark phase-advance role-check discrepancy as resolved-by-removal |

`RUBRIC_SPEC`, `JUDGE_EVALUATION_SPEC`, `TRACE_INGESTION_SPEC`, `DISCOVERY_TRACE_ASSIGNMENT_SPEC` are **not** revised in this plan (per scope).

## Success Criteria Targeted

Verbatim text fills in during Phase 0. Behavior (placeholder):

- **SC-D1** *(NEW, DISCOVERY_SPEC)*: Workshop creation accepts `{name, description, facilitator_id, mode}` (and existing optional MLflow intake config) and returns a workshop with no phase fields exposed.
- **SC-D2** *(NEW, DISCOVERY_SPEC)*: Workshop response does not include `current_phase`, `completed_phases`, `discovery_started`, `annotation_started`, `active_*_trace_ids`, `discovery_*` config, or `annotation_randomize_traces`.
- **SC-RP1** *(NEW, ROLE_PERMISSIONS_SPEC)*: Phase-advance endpoints (`/advance-to-discovery`, `/complete-phase/{phase}`, `/resume-phase/{phase}`) are removed; sprint state transitions replace them downstream.
- **SC-RP2** *(EXISTING discrepancy fix, ROLE_PERMISSIONS_SPEC)*: `update_workshop_participant` persists changes (currently a no-op at `database_service.py:3162-3177`).

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `migrations/versions/0023_drop_workshop_phase_fields.py` | Drop phase columns from `workshops` after code stops writing them (Phase 4 — runs last) |
| `client/src/pages/WorkshopConfiguratorPage.tsx` | Replaces `IntakePage.tsx` + `WorkshopCreationPage.tsx`; thin creation UI |
| `client/src/hooks/useWorkshopBootstrap.ts` | React Query mutation for V2 create |
| `tests/unit/test_workshop_participant_update.py` | Regression test for the no-op fix |
| `client/tests/e2e/v2-workshop-creation.spec.ts` | E2E for new flow |

### Modified Files
| File | Change |
|------|--------|
| `server/database.py:139-210` | Drop phase fields from `WorkshopDB` (Phase 4) |
| `server/models.py:149-189` | Drop phase fields from `Workshop` Pydantic model + `WorkshopCreate` (Phase 2) |
| `server/models.py:10-26` | Remove `WorkshopPhase` enum (Phase 4) |
| `server/services/database_service.py:137-152` | `create_workshop` stays a thin insert; remove phase-field initialization |
| `server/services/database_service.py:3162-3177` | Fix `update_workshop_participant` no-op |
| `server/routers/workshops.py:21-130` | Remove file-based job tracker (`AlignmentJob` + `/tmp/workshop_jobs/`) |
| `server/routers/workshops.py:290-294` | Update `create_workshop` route to return V2 schema |
| `server/routers/workshops.py` | Remove `/advance-to-discovery`, `/complete-phase/*`, `/resume-phase/*` |
| `client/src/pages/WorkshopDemoLanding.tsx:494-587` | Delete view-tree dispatcher (~200 lines); see Phase 3 decision |
| `client/src/App.tsx:61-79` | Drop phase-keyed route; add `/workshop/new` → configurator |
| `client/src/components/RoleBasedWorkflow.tsx` | Remove `startDiscoveryPhase` (lines 48-66) |
| `client/src/hooks/useWorkshopApi.ts:186-293` | Drop phase selectors (`useWorkshopPhase`, `useWorkshopDiscoveryConfig`); replace `useCreateWorkshop` |
| `client/src/client/` | Regenerate OpenAPI client after backend schema changes |

### Deleted Files
| File | Reason |
|------|--------|
| `client/src/pages/AnnotationDemo.tsx`, `RubricCreationDemo.tsx`, `TraceViewerDemo.tsx`, `IRRResultsDemo.tsx`, `DBSQLExportPage.tsx`, `UnityVolumePage.tsx` | Unrouted phase demos |
| `client/src/pages/DiscoveryStartPage.tsx`, `DiscoveryPendingPage.tsx`, `DiscoveryCompletePage.tsx` | Phase pages, retired |
| `client/src/pages/AnnotationStartPage.tsx`, `AnnotationPendingPage.tsx`, `AnnotationReviewPage.tsx` | Phase pages, retired |
| `client/src/pages/IntakePage.tsx` (if exists), `WorkshopCreationPage.tsx` | Folded into configurator |
| `client/src/components/PhaseControlButton.tsx`, `WorkflowProgress.tsx` | No phase UI in V2 |
| `server/services/discovery_dspy.py`, `discovery_analysis_service.py`, `classification_service.py`, `followup_question_service.py` | After grep-confirm of zero callers (per audit) |
| `scripts/repro_discovery_context_overflow.py` | Bug-specific dead script |
| `.e2e-workshop.db*`, `workshop.db*`, `mlflow.db*` | Checked-in SQLite (~8MB); gitignore + delete |

---

## Phase 0 (BLOCKING, PROTECTED): Spec Revisions

`/specs/` edits are a protected operation. No code work until specs are approved.

### Task 0.1: Revise DISCOVERY_SPEC

- [ ] Read `specs/DISCOVERY_SPEC.md` end-to-end
- [ ] Replace phase-machine narrative with V2 sprint-primitive overview (workshop as thin container; sprint as the runtime; comment as universal primitive)
- [ ] Add SC-D1 and SC-D2 with exact verbatim text
- [ ] Add `## Implementation Log` section (currently missing per Explore findings)
- [ ] Present diff to user; wait for approval

### Task 0.2: Revise ROLE_PERMISSIONS_SPEC

- [ ] Remove phase-advance permission rules (advancement is a sprint concern downstream)
- [ ] Add SC-RP1 with verbatim text
- [ ] Document the `update_workshop_participant` no-op fix (SC-RP2) closing the Known Discrepancy at `specs/README.md:379`
- [ ] Mark phase-advance role-check Known Discrepancy as **resolved by removal**
- [ ] Add Implementation Log section if missing
- [ ] Present diff; wait for approval

### Task 0.3: Update SPEC_COVERAGE_MAP baseline

- [ ] After spec edits land, run `just spec-coverage --json` to capture baseline
- [ ] Note expected dip on DISCOVERY (new SC-D1, SC-D2 are uncovered until Phase 2 ships)
- [ ] Commit baseline

**Phase 0 deliverable:** approved spec edits with verbatim Success Criteria text the rest of this plan can reference.

---

## Phase 1: Cleanup pass (low-risk, ~1-2 days)

### Task 1.1: Verify dead-service callers

- [ ] **Step 1: Grep**

```bash
rg -n "discovery_dspy|discovery_analysis_service|classification_service|followup_question_service" server/ tests/
```

Expected: results in `services/` self-imports + their own tests only. No active router/service imports.

- [ ] **Step 2: If any non-self caller exists, stop and report**

Re-scope this task to deprecate-and-remove. Do not delete.

### Task 1.2: Delete dead services and demo pages

- [ ] **Step 1: Delete server-side dead services**

```bash
rm server/services/discovery_dspy.py
rm server/services/discovery_analysis_service.py
rm server/services/classification_service.py
rm server/services/followup_question_service.py
rm tests/unit/test_classification_service.py 2>/dev/null || true
rm scripts/repro_discovery_context_overflow.py 2>/dev/null || true
```

- [ ] **Step 2: Delete frontend demo pages**

```bash
rm client/src/pages/AnnotationDemo.tsx \
   client/src/pages/RubricCreationDemo.tsx \
   client/src/pages/TraceViewerDemo.tsx \
   client/src/pages/IRRResultsDemo.tsx \
   client/src/pages/DBSQLExportPage.tsx \
   client/src/pages/UnityVolumePage.tsx
```

- [ ] **Step 3: Remove imports in `WorkshopDemoLanding.tsx`** (lines 16-22)

Delete the demo page imports. The view dispatcher itself goes in Phase 3.

- [ ] **Step 4: Run tests**

```bash
just test-server
just ui-test-unit
```

Expected: green. Update or delete any test that referenced a deleted page.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: delete dead services and unrouted demo pages

Removes ~2K LOC of unrouted demo pages and DSPy/classification
services that were retired per the V2 audit and have no live callers."
```

### Task 1.3: Stop tracking SQLite dev DBs

- [ ] **Step 1: Add to `.gitignore` if missing**

```
*.db
*.db-journal
.e2e-workshop.db*
workshop.db*
mlflow.db*
```

- [ ] **Step 2: Untrack files**

```bash
git rm --cached .e2e-workshop.db* workshop.db* mlflow.db* 2>/dev/null || true
```

- [ ] **Step 3: Commit**

### Task 1.4: Fix `update_workshop_participant` no-op

**Spec criteria:** SC-RP2

- [ ] **Step 1: Write failing test**

`tests/unit/test_workshop_participant_update.py`:

```python
import pytest
from server.services.database_service import DatabaseService

@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("update_workshop_participant persists changes")  # exact text from Phase 0
def test_update_workshop_participant_persists(db_session, sample_workshop, sample_user):
    svc = DatabaseService(db_session)
    p = svc.add_workshop_participant(sample_workshop.id, sample_user.id, role="sme")
    p.role = "facilitator"
    result = svc.update_workshop_participant(p)
    assert result is not None
    assert result.role == "facilitator"
    refetched = svc.get_workshop_participant(sample_workshop.id, sample_user.id)
    assert refetched.role == "facilitator"
```

- [ ] **Step 2: Run** — `just test-server-spec ROLE_PERMISSIONS_SPEC` — Expected FAIL.

- [ ] **Step 3: Fix** at `server/services/database_service.py:3162-3177`:

```python
def update_workshop_participant(self, participant: WorkshopParticipant) -> WorkshopParticipant:
    db_participant = (
        self.db.query(WorkshopParticipantDB)
        .filter(
            and_(
                WorkshopParticipantDB.workshop_id == participant.workshop_id,
                WorkshopParticipantDB.user_id == participant.user_id,
            )
        )
        .first()
    )
    if db_participant is None:
        raise ValueError(
            f"Participant not found: workshop={participant.workshop_id} user={participant.user_id}"
        )
    db_participant.role = participant.role
    self.db.commit()
    self.db.refresh(db_participant)
    return self._workshop_participant_from_db(db_participant)
```

- [ ] **Step 4: Run** — Expected PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(participants): update_workshop_participant now persists changes

Closes the Known Discrepancy in specs/README.md:379 — the function
queried the DB but never returned or committed."
```

### Task 1.5: Remove file-based job tracker

- [ ] **Step 1: Find live callers**

```bash
rg -n "AlignmentJob|get_job\(|create_job\(|JOB_DIR" server/ client/
```

- [ ] **Step 2: Decision**

If callers only feed deprecated UI status displays, remove. If a live workflow depends on it, **escalate**: the procrastinate substrate (out of scope here) is the V2 replacement. A short-term in-memory or simple-table replacement may be needed. Pause and check with user.

- [ ] **Step 3: Remove + adapt callers (if safe)**

Delete `AlignmentJob`, `JOB_DIR`, `get_job`, `create_job` from `server/routers/workshops.py:21-130`.

- [ ] **Step 4: Tests**

```bash
just test-server
```

- [ ] **Step 5: Commit**

---

## Phase 2: API + Pydantic reshape (~1-2 days)

Drop phase fields from public schema. Remove phase-advance endpoints. The DB columns stay until Phase 4.

### Task 2.1: Pydantic schema V2

**Spec criteria:** SC-D1, SC-D2

- [ ] **Step 1: Write failing test**

`tests/unit/test_workshop_schema_v2.py`:

```python
import pytest
from server.models import Workshop

FORBIDDEN_V2_FIELDS = {
    "current_phase", "completed_phases",
    "discovery_started", "annotation_started",
    "active_discovery_trace_ids", "active_annotation_trace_ids",
    "discovery_randomize_traces", "annotation_randomize_traces",
    "discovery_questions_model_name", "discovery_mode", "discovery_followups_enabled",
}

@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Workshop response excludes phase machinery")  # exact text from Phase 0
def test_workshop_schema_drops_phase_fields():
    schema = Workshop.model_json_schema()
    leaks = FORBIDDEN_V2_FIELDS & set(schema["properties"].keys())
    assert not leaks, f"V2 Workshop schema still exposes: {leaks}"
```

- [ ] **Step 2: Run (FAIL)**
- [ ] **Step 3: Edit `server/models.py:149-189`** — drop the listed fields from `Workshop` and `WorkshopCreate`. Keep MLflow-related fields (`input_jsonpath`, `output_jsonpath`, `span_attribute_filter`) — workshop-level intake config per architecture doc. Keep `summarization_*` (orthogonal feature).
- [ ] **Step 4: Run (PASS)**
- [ ] **Step 5: Update `database_service.py:137-152`** — `create_workshop` stops setting phase fields explicitly (DB defaults still fire until Phase 4)
- [ ] **Step 6: Regenerate OpenAPI client**

```bash
just generate-client
```

- [ ] **Step 7: Run full unit suite + commit**

```bash
just test-server
just ui-test-unit
git commit -m "feat(workshops): V2 Workshop schema drops phase fields"
```

### Task 2.2: Remove phase-advance endpoints

**Spec criteria:** SC-RP1

- [ ] **Step 1: Grep callers**

```bash
rg -n "advance-to-discovery|complete-phase|resume-phase|startDiscoveryPhase" server/ client/
```

- [ ] **Step 2: Remove handlers** from `server/routers/workshops.py`
- [ ] **Step 3: Remove client callers** in `client/src/components/RoleBasedWorkflow.tsx:48-66` (delete `startDiscoveryPhase`); the button it backs goes away in Phase 3
- [ ] **Step 4: Tests**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(workshops): remove phase-advance endpoints

V2 retires the phase machine; sprint state transitions replace
phase advancement (downstream plan)."
```

### Task 2.3: V2 create endpoint E2E

- [ ] **Step 1: Write E2E**

`client/tests/e2e/v2-workshop-creation.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.use({ tag: ['@spec:DISCOVERY_SPEC', '@req:Workshop creation accepts thin container fields'] });

test('V2 workshop creation returns clean schema', async ({ request }) => {
  const r = await request.post('/api/workshops/', {
    data: { name: 'V2 W', description: 'x', facilitator_id: 'test-user', mode: 'workshop' },
  });
  expect(r.status()).toBe(201);
  const w = await r.json();
  expect(w.id).toBeTruthy();
  expect(w.current_phase).toBeUndefined();
  expect(w.completed_phases).toBeUndefined();
  expect(w.discovery_started).toBeUndefined();
});
```

- [ ] **Step 2: Run + commit**

```bash
just e2e-spec DISCOVERY_SPEC
```

---

## Phase 3: Frontend reshape (~3-4 days)

Replace creation UI; delete phase machinery from views.

### Task 3.1: WorkshopConfiguratorPage

- [ ] **Step 1: Vitest test**

`client/src/pages/__tests__/WorkshopConfiguratorPage.test.tsx`:

```typescript
// @spec DISCOVERY_SPEC
// @req Workshop configurator submits thin container fields

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// ... QueryClientProvider wrapper, MSW mock for POST /workshops
test('submits V2 workshop create with name, description, mode', async () => { /* ... */ });
```

- [ ] **Step 2: Run (FAIL)**
- [ ] **Step 3: Implement** — minimal: name (required), description, mode (workshop|eval), submit. No phase UI, no rubric/judge picker (those happen at sprint creation, downstream). On success: navigate to `/workshop/:id`.

```tsx
// client/src/pages/WorkshopConfiguratorPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkshopBootstrap } from '@/hooks/useWorkshopBootstrap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function WorkshopConfiguratorPage() {
  const navigate = useNavigate();
  const create = useWorkshopBootstrap();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'workshop' | 'eval'>('workshop');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = await create.mutateAsync({ name, description, mode });
    navigate(`/workshop/${w.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader><CardTitle>New workshop</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {/* mode selector */}
            <Button type="submit" disabled={create.isPending}>Create</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run (PASS)**
- [ ] **Step 5: Commit**

### Task 3.2: Wire route + delete legacy creation pages

- [ ] **Step 1: Update `App.tsx`** — add `<Route path="/workshop/new" element={<WorkshopConfiguratorPage />} />`. Confirm `/workshop/:workshopId` continues to point to `SprintWorkspacePage` (already wired on `feat/social-mode`).
- [ ] **Step 2: Delete** `IntakePage.tsx` (if exists), `WorkshopCreationPage.tsx`
- [ ] **Step 3: Search for refs**

```bash
rg -n "IntakePage|WorkshopCreationPage|/intake" client/
```

Fix or delete refs.

- [ ] **Step 4: Tests + smoke E2E**
- [ ] **Step 5: Commit**

### Task 3.3: Strip phase machinery from `WorkshopDemoLanding`

**Decision required:** With `feat/social-mode` having added `SprintWorkspacePage`, the cleaner path is to **delete `WorkshopDemoLanding`** entirely and route `/workshop/:id` to `SprintWorkspacePage`. Confirm with user before deletion — if `WorkshopDemoLanding` is still load-bearing for any role/view, fall back to deleting only the view dispatcher (lines 494-587).

- [ ] **Step 1: Confirm deletion scope with user**
- [ ] **Step 2: Delete or strip**

```bash
# If full delete approved:
rm client/src/pages/WorkshopDemoLanding.tsx \
   client/src/components/PhaseControlButton.tsx \
   client/src/components/WorkflowProgress.tsx
# RoleBasedWorkflow.tsx becomes a thin role-check helper or deletes entirely
```

- [ ] **Step 3: Update `App.tsx`** to point `/workshop/:workshopId` directly at `SprintWorkspacePage`
- [ ] **Step 4: Update `useWorkshopApi.ts:186-293`** — drop `useWorkshopPhase`, `useWorkshopDiscoveryConfig`; keep `useWorkshop`, `useWorkshopMeta`; replace `useCreateWorkshop` with the new `useWorkshopBootstrap`
- [ ] **Step 5: Run lint + unit tests**

```bash
just ui-lint
just ui-test-unit
```

- [ ] **Step 6: Commit**

### Task 3.4: Delete remaining phase pages

```bash
rm client/src/pages/DiscoveryStartPage.tsx \
   client/src/pages/DiscoveryPendingPage.tsx \
   client/src/pages/DiscoveryCompletePage.tsx \
   client/src/pages/AnnotationStartPage.tsx \
   client/src/pages/AnnotationPendingPage.tsx \
   client/src/pages/AnnotationReviewPage.tsx
```

Verify no remaining imports + commit.

---

## Phase 4: Drop legacy DB columns (~1 day)

Code no longer reads/writes phase fields. Drop them.

### Task 4.1: Migration

- [ ] **Step 1: Verify zero callers**

```bash
rg -n "current_phase|completed_phases|discovery_started|annotation_started|active_discovery_trace_ids|active_annotation_trace_ids|discovery_randomize_traces|annotation_randomize_traces|discovery_questions_model_name|discovery_followups_enabled|discovery_mode" server/ client/
```

Expected: results only in the migration file itself.

- [ ] **Step 2: Generate alembic skeleton**

```bash
just alembic-revision -m "drop workshop phase fields"
```

- [ ] **Step 3: Edit migration**

```python
"""drop workshop phase fields

Revision ID: 0023
Revises: 0022_add_discovery_agent_run_events
"""
from alembic import op
import sqlalchemy as sa

revision = "0023_drop_workshop_phase_fields"
down_revision = "0022_add_discovery_agent_run_events"

PHASE_COLS = [
    "current_phase",
    "completed_phases",
    "discovery_started",
    "annotation_started",
    "active_discovery_trace_ids",
    "active_annotation_trace_ids",
    "discovery_randomize_traces",
    "annotation_randomize_traces",
    "discovery_questions_model_name",
    "discovery_mode",
    "discovery_followups_enabled",
]

def upgrade():
    with op.batch_alter_table("workshops") as batch:
        for col in PHASE_COLS:
            batch.drop_column(col)

def downgrade():
    # Restoring would require column types + defaults; intentionally non-reversible
    raise NotImplementedError("V2 phase column drop is one-way")
```

- [ ] **Step 4: Run upgrade**

```bash
just alembic-upgrade
```

- [ ] **Step 5: Drop ORM columns** from `server/database.py:139-210`
- [ ] **Step 6: Drop `WorkshopPhase` enum** from `server/models.py:10-26`
- [ ] **Step 7: Run full test suite**

```bash
just test-server
just ui-test-unit
just e2e
```

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(workshops): drop legacy phase columns + WorkshopPhase enum

Final V2 workshop creation reshape: WorkshopDB is now a thin
container. Phase machinery is fully retired."
```

---

## Phase 5 (Final): Lint + Verify Spec Coverage

- [ ] **Step 1: Lint**

```bash
just ui-lint
```

Expected: no errors.

- [ ] **Step 2: Spec coverage**

```bash
just spec-coverage --specs DISCOVERY_SPEC --specs ROLE_PERMISSIONS_SPEC
```

Expected: SC-D1, SC-D2, SC-RP1, SC-RP2 covered. Net coverage stable or up.

- [ ] **Step 3: Untagged tests check**

```bash
just spec-validate
```

- [ ] **Step 4: Full test suite**

```bash
just test-server
just ui-test-unit
just e2e
```

- [ ] **Step 5: Update Implementation Logs** (protected — present diff)

For DISCOVERY_SPEC and ROLE_PERMISSIONS_SPEC, set this plan's log entry status `planned` → `complete`.

---

## Risks and open questions

1. **`feat/social-mode` overlap.** `SprintWorkspacePage` is already routed at `/workshop/:workshopId`. Phase 3.3 needs user confirmation on whether to fully delete `WorkshopDemoLanding` or keep a stripped-down version.
2. **File-based job tracker removal.** Safe only if no live workflow depends on it. Procrastinate worker substrate is the V2 replacement (out of scope). If a live caller exists, escalate before removing.
3. **Eval mode interaction.** Workshop has `mode ∈ {workshop, eval}`. V2 reshape applies cleanly to `workshop` mode. Verify eval mode flows still pass after each phase.
4. **MemAlign / DSPy deletion timing.** `discovery_dspy.py` deletion depends on grep-confirmation in Task 1.1. MemAlign code paths in `alignment_service.py` stay regardless — they're the engine for the (out-of-scope) refinement worker.
5. **Backwards compat.** Phase 4 drops columns one-way (no clean downgrade). If a non-dev workshop dataset exists, plan a data backfill first. Today, only checked-in dev DBs exist (deleted in Task 1.3).
6. **Coverage dip window.** Between Phase 0 spec edits landing and Phase 2-3 tests landing, DISCOVERY coverage will dip. Don't ship intermediate states past CI gates.
7. **Spec validation order.** Phase 0 must complete before any test in Phase 1.4, 2.1, 2.3 can be tagged with verbatim `@req` text. Until then, tests use placeholder requirement strings that will fail spec-validate.

---

## Implementation Log entry (for governing specs)

```markdown
| 2026-04-28 | [V2 Workshop Creation Refactor](../.claude/plans/2026-04-28-v2-workshop-creation-refactor.md) | planned | Drop phase machinery from Workshop; replace IntakePage with thin configurator; sweep creation-adjacent debt (dead services, demo pages, update_workshop_participant no-op, file-based job tracker) |
```

This entry is a **protected operation** (modifying `/specs/`). Present to user before writing.

---

## Plan saved. Ready for Phase 0 spec revisions?

Confirm before I draft Phase 0 spec edits:

1. Scope is correct — workshop creation reshape only, runtime/recommender/feed/rubric/judge-globalization deferred.
2. Two governing specs (DISCOVERY_SPEC, ROLE_PERMISSIONS_SPEC) is the right Phase 0 scope.
3. You want me to draft the Phase 0 spec edits next, or you'll handle the spec edits yourself.
4. The `WorkshopDemoLanding` deletion question (Phase 3.3): full delete in this plan, or strip view dispatcher only?
5. The file-based job tracker (Task 1.5): remove now, or hold until the procrastinate plan?
