# V2 Workshop Debt: How `Workshop` Splits into `Workshop` + `Sprint`

**Date:** 2026-04-27
**Status:** Audit deep-dive on the most load-bearing entity in V2's reshape
**Companion to:** `2026-04-27-v2-sprint-primitive-design.md`, `2026-04-27-v2-codebase-audit-keep-cut-refactor.md`
**Big-picture framing (from user):** *A workshop today is a 2–4h cycle. V2 continues that into a longer async cycle (Sprint preset) and a long release cycle (Launch preset). All three are configurations of one primitive.*

---

## The core debt

Today's `Workshop` table is **one table doing five jobs**:

| # | Concern | Belongs in V2 |
|---|---|---|
| 1 | **Persistent identity** (id, name, description, facilitator) | `Workshop` (persistent container) |
| 2 | **Cycle state** (phase, started flags, active trace ids, status) | `Sprint` (per-cycle record) |
| 3 | **Longitudinal config** (LLM endpoint, JSONPath, summarization, custom provider, MLflow integration) | `Workshop` |
| 4 | **Per-cycle artifacts** (auto_evaluation_*, judge_name) | `Sprint` |
| 5 | **Pool definitions** (implicit via `traces.workshop_id` cascade + `WorkshopParticipantDB`) | `Workshop` (with explicit M:M to sprint) |

**Surface area:** 32 columns, 23 cascade-delete relationships, 1,666 `workshop_id` references across 24 files. This is the most heavily-touched entity in the codebase. The split has to be done carefully.

---

## Naming verdict: **keep `Workshop` as the persistent container; add `Sprint` as the cycle**

Two options were viable. The other is wrong.

| Option | Verdict |
|---|---|
| **A. Rename `Workshop` → `Sprint`, introduce a new `Workshop` parent.** | ❌ Migration cost is unacceptable. Every router URL (`/workshops/{id}/...`), every `WorkshopDB` import, every test fixture, every UI label — 1,666 references churn for a vocabulary alignment. Existing workshops would also have to be retroactively wrapped in a new entity that didn't exist before. |
| **B. Keep `Workshop` as the persistent container; strip cycle state off it; add `Sprint` as a child.** | ✅ Today's `Workshop` is "V2 Workshop with phase machine bolted on." Pull the phase machine out, push it into `Sprint`. URLs and FKs survive. Existing workshops auto-spawn one Sprint at migration time. |
| **C. Hybrid: introduce `Sprint`, leave `Workshop` ambiguous, dual-FK everything.** | ❌ Indefinite "transition state" is exactly the kind of cruft the user just told us to clean up. Pick a side. |

**Mental model after the split:**
> A **Workshop** is the agent quality program (longitudinal): the rubric, the judge, the trace pool, the SME pool, the integrations.
> A **Sprint** is one cycle inside a workshop (2h Workshop / 7d Sprint / 14d Launch — all *presets* of the same Sprint primitive).
> Today's **"Workshop"** ≈ today's `Workshop` + one auto-created `Sprint` after the migration.

This matches the user's framing and the V2 design doc's vocabulary. Yes, the term "Workshop" overloads colloquially with "the 2-hour event preset" — but the *entity* is the persistent thing, and the *event* is a Sprint.

---

## Column-by-column split of `WorkshopDB`

Signals: **W** = stays on Workshop · **S** = moves to Sprint · **C** = cut · **W*** = stays but rename/clarify

| Column | Signal | Note |
|---|---|---|
| `id`, `name`, `description`, `facilitator_id`, `created_at` | W | Persistent identity |
| `mode` (workshop \| eval) | W | Workshop-level mode; eval is its own track |
| `status` (active/completed/cancelled) | W* | Repurpose as soft-delete/archive flag; sprint state replaces workshop "lifecycle" |
| `current_phase` | C | Replaced by `sprint.state` |
| `completed_phases` | C | Replaced by `sprint.state` history |
| `discovery_started`, `annotation_started` | C | Replaced by `sprint.started_at`, sprint state transitions |
| `active_discovery_trace_ids`, `active_annotation_trace_ids` | C | Replaced by sprint's trace subset reference |
| `discovery_randomize_traces`, `annotation_randomize_traces` | S | Per-cycle behavior; lives on Sprint config |
| `discovery_mode` (analysis \| social) | C | V2 collapses to one model (social-thread + judge) |
| `discovery_followups_enabled` | C | Followups die in V2 |
| `discovery_questions_model_name` | C | Followup-specific; dies with followups |
| `judge_name` | W | MLflow feedback name; longitudinal |
| `input_jsonpath`, `output_jsonpath` | W | Display config; longitudinal |
| `span_attribute_filter` | W | Display config; longitudinal |
| `summarization_enabled`, `summarization_model`, `summarization_guidance` | W | Trace summarization config; longitudinal |
| `show_participant_notes` | W | Workshop-wide UI toggle |
| `auto_evaluation_job_id` | S | Per-sprint judge alignment job |
| `auto_evaluation_prompt` | S | Snapshot of the judge prompt for one sprint's run |
| `auto_evaluation_model` | S | Per-sprint config |

**Net:** 8 columns die outright (the phase machine), 4 move to Sprint, 13 stay on Workshop. The Workshop table loses ~⅓ of its weight and gains coherence.

---

## Relationship-by-relationship split

Signals: **W** = relationship stays on Workshop · **S** = re-point at Sprint · **dual** = workshop owns the parent identity, but rows carry `sprint_id` for cycle attribution · **C** = cut

| Relationship | Signal | Note |
|---|---|---|
| `users` | W | Workshop-scoped users |
| `participants` (WorkshopParticipantDB) | W | The SME *pool*; sprints reference subsets via new `sprint_smes` join table |
| `traces` | W | The trace *pool*; sprints reference subsets via new `sprint_traces` join table |
| `rubrics` (versioned) | W | Longitudinal artifact (V2 explicit) |
| `judge_prompts` (versioned) | W | Longitudinal artifact (V2 explicit) |
| `mlflow_config` | W | Integration config |
| `custom_llm_provider` | W | Integration config |
| `annotations` | S | Each grade is a sprint event |
| `judge_evaluations` | S | Each judge run is a sprint event |
| `criterion_evaluations` | S | Per-sprint judge per-criterion verdicts |
| `user_trace_orders` | S | Per-sprint feed personalization |
| `user_discovery_completions` | C/S | Phase completion concept dies; replace with sprint completion |
| `participant_notes` | S | Per-cycle notepad scope (or dual if user wants longitudinal notes) |
| `discovery_summaries` | S | Per-sprint analysis output |
| `discovery_analyses` | S | Per-sprint LLM analysis output |
| `disagreements` | S | Per-sprint detected conflicts |
| `draft_rubric_items` | S→ rename | Becomes per-sprint MemAlign refinement proposals |
| `discovery_comments` | **dual** | Thread identity is workshop-level (trace × workshop), but each comment carries `sprint_id` so cross-sprint history is queryable. See "Threads gotcha" below. |
| `discovery_agent_runs` | dual | Same logic as comments |
| `discovery_feedback` | C | Migrate `followup_qna` rows into `discovery_comments` (V2 unification) |
| `classified_findings` | C | DSPy classification deprecated |
| `findings` (DiscoveryFindingDB) | dual | Light user signal; workshop-level identity, sprint annotation |
| `trace_discovery_questions` | C | Followup-question infrastructure dies |
| `trace_discovery_thresholds` | C/W | Workshop-level coverage targets if we keep the concept; otherwise cut |
| `trace_criteria` (eval mode) | W | Workshop-level per-trace criteria for eval mode (orthogonal to sprint loop) |

---

## Threads gotcha (the subtle one)

V2 says rubrics are longitudinal. That means: trace X graded in Sprint 1 may be re-graded in Sprint 5 after the rubric evolved. The discussion thread on trace X **persists across sprints** — Sprint 5's `@judge` reveal lands as new comments in the existing thread, not a new thread.

**Implication:** thread *identity* is `(trace_id, workshop_id)`, not `(trace_id, sprint_id)`. But each `comment.sprint_id` records when it was posted, so:

- Sprint metrics ("how much engagement this sprint?") query comments WHERE `sprint_id = X`.
- Trace history ("what did SMEs say about this trace ever?") queries the whole thread.
- @judge re-grades in Sprint 5 don't overwrite Sprint 1's @judge comments — they sit alongside as new entries with their own `judge_run_id` payload.

This argues for **dual FK** on comments (and findings, agent runs): `workshop_id` for thread identity, `sprint_id` for cycle attribution. Same goes for `discovery_findings` if you want to see "what observations did SMEs make on this trace across all sprints."

**Don't try to make these sprint-only.** You'll regret it as soon as the second sprint touches a trace.

---

## Per-relationship debt to fix during the split

These are silent bugs that will bite when sprints multiply:

1. **`UserDB.workshop_id` is nullable for facilitators, FK'd for SMEs.** With multiple sprints, a facilitator may run sprints in N workshops. The `users` ↔ `workshop` 1-to-many relationship is wrong shape; should be M:M via `WorkshopParticipantDB` (which already exists for SMEs but bypasses for facilitators). Fix while you're touching the user model.
2. **`WorkshopParticipantDB.assigned_traces` is a JSON list on the participant row.** This is the SME pool *and* the per-cycle assignment in one column. Split: `WorkshopParticipantDB` carries pool membership, new `sprint_smes` join table carries sprint-specific assignment + quota.
3. **`TraceDB.workshop_id` cascade-deletes traces when workshop is deleted.** With sprints, the trace pool is workshop-level — fine. But every per-sprint artifact (annotations, judge runs) keys on workshop, not sprint, so deleting a sprint should leave the trace pool intact. Audit cascade rules during the migration.
4. **`active_discovery_trace_ids` JSON column** — dead state being read at `routers/workshops.py:866-869`. Becomes "the current sprint's trace subset" via new join table. The migration must populate the first auto-spawned Sprint's trace subset from these columns.
5. **`mode` column appears on both Workshop and routers.** Eval mode vs. workshop mode is workshop-wide today. With sprints, *each sprint has a preset* (Workshop / Sprint / Launch) — but eval mode is orthogonal. Keep `mode` on Workshop ("is this a workshop or an eval-mode benchmark?") and add `preset` to Sprint ("Workshop / Sprint / Launch cadence").
6. **`AnnotationDB`, `JudgeEvaluationDB`, `CriterionEvaluationDB` all key on workshop_id only.** When you re-grade trace X in Sprint 5, you'll have two annotation rows for the same (trace, user) — currently no schema constraint to prevent it; queries that compute IRR will silently double-count. Add `sprint_id` and unique `(sprint_id, trace_id, user_id)` indexes during migration.
7. **`UserTraceOrderDB`** stores per-user randomized ordering for discovery + annotation phases. With sprints, ordering is per-sprint feed. Re-key on sprint_id; the workshop-level ordering doesn't make sense once a workshop has multiple cycles.

---

## Migration path

**Backward-compat goal:** existing workshops keep working through the migration; no UI changes required until V2 surfaces ship.

1. **Add `sprints` table.** Columns: `id`, `workshop_id`, `state`, `preset`, `config_json`, `metrics_json`, `started_at`, `paused_at`, `converged_at`, `expired_at`, `completed_at`, `created_at`. Initially nullable everywhere.
2. **Auto-spawn one Sprint per existing Workshop** in the same migration. Map fields:
   - `sprint.preset = workshop.mode == 'eval' ? 'eval' : 'workshop'`
   - `sprint.state` derived from `workshop.current_phase`:
     - `intake` → `draft`
     - `discovery`/`rubric`/`annotation`/`judge_tuning` → `active`
     - `results` → `completed`
   - `sprint.started_at = workshop.created_at`
   - `sprint.config_json` = pulled from `auto_evaluation_*`, `*_randomize_traces`
3. **Add `sprint_id` columns** (nullable) to: `annotations`, `judge_evaluations`, `criterion_evaluations`, `discovery_comments`, `discovery_agent_runs`, `discovery_findings`, `discovery_summaries`, `discovery_analyses`, `disagreements`, `draft_rubric_items`, `participant_notes`, `user_trace_orders`. Backfill with the auto-spawned Sprint id.
4. **Add `sprint_traces` and `sprint_smes` join tables.** Backfill from `active_discovery_trace_ids` / `active_annotation_trace_ids` and `WorkshopParticipantDB` rows.
5. **Build sprint state machine + transitions** that read/write `sprints.state` and continue to update `workshop.current_phase` as a derived view (read-shimmed). This lets phase-aware code keep running.
6. **Cut over endpoints incrementally**: new `/workshops/{id}/sprints/{sprint_id}/...` routes added; old `/workshops/{id}/advance-to-...` routes become thin wrappers that drive the state machine, then are deleted.
7. **Drop the phase columns** (`current_phase`, `completed_phases`, `discovery_started`, `annotation_started`, `active_*_trace_ids`) once no reader remains. Drop the read-shim. Drop the wrapper routes.
8. **Make `sprint_id` NOT NULL** on the per-cycle tables; add unique indexes where they prevent double-counting.

This is a 5-step migration that ships in pieces, never breaks the running app, and ends with a clean schema. Steps 1–4 are one Alembic revision; 5–6 are code-only; 7–8 are a follow-up Alembic revision after telemetry confirms no readers remain.

---

## API URL impact

| Today | V2 |
|---|---|
| `POST /workshops/{id}/begin-discovery-phase` | `POST /workshops/{id}/sprints/{sprint_id}/start` |
| `POST /workshops/{id}/advance-to-rubric-phase` | (deleted; convergence loop runs continuously) |
| `POST /workshops/{id}/advance-to-annotation-phase` | (deleted) |
| `POST /workshops/{id}/advance-to-results-phase` | `POST /workshops/{id}/sprints/{sprint_id}/ship` (or auto-close) |
| `GET /workshops/{id}` | `GET /workshops/{id}` (now returns persistent fields + active sprint summary) |
| `GET /workshops/{id}/traces` | `GET /workshops/{id}/traces` (the pool — unchanged) |
| `GET /workshops/{id}/active-traces` | `GET /workshops/{id}/sprints/{sprint_id}/traces` |
| `POST /workshops/{id}/annotations` | `POST /workshops/{id}/sprints/{sprint_id}/annotations` |
| `GET /workshops/{id}/rubric` | `GET /workshops/{id}/rubric` (workshop-level, versioned — unchanged URL) |
| `GET /workshops/{id}/judge-prompts` | `GET /workshops/{id}/judge-prompts` (workshop-level, versioned — unchanged URL) |
| (none) | `POST /workshops/{id}/sprints` (create new sprint, with config) |
| (none) | `GET /workshops/{id}/sprints` (list cycles + state) |
| (none) | `POST /workshops/{id}/sprints/{sprint_id}/pause` |
| (none) | `POST /workshops/{id}/sprints/{sprint_id}/extend` |

The `/workshops/` URL prefix survives. Sprint-scoped operations get a `/sprints/{sprint_id}/` segment. Phase-advance endpoints are deleted. Workshop-level reads (rubric, judge, traces, participants) keep their URLs because the resources moved one rung up the ownership tree, not down.

---

## What this does for the V2 framing

Once the split lands, the user's three cycle-lengths become **just three sprint presets** — exactly as the V2 design doc describes:

| Preset | `Sprint.preset` value | Example config |
|---|---|---|
| Workshop | `workshop` | `cadence=once, duration=2h, mode=live, trace_count≈15, M_consecutive=2` |
| Sprint | `sprint` | `cadence=once, duration=7d, mode=async, trace_count≈50, M_consecutive=3` |
| Launch | `launch` | `cadence=recurring, duration=14d, mode=async, trace_count≤50, M_consecutive=5` |

And the framing the user described — "a workshop is a 2–4h cycle which will be continued into a longer async cycle (sprint) and a long release cycle" — becomes literally true at the data-model level: same Sprint table, different presets, all attached to the same persistent Workshop.

---

## Risk-ordered execution

1. **Decide the naming verdict** (this doc recommends Option B — confirm or reject).
2. **Write the Alembic migration** for steps 1–4 of the migration path. Land it behind a feature flag so the new tables exist but no code reads them yet. Cheap rollback if something breaks.
3. **Build the sprint state machine** — pure new code, isolated module. Read-only against existing workshops; doesn't touch the phase machine yet.
4. **Add the read-shim** that derives `workshop.current_phase` from `sprint.state` (step 5). Run both side-by-side with assertion that they agree, for a week, before flipping the writers.
5. **Flip writers one at a time** — phase-advance endpoints update sprints, workshop columns become derived. Test each cutover.
6. **Delete the phase machine** (step 7) once telemetry shows zero direct reads of the old columns.
7. **Tighten constraints** (step 8) — NOT NULL on `sprint_id`, unique indexes for IRR safety.

Steps 1–2 are one day of careful schema work. Steps 3–5 are 1–2 weeks. Step 6 is a one-line drop migration after a quiet week. Step 7 is a defensive cleanup.

The biggest risk is step 5 (writer flip) — that's where dual-source-of-truth bugs happen. Mitigation: do it one endpoint at a time, with assertions, behind a flag.
