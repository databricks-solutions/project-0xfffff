# Trace JSONPath Display Customization Spec

## Overview

This feature allows facilitators to optionally configure JSONPath queries to extract specific values from trace inputs and outputs for cleaner display in the TraceViewer. This helps when raw trace data contains complex JSON objects that are not readable for non-technical workshop participants.

**Key Principle**: This is an **opt-in** feature. When not configured, trace inputs/outputs display exactly as they do today.

---

## Core Concepts

### JSONPath Query
A JSONPath expression (e.g., `$.messages[0].content`, `$.response.text`) that extracts a specific value from a JSON object. Applied to the trace's `input` and/or `output` fields.

### Scope
- Configured **per workshop** by the facilitator
- Applied to **all traces** displayed in the TraceViewer for that workshop
- Stored in workshop settings

---

## User Stories

### Facilitator
1. As a facilitator, I want to configure optional JSONPath queries for input and output so that participants see clean, readable text instead of raw JSON.
2. As a facilitator, I want to preview my JSONPath queries against actual trace data before saving, so I can verify they extract the right content.
3. As a facilitator, I want to leave JSONPath fields empty to show the original trace data.

### Participant/SME
1. As a participant, I want to see clearly formatted input/output text without needing to understand JSON structure.

---

## Data Model

### Workshop Model Extension

Add two optional fields to the `Workshop` model:

```python
# server/models.py - Workshop model
class Workshop(BaseModel):
    # ... existing fields ...
    input_jsonpath: Optional[str] = None   # JSONPath query for input extraction
    output_jsonpath: Optional[str] = None  # JSONPath query for output extraction
```

### Database Migration

```sql
-- Alembic migration
ALTER TABLE workshops ADD COLUMN input_jsonpath TEXT;
ALTER TABLE workshops ADD COLUMN output_jsonpath TEXT;
```

---

## Behavior

### JSONPath Evaluation

When displaying a trace in TraceViewer:

1. **If JSONPath is configured (non-empty)**:
   - Parse the trace's input/output as JSON
   - Apply the JSONPath query
   - **If multiple values match**: Concatenate with newlines (`\n`)
   - **If query succeeds and returns non-empty/non-null**: Display extracted value(s)
   - **If query fails, returns empty string, or returns null**: Fall back to raw display

2. **If JSONPath is not configured (empty/null)**:
   - Display the raw input/output as today (unchanged behavior)

### Fallback Cases

The system falls back to displaying raw JSON when:
- JSONPath field is empty or null
- Input/output is not valid JSON
- JSONPath query syntax is invalid
- JSONPath query returns no matches
- JSONPath query returns `null`
- JSONPath query returns empty string `""`

### Multiple Matches Behavior

When a JSONPath query returns multiple values (e.g., `$.messages[*].content`):

```
Result 1
Result 2
Result 3
```

Values are joined with newline characters for readable display.

---

## UI Components

### Facilitator Settings Panel

Location: Existing facilitator settings (likely in FacilitatorDashboard or a settings modal)

```
+--------------------------------------------------+
| Trace Display Settings                            |
+--------------------------------------------------+
|                                                   |
| Input JSONPath (optional)                         |
| +----------------------------------------------+ |
| | $.messages[0].content                        | |
| +----------------------------------------------+ |
| Extract specific content from trace input JSON    |
|                                                   |
| Output JSONPath (optional)                        |
| +----------------------------------------------+ |
| | $.response.text                              | |
| +----------------------------------------------+ |
| Extract specific content from trace output JSON   |
|                                                   |
| +------------------+                              |
| |  Preview         |                              |
| +------------------+                              |
|                                                   |
+--------------------------------------------------+
```

### Preview Panel

When "Preview" is clicked, show extracted values using the **first trace** from the workshop's dataset:

```
+--------------------------------------------------+
| Preview (Trace: abc123...)                        |
+--------------------------------------------------+
|                                                   |
| Input Result:                                     |
| +----------------------------------------------+ |
| | "What is the capital of France?"             | |
| +----------------------------------------------+ |
|                                                   |
| Output Result:                                    |
| +----------------------------------------------+ |
| | "The capital of France is Paris."            | |
| +----------------------------------------------+ |
|                                                   |
+--------------------------------------------------+
```

If extraction fails:
```
| Input Result:                                     |
| +----------------------------------------------+ |
| | (Showing original - JSONPath returned empty) | |
| | {"messages": [...], "metadata": {...}}       | |
| +----------------------------------------------+ |
```

---

## API Endpoints

### Update Workshop JSONPath Settings

```
PUT /workshops/{workshop_id}/jsonpath-settings
```

Request body:
```json
{
  "input_jsonpath": "$.messages[0].content",
  "output_jsonpath": "$.response.text"
}
```

Response: Updated `Workshop` object

### Preview JSONPath

```
POST /workshops/{workshop_id}/preview-jsonpath
```

Request body:
```json
{
  "input_jsonpath": "$.messages[0].content",
  "output_jsonpath": "$.response.text"
}
```

Response:
```json
{
  "trace_id": "abc123...",
  "input_result": "What is the capital of France?",
  "input_success": true,
  "output_result": "The capital of France is Paris.",
  "output_success": true
}
```

If no traces exist:
```json
{
  "error": "No traces available for preview"
}
```

---

## Implementation

### Backend (Python)

Use the `jsonpath-ng` library for JSONPath evaluation:

```python
from jsonpath_ng import parse
import json

def apply_jsonpath(data_str: str, jsonpath_expr: str) -> tuple[str | None, bool]:
    """
    Apply JSONPath to data string.

    Returns:
        (extracted_value, success)
        - On success: (extracted_string, True)
        - On failure: (None, False)
    """
    if not jsonpath_expr or not jsonpath_expr.strip():
        return None, False

    try:
        data = json.loads(data_str)
    except json.JSONDecodeError:
        return None, False

    try:
        expr = parse(jsonpath_expr)
        matches = [match.value for match in expr.find(data)]
    except Exception:
        return None, False

    if not matches:
        return None, False

    # Concatenate multiple matches with newlines
    result = "\n".join(str(m) for m in matches)

    # Fall back if empty or null
    if not result or result == "None" or result == "null":
        return None, False

    return result, True
```

### Frontend (React)

#### TraceViewer Changes

```tsx
// TraceViewer.tsx
interface TraceViewerProps {
  trace: TraceData;
  inputJsonPath?: string;  // From workshop settings
  outputJsonPath?: string; // From workshop settings
}

// Use a utility function or hook to apply JSONPath
const displayInput = useJsonPathExtraction(trace.input, inputJsonPath);
const displayOutput = useJsonPathExtraction(trace.output, outputJsonPath);
```

#### JSONPath Utility Hook

```tsx
// hooks/useJsonPathExtraction.ts
import { useMemo } from 'react';
import { JSONPath } from 'jsonpath-plus';

export function useJsonPathExtraction(
  data: string,
  jsonPath: string | undefined
): string {
  return useMemo(() => {
    if (!jsonPath || !jsonPath.trim()) {
      return data;
    }

    try {
      const parsed = JSON.parse(data);
      const results = JSONPath({ path: jsonPath, json: parsed });

      if (!results || results.length === 0) {
        return data;
      }

      const extracted = results.map(r => String(r)).join('\n');

      if (!extracted || extracted === 'null' || extracted === 'undefined') {
        return data;
      }

      return extracted;
    } catch {
      return data;
    }
  }, [data, jsonPath]);
}
```

### Dependencies

**Backend**:
```
jsonpath-ng>=1.5.3
```

**Frontend** (choose one):
```
jsonpath-plus  # Full-featured, ~15KB gzipped
```

---

## Success Criteria

### Functional

1. [ ] Facilitator can configure input/output JSONPath in settings panel
2. [ ] JSONPath fields are optional and clearly labeled as such
3. [ ] Preview shows extraction results against first workshop trace
4. [ ] TraceViewer applies JSONPath when configured
5. [ ] Multiple JSONPath matches are concatenated with newlines
6. [ ] System falls back to raw display when:
   - JSONPath is not configured
   - JSON parsing fails
   - JSONPath query fails
   - JSONPath returns null/empty
7. [ ] Settings are persisted per workshop

### Non-Functional

1. [ ] JSONPath evaluation does not noticeably slow down trace display
2. [ ] Preview responds within 500ms
3. [ ] Invalid JSONPath syntax shows helpful error message in preview

---

## Testing

### Unit Tests

```python
# test_jsonpath.py
def test_simple_extraction():
    data = '{"message": "hello"}'
    result, success = apply_jsonpath(data, "$.message")
    assert success is True
    assert result == "hello"

def test_nested_extraction():
    data = '{"response": {"text": "answer"}}'
    result, success = apply_jsonpath(data, "$.response.text")
    assert success is True
    assert result == "answer"

def test_array_extraction_multiple():
    data = '{"messages": [{"content": "a"}, {"content": "b"}]}'
    result, success = apply_jsonpath(data, "$.messages[*].content")
    assert success is True
    assert result == "a\nb"

def test_no_match_returns_failure():
    data = '{"foo": "bar"}'
    result, success = apply_jsonpath(data, "$.missing")
    assert success is False
    assert result is None

def test_invalid_json_returns_failure():
    data = 'not json'
    result, success = apply_jsonpath(data, "$.anything")
    assert success is False

def test_null_result_returns_failure():
    data = '{"value": null}'
    result, success = apply_jsonpath(data, "$.value")
    assert success is False

def test_empty_jsonpath_returns_failure():
    data = '{"message": "hello"}'
    result, success = apply_jsonpath(data, "")
    assert success is False

    result, success = apply_jsonpath(data, None)
    assert success is False
```

### E2E Tests

```typescript
// jsonpath-settings.spec.ts
test('facilitator can configure and preview JSONPath', async ({ page }) => {
  // Navigate to settings
  // Enter JSONPath expressions
  // Click preview
  // Verify preview shows extracted values
  // Save settings
  // Navigate to trace viewer
  // Verify traces display extracted content
});
```

---

## Implementation Plan

### Phase 1: Backend Foundation

1. **Add database fields**
   - Create Alembic migration adding `input_jsonpath` and `output_jsonpath` columns to `workshops` table
   - Update `Workshop` model in `server/models.py` with optional string fields

2. **Add JSONPath utility**
   - Add `jsonpath-ng` to requirements
   - Create `server/utils/jsonpath_utils.py` with `apply_jsonpath(data_str, jsonpath_expr)` function
   - Write unit tests for the utility

3. **Add API endpoints**
   - `PUT /workshops/{workshop_id}/jsonpath-settings` - save settings
   - `POST /workshops/{workshop_id}/preview-jsonpath` - preview extraction against first trace
   - Add to `server/routers/workshops.py`

### Phase 2: Frontend Settings UI

4. **Update TypeScript types**
   - Regenerate client types or manually add `input_jsonpath` and `output_jsonpath` to `Workshop` type

5. **Create settings UI component**
   - Add JSONPath settings section to facilitator settings (in `FacilitatorDashboard.tsx` Quick Actions or a new settings modal)
   - Two text inputs with "(optional)" labels
   - Preview button
   - Preview results display panel

6. **Wire up API calls**
   - Hook for saving JSONPath settings
   - Hook for preview endpoint
   - Handle loading/error states

### Phase 3: TraceViewer Integration

7. **Create JSONPath extraction hook**
   - Add `jsonpath-plus` to client dependencies
   - Create `hooks/useJsonPathExtraction.ts`

8. **Update TraceViewer**
   - Pass workshop's JSONPath settings to TraceViewer
   - Apply extraction to input/output display
   - Ensure fallback to raw display works correctly

### Phase 4: Testing & Polish

9. **Write tests**
   - Backend unit tests for JSONPath utility
   - API endpoint tests
   - Frontend component tests for settings UI
   - E2E test for full flow

10. **Manual QA**
    - Test with various JSON structures
    - Test fallback scenarios
    - Test with empty/null JSONPath values

---

## Future Work (Out of Scope)

The following are explicitly **not** included in this implementation:

1. **Per-trace JSONPath** - Different JSONPath for specific traces
2. **Multiple JSONPath queries** - Only one per field (input/output)
3. **JSONPath editing in trace viewer** - Configuration only in settings
4. **Custom separators** - Multiple matches always use newline
5. **JSONPath validation UI** - Only shown in preview errors
6. **Export with JSONPath applied** - Exports use raw data

---

## Related Specs

- [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md) - TraceViewer component
- [DATASETS_SPEC](./DATASETS_SPEC.md) - Trace data structure
- [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md) - Trace display phases
