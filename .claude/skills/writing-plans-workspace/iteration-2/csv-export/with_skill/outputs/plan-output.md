# CSV Export for Annotations Implementation Plan

**Spec:** [ANNOTATION_SPEC](../../../../../../specs/ANNOTATION_SPEC.md)
**Goal:** Add a facilitator-only CSV export button that generates a downloadable CSV of all workshop annotations with rubric-aware column headers.
**Architecture:** Client-side CSV generation using a `buildAnnotationCSV` utility that reads annotations and rubric data already fetched via React Query hooks. A `useExportAnnotationsCSV` hook orchestrates data access and triggers the browser download. The export button renders only for facilitator users, leveraging the existing `useRoleCheck` pattern. No backend changes required — all data is already available via `useFacilitatorAnnotations` and `useRubric`.
**Success Criteria Targeted:**
- SC-1: Users can edit previously submitted annotations (existing — not modified, but CSV must reflect latest state)
- SC-MLflow-1: Annotations sync to MLflow as feedback on save (one entry per rubric question) (existing — CSV column structure mirrors this per-question model)

Note: The ANNOTATION_SPEC does not currently have explicit success criteria for CSV export. The following criteria should be proposed as additions to the spec (protected operation — requires user approval):

- SC-EXPORT-1: Facilitator can export all workshop annotations as a CSV file
- SC-EXPORT-2: CSV columns include trace_id, user_id, one column per rubric question (using question title), and comment
- SC-EXPORT-3: Export button is only visible to facilitator role users
- SC-EXPORT-4: CSV properly escapes values containing commas, quotes, and newlines

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `client/src/utils/buildAnnotationCSV.ts` | Pure function: transforms annotations + rubric into CSV string |
| `client/src/utils/buildAnnotationCSV.test.ts` | Unit tests for CSV generation logic |
| `client/src/hooks/useExportAnnotationsCSV.ts` | Hook: fetches data, calls utility, triggers download |
| `client/src/hooks/useExportAnnotationsCSV.test.ts` | Unit tests for the export hook |

### Modified Files
| File | Change |
|------|--------|
| `client/src/components/FacilitatorDashboard.tsx` | Add "Export CSV" button in the annotation overview section |

---

## Task 1: Build the `buildAnnotationCSV` Utility

**Spec criteria:** SC-EXPORT-2, SC-EXPORT-4
**Files:**
- Create: `client/src/utils/buildAnnotationCSV.ts`
- Test: `client/src/utils/buildAnnotationCSV.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/utils/buildAnnotationCSV.test.ts
import { describe, expect, it } from 'vitest';
import { buildAnnotationCSV } from './buildAnnotationCSV';
import type { Annotation } from '@/client';
import type { RubricQuestion } from '@/utils/rubricUtils';
import { JudgeType } from '@/client';

// @spec ANNOTATION_SPEC
// @req Facilitator can export all workshop annotations as a CSV file

describe('buildAnnotationCSV', () => {
  const rubricQuestions: RubricQuestion[] = [
    { id: 'q1', title: 'Clarity', description: 'Is the response clear?', judgeType: JudgeType.LIKERT },
    { id: 'q2', title: 'Accuracy', description: 'Is it accurate?', judgeType: JudgeType.BINARY },
  ];

  const annotations: Annotation[] = [
    {
      id: 'a1',
      workshop_id: 'w1',
      trace_id: 't1',
      user_id: 'u1',
      rating: 0,
      ratings: { q1: 4, q2: 1 },
      comment: 'Looks good',
      created_at: '2026-03-12T10:00:00Z',
    },
    {
      id: 'a2',
      workshop_id: 'w1',
      trace_id: 't2',
      user_id: 'u2',
      rating: 0,
      ratings: { q1: 2, q2: 0 },
      comment: null,
      created_at: '2026-03-12T11:00:00Z',
    },
  ];

  it('generates CSV with rubric-aware column headers', () => {
    const csv = buildAnnotationCSV(annotations, rubricQuestions);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('trace_id,user_id,Clarity,Accuracy,comment,created_at');
    expect(lines).toHaveLength(3); // header + 2 data rows
  });

  it('maps ratings to correct rubric question columns', () => {
    const csv = buildAnnotationCSV(annotations, rubricQuestions);
    const lines = csv.split('\n');
    // First annotation: t1, u1, Clarity=4, Accuracy=1, "Looks good"
    expect(lines[1]).toContain('t1,u1,4,1,Looks good,');
  });

  it('handles null comments', () => {
    const csv = buildAnnotationCSV(annotations, rubricQuestions);
    const lines = csv.split('\n');
    // Second annotation has null comment
    expect(lines[2]).toContain('t2,u2,2,0,,');
  });

  it('escapes values with commas and quotes', () => {
    const annotationsWithSpecial: Annotation[] = [
      {
        id: 'a3',
        workshop_id: 'w1',
        trace_id: 't3',
        user_id: 'u3',
        rating: 0,
        ratings: { q1: 3, q2: 1 },
        comment: 'Has a "quote" and, comma',
        created_at: '2026-03-12T12:00:00Z',
      },
    ];
    const csv = buildAnnotationCSV(annotationsWithSpecial, rubricQuestions);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('"Has a ""quote"" and, comma"');
  });

  it('escapes values with newlines', () => {
    const annotationsWithNewline: Annotation[] = [
      {
        id: 'a4',
        workshop_id: 'w1',
        trace_id: 't4',
        user_id: 'u4',
        rating: 0,
        ratings: { q1: 5, q2: 1 },
        comment: 'Line one\nLine two',
        created_at: '2026-03-12T13:00:00Z',
      },
    ];
    const csv = buildAnnotationCSV(annotationsWithNewline, rubricQuestions);
    const lines = csv.split(/((?<=")\n|\n(?=[^"]))/); // split on unquoted newlines only
    // The comment with newline should be wrapped in quotes
    expect(csv).toContain('"Line one\nLine two"');
  });

  it('returns header-only CSV for empty annotations', () => {
    const csv = buildAnnotationCSV([], rubricQuestions);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('trace_id,user_id,Clarity,Accuracy,comment,created_at');
  });

  it('handles empty rubric questions gracefully', () => {
    const csv = buildAnnotationCSV(annotations, []);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('trace_id,user_id,comment,created_at');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `just ui-test-unit client/src/utils/buildAnnotationCSV.test.ts`
Expected: FAIL — `buildAnnotationCSV` not found / module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// client/src/utils/buildAnnotationCSV.ts
import type { Annotation } from '@/client';
import type { RubricQuestion } from '@/utils/rubricUtils';

/**
 * Escape a CSV field value.
 * Wraps in quotes if the value contains commas, quotes, or newlines.
 */
function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build a CSV string from annotations with rubric-aware column headers.
 *
 * Columns: trace_id, user_id, [one column per rubric question title], comment, created_at
 */
export function buildAnnotationCSV(
  annotations: Annotation[],
  rubricQuestions: RubricQuestion[]
): string {
  const questionHeaders = rubricQuestions.map((q) => q.title);
  const headers = ['trace_id', 'user_id', ...questionHeaders, 'comment', 'created_at'];

  const rows = annotations.map((annotation) => {
    const questionValues = rubricQuestions.map((q) => {
      const rating = annotation.ratings?.[q.id];
      return rating !== undefined ? String(rating) : '';
    });

    const comment = annotation.comment ?? '';
    const createdAt = annotation.created_at ?? '';

    return [
      annotation.trace_id,
      annotation.user_id,
      ...questionValues,
      escapeCSVField(comment),
      createdAt,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `just ui-test-unit client/src/utils/buildAnnotationCSV.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/buildAnnotationCSV.ts client/src/utils/buildAnnotationCSV.test.ts
git commit -m "feat(annotation): add buildAnnotationCSV utility with rubric-aware columns"
```

---

## Task 2: Build the `useExportAnnotationsCSV` Hook

**Spec criteria:** SC-EXPORT-1, SC-EXPORT-3
**Files:**
- Create: `client/src/hooks/useExportAnnotationsCSV.ts`
- Test: `client/src/hooks/useExportAnnotationsCSV.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/hooks/useExportAnnotationsCSV.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// @spec ANNOTATION_SPEC
// @req Facilitator can export all workshop annotations as a CSV file

// Mock dependencies
vi.mock('@/hooks/useWorkshopApi', () => ({
  useFacilitatorAnnotations: vi.fn(),
  useRubric: vi.fn(),
}));

vi.mock('@/utils/rubricUtils', () => ({
  parseRubricQuestions: vi.fn(),
}));

vi.mock('@/utils/buildAnnotationCSV', () => ({
  buildAnnotationCSV: vi.fn(),
}));

import { useFacilitatorAnnotations, useRubric } from '@/hooks/useWorkshopApi';
import { parseRubricQuestions } from '@/utils/rubricUtils';
import { buildAnnotationCSV } from '@/utils/buildAnnotationCSV';
import { useExportAnnotationsCSV } from './useExportAnnotationsCSV';

describe('useExportAnnotationsCSV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('returns exportCSV function and loading state', () => {
    (useFacilitatorAnnotations as any).mockReturnValue({ data: [], isLoading: false });
    (useRubric as any).mockReturnValue({ data: null, isLoading: false });
    (parseRubricQuestions as any).mockReturnValue([]);

    const { result } = renderHook(() => useExportAnnotationsCSV('w1'));
    expect(result.current.exportCSV).toBeInstanceOf(Function);
    expect(result.current.isReady).toBe(false); // no rubric data
  });

  it('isReady is true when annotations and rubric are loaded', () => {
    (useFacilitatorAnnotations as any).mockReturnValue({
      data: [{ id: 'a1' }],
      isLoading: false,
    });
    (useRubric as any).mockReturnValue({
      data: { id: 'r1', question: 'Clarity: Is it clear?' },
      isLoading: false,
    });
    (parseRubricQuestions as any).mockReturnValue([
      { id: 'q1', title: 'Clarity', description: 'Is it clear?' },
    ]);

    const { result } = renderHook(() => useExportAnnotationsCSV('w1'));
    expect(result.current.isReady).toBe(true);
  });

  it('exportCSV calls buildAnnotationCSV and triggers download', () => {
    const mockAnnotations = [{ id: 'a1', trace_id: 't1', user_id: 'u1' }];
    const mockQuestions = [{ id: 'q1', title: 'Clarity' }];
    (useFacilitatorAnnotations as any).mockReturnValue({
      data: mockAnnotations,
      isLoading: false,
    });
    (useRubric as any).mockReturnValue({
      data: { id: 'r1', question: 'Clarity: desc' },
      isLoading: false,
    });
    (parseRubricQuestions as any).mockReturnValue(mockQuestions);
    (buildAnnotationCSV as any).mockReturnValue('trace_id,user_id\nt1,u1');

    const clickSpy = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as any);

    const { result } = renderHook(() => useExportAnnotationsCSV('w1'));
    act(() => {
      result.current.exportCSV();
    });

    expect(buildAnnotationCSV).toHaveBeenCalledWith(mockAnnotations, mockQuestions);
    expect(clickSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `just ui-test-unit client/src/hooks/useExportAnnotationsCSV.test.ts`
Expected: FAIL — `useExportAnnotationsCSV` not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// client/src/hooks/useExportAnnotationsCSV.ts
import { useMemo, useCallback } from 'react';
import { useFacilitatorAnnotations, useRubric } from '@/hooks/useWorkshopApi';
import { parseRubricQuestions } from '@/utils/rubricUtils';
import { buildAnnotationCSV } from '@/utils/buildAnnotationCSV';

/**
 * Hook for exporting workshop annotations as CSV.
 * Only works for facilitator users (useFacilitatorAnnotations is facilitator-gated).
 */
export function useExportAnnotationsCSV(workshopId: string) {
  const { data: annotations, isLoading: annotationsLoading } =
    useFacilitatorAnnotations(workshopId);
  const { data: rubric, isLoading: rubricLoading } = useRubric(workshopId);

  const rubricQuestions = useMemo(() => {
    if (!rubric?.question) return [];
    return parseRubricQuestions(rubric.question);
  }, [rubric]);

  const isReady =
    !annotationsLoading &&
    !rubricLoading &&
    !!annotations &&
    annotations.length > 0 &&
    rubricQuestions.length > 0;

  const exportCSV = useCallback(() => {
    if (!annotations || rubricQuestions.length === 0) return;

    const csvContent = buildAnnotationCSV(annotations, rubricQuestions);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations-${workshopId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [annotations, rubricQuestions, workshopId]);

  return { exportCSV, isReady };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `just ui-test-unit client/src/hooks/useExportAnnotationsCSV.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useExportAnnotationsCSV.ts client/src/hooks/useExportAnnotationsCSV.test.ts
git commit -m "feat(annotation): add useExportAnnotationsCSV hook for facilitator CSV download"
```

---

## Task 3: Add Export CSV Button to FacilitatorDashboard

**Spec criteria:** SC-EXPORT-1, SC-EXPORT-3
**Files:**
- Modify: `client/src/components/FacilitatorDashboard.tsx`

- [ ] **Step 1: Add the import and button**

In `client/src/components/FacilitatorDashboard.tsx`, add import:

```typescript
import { useExportAnnotationsCSV } from '@/hooks/useExportAnnotationsCSV';
import { Download } from 'lucide-react';
```

Inside the component, add after existing hook calls:

```typescript
const { exportCSV, isReady: csvReady } = useExportAnnotationsCSV(workshopId!);
```

Add the export button in the annotation overview section (near where annotation counts are displayed):

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={exportCSV}
  disabled={!csvReady}
  className="gap-2"
>
  <Download className="h-4 w-4" />
  Export CSV
</Button>
```

- [ ] **Step 2: Verify the button renders only for facilitators**

The FacilitatorDashboard component is already only rendered for facilitator users (it's gated by the role-based workflow in `RoleBasedWorkflow.tsx`). Additionally, `useFacilitatorAnnotations` internally checks `isFacilitator` and won't fetch data for non-facilitator users, so `csvReady` will be false and the button disabled.

- [ ] **Step 3: Run lint**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/FacilitatorDashboard.tsx
git commit -m "feat(annotation): add CSV export button to facilitator dashboard"
```

---

## Task 4 (Final): Lint and Verify Spec Coverage

- [ ] **Step 1: Run linting**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 2: Run spec coverage**

Run: `just spec-coverage --specs ANNOTATION_SPEC`
Expected: Coverage increased from 61% (current baseline)

- [ ] **Step 3: Check for untagged tests**

Run: `just spec-validate`
Expected: All tests tagged

- [ ] **Step 4: Run full test suite for the spec**

Run: `just test-spec ANNOTATION_SPEC`
Expected: All tests PASS

- [ ] **Step 5: Update implementation log**

Update the spec's Implementation Log entry status from `planned` to `complete`.

---

## Proposed Spec Amendments

The ANNOTATION_SPEC does not currently define success criteria for CSV export. Before implementation, the following criteria should be added to the spec's `## Success Criteria` section under a new subsection:

```markdown
### Export

- [ ] Facilitator can export all workshop annotations as a CSV file
- [ ] CSV columns include trace_id, user_id, one column per rubric question (using question title), and comment
- [ ] Export button is only visible to facilitator role users
- [ ] CSV properly escapes values containing commas, quotes, and newlines
```

This is a **protected operation** — requires user approval before modifying `/specs/ANNOTATION_SPEC.md`.

---

## Implementation Log Entry (to append to ANNOTATION_SPEC)

The following entry would be appended to the `## Implementation Log` section of `ANNOTATION_SPEC.md` (creating the section if it doesn't exist, before `## Future Work` if present):

```markdown
## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-03-12 | [CSV Export](../.claude/plans/2026-03-12-csv-export.md) | planned | Client-side CSV export of annotations with rubric-aware columns, facilitator-only access |
```
