# V2 First-Principles Architecture

**Date:** 2026-04-27 (revised 2026-04-28)
**Status:** Architectural sketch — opinionated baseline before spec revisions and implementation planning
**Builds on:**
- `.claude/plans/2026-04-27-v2-sprint-primitive-design.md` (earlier locked design — superseded in part by this rev)
- `.claude/plans/2026-04-27-v2-codebase-audit-keep-cut-refactor.md` (V1 code-level audit)
- `.claude/plans/2026-04-21-unified-discovery-rubric-judge-loop-brainstorm.md` (loop-body source)

**Purpose.** Concrete shape of V2: domain model, services, APIs, frontend surfaces. Use as the working reference for spec revisions and the implementation plan that follows.

**2026-04-28 revision summary.**
- The Workshop entity collapses. The longitudinal anchor is the **agent** (1 app = 1 agent = 1 MLflow experiment). All long-lived state — rubric, judge ref, participants, events — attaches to the agent.
- **Sprint becomes a cutline marker.** A named point/range against the agent's continuous improvement stream, with optional goals and a snapshot. No state machine, no runtime container.
- Phases retire entirely as both a user-visible concept *and* an internal sprint state. The recommender computes "what next" from natural event tables.
- Improvement is continuous. Sprints are how the team chooses to draw lines through it.

---

## Decisions confirmed

1. **Postgres via Lakebase** is the durable substrate. SQLite is out of scope for V2.
2. **1 app = 1 agent = 1 MLflow experiment.** No Workshop entity. The app is the workshop. Multi-agent within one app is not in V2; if it ever lands, an `agent_id` FK lifts everything cleanly.
3. **Sprint is a cutline marker, not a runtime container.** It records: `name`, `started_at`, `ended_at?`, optional `goals` (IRR / alignment targets the team set going in), and `snapshot` (computed at close: rubric version, judge version, alignment Δ at end, label counts in range). No state machine — just open / closed.
4. **Single agent author surface.** `Comment.author_type ∈ {human, judge, agent}`. Posture varies by context, not by author identity.
5. **Single Vite app, three routes.** SME mobile-first UX is per-route discipline (bottom-sheet portals, no `navigate()` calls), not a separate bundle.
6. **Ownership stays close to Databricks/MLflow primitives:**
   - **User** = Databricks identity. App-side: email → role mapping per agent.
   - **Trace** = MLflow-owned. Local `TraceDB` is a projection cache, not an ownership boundary.
   - **Judge** = MLflow-owned. App provides interop (pick, run, retune); MLflow's prompt registry is the version graph.
   - **Rubric** = local entity attached to the agent. Versioned in the app.

Open and unresolved:
- **Re-grade scope on criterion refinement.** Leaning recorded below; needs a pin.
- **Cross-agent rubric reuse.** Out of V2; data model doesn't preclude it.

---

## North-star principles

1. **Agent is the longitudinal anchor; sprint is a cutline against its event stream.** Configuration, rubric, judge ref, participants, and events all attach to the agent. Sprints are timestamps + goals + snapshots.
2. **Comment is the universal interaction primitive.** Grades, judge verdicts, agent replies, votes — all typed comments with `author_type` + `payload`. One model, one feed, one stream.
3. **Phases retire entirely.** No phase enum, no sprint state machine. The recommender computes "what next" from the natural event tables (labels, comments, rubric versions, judge versions, judge runs).
4. **Versioning lives where the entity lives.** Rubric versioning is the app's job. Judge versioning is MLflow's. The local `JudgeRef` stores only the reference + alignment metadata.
5. **Read paths support a recommender + a ranked feed.** Both are queries — rolling aggregations over the event tables. No bespoke event-log infrastructure beyond what the natural tables already provide.
6. **One bundle, two layouts.** Facilitator/dev routes are dense desktop. SME route is mobile-first with zero `navigate()` calls in the feed flow. Shared API and stream; diverge only in shell components.

---

## Domain model

```
Databricks identity
   User (databricks email = canonical id)

MLflow primitives (referenced, not owned)
   Trace        (mlflow_trace_id; experiment_id)
   Judge        (mlflow judge / prompt registry id; version)

Local entities
   Agent ──┬── (config: name, description, mlflow_experiment_id, intake config)
           ├── AgentParticipant   (User × Agent × role: facilitator | sme | developer)
           ├── Rubric             (versioned; current_version_id) → RubricVersion → Criterion
           ├── JudgeRef           (mlflow_judge_id + current_mlflow_judge_version + alignment metrics)
           └── Sprint             (cutline marker: name, started_at, ended_at?, goals?, snapshot?)

Events accumulating against the agent (the natural tables)
   Label                  (sme × trace × criterion × verdict, blind grade)
   JudgeRun               (mlflow_judge_version × trace; surfaces as @judge comments)
   Comment                (thread-rooted; author_type + typed payload)
   RefinementProposal     (recommender → facilitator action)
```

**Key shape decisions:**

- **Agent as singleton-ish.** In V2, one agent row per app (1:1 with MLflow experiment). Schema models Agent as a real entity so future multi-agent isn't a migration — but in V2 there's exactly one.
- **No `WorkshopDB`, no `SprintTrace`, no `SprintParticipant`.** Trace selection is an MLflow query against the agent's intake config. "Active SMEs" is a query over recent labels/comments. Don't materialize what's derivable.
- **Sprint is a cutline.** Fields: `name`, `started_at`, `ended_at` (nullable — open sprints have it null), `goals` (optional IRR / alignment targets stored at start), `snapshot` (computed at close: rubric_version_id, mlflow_judge_version, alignment Δ at end_at, count of labels in range, count of comments in range, brief text summary). Sprints can overlap; they don't gate work. Closing a sprint computes the snapshot once and freezes it.
- **`Comment`** replaces `discovery_feedback`, `discovery_comment`, `participant_note`, `classified_finding`, and judge-verdict-as-thread-starter. `author_type ∈ {human, judge, agent}`. Typed `payload` JSON: a judge comment carries `{criterion_id, pass_fail, rationale, judge_run_id}`; a vote carries `{target_id, direction}`; a draft-criterion carries `{statement, type}`. Human free-text has empty payload.
- **`Rubric` + `RubricVersion` + `Criterion`** rows. Local versioned entity attached to the agent. `Criterion.type ∈ {pass_fail, likert, weighted, hurdle}` (the V2 ladder). `parent_criterion_id` for refinement lineage. Per-criterion health stats are derived from events, not stored.
- **`JudgeRef`** is the MLflow interop record: `mlflow_judge_id`, `current_mlflow_judge_version`, alignment trajectory snapshots, ephemeral memory reference. Versioning lineage lives in MLflow's prompt registry.
- **No `SprintEvent` log.** The previous design proposed an append-only `sprint_events` table as the engine of everything. Removed. Events live on their natural tables (`labels`, `comments`, `rubric_versions`, `judge_versions`, `judge_runs`, `refinement_proposals`). The recommender, metrics, and feed query these directly.

---

## Service architecture

```
┌──────────────────── HTTP / SSE layer (FastAPI) ────────────────────────┐
│  agent  rubric  judge  feed  comments  labels  sprints  recommender    │
│                              stream                                     │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                     ┌───────────┴────────────┐
                     │  Application services  │
                     └───────────┬────────────┘
                                 │
   ┌─────────────┬───────────────┴──────┬───────────┬──────────────────┐
   │ MetricsEng. │ JudgeEngine          │ FeedRanker│ Recommender      │
   │ (IRR, Δ)    │ (MLflow interop)     │ (per-sme) │ (rules + LLM glue)│
   └─────┬───────┴─────────┬────────────┴─────┬─────┴────────┬─────────┘
         │                 │                  │              │
         └─────────────────┴── Postgres event tables ────────┘
                                 │
                     ┌───────────┴────────────┐
                     │  Workers (procrastinate│  ← Postgres LISTEN/NOTIFY
                     │  on Lakebase)          │
                     │  • judge_grade_trace   │
                     │  • memalign_cluster    │
                     │  • compute_metrics     │
                     │  • rerank_sme_feed     │
                     │  • close_sprint_snap   │
                     └────────────────────────┘
```

**What's deliberately new vs. V1:**

- **Real worker substrate.** `procrastinate` on Lakebase Postgres — same DB, no Redis. Today's file-based job tracker in `routers/workshops.py` retires.
- **Recommender is two layers.** Deterministic spine (rules over the event tables: `5/50 traces graded → "add more traces"`; `criterion X has 12 comments + low cosine similarity → "propose split"`; `alignment Δ flat over last 20 labels → "retune judge"`). Optional LLM glue dresses the prompt; spine fires regardless.
- **FeedRanker is its own service.** Inputs: recent label / comment / proposal events + per-SME engagement projection + per-trace need-signals. Output: ranked `FeedItem` list per SME. Recomputes on relevant events.
- **JudgeEngine is an MLflow interop layer.** Customers pick / run / retune MLflow judges from inside the app. Grading = `mlflow.genai.judges` invocation against the agent's pinned judge version + writing `JudgeRun` rows. Retuning = MLflow's `align()` against accumulated human labels + registering a new judge version in MLflow + bumping `JudgeRef.current_mlflow_judge_version`. The app does not maintain its own judge prompt versioning lineage.

**What's deliberately not here:**

- **No `SprintEngine` and no sprint state machine.** Sprint open/close are simple CRUD (close runs the snapshot computation as a worker job). There are no transitions to manage.
- **No append-only event-log infrastructure.** The natural domain tables are the event substrate. They're already append-mostly with timestamps; rolling aggregations are SQL.

---

## API surface (deliberately small)

```
GET    /agent                                   current agent config (singleton)
PATCH  /agent                                   edit config (intake source, name, description)
POST   /agent/participants                      invite User by databricks email + role
PATCH  /agent/participants/{u}                  update role
DELETE /agent/participants/{u}                  remove

GET    /agent/rubric                            current rubric + version history
GET    /agent/rubric/proposals                  pending refinement proposals
POST   /agent/rubric/proposals/{p}:accept       facilitator action

GET    /agent/judge                             MLflow judge ref + alignment trajectory
POST   /agent/judge:retune                      enqueues MLflow align() job; new mlflow_judge_version on success

GET    /agent/feed?sme={u}                      SME ranked queue
GET    /agent/recommender                       ranked recommendations for facilitator
GET    /agent/events?since=…                    SSE stream of recent events

POST   /labels                                  grade a trace × criterion (blind overall + per-criterion votes via comments)
POST   /comments                                typed comment (target = trace | criterion | comment)

GET    /sprints                                 list cutline markers
POST   /sprints                                 open a marker (name, optional goals)
GET    /sprints/{s}                             marker snapshot + report (events filtered to time range)
POST   /sprints/{s}:close                       close marker; enqueues snapshot computation
PATCH  /sprints/{s}                             edit goals / name (open sprints only)
```

Notable absences: no `/workshops`, no `/phase`, no `/discovery_feedback`, no `/annotations`, no `/findings`, no `/classify`, no `/pools`, no sprint state transitions (`:start`, `:pause`, `:resume`, `:ship`, `:extend`).

---

## Frontend surfaces (one app, three routes)

**1. Workspace** — `/`
- Facilitator/developer landing for the agent. Header with current state + metrics sparklines (alignment Δ trend, IRR over recent labels, criterion stability).
- Recommender stream (top-1 prominent, history collapsed).
- Trace progress grid; live event ticker.
- Sprint controls: "open a sprint" (set goals), "close current sprint" (writes snapshot, surfaces report). Open and recent sprints listed inline with their snapshots.
- React Query for snapshots; EventSource on `/agent/events` for live updates. SSE pattern carries forward from V1's `useDiscoveryCommentsStream`.

**2. Rubric & Judge** — `/rubric-judge`
- Two clear sections, role-gated.
- Rubric: current criteria with derived health pills, refinement proposal cards (split / collapse / refine), longitudinal version-diff component.
- Judge: MLflow judge ref + version, prompt diff against prior version (pulled from MLflow), alignment trajectory chart, retune button.
- SME view of this page renders as a read-only modal sheet from the feed — never as a route. Same component, two mount surfaces.

**3. SME feed** — `/feed`
- Mobile-first responsive route within the same bundle.
- Single-column. Card per `FeedItem` with item-type-driven rendering: grade-trace, reply-thread, vote-criterion, draft-criterion, regrade.
- **Zero page navigation enforced** at the route level: bottom sheets / modals for rubric, trace details, prior thread context. No `navigate()` calls inside the feed flow.
- Live updates via the same SSE stream, filtered to this SME's feed.

**Agent setup** — `/agent/setup` (first-run only)
- Thin configurator: name, description, MLflow intake config (source experiment + filters). On submit, redirect to `/`.
- After setup, the agent is configured; everything else happens on the three routes above.

---

## Cross-cutting infra

- **Real-time.** SSE only. Sprint-scoped (or agent-scoped) event streams with subscription filters. Postgres `LISTEN/NOTIFY` pushes events into FastAPI handlers, which fan out to SSE clients. WebSockets aren't needed; nothing is bidirectional at the transport level.
- **Background work.** `procrastinate` on Lakebase. Same DB as event tables; queue tasks live alongside domain data, transactional with event writes when needed.
- **Observability.** `agent_id` (and where applicable `sprint_id`) correlation IDs in all logging. MLflow stays the i/o bridge for traces and judges (intake, judge registration, alignment runs) — not an event store.
- **Auth / identity.** Databricks identity is canonical. Local `User` table is a thin projection (email, name) populated on first sight via SDK. `AgentParticipant` (User × Agent × role) is the only role-bearing record. V1's Databricks PAT/SDK auth carries forward.

---

## V1 carry-forward audit

**High-match — pull forward largely as-is:**

| V1 piece | Why |
|---|---|
| `TraceDB` schema (input/output/context, MLflow links) | Stable shape; treat as MLflow projection cache; drop the embedded SME-feedback field |
| `JudgePromptDB` versioning + `few_shot_examples` + `performance_metrics` | Reframe as `JudgeRef`: store `mlflow_judge_id` + `mlflow_judge_version` + alignment metrics; let MLflow own prompt lineage |
| `MLflowIntakeService` | i/o bridge needs no rework |
| DSPy modules for analysis / disagreement | Inputs change (event-table queries, not feedback rows); core signatures reusable |
| MemAlign optimizer | Engine inside the `propose_refinement` worker |
| OpenAPI-typed React Query client | Architectural fit; regenerate against new schemas |
| EventSource SSE pattern in `useDiscoveryCommentsStream` | Generalize to `useAgentEvents` |
| Tailwind + shadcn/ui base + design tokens | No reason to rebuild |
| Alembic migration discipline | Keep |
| Comment threading + voting UI primitives | Map to typed `Comment` model |

**Drop or fundamentally redesign:**

| V1 piece | Why |
|---|---|
| `WorkshopDB` itself | Replaced by `Agent` (singleton-ish, attached to an MLflow experiment) |
| `WorkshopPhase` enum + `current_phase` field + `WorkflowContext` + `WorkshopDemoLanding` conditionals | Phase machine retires entirely |
| `routers/workshops.py` god service | Broken up alongside the rename: `routers/agent.py`, `routers/rubric.py`, `routers/judge.py`, `routers/sprints.py`, `routers/labels.py`, `routers/comments.py`, `routers/feed.py`, `routers/recommender.py`, `routers/stream.py` |
| `DiscoveryFeedbackDB`, `ParticipantNoteDB`, `ClassifiedFindingDB` | Merge into unified `Comment` |
| Single-question rubric on `WorkshopDB` | Becomes versioned `Rubric` + `Criterion` rows attached to the agent |
| `AnnotationDB` single-rating shape | Replaced by `Label` (per criterion) + per-criterion `Comment`s |
| File-based job store in `routers/workshops.py` | Replace with `procrastinate` |
| Phase-routed pages (`AnnotationDemo`, `TraceViewerDemo`, `RubricCreationDemo`, `IRRResultsDemo`, `JudgeTuningPage`) | Three new surfaces collapse them |
| `WorkshopDemoLanding`'s ~200-line role+phase view tree | Deleted by construction |
| Coverage-category classification system | Already retiring per DISCOVERY_SPEC V2 |
| Local judge prompt versioning lineage as authoritative store | MLflow owns this; the app provides interop, not its own version graph |

---

## Open question: re-grade scope on criterion refinement

When a `RefinementProposal` is accepted, what happens to existing labels and judge runs against the prior criterion version?

| Option | What SME sees | Judge cost | Risk |
|---|---|---|---|
| Invalidate, don't re-grade | Prior labels flagged "stale (criterion vN-1)" | $0 | Long tail of stale data; convergence math messy with mixed staleness |
| Eager re-grade, surface every regrade | A regrade item per affected trace | High (≤50 traces × 1 judge run per refinement) | Feed floods after every refinement; engagement drops |
| Eager re-grade, surface only diffs | Regrade item only when verdict changed | High but async | Best UX, full data fidelity, worker bursts on refinement |

**Leaning: option 3.** Re-grade in the background on `proposal_accepted`; emit a regrade feed item only when the new judge verdict differs from the old. Convergence-relevant metrics always reflect the current criterion; SMEs only get pulled back where the refinement actually changed something.

**Sub-question that must be pinned first:** does refinement invalidate the SME's overall blind grade, or only the judge's per-criterion verdict? Plan reading suggests SMEs grade overall blind, then vote/reply on judge per-criterion verdicts — so **only the per-criterion thread is invalidated, not the overall grade.** That makes regrade-item shape: "judge changed its mind on criterion X for trace T; weigh in?" If that reading is right, re-grading is much cheaper than it sounds.

**Status: needs user decision before implementation planning.**

---

## Other open questions (lower priority)

- **Cross-agent rubric reuse.** V2 keeps rubrics agent-scoped. Library / fork / reference UX deferred. Decide before users ask.
- **Refinement event causality.** Should `proposal_accepted` synchronously trigger judge re-runs, or fan out to workers with a `regrade_needed` event between? Worker fan-out is cleaner; commit unless there's a reason not to.
- **Recommender LLM glue scope.** Spine is deterministic; glue is conversational dressing. Need to define which signals are glue-eligible (probably: refinement proposals, alignment threshold crossings, sprint open/close) vs. which fire raw (probably: routine "add traces" / "ship" prompts).

---

## Next steps

1. Pin re-grade scope (option 3 leaning + sub-question on grade invalidation).
2. Update the dependent plan docs to match this rev — they currently describe a Workshop-owns-Sprint hierarchy that's been collapsed:
   - `.claude/plans/2026-04-27-v2-sprint-primitive-design.md`
   - `.claude/plans/2026-04-28-v2-workshop-creation-refactor.md`
3. Draft protected `/specs/` revisions:
   - **New `SPRINT_SPEC`** (cutline marker semantics: open / close, goals, snapshot, reports).
   - **`RUBRIC_SPEC`** (criterion-type ladder, versioning, agent-scoped longitudinal artifact).
   - **`JUDGE_EVALUATION_SPEC`** (`@judge` author, MLflow as authoritative judge versioning, alignment trajectory storage, retune flow via MLflow `align()`).
   - **`ROLE_PERMISSIONS_SPEC`** (close known discrepancies; phase-advance perms removed; participant model attached to Agent).
   - **`DISCOVERY_SPEC`** (strip phase-machine narrative; reframe as ongoing rubric refinement and disagreement surfacing).
   - **`ASSISTED_FACILITATION_SPEC`** deprecation pass.
4. After spec approval, invoke `writing-plans` skill to produce the implementation plan.
