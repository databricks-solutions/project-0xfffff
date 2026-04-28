# V2 First-Principles Architecture

**Date:** 2026-04-27
**Status:** Architectural sketch — opinionated baseline before spec revisions and implementation planning
**Builds on:** `.claude/plans/2026-04-27-v2-sprint-primitive-design.md` (the locked V2 design)
**Related:**
- `.claude/plans/2026-04-27-v2-codebase-audit-keep-cut-refactor.md` (V1 code-level audit)
- `.claude/plans/2026-04-27-v2-workshop-debt-and-sprint-split.md` (workshop/sprint split mechanics)
- `.claude/plans/2026-04-21-unified-discovery-rubric-judge-loop-brainstorm.md` (loop-body source)

**Purpose.** Capture what the V2 codebase looks like if you start from the design and pull from V1 only where high-match. Not a plan; a shape. Inputs: the locked design above + a quick survey of `/server/`, `/client/`, and `/specs/`. Output: domain model, service topology, API surface, frontend surfaces, and an explicit V1 carry-forward audit. Use this as the working reference for spec revisions and the implementation plan that follows.

---

## Decisions confirmed in this session

These supersede the open questions in the source design doc:

1. **Postgres via Lakebase** is the durable substrate. SQLite is no longer in scope for V2. This kills the worker-substrate fork.
2. **Single agent** in V2. `Comment.author_type` collapses from `{human, judge, assistant, agent}` to `{human, judge, agent}`. Posture (recommender glue vs. in-thread reply) varies by context, not by author identity.
3. **Single Vite app, three routes.** No second mobile bundle. SME mobile-first UX is enforced as a per-route discipline (bottom-sheet portals, no `navigate()` calls), not a build boundary.

Open and unresolved:

- **Re-grade-on-refinement scope.** Leaning recorded below; needs user pin.

---

## North-star principles

1. **Sprint is the runtime; Workshop is the container.** Workshop holds long-lived assets (rubric, judge, trace pool, participant pool). Sprint is a parameterized run with a state machine. Every action writes through a sprint context.
2. **Comment is the universal interaction primitive.** Grades, judge verdicts, agent replies, criterion votes — all are typed comments with `author_type` + `payload`. One model, one feed, one stream.
3. **Phases retire as a user-visible concept.** The phase enum disappears from URLs, contexts, and conditional view trees. Replaced by sprint state (small, internal) + facilitator recommender (the "what next" surface).
4. **Versioned artifacts, not embedded fields.** Rubric and Judge are first-class records with `version` / `parent_version` lineage, owned by Workshop. Sprints reference them; refinement creates new versions.
5. **Read paths must support a recommender + a ranked feed.** An append-only event log is core infra, not a bolt-on. Metrics and feed items derive from events, not transactional joins.
6. **One bundle, two layouts.** Facilitator routes are dense and desktop-first. SME route is mobile-first with zero page navigation. They share API and stream — diverge only in shell components.

---

## Domain model

```
Workshop ─┬─ TracePool        ─ Trace
          ├─ ParticipantPool  ─ Participant (role: facilitator | sme | developer)
          ├─ Rubric (current_version_id) ───── RubricVersion ─ Criterion (typed)
          └─ Judge  (current_version_id) ───── JudgeVersion  (prompt + memory)
                          ▲                             ▲
                          │                             │
Sprint (workshop_id, config, state, metrics)  ──────────┴─ references one of each at start
   │
   ├─ SprintEvent (append-only log; the engine of everything)
   │
   ├─ Grade           (sme × trace × sprint, blind)
   ├─ JudgeRun        (judge_version × trace × sprint)  — surfaces as @judge comments
   ├─ Comment         (thread-rooted; author_type + typed payload)
   ├─ FeedItem        (per-sme materialized rank queue; derived from events)
   └─ RefinementProposal (split | collapse | refine | retune; recommender → facilitator action)
```

**Key shape decisions:**

- `Comment` replaces `discovery_feedback`, `discovery_comment`, `participant_note`, `classified_finding`, and judge-verdict-as-thread-starter. Discriminator: `author_type ∈ {human, judge, agent}` plus a typed `payload` JSON column. A judge comment carries `{criterion_id, pass_fail, rationale, judge_run_id}`; a vote carries `{target_id, direction}`; a draft-criterion carries `{statement, type}`. Human free-text has empty payload.
- `RubricVersion` + `Criterion` rows, not a single question string. `Criterion.type ∈ {pass_fail, likert, weighted, hurdle}` (the V2 ladder). `parent_criterion_id` for refinement lineage. Per-criterion health stats are *derived* from events, not stored.
- `JudgeVersion` carries prompt, ephemeral memory pointer, semantic memory blob. `alignment_trajectory` is materialized at sprint completion, not at every grade.
- `SprintEvent` is the ground truth. Event types: `trace_graded`, `comment_posted`, `judge_run_recorded`, `criterion_proposed`, `proposal_accepted`, `state_transitioned`, `threshold_crossed`. Everything downstream (metrics, feed, recommender) is a projection. **This is the load-bearing decision.**
- Workshop config (intake, MLflow source, randomization) lives on Workshop. Sprint config (preset, IRR target, alignment target, timebox, M-consecutive, T-auto-close) lives on Sprint. Today these are tangled on `WorkshopDB`.

---

## Service architecture

```
┌──────────────────── HTTP / SSE layer (FastAPI) ────────────────────────┐
│  sprints  workshops  rubric  judge  feed  comments  recommender  stream │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                     ┌───────────┴────────────┐
                     │  Application services  │
                     └───────────┬────────────┘
                                 │
   ┌────────────┬────────────┬───┴────────────┬────────────┬──────────────┐
   │ SprintEng. │ MetricsEng.│ JudgeEngine    │ FeedRanker │ Recommender  │
   │ (state m.) │ (IRR, Δ)   │ (grade + tune) │ (per-sme)  │ (spine + LLM)│
   └─────┬──────┴─────┬──────┴─────────┬──────┴─────┬──────┴──────┬───────┘
         │            │                │            │             │
         └────────────┴── SprintEvent log (Postgres, append-only) ┘
                                 │
                     ┌───────────┴────────────┐
                     │  Workers (procrastinate│  ← Postgres LISTEN/NOTIFY
                     │  on Lakebase)          │
                     │  • judge_grade_trace   │
                     │  • memalign_cluster    │
                     │  • compute_metrics     │
                     │  • rerank_sme_feed     │
                     │  • detect_thresholds   │
                     └────────────────────────┘
```

**What's deliberately new:**

- **Real worker substrate.** `procrastinate` on Lakebase Postgres — same DB, no Redis. State transitions, judge runs, metrics, MemAlign clustering, and feed reranks all run off events. Today's file-based job tracker in `routers/workshops.py` retires entirely.
- **`SprintEngine` owns the state machine** as a single function `transition(sprint, event) -> sprint'`. Auto-transitions (`active → converged`, `expired`) come from threshold-detection workers emitting events back into the log. Facilitator-driven transitions (`pause`, `ship`) are HTTP calls that emit events. **HTTP handlers never mutate sprint state directly — they enqueue events.**
- **`Recommender` is two stitched layers.** Deterministic rules over the latest projections (`5 traces graded, IRR target unmet → propose 'add traces'`) is the spine. Agent LLM glue can dress the prompt conversationally, but the spine fires regardless.
- **`FeedRanker` is its own service with its own contract.** Inputs: sprint snapshot, SME engagement projection, item-type need signals. Output: ranked `FeedItem` list per SME. Reranks on event, not on request.
- **`JudgeEngine` and `JudgeTuner` split.** Grading (run prompt, parse verdicts, write `JudgeRun` + comments) is hot path. Tuning (retune against human grades, register new `JudgeVersion`, replay across affected traces) is a worker job triggered by recommender or facilitator click.

---

## API surface (deliberately small)

```
POST   /workshops/{w}/sprints                       create draft
PATCH  /sprints/{s}                                 edit config (draft only)
POST   /sprints/{s}:start | :pause | :resume | :ship | :extend
GET    /sprints/{s}                                 snapshot (state + metrics + recommender top-1)
GET    /sprints/{s}/events?since=…                  event log (SSE)
GET    /sprints/{s}/recommender                     full ranked recommendations

GET    /sprints/{s}/feed?sme={u}                    SME ranked queue
POST   /sprints/{s}/grades                          grade a trace (writes Grade + GradeComment events)
POST   /comments                                    typed comment (target=trace|criterion|comment)

GET    /workshops/{w}/rubric                        current + version history
GET    /workshops/{w}/rubric/proposals              pending refinements
POST   /workshops/{w}/rubric/proposals/{p}:accept   facilitator action

GET    /workshops/{w}/judge                         current + alignment trajectory
POST   /workshops/{w}/judge:retune                  enqueues tune job
```

Notable absences: no `/phase` endpoint, no `/discovery_feedback`, no `/annotations`, no `/findings`, no `/classify`. All comment-shaped writes funnel through `POST /comments`.

---

## Frontend surfaces (one app, three routes)

**1. Sprint workspace** — `/workshop/:w/sprint/:s`
- Pre-active: configurator panel (preset, pools, targets, timebox).
- Active: header with sprint state + metrics sparklines; left rail recommender stream (top-1 prominent, history collapsed); right rail live event ticker; bottom trace progress grid.
- No tabs, no stepper, no phase nav. The recommender *is* the navigation.
- React Query for snapshots; EventSource on `/sprints/{s}/events` for the rest. SSE pattern carries over from V1's `/discovery-comments/stream`.

**2. Rubric & Judge page** — `/workshop/:w/rubric-judge`
- Two clear sections in one route, role-gated.
- Rubric: current criteria with derived health pills, refinement proposal cards (split/collapse/refine), longitudinal version-diff component.
- Judge: current prompt with version-diff, alignment trajectory chart, "ready to ship" pill, retune button.
- SME view of this page renders as a read-only modal sheet — never as a route. Same component, two mount surfaces.

**3. SME reactive feed** — `/feed/:w`
- Mobile-first responsive route within the same bundle.
- Single-column. Card-per-`FeedItem` with item-type-driven rendering: grade-trace, reply-thread, vote-criterion, draft-criterion, regrade.
- **Zero page navigation enforced at the route level**: bottom sheets / modals for rubric, trace details, prior thread context. No `navigate()` calls inside the feed flow.
- Live updates via the same SSE stream, filtered to this SME's feed.

---

## Cross-cutting infra

- **Real-time.** SSE only. Sprint-scoped event stream with subscription filters. Postgres `LISTEN/NOTIFY` pushes events into FastAPI handlers, which fan out to SSE clients. WebSockets aren't needed; nothing is bidirectional at the transport level.
- **Background work.** `procrastinate` on Lakebase. Same DB as event log; queue tasks live alongside domain data, transactional with event writes when needed.
- **Observability.** Sprint event log doubles as audit log. Structured `sprint_id` + `event_id` correlation IDs in all logging. MLflow stays an i/o bridge (intake, judge registration, alignment runs) — **not** an event store.
- **Auth / roles.** A single `Participant` model with role enum (`facilitator | sme | developer`) replaces V1's split User/SME concept. Auth stays thin (V1's Databricks PAT/SDK fallback is fine).

---

## V1 carry-forward audit

**High-match — pull forward largely as-is:**

| V1 piece | Why |
|---|---|
| `TraceDB` schema (input/output/context, MLflow links) | Stable shape; drop the embedded SME-feedback field |
| `JudgePromptDB` versioning + `few_shot_examples` + `performance_metrics` | Maps cleanly to `JudgeVersion`; rename and add `parent_version` |
| `MLflowIntakeService` | i/o bridge needs no rework |
| DSPy modules for analysis / disagreement | Inputs change (events not feedback rows); core signatures reusable |
| MemAlign optimizer | Becomes the engine inside the `propose_refinement` worker |
| OpenAPI-typed React Query client | Architectural fit; regenerate against new schemas |
| EventSource SSE pattern in `useDiscoveryCommentsStream` | Generalize to sprint events |
| Tailwind + shadcn/ui base + design tokens | No reason to rebuild |
| Alembic migration discipline | Keep |
| Comment threading + voting UI primitives | Map to new typed-`Comment` model |

**Drop or fundamentally redesign:**

| V1 piece | Why |
|---|---|
| `WorkshopPhase` enum + `current_phase` field + `WorkflowContext` + `WorkshopDemoLanding` conditionals | Phase machine retires as user-visible |
| `DiscoveryFeedbackDB`, `ParticipantNoteDB`, `ClassifiedFindingDB` | Merge into unified `Comment` |
| Single-question rubric on `WorkshopDB` | Becomes versioned `Rubric` + `Criterion` rows |
| `AnnotationDB` single-rating shape | Replaced by `Grade` (overall) + per-criterion `Comment`s |
| File-based job store in `routers/workshops.py` | Replace with `procrastinate` |
| Phase-routed pages (`AnnotationDemo`, `TraceViewerDemo`, `RubricCreationDemo`, `IRRResultsDemo`, `JudgeTuningPage`) | Three new surfaces collapse them |
| `WorkshopDemoLanding`'s ~200-line role+phase view tree | Deleted by construction |
| Coverage-category classification system | Already retiring per DISCOVERY_SPEC V2 |

---

## Open question: re-grade scope on criterion refinement

When a `RefinementProposal` is accepted (`proposal_accepted` event), what happens to existing grades and judge runs against the prior criterion version?

**Three options:**

| Option | What SME sees | Judge cost | Risk |
|---|---|---|---|
| Invalidate, don't re-grade | Prior grades flagged "stale (criterion vN-1)" | $0 | Long tail of stale data; convergence math gets messy when half the traces have stale grades |
| Eager re-grade, surface every regrade | A regrade item per affected trace | High (≤50 traces × 1 judge run per refinement) | SME feed floods after every refinement; engagement drops |
| Eager re-grade, surface only diffs | Regrade item only when verdict changed | High but async | Best UX, full data fidelity, but worker bursts on refinement events |

**Leaning: option 3** — re-grade in the background on `proposal_accepted`, but only emit a `regrade_needed` feed item when the new judge verdict differs from the old. Convergence metrics always reflect the current criterion; SMEs only get pulled back to traces where the refinement actually changed something. Cost ceiling at V2 max is 50 parallel judge runs per refinement event — minutes, not hours, with parallel workers. Refinements are facilitator-clicked, not auto-applied, so frequency is bounded.

**Sub-question that must be pinned first:** does refinement invalidate the SME's *human grade* too, or only the judge verdict? Plan reading suggests SMEs grade overall (blind), then vote/reply on judge's per-criterion verdicts — so **only the per-criterion thread is invalidated, not the overall grade.** That makes the regrade item shape: "judge changed its mind on criterion X for trace T; weigh in?" If that reading is right, re-grading is much cheaper than it sounds.

**Status: needs user decision before implementation planning.**

---

## Other open questions (lower priority)

- **Refinement event causality.** Should `proposal_accepted` synchronously trigger judge re-runs, or fan out via the worker queue with a `regrade_needed` event between? Worker-fan-out is more honest with the event-log-as-truth model; commit to it unless there's a reason not to.
- **Sprint event partitioning.** At V2 scale (up to 50 traces × small SME pool × 14d), a single `sprint_events` table is fine. Worth noting for future scale concerns; not a V2 problem.
- **Recommender LLM glue scope.** Spine is deterministic; glue is conversational dressing. Need to define which deterministic events are glue-eligible (probably: state transitions, threshold crossings, refinement proposals) vs. which fire raw (probably: routine "add traces" / "ship" prompts).

---

## Next steps

1. Pin re-grade scope (option 3 leaning + sub-question on human-grade invalidation).
2. Draft protected `/specs/` revisions:
   - `DISCOVERY_SPEC` major revision (sprint primitive, retire phase machine, unified comment, SME feed concepts).
   - `RUBRIC_SPEC` updates (criterion-type ladder, versioning, longitudinal artifact).
   - `JUDGE_EVALUATION_SPEC` updates (`@judge` author role, judge versioning, alignment trajectory storage, retune flow).
   - `ASSISTED_FACILITATION_SPEC` deprecation pass.
   - New `SPRINT_SPEC` (or fold into `DISCOVERY_SPEC` — decide during spec writing).
3. After spec approval, invoke `writing-plans` skill to produce the implementation plan.
