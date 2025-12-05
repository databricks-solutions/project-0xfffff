# Trace Data Viewer Component

A comprehensive component for displaying trace data with JSON results as formatted tables, SQL queries with proper formatting, and export capabilities.

## 🎯 **What It Does**

The `TraceDataViewer` component automatically:
- **Parses JSON output** from traces and converts it to readable tables
- **Formats SQL queries** with proper line breaks and syntax highlighting
- **Provides export options** (CSV for data, .sql for queries)
- **Offers copy/paste functionality** for all content
- **Handles different data structures** gracefully

## 📊 **Features**

### **Data Display**
- **Smart Table Generation**: Automatically creates tables from JSON `result` arrays
- **Column Headers**: Converts snake_case to Title Case for readability
- **Row Count Display**: Shows total rows and columns
- **Responsive Design**: Tables adapt to different screen sizes

### **SQL Query Handling**
- **Automatic Formatting**: Adds line breaks for SQL keywords (SELECT, FROM, WHERE, etc.)
- **Monospace Font**: Uses proper font for SQL readability
- **Download Support**: Save queries as .sql files
- **Copy to Clipboard**: Easy copying of formatted queries

### **Export Capabilities**
- **CSV Export**: Download table data as CSV files
- **SQL Export**: Download queries as .sql files
- **Proper Escaping**: Handles commas and quotes in CSV data
- **File Naming**: Uses trace ID for unique filenames

### **User Experience**
- **Tabbed Interface**: Switch between table view and raw JSON
- **Expandable Sections**: Show/hide context and details
- **Copy Buttons**: One-click copying of any content
- **Visual Feedback**: Clear indicators for actions

## 🚀 **Usage**

### **Basic Usage**
```tsx
import { TraceDataViewer } from '@/components/TraceDataViewer';

<TraceDataViewer 
  trace={traceData} 
  className="your-custom-classes"
/>
```

### **With Context Display**
```tsx
<TraceDataViewer 
  trace={traceData} 
  showContext={true}
  className="shadow-lg"
/>
```

### **Trace Data Structure**
The component expects trace data with this structure:
```tsx
interface TraceData {
  id: string;
  input: string;        // JSON string or object
  output: string;       // JSON string or object
  context?: any;        // Optional context data
  mlflow_trace_id?: string; // Optional MLflow ID
}
```

### **Expected Output Format**
The component works best with output in this format:
```json
{
  "result": [
    {"column1": "value1", "column2": "value2"},
    {"column1": "value3", "column2": "value4"}
  ],
  "query_text": "SELECT column1 FROM table WHERE condition"
}
```

## 📋 **Props**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `trace` | `TraceData` | - | **Required**. The trace data to display |
| `className` | `string` | `''` | Additional CSS classes |
| `showContext` | `boolean` | `false` | Whether to show context section |

## 🎨 **Customization**

### **Styling**
The component uses Tailwind CSS and can be customized with:
- **Custom className**: Add your own CSS classes
- **Theme Integration**: Works with your existing UI theme
- **Responsive Design**: Automatically adapts to screen sizes

### **Data Handling**
- **Automatic Parsing**: Handles both string and object inputs
- **Error Handling**: Gracefully handles malformed JSON
- **Fallback Display**: Shows raw data if parsing fails

## 🔧 **Integration Examples**

### **In Workshop Pages**
```tsx
// Display trace data in discovery phase
{traces.map(trace => (
  <TraceDataViewer 
    key={trace.id}
    trace={trace}
    showContext={true}
  />
))}
```

### **In Evaluation Results**
```tsx
// Show trace content when evaluating
{expandedRowId === trace.id && (
  <TraceDataViewer 
    trace={trace}
    className="mt-4"
  />
)}
```

### **In Trace Review**
```tsx
// Full trace analysis view
<TraceDataViewer 
  trace={selectedTrace}
  showContext={true}
  className="w-full max-w-4xl mx-auto"
/>
```

## 📱 **Responsive Behavior**

- **Mobile**: Tables scroll horizontally, compact layout
- **Tablet**: Balanced spacing, readable text sizes
- **Desktop**: Full layout with optimal spacing

## ♿ **Accessibility**

- **Keyboard Navigation**: Full keyboard support
- **Screen Reader**: Proper ARIA labels and structure
- **Focus Management**: Clear focus indicators
- **Color Contrast**: Meets accessibility standards

## 🚨 **Error Handling**

The component gracefully handles:
- **Invalid JSON**: Shows error message with fallback
- **Missing Data**: Displays appropriate empty states
- **Malformed Structure**: Attempts to parse what it can
- **Network Issues**: Graceful degradation

## 🔄 **State Management**

- **Local State**: Component manages its own expansion state
- **No External Dependencies**: Self-contained functionality
- **Performance Optimized**: Uses useMemo for expensive operations
- **Memory Efficient**: Cleans up resources properly

## 📈 **Performance Considerations**

- **Lazy Parsing**: JSON parsing only when needed
- **Memoized Values**: Prevents unnecessary re-renders
- **Efficient Rendering**: Only renders visible content
- **Optimized Tables**: Handles large datasets efficiently

## 🧪 **Testing**

The component includes:
- **Demo Page**: `TraceDataViewerDemo.tsx` for testing
- **Sample Data**: Realistic trace examples
- **Edge Cases**: Handles various data formats
- **Error Scenarios**: Graceful failure modes

## 🔮 **Future Enhancements**

Potential improvements:
1. **Syntax Highlighting**: Better SQL formatting with syntax colors
2. **Data Visualization**: Charts and graphs for numerical data
3. **Search & Filter**: Find specific data in large tables
4. **Bulk Operations**: Select and export multiple traces
5. **Real-time Updates**: Live data refresh capabilities

## 📚 **Related Components**

- **Pagination**: For handling large datasets
- **Table**: Base table component used internally
- **Card**: Layout wrapper component
- **Button**: Action buttons for interactions

## 🎯 **Use Cases**

### **Workshop Participants**
- View trace results in organized tables
- Copy data for further analysis
- Download results as CSV files
- Examine SQL queries for learning

### **Facilitators**
- Review trace outputs easily
- Export data for external analysis
- Share SQL queries with participants
- Monitor trace quality and structure

### **Data Analysts**
- Analyze trace data structure
- Export data for external tools
- Review SQL query patterns
- Compare different trace outputs

This component makes trace data much more accessible and useful for workshop participants, transforming raw JSON into actionable insights!
