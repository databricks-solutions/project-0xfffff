# Discovery Phase Specification

## Overview

The Discovery phase is where participants review traces and provide structured feedback that the system synthesizes into evaluation criteria and surfaces disagreements. It replaces the previous discovery flow with a more structured, AI-assisted approach.

Discovery has three steps, each corresponding to a GitHub sub-issue of [#80](https://github.com/databricks-solutions/project-0xfffff/issues/80):

| Step | Issue | Summary |
|------|-------|---------|
| **Step 1: Feedback Collection** | [#81](https://github.com/databricks-solutions/project-0xfffff/issues/81) | Participants review traces, provide GOOD/BAD + comment, answer 3 AI follow-up questions |
| **Step 2: Findings Synthesis** | [#82](https://github.com/databricks-solutions/project-0xfffff/issues/82) | Facilitator triggers AI analysis: aggregate feedback, detect disagreements, distill evaluation criteria |
| **Step 3: Structured Feedback & Promotion** | [#13](https://github.com/databricks-solutions/project-0xfffff/issues/13) | Facilitator reviews synthesized findings and promotes key criteria to draft rubric |

> **Future work — Iterative rounds**: Steps 1-2-3 may be run more than once per workshop. In subsequent rounds, observations from prior rounds would be integrated into the follow-up question and distillation prompts. For MVP, Discovery runs as a single pass.

## Core Concepts

### Feedback
Each participant provides one feedback record per trace:
- **Label**: GOOD or BAD (required)
- **Comment**: Free-text explanation (required)
- **Follow-up Q&A**: 3 AI-generated follow-up questions with participant answers

### Follow-Up Questions
- **Count**: Exactly 3 per trace (fixed)
- **Generation**: AI-generated based on participant's feedback label, comment, and prior Q&A
- **Style**: Sharp, specific questions probing *why* the participant rated the way they did (system prompt is configurable — see [System Prompts](#system-prompts))
- **Progressive**: Each question builds on previous answers (full conversation context)
- **Required**: All 3 must be answered before moving to next trace

### Disagreement Detection
After feedback is collected, the system detects three types of disagreements across participants:

| Priority | Type | Meaning |
|----------|------|---------|
| HIGH | Rating disagreement | One participant rated GOOD, another rated BAD on the same trace |
| MEDIUM | Both BAD, different issues | Both rated BAD but identified different problems |
| LOWER | Both GOOD, different strengths | Both rated GOOD but valued different aspects |

Detection is **deterministic** (label comparison, no LLM). The LLM then *analyzes* detected disagreements to surface underlying themes and facilitator suggestions.

### Criteria Distillation
An LLM analyzes all feedback in a single batch to extract evaluation criteria — specific, actionable quality dimensions grounded in evidence from particular traces. These criteria become candidates for rubric questions.

### Draft Rubric Items
The facilitator can promote distilled criteria into draft rubric items, which bridge Discovery output into the Rubric Creation phase.

### Alternative Approaches (Assisted Facilitation — Future)

The `feat/discovery-update` branch implemented a more sophisticated real-time approach that may be revisited in future iterations:

- **Real-time finding classification**: Each participant submission is immediately classified by LLM into categories (themes, edge_cases, boundary_conditions, failure_modes, missing_info) via DSPy signatures. Gives the facilitator a live coverage view.
- **LLM-based disagreement detection**: DSPy compares findings across users per trace to detect semantic conflicts, rather than relying on label comparison.
- **Iterative summary pipeline**: Multi-step LLM pipeline that extracts themes, patterns, candidate rubric questions, discussion prompts, and convergence metrics.
- **Coverage thresholds**: Per-category, per-trace thresholds that the facilitator can adjust to signal when enough findings have been collected.
- **Fuzzy progress**: Participants see global progress without category breakdowns to avoid biasing their observations.
- **Ready-for-rubric signal**: Automated assessment of whether enough convergence exists to move to rubric creation.

Reference implementation: `server/services/discovery_service.py`, `server/services/classification_service.py`, `server/services/discovery_dspy.py`

## Step 1: Feedback Collection (Issue #81)

### Participant Flow

1. **View Trace** — Participant sees trace input/output via TraceViewer (reused component)
2. **Provide Feedback** — Select GOOD or BAD, write comment explaining reasoning
3. **Answer Follow-Up Questions** (progressive disclosure):
   - Q1 appears after feedback submission (1-3s loading spinner)
   - Participant answers Q1
   - Q2 appears (builds on Q1 context)
   - Participant answers Q2
   - Q3 appears (builds on Q1+Q2 context)
   - Participant answers Q3
4. **Next Trace** — Button appears after Q3, state resets for next trace
5. **Completion** — After all assigned traces, participant sees completion message

### Facilitator Flow (Starting Discovery)

1. Select traces for discovery using existing trace assignment mechanism (see `DISCOVERY_TRACE_ASSIGNMENT_SPEC`)
2. Configure trace limit (default: 10, or custom)
3. Toggle randomization (randomize trace order per participant, off by default)
4. Click "Start Discovery Phase" — workshop phase changes to DISCOVERY
5. Monitor participant progress (completion dashboard)

### State Machine (Per Trace)

```
feedback → generating_q1 → answering_q1 →
           generating_q2 → answering_q2 →
           generating_q3 → answering_q3 → complete

Error/retry path (from any generating_q* state):
  generating_q* → error → (retry) → generating_q*
                        → (max retries) → fallback_question → answering_q*
```

- On LLM failure, show error toast with retry button
- After 3 failed retries, provide a generic fallback question so the participant isn't blocked
- Feedback and prior Q&A are saved incrementally — no data loss on failure

### UI Components

**DiscoveryFeedbackView** (main participant interface):
```
[TraceViewer — reuse existing component]

[Feedback Form] (state = 'feedback')
  Radio: Good / Bad
  Textarea: Comment (required)
  Button: "Submit Feedback" (disabled until both filled)

[Loading Spinner] (state = 'generating_q*')
  "Generating follow-up question..."

[Question + Answer Form] (state = 'answering_q*')
  [Previous Q&A pairs — read-only, stacked]
  [Current Question — highlighted]
  Textarea: Answer (required)
  Button: "Submit Answer" (disabled until filled)

[Completion] (state = 'complete')
  Success message
  Button: "Next Trace" / "Complete Discovery"
```

**DiscoveryStartPage** (facilitator):
- Trace count display
- Trace limit selector
- Randomization toggle
- "Start Discovery Phase" button

**DiscoveryPendingPage** (participant waiting state):
- Clock icon, explanation of what Discovery involves
- Auto-refreshes every 5 seconds to detect start

### Follow-Up Question Generation

**System prompt** (UX researcher persona):
```
You are a senior UX researcher analyzing chatbot responses. Your job is to ask
the person giving feedback sharp, specific follow-up questions that extract
actionable insights about how the chatbot response could be improved.
Focus on clarifying: what specific aspect was problematic, what would make it
better, concrete examples, and priority. Do NOT act as the chatbot - you are
interviewing the feedback provider about their opinion of the chatbot's response.
```

**User prompt** (builds progressive context):
```
CONVERSATION BEING REVIEWED:
Input: {trace.input}
Output: {trace.output}

REVIEWER'S FEEDBACK:
Label: {feedback.label}
Comment: {feedback.comment}
Prior Q/A with reviewer:
{formatted_qna_history}

Your question to the REVIEWER (about their feedback):
```

> Note: Traces do not have a `use_case` field. The trace model has `input`, `output`, `context`, and `trace_metadata`. The workshop-level `description` provides use case context if needed.

**Error handling**: If LLM fails, show error toast with retry. After 3 retries, provide a fallback generic question.

## Step 2: Findings Synthesis (Issue #82)

### Facilitator Flow

1. **Trigger Analysis** — Click "Analyze Discovery Feedback" (available at any time, even with partial feedback)
2. **System processes**:
   a. Aggregate all feedback by trace
   b. Detect disagreements (3 priority tiers)
   c. Call LLM with distillation prompt to extract criteria and analyze disagreements
3. **View Results** — Structured analysis display in facilitator dashboard
4. **Re-run** — Can run analysis again at any time; each run creates a new record. Prior analyses are preserved for comparison.

### Aggregation

Group all feedback by `trace_id`:
```python
{
  trace_id: {
    "input": str,       # Trace input (raw, or JSONPath-extracted if configured)
    "output": str,      # Trace output (raw, or JSONPath-extracted if configured)
    "feedback_entries": [
      {"user": str, "label": str, "comment": str, "followup_qna": [...]}
    ]
  }
}
```

> If the workshop has `input_jsonpath`/`output_jsonpath` configured (see `TRACE_DISPLAY_SPEC`), use the extracted values for the LLM prompt — they'll be cleaner than raw JSON.

### Disagreement Detection (Deterministic — No LLM)

For each trace with multiple reviewers:
- If labels differ (GOOD vs BAD) → **HIGH priority**
- If all BAD → **MEDIUM priority** (different issues may exist)
- If all GOOD → **LOWER priority** (different strengths may be valued)

### Analysis Templates (LLM)

The facilitator selects an **analysis template** before triggering analysis. Each template uses a different distillation prompt but the same pipeline (aggregate → detect → call LLM → store).

**Preset templates:**

| Template | Focus | Output |
|----------|-------|--------|
| **Evaluation Criteria** (default) | Distill specific, actionable quality dimensions with evidence and priority | Criteria list + disagreement analysis |
| **Themes & Patterns** | Identify recurring themes, patterns, tendencies, risks, and strengths | Theme clusters + pattern analysis |

Both templates include disagreement analysis (HIGH/MEDIUM/LOWER). The difference is how the LLM frames the *positive* observations — as formal criteria vs. emergent themes.

> **Future**: Facilitators can add custom templates by providing their own prompt text. For MVP, the two presets are sufficient.

See [System Prompts](#system-prompts) section for full prompt text of each template.

### Analysis Results UI

**Analysis Tab** in facilitator dashboard:

```
[Analysis Controls]
  Template selector: "Evaluation Criteria" / "Themes & Patterns"
  "Run Analysis" button
  Analysis history dropdown (select previous runs to view)
  Loading spinner during analysis (10-30s)

[Data Freshness Banner]
  "Analysis based on X participants (last run: timestamp, template: Y)"
  Warning if < 2 participants

[Summary Card]
  Findings identified: N
  Disagreements: X HIGH / Y MEDIUM / Z LOWER

[Findings Section]
  List of findings (criteria or themes, depending on template) with:
  - Description
  - Evidence (trace references — clickable to view trace)
  - Priority badge (High/Medium/Low)
  - "Promote to Rubric" button (→ Step 3)

[Disagreement Analysis — by priority]
  HIGH (red badge): Rating disagreements
  MEDIUM (yellow badge): Both BAD, different issues
  LOWER (blue badge): Both GOOD, different strengths

  Each disagreement shows:
  - Trace reference (clickable)
  - What they disagreed about
  - Underlying theme
  - Follow-up questions for facilitator
  - Calibration suggestions
```

## Step 3: Structured Feedback & Promotion (Issue #13)

### Problem

During Discovery, key insights surface through participant feedback and AI analysis but are not systematically captured or easily promoted into formal grading criteria. Critical declarations from SMEs can be missed, and there's no structured path from "observation" to "rubric question."

### Promotable Material

Everything from Discovery is promotable to the draft rubric. The facilitator can always edit text before or after promoting.

| Source | Example | How it promotes |
|--------|---------|----------------|
| **Analysis findings** (Step 2) | *"Provide specific, verifiable confirmation (transaction IDs)"* | Click "Promote" → pre-fills text + source traces |
| **Disagreement insights** (Step 2) | *"Rating split: one said phrasing fine, other wanted 2FA"* | Click "Promote" → pre-fills with underlying theme, facilitator edits |
| **Raw participant feedback** | A specific GOOD/BAD comment or follow-up answer | Click "Promote" → copies text, facilitator refines |
| **Manual entry** | Facilitator's own observation from discussion | Click "+ Add Item" → free-form text |

### Draft Rubric Panel

Visible as a persistent sidebar or collapsible panel within the Discovery facilitator view:

```
[Draft Rubric Panel]
  "X items staged for rubric"

  List of promoted items:
  - Text (editable inline)
  - Source: "Analysis finding" / "Disagreement" / "Feedback" / "Manual"
  - Evidence traces (clickable, if from analysis)
  - Group badge (if grouped)
  - Actions: Edit, Remove

  [+ Add Item] button (manual entry)
  [Suggest Groups] button (LLM clusters items into rubric questions)
```

### Grouping: Draft Items → Rubric Questions

Each group of related draft items becomes one rubric question. Grouping can be done manually or with LLM assistance.

**"Suggest Groups" action:**
1. Facilitator clicks "Suggest Groups" on the Draft Rubric panel
2. LLM analyzes all current draft items and returns a grouping *proposal* (not yet saved)
3. Each proposed cluster has a suggested rubric question title (e.g., "Response Accuracy", "Security Compliance")
4. Facilitator reviews the proposal — can adjust group assignments, rename groups, move items between groups
5. Facilitator clicks "Apply Groups" to persist the grouping to the DB
6. Until "Apply" is clicked, existing group assignments are unchanged

**Manual grouping:**
- Drag-and-drop items between groups
- Create new group, name it
- Move items freely
- Manual changes save immediately (no proposal flow needed)

**Group → Rubric question mapping:**
- Each group's items become the evidence/definition for a single rubric question
- The group name becomes the rubric question title
- The combined item texts inform the question description, positive/negative examples

### Handoff to Rubric Creation

The draft rubric feeds into the Rubric Creation phase (see `RUBRIC_SPEC`):

- **Phase gate**: Workshop can advance from Discovery → Rubric Creation when at least one `DraftRubricItem` exists OR discovery feedback exists
- **Draft items as starting points**: Grouped draft items appear as pre-populated rubric question suggestions. The facilitator can accept, edit, or discard each one.
- **AI Rubric Generation** (existing `rubric_generation_service.py`): Remains available as a complementary option. The facilitator can trigger AI rubric suggestions at any time — the service uses discovery feedback and analysis results as input. AI suggestions appear alongside draft items, not replacing them.
- **Traceability preserved**: Each rubric question can trace back to the discovery evidence that motivated it (via `source_trace_ids` on the draft items)

## Data Model

### DiscoveryFeedback Table
```sql
CREATE TABLE discovery_feedback (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL REFERENCES workshops(id),
  trace_id TEXT NOT NULL REFERENCES traces(id),
  user_id TEXT NOT NULL,
  feedback_label TEXT NOT NULL,  -- 'good' | 'bad'
  comment TEXT NOT NULL,
  followup_qna JSON DEFAULT '[]',  -- [{"question": "...", "answer": "..."}, ...]
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workshop_id, trace_id, user_id)
);
```

### DiscoveryAnalysis Table
```sql
CREATE TABLE discovery_analysis (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL REFERENCES workshops(id),
  template_used TEXT NOT NULL,      -- 'evaluation_criteria' | 'themes_patterns'
  analysis_data TEXT NOT NULL,      -- Full markdown analysis from LLM
  findings JSON NOT NULL,           -- [{text, evidence_trace_ids, priority}] — criteria or themes depending on template
  disagreements JSON NOT NULL,      -- {high: [...], medium: [...], lower: [...]}
  participant_count INTEGER NOT NULL,
  model_used TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workshop_id) REFERENCES workshops(id)
);
```

### DraftRubricItems Table
```sql
CREATE TABLE draft_rubric_items (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL REFERENCES workshops(id),
  text TEXT NOT NULL,               -- Criterion/theme text (editable by facilitator)
  source_type TEXT NOT NULL,        -- 'finding' | 'disagreement' | 'feedback' | 'manual'
  source_analysis_id TEXT,          -- References discovery_analysis(id) if promoted from an analysis
  source_trace_ids JSON DEFAULT '[]', -- Traces that support this item
  group_id TEXT,                    -- NULL = ungrouped, otherwise groups items into a rubric question
  group_name TEXT,                  -- Suggested rubric question title for this group
  promoted_by TEXT NOT NULL,
  promoted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Workshop Table Additions
```sql
ALTER TABLE workshops ADD COLUMN discovery_started BOOLEAN DEFAULT FALSE;
ALTER TABLE workshops ADD COLUMN discovery_randomize_traces BOOLEAN DEFAULT FALSE;
```

> Trace selection for Discovery uses the existing mechanism defined in `DISCOVERY_TRACE_ASSIGNMENT_SPEC`. No additional columns needed.

### Pydantic Models
```python
class FeedbackLabel(str, Enum):
    GOOD = "good"
    BAD = "bad"

class DiscoveryFeedbackCreate(BaseModel):
    trace_id: str
    user_id: str
    feedback_label: FeedbackLabel
    comment: str

class DiscoveryFeedback(BaseModel):
    id: str
    workshop_id: str
    trace_id: str
    user_id: str
    feedback_label: FeedbackLabel
    comment: str
    followup_qna: list[dict[str, str]] = []
    created_at: datetime
    updated_at: datetime

class DiscoveryAnalysis(BaseModel):
    id: str
    workshop_id: str
    template_used: str              # 'evaluation_criteria' | 'themes_patterns'
    analysis_data: str              # Full markdown from LLM
    findings: list[dict[str, Any]]  # Criteria or themes, depending on template
    disagreements: dict[str, list[dict[str, Any]]]
    participant_count: int
    model_used: str
    created_at: datetime
    updated_at: datetime

class DraftRubricItem(BaseModel):
    id: str
    workshop_id: str
    text: str                       # Editable by facilitator
    source_type: str                # 'finding' | 'disagreement' | 'feedback' | 'manual'
    source_analysis_id: str | None = None  # Which analysis run this came from
    source_trace_ids: list[str] = []
    group_id: str | None = None     # NULL = ungrouped
    group_name: str | None = None   # Rubric question title for this group
    promoted_by: str
    promoted_at: datetime
```

## API Endpoints

### Step 1: Feedback Collection

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workshops/{id}/begin-discovery` | Start discovery phase. Query: `trace_limit`, `randomize` |
| POST | `/workshops/{id}/discovery-feedback` | Submit initial feedback (label + comment) |
| POST | `/workshops/{id}/generate-followup-question` | Generate next follow-up question. Query: `trace_id`, `user_id`, `question_number` |
| POST | `/workshops/{id}/submit-followup-answer` | Append Q&A pair to feedback record |
| GET | `/workshops/{id}/discovery-feedback` | Get all feedback. Query: `user_id` (optional filter) |
| GET | `/workshops/{id}/discovery-completion-status` | Completion stats for dashboard |

### Step 2: Findings Synthesis

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workshops/{id}/analyze-discovery` | Run analysis, creates new record. Body: `{template, model}` |
| GET | `/workshops/{id}/discovery-analysis` | Get all analyses (newest first). Query: `template` (optional filter) |
| GET | `/workshops/{id}/discovery-analysis/{analysis_id}` | Get a specific analysis by ID |

### Step 3: Promotion & Grouping

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workshops/{id}/draft-rubric-items` | Promote an item to draft rubric. Body: `{text, source_type, source_analysis_id?, source_trace_ids}` |
| GET | `/workshops/{id}/draft-rubric-items` | Get all draft rubric items (grouped and ungrouped) |
| PUT | `/workshops/{id}/draft-rubric-items/{item_id}` | Edit text, group assignment, or group name |
| DELETE | `/workshops/{id}/draft-rubric-items/{item_id}` | Remove a draft rubric item |
| POST | `/workshops/{id}/draft-rubric-items/suggest-groups` | LLM returns grouping proposal (not persisted). Response: `{groups: [{name, item_ids}]}` |
| POST | `/workshops/{id}/draft-rubric-items/apply-groups` | Persist a grouping. Body: `{groups: [{name, item_ids}]}` |

## Backend Services

### FollowUpQuestionService
Generates progressive AI follow-up questions during Step 1 feedback collection.

```python
class FollowUpQuestionService:
    def generate(self, trace, feedback, question_number: int) -> str:
        """Generate follow-up question using LLM with progressive context.

        Builds a prompt with the trace, feedback label/comment, and all
        prior Q&A pairs so each question builds on previous answers.
        """
```

### DiscoveryAnalysisService
Aggregates feedback and runs LLM analysis with structured output via DSPy signatures.

```python
class DiscoveryAnalysisService:
    def aggregate_feedback(self, workshop_id: str) -> dict:
        """Group all feedback by trace_id with trace input/output."""

    def detect_disagreements(self, aggregated: dict) -> dict:
        """Detect 3 priority tiers of disagreements. Deterministic, no LLM."""

    def distill(self, template: str, aggregated: dict, disagreements: dict) -> DistillationOutput:
        """Call LLM with template-specific prompt. Returns structured output via DSPy.

        Args:
            template: 'evaluation_criteria' or 'themes_patterns'
            aggregated: Feedback grouped by trace
            disagreements: Detected disagreement tiers

        Returns:
            DistillationOutput with typed findings and disagreement analysis.
        """

    def run_analysis(self, workshop_id: str, template: str) -> DiscoveryAnalysis:
        """Full workflow: aggregate → detect → distill → store (new record)."""
```

#### DSPy Signatures for Structured Output

Rather than parsing free-form LLM markdown, the analysis pipeline uses DSPy signatures to get typed, structured output directly from the LLM.

```python
class Finding(BaseModel):
    text: str                    # Description of the finding
    evidence_trace_ids: list[str]  # Traces that support this finding
    priority: str                # 'high' | 'medium' | 'low'

class DisagreementAnalysis(BaseModel):
    trace_id: str
    summary: str                 # What they disagreed about
    underlying_theme: str        # Quality dimension at play
    followup_questions: list[str]  # Questions to resolve it
    facilitator_suggestions: list[str]  # Concrete calibration actions

class DistillationOutput(BaseModel):
    findings: list[Finding]
    high_priority_disagreements: list[DisagreementAnalysis]   # GOOD vs BAD
    medium_priority_disagreements: list[DisagreementAnalysis]  # Both BAD, different issues
    lower_priority_disagreements: list[DisagreementAnalysis]   # Both GOOD, different strengths
    summary: str                 # Brief overall summary

class DistillFindings(dspy.Signature):
    """Analyze participant feedback to extract findings and disagreement insights."""
    instruction: str = dspy.InputField(desc="Template-specific analysis instruction")
    feedback_data: str = dspy.InputField(desc="Aggregated feedback with trace context")
    detected_disagreements: str = dspy.InputField(desc="Pre-detected disagreement tiers")
    output: DistillationOutput = dspy.OutputField()
```

The `instruction` field receives the template-specific prompt (Evaluation Criteria or Themes & Patterns), keeping the signature reusable across templates.

### DraftRubricGroupingService
Suggests groupings of draft rubric items via LLM.

```python
class DraftRubricGroupingService:
    def suggest_groups(self, items: list[DraftRubricItem]) -> list[ProposedGroup]:
        """LLM clusters draft items into rubric question groups.

        Returns a proposal (not persisted). The facilitator reviews
        and calls apply_groups() to persist.
        """

    def apply_groups(self, workshop_id: str, groups: list[dict]) -> None:
        """Persist group assignments. Updates group_id/group_name on each item."""
```

#### DSPy Signature for Group Suggestion

```python
class ProposedGroup(BaseModel):
    name: str                    # Suggested rubric question title
    item_ids: list[str]          # Draft item IDs in this group
    rationale: str               # Why these items belong together

class SuggestGroups(dspy.Signature):
    """Cluster related draft rubric items into groups, where each group
    will become one rubric question."""
    items: str = dspy.InputField(desc="Draft rubric items with IDs and text")
    groups: list[ProposedGroup] = dspy.OutputField()
```

### DatabaseService Extensions
- `add_discovery_feedback(workshop_id, data)` — Upsert feedback
- `append_followup_qna(workshop_id, trace_id, user_id, qna)` — Append Q&A pair
- `get_discovery_feedback(workshop_id, user_id?, trace_id?)` — Query with filters
- `get_discovery_completion_status(workshop_id)` — Completion stats
- `save_discovery_analysis(workshop_id, analysis)` — Insert new analysis record
- `get_discovery_analyses(workshop_id, template?)` — List analyses (newest first)
- `get_discovery_analysis(analysis_id)` — Get specific analysis or None
- `add_draft_rubric_item(workshop_id, item)` — Create draft item
- `update_draft_rubric_item(item_id, updates)` — Update text, group_id, group_name
- `get_draft_rubric_items(workshop_id)` — List draft items
- `delete_draft_rubric_item(item_id)` — Remove draft item

## System Prompts

### Follow-Up Question Generation
```
You are a senior UX researcher analyzing chatbot responses. Your job is to ask
the person giving feedback sharp, specific follow-up questions that extract
actionable insights about how the chatbot response could be improved.
Focus on clarifying: what specific aspect was problematic, what would make it
better, concrete examples, and priority. Do NOT act as the chatbot - you are
interviewing the feedback provider about their opinion of the chatbot's response.
```

### Analysis Template: Evaluation Criteria
Used when `template = 'evaluation_criteria'`. Passed as the `instruction` field to the `DistillFindings` DSPy signature.

```
Analyze the participant feedback below to extract evaluation criteria and
analyze disagreements between reviewers.

## Findings: Evaluation Criteria

Distill specific, actionable evaluation criteria from the feedback. Each
criterion should describe one quality dimension that could be used to assess
future responses. Focus on:
- User preferences and expectations for quality
- Specific aspects users care about (tone, accuracy, efficiency, empathy, etc.)
- Patterns in what makes responses "good" vs "needs improvement"

For each criterion, cite the trace IDs that provide evidence and assign a
priority (high/medium/low) based on how frequently or strongly it appears
in the feedback.

## Disagreement Analysis

For each detected disagreement, analyze:
- HIGH PRIORITY (rating disagreements — one GOOD, one BAD): What quality
  dimension is unclear? What follow-up questions would resolve it? What
  concrete calibration actions should the facilitator take?
- MEDIUM PRIORITY (both BAD, different issues): What different problems
  were identified? Are they independent or related? Which should be fixed
  first?
- LOWER PRIORITY (both GOOD, different strengths): What different aspects
  were valued? Do these reflect different user types or priorities?
```

### Analysis Template: Themes & Patterns
Used when `template = 'themes_patterns'`. Same DSPy signature, different instruction.

```
Analyze the participant feedback below to identify recurring themes and
patterns, and analyze disagreements between reviewers.

## Findings: Themes & Patterns

Identify emergent themes, recurring patterns, notable tendencies, risks,
and strengths across the feedback. Unlike formal criteria, themes can be
broader observations about how users interact with and evaluate the
responses. Look for:
- Recurring concerns or praise across multiple traces
- Patterns in what users notice first or care most about
- Tendencies in how different user types evaluate responses
- Risks or failure modes that appeared across traces
- Strengths worth preserving

For each theme, cite the trace IDs that provide evidence and assign a
priority (high/medium/low) based on prevalence and impact.

## Disagreement Analysis

For each detected disagreement, analyze:
- HIGH PRIORITY (rating disagreements — one GOOD, one BAD): What
  underlying theme explains the split? What perspectives are in tension?
- MEDIUM PRIORITY (both BAD, different issues): What different themes
  do the issues fall under? Are they facets of the same problem?
- LOWER PRIORITY (both GOOD, different strengths): What different
  themes do the valued aspects represent?
```

### Suggest Groups Prompt
Used as context for the `SuggestGroups` DSPy signature.

```
You are organizing draft rubric items into groups. Each group will become
one rubric question for evaluating chatbot responses.

Group items that address the same quality dimension or evaluation concern.
Each group should be:
- Cohesive: all items in a group relate to the same core idea
- Distinct: groups should not overlap significantly
- Named clearly: the group name should work as a rubric question title

Items that don't fit any group can be left ungrouped. Prefer fewer,
well-defined groups over many small ones.
```

## Configuration

### LLM Provider
Discovery uses the same model selection as judge evaluation: **Databricks foundation models** (via `modelMapping.ts`) and optionally a **Custom LLM Provider** (via `CustomLLMProviderConfig`). The facilitator picks a model in the Discovery dashboard UI. No discovery-specific LLM configuration needed.

### Defaults
- **Trace limit**: 10 (configurable by facilitator)
- **Follow-up questions**: 3 per trace (fixed)
- **All questions required** (no skip)
- **Randomization**: Off by default

## Success Criteria

### Step 1: Feedback Collection (#81)
- [ ] Facilitator can start Discovery phase with configurable trace limit
- [ ] Participants view traces and provide GOOD/BAD + comment
- [ ] Facilitator can select LLM model for follow-up question generation in Discovery dashboard
- [ ] AI generates 3 follow-up questions per trace based on feedback
- [ ] Questions build progressively on prior answers
- [ ] All 3 questions required before moving to next trace
- [ ] Previous Q&A visible while answering new questions
- [ ] Loading spinner during LLM generation (1-3s)
- [ ] Error handling with retry for LLM failures
- [ ] Feedback saved incrementally (no data loss on failure)
- [ ] Completion status shows % of participants finished
- [ ] Facilitator can view participant feedback details (label, comment, follow-up Q&A)

### Step 2: Findings Synthesis (#82)
- [ ] Facilitator can trigger analysis at any time (even partial feedback)
- [ ] Facilitator selects analysis template (Evaluation Criteria or Themes & Patterns) before running
- [ ] System aggregates feedback by trace
- [ ] Disagreements detected at 3 priority levels (deterministic, no LLM)
- [ ] LLM distills evaluation criteria with evidence from trace IDs
- [ ] LLM analyzes disagreements with follow-up questions and suggestions
- [ ] Analysis record stores which template was used
- [ ] Each analysis run creates a new record (history preserved)
- [ ] Re-runnable — new analysis as more feedback comes in, prior analyses retained
- [ ] Warning if < 2 participants (not an error)
- [ ] Data freshness banner (participant count, last run timestamp)
- [ ] Results organized by priority (HIGH → MEDIUM → LOWER)

### Step 3: Structured Feedback & Promotion (#13)
- [ ] Facilitator can promote distilled criteria to draft rubric
- [ ] Facilitator can promote disagreement insights to draft rubric
- [ ] Facilitator can promote raw participant feedback to draft rubric
- [ ] Facilitator can manually add draft rubric items
- [ ] Draft rubric items editable and removable
- [ ] "Suggest Groups" returns LLM proposal without persisting
- [ ] Facilitator can review, adjust, and apply group proposal
- [ ] Manual grouping: create groups, name them, move items between groups
- [ ] Each group maps to one rubric question (group name = question title)
- [ ] Draft rubric items available during Rubric Creation phase
- [ ] Source traceability maintained (which traces support each item)

### Data Integrity
- [ ] One feedback record per (workshop, trace, user) — upsert behavior
- [ ] Q&A pairs appended in order to JSON array
- [ ] Multiple analysis records per workshop allowed (history preserved)
- [ ] Draft rubric items track promotion source and promoter

### Error Handling
- [ ] LLM failures show error toast with retry
- [ ] Fallback question if LLM unavailable after retries
- [ ] Fallback warning banner shown only to facilitators, never to participants/SMEs
- [ ] Analysis shows warning (not error) if < 2 participants
- [ ] Form validation prevents empty submissions

### UX
- [ ] Progressive disclosure (one question at a time)
- [ ] Submit buttons disabled until required fields filled
- [ ] Clear progress indication (X of Y traces completed)
- [ ] Smooth transitions between feedback states
- [ ] Disagreements color-coded by priority (red/yellow/blue)
- [ ] Criteria show evidence (supporting trace IDs)

## Existing Code Reference

The `feat/discovery-update` branch (v1 assisted facilitation) is merged. Most code needs replacing for the v2 feedback-based approach. Reusable parts:

**Reuse as-is:**
- `discovery_dspy.py` — DSPy infrastructure: `build_databricks_lm`, `get_predictor`, `run_predict`, `_dspy_with_lm`
- `discovery_service.py` — `begin_discovery_phase`, `reset_discovery`, `advance_to_discovery`, completion tracking methods
- `discovery.py` router — `begin-discovery`, `reset-discovery`, `advance-to-discovery`, completion endpoints
- `DiscoveryStartPage.tsx`, `DiscoveryPendingPage.tsx` — adapt for new config options (randomization toggle)

**Replace:**
- v1 question generation (coverage-category system) → v2 follow-up question generation (progressive Q&A)
- v1 summary pipeline (iterative refine/extract/disagree/discuss) → v2 analysis templates with `DistillFindings` DSPy signature
- v1 classification service (`classification_service.py`) → v2 deterministic disagreement detection
- v1 DSPy signatures → v2 signatures (`DistillFindings`, `SuggestGroups`)
- `TraceDiscoveryPanel.tsx` → `DiscoveryFeedbackView`, `DiscoveryDashboard`, Draft Rubric Panel
- `DiscoveryService.ts` → new API client for v2 endpoints
- DB migration — new migration needed for `discovery_feedback`, `discovery_analysis`, `draft_rubric_items` tables

**Reference only (not merged to main):**
- `pk-changes/` — colleague's prototype with sample prompts, feedback flow, and analysis output

## Workflow Integration

### Phase Order
```
intake → discovery → rubric_creation → annotation → judge_tuning
```

Discovery replaces the previous discovery phase. No separate "pre-work" phase.

### RoleBasedWorkflow Routing
```tsx
if (phase === 'discovery') {
  if (isFacilitator) {
    if (!workshop.discovery_started) {
      return <DiscoveryStartPage />;
    } else {
      return <DiscoveryDashboard />;  // Tabs: Feedback Monitor (Step 1), Analysis (Step 2), Draft Rubric (Step 3)
    }
  } else {
    if (!workshop.discovery_started) {
      return <DiscoveryPendingPage />;
    } else if (userCompleted) {
      return <DiscoveryCompletePage />;
    } else {
      return <DiscoveryFeedbackView />;
    }
  }
}
```
