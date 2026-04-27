# V2 Codebase Audit: Keep / Cut / Refactor

**Date:** 2026-04-27
**Status:** Audit complete — actionable recommendations ready for review
**Companion to:** `.claude/plans/2026-04-27-v2-sprint-primitive-design.md`
**Scope:** Assess current code against V2 sprint-primitive design; reduce to keep/cut/refactor signals; identify tech debt to sweep alongside V2.

---

## Headline

**V2 is a major reshape, not a rewrite.** The hard parts — judge evaluation, MemAlign, IRR/Kappa, threaded comments, MLflow integration, trace ingestion — are solid and largely V2-compatible. What's broken is the *organizing concept*: a phase machine + dual feedback paths + scattered rubric/judge UIs. V2 demolishes the organizing layer and re-grafts the working pieces onto a sprint primitive.

**Net reuse: ≈ 65% of backend, ≈ 50% of frontend, ≈ 80% of data model.**

The biggest single threat is not missing capability — it's that the convergence loop is *implicit and post-hoc* today, and V2 makes it *explicit and continuous*.

---

## Top 10 actionable recommendations (priority order)

| # | Action | Signal | Why now |
|---|---|---|---|
| 1 | Add `Sprint` table + state machine before any new feature work | NEW | Everything else hangs off this; defines the "container" V2 talks in |
| 2 | Rip out `WorkshopPhase` enum + `current_phase`/`completed_phases`/phase-advance endpoints | CUT | Sprint state replaces it cleanly; leaving both creates dual-source-of-truth bugs immediately |
| 3 | Unify `discovery_feedback.followup_qna` + `discovery_comments` into one `discovery_comment` table with `payload` JSON | REFACTOR | Both V2 and current spec docs already promise this; preserves all data, kills 2 services |
| 4 | Add `version` + `parent_version` to `RubricDB` (already on `JudgePromptDB`); add criterion-type ladder fields to rubric criteria | REFACTOR | Cheap migration; unblocks longitudinal artifact UI without forcing rewrites |
| 5 | Delete `discovery_dspy.py`, `discovery_analysis_service.py`, `ClassificationService`, `FollowUpQuestionService` (~2K LOC) | CUT | Dead or near-dead; V2 plan explicitly retires the surface; verify no live route calls before deletion |
| 6 | Split `server/services/database_service.py` (5K LOC) and `server/routers/workshops.py` (5.8K LOC) by domain | REFACTOR | This monolith caused half the cruft; do it before writing sprint code so new code lands cleanly |
| 7 | Build per-trace IRR + alignment storage (today computed only at workshop level) | NEW | Convergence detection requires this — otherwise the state machine has nothing to read |
| 8 | Merge `JudgeTuningPage` + `RubricViewPage` + `DraftRubricSidebar` into one Rubric & Judge page; delete demo pages | REFACTOR + CUT | Three surfaces for one concept; consolidating now avoids re-shipping the split |
| 9 | Consolidate `irr_service.py` + `alignment_service.py` + `krippendorff_alpha.py` into a single `metrics_service.py` | REFACTOR | Three separate metric paths; V2 needs one trustworthy answer for "did this trace converge?" |
| 10 | Fix the three "Known Discrepancies" (no role enforcement on phase-advance, no `can_annotate` check, no-op `update_workshop_participant`) before V2 ships | CUT (the bugs) | They won't survive V2's role-gating model; fix once, not twice |

---

## The matrix

### Data model

| Entity | Signal | Note |
|---|---|---|
| `User`, `WorkshopParticipant`, auth | KEEP | No V2 changes |
| `Workshop` | REFACTOR | Drop `current_phase`, `completed_phases`, `discovery_started`, `annotation_started`, `active_*_trace_ids`; add pool refs |
| `WorkshopPhase` enum | CUT | Replaced by sprint state |
| `Trace` | KEEP | Already V2-shaped |
| `Annotation` | KEEP | Used in V2 as one author of grade signal |
| `Rubric` | REFACTOR | Add `version`, `parent_version`, `is_active_in_sprint`; add criterion `type` + `weight` |
| `TraceCriterion` (eval mode) | KEEP | Per-trace override stays distinct from workshop rubric |
| `CriterionEvaluation` | KEEP | Judge per-criterion verdicts |
| `JudgePrompt` | REFACTOR | Add `parent_version` (already has `version`); workshop-level lineage |
| `JudgeEvaluation` | KEEP | History table; add `judge_run_id` if not present |
| `DiscoveryComment` | REFACTOR | Add `payload` JSON; extend `author_type` to include `judge` |
| `DiscoveryCommentVote` | KEEP | Voting semantics intact |
| `DiscoveryFeedback` + `followup_qna` | CUT | Migrate into `discovery_comment` threads |
| `DiscoveryFinding` | KEEP | Light user signal, still useful |
| `ClassifiedFinding` | CUT | DSPy classification path retired |
| `Disagreement`, `TraceDiscoveryQuestion`, `TraceDiscoveryThreshold` | REFACTOR or CUT | Useful as recommender inputs; stop surfacing as user UI |
| `DraftRubricItem` | REFACTOR | Schema drift between `models.py` and `database.py` — reconcile, then rename to "MemAlign refinement proposal" |
| `DiscoveryAgentRun` | KEEP | Agent runs continue in V2 threads |
| `Sprint` | NEW | Core V2 primitive |
| `RubricVersion`, `JudgePromptVersion` history tables | NEW | Longitudinal artifact UI needs them |
| `WorkshopTracePool`, `WorkshopSmePool` (M:M) | NEW | V2 hoists pools to workshop |
| Per-trace IRR/alignment storage | NEW | Convergence detector reads this |
| `MemAlignProposal` (split/collapse/refine candidates) | NEW | Surfaces in Rubric page |

### Backend services / routers

| Module | Signal | Note |
|---|---|---|
| `services/database_service.py` (5K LOC) | REFACTOR | Split by domain (workshop / trace / discovery / annotation / rubric / sprint) |
| `services/discovery_service.py` (2.1K LOC) | REFACTOR | Drop followup-Q&A logic; keep comments/votes/agent runs |
| `services/alignment_service.py` (1.5K LOC) | REFACTOR | Keep MemAlign + eval; drop multi-judge UI plumbing |
| `services/judge_service.py` | KEEP | Already version-aware |
| `services/irr_service.py` + `cohens_kappa.py` + `krippendorff_alpha.py` | REFACTOR | Merge into one `metrics_service.py`; add per-trace API |
| `services/trace_summarization_service.py` | KEEP | Orthogonal |
| `services/rubric_generation_service.py` | KEEP | Wire as bootstrap on first sprint of a workshop |
| `services/discovery_dspy.py` (744 LOC) | CUT | Verify zero live callers, then delete |
| `services/discovery_analysis_service.py` (622 LOC) | CUT | Themes / edge_cases / boundary_conditions classification retired |
| `services/classification_service.py` | CUT | Same reason |
| `services/followup_question_service.py` | CUT | V2 unifies into comment threads |
| `services/draft_rubric_grouping_service.py` | REFACTOR | Repurpose for MemAlign proposal grouping; mark internal |
| `services/databricks_service.py`, `mlflow_intake_service.py` | KEEP | Integration glue |
| `services/eval_mode_service.py` | KEEP | Per-trace criteria; orthogonal to V2 sprint loop |
| `routers/workshops.py` (5.8K LOC) | REFACTOR | Split into `workshops` / `traces` / `annotations` / `judge` / `sprint` |
| `routers/discovery.py` (1.5K LOC) | REFACTOR | Drop followup-Q&A endpoints; add @judge comment posting |
| `routers/eval_mode.py` | KEEP | Eval is its own track |
| `routers/users.py`, `databricks.py` | KEEP | |
| `routers/dbsql_export.py` | KEEP | Optional feature, low cost |
| `services/sprint_service.py` (state machine + convergence detector) | NEW | |
| `services/recommender_service.py` (facilitator next-best-action) | NEW | |
| `services/feed_service.py` (SME ranked queue) | NEW | |
| Re-grade trigger plumbing on rubric refinement | NEW | |

### Frontend

| Page / component | Signal | Note |
|---|---|---|
| `App.tsx` route tree | REFACTOR | Phase-keyed routes → sprint-state-aware single workspace |
| `WorkshopDemoLanding.tsx` | REFACTOR | Becomes Sprint Workspace shell |
| `IntakePage.tsx` | REFACTOR | Folds into sprint configurator (pre-active state) |
| `FacilitatorDashboard.tsx` + `FacilitatorDiscoveryWorkspace.tsx` | REFACTOR (merge) | One Sprint Workspace active-state view |
| `JudgeTuningPage.tsx` (2.8K LOC) | REFACTOR | Right column of unified Rubric & Judge page |
| `RubricViewPage.tsx` | REFACTOR | Left column of unified page |
| `DraftRubricSidebar.tsx` + `RubricSuggestionPanel.tsx` | REFACTOR (merge) | Renamed: "MemAlign refinement proposals" |
| `DiscoveryTraceCard.tsx` (54K, monolithic) | REFACTOR | Split into feed-item + thread components |
| `DiscoverySocialThread` (nested in TraceCard) | REFACTOR | Lift to standalone reusable thread |
| `DiscoveryFeedbackView.tsx` | CUT | Inline comment composer in feed replaces it |
| `DiscoveryAnalysisTab.tsx` | REFACTOR | Becomes recommender-fed sidebar |
| `DiscoveryOverviewBar.tsx`, `CommentPill.tsx`, `MilestoneView.tsx` | KEEP | Reusable as-is |
| `WorkflowProgress.tsx` | REFACTOR | Phase bar → sprint progress card (% converged, IRR, Δ) |
| `RoleBasedWorkflow.tsx` | REFACTOR | Phase router → sprint-state router |
| `PhaseControlButton.tsx` | CUT | Phase pause/resume → sprint pause/resume (different shape) |
| `DiscoveryStartPage` / `PendingPage` / `CompletePage` | CUT | Sprint states replace these |
| `AnnotationStartPage` / `PendingPage` / `ReviewPage` | CUT | Annotation phase retires |
| `AnnotationDemo`, `RubricCreationDemo`, `TraceViewerDemo`, `IRRResultsDemo`, `DBSQLExportPage`, `UnityVolumePage` | CUT | Unrouted demo pages, ~2K LOC |
| `TraceViewer.tsx`, design system primitives, `LoadingSpinner`, `Button`, `Card`, etc. | KEEP | Solid base |
| Mobile-first responsive layer | NEW | Discovery is single-column-by-luck; SME feed needs explicit mobile-first CSS |
| Sprint configurator UI | NEW | |
| Recommender action shelf | NEW | |
| Rubric version history sidebar + alignment trajectory chart | NEW | |
| SME feed (ranked queue + item type renderers) | NEW | |

---

## Convergence loop infrastructure status

What V2 needs vs. what exists today:

| Component | Status | Location | Note |
|---|---|---|---|
| Judge grading per trace, per criterion | PARTIAL | `services/judge_service.py:40-150` | Overall trace only; lacks per-criterion storage + `judge_run_id` |
| MLflow `make_judge` / `align()` | WORKS | `services/alignment_service.py:95-400` | Solid backbone |
| MemAlign clustering (semantic vs episodic) | WORKS | `services/alignment_service.py:120-140` | Dual memory; not persisted post-registration |
| IRR / Cohen's Kappa / Krippendorff's Alpha | WORKS | `services/irr_service.py`, `cohens_kappa.py`, `krippendorff_alpha.py` | Workshop-level; needs per-trace API |
| Alignment metric (human↔judge) | WORKS | `services/alignment_service.py:332-349` | Stored per prompt version |
| Comment thread system (post/reply/vote/@mention) | PARTIAL | `database.py:680-712`, `routers/discovery.py` | Missing `@judge` author + criterion payload |
| Per-trace re-grade after rubric refinement | MISSING | — | No retrigger plumbing, no "affected traces" state |
| Workshop-level rubric versioning | PARTIAL | `database.py:344-360` | Has `created_at`; needs `version` + `parent_version` |
| Judge versioning / alignment trajectory | PARTIAL | `database.py:446-467` | Has `version`; no trajectory history table |
| Sprint state machine | MISSING | — | Workshop has phase enum; no sprint primitive |
| SME feed algorithm / ranking | MISSING | — | No queue, no personalization |

### Top 5 architectural mismatches

1. **Comments lack criterion linkage.** V2 step 5 ("judge's verdict appears as @judge thread-starter comments") cannot be implemented without `criterion_id` + `pass_fail` + `judge_run_id` on `DiscoveryCommentDB`. Today judge results live in `JudgeEvaluationDB` with no link to threads.
2. **Judge runs not stored per-trace; no re-evaluate link.** Judge evaluates globally per prompt version. No job table, no "affected by refinement" state, no mechanism to re-grade specific traces when the rubric changes.
3. **Phase machine vs. continuous loop state machine.** `Workshop.current_phase` is linear and facilitator-advanced; V2's loop body runs continuously inside `active`. The entire convergence detector is new.
4. **No rubric versioning or lineage.** `RubricDB` has `created_at` only. No proposal table with MemAlign cluster evidence; no rollback path.
5. **`author_type='judge'` schema-allowed but never written.** Schema permits it; no code path generates per-criterion `@judge` comments on reveal.

---

## Independent tech debt to sweep alongside V2

These don't *require* V2 but you'll regret leaving them:

1. **Files >2K LOC** — `routers/workshops.py` (5.8K), `services/database_service.py` (5K), `pages/JudgeTuningPage.tsx` (2.8K), `services/discovery_service.py` (2.1K), `components/TraceViewer.tsx` (1.8K), `components/RoleBasedWorkflow.tsx`. Concentration of complexity → concentration of bugs.
2. **Direct `.query()` on DB models from routers** — at least 6 sites in `workshops.py` (lines 959, 2370, 2375, 2436, 2553, 2558) bypass the service layer.
3. **13 xfail/skipped tests** spread across `test_alignment_service.py` (3 xfail + 2 skipif), `test_trace_assignment.py` (7 xfail), `test_classification_service.py` (1 skip), `test_discovery_service_v2.py` (1 skip) — implement or delete.
4. **Schema drift** between `server/models.py` and `server/database.py` for `DraftRubricItem` (and possibly others — worth a sweep).
5. **Three "Known Discrepancies"** in `specs/README.md`:
   - Phase-advance endpoints have no backend role enforcement
   - `POST /annotations` has no `can_annotate` check
   - `update_workshop_participant` is a no-op (queries DB, discards result, never commits)
6. **Checked-in SQLite files** — `.e2e-workshop.db*`, `workshop.db*`, `mlflow.db*` totalling ~8 MB; gitignore + delete.
7. **One-off scripts** — `scripts/repro_discovery_context_overflow.py` is bug-specific and dead.
8. **Multi-judge per workshop UI** — `workshops.py:1840, 5085` and multi-judge orchestration in `alignment_service`. V2 says "one judge per sprint; multi-judge = parallel sprints sharing a workshop." Keep the *capability* (workshop has many judges over time), drop the multi-judge-per-evaluation UI.

---

## Recommended sequence (risk-ordered)

1. **Cleanup pass** (1–2 days): delete demo pages, dead DSPy/classification services (after grep-confirm), checked-in DBs, xfail tests. Fixes the obviously-removable signal noise before refactoring.
2. **Split monoliths** (3–5 days): `database_service.py` and `workshops.py` by domain. Pure refactor, no behavior change. Run full suite after.
3. **Schema migration** (2–3 days): add `Sprint`, rubric/judge versioning, `discovery_comment.payload`, per-trace IRR/alignment storage, pool tables. Backward-compatible; no UI change yet.
4. **Migrate `discovery_feedback.followup_qna` → `discovery_comment` threads** (2 days). Lossy if rushed; preserve user/trace/order.
5. **Build sprint state machine + convergence detector** (1 week). Hangs phases off the sprint; phase enum becomes derivable, then deletable.
6. **Build facilitator recommender + SME feed engine** (1–2 weeks). Independent tracks; can run in parallel after step 5.
7. **Frontend reshape**: unified Rubric & Judge page, Sprint Workspace, mobile-first SME feed (2–3 weeks). Last because it depends on backend stability.

**Total estimate:** ~6–8 weeks of focused work to reach V2 parity with current functionality, plus net-new primitives.

---

## Open questions worth resolving before coding

1. **Is `discovery_dspy.py` truly dead?** Tech-debt audit says "no live route calls"; backend audit speculated it might be used in refinement. Need a `grep -r "discovery_dspy\|from .* import discovery_dspy"` confirmation. **Verify before deletion.**
2. **`TraceCriterion` (eval mode) vs. workshop-rubric criterion ladder** — V2 design adds type/weight to the *workshop rubric*, while `EVAL_MODE_SPEC` already has per-trace `TraceCriterion` with type+weight. Confirm these are *parallel* concepts (eval is a separate offline-scoring track) and not one being subsumed.
3. **Multi-judge per workshop** — V2 says "one judge per sprint; multi-judge = parallel sprints sharing a workshop." Existing multi-judge code in `alignment_service` and `workshops.py:1840, 5085` — keep the *capability* (workshop has many judges over time) but rip the multi-judge-per-evaluation UI? Confirm.
4. **`DiscoveryAgentRun`** — keep as-is, or fold into `discovery_comment.payload` for `author_type=agent`? Probably keep as-is (it has lifecycle state the comment table shouldn't carry) but worth a deliberate call.
5. **Auth model for V2** — memory says auth isn't a priority, but V2's role-gated UIs (facilitator/SME/developer-only views) make the existing "no backend role checks" gap more dangerous. Decide: enforce now, or accept and ship V2 with the same gap.

---

## Spec impact summary

(Mirrors V2 design doc; included here for the audit-to-spec handoff.)

- **DISCOVERY_SPEC** — major revision: replace phase-machine narrative with sprint primitive; retire `discovery_feedback.followup_qna`; add SME feed concepts.
- **RUBRIC_SPEC** — add criterion-type ladder (P/F → Likert → Weighted → Hurdle); rubric versioning; longitudinal-artifact concept.
- **JUDGE_EVALUATION_SPEC** — add `@judge` author role; judge versioning; alignment trajectory storage; retune-from-human-grades flow.
- **ASSISTED_FACILITATION_SPEC** — further deprecated.
- **New (TBD):** `SPRINT_SPEC` for the primitive itself, or fold into DISCOVERY_SPEC.
- **ROLE_PERMISSIONS_SPEC** — fold the V2 role-gated UI rules in; close the three "Known Discrepancies."

`/specs/` edits are a protected operation — separate user approval required.

---

## Reuse vector summary

| Layer | Keep | Refactor | Cut | New |
|---|---|---|---|---|
| Data model | ~12 entities | ~6 entities | ~3 entities | ~7 entities |
| Backend services/routers | ~6 modules | ~7 modules | ~4 modules | ~3 modules |
| Frontend pages/components | ~8 components | ~12 components | ~10 components | ~5 surfaces |

**One-line read:** the engine room is good; the dashboard, the wiring, and a third of the feedback subsystem need to come out.
