# Mocking Guide

## Testing Philosophy

Design tests around a **controlled boundary**:
- **Mock/virtualize** external services for most tests (fast, deterministic)
- **Live checks** run separately (nightly/pre-release) to detect breaking changes

Separate two concerns:
1. "Do my flows work with *any* conforming provider?" → Mock tests
2. "Is *this* provider currently behaving correctly?" → Live/contract tests

## Test Layers

```
┌─────────────────────────────────────────────────────────┐
│  E2E Tests (Playwright)                                 │
│  - Mock ALL backend responses                           │
│  - Tests frontend flows work correctly                  │
├─────────────────────────────────────────────────────────┤
│  Backend Integration Tests (pytest)                     │
│  - Mock external services (MLflow, Databricks)          │
│  - Test API routes with real DB (SQLite in-memory)      │
├─────────────────────────────────────────────────────────┤
│  Contract Tests (pytest)                                │
│  - Validate request/response shapes match MLflow API    │
│  - Use recorded responses or OpenAPI schemas            │
├─────────────────────────────────────────────────────────┤
│  Live Checks (separate pipeline)                        │
│  - Minimal calls to real MLflow                         │
│  - Run nightly or pre-release                           │
└─────────────────────────────────────────────────────────┘
```

---

## E2E Mocking (Frontend)

Location: `client/tests/lib/mocks/api-mocker.ts`

### How It Works

The `ApiMocker` intercepts all API routes via Playwright's `page.route()`. Mock data comes from the `TestScenario` builder.

### Pre-Mocked Endpoints

| Pattern | Behavior |
|---------|----------|
| `/users/**` | User CRUD, auth, permissions |
| `/workshops/**` | Workshop, traces, rubric, findings, annotations |
| `/workshops/:id/advance-to-*` | Phase transitions |

### Adding New Endpoint Mocks

```typescript
// In api-mocker.ts setupRoutes()
this.routes.push({
  pattern: /\/workshops\/([a-f0-9-]+)\/your-endpoint$/i,
  get: async (route) => {
    await route.fulfill({ json: this.store.yourData });
  },
});
```

### Opting Into Real Calls

```typescript
.withReal('/users/auth/login')   // Single endpoint
.withReal('WorkshopsService')    // All workshop routes
.withRealApi()                   // No mocking at all
```

---

## Backend Mocking (Python)

### MLflow Integration

The `MLflowIntakeService` calls `mlflow.search_traces()` directly. To test:

#### Option 1: Patch at the mlflow module level

```python
# tests/unit/services/test_mlflow_intake.py
from unittest.mock import patch, MagicMock
from server.services.mlflow_intake_service import MLflowIntakeService

@patch('server.services.mlflow_intake_service.mlflow')
def test_search_traces(mock_mlflow):
    # Create mock trace objects matching MLflow's structure
    mock_trace = MagicMock()
    mock_trace.info.request_id = "trace-123"
    mock_trace.info.status = "OK"
    mock_trace.info.execution_time_ms = 150
    mock_trace.info.timestamp_ms = 1234567890000
    mock_trace.info.tags = {"env": "test"}
    mock_trace.data.request = '{"query": "test"}'
    mock_trace.data.response = '{"answer": "result"}'

    mock_mlflow.search_traces.return_value = [mock_trace]

    service = MLflowIntakeService(db_service=MagicMock())
    config = MLflowIntakeConfig(
        databricks_host="https://test.databricks.com",
        databricks_token="test-token",
        experiment_id="123"
    )

    results = service.search_traces(config)

    assert len(results) == 1
    assert results[0].trace_id == "trace-123"
```

#### Option 2: Dependency injection (recommended for new code)

```python
# Refactored service with injectable client
class MLflowIntakeService:
    def __init__(self, db_service: DatabaseService, mlflow_client=None):
        self.db_service = db_service
        self._mlflow = mlflow_client or mlflow  # Injectable

    def search_traces(self, config):
        traces = self._mlflow.search_traces(...)
        # ...
```

```python
# Test with injected mock
def test_search_traces():
    mock_client = MagicMock()
    mock_client.search_traces.return_value = [create_mock_trace()]

    service = MLflowIntakeService(
        db_service=MagicMock(),
        mlflow_client=mock_client
    )
    results = service.search_traces(config)
    # ...
```

### Databricks Service

```python
@patch('server.services.databricks_service.OpenAI')
def test_databricks_call(mock_openai_class):
    mock_client = MagicMock()
    mock_openai_class.return_value = mock_client
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="response"))]
    )

    service = DatabricksService(
        workspace_url="https://test.databricks.com",
        token="test-token"
    )
    # Test the service...
```

---

## Contract Testing

Validate that your code handles MLflow's actual response shapes:

```python
# tests/contract/test_mlflow_contract.py
import json
from pathlib import Path

# Load recorded response (capture from real MLflow once)
FIXTURES_DIR = Path(__file__).parent / "fixtures"

def load_fixture(name: str):
    return json.loads((FIXTURES_DIR / f"{name}.json").read_text())

def test_trace_parsing_matches_contract():
    """Verify our parsing works with real MLflow response structure."""
    recorded_response = load_fixture("mlflow_search_traces_response")

    # Parse using the same logic as production
    parsed = parse_mlflow_traces(recorded_response)

    # Assert expected fields are present and typed correctly
    assert all(t.trace_id for t in parsed)
    assert all(isinstance(t.timestamp_ms, int) for t in parsed)
```

### Recording Fixtures

```python
# One-time script to capture real responses
def record_mlflow_response():
    mlflow.set_tracking_uri("databricks")
    traces = mlflow.search_traces(experiment_ids=["123"], max_results=5)

    # Serialize to JSON fixture
    fixture = [trace_to_dict(t) for t in traces]
    Path("fixtures/mlflow_search_traces_response.json").write_text(
        json.dumps(fixture, indent=2)
    )
```

---

## Live Checks (Separate Pipeline)

Run against real MLflow to detect API changes:

```python
# tests/live/test_mlflow_live.py
import pytest
import os

pytestmark = pytest.mark.skipif(
    not os.getenv("RUN_LIVE_TESTS"),
    reason="Live tests disabled (set RUN_LIVE_TESTS=1)"
)

def test_mlflow_connection():
    """Verify we can connect to real MLflow."""
    mlflow.set_tracking_uri("databricks")
    experiments = mlflow.search_experiments(max_results=1)
    assert experiments is not None

def test_trace_search_basic():
    """Verify trace search returns expected structure."""
    traces = mlflow.search_traces(
        experiment_ids=[os.getenv("TEST_EXPERIMENT_ID")],
        max_results=1
    )
    if traces:
        assert hasattr(traces[0], 'info')
        assert hasattr(traces[0].info, 'request_id')
```

Run with: `RUN_LIVE_TESTS=1 pytest tests/live/ -v`

---

## Summary: What to Mock Where

| Test Type | Mock Strategy |
|-----------|---------------|
| E2E (Playwright) | Mock all backend responses in `api-mocker.ts` |
| Backend unit tests | Patch `mlflow` module or inject mock client |
| Backend integration | Real DB (SQLite), mock external APIs |
| Contract tests | Use recorded fixtures from real MLflow |
| Live checks | Real MLflow, run in separate pipeline |
