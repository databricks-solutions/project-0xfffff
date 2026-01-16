# Judge Evaluation Specification

## Overview

This specification defines the LLM judge evaluation system for the Human Evaluation Workshop, including judge creation, evaluation execution, alignment optimization, and inter-rater reliability (IRR) measurement. The system integrates with [MLflow GenAI](https://mlflow.org/docs/latest/genai/) for judge execution and alignment.

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

## Alignment (SIMBA Optimizer)

### Purpose

Align LLM judge outputs with human annotations using the SIMBA optimization algorithm.

### Flow

```
1. Collect human annotations on traces
2. Mark traces for alignment (include_in_alignment tag)
3. Run alignment optimizer
4. Generate optimized judge prompt
5. Evaluate with optimized judge
```

### Alignment API

```python
from mlflow.genai import align

alignment_result = align(
    judge=current_judge,
    traces=traces_with_feedback,
    optimizer=SIMBAAlignmentOptimizer(),
)

optimized_judge = alignment_result.judge
```

### Scale-Specific Optimizers

| Scale | Optimizer |
|-------|-----------|
| Likert (1-5) | `LikertSIMBAAlignmentOptimizer` |
| Binary (0/1) | `SIMBAAlignmentOptimizer` (default) |

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

### Alignment
- [ ] Alignment jobs run asynchronously
- [ ] Optimized prompt saved to judge
- [ ] Alignment metrics reported
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
- Traces have `include_in_alignment` tag
- Human feedback exists for selected traces
- Model endpoint accessible
