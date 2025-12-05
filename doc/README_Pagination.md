# Pagination Component

A comprehensive pagination component for the LLM Judge Calibration Workshop application that provides efficient navigation through large datasets.

## Features

### 🎯 **Core Pagination**
- **Page Navigation**: First, previous, next, and last page buttons
- **Page Numbers**: Smart display of page numbers with ellipsis for large datasets
- **Items Per Page**: Configurable items per page (10, 25, 50, 100)
- **Page Info**: Shows current range and total items

### 🚀 **Enhanced Navigation**
- **Quick Jump**: Direct input field to jump to any page
- **Keyboard Shortcuts**: 
  - `←` / `→` arrows for previous/next page
  - `Home` / `End` for first/last page
- **Visual Feedback**: Hover tooltips and disabled states

### 🎨 **Customization Options**
- **Items Per Page Selector**: Optional dropdown to change page size
- **Quick Jump Input**: Optional input field for direct page navigation
- **Keyboard Shortcuts**: Optional keyboard navigation support
- **Responsive Design**: Adapts to different screen sizes

## Usage

### Basic Pagination
```tsx
<Pagination
  currentPage={currentPage}
  totalPages={totalPages}
  totalItems={totalItems}
  itemsPerPage={itemsPerPage}
  onPageChange={setCurrentPage}
/>
```

### Full Featured Pagination
```tsx
<Pagination
  currentPage={currentPage}
  totalPages={Math.ceil(totalItems / itemsPerPage)}
  totalItems={totalItems}
  itemsPerPage={itemsPerPage}
  onPageChange={setCurrentPage}
  onItemsPerPageChange={(newSize) => {
    setItemsPerPage(newSize);
    setCurrentPage(1);
  }}
  showItemsPerPageSelector={true}
  showQuickJump={true}
  showKeyboardShortcuts={true}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentPage` | `number` | - | Current active page (1-based) |
| `totalPages` | `number` | - | Total number of pages |
| `totalItems` | `number` | - | Total number of items across all pages |
| `itemsPerPage` | `number` | - | Number of items per page |
| `onPageChange` | `(page: number) => void` | - | Callback when page changes |
| `onItemsPerPageChange` | `(size: number) => void` | - | Callback when items per page changes |
| `showItemsPerPageSelector` | `boolean` | `false` | Show items per page dropdown |
| `showQuickJump` | `boolean` | `false` | Show quick jump to page input |
| `showKeyboardShortcuts` | `boolean` | `false` | Enable keyboard navigation |
| `className` | `string` | `''` | Additional CSS classes |

## Keyboard Shortcuts

When `showKeyboardShortcuts` is enabled:

- **←** (Left Arrow): Go to previous page
- **→** (Right Arrow): Go to next page
- **Home**: Go to first page
- **End**: Go to last page

**Note**: Keyboard shortcuts are disabled when typing in input fields.

## Implementation in JudgeTuningPage

The pagination is integrated into the Evaluation Results table in the Judge Tuning page:

### State Management
```tsx
// Pagination state
const [currentPage, setCurrentPage] = useState(1);
const [itemsPerPage, setItemsPerPage] = useState(10);
```

### Data Slicing
```tsx
// Calculate pagination
const startIndex = (currentPage - 1) * itemsPerPage;
const endIndex = startIndex + itemsPerPage;
const paginatedTraces = traces.slice(startIndex, endIndex);
```

### Pagination Component
```tsx
<Pagination
  currentPage={currentPage}
  totalPages={Math.ceil(traces.length / itemsPerPage)}
  totalItems={traces.length}
  itemsPerPage={itemsPerPage}
  onPageChange={setCurrentPage}
  onItemsPerPageChange={(newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  }}
  showItemsPerPageSelector={true}
  showQuickJump={true}
  showKeyboardShortcuts={true}
/>
```

## Auto-Reset Behavior

The pagination automatically resets in certain scenarios:

1. **When traces change**: Resets to page 1 when new trace data is loaded
2. **When changing items per page**: Resets to page 1 when page size changes
3. **When changing pages**: Collapses any expanded trace rows for better UX

## Styling

The component uses Tailwind CSS classes and integrates with the existing UI components:

- **Buttons**: Uses the `Button` component with outline/default variants
- **Input**: Uses the `Input` component for the quick jump field
- **Colors**: Follows the application's color scheme (gray, blue, etc.)
- **Responsive**: Adapts layout for different screen sizes

## Accessibility

- **ARIA Labels**: Proper labeling for screen readers
- **Keyboard Navigation**: Full keyboard support
- **Focus Management**: Proper focus handling
- **Tooltips**: Helpful tooltips for navigation buttons

## Performance Considerations

- **Efficient Rendering**: Only renders visible page numbers
- **Smart Slicing**: Uses array slicing for pagination
- **State Optimization**: Minimal re-renders
- **Memory Management**: Cleans up event listeners

## Future Enhancements

Potential improvements for the pagination component:

1. **Virtual Scrolling**: For very large datasets
2. **URL Integration**: Sync pagination state with URL parameters
3. **Search Integration**: Combine with search/filter functionality
4. **Export Options**: Export current page or all data
5. **Bulk Actions**: Select items across pages for bulk operations
