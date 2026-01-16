# UI Components Specification

## Overview

This specification defines reusable UI components in the Human Evaluation Workshop, including the pagination system, trace data viewer, and common interaction patterns. These components follow consistent design principles and accessibility standards.

## Pagination Component

### Purpose

Provides efficient navigation through large datasets with configurable page sizes, keyboard shortcuts, and quick jump functionality.

### Features

| Feature | Description |
|---------|-------------|
| Page Navigation | First, previous, next, last page buttons |
| Page Numbers | Smart display with ellipsis for large datasets |
| Items Per Page | Configurable (10, 25, 50, 100) |
| Quick Jump | Direct input to jump to specific page |
| Keyboard Shortcuts | Arrow keys, Home/End |
| Page Info | Shows current range and total items |

### Props

```typescript
interface PaginationProps {
  currentPage: number;              // 1-based current page
  totalPages: number;               // Total number of pages
  totalItems: number;               // Total items across all pages
  itemsPerPage: number;             // Items per page
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (size: number) => void;
  showItemsPerPageSelector?: boolean;  // Default: false
  showQuickJump?: boolean;             // Default: false
  showKeyboardShortcuts?: boolean;     // Default: false
  className?: string;
}
```

### Keyboard Shortcuts

When `showKeyboardShortcuts` is enabled:

| Key | Action |
|-----|--------|
| `←` | Previous page |
| `→` | Next page |
| `Home` | First page |
| `End` | Last page |

**Note**: Shortcuts disabled when focus is in input fields.

### Usage Example

```tsx
<Pagination
  currentPage={currentPage}
  totalPages={Math.ceil(items.length / itemsPerPage)}
  totalItems={items.length}
  itemsPerPage={itemsPerPage}
  onPageChange={setCurrentPage}
  onItemsPerPageChange={(size) => {
    setItemsPerPage(size);
    setCurrentPage(1);  // Reset to first page
  }}
  showItemsPerPageSelector={true}
  showQuickJump={true}
  showKeyboardShortcuts={true}
/>
```

### Auto-Reset Behavior

The pagination resets automatically in these scenarios:
- When data changes: Reset to page 1
- When items per page changes: Reset to page 1
- When page changes: Collapse expanded rows

### State Management

```typescript
const [currentPage, setCurrentPage] = useState(1);
const [itemsPerPage, setItemsPerPage] = useState(10);

// Calculate pagination
const startIndex = (currentPage - 1) * itemsPerPage;
const endIndex = startIndex + itemsPerPage;
const paginatedItems = items.slice(startIndex, endIndex);
```

---

## Trace Data Viewer Component

### Purpose

Displays MLflow trace data with automatic JSON parsing, table generation, SQL formatting, and export capabilities.

### Features

| Feature | Description |
|---------|-------------|
| Smart Tables | Auto-generates tables from JSON arrays |
| SQL Formatting | Line breaks for SQL keywords |
| CSV Export | Download table data as CSV |
| SQL Export | Download queries as .sql files |
| Copy to Clipboard | One-click copying |
| Tabbed Interface | Switch between table and raw JSON |

### Props

```typescript
interface TraceDataViewerProps {
  trace: TraceData;
  className?: string;
  showContext?: boolean;  // Default: false
}

interface TraceData {
  id: string;
  input: string | object;   // JSON string or parsed object
  output: string | object;  // JSON string or parsed object
  context?: any;
  mlflow_trace_id?: string;
}
```

### Expected Output Format

The component works best with this output structure:

```json
{
  "result": [
    {"column1": "value1", "column2": "value2"},
    {"column1": "value3", "column2": "value4"}
  ],
  "query_text": "SELECT column1 FROM table WHERE condition"
}
```

### Data Display Behavior

| Data Type | Display |
|-----------|---------|
| JSON array with objects | Auto-generated table |
| SQL query string | Formatted with line breaks |
| Primitive values | Displayed as-is |
| Invalid JSON | Error message + raw fallback |

### SQL Formatting

SQL keywords trigger line breaks:

```sql
-- Input
SELECT a, b FROM table WHERE x = 1 AND y = 2 ORDER BY a

-- Output (formatted)
SELECT a, b
FROM table
WHERE x = 1
AND y = 2
ORDER BY a
```

### Export Formats

| Format | File Extension | Content |
|--------|---------------|---------|
| CSV | `.csv` | Table data with proper escaping |
| SQL | `.sql` | Formatted query text |
| JSON | `.json` | Raw trace data |

### Usage Example

```tsx
<TraceDataViewer
  trace={{
    id: "trace-123",
    input: '{"query": "What is X?"}',
    output: '{"result": [...], "query_text": "SELECT ..."}',
    context: { source: "mlflow" }
  }}
  showContext={true}
  className="shadow-lg"
/>
```

---

## Common Interaction Patterns

### Toast Notifications

Use `sonner` for consistent toast notifications:

```typescript
import { toast } from 'sonner';

// Success
toast.success('Action completed');

// Error
toast.error('Something went wrong');

// Promise-based (for async operations)
toast.promise(asyncOperation(), {
  loading: 'Processing...',
  success: 'Done!',
  error: 'Failed',
});
```

### Loading States

```tsx
// Full page loading
{isLoading && <LoadingSpinner />}

// Button loading
<Button disabled={isLoading}>
  {isLoading ? 'Saving...' : 'Save'}
</Button>

// Skeleton loading
{isLoading ? <Skeleton /> : <Content />}
```

### Error States

```tsx
{error && (
  <Alert variant="destructive">
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
  </Alert>
)}
```

### Empty States

```tsx
{items.length === 0 && (
  <EmptyState
    title="No items found"
    description="Add your first item to get started"
    action={<Button>Add Item</Button>}
  />
)}
```

---

## Accessibility Requirements

### Keyboard Navigation

- All interactive elements focusable via Tab
- Enter/Space activate buttons
- Escape closes modals/dropdowns
- Arrow keys navigate lists

### ARIA Labels

```tsx
<Button aria-label="Go to next page">
  <ChevronRight />
</Button>

<Input
  aria-label="Jump to page"
  aria-describedby="page-range-hint"
/>
```

### Focus Management

- Focus trapped in modals
- Focus returns to trigger on modal close
- Visible focus indicators

### Color Contrast

- All text meets WCAG AA contrast ratios
- Don't rely solely on color for information
- Icons paired with text labels where possible

---

## Performance Considerations

### Pagination

- Only render visible items (slice array)
- Use efficient page number generation
- Clean up keyboard event listeners

### Trace Data Viewer

- Lazy parse JSON only when needed
- Memoize expensive table generation
- Limit initial render for large datasets

### General

```typescript
// Memoize expensive calculations
const tableData = useMemo(() =>
  parseTraceOutput(trace.output),
  [trace.output]
);

// Debounce frequent updates
const debouncedSearch = useDebouncedCallback(
  (value) => setSearchTerm(value),
  300
);
```

---

## File Locations

| Component | Path |
|-----------|------|
| Pagination | `client/src/components/Pagination.tsx` |
| TraceDataViewer | `client/src/components/TraceDataViewer.tsx` |
| Button | `client/src/components/ui/button.tsx` |
| Input | `client/src/components/ui/input.tsx` |
| Table | `client/src/components/ui/table.tsx` |
| Card | `client/src/components/ui/card.tsx` |

---

## Success Criteria

### Pagination
- [ ] Page navigation works correctly (first, prev, next, last)
- [ ] Items per page selector updates page size
- [ ] Quick jump navigates to valid pages
- [ ] Keyboard shortcuts work when enabled
- [ ] Disabled states shown for unavailable actions
- [ ] Page info accurately reflects data

### Trace Data Viewer
- [ ] JSON arrays render as tables
- [ ] SQL queries formatted with line breaks
- [ ] CSV export includes all table data
- [ ] Copy to clipboard works for all content
- [ ] Invalid JSON shows error + fallback
- [ ] Responsive layout on different screens

### Accessibility
- [ ] Keyboard navigation works throughout
- [ ] Screen reader announces state changes
- [ ] Focus visible and managed correctly
- [ ] Color contrast meets WCAG AA
