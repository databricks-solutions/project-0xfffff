# MLflow GenAI Skill

Comprehensive guide for working with MLflow GenAI - an open-source platform for building, evaluating, and monitoring GenAI applications.

**Official Documentation:** [https://mlflow.org/docs/latest/genai/](https://mlflow.org/docs/latest/genai/)

## Overview

MLflow GenAI provides:
- **Tracing (Observability)**: Capture execution details including prompts, retrievals, tool calls, and responses
- **Evaluation & Monitoring**: LLM-as-a-judge metrics for systematic quality assessment
- **Prompt Management**: Version, compare, and iterate on prompt templates
- **AI Gateway**: Unified interface to multiple model providers

## Installation

```bash
# Basic installation
pip install mlflow

# With Databricks integration (recommended)
pip install --upgrade "mlflow[databricks]>=3.5"
```

## Core APIs

### 1. Tracing (Observability)

```python
import mlflow

# Enable autologging for various frameworks
mlflow.openai.autolog()      # OpenAI
mlflow.anthropic.autolog()   # Anthropic/Claude
mlflow.langchain.autolog()   # LangChain

# Set experiment
mlflow.set_experiment("my_genai_app")

# Manual tracing with decorator
@mlflow.trace
def my_llm_function(prompt: str) -> str:
    return call_llm(prompt)

# Context manager tracing
with mlflow.start_span(name="my_operation") as span:
    span.set_attribute("custom_attr", "value")
    result = process_data()
```

### 2. Searching Traces

```python
import mlflow

# Search traces by experiment
traces_df = mlflow.search_traces(
    experiment_ids=["123456789"],
    filter_string="tags.environment = 'production'",
    max_results=100,
)

# Get full trace data
trace = mlflow.get_trace(trace_id)
inputs = trace.data.request
outputs = trace.data.response
```

### 3. Creating Custom Judges

```python
from mlflow.genai.judges import make_judge

judge = make_judge(
    name="my_judge",
    instructions="Evaluate the response quality...",
    feedback_value_type=float,  # float, bool, or str
    model="databricks:/databricks-meta-llama-3-1-70b-instruct",
)
```

### 4. Running Evaluations

```python
from mlflow.genai.evaluate import evaluate
import pandas as pd

# Prepare data (must have 'inputs' and 'outputs' columns)
eval_df = pd.DataFrame({
    'trace_id': [...],
    'inputs': [...],
    'outputs': [...],
})

# Run evaluation
results = evaluate(
    data=eval_df,
    scorers=[judge1, judge2],
)

# Access results
result_df = results.result_df
# Columns: trace_id, {judge_name}/value, etc.
```

## Judge Types

### Binary Judges (Pass/Fail - 0 or 1)

```python
binary_judge = make_judge(
    name="quality_check",
    instructions="""
## CRITICAL OUTPUT FORMAT
You MUST output EXACTLY "0" or "1":
- 0 = FAIL (does not meet criteria)
- 1 = PASS (meets criteria)

Your first line must be exactly 0 or 1, then reasoning.
""",
    feedback_value_type=float,  # Use float for 0/1, more reliable than bool
    model=model_uri,
)
```

### Likert Scale Judges (1-5 rating)

```python
likert_judge = make_judge(
    name="helpfulness",
    instructions="""
Rate on a scale of 1-5:
1 = Very Poor
2 = Poor
3 = Average
4 = Good
5 = Excellent

Return the number (1-5) on the first line, then reasoning.
""",
    feedback_value_type=float,
    model=model_uri,
)
```

## Model URI Formats

```python
# Databricks-hosted models
"databricks:/databricks-meta-llama-3-1-70b-instruct"
"databricks:/databricks-gpt-4"

# Databricks custom endpoints
"databricks:/endpoints/my-endpoint"

# OpenAI
"openai:/gpt-4"

# Anthropic
"anthropic:/claude-3-opus"
```

## Common Issues & Solutions

### Issue: Binary judge returns float (e.g., 3.0) instead of 0/1

**Cause**: `feedback_value_type` only affects parsing, not model output. The model is ignoring binary instructions.

**Solutions**:
1. **Prepend strong instructions** at the start of the prompt (models pay more attention to the beginning)
2. **Use `feedback_value_type=float`** instead of `bool` - more reliable
3. **Add fallback validation** to convert Likert-style responses to binary

```python
# Strong binary instructions (prepend to prompt)
binary_prefix = """## CRITICAL OUTPUT FORMAT
You are a BINARY judge. Output EXACTLY "0" or "1":
- 0 = FAIL
- 1 = PASS
NO OTHER VALUES ARE VALID. Do NOT use 2, 3, 4, or 5.
"""

# Fallback conversion for Likert responses
def convert_to_binary(value):
    if value in (0, 0.0, 1, 1.0):
        return float(value)
    if 1 <= value <= 5:
        # Threshold conversion: >= 3 = PASS, < 3 = FAIL
        return 1.0 if value >= 3 else 0.0
    return None
```

### Issue: Missing inputs/outputs in evaluation data

**Solution**: Fetch full trace data:
```python
for trace_id in trace_ids:
    trace = mlflow.get_trace(trace_id)
    inputs = trace.data.request
    outputs = trace.data.response
```

### Issue: No reasoning column in results

Check these possible column names:
- `{judge_name}/value`
- `{judge_name}/reasoning`
- `{judge_name}/explanation`

## Prompt Management

```python
import mlflow

# Register a prompt
mlflow.register_prompt(
    name="my_prompt",
    template="Context: {context}\nQuestion: {question}",
)

# Load a registered prompt
prompt = mlflow.load_prompt("my_prompt", version=1)
```

## Best Practices

1. **Always validate judge outputs** - Models don't always follow format instructions
2. **Use explicit, strong prompt instructions** - Especially at the start of prompts
3. **Test judges on sample data first** - Before running batch evaluations
4. **Use float for binary judges** - More reliable than bool
5. **Add fallback conversion logic** - Handle unexpected model outputs gracefully
