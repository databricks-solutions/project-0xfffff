# Implementation Plan: CSV Export for Annotations

## Overview

Add a client-side CSV export button to the annotation workflow, accessible only to facilitators. The feature generates a CSV file with rubric-aware column headers from all annotations in the workshop. It involves a new `buildAnnotationCSV` utility, a `useExportAnnotationsCSV` hook, and a button integrated into the facilitator's annotation-phase view.

## Governing Spec

- **ANNOTATION_SPEC** (`/specs/ANNOTATION_SPEC.md`) — defines annotation data model, ratings format, and API endpoints
- **ROLE_PERMISSIONS_SPEC** (`/specs/ROLE_PERMISSIONS_SPEC.md`) — defines facilitator-only access via `can_view_all_annotations`
- **RUBRIC_SPEC** (`/specs/RUBRIC_SPEC.md`) — defines rubric question structure, parsing, and per-question judge types

## Architecture Decision

**Client-side CSV generation** — no new backend endpoint required. The frontend already has access to all necessary data through existing hooks:

- `useFacilitatorAnnotationsWithUserDetails(workshopId)` — fetches all annotations with user names (facilitator-only, in `useWorkshopApi.ts`)
- `useRubric(workshopId)` — fetches the rubric with serialized questions
- `parseRubricQuestions()` — parses rubric question text into structured objects (from `rubricUtils.ts`)

This follows the same pattern used by `handleDownloadPrompt` in `JudgeTuningPage.tsx` (Blob + createElement('a') download).

## Deliverables

### 1. New Utility: `client/src/utils/csvExportUtils.ts`

**Purpose**: Pure function `buildAnnotationCSV` that transforms annotation data + rubric questions into a CSV string.

**Function signature**:
```typescript
interface AnnotationWithUser {
  id: string;
  trace_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  rating: number;
  ratings?: Record<string, number> | null;
  comment?: string | null;
  mlflow_trace_id?: string | null;
  created_at?: string;
}

function buildAnnotationCSV(
  annotations: AnnotationWithUser[],
  rubricQuestions: RubricQuestion[]
): string
```

**CSV column layout**:

| Column | Source |
|--------|--------|
| `trace_id` | `annotation.trace_id` |
| `mlflow_trace_id` | `annotation.mlflow_trace_id` |
| `user_name` | `annotation.user_name` |
| `user_email` | `annotation.user_email` |
| `user_role` | `annotation.user_role` |
| `<question_title> (q_1)` | `annotation.ratings["q_1"]` — one column per rubric question |
| `comment` | `annotation.comment` |
| `created_at` | `annotation.created_at` |

**Key behaviors**:
- Dynamic columns generated from rubric questions — column header is `"<question.title> (<question.id>)"` so the rubric criterion name is human-readable
- Handles missing ratings gracefully (empty cell if a question was added after the annotation)
- Properly escapes CSV values: double-quotes around fields containing commas, newlines, or double-quotes; internal double-quotes doubled (`""`)
- Multi-line comments preserved within quoted fields (CSV spec allows newlines inside quoted strings)
- If `rubricQuestions` is empty, falls back to a single `rating` column from `annotation.rating` (legacy format support)
- Returns empty string if annotations array is empty

**Implementation notes**:
- Import `RubricQuestion` type from `@/utils/rubricUtils`
- No third-party CSV library needed — hand-roll the escaping (the logic is ~15 lines)
- Helper: `escapeCsvField(value: string): string` — wraps in quotes if field contains `,`, `"`, or `\n`; doubles internal quotes

### 2. New Hook: `client/src/hooks/useExportAnnotationsCSV.ts`

**Purpose**: Encapsulates data fetching, CSV generation, and file download trigger. Returns `{ exportCSV, isExporting, isReady }`.

**Function signature**:
```typescript
function useExportAnnotationsCSV(workshopId: string): {
  exportCSV: () => void;
  isExporting: boolean;
  isReady: boolean;  // true when annotations + rubric data are loaded
}
```

**Implementation**:
1. Call `useFacilitatorAnnotationsWithUserDetails(workshopId)` to get all annotations with user details (this hook already guards on `isFacilitator`)
2. Call `useRubric(workshopId)` to get the rubric
3. Parse rubric questions via `parseRubricQuestions(rubric.question)`
4. `isReady` = annotations loaded AND rubric loaded AND annotations.length > 0
5. `exportCSV` function:
   - Set `isExporting = true`
   - Call `buildAnnotationCSV(annotations, parsedQuestions)`
   - Create a `Blob` with type `text/csv;charset=utf-8;` and prepend a UTF-8 BOM (`\uFEFF`) for Excel compatibility
   - Trigger download via `URL.createObjectURL` + `createElement('a')` pattern (same as `JudgeTuningPage.tsx` lines 1002-1010)
   - Filename: `annotations-${workshopId}-${Date.now()}.csv`
   - Show `toast.success('Annotations exported successfully')`
   - Set `isExporting = false`

**Access control**: The `useFacilitatorAnnotationsWithUserDetails` hook already has `enabled: !!workshopId && isFacilitator`, so the query won't execute for non-facilitators. The UI button is also gated (see below).

### 3. UI Integration: Export Button

**Location**: The export button should appear in the facilitator's view during the **annotation** and **results** phases. Two candidate locations:

- **Primary**: `IRRResultsDemo.tsx` — the facilitator's results page, which already imports `Download` from lucide-react and uses `useFacilitatorAnnotationsWithUserDetails`. This is the most natural place since the facilitator reviews annotations here.
- **Secondary**: `FacilitatorDashboard.tsx` — if the facilitator needs export access during the annotation phase before advancing to results.

**Button rendering** (in whichever page hosts it):

```tsx
import { useExportAnnotationsCSV } from '@/hooks/useExportAnnotationsCSV';
import { Download } from 'lucide-react';

// Inside the component:
const { exportCSV, isExporting, isReady } = useExportAnnotationsCSV(workshopId);

// In JSX:
<Button
  variant="outline"
  size="sm"
  onClick={exportCSV}
  disabled={!isReady || isExporting}
  title="Export all annotations as CSV"
>
  <Download className="h-4 w-4 mr-2" />
  {isExporting ? 'Exporting...' : 'Export CSV'}
</Button>
```

**Access guard**: The button should only render when `isFacilitator` is true (from `useRoleCheck()`). This is a defense-in-depth measure alongside the hook's own guard.

```tsx
const { isFacilitator } = useRoleCheck();
// ...
{isFacilitator && (
  <Button onClick={exportCSV} disabled={!isReady || isExporting}>
    ...
  </Button>
)}
```

### 4. Tests

#### 4a. Unit Tests: `client/src/utils/csvExportUtils.test.ts`

Follow the pattern in `rubricUtils.test.ts` (Vitest, `@spec` tag).

```
// @spec ANNOTATION_SPEC
```

Test cases:
1. **Basic CSV generation** — 2 annotations, 2 rubric questions, verify header row and data rows
2. **Rubric-aware columns** — column headers contain question titles
3. **CSV escaping** — comment with commas, newlines, and double-quotes properly escaped
4. **Missing ratings** — annotation missing a rating for a newer rubric question produces empty cell
5. **Legacy format** — no rubric questions, falls back to single `rating` column
6. **Empty annotations** — returns empty string
7. **Multi-line comments** — newlines within comment field preserved in quoted CSV field
8. **Special characters in question titles** — titles with commas/quotes in headers are escaped

#### 4b. Hook Tests: `client/src/hooks/useExportAnnotationsCSV.test.ts`

Follow the pattern in `useWorkshopApi.test.ts`.

Test cases:
1. **isReady reflects data loading state** — false when data loading, true when loaded
2. **exportCSV triggers download** — mock `URL.createObjectURL`, verify Blob creation with correct MIME type
3. **Non-facilitator gets empty data** — hook returns `isReady: false` when `useFacilitatorAnnotationsWithUserDetails` returns no data
4. **Toast shown on export** — verify `toast.success` called

#### 4c. E2E Test (Playwright, optional follow-up)

Verify the button appears for facilitator users in the results phase and does not appear for SME/participant users.

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `client/src/utils/csvExportUtils.ts` | **Create** | `buildAnnotationCSV` utility + `escapeCsvField` helper |
| `client/src/utils/csvExportUtils.test.ts` | **Create** | Unit tests for CSV generation |
| `client/src/hooks/useExportAnnotationsCSV.ts` | **Create** | Hook wrapping data fetch + CSV download |
| `client/src/hooks/useExportAnnotationsCSV.test.ts` | **Create** | Hook tests |
| `client/src/pages/IRRResultsDemo.tsx` | **Edit** | Add export button in facilitator results view |
| `client/src/components/FacilitatorDashboard.tsx` | **Edit** (optional) | Add export button in annotation-phase dashboard |

## Dependencies

- **No new npm packages** — CSV generation is hand-rolled (trivial escaping logic)
- **No new backend endpoints** — all data already available via existing facilitator-only hooks
- **No database changes** — read-only feature

## Edge Cases & Risks

1. **Large annotation sets**: Client-side CSV generation could be slow for thousands of annotations. Mitigation: `buildAnnotationCSV` is a synchronous pure function; if performance becomes an issue, it can be moved to a Web Worker. For typical workshop sizes (tens to low hundreds of annotations), this is not a concern.

2. **Rubric changes after annotations**: If questions are added/removed after some annotations exist, the CSV will have empty cells for missing ratings. This is the correct behavior and is documented in the column layout.

3. **Excel compatibility**: The UTF-8 BOM (`\uFEFF`) prefix ensures Excel opens the CSV with correct character encoding. Without it, non-ASCII characters in comments or question titles may display incorrectly.

4. **Concurrent rubric edits**: The CSV reflects the rubric state at export time. If a facilitator edits the rubric and then exports, the column headers will match the current rubric, but older annotations may have ratings for question IDs that no longer exist. These orphaned ratings should be silently excluded from the CSV.

## Implementation Order

1. `csvExportUtils.ts` + `csvExportUtils.test.ts` — pure utility, no dependencies
2. `useExportAnnotationsCSV.ts` + `useExportAnnotationsCSV.test.ts` — depends on step 1
3. UI integration in `IRRResultsDemo.tsx` — depends on step 2
4. (Optional) UI integration in `FacilitatorDashboard.tsx`
5. (Optional) Playwright E2E test

## Spec Coverage Tags

New tests should be tagged for spec coverage tracking:

- `csvExportUtils.test.ts`: `// @spec ANNOTATION_SPEC`
- `useExportAnnotationsCSV.test.ts`: `// @spec ANNOTATION_SPEC`
- Relevant `@req` markers on individual test cases per the spec-audit skill guidelines
