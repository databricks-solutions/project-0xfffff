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

## Inter-Rater Reliability (IRR)

### Metrics

| Metric | Use Case | Range |
|--------|----------|-------|
| **Krippendorff's Alpha** | Multiple raters, any scale | -1 to 1 |
| **Cohen's Kappa** | Two raters, categorical | -1 to 1 |

### Interpretation

| Value | Interpretation |
|-------|----------------|
| < 0 | Less than chance agreement |
| 0.0 - 0.20 | Slight agreement |
| 0.21 - 0.40 | Fair agreement |
| 0.41 - 0.60 | Moderate agreement |
| 0.61 - 0.80 | Substantial agreement |
| 0.81 - 1.00 | Almost perfect agreement |

### Calculation

```python
from server.services.krippendorff_alpha import calculate_krippendorff_alpha
from server.services.cohens_kappa import calculate_cohens_kappa

# Krippendorff's Alpha (multiple raters)
alpha = calculate_krippendorff_alpha(
    annotations=all_annotations,
    scale='ordinal'  # or 'nominal' for binary
)

# Cohen's Kappa (two raters)
kappa = calculate_cohens_kappa(
    rater1_annotations=user_a_annotations,
    rater2_annotations=user_b_annotations
)
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

### Calculate IRR

```
GET /workshops/{workshop_id}/irr

Response:
{
  "krippendorff_alpha": 0.72,
  "cohens_kappa": {
    "user_a_vs_user_b": 0.68,
    "user_a_vs_user_c": 0.71
  },
  "annotation_count": 150,
  "annotator_count": 3
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
- IRR display

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

### IRR
- [ ] Krippendorff's Alpha calculated correctly
- [ ] Cohen's Kappa calculated for rater pairs
- [ ] Handles edge cases (no variation, single rater)
- [ ] Updates when new annotations added

## Troubleshooting

### Binary Judge Returns Likert Values

Check that:
1. Binary prefix prepended to prompt
2. `feedback_value_type=float` (not bool)
3. Fallback conversion enabled

### IRR Shows NaN

Causes:
- Only one rater
- No overlapping traces between raters
- All ratings identical (no variation)

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
