# Prompt Optimization Specification (GEPA)

## Overview

This specification defines the GEPA (Guided Evolutionary Prompt Augmentation) prompt optimization system for the Human Evaluation Workshop. GEPA iteratively improves an agent's system prompt by using human evaluation feedback as training data and aligned judges as scorers via `mlflow.genai.optimize_prompts()`.

## MLflow Integration Context

### Position in Workshop Pipeline

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Annotation   │    │   Judge      │    │   Prompt     │    │  Improved    │
│   Phase       │───▶│   Tuning     │───▶│  Optimization│───▶│  Agent       │
│  (Human SMEs) │    │  (Alignment) │    │  (GEPA)      │    │  Prompt      │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
  Collect ratings     Align judge(s)      Optimize prompt     Deploy via UC
  & annotations       to human scores     using judges         prompt alias
```

GEPA requires:
1. **Human annotations** — training data from the annotation phase
2. **Aligned judges** — scorers created during judge tuning/alignment
3. **Agent prompt** — the system prompt to optimize (entered directly or loaded from MLflow)

### MLflow API Dependencies

| API | Usage |
|-----|-------|
| `mlflow.genai.register_prompt()` | Register user-entered prompt to MLflow/UC |
| `mlflow.genai.load_prompt()` | Load prompt for GEPA interception |
| `mlflow.genai.optimize_prompts()` | Core GEPA optimization call |
| `mlflow.genai.set_prompt_alias()` | Set "champion" alias on optimized version |
| `mlflow.genai.scorers.get_scorer()` | Load aligned judge as scorer |
| `mlflow.search_traces()` | Find annotated traces for training data |

## Core Concepts

### GEPA Optimizer
- Uses `GepaPromptOptimizer` from `mlflow.genai.optimize`
- Evolutionary approach: generates candidate prompts, evaluates them, selects best
- Configurable iterations (1-10) and candidates per iteration (2-20)
- `reflection_model` parameter controls which LLM generates candidate prompts
- `max_metric_calls` = iterations x candidates x max(dataset_size, 5)

### Prompt Input Modes
Two ways to provide the agent prompt:
1. **Direct text entry** — paste prompt text, optionally register to UC (catalog.schema.name)
2. **MLflow URI** — load existing registered prompt (e.g., `prompts:/main.my_schema.agent_prompt/1`)

### Training Data
Built from human-annotated traces:
- Primary: traces tagged `tags.annotation_status = 'align'`
- Fallback: traces tagged `tags.label = 'eval'`
- Format: `{"inputs": {"request": user_message}, "outputs": agent_response}`
- User messages extracted from trace request (handles JSON `messages` array or plain text)

### Score Normalization
Judges return different scales. The `aggregation_fn` normalizes to 0-1 for GEPA:

| Judge Scale | Raw Range | Normalization |
|-------------|-----------|---------------|
| Binary | 0 or 1 | As-is (already 0-1) |
| Likert | 1-5 | Divide by 5.0 |
| Percentage | >5 | Divide by 100.0 |

When multiple judges are used, scores are averaged across all judges to produce a composite score.

## Data Model

### PromptOptimizationRun (Database)

```sql
CREATE TABLE prompt_optimization_runs (
  id VARCHAR PRIMARY KEY,
  workshop_id VARCHAR NOT NULL REFERENCES workshops(id),
  job_id VARCHAR NOT NULL,
  prompt_uri VARCHAR NOT NULL,
  original_prompt TEXT,
  optimized_prompt TEXT,
  optimized_version INTEGER,
  optimized_uri VARCHAR,
  optimizer_model VARCHAR,
  num_iterations INTEGER,
  num_candidates INTEGER,
  target_endpoint VARCHAR,
  metrics TEXT,               -- JSON: {original_length, optimized_length, num_iterations, num_candidates, train_data_size, initial_score?, final_score?}
  status VARCHAR DEFAULT 'pending',  -- pending | running | completed | failed
  error TEXT,
  created_at DATETIME,
  updated_at DATETIME
);
```

### PromptOptimizationRequest (API)

```python
class PromptOptimizationRequest(BaseModel):
  prompt_text: Optional[str]         # Direct prompt text (alternative to URI)
  prompt_uri: Optional[str]          # MLflow prompt URI (alternative to text)
  prompt_name: Optional[str]         # Name for UC registration
  uc_catalog: Optional[str]          # Unity Catalog catalog
  uc_schema: Optional[str]           # Unity Catalog schema
  optimizer_model_name: str          # Default: 'databricks-claude-sonnet-4-5'
  num_iterations: int                # 1-10, default: 3
  num_candidates: int                # 2-20, default: 5
  judge_name: Optional[str]          # Fallback judge name
  target_endpoint: Optional[str]     # Custom serving endpoint
```

### Metrics Dict

```json
{
  "original_length": 500,
  "optimized_length": 720,
  "num_iterations": 3,
  "num_candidates": 5,
  "train_data_size": 10,
  "initial_score": 0.680,
  "final_score": 0.800
}
```

## API Endpoints

### Start Optimization

```
POST /workshops/{workshop_id}/start-prompt-optimization
```

Request: `PromptOptimizationRequest` body

Response:
```json
{
  "job_id": "uuid",
  "status": "running"
}
```

Behavior:
1. Validates prompt input (text or URI required)
2. Loads MLflow config and Databricks token
3. Discovers aligned judges from rubric questions
4. Creates DB record and in-memory job
5. Spawns background thread for optimization
6. Returns job_id immediately for polling

### Poll Job Status

```
GET /workshops/{workshop_id}/prompt-optimization-job/{job_id}?since_log_index={n}
```

Response:
```json
{
  "status": "running|completed|failed",
  "logs": ["log line 1", "log line 2"],
  "log_count": 42,
  "result": { ... },
  "error": "..."
}
```

- `since_log_index` enables incremental log fetching (only new logs since last poll)
- Frontend polls every 2 seconds while job is running

### Get History

```
GET /workshops/{workshop_id}/prompt-optimization-history
```

Response: Array of `PromptOptimizationRun` objects, newest first.

## Optimization Pipeline

### Step-by-Step Flow

```
1. Setup MLflow environment
   |-- Set DATABRICKS_HOST, TOKEN (or OAuth)
   +-- Set experiment ID

2. Load/register prompt
   |-- Direct text -> mlflow.genai.register_prompt() -> get URI
   +-- MLflow URI -> mlflow.genai.load_prompt()

3. Build training data
   |-- Search traces: tags.annotation_status='align'
   |-- Fallback: tags.label='eval'
   +-- Extract request/response pairs

4. Load aligned judges as scorers
   |-- Get judge names from rubric questions
   +-- mlflow.genai.scorers.get_scorer() for each

5. Create GEPA optimizer
   +-- GepaPromptOptimizer(reflection_model=model_uri)

6. Define predict_fn
   |-- load_prompt() (GEPA intercepts to swap candidates)
   |-- format() triggers GEPA interception
   +-- Call model (OpenAI client or custom endpoint)

7. Define aggregation_fn
   +-- Normalize judge scores to 0-1 range

8. Run mlflow.genai.optimize_prompts()
   |-- Yields log messages during execution
   +-- Returns PromptOptimizationResult

9. Extract result
   |-- Get optimized prompt text from result
   |-- Register if GEPA didn't auto-register
   +-- Set "champion" alias

10. Return final result dict with metrics
```

### predict_fn Behavior

The predict function is called by GEPA for each (candidate_prompt, training_example) pair:

1. `mlflow.genai.load_prompt(uri)` — GEPA intercepts this to substitute candidate prompts
2. `prompt.format()` — triggers GEPA's prompt interception
3. Build messages: `[{role: "system", content: candidate_prompt}, {role: "user", content: request}]`
4. Route to model:
   - **Custom endpoint**: auto-detect chat vs agent format (try `messages` key, fall back to `input` key)
   - **Default**: Databricks OpenAI client `chat.completions.create()`

### Custom Endpoint Auto-Detection

When a target endpoint is provided, the system auto-detects the request format:

| Format | Request Shape | Response Shape |
|--------|--------------|----------------|
| Chat (`messages`) | `{"messages": [...], "max_tokens": 1024}` | `{"choices": [{"message": {"content": "..."}}]}` |
| Agent (`input`) | `{"input": [...], "context": {}}` | `{"output": [{"type": "message", "content": [...]}]}` |

Detection is cached after the first successful call.

### Log Capture

Three-layer log capture ensures all GEPA/DSPy output reaches the frontend:

1. **Python logging handler** — captures `mlflow.genai`, `gepa`, `dspy` loggers
2. **stdout capture** — DSPy prints iteration scores directly to stdout
3. **stderr capture** — catches any error output

Important: stdout/stderr capture must be installed BEFORE importing DSPy, which caches `sys.stdout` at import time.

## Frontend

### File: `client/src/pages/PromptOptimizationPage.tsx`

### State Management

| State | Purpose |
|-------|---------|
| `promptInputMode` | 'text' or 'uri' toggle |
| `promptText` / `promptUri` | User input |
| `ucCatalog`, `ucSchema`, `promptName` | UC registration fields |
| `optimizerModel` | Selected model (display name) |
| `numIterations`, `numCandidates` | GEPA parameters |
| `targetEndpoint` | Optional custom endpoint |
| `jobId`, `jobStatus` | Current job tracking |
| `jobLogs` | Log lines for display |
| `jobResult` | Final optimization result |
| `history` | Past optimization runs |

### Configuration Persistence

All configuration fields are persisted to `localStorage` under key `prompt-opt-config-{workshopId}`:
- Saves on every change via `useEffect`
- Restored on mount
- Survives page navigation (not just refresh)

### Auto-Reconnect

When the page mounts with existing history:
1. Prefer running job; fall back to most recent completed/failed
2. Restore configuration from the history entry
3. Fetch all logs from job store (`since_log_index=0`)
4. Resume polling if job is still running

### Score Improvement Display

Two sources for score data (prioritized):
1. **metrics.initial_score / metrics.final_score** — from backend result
2. **Log parsing fallback** — regex match on `Score improvement: X.XXX -> Y.YYY` in log text

Displayed as:
```
Score  0.680  ->  0.800  +12.0%
```

### Log Viewer

- Dark terminal-style panel (`bg-gray-900`)
- Color-coded log lines (errors=red, warnings=yellow, sections=violet, iterations=amber, etc.)
- Auto-scrolls to bottom on new logs
- Copy and Download buttons for full log text
- Polling indicator shows entry count and refresh interval

### Access Control

- Only facilitators can configure and run optimization
- Non-facilitators see a waiting card

## Success Criteria

- [ ] Users can enter prompt text directly or load from MLflow URI
- [ ] Prompts are registered to Unity Catalog when catalog/schema provided
- [ ] Training data correctly built from annotated traces
- [ ] All aligned judges loaded as scorers (one per rubric question)
- [ ] GEPA optimization runs with real-time log streaming
- [ ] Score improvement (initial -> final) displayed in results
- [ ] Optimized prompt registered with "champion" alias
- [ ] Configuration persists across page navigation
- [ ] Auto-reconnect to running job after navigation
- [ ] Optimization history with expandable run details
- [ ] Custom endpoint support with auto-format detection

## Testing Scenarios

### Test 1: Direct Prompt Entry
1. Enter agent system prompt text
2. Set UC catalog and schema
3. Start optimization
4. Verify prompt registered to MLflow
5. Verify optimization completes with score improvement

### Test 2: MLflow URI Load
1. Enter existing prompt URI
2. Start optimization
3. Verify prompt loaded correctly
4. Verify optimized version saved

### Test 3: Auto-Reconnect
1. Start optimization
2. Navigate away from page
3. Navigate back
4. Verify job state restored (logs, status, config)

### Test 4: Custom Endpoint
1. Enter serving endpoint name
2. Start optimization
3. Verify format auto-detection (chat vs agent)
4. Verify evaluation completes

### Test 5: Score Display Fallback
1. Complete optimization
2. Verify scores shown from metrics
3. For older runs without metrics, verify log parsing fallback
