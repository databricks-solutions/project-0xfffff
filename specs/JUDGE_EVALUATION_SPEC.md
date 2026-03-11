# Judge Evaluation Specification

## Overview

This specification defines the LLM judge evaluation system for the Human Evaluation Workshop, including judge creation, evaluation execution, alignment optimization, auto-evaluation, re-evaluation, and inter-rater reliability (IRR) measurement. The system integrates with [MLflow GenAI](https://mlflow.org/docs/latest/genai/) for judge execution and alignment.

## MLflow Integration

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Judge Evaluation Flow                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Workshop   │    │    MLflow    │    │   Model      │  │
│  │   Rubric     │───▶│  make_judge  │───▶│  Endpoint    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         │                   ▼                   │           │
│         │           ┌──────────────┐            │           │
│         │           │   evaluate   │◀───────────┘           │
│         │           └──────────────┘                        │
│         │                   │                               │
│         ▼                   ▼                               │
│  ┌──────────────┐    ┌──────────────┐                      │
│  │   Human      │    │   Judge      │                      │
│  │  Annotations │───▶│  Alignment   │                      │
│  │  (Feedback)  │    │  (SIMBA)     │                      │
│  └──────────────┘    └──────────────┘                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key MLflow APIs

| API | Purpose |
|-----|---------|
| `mlflow.genai.make_judge()` | Create judge from prompt |
| `mlflow.genai.evaluate()` | Run judge on traces |
| `mlflow.genai.align()` | Optimize judge against human feedback |
| `mlflow.genai.Feedback` | Human annotation feedback |

## Judge Types

### Likert Scale (1-5)

```python
judge = mlflow.genai.make_judge(
    model="endpoints:/my-endpoint",
    name="quality_judge",
    prompt=LIKERT_PROMPT,
    feedback_value_type=float,  # Returns 1.0-5.0
)
```

Rating interpretation:
- 1: Very poor
- 2: Poor
- 3: Acceptable
- 4: Good
- 5: Excellent

### Binary Scale (Pass/Fail)

```python
judge = mlflow.genai.make_judge(
    model="endpoints:/my-endpoint",
    name="binary_judge",
    prompt=BINARY_PROMPT,
    feedback_value_type=float,  # Returns 0.0 or 1.0
)
```

Rating interpretation:
- 0: Fail
- 1: Pass

## Binary Judge Implementation

### The Problem

LLMs often ignore binary format instructions and return Likert-style values (e.g., 3.0) instead of 0/1.

### Solution: Three-Layer Approach

#### 1. Strong Prompt Instructions (Prepended)

```python
BINARY_PREFIX = """## CRITICAL OUTPUT FORMAT REQUIREMENT
You are a BINARY judge. You MUST output EXACTLY one of these values:
- Output "1" if the response meets the criteria (PASS)
- Output "0" if the response does NOT meet the criteria (FAIL)

DO NOT output any other values. DO NOT output 2, 3, 4, 5, or any decimals.
ONLY output "0" or "1".

Examples of VALID outputs: 0, 1
Examples of INVALID outputs: 0.5, 2, 3, 4, 5, "pass", "fail"
---

"""

# Prepend to prompt (models pay more attention to beginning)
full_prompt = BINARY_PREFIX + user_prompt
```

#### 2. Use Float Type (Not Bool)

```python
# DON'T use bool - unreliable parsing
feedback_value_type=bool  # ❌

# DO use float - more reliable 0/1 parsing
feedback_value_type=float  # ✅
```

#### 3. Fallback Threshold Conversion

```python
def normalize_binary_rating(value: float) -> float:
    """Convert Likert-style values to binary."""
    if value in (0.0, 1.0):
        return value  # Already binary

    if 1.0 <= value <= 5.0:
        # Likert to binary: >=3 = PASS, <3 = FAIL
        return 1.0 if value >= 3.0 else 0.0

    raise ValueError(f"Invalid rating: {value}")
```

### Expected Behavior

**Before fix**:
```
Raw MLflow response: value=3.0
ERROR: Invalid binary rating 3.0
Extracted 0/10 evaluations
```

**After fix**:
```
Raw MLflow response: value=3.0
FALLBACK: Converting 3.0 → 1.0 (>=3 = PASS)
Extracted 10/10 evaluations
```

## Auto-Evaluation

### Purpose

Automatically run LLM judge evaluation on traces in the background when the annotation phase begins. This enables immediate comparison of human ratings against LLM judge scores without requiring manual evaluation.

### Trigger

Auto-evaluation starts when the facilitator clicks "Start Annotation Phase" with auto-evaluation enabled.

### Flow

```
1. Facilitator configures annotation phase (trace count, randomization, model selection)
2. Facilitator enables auto-evaluation toggle and selects model
3. System derives judge prompt from rubric questions
4. Traces are tagged with 'eval' label in MLflow
5. Background evaluation job starts
6. Results appear in Judge Tuning / Results page
```

### Derived Judge Prompt

The system automatically generates a judge prompt from the rubric:

```python
def derive_judge_prompt_from_rubric(workshop_id: str) -> str:
    """Auto-derive judge prompt from rubric questions."""
    rubric = get_rubric(workshop_id)
    questions = parse_rubric_questions(rubric.question)

    # Build prompt from question title and description
    question = questions[0]  # Each question evaluated separately
    prompt = f"""Evaluate the response based on the following criterion:

**{question['title']}**
{question['description']}

{{ inputs }}
{{ outputs }}
"""
    return prompt
```

### Per-Question Judge Type

Rubric questions can have individual judge types (see [RUBRIC_SPEC](./RUBRIC_SPEC.md)):

```
Question 1 [JUDGE_TYPE:binary]
Is the response factually accurate?
|||QUESTION_SEPARATOR|||
Question 2 [JUDGE_TYPE:likert]
Rate the helpfulness of the response
```

The evaluation system parses `[JUDGE_TYPE:xxx]` from each question and uses the appropriate type for evaluation.

### Data Model Additions

```
Workshop:
  - auto_evaluation_job_id: Optional[string]   # Background job ID
  - auto_evaluation_prompt: Optional[string]   # Derived judge prompt
  - auto_evaluation_model: Optional[string]    # Model used (for re-evaluation consistency)
```

### API Endpoint

```
POST /workshops/{workshop_id}/begin-annotation
{
  "trace_limit": 10,
  "randomize": false,
  "evaluation_model_name": "databricks-gpt-5-2"  // null to disable auto-eval
}

Response:
{
  "message": "Annotation phase started",
  "auto_evaluation_started": true,
  "auto_evaluation_job_id": "uuid"
}
```

### Model Selection

Available models for auto-evaluation (via `MODEL_MAPPING`):

| Display Name | Endpoint Name |
|--------------|---------------|
| GPT-5.2 | `databricks-gpt-5-2` |
| GPT-5.1 | `databricks-gpt-5-1` |
| Claude Opus 4.5 | `databricks-claude-opus-4-5` |
| Claude Sonnet 4.5 | `databricks-claude-sonnet-4-5` |
| Claude Sonnet 4 | `databricks-claude-sonnet-4` |
| Gemini 3 Pro | `databricks-gemini-3-pro` |
| Gemini 2.5 Flash | `databricks-gemini-2-5-flash` |
| Llama 4 Maverick | `databricks-llama-4-maverick` |
| Llama 3.3 70B Instruct | `databricks-meta-llama-3-3-70b-instruct` |

## Re-Evaluation

### Purpose

Re-run LLM evaluation after alignment to compare pre-alignment and post-alignment judge accuracy. Uses the registered judge with aligned instructions (including semantic memory from MemAlign).

### Flow

```
1. Complete alignment (which registers optimized judge in MLflow)
2. Click "Re-evaluate" button in Judge Tuning page
3. System loads registered judge with aligned instructions
4. Evaluation runs on traces tagged with 'eval' label
5. Results update in UI with new accuracy metrics
```

### Registered Judge Loading

After alignment, the judge is registered in MLflow. Re-evaluation can load this registered judge:

```python
from mlflow.genai.scorers import get_scorer

# Load the aligned judge with semantic memory
judge = get_scorer(name=judge_name, experiment_id=experiment_id)

# Judge includes:
# - Original instructions + distilled guidelines (semantic memory)
# - Note: Episodic memory (example retrieval) not persisted in registered judge
```

### API Endpoint

```
POST /workshops/{workshop_id}/re-evaluate
{
  "judge_prompt": "optional custom prompt",  // uses stored prompt if omitted
  "judge_name": "workshop_judge",
  "judge_type": "binary"  // auto-detected from rubric if omitted
}

Response:
{
  "job_id": "uuid",
  "message": "Re-evaluation started"
}
```

### Model Consistency

Re-evaluation uses the same model stored during initial auto-evaluation (`auto_evaluation_model` field) to ensure fair comparison between pre-align and post-align results.

### Tag Types

| Tag | Purpose |
|-----|---------|
| `eval` | Traces for evaluation (applied when annotation starts) |
| `align` | Traces for alignment (applied when human annotations complete) |

Re-evaluation uses `tag_type='eval'` to evaluate the same trace set.

## Alignment (MemAlign Optimizer)

### Purpose

Align LLM judge outputs with human annotations using the MemAlign optimization algorithm with dual memory systems.

### MemAlign Architecture

MemAlign uses two types of memory to improve judge alignment:

```
┌─────────────────────────────────────────────────────────┐
│                    MemAlign System                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐    ┌──────────────────┐          │
│  │ Semantic Memory  │    │ Episodic Memory  │          │
│  │ (Guidelines)     │    │ (Examples)       │          │
│  └──────────────────┘    └──────────────────┘          │
│           │                        │                    │
│           │ Distills general       │ Retrieves similar │
│           │ principles from        │ past examples     │
│           │ human feedback         │ during evaluation │
│           │                        │                    │
│           └────────────┬───────────┘                   │
│                        ▼                                │
│              ┌──────────────────┐                       │
│              │  Aligned Judge   │                       │
│              │  (Instructions + │                       │
│              │   Guidelines)    │                       │
│              └──────────────────┘                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Memory Types

| Memory Type | Purpose | Persistence |
|-------------|---------|-------------|
| **Semantic** | Distilled guidelines from feedback patterns | Included in registered judge instructions |
| **Episodic** | Similar examples retrieved during evaluation | Not persisted (runtime only) |

### Flow

```
1. Collect human annotations on traces
2. Mark traces with 'align' tag in MLflow
3. Run MemAlign optimizer
4. Distill semantic memory (guidelines)
5. Build episodic memory (examples)
6. Register aligned judge to MLflow
7. Re-evaluate to compare pre/post alignment
```

### Alignment API

```python
from mlflow.genai.judges.optimizers import MemAlignOptimizer

optimizer = MemAlignOptimizer(
    reflection_lm="openai:/gpt-4o-mini",  # Model for guideline distillation
    retrieval_k=5,  # Examples to retrieve
    embedding_model="databricks:/databricks-gte-large-en",
)

aligned_judge = judge.align(traces, optimizer)

# Aligned judge has:
# - aligned_judge.instructions (original + distilled guidelines)
# - aligned_judge._semantic_memory (list of guidelines)
# - aligned_judge._episodic_memory (list of examples - not persisted)
```

### Scale-Specific Behavior

MemAlign works universally across all judge types (binary, likert, freeform) without requiring type-specific configuration. The optimizer automatically adapts to the feedback patterns.

### Feedback Aggregation

When multiple annotators rate the same trace:

```python
def aggregate_feedback(annotations: List[Annotation]) -> float:
    """Aggregate multiple ratings for same trace."""
    ratings = [a.rating for a in annotations]

    # For Likert: use mean
    # For Binary: use majority vote
    if scale == 'likert':
        return statistics.mean(ratings)
    else:
        return 1.0 if sum(ratings) > len(ratings) / 2 else 0.0
```


## Data Model

### Judge

```
Judge:
  - id: UUID
  - workshop_id: UUID
  - name: string
  - prompt: string
  - judge_type: 'likert' | 'binary'
  - model_endpoint: string
  - created_at: timestamp
  - updated_at: timestamp
```

### JudgeEvaluation

```
JudgeEvaluation:
  - id: UUID
  - judge_id: UUID
  - trace_id: string
  - rating: float
  - rationale: Optional[string]
  - raw_response: JSON
  - created_at: timestamp
```

### AlignmentJob

```
AlignmentJob:
  - id: UUID
  - judge_id: UUID
  - status: 'pending' | 'running' | 'completed' | 'failed'
  - original_prompt: string
  - optimized_prompt: Optional[string]
  - metrics: JSON
  - created_at: timestamp
  - completed_at: Optional[timestamp]
```

## API Endpoints

### Run Evaluation

```
POST /workshops/{workshop_id}/judges/{judge_id}/evaluate
{
  "trace_ids": ["trace-1", "trace-2", ...]
}

Response:
{
  "job_id": "uuid",
  "status": "running"
}
```

### Get Evaluation Results

```
GET /workshops/{workshop_id}/judges/{judge_id}/evaluations

Response:
{
  "evaluations": [
    {
      "trace_id": "trace-1",
      "rating": 4.0,
      "rationale": "..."
    }
  ]
}
```
## Cohen's Kappa Metrics Panel

### Overview

After evaluation completes on the Judge Tuning page, a **Performance Metrics Panel** is displayed showing Cohen's Kappa and related agreement metrics between the LLM judge's ratings and human annotations. This provides immediate feedback on judge quality so facilitators can iterate on the prompt.

### When Displayed

The metrics panel renders **only** when both conditions are met:
1. `metrics` object is non-null (evaluation returned results)
2. `hasEvaluated` is true (at least one evaluation has been run in this session)

The panel is hidden before the first evaluation and if no valid evaluations were produced.

### Metrics Computed

#### 1. Cohen's Kappa (κ)

Measures agreement between the LLM judge and human annotators, corrected for chance agreement.

**Formula**: `κ = (p_o - p_e) / (1 - p_e)`
- `p_o` = observed agreement (proportion of exact matches)
- `p_e` = expected agreement by chance (based on marginal distributions)

**Implementation**: `sklearn.metrics.cohen_kappa_score(human_ratings, predicted_ratings)`

**Stored as**: `JudgePerformanceMetrics.correlation` (float, 0.0–1.0)

**Edge cases**:
- If κ is `NaN` (e.g., all ratings identical), falls back to simple agreement ratio: `matches / total`
- If `cohen_kappa_score` raises an exception, falls back to simple agreement ratio
- If κ is `NaN` after fallback, stored as `0.0`

**Display**: Shown as percentage (e.g., `85.3%`) with label "Cohen's κ"

#### 2. Accuracy (Exact Match)

Proportion of evaluations where the judge's rating exactly matches the human rating.

**Formula**: `accuracy = count(human == predicted) / total`

**Implementation**: `sklearn.metrics.accuracy_score(human_ratings, predicted_ratings)`

**Stored as**: `JudgePerformanceMetrics.accuracy` (float, 0.0–1.0)

**Display**: Shown as percentage (e.g., `72.0%`) with label "Accuracy"

#### 3. Total Evaluations

Count of evaluations with **both** valid human and judge ratings.

**Stored as**: `JudgePerformanceMetrics.total_evaluations` (int)

**Display**: Shown as integer. If some evaluations had invalid/missing judge ratings, shows `valid / total` with a count of missing ratings below.

#### 4. Agreement by Rating

Per-rating-level accuracy showing how well the judge performs when the human gave each specific rating.

**Formula** (for each rating level r in 1–5):
```
agreement[r] = accuracy_score(
    [h for h, p in pairs if h == r],
    [p for h, p in pairs if h == r]
)
```

If no human annotations exist for a rating level, agreement is `0.0`.

**Stored as**: `JudgePerformanceMetrics.agreement_by_rating` (Dict[str, float], keys "1"–"5")

**Display**: Five pill-shaped cards labeled `1★` through `5★`, each showing agreement percentage.

#### 5. Confusion Matrix

Full 5×5 confusion matrix of human (rows) vs. predicted (columns) ratings.

**Implementation**: `sklearn.metrics.confusion_matrix(human_ratings, predicted_ratings, labels=[1, 2, 3, 4, 5])`

**Stored as**: `JudgePerformanceMetrics.confusion_matrix` (List[List[int]])

**Display**: Not directly rendered in the metrics panel; available in the data model for downstream analysis and export.

### Color Thresholds

Both Cohen's κ and Accuracy use the same color scale:

| Value | Color | Meaning |
|-------|-------|---------|
| ≥ 80% | Green (`text-green-600`) | Strong agreement |
| 60%–79% | Amber (`text-yellow-600`) | Moderate agreement |
| < 60% | Red (`text-red-600`) | Weak agreement |

Agreement by Rating pills use the same thresholds with left-border color indicators:

| Value | Border Color |
|-------|-------------|
| ≥ 80% | Green (`border-green-500`) |
| 60%–79% | Amber (`border-amber-500`) |
| < 60% | Red (`border-red-500`) |

### Warnings

#### Small Sample Warning (< 3 evaluations)

When `total_evaluations < 3`:
- Cohen's κ label shows "(limited data)" suffix
- κ value shows asterisk (`*`) suffix
- Warning banner displayed:
  > "Cohen's kappa with fewer than 3 evaluations shows simple agreement rate instead of statistical kappa. Get more annotation data for reliable inter-rater agreement metrics."

**Rationale**: With fewer than 3 data points, kappa is statistically unreliable and may produce misleading values.

#### Missing Ratings Warning

When `total_evaluations_all > total_evaluations` (some evaluations had invalid judge responses):
- Total count shows `valid / total`
- Warning banner displayed with count of missing evaluations
- Explains that invalid responses (e.g., binary judge returning 3.0) are excluded from metrics

### Data Model

```
JudgePerformanceMetrics:
  - prompt_id: string               # ID of the evaluated prompt version
  - correlation: float               # Cohen's Kappa (0.0–1.0)
  - accuracy: float                  # Exact match rate (0.0–1.0)
  - mean_absolute_error: float       # Deprecated (always 0.0)
  - agreement_by_rating: Dict[str, float]  # Per-rating accuracy {"1": 0.8, ...}
  - confusion_matrix: List[List[int]]      # 5×5 matrix
  - total_evaluations: int           # Count of valid evaluations
```

### Computation Flow

```
1. Evaluation completes (POST /evaluate-judge or /evaluate-judge-direct)
2. Backend collects List[JudgeEvaluation] with human_rating and predicted_rating
3. Filter to evaluations with valid ratings only
4. Calculate: cohen_kappa_score(human_ratings, predicted_ratings)
5. Calculate: accuracy_score(human_ratings, predicted_ratings)
6. Calculate: per-rating accuracy for each rating level 1–5
7. Calculate: confusion_matrix with labels [1, 2, 3, 4, 5]
8. Return JudgePerformanceMetrics to frontend
9. Frontend renders metrics panel with color-coded values and warnings
```

### Binary Scale Adaptation

For binary judges (0/1 scale), the same metrics computation applies but:
- Ratings are `0` (Fail) and `1` (Pass) instead of 1–5
- Agreement by Rating shows only keys `"0"` and `"1"` with values
- Confusion matrix is effectively 2×2 (other entries are zero)
- The 1★–5★ pills may show 0% for unused rating levels

### Persistence

Metrics are persisted in two ways:
1. **Backend**: Stored via `POST /workshops/{workshop_id}/evaluation-metrics` for the active prompt version
2. **Frontend**: Cached in `localStorage` with 24-hour TTL for session continuity

Metrics are re-fetched on page load if a prior evaluation exists for the current prompt.

### Success Criteria

- [ ] Metrics panel displays only after evaluation has been run
- [ ] Cohen's κ computed via `sklearn.metrics.cohen_kappa_score`
- [ ] κ falls back to simple agreement ratio when NaN or exception
- [ ] Accuracy computed as exact match rate
- [ ] Agreement by Rating shows per-level accuracy for each rating 1–5
- [ ] Confusion matrix computed with labels [1, 2, 3, 4, 5]
- [ ] Color thresholds: green ≥ 80%, amber 60–79%, red < 60%
- [ ] Small sample warning shown when total_evaluations < 3
- [ ] Missing ratings warning shown when some evaluations have invalid judge responses
- [ ] Total count displays `valid / total` when missing ratings exist
- [ ] Metrics persisted to backend for the active prompt version
- [ ] Binary judges produce valid metrics with 0/1 scale
- [ ] Panel hidden when no evaluation has been run


### Run Alignment

```
POST /workshops/{workshop_id}/judges/{judge_id}/align
{
  "trace_ids": ["trace-1", "trace-2", ...]  // Traces with human feedback
}

Response:
{
  "job_id": "uuid",
  "status": "running"
}
```


## UI Components

### Judge Tuning Page

**File**: `client/src/pages/JudgeTuningPage.tsx`

Features:
- Mode indicator (Demo, Simple, MLflow)
- Prompt editor
- Evaluation results table with pagination
- Alignment trigger and status

### Mode Indicator

| Mode | Description |
|------|-------------|
| Demo | Mock evaluations (no model call) |
| Simple | Direct model endpoint call |
| MLflow | Full MLflow GenAI integration |

## Success Criteria

### Judge Evaluation
- [ ] Likert judges return values 1-5
- [ ] Binary judges return values 0 or 1
- [ ] Fallback conversion handles Likert-style returns for binary
- [ ] Evaluation results persisted to database
- [ ] Results reload correctly in UI

### Auto-Evaluation
- [ ] Auto-evaluation runs in background when annotation phase starts
- [ ] Judge prompt auto-derived from rubric questions
- [ ] Per-question judge_type parsed from rubric (`[JUDGE_TYPE:xxx]`)
- [ ] Binary rubrics evaluated with 0/1 scale (not 1-5)
- [ ] Auto-evaluation model stored for re-evaluation consistency
- [ ] Results appear in Judge Tuning page

### Re-Evaluation
- [ ] Re-evaluate loads registered judge with aligned instructions
- [ ] Uses same model as initial auto-evaluation
- [ ] Spinner stops when re-evaluation completes
- [ ] Results stored against correct prompt version
- [ ] Pre-align and post-align scores directly comparable

### Alignment
- [ ] Alignment jobs run asynchronously
- [ ] MemAlign distills semantic memory (guidelines)
- [ ] Aligned judge registered to MLflow
- [ ] Metrics reported (guideline count, example count)
- [ ] Works for both Likert and Binary scales


## Troubleshooting

### Binary Judge Returns Likert Values

Check that:
1. Binary prefix prepended to prompt
2. `feedback_value_type=float` (not bool)
3. Fallback conversion enabled



### Alignment Fails

Check that:
- Traces have 'align' tag in MLflow
- Human feedback exists for selected traces
- Model endpoint accessible

### Auto-Evaluation Not Starting

Check that:
1. MLflow configuration is set up (Databricks host, token)
2. Rubric exists for the workshop
3. Auto-evaluation toggle is enabled
4. Model is selected in dropdown

### Re-Evaluation Shows Wrong Scores

Check that:
1. Evaluations are stored against correct prompt version
2. Re-evaluate uses `tag_type='eval'` (same traces as initial evaluation)
3. Prompt version displayed matches expected version

### Guideline Distillation Fails

Databricks models may not support the JSON schema format required for guideline distillation. Options:
1. Use OpenAI model (gpt-4o-mini) for `reflection_lm`
2. Alignment will still work using episodic memory only
3. Set `OPENAI_API_KEY` environment variable for automatic fallback
