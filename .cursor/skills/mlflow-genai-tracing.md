# MLflow GenAI Tracing Skill

Guide to MLflow's tracing (observability) capabilities for debugging and monitoring GenAI applications.

**Reference**: [https://mlflow.org/docs/latest/genai/](https://mlflow.org/docs/latest/genai/)

## What MLflow Tracing Captures

- **Prompts**: Input prompts sent to models
- **Responses**: Model outputs
- **Tool calls**: Function/tool invocations
- **Retrievals**: RAG context fetches
- **Timing**: Latency and performance data
- **Metadata**: Tags, parameters, session info

## Enabling Tracing

### Autologging (Recommended)

```python
import mlflow

# Choose based on your framework/provider
mlflow.openai.autolog()         # OpenAI
mlflow.anthropic.autolog()      # Anthropic/Claude
mlflow.langchain.autolog()      # LangChain
mlflow.transformers.autolog()   # HuggingFace

# Set experiment for organization
mlflow.set_experiment("my_genai_app")
```

### Manual Tracing

```python
import mlflow

# Decorator
@mlflow.trace
def my_function(prompt: str) -> str:
    return call_llm(prompt)

# With custom name and type
@mlflow.trace(name="custom_name", span_type="LLM")
def custom_function(input_data):
    pass

# Context manager
with mlflow.start_span(name="my_operation") as span:
    span.set_attribute("doc_count", 10)
    result = process()
```

## Searching Traces

### Basic Search

```python
import mlflow

traces_df = mlflow.search_traces(
    experiment_ids=["123456789"],
)
```

### With Filters

```python
# Tag filters
traces_df = mlflow.search_traces(
    experiment_ids=[exp_id],
    filter_string="tags.environment = 'production'",
    max_results=100,
)

# Multiple conditions
filter_string = "tags.env = 'prod' AND attributes.status = 'OK'"
```

### DataFrame Columns

```python
# Common columns in traces_df:
# - trace_id: Unique identifier
# - client_request_id: Client-provided ID
# - state: Trace state (OK, ERROR)
# - request_time: Start timestamp
# - execution_duration: Duration in ms
# - request: Input data
# - response: Output data
# - tags: User-defined tags
# - spans: List of span data
```

## Fetching Full Trace Data

```python
import mlflow

trace = mlflow.get_trace(trace_id)

# Access data
inputs = trace.data.request
outputs = trace.data.response
spans = trace.data.spans

# Access metadata
print(trace.info.trace_id)
print(trace.info.experiment_id)
print(trace.info.timestamp_ms)
print(trace.info.execution_time_ms)
print(trace.info.status)
```

## Tagging Traces

### During Execution

```python
import mlflow

mlflow.update_current_trace(
    tags={
        "user_id": "user_123",
        "environment": "production",
        "evaluation_set": "batch_1",
    }
)
```

### After Execution

```python
mlflow.set_trace_tag(trace_id, "reviewed", "true")
```

## Using Tags for Evaluation Workflows

```python
# Tag traces for later evaluation
def process_request(request):
    response = generate(request)
    mlflow.update_current_trace(
        tags={"pending_evaluation": "true"}
    )
    return response

# Later: find traces to evaluate
eval_traces = mlflow.search_traces(
    experiment_ids=[exp_id],
    filter_string="tags.pending_evaluation = 'true'",
)
```

## Performance Analysis

```python
def analyze_latency(trace_id):
    """Analyze latency breakdown for a trace."""
    trace = mlflow.get_trace(trace_id)
    total_ms = trace.info.execution_time_ms
    
    span_times = {}
    for span in trace.data.spans:
        duration_ms = (span.end_time_ns - span.start_time_ns) / 1_000_000
        span_times[span.name] = duration_ms
    
    print(f"Total: {total_ms}ms")
    for name, duration in sorted(span_times.items(), key=lambda x: -x[1]):
        pct = (duration / total_ms) * 100
        print(f"  {name}: {duration:.1f}ms ({pct:.1f}%)")
```

## OpenTelemetry Compatibility

MLflow Tracing is fully OpenTelemetry compatible:

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from mlflow.tracing.export.otel import MlflowSpanExporter

# Configure OTel with MLflow exporter
provider = TracerProvider()
provider.add_span_processor(
    BatchSpanProcessor(MlflowSpanExporter())
)
trace.set_tracer_provider(provider)
```

## Best Practices

1. **Use meaningful experiment names** - Organize traces by project/feature
2. **Tag traces consistently** - Standard tag names across your app
3. **Include request IDs** - Link traces to your app's request tracking
4. **Sample in production** - Don't trace every request in high-volume systems

```python
import random

SAMPLE_RATE = 0.1  # 10%

def should_trace():
    return random.random() < SAMPLE_RATE
```
