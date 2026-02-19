# Testing Specification

## Overview

This specification defines the testing strategy for the Human Evaluation Workshop, covering server-side unit tests (pytest), client-side unit tests (Vitest + React Testing Library), and end-to-end tests (Playwright).

## Test Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Testing Pyramid                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                      ┌─────────┐                            │
│                      │   E2E   │  ← Playwright              │
│                      │  Tests  │    (slow, high confidence) │
│                      └────┬────┘                            │
│                   ┌───────┴───────┐                         │
│                   │  Integration  │  ← API tests            │
│                   │    Tests      │    (medium speed)       │
│                   └───────┬───────┘                         │
│            ┌──────────────┴──────────────┐                  │
│            │         Unit Tests          │  ← pytest/vitest │
│            │    (fast, isolated)         │                  │
│            └─────────────────────────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Server Tests (Python / pytest)

### Configuration

Tests configured in `pyproject.toml`:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
addopts = "--cov=server --cov-report=html --cov-report=xml"
```

### Commands

```bash
# Run unit tests
python3 -m pytest -q

# Run with coverage
python3 -m pytest

# Run specific test file
python3 -m pytest tests/unit/routers/test_users.py

# Run with verbose output
python3 -m pytest -v
```

### Test Structure

```
tests/
├── conftest.py                    # Shared fixtures
├── unit/
│   ├── routers/
│   │   ├── test_databricks.py
│   │   ├── test_dbsql_export.py
│   │   ├── test_users.py
│   │   └── test_workshops.py
│   └── services/
│       ├── test_alignment.py
│       ├── test_cohens_kappa.py
│       ├── test_irr.py
│       ├── test_krippendorff_alpha.py
│       └── test_token_storage.py
├── integration/
│   ├── conftest.py                    # Real DB fixtures (SQLite/Postgres)
│   ├── test_workshop_crud.py
│   ├── test_trace_ingestion.py
│   ├── test_phase_transitions.py
│   ├── test_annotation_submission.py
│   ├── test_discovery_findings.py
│   └── test_connection_resilience.py  # Postgres-only: pool reset, retry, OAuth refresh
└── contract/
    ├── conftest.py                    # MLflow mock fixtures
    └── test_mlflow_contracts.py       # Contract shape & call-site tests
```

### Database Isolation

FastAPI route tests use ASGI client with lifespan disabled and override `server.database.get_db`:

```python
# conftest.py
@pytest.fixture
def test_db():
    """Create isolated test database."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def client(test_db):
    """Create test client with overridden DB."""
    def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
```

### Coverage Output

- `htmlcov/` - HTML report (open `index.html` in browser)
- `coverage.xml` - XML report (for CI integration)

---

## Integration Tests (Python / pytest)

Integration tests exercise the full HTTP request → FastAPI routing → DatabaseService → real database cycle. Unlike unit tests (which mock `DatabaseService`), these catch real query bugs, unique-constraint enforcement, upsert semantics, and phase-transition state persistence.

### Architecture

    HTTP request (httpx AsyncClient)
         │
         ▼
    FastAPI router (real)
         │
         ▼
    DatabaseService (real)
         │
         ▼
    SQLAlchemy ORM → Real database (SQLite or Postgres)

**What's real:** Database, ORM models, DatabaseService, FastAPI routing, Pydantic validation.
**What's mocked:** MLflow/Databricks external calls only.

### Database Backends

| Mode | Backend | When to use |
|------|---------|-------------|
| Default | SQLite in-memory | Local dev, `just test-integration` |
| `--backend postgres` | Postgres via testcontainers | CI, or when testing Postgres-specific behavior |

Both backends use the same test suite. Backend-specific differences (e.g., locking semantics) are handled transparently by SQLAlchemy.

### Test Isolation

Tests use the **transaction-rollback** pattern:

1. **Session-scoped**: Engine created once, schema applied via `Base.metadata.create_all()` + runtime unique indexes.
2. **Per-test**: Each test runs inside a transaction that is rolled back after the test completes. No data leaks between tests.

### Commands

    # Run integration tests (SQLite, fast)
    just test-integration

    # Run integration tests against Postgres (requires Docker)
    just test-integration --backend postgres

    # Run integration tests for a specific spec
    just test-integration --spec ANNOTATION_SPEC

### Critical Workflows Tested

1. **Workshop CRUD** — Create workshop via POST, retrieve via GET, list with facilitator filter, 404 for missing workshops.
2. **Trace ingestion** — Bulk upload traces, retrieve via GET, verify metadata/context fields persist.
3. **Phase transitions** — intake → discovery (requires traces), discovery → annotation (requires rubric). Validates prerequisite enforcement returns HTTP 400.
4. **Annotation submission** — Create annotation, verify upsert semantics (same user+trace updates existing record), verify different users create separate records. Unique constraint `(user_id, trace_id)` enforced at DB level.
5. **Discovery findings** — Submit finding, verify upsert semantics (same user+trace updates), verify user-filtered retrieval.
6. **Connection resilience** (Postgres-only) — Verify `pool_pre_ping` detects stale connections, `_reset_connection_pool()` disposes engine + refreshes OAuth token, `get_db()` retries on transient connection failures with exponential backoff and gives up after 3 attempts.

### Success Criteria

- [ ] `tests/integration/conftest.py` provides real-DB fixtures with transaction rollback isolation
- [ ] Integration tests run against SQLite (default) and Postgres (via testcontainers)
- [ ] `just test-integration` recipe exists and passes
- [ ] Workshop CRUD tested end-to-end through HTTP → DB → response
- [ ] Trace ingestion tested: bulk upload, retrieval, metadata persistence
- [ ] Phase transition prerequisites enforced: no discovery without traces, no annotation without rubric
- [ ] Annotation upsert semantics verified: same user+trace updates (not duplicates), different users create separate records
- [ ] Discovery finding upsert semantics verified at DB level
- [ ] All integration tests tagged with `@pytest.mark.integration` and `@pytest.mark.spec()`
- [ ] External services (MLflow, Databricks) mocked — only database is real
- [ ] Connection resilience tested (Postgres-only): pool reset disposes + refreshes OAuth, `get_db()` retries with backoff, stale connections detected via `pool_pre_ping`
- [ ] Tests are hermetic: no shared state, runnable in any order

---

## Contract Tests (MLflow)

Contract tests verify that our code's assumptions about MLflow's API surface are correct — and that our test mocks faithfully represent real MLflow behavior. They sit between unit tests (where MLflow is mocked) and full integration (where we'd need a live MLflow server).

### Why Contract Tests

The application has a large MLflow integration surface spanning 5 service files. Unit tests mock these calls, but mocks can silently drift from reality. Contract tests define the expected request/response shapes and verify:
- **Consumer side**: Our code sends correct parameters and handles expected response shapes.
- **Provider side** (optional, CI-only): Real MLflow returns what we expect.

### Contract Boundaries

The MLflow contract is organized into 5 domains:

#### 1. Trace Operations

| Method | Parameters | Returns |
|--------|-----------|---------|
| `mlflow.search_traces` | `experiment_ids: List[str]`, `max_results: int`, `filter_string: str`, `return_type: 'list'\|'pandas'` | List of trace objects or DataFrame |
| `mlflow.get_trace` | `trace_id: str` (format: `tr-xxxxx`) | Single trace object |
| `mlflow.set_trace_tag` | `trace_id: str`, `key: str`, `value: str` | None (side effect) |

**Trace object shape:**
- `trace.info.request_id: str` — Trace ID
- `trace.info.status: str` — `"OK"`, `"FAILED"`, etc.
- `trace.info.execution_time_ms: int`
- `trace.info.timestamp_ms: int`
- `trace.info.tags: Dict[str, str]`
- `trace.info.assessments: List[Assessment]`
- `trace.data.request: str` — JSON string
- `trace.data.response: str` — JSON string
- `trace.data.spans: List[Span]` — with `name`, `span_type`, `inputs`, `outputs`

#### 2. Feedback & Assessment

| Method | Parameters | Returns |
|--------|-----------|---------|
| `mlflow.log_feedback` | `trace_id: str`, `name: str`, `value: int\|float`, `source: AssessmentSource`, `rationale: str` | None (side effect) |

**AssessmentSource shape:**
- `source_type: AssessmentSourceType.HUMAN \| AssessmentSourceType.AI_GENERATED`
- `source_id: str` — user ID (human) or `"llm_judge_{name}"` (AI)

**Constraints:**
- Max 50 assessments per trace (hard MLflow limit)
- Duplicate `(name, source_id)` pairs are skipped
- Binary judges use `float` values `0.0` or `1.0` (not bool)
- Likert judges use `float` values `1.0`–`5.0`

#### 3. Judge Evaluation

| Method | Parameters | Returns |
|--------|-----------|---------|
| `mlflow.genai.judges.make_judge` | `name: str`, `instructions: str`, `feedback_value_type: type`, `model: str` | Judge object |
| `mlflow.genai.evaluate` | `data: DataFrame` (columns: `inputs`, `outputs`), `scorers: List[Judge]` | Results with `result_df` |
| `mlflow.metrics.genai.make_genai_metric_from_prompt` | `name: str`, `judge_prompt: str`, `model: str`, `parameters: dict` | Metric object |

**Evaluate result shape:**
- `results.result_df["{judge_name}/value"]: float` — Numeric rating
- `results.result_df["{judge_name}/explanation"]: str` — Judge reasoning

**Prompt conventions:**
- Judge prompts use `{inputs}` and `{outputs}` placeholders (not `{input}`/`{output}`)
- Model URIs: `"databricks:/model-name"` or `"openai:/model-name"`

#### 4. Alignment (MemAlign)

| Method | Parameters | Returns |
|--------|-----------|---------|
| `mlflow.genai.judges.optimizers.MemAlignOptimizer` | `reflection_lm: str`, `retrieval_k: int`, `embedding_model: str` | Optimizer object |
| `judge.align` | `traces: List[Trace]`, `optimizer: Optimizer` | Aligned judge (enhanced `.instructions`) |
| `aligned_judge.register` | `experiment_id: str`, `name: str` | None (side effect) |
| `aligned_judge.update` | `experiment_id: str`, `name: str`, `sampling_config: ScorerSamplingConfig` | None (side effect) |
| `mlflow.genai.scorers.get_scorer` | `name: str`, `experiment_id: str` | Registered judge or None |
| `mlflow.genai.scorers.ScorerSamplingConfig` | `sample_rate: float` (0.0–1.0) | Config object |

**Alignment constraints:**
- Reflection LM needs JSON schema support (OpenAI/Claude preferred)
- Semantic memory (distilled guidelines) persisted in `.instructions`
- Episodic memory (examples) NOT persisted by MLflow

#### 5. Experiment & Run Management

| Method | Parameters | Returns |
|--------|-----------|---------|
| `mlflow.set_tracking_uri` | `"databricks"` | None |
| `mlflow.set_experiment` | `experiment_id: str` | None |
| `mlflow.get_experiment` | `experiment_id: str` | Experiment object (`name`, `experiment_id`, `lifecycle_stage`) |
| `mlflow.get_experiment_by_name` | `name: str` | Experiment object or None |
| `mlflow.create_experiment` | `name: str` | Experiment ID string |
| `mlflow.start_run` / `mlflow.end_run` | `run_name: str` / (none) | Run context / None |
| `mlflow.log_param` | `key: str`, `value: Any` | None |
| `mlflow.log_text` | `text: str`, `artifact_file: str` | None |

### Error Handling Contract

The app classifies MLflow errors into retryable vs non-retryable:

**Non-retryable** (immediate failure):
- `"maximum allowed assessments"` — Hit 50-assessment limit per trace
- `"not found"` / HTTP 404 — Resource doesn't exist
- `"unauthorized"` / HTTP 401/403 — Auth failure

**Retryable** (exponential backoff: 1s, 2s, 4s, max 3 retries):
- Transient network errors
- Rate limiting
- Temporary unavailability

### Test Approach

Contract tests verify our mock fidelity and call-site correctness:

1. **Mock shape tests**: Verify that test mocks (used in unit/integration tests) match the documented contract shapes above.
2. **Call-site tests**: Verify our service code calls MLflow with correct parameter types and handles all documented response shapes.
3. **Error classification tests**: Verify the retry logic correctly classifies errors as retryable vs non-retryable.

### Success Criteria

- [ ] Contract shapes documented for all 5 MLflow domains (trace ops, feedback, evaluation, alignment, experiment management)
- [ ] Mock shape tests verify test mocks match real MLflow response structures
- [ ] Call-site tests verify services pass correct parameter types to MLflow methods
- [ ] Error classification tested: retryable vs non-retryable errors handled correctly
- [ ] Feedback value types validated: binary (0.0/1.0 float), likert (1.0-5.0 float)
- [ ] Assessment limit (50 per trace) handling tested
- [ ] Contract tests tagged with `@pytest.mark.spec("TESTING_SPEC")`

---

## Client Tests (React / Vitest + RTL)

### Configuration

Tests configured in `client/vite.config.ts`:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
```

### Commands

```bash
# Run unit tests
npm -C client run test:unit

# Run with coverage
npm -C client run test:unit:coverage

# Run in watch mode
npm -C client run test:unit -- --watch
```

### Test Structure

```
client/
├── src/
│   ├── components/
│   │   └── __tests__/
│   │       └── Component.test.tsx
│   ├── hooks/
│   │   └── __tests__/
│   │       └── useHook.test.ts
│   └── utils/
│       └── __tests__/
│           └── util.test.ts
└── tests/
    └── e2e/                      # Playwright tests
```

### Testing Patterns

**Component Testing**:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

**Hook Testing**:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useCounter } from '../useCounter';

describe('useCounter', () => {
  it('increments counter', () => {
    const { result } = renderHook(() => useCounter());

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });
});
```

---

## End-to-End Tests (Playwright)

### Configuration

**File**: `client/playwright.config.ts`

```typescript
export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
  },
});
```

> **Port selection**: `just e2e` auto-detects available ports (starting from 8000/3000) and passes them via `E2E_API_URL` and `PLAYWRIGHT_BASE_URL`. The Vite dev server reads `E2E_API_URL` for its proxy target so the UI always proxies to the correct API port.

### Commands

```bash
# Run E2E tests (headless)
just e2e

# Run with browser visible
just e2e headed

# Run with Playwright UI
just e2e ui

# Run specific test file
npx playwright test tests/e2e/rubric-creation.spec.ts
```

### Test Scenarios

| Test File | Coverage |
|-----------|----------|
| `rubric-creation.spec.ts` | Rubric creation flow |
| `workshop-flow.spec.ts` | Workshop management flow |

### E2E Test Pattern

```typescript
import { test, expect } from '@playwright/test';

test.describe('Rubric Creation', () => {
  test('creates a new rubric', async ({ page }) => {
    await page.goto('/workshop/create-rubric');

    // Fill form
    await page.fill('[name="title"]', 'Test Question');
    await page.fill('[name="description"]', 'Test description');

    // Submit
    await page.click('button[type="submit"]');

    // Verify
    await expect(page.locator('.success-message')).toBeVisible();
  });
});
```

---

## Justfile Commands

```bash
# All tests
just test             # Run all tests

# Server tests
just test-server      # Run Python tests

# Client tests
just test-client      # Run React tests

# E2E tests
just e2e              # Headless
just e2e headed       # With browser
just e2e ui           # Playwright UI
```

---

## Coverage Strategy

### Ratchet Approach

1. **Start with reporting only** (no gating) while suite is young
2. **Add low floor** (10-20%) once suite is stable
3. **Raise gradually** (+5% per week or per module)
4. **Enforce per-package first** (server vs client)
5. **Then per-directory** (e.g., `server/services/`, `client/src/utils/`)
6. **Finally repo-wide threshold**

### Coverage Targets (Recommended)

| Package | Initial | Target |
|---------|---------|--------|
| `server/services/` | 20% | 60% |
| `server/routers/` | 20% | 50% |
| `client/src/utils/` | 30% | 70% |
| `client/src/hooks/` | 20% | 50% |
| `client/src/components/` | 10% | 40% |

---

## Test Data & Fixtures

### Server Fixtures (`tests/conftest.py`)

```python
@pytest.fixture
def sample_user(test_db):
    """Create sample user for tests."""
    user = User(
        id=str(uuid.uuid4()),
        name="Test User",
        email="test@example.com"
    )
    test_db.add(user)
    test_db.commit()
    return user

@pytest.fixture
def sample_workshop(test_db, sample_user):
    """Create sample workshop for tests."""
    workshop = Workshop(
        id=str(uuid.uuid4()),
        name="Test Workshop",
        created_by=sample_user.id
    )
    test_db.add(workshop)
    test_db.commit()
    return workshop
```

### Client Fixtures

```typescript
// test/fixtures.ts
export const mockUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
};

export const mockWorkshop = {
  id: 'workshop-123',
  name: 'Test Workshop',
  phase: 'discovery',
};
```

---

## CI Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  server-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install uv && uv sync
      - run: python -m pytest

  client-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm -C client ci
      - run: npm -C client run test:unit:coverage

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx playwright install --with-deps
      - run: npm -C client run test:e2e
```

---

## Success Criteria

- [ ] Server unit tests pass with >20% coverage
- [ ] Client unit tests pass with >20% coverage
- [ ] Integration tests pass against real database (SQLite + Postgres)
- [ ] Contract tests verify MLflow integration boundaries
- [ ] E2E tests pass for critical flows
- [ ] Tests run in CI on every PR
- [ ] Coverage reports generated and accessible
- [ ] No flaky tests (consistent pass/fail)
- [ ] Test isolation (no shared state between tests)
- [ ] `just test-integration` recipe works
- [ ] `just test-contract` recipe works
