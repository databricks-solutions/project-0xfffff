# V2 Design: Sprint Primitive

**Date:** 2026-04-27
**Status:** Brainstorm output — design locked, ready for implementation planning
**Governing specs touched:** DISCOVERY_SPEC (major revision), RUBRIC_SPEC (criterion-type ladder + longitudinal artifact), JUDGE_EVALUATION_SPEC (`@judge` author + sprint integration), ASSISTED_FACILITATION_SPEC (further deprecated)
**Builds on:** `.claude/plans/2026-04-21-unified-discovery-rubric-judge-loop-brainstorm.md` (convergence loop body inherited)
**Spec change type:** Spec exists but doesn't cover this work → DISCOVERY_SPEC needs major revision; new sprint-primitive concepts span multiple specs. `/specs/` edits are a protected operation; separate user approval required before they happen.

---

## Vision

V2 turns the convergence loop into a *parameterized primitive* the customer configures. They pick a trace pool, an SME pool, an alignment target, and a time budget; the system runs the loop autonomously and reports progress. **Workshop, async sprint, and launch are configurations of one primitive, not different products.**

Customer-facing claim: `f(N_examples, IRR_target, time_budget) → judge_alignment_Δ`. Works cleanly at 1, 5, 10, up to ~50 examples.

The facilitator role survives but shrinks: light-touch admin — *not* a synchronous decision-maker. Specific facilitator actions are not pre-enumerated and will accumulate as the design fleshes out. Phases (`intake → discovery → rubric → annotation → judge_tuning`) retire as a user-visible concept; the convergence loop runs continuously inside a sprint's `active` state.

---

## Architecture

Three UI surfaces, role-gated rather than persona-split.

### 1. Sprint workspace (facilitator / developer)

Unified single page.

- **Pre-active state:** the configurator (params, presets).
- **Active state:** the facilitator recommender's status + next-best-action surface. Facilitator actions surface as the recommender (and other utility) emits them; not pre-enumerated.

### 2. Rubric & Judge page (unified, single page)

Two clearly-distinct sections.

- **Rubric:** current criteria with per-criterion health stats (specific-citation count, confirmation count, sprints active), pending MemAlign refinement proposals (split / collapse / refine) awaiting facilitator action, longitudinal version history showing what changed each sprint.
- **Judge:** current prompt (versioned), alignment trajectory across sprints (Δ over time, sprint boundaries marked), ready-to-ship indicator, re-tune action when the recommender flags it.

**Per-workshop artifact, not per-sprint** — rubrics persist longitudinally across recurring sprints. Schema designed with cross-agent reusability in mind (rubrics as organization-level judge assets); not a V2 feature, but the data model must not preclude it.

**Role-gated:**
- Facilitator: read + edit + act on proposals.
- SME: read-only, accessible via inline modal from the feed (no page navigation).
- Developer / workshop owner: read + ship judge.

### 3. SME reactive feed (mobile-first)

Single ranked queue. Item types include grade trace, reply to thread, vote on criterion, draft criterion text, re-grade after refinement.

**Mobile-first design constraint** for the SME feed: single-column layout, thumb-reachable controls, **zero page-level navigation** in the SME flow. Inline modals/sheets for everything reference-shaped (rubric, trace details, prior thread context).

---

## Sprint Primitive: Configuration

A sprint instantiates the convergence loop with parameters: trace pool, SME pool, IRR target, alignment target, timebox, cadence, mode.

| Preset | Cadence | Duration | Mode | Trace count |
|---|---|---|---|---|
| Workshop | once | 2h | live | ~15 |
| Sprint | once | 7d | async | ~50 |
| Launch | recurring | 14d | async | up to 50 per cycle |

**Scope cut.** V2 targets 1–50 examples per sprint. Calibration-set generalization to larger trace populations is *not* a V2 claim. Multi-judge per sprint, mid-sprint SME onboarding, and live human↔human resolution affordances are deferred to UX work or post-V2.

---

## Sprint State Machine + Lifecycle

**States:**

| State | Meaning |
|---|---|
| `draft` | Configurator open; params being set; not yet running |
| `active` | Loop body running; SMEs engaging; recommender continuously evaluating |
| `paused` | Facilitator-paused; no feed dispatch, no autonomous analysis; data preserved |
| `converged` | IRR ≥ target AND alignment Δ ≥ target on M consecutive traces; ready to close on success |
| `expired` | Timebox elapsed without converging |
| `completed` | Terminal. Outcomes sealed; workshop-level rubric & judge updated |

**Transitions:**

```
draft ── start ──▶ active ◀── extend / resume ──┐
                     │                           │
                     ├── pause ──▶ paused ── resume ┘
                     │
                     ├── thresholds clear ──▶ converged ── ship / auto-close ──▶ completed
                     │
                     └── timebox elapsed  ──▶ expired   ── extend ──▶ active
                                                         └── accept ──▶ completed
```

Notable triggers:

- `active → converged` is **automatic**: recommender checks IRR + alignment Δ against M consecutive recently-graded traces; threshold crossing fires the transition. Facilitator does not manually mark convergence.
- `converged → completed`: facilitator ships, OR auto-close after T hours of staying converged.
- `expired` is a **holding state** for the "extend or accept" decision — recommender surfaces both options; expired stays expired until facilitator picks.
- For recurring presets (Launch), `completed` auto-schedules the next sprint instance using the same config with the next timebox window.

**Defaults (configurable per preset):**

- *M consecutive traces* for convergence: 2 (Workshop), 3 (Sprint), 5 (Launch).
- *T hours auto-close* after converged: facilitator-only (Workshop), 24h default (Sprint), required (Launch).

---

## Convergence Loop Body (inside `active`)

Inherited from `.claude/plans/2026-04-21-unified-discovery-rubric-judge-loop-brainstorm.md`. Per-trace mechanic:

1. **Bootstrap rubric** (first sprint of a workshop only): one LLM call → 5 P/F criteria from workshop description + sample traces. Subsequent sprints inherit the workshop's existing rubric.
2. **Judge grades** the trace: per-criterion pass/fail + rationale. Stored.
3. **SME lands on trace**: current rubric visible (modal); judge's verdict hidden.
4. **SME grades overall** GOOD/BAD + rationale. Blind — protects IRR independence.
5. **Reveal**: judge's 5-criterion verdict appears as `@judge` thread-starter comments.
6. **SME posts one reaction**: vote/reply on a criterion comment, OR new top-level comment. Thread stays open for replies, `@assistant`, `@agent`.
7. **Metrics**: per-trace IRR (human↔human), alignment (human↔judge overall), per-criterion sparse signal from specifics.
8. **Branch** (recommender-surfaced):
   - IRR low → *Refine rubric from comments* (MemAlign cluster + propose).
   - IRR high, alignment low → *Retune judge* against human grades.
   - IRR high, alignment high → trace contributes to sprint convergence count.
9. **Refinement re-runs judge** on affected traces; SMEs see updated grades as re-grade items in their feed.

**V2 deltas vs. brainstorm:** branch outcomes surface via the facilitator recommender (not phase-gated buttons); "advance to next trace" is replaced by per-SME feed personalization; refinement is recommender-proposed, facilitator-clicked for V2 (auto-apply deferred).

---

## Facilitator Recommender

**The point.** Turns sprint state into the facilitator's "what next" — a single visible next-step suggestion (e.g., "5/50 traces graded — add more traces to the feed"). The flow is encoded in the backend; the recommender exposes it as guidance, not a control panel.

**Shape.** Deterministic spine for canonical steps (add traces, re-tune judge, ship, extend, collapse criterion). LLM glue (`@assistant`) for soft conversational prompts attached to deterministic triggers — never on the critical path.

Rules, thresholds, and LLM posture are detail-level; will evolve as we observe real sprints.

---

## SME Feed Algorithm (separate engine)

**The point.** Decides what each SME sees next — TikTok-style. Personalized ranking over a heterogeneous queue.

**Shape.** Inputs: sprint state + per-SME engagement history + per-trace/thread/criterion need-signals. Optimizes information-value × engagement-probability × diversity. Mobile-first single-column feed; rubric and trace context inline as modals/sheets, no page navigation.

**Item types (starter set):**

- Grade a trace (cold trace, no human signal yet)
- Reply to a thread (high-disagreement, SME hasn't weighed in)
- Vote on a criterion proposal (poll waiting for SME's vote)
- Draft a criterion statement (explicit elicitation prompt)
- Re-grade after refinement (rubric changed; check if SME's grade still holds)

Ranking weights, item-type mix, and personalization signals are detail-level — separate engineering work, separate evolution path from the facilitator recommender.

---

## Data Model (what's new or different)

- **`rubric` and `judge` as first-class versioned, workshop-owned artifacts.** Both carry `version` + `parent_version` for lineage. Updates happen at sprint completion *and* at intra-sprint refinement events; rollback is supported.
- **`sprint` as a separate record** — state, config, metrics, timestamps. Immutable once `completed`.
- **Unified `discovery_comment`** replaces today's `discovery_feedback.followup_qna`. Comments carry an `author_type` (`human` | `judge` | `assistant` | `agent`) and a typed `payload` when the author needs more than text — e.g., `@judge` comments carry `criterion_id`, `pass_fail`, `rationale`, `judge_run_id`.
- **Workshop-level pools.** Trace pool and SME pool live at the workshop, not the sprint. Sprints reference subsets.

**Cross-agent rubric reuse (future-proofing, not V2):** rubric is *referenced* by the workshop, not embedded — so a future "fork rubric to another workshop" or "promote to organization-level template" operation can copy/link without entanglement to a specific judge or sprint. V2 doesn't ship the UI for this; the data model just doesn't preclude it.

---

## Spec Impact (next step: protected `/specs/` edits, separate approval)

- **DISCOVERY_SPEC:** major revision. Replace phase-machine narrative with sprint primitive. Move convergence loop body to a "sprint active state" section. Retire `discovery_feedback.followup_qna` in favor of unified comments. Add SME feed concepts.
- **RUBRIC_SPEC:** add criterion-type ladder (P/F → Likert → Weighted → Hurdle), rubric versioning, longitudinal-artifact concept.
- **JUDGE_EVALUATION_SPEC:** add `@judge` author role, judge versioning, alignment trajectory storage, retune-from-human-grades flow.
- **ASSISTED_FACILITATION_SPEC:** further deprecated.
- **New spec (TBD during writing-plans):** SPRINT_SPEC for the primitive itself, or fold into DISCOVERY_SPEC.

---

## What V2 Does Not Solve

- Multi-judge per sprint (CUJ5 with 5 parallel judges) — V2 supports one judge per sprint; multi-judge would be parallel sprints sharing a workshop.
- Mid-sprint SME onboarding (joining day 3 of a 7-day sprint).
- Live human↔human resolution (some traces will never converge; loop moves on).
- Calibration-set generalization to >50 examples.
- Cross-workshop / cross-agent rubric reuse UI (data model preserves the possibility).

---

## Transition Plan

1. User reviews this design (current step).
2. After approval, present proposed `/specs/` revisions for affected specs (protected op — separate user approval).
3. Invoke `writing-plans` skill to create implementation plan.
