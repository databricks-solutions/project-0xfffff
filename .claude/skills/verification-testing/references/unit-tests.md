# Unit Test Patterns

## Python (pytest)

Location: `tests/unit/`

### Running Tests

```bash
just test-server           # Run all
just test-server -v        # Verbose
just test-server -k "test_name"  # Filter by name
```

### Test Structure

```
tests/
├── conftest.py              # Shared fixtures
├── unit/
│   ├── routers/
│   │   ├── test_databricks_router.py
│   │   ├── test_users_router.py
│   │   └── test_workshops_router.py
│   └── services/
│       ├── test_alignment_service.py
│       ├── test_irr_service.py
│       └── test_token_storage_service.py
└── integration/
    └── ...
```

### Database Isolation

```python
# conftest.py
@pytest.fixture
def test_db():
    """Create isolated in-memory SQLite database."""
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

### Router Testing

```python
def test_get_workshop(client, test_db):
    # Arrange: Create test data
    workshop = Workshop(id="ws-123", name="Test")
    test_db.add(workshop)
    test_db.commit()

    # Act
    response = client.get("/workshops/ws-123")

    # Assert
    assert response.status_code == 200
    assert response.json()["name"] == "Test"
```

### Service Testing with Mocks

```python
from unittest.mock import patch, MagicMock

@patch('server.services.mlflow_intake_service.mlflow')
def test_search_traces(mock_mlflow):
    mock_trace = MagicMock()
    mock_trace.info.request_id = "trace-123"
    mock_mlflow.search_traces.return_value = [mock_trace]

    service = MLflowIntakeService(db_service=MagicMock())
    results = service.search_traces(config)

    assert len(results) == 1
```

### Fixtures for Common Objects

```python
# conftest.py
@pytest.fixture
def sample_user(test_db):
    user = User(id=str(uuid.uuid4()), name="Test User", email="test@example.com")
    test_db.add(user)
    test_db.commit()
    return user

@pytest.fixture
def sample_workshop(test_db, sample_user):
    workshop = Workshop(
        id=str(uuid.uuid4()),
        name="Test Workshop",
        created_by=sample_user.id
    )
    test_db.add(workshop)
    test_db.commit()
    return workshop
```

---

## React (vitest + RTL)

Location: `client/src/**/__tests__/`

### Running Tests

```bash
just ui-test-unit                    # Run all
just ui-test-unit -- --watch         # Watch mode
npm -C client run test:unit:coverage # With coverage
```

### Test Structure

```
client/src/
├── components/
│   └── __tests__/
│       └── Button.test.tsx
├── hooks/
│   └── __tests__/
│       └── useCounter.test.ts
└── utils/
    └── __tests__/
        └── formatters.test.ts
```

### Component Testing

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

### Hook Testing

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

### Testing with Context Providers

```typescript
import { render } from '@testing-library/react';
import { UserProvider } from '../contexts/UserContext';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <UserProvider>
      {ui}
    </UserProvider>
  );
};

it('shows user name', () => {
  renderWithProviders(<UserProfile />);
  expect(screen.getByText('Test User')).toBeInTheDocument();
});
```

### Mocking API Calls

```typescript
import { vi } from 'vitest';
import * as api from '../api/client';

vi.mock('../api/client');

describe('WorkshopList', () => {
  it('fetches workshops on mount', async () => {
    const mockWorkshops = [{ id: '1', name: 'Test' }];
    vi.mocked(api.getWorkshops).mockResolvedValue(mockWorkshops);

    render(<WorkshopList />);

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });
});
```

### Testing Async Operations

```typescript
import { waitFor } from '@testing-library/react';

it('loads data asynchronously', async () => {
  render(<DataLoader />);

  // Wait for loading to finish
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  expect(screen.getByText('Data loaded')).toBeInTheDocument();
});
```

---

## Common Patterns

### AAA Pattern (Arrange, Act, Assert)

```python
def test_something():
    # Arrange - set up test data
    workshop = create_workshop()

    # Act - perform the action
    result = service.process(workshop)

    # Assert - verify the outcome
    assert result.status == "completed"
```

### Test Naming

```python
# Python: descriptive function names
def test_search_traces_returns_empty_list_when_no_traces():
    ...

def test_create_annotation_fails_with_invalid_rating():
    ...
```

```typescript
// TypeScript: describe/it blocks
describe('RubricEditor', () => {
  describe('when question is empty', () => {
    it('disables the save button', () => { ... });
    it('shows validation error', () => { ... });
  });
});
```

### Testing Error Cases

```python
def test_get_workshop_raises_404_for_missing_workshop(client):
    response = client.get("/workshops/nonexistent-id")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()
```

```typescript
it('shows error message on API failure', async () => {
  vi.mocked(api.getWorkshop).mockRejectedValue(new Error('Network error'));

  render(<WorkshopDetails id="123" />);

  await waitFor(() => {
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
```
