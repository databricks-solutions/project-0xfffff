# EVAL_MODE_SPEC

## Overview

Eval Mode is an alternative workshop mode where evaluation criteria are authored **per-trace** rather than globally. It enables building offline evaluation harnesses from specific examples.

In the standard workshop mode, rubrics must generalize across all traces — criteria like "if budget is $500–800, recommend a laptop with 16GB RAM" under a "Budget Awareness" judge. In eval mode, criteria are example-specific: "the agent found laptops with at least 16GB of RAM." This works because each criterion has a concrete trace as its reference, so you know exactly what correct looks like.

The per-trace criteria ARE the ground truth, but the validation pipeline remains the same as workshop mode: **Rubric Creation → Annotation → Results Review (IRR) → Judge Alignment**. All of this is already built into the workshop, but eval mode applies it per-trace rather than across all examples with a shared rubric.

### Inspiration

- **HealthBench** ([arXiv:2505.08775](https://arxiv.org/abs/2505.08775)): Per-example rubrics with signed point values (-10 to +10), positive and negative criteria, additive weighted scoring. Average 11.4 criteria per example. One judge call per criterion.
- **ACE** ([arXiv:2512.04921](https://arxiv.org/abs/2512.04921)): Per-example rubrics with hurdle criteria (must-pass gates) and grounding checks against external data. Hierarchical gating model where hurdle failure → score 0.

## Core Concepts

### Workshop Mode

Workshops have a `mode` selected at creation time:

| Mode | Rubric Scope | Ground Truth | Goal |
|------|-------------|--------------|------|
| `workshop` (default) | Global — one rubric for all traces | Established through human-human IRR | Consensus criteria + aligned judge |
| `eval` | Per-trace — each trace gets its own criteria | The criteria themselves | Offline eval harness |

Mode is immutable after creation.

### Per-Example Rubric

Each trace in an eval-mode workshop has its own rubric — a markdown-formatted document containing the evaluation criteria for that specific example. The rubric is authored through the discovery and promotion flow: participants examine a trace, submit findings, and the facilitator promotes findings into criteria.

The rubric is stored as markdown, enabling rich formatting:

```markdown
## Criteria

### [HURDLE] Correctly identifies the medical emergency
The response must recognize that the described symptoms (sudden onset weakness,
facial drooping, slurred speech) indicate a possible stroke and treat this as
an urgent medical situation.

**Weight: gate**

### States that the infant may have muscle weakness
The response should mention hypotonia or muscle weakness as a potential
symptom associated with the described condition.

**Weight: +7**

### Recommends unnecessary invasive procedure
The response should NOT recommend lumbar puncture or other invasive
diagnostic procedures given the clinical presentation.

**Weight: -5**
```

### Criterion Types

Two types that affect scoring logic:

| Type | Behavior | Score Values | Example |
|------|----------|-------------|---------|
| **Standard** | Binary pass/fail with signed weight | 0 (not met) or 1 (met) × weight | "States the infant may have muscle weakness" (+7) |
| **Hurdle** | Must-pass gate — if fails, entire trace scores 0 | pass/fail (no point value) | "Correctly identifies the medical emergency" |

Standard criteria can have negative weights (HealthBench pattern) to penalize undesirable behaviors: "Recommends an unnecessary procedure" (-5).

### Scoring Aggregation

Hierarchical gating (ACE) combined with weighted sum (HealthBench):

```
1. Evaluate hurdle criteria
   → ANY hurdle fails → trace score = 0, stop

2. Evaluate standard criteria
   → score_i = met_i × weight_i    (met_i is 0 or 1)

3. Aggregate
   → raw_score  = sum(score_i for positive weights where met)
                 + sum(score_i for negative weights where met)
   → max_possible = sum(weight_i for positive weights)
   → normalized_score = raw_score / max_possible   (clipped to [0, 1])
```

A trace can score below 0 before clipping if negative-weight criteria dominate.

### Judge Execution

One independent judge call per criterion. The judge sees:
- The trace content (via summary or full trace)
- A single criterion statement
- NOT other criteria or their scores

This matches both HealthBench and ACE methodology.

## Behavior

### Workshop Creation

When creating a workshop with `mode: "eval"`:
- No global rubric is created (the `rubric` table is unused)
- The annotation phase is replaced by a criterion-authoring and judge-evaluation flow
- Trace assignment, ingestion, and summarization work identically to workshop mode

### Per-Trace Workflow

```
For each trace:
  1. Trace displayed with summary/milestone view
  2. Discovery → findings (using trace summaries or agent loop)
  3. Facilitator promotes findings → per-trace criteria
     - Assigns type (standard or hurdle)
     - Assigns weight (-10 to +10) for standard criteria
     - Edits criterion text for clarity
  4. Human reviews criteria quality — clear, complete, correct?
  5. Move to next trace

After criteria authored:
  6. Judge runs blind against all criteria (one call per criterion)
  7. Results available for review — refine criteria judges struggle with
  8. Export as offline eval harness
```

### Discovery Improvements

The current discovery classification sees only trace input/output. In eval mode, analysis prompts should use:
- **Trace summaries** from the summarization pipeline (executive summary + milestones), or
- **Agent loops** over trace spans using the same tool-based approach as the summarizer (get_trace_overview, list_spans, get_span_detail, etc.)

This produces richer, more specific findings that map naturally to per-trace criteria. This improvement applies to eval mode primarily but could benefit workshop mode in the future.

### Criteria Authoring

Criteria are authored through two paths:

1. **Promoted from discovery**: A finding is promoted and the facilitator assigns type and weight. The finding text becomes the criterion text (editable).

2. **Direct authoring**: The facilitator writes a criterion directly on a trace without going through discovery. This supports adding criteria that weren't surfaced as findings.

### Judge Evaluation

After criteria are authored for one or more traces, the facilitator can trigger judge evaluation:

1. System iterates over each trace with criteria
2. For each criterion, an independent judge call evaluates whether the trace meets it
3. Judge returns: met (boolean) + rationale (text)
4. Scoring aggregation applies hurdle gating then weighted sum
5. Results stored per-criterion with rationale

Judge scores are optionally hidden from the human reviewer to prevent anchoring.

### Judge Alignment (MemAlign)

Eval mode aligns a single **task-level judge** using MemAlign, where every criterion evaluation across all traces feeds into alignment as a separate example.

#### Mental Model

```
task_1_judge
  ├── trace_1 (50 traces × ~10 criteria = ~500 alignment examples)
  │     ├── criterion: "identifies budget constraint"  → met ✓ (human)
  │     ├── criterion: "recommends 16GB RAM"           → met ✓ (human)
  │     └── criterion: "stays under budget"            → not met ✗ (human)
  ├── trace_2
  │     ├── criterion: "lists at least 3 options"      → met ✓ (human)
  │     └── criterion: "includes price comparison"     → met ✓ (human)
  └── ...
```

One judge per task. All criterion met/not-met human decisions are written as separate MLflow assessments on the trace, sharing the judge name. This produces far more alignment examples than workshop mode (N criteria per trace vs. 1 rating per trace).

#### How MemAlign Uses Criteria

**Semantic memory (guidelines):** Criteria that recur across traces — "respects stated budget" appearing on multiple shopping traces — are distilled into transferable guidelines about what the judge should look for across the task.

**Episodic memory (examples):** Non-overlapping, highly specific criteria — "recommends the Sennheiser HD 560S given the stated preference for open-back headphones" — become episodic examples retrieved by embedding similarity at inference time.

#### Assessment Storage

Each criterion's human decision is written as a separate MLflow assessment on the trace:

```python
# For each criterion on a trace:
mlflow.log_assessment(
    trace_id=trace_id,
    name=judge_name,          # Same name for all criteria under this judge
    source_type="HUMAN",
    value=met,                # bool: True/False
    rationale=criterion_text, # The criterion itself serves as rationale
)
```

#### Upstream Requirement: `trace_to_dspy_example` Multi-Assessment Support

MemAlign's `trace_to_dspy_example` (dspy_utils.py:338) currently takes the **most recent** human assessment per trace when multiple match the judge name. This discards all but one criterion assessment per trace.

**Required change:** `trace_to_dspy_example` must yield all matching HUMAN assessments per trace as separate `dspy.Example` objects, not just the most recent. The rest of the MemAlign pipeline (episodic embedding, guideline distillation, inference retrieval) already consumes a flat list of examples, so nothing downstream changes.

This change also fixes **judge re-hydration** — when a registered judge is loaded and rebuilds episodic memory by re-walking traces, it needs to recover all criterion-level examples, not just one per trace.

**Status:** Candidate for upstreaming to MLflow once validated in this system.

#### Alignment Flow

```
1. Human reviews judge's criterion evaluations, corrects met/not-met where wrong
2. Corrected decisions written as HUMAN assessments on traces (one per criterion)
3. Traces tagged with 'align' label
4. MemAlign optimizer called with task-level judge
5. trace_to_dspy_example extracts ALL criterion assessments per trace (upstream change)
6. Semantic memory: distill guidelines from overlapping criteria patterns
7. Episodic memory: embed specific criterion examples for retrieval
8. Aligned judge registered to MLflow
9. Re-evaluate to compare pre/post alignment accuracy
```

#### Re-Hydration

When the aligned judge is loaded (via `get_scorer` or re-instantiation), episodic memory is rebuilt by re-walking traces. Because all criterion assessments are stored on the traces and the extraction yields all of them, re-hydration reconstructs the full example set without our system needing to maintain a separate store.

### Offline Eval Export

The output is a mapping of `{trace_id → [criteria]}` plus the configuration to re-run evaluation:

- Trace identifiers (MLflow trace IDs or local IDs)
- Per-trace criteria with types and weights
- Judge prompt template
- Model endpoint configuration
- Scoring aggregation rules

The simplest version is a script that loads trace data, runs `mlflow.genai.evaluate()` with one scorer per criterion, and applies the aggregation.

## Data Model

### Workshop Extension

```python
class WorkshopDB(Base):
    # ... existing fields ...
    mode = Column(String, default="workshop")  # "workshop" | "eval"
```

### TraceCriterion (new)

```python
class TraceCriterionDB(Base):
    __tablename__ = "trace_criteria"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    trace_id = Column(String, nullable=False, index=True)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False, index=True)
    text = Column(Text, nullable=False)          # Criterion statement (markdown)
    criterion_type = Column(String, nullable=False)  # "standard" | "hurdle"
    weight = Column(Integer, default=1)           # -10 to +10 (ignored for hurdle)
    source_finding_id = Column(String, nullable=True)  # If promoted from discovery
    created_by = Column(String, nullable=False)   # user_id
    order = Column(Integer, default=0)            # Display order within trace
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
```

### CriterionEvaluation (new)

```python
class CriterionEvaluationDB(Base):
    __tablename__ = "criterion_evaluations"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    criterion_id = Column(String, ForeignKey("trace_criteria.id"), nullable=False, index=True)
    trace_id = Column(String, nullable=False, index=True)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False, index=True)
    judge_model = Column(String, nullable=False)
    met = Column(Boolean, nullable=False)         # Did the trace meet this criterion?
    rationale = Column(Text, nullable=True)        # Judge's reasoning
    raw_response = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=func.now())
```

### TraceEvalScore (Pydantic — computed, not stored)

```python
class TraceEvalScore(BaseModel):
    trace_id: str
    hurdle_passed: bool
    hurdle_results: list[CriterionResult]       # Per-hurdle pass/fail + rationale
    criteria_results: list[CriterionResult]      # Per-criterion score + rationale
    raw_score: float                             # Sum of weighted criterion scores
    max_possible: float                          # Sum of positive weights
    normalized_score: float                      # raw / max, 0 if hurdle failed

class CriterionResult(BaseModel):
    criterion_id: str
    criterion_text: str
    criterion_type: str
    weight: int
    met: bool
    rationale: str | None
```

### Per-Example Rubric (Pydantic — rendered from criteria)

```python
class TraceRubric(BaseModel):
    """Markdown-formatted rubric rendered from TraceCriterion records."""
    trace_id: str
    workshop_id: str
    criteria: list[TraceCriterion]
    markdown: str                   # Rendered markdown representation

    def render_markdown(self) -> str:
        """Render criteria as markdown document."""
        ...
```

## API Endpoints

### Criteria CRUD

```
POST   /workshops/{workshop_id}/traces/{trace_id}/criteria
       Request: { text, criterion_type, weight, source_finding_id? }
       Response: TraceCriterion

GET    /workshops/{workshop_id}/traces/{trace_id}/criteria
       Response: [TraceCriterion]

GET    /workshops/{workshop_id}/traces/{trace_id}/rubric
       Response: { criteria: [TraceCriterion], markdown: string }

PUT    /workshops/{workshop_id}/criteria/{criterion_id}
       Request: { text?, criterion_type?, weight? }
       Response: TraceCriterion

DELETE /workshops/{workshop_id}/criteria/{criterion_id}
       Response: 204
```

### Judge Evaluation

```
POST   /workshops/{workshop_id}/evaluate
       Request: { model_name, trace_ids?: string[] }  # null = all traces with criteria
       Response: { job_id, total_criteria, message }

GET    /workshops/{workshop_id}/eval-results
       Query: ?trace_id=...
       Response: [TraceEvalScore]

GET    /workshops/{workshop_id}/eval-job/{job_id}
       Response: { status, completed, total, failed }
```

### Export

```
GET    /workshops/{workshop_id}/eval-export
       Response: { traces: [{ trace_id, criteria, eval_score? }], config: {...} }
```

## Implementation

### Files (anticipated)

| File | Change |
|------|--------|
| `server/models.py` | Add `mode` to Workshop, add TraceCriterion and CriterionEvaluation models |
| `server/database.py` | Add TraceCriterionDB, CriterionEvaluationDB tables and CRUD |
| `migrations/versions/XXXX_add_eval_mode.py` | New migration |
| `server/services/eval_mode_service.py` | New — criterion evaluation, scoring aggregation |
| `server/routers/eval_mode.py` | New — API endpoints for criteria CRUD, evaluation, export |
| `client/src/pages/EvalModePage.tsx` | New — per-trace criteria authoring and review UI |
| `client/src/components/CriterionEditor.tsx` | New — criterion type/weight/text editor |
| `client/src/components/TraceRubricView.tsx` | New — markdown-rendered rubric display |
| `server/services/discovery_service.py` | Update analysis prompts to use summaries/agent loops |

## Success Criteria

### Workshop Mode Selection
- [ ] Workshop can be created with `mode: "eval"`
- [ ] Mode is immutable after creation
- [ ] Eval-mode workshops do not use the global rubric system
- [ ] Existing workshop-mode behavior is unchanged

### Per-Trace Criteria
- [ ] Facilitator can create criteria on a specific trace
- [ ] Each criterion has a type (standard or hurdle) and weight (-10 to +10)
- [ ] Criteria can be promoted from discovery findings
- [ ] Criteria can be authored directly (without discovery)
- [ ] Criteria are editable and deletable
- [ ] Per-trace rubric is rendered as markdown

### Discovery Improvements
- [ ] Discovery analysis uses trace summaries when available
- [ ] Discovery analysis can run agent loops over trace spans as alternative to summaries
- [ ] Richer findings surface example-specific observations

### Scoring
- [ ] Hurdle criteria gate the entire trace — any hurdle failure → score 0
- [ ] Standard criteria scored as met (1) or not met (0) × weight
- [ ] Negative-weight criteria penalize when met
- [ ] Normalized score = raw / max_possible, clipped to [0, 1]
- [ ] Scoring handles edge cases: no criteria, all hurdles, all negative weights

### Judge Evaluation
- [ ] One independent judge call per criterion
- [ ] Judge sees trace content + single criterion, not other criteria
- [ ] Judge returns met (boolean) + rationale
- [ ] Evaluation runs as background job with progress tracking
- [ ] Results stored per-criterion with rationale
- [ ] Judge scores optionally hidden from human reviewer

### Judge Alignment
- [ ] One task-level judge aligned using all criteria across all traces as examples
- [ ] Each criterion's human met/not-met decision stored as a separate MLflow assessment on the trace
- [ ] All assessments share the judge name; extraction yields all (not just most recent)
- [ ] Semantic memory distills guidelines from overlapping criteria patterns
- [ ] Episodic memory indexes specific criterion examples for retrieval
- [ ] Aligned judge registered to MLflow
- [ ] Re-hydration rebuilds episodic memory from trace assessments without external state
- [ ] Re-evaluation compares pre/post alignment accuracy on same trace set

### Offline Eval Export
- [ ] Export produces trace → criteria mapping
- [ ] Export includes scoring configuration (types, weights, aggregation rules)
- [ ] Exported eval can be re-run via `mlflow.genai.evaluate()`

## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-04-16 | [Fully Wired Eval Mode MVP](../.claude/plans/2026-04-16-fully-wired-eval-mode-mvp.md) | in-progress | Judge execution (milestone-scoped), pairwise agreement IRR, alignment wiring, frontend controls |

## Future Work

- **Grounding checks**: ACE-style criterion type that verifies claims against external data sources. Three-valued scoring (+1 verified, 0 not met, -1 contradicted). ACE's grounding was against web sources; an analog for trace data (verifying that a claimed action actually appears in trace spans) could also be explored.
- **Consensus criteria**: Pre-written criteria that can be assigned to multiple traces when domain experts agree they're relevant (HealthBench pattern — their 34 consensus criteria).
- **Criterion difficulty analysis**: Track which criteria judges consistently struggle with to identify ambiguous or poorly-written criteria.
- **Batch rubric generation**: AI-assisted criterion generation from discovery findings (extending existing rubric suggestion flow to per-trace context).
- **Eval harness versioning**: Track changes to criteria over time and compare judge performance across versions.
- **Workshop-to-eval migration**: Convert a workshop-mode rubric into per-trace criteria by specializing general criteria to specific examples.

## Related Specs

- [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md) — Discovery and finding promotion (shared mechanics)
- [RUBRIC_SPEC](./RUBRIC_SPEC.md) — Global rubric system (workshop mode only)
- [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md) — Judge execution and alignment
- [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md) — Trace summaries used by improved discovery
- [DATASETS_SPEC](./DATASETS_SPEC.md) — Trace datasets and composition
