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
└── integration/
    └── ...
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
    baseURL: 'http://localhost:8000',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
  },
});
```

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
- [ ] E2E tests pass for critical flows
- [ ] Tests run in CI on every PR
- [ ] Coverage reports generated and accessible
- [ ] No flaky tests (consistent pass/fail)
- [ ] Test isolation (no shared state between tests)
