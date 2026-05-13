# Unified Discovery → Rubric → Judge Loop — Brainstorm (In Progress)

**Date:** 2026-04-21
**Status:** Brainstorm checkpoint — paused mid-flow, resume with the Open Questions section
**Governing specs touched:** DISCOVERY_SPEC (primary), ASSISTED_FACILITATION_SPEC (further deprecated), RUBRIC_SPEC, JUDGE_EVALUATION_SPEC, EVAL_MODE_SPEC
**Spec change type:** Spec exists but doesn't cover this work → DISCOVERY_SPEC needs major revision. Presenting proposed spec additions to user before editing `/specs/` (protected operation).

---

## Core Thesis

**Disagreement-as-signal replaces question-as-prompt.** Today the elicitation unit is a question ("what did you notice?"). The proposal: the elicitation unit becomes a *claim someone can agree or disagree with* — a judge's grade on a trace, expressed against a rubric. Humans react by voting, replying, or posting new observations. Reactions feed directly into rubric and judge refinement.

This collapses three currently-sequential phases — Discovery (elicit) → Rubric Creation (structure) → Judge Alignment (calibrate) — into a **single live per-trace loop** that converges when inter-rater reliability (IRR) and human↔judge alignment both clear threshold.

Today we only measure IRR after the full annotation phase completes. Moving IRR and alignment *into discovery, on a single trace or small batch*, short-circuits the expensive late-stage feedback loop.

---

## The Convergence Loop (per trace, or small batch)

```
1. Auto-draft rubric (1 LLM call, 5 Pass/Fail criteria from workshop description + 1–3 sample traces)
2. Judge grades each assigned trace against the rubric; stores per-criterion pass/fail + rationale
3. Participant lands on the trace, current rubric visible but judge's verdict hidden
4. Participant grades overall GOOD/BAD + rationale (blind — no judge anchor)
5. Submit → judge's 5-criterion verdict revealed with rationales
6. Participant posts ONE specific reaction — expressed as either:
     • vote/reply on one of the judge's criterion comments (react-to-criterion), OR
     • new top-level comment in the thread (new-observation)
7. Comments thread is always-on; participants react to each other, @assistant, @agent
8. Metrics computed on this trace:
     • IRR across human overall grades    (do humans agree with each other?)
     • Alignment = humans ↔ judge overall (does the judge agree with humans?)
     • Per-criterion sparse signal from "specifics" targeting that criterion
9. Branch:
     • IRR low              → rubric is ambiguous → refine rubric from comments (facilitator-triggered)
     • IRR high, align low  → rubric clear, judge wrong → retune judge (eval against human grades)
     • IRR high, align high → converged → advance to next trace
10. Refinement re-runs judge on affected traces; humans see updated grade + re-react; loop until converged
```

---

## Design Decisions Locked In

### 1. Rubric bootstrap
- **5 criteria** at start (more signal density than binary)
- **Pass/Fail** for MVP (cleanest IRR)
- Generated from `workshop.description` + 1–3 sample traces by one LLM call
- Facilitator can edit before the judge runs on the full trace set (open: see Open Questions)

### 2. Criterion-type progression ladder (spec from the start, implement MVP first)
| Type | When to use | Upgrade trigger |
|------|-------------|-----------------|
| **Pass/Fail** | MVP, first pass | Default start |
| **Likert (1–5)** | Pass/Fail saturates (>90% same value) | Saturation heuristic |
| **Weighted** | Some criteria matter more than others | Human "specific" frequency signal — criteria that humans cite more often get higher weight candidates |
| **Hurdle** | Failure forces overall fail regardless of aggregate | Cluster of comments on a criterion says "this is a hard line" / safety / compliance |

Overall score at MVP: `count(pass) / 5`, binarized at 60% (3/5 = PASS).

### 3. Asymmetric grading
- **Judge**: fine-grained — 5 criteria × Pass/Fail + rationale each
- **Human**: coarse-grained — overall GOOD/BAD + rationale
- **Plus one specific**: human posts ONE reaction, which lives in the comment thread:
  - Vote/reply on a judge's criterion comment → react-to-criterion (MemAlign-routed as semantic feedback on that criterion)
  - New top-level comment → new-observation (MemAlign-routed to split-criterion candidate or episodic example)

Low-friction on the human side, still harvests fine-grained signal via clustering.

### 4. Screen geometry
```
[Trace: input/output]

[Current rubric — 5 criteria, expandable descriptions]

──── Step 1 (blind) ────
Overall:   [GOOD] [BAD]
Rationale: [______free text______]
[Submit]

──── Step 2 (revealed after submit) ────
Judge's verdict: N/5 = PASS|FAIL (binarized at 60%)
  Each criterion as a thread-starter comment with judge's rationale:
    ✓ Factually accurate     "X is correct"
    ✓ Complete               "Covers all parts"
    ✗ Direct                 "Starts with preamble"
    ✓ Acknowledges limits    "States uncertainty"
    ✓ No hallucination       "All claims grounded"

──── Comments thread (always-on) ────
- Each judge criterion = one thread-starter comment authored by @judge
- Humans vote/reply to those criterion-comments (react-to-criterion)
- Humans can post new top-level comments (new-observation)
- upvote/downvote, @assistant, @agent all apply
```

### 5. Comment thread = unified elicitation surface
- Today: `discovery_feedback.followup_qna` JSON + `discovery_comments` are two parallel structures
- Unification: everything lives in `discovery_comments` (thread-based)
- Judge's per-criterion grades post as `@judge`-authored thread-starter comments
- Human's free-text rationale on overall grade = attached to the trace-level comment record
- Human's "one specific" = either a vote+reply on a criterion comment OR a new top-level comment
- Legacy `followup_qna` mechanism: see Open Questions for deprecation path

### 6. MemAlign clustering (two layers, facilitator-triggered at layer 2)
**Layer 1 — per-trace (fast, automatic):** When a trace accumulates N reactions, cluster within that trace. Feed episodic memory on the judge for grading this trace + structurally similar ones.

**Layer 2 — across-trace (rubric evolution, facilitator-triggered):** All "specifics" across all traces embedded + clustered + LLM-verified. Each cluster routed by MemAlign:
- **Semantic** (general claim, e.g. "should cite sources") → modify/add rubric criterion
- **Episodic** (specific case) → few-shot example attached to nearest criterion
- Cluster maps onto existing criterion → **confirmation** (raise empirical weight)
- Cluster maps onto no criterion → **split candidate** (propose new criterion)
- Criterion receives no clusters across N traces → **collapse candidate**

Facilitator sees proposals with supporting clusters, approves/rejects.

### 7. Convergence metrics
- **IRR-overall**: Cohen's Kappa / Krippendorff's Alpha on human GOOD/BAD across participants per trace
- **Alignment-overall**: agreement between judge's binarized PASS/FAIL and human GOOD/BAD per trace
- **Per-criterion sparse signal**: when a human "specific" targets criterion X, compare human's pass/fail on X to judge's pass/fail on X
- **Criterion health**: (derived, over time) fraction of traces where criterion X received any human specific; low = collapse candidate

### 8. Refinement ownership
Facilitator-triggered for MVP. Options (b) `@assistant` auto-proposes after N new comments + (c) auto-apply are future work once we have calibration on the clustering quality.

---

## Active Sampling / SME Sample Efficiency (Research — spec begins now, not MVP)

**Narrative hook:** Show SMEs a social-feed-style queue that points them to the next most-important trace for judgment. Use existing judge entropy as proxy for anticipated human disagreement. Also potentially ensures coverage over the actual trace distribution.

**Mechanism sketches (open research):**
- **Per-trace entropy sampling:** Run judge K times per trace (temperature or K-sample ensemble); per-criterion score variance = uncertainty; traces with high variance prioritized.
- **Criterion correlation matrix:** Over judged traces, compute pairwise criterion-score correlations. High correlation + same direction → merge candidate. High mutual information with a latent trace-feature grouping → split candidate. Answers "should this be two criteria?" via information theory instead of gut.
- **Judge-judge comparison:** Run two judge instantiations (e.g., different seed or prompt variant) on the same trace; disagreement between judges on a criterion = signal the criterion is ill-defined.

MVP sampling rule (placeholder): randomize, or sort by judge-overall-confidence ascending.

---

## Spec Impact (what needs to change in `/specs/`)

### DISCOVERY_SPEC (major revision)
- **Step 1 reshape:** Remove fixed 3 follow-up questions; add asymmetric grading flow (overall blind → reveal → one specific); comment thread becomes elicitation surface
- **Steps 2 and 3 collapse** into live convergence loop with metrics + facilitator-triggered refinement
- Add Step 4 (social threads) already exists; extend with `@judge` author role + criterion-comment semantics
- Remove `discovery_feedback.followup_qna` blob (migrate to comments table or deprecate cleanly)
- Success Criteria: add IRR + alignment measurement per trace, rubric refinement via MemAlign, criterion split/collapse proposals

### RUBRIC_SPEC
- Criterion-type progression ladder: Pass/Fail → Likert → Weighted → Hurdle
- Saturation heuristic for P/F → Likert upgrade
- Weight-assignment signal from "specific" citation frequency

### JUDGE_EVALUATION_SPEC
- `@judge` posts per-criterion thread-starter comments (new surface)
- Judge entropy sampling (K-sample variance) as a measurable quantity
- MemAlign semantic/episodic routing tied to comment clustering

### EVAL_MODE_SPEC
- Per-example rubrics (existing spec concept) — interaction with this new live-refinement loop TBD
- Does a converged rubric transfer to eval mode as the per-workshop default?

### ASSISTED_FACILITATION_SPEC
- Further deprecated (already largely superseded by v2)
- Coverage categories (themes/edge_cases/boundary_conditions/failure_modes/missing_info) likely obsolete under clustering-based criterion evolution
- Keep only concepts reused: `@judge` as a structured author, disagreement surfacing

### `/specs/README.md` keyword additions (for the new work)
- naive rubric, naive-first, strawman judge
- asymmetric grading, blind grade, overall grade, specific reaction
- MemAlign clustering, semantic cluster, episodic cluster
- criterion split, criterion collapse, criterion promotion
- judge entropy, K-sample, variance sampling
- sample efficiency, active sampling
- @judge, criterion comment
- convergence threshold, per-trace convergence

---

## Open Questions (resume here)

1. **Legacy follow-up questions:** Do we fully remove the 3-fixed-follow-ups mechanism, or keep it as opt-in for workshops that skip naive-first? (Lean: remove — naive-first becomes the only flow.)

2. **Mode coexistence:** Today DISCOVERY_SPEC has `analysis` mode and `social` mode. Does this new flow (a) *replace both*, (b) become a *third mode*, or (c) extend `social` mode with judge-authored criterion comments? (Lean: (c) — minimum disruption, maximum reuse of threading infra.)

3. **Facilitator rubric pre-approval:** After the 1-LLM-call bootstrap, does the facilitator review/edit the 5 criteria before the judge runs on all traces, or does the judge run immediately and criteria evolve from there? (Lean: quick review step — avoids wasted judge runs on clearly-wrong initial criteria.)

4. **IRR threshold + window:** What value of Kappa/Alpha moves us on? Over how many participants × traces? 
   - Default suggestion: Kappa ≥ 0.6 (substantial agreement) measured over ≥ 3 participants on the current trace. Per-trace advance gated on trace-local IRR + workshop-local running average.

5. **Judge re-grading on rubric refinement:** When the facilitator applies a rubric refinement, does the judge re-grade (a) all traces, (b) only traces where humans haven't graded yet, or (c) only traces where the changed criterion would flip a decision? (Lean: (a) for MVP, (c) later as optimization.)

6. **Per-trace clustering trigger N:** What's N for "accumulate N reactions then cluster per-trace"? (Lean: N = 3 or when all assigned participants have submitted, whichever first.)

7. **Criterion type upgrades:** Who triggers P/F → Likert promotion — saturation heuristic auto-proposes to facilitator, or facilitator-only? (Lean: auto-propose.)

8. **Eval mode interaction:** How does this loop work in eval mode where each trace has a per-example rubric? Does the per-example rubric *override* the workshop rubric for that trace, or refine it?

9. **Judge author / comment schema:** `@judge` posts criterion comments — does it need a new `author_type` enum on `discovery_comments` (human / assistant / agent / judge)? What metadata attaches (criterion_id, pass/fail score, rationale, judge run id)?

10. **Abandon vs. revise after reveal:** When judge reveals and human sees disagreement with their blind grade, can they revise their overall grade? If yes, is the revision itself a signal (changed-mind vs. held-firm)? (Lean: yes revise, track both pre-reveal and post-reveal grade; disagreement-that-held is stronger signal than disagreement-that-flipped.)

11. **Comment thread and existing voting:** Current `discovery_comment_votes` is upvote/downvote. Is that the right semantics for reacting to a judge criterion comment ("I agree this criterion passed" vs. "I agree this criterion is a good criterion" — two different things)? May need separate affordances.

---

## What We Agreed On (Summary)

- Naive-first is the **default flow**, not opt-in
- Bootstrap: **5 Pass/Fail criteria** from workshop description + samples
- Rubric type ladder: **P/F → Likert → Weighted → Hurdle** (spec it all, MVP the first)
- **Asymmetric grading**: judge does 5, human does 1 overall + 1 specific-via-comment
- **Blind overall → reveal → specific reaction** (clean IRR + engagement bait at reveal)
- **Comment thread IS the elicitation surface** (no separate form; vote/reply = react-to-criterion; new comment = new-observation)
- **MemAlign** clusters comments → semantic (criterion refinement) vs episodic (few-shot examples)
- **Facilitator-triggered refinement** for MVP
- **Entropy-based sampling** (traces + criterion split/collapse) woven into narrative + research spec section; not MVP-blocking
- Convergence on per-trace IRR + alignment; advance when both clear threshold

---

## Transition Plan

Once Open Questions resolved:
1. Present proposed DISCOVERY_SPEC revision + keyword additions to user for approval (protected op)
2. Present proposed additions/changes to RUBRIC_SPEC, JUDGE_EVALUATION_SPEC (protected op)
3. Invoke `writing-plans` skill for implementation plan
