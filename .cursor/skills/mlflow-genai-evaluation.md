# MLflow GenAI Evaluation Skill

Deep-dive into MLflow's evaluation capabilities for systematically assessing GenAI application quality.

**Reference**: [https://mlflow.org/docs/latest/genai/](https://mlflow.org/docs/latest/genai/)

## Evaluation Architecture

```
eval_df (DataFrame)           Scorers (Judges)           result_df (DataFrame)
├── trace_id            →     ├── Pre-built         →    ├── trace_id
├── inputs (required)         └── Custom (make_judge)    ├── {judge}/value
└── outputs (required)                                   └── {judge}/reasoning
```

## Creating Custom Judges with make_judge

### Function Signature

```python
from mlflow.genai.judges import make_judge

judge = make_judge(
    name: str,                    # Unique identifier
    instructions: str,            # Evaluation criteria + format instructions
    feedback_value_type: type,    # float, bool, or str
    model: str,                   # Model URI
    parameters: dict = None,      # Optional model parameters
)
```

### feedback_value_type Options

| Type | Use Case | Notes |
|------|----------|-------|
| `float` | Numeric scores (0/1 or 1-5) | **Recommended** - most reliable |
| `bool` | True/False | Less reliable, often returns float anyway |
| `str` | Categorical labels | For non-numeric judgments |

**Important**: `feedback_value_type` only affects parsing. The model must still be instructed to output the correct format.

## Binary Evaluation Pattern (0/1)

### Robust Binary Judge

```python
def create_binary_judge(name: str, criteria: str, model: str):
    """Create a binary judge with explicit 0/1 instructions."""
    
    instructions = f"""## CRITICAL OUTPUT FORMAT REQUIREMENT
You are a BINARY judge. Output EXACTLY one value:
- "0" if the response FAILS to meet criteria
- "1" if the response PASSES and meets criteria

YOUR FIRST LINE MUST BE EXACTLY "0" OR "1".
Do NOT use 2, 3, 4, or 5. This is PASS/FAIL only.

After the rating, provide reasoning on subsequent lines.

Example outputs:
---
0
The response does not address the question.
---
1
The response correctly answers the question.
---

EVALUATION CRITERIA:
{criteria}

Now evaluate:
"""
    
    return make_judge(
        name=name,
        instructions=instructions,
        feedback_value_type=float,  # Use float, not bool
        model=model,
    )
```

### Validating Binary Results

```python
def validate_binary(value):
    """Convert various formats to binary 0/1."""
    if value is None:
        return None
    
    # Already valid binary
    if value in (0, 0.0, 1, 1.0):
        return float(value)
    
    # Boolean
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    
    # String
    if isinstance(value, str):
        upper = value.upper().strip()
        if upper in ('0', 'FAIL', 'FALSE', 'NO'):
            return 0.0
        if upper in ('1', 'PASS', 'TRUE', 'YES'):
            return 1.0
    
    # Likert-style fallback (threshold conversion)
    if isinstance(value, (int, float)) and 1 <= value <= 5:
        return 1.0 if value >= 3 else 0.0
    
    return None  # Invalid
```

## Likert Scale Evaluation Pattern (1-5)

### 5-Point Likert Judge

```python
def create_likert_judge(name: str, criteria: str, model: str):
    """Create a Likert scale (1-5) judge."""
    
    instructions = f"""Rate on a scale of 1-5:
1 = Very Poor - Completely fails
2 = Poor - Mostly fails
3 = Average - Partially meets criteria
4 = Good - Mostly meets criteria
5 = Excellent - Fully meets criteria

OUTPUT FORMAT:
RATING: [1-5]
REASONING: [explanation]

CRITERIA:
{criteria}
"""
    
    return make_judge(
        name=name,
        instructions=instructions,
        feedback_value_type=float,
        model=model,
    )
```

### Validating Likert Results

```python
def validate_likert(value):
    """Validate and clamp Likert values to 1-5."""
    if value is None:
        return None
    try:
        num = float(value)
        return max(1.0, min(5.0, num))  # Clamp to range
    except (ValueError, TypeError):
        return None
```

## Preparing Evaluation Data

### From MLflow Traces

```python
import mlflow
import pandas as pd

def prepare_eval_data(experiment_id: str, tag_filter: str = None):
    """Prepare evaluation DataFrame from traces."""
    
    filter_str = f"tags.{tag_filter}" if tag_filter else None
    
    traces_df = mlflow.search_traces(
        experiment_ids=[experiment_id],
        filter_string=filter_str,
    )
    
    inputs_list = []
    outputs_list = []
    
    for trace_id in traces_df['trace_id']:
        try:
            trace = mlflow.get_trace(trace_id)
            inputs_list.append(trace.data.request)
            outputs_list.append(trace.data.response)
        except Exception:
            inputs_list.append(None)
            outputs_list.append(None)
    
    traces_df['inputs'] = inputs_list
    traces_df['outputs'] = outputs_list
    
    # Filter out missing data
    return traces_df[
        traces_df['inputs'].notna() & 
        traces_df['outputs'].notna()
    ][['trace_id', 'inputs', 'outputs']]
```

## Running Evaluations

```python
from mlflow.genai.evaluate import evaluate

# Single judge
results = evaluate(data=eval_df, scorers=[judge])

# Multiple judges
results = evaluate(
    data=eval_df,
    scorers=[helpfulness_judge, accuracy_judge, safety_judge],
)

# Access results
result_df = results.result_df
print(result_df.columns)
# ['trace_id', 'helpfulness/value', 'accuracy/value', 'safety/value', ...]
```

## Metrics Calculation

### Binary Metrics

```python
def calc_binary_metrics(evaluations):
    valid = [e for e in evaluations if e.get('rating') is not None]
    if not valid:
        return {'pass_rate': None}
    
    passes = sum(1 for e in valid if e['rating'] == 1.0)
    return {
        'pass_rate': passes / len(valid),
        'pass_count': passes,
        'fail_count': len(valid) - passes,
        'total': len(valid),
    }
```

### Likert Metrics

```python
import statistics

def calc_likert_metrics(evaluations):
    ratings = [e['rating'] for e in evaluations if e.get('rating')]
    if not ratings:
        return {'mean': None}
    
    return {
        'mean': statistics.mean(ratings),
        'median': statistics.median(ratings),
        'std_dev': statistics.stdev(ratings) if len(ratings) > 1 else 0,
    }
```

## Error Handling

```python
def safe_evaluate(eval_df, scorers, max_retries=2):
    """Run evaluation with error handling."""
    for attempt in range(max_retries + 1):
        try:
            results = evaluate(data=eval_df, scorers=scorers)
            if results.result_df is not None:
                return results
        except Exception as e:
            if attempt < max_retries:
                print(f"Retry {attempt + 1}: {e}")
                continue
            raise
    raise RuntimeError("Evaluation failed")
```

## This Project's Implementation

The evaluation logic is in `server/services/alignment_service.py`:

- `run_evaluation_with_answer_sheet()` - Main evaluation function
- `get_judge_type_from_rubric()` - Detects binary vs likert from rubric
- Binary prompt enhancement at lines 807-840
- Binary validation and fallback conversion at lines 982-1160
