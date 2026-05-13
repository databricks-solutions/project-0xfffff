# CSV Export for Annotations Implementation Plan

**Spec:** [ANNOTATION_SPEC](../../specs/ANNOTATION_SPEC.md)
**Goal:** Add a facilitator-only CSV export button that generates a downloadable CSV of all workshop annotations with rubric-aware column headers.
**Architecture:** Client-side CSV generation using a `buildAnnotationCSV` utility that reads rubric questions to produce dynamic column headers (one column per rubric question title). A `useExportAnnotationsCSV` hook orchestrates data fetching (all annotations + rubric) and triggers a browser download. The export button renders only for facilitator users, placed on the FacilitatorDashboard.
**Success Criteria Targeted:**
- SC-1: Users can edit previously submitted annotations *(existing — export reads persisted annotations)*
- SC-2: Annotations sync to MLflow as feedback on save (one entry per rubric question) *(existing — CSV mirrors this per-question structure)*

*Note: No existing success criterion in ANNOTATION_SPEC covers CSV export. A new criterion should be proposed as a spec update (protected operation). The proposed addition is included in the Spec Update Proposal section below.*

---

## Spec Update Proposal (Protected Operation)

The following success criterion should be added to ANNOTATION_SPEC under **Success Criteria > Core Annotation Behavior**:

```markdown
- [ ] Facilitators can export all workshop annotations as a CSV file with rubric-aware column headers
```

This requires user approval before modifying `/specs/ANNOTATION_SPEC.md`.

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `client/src/utils/buildAnnotationCSV.ts` | Pure function: transforms annotations + rubric questions into a CSV string |
| `client/src/utils/buildAnnotationCSV.test.ts` | Unit tests for CSV builder |
| `client/src/hooks/useExportAnnotationsCSV.ts` | Hook: fetches all annotations + rubric, calls builder, triggers download |
| `client/src/hooks/useExportAnnotationsCSV.test.ts` | Unit tests for the export hook |

### Modified Files
| File | Change |
|------|--------|
| `client/src/components/FacilitatorDashboard.tsx` | Add "Export CSV" button (facilitator-only, already gated by component context) |

---

## Task 1: `buildAnnotationCSV` Utility

**Spec criteria:** Proposed SC (facilitator CSV export)
**Files:**
- Create: `client/src/utils/buildAnnotationCSV.ts`
- Test: `client/src/utils/buildAnnotationCSV.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// @spec ANNOTATION_SPEC
// @req Facilitators can export all workshop annotations as a CSV file with rubric-aware column headers

import { describe, expect, it } from 'vitest';
import { buildAnnotationCSV } from './buildAnnotationCSV';
import type { RubricQuestion } from './rubricUtils';
import { JudgeType } from '@/client';

describe('buildAnnotationCSV', () => {
  const questions: RubricQuestion[] = [
    { id: 'q_1', title: 'Helpfulness', description: 'How helpful is the response?', judgeType: JudgeType.LIKERT },
    { id: 'q_2', title: 'Accuracy', description: 'Is the response accurate?', judgeType: JudgeType.BINARY },
  ];

  it('produces header row with trace_id, user_id, rubric question titles, and comment', () => {
    const csv = buildAnnotationCSV([], questions);
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toBe('trace_id,user_id,Helpfulness,Accuracy,comment');
  });

  it('maps annotation ratings to correct rubric question columns', () => {
    const annotations = [
      {
        id: 'a1',
        workshop_id: 'w1',
        trace_id: 't1',
        user_id: 'u1',
        rating: 4,
        ratings: { q_1: 4, q_2: 1 },
        comment: 'Good response',
      },
    ];

    const csv = buildAnnotationCSV(annotations, questions);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('t1,u1,4,1,Good response');
  });

  it('handles null/missing ratings with empty cells', () => {
    const annotations = [
      {
        id: 'a2',
        workshop_id: 'w1',
        trace_id: 't2',
        user_id: 'u2',
        rating: 0,
        ratings: { q_1: 3 }, // q_2 missing
        comment: null,
      },
    ];

    const csv = buildAnnotationCSV(annotations, questions);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('t2,u2,3,,');
  });

  it('escapes commas and quotes in comment field', () => {
    const annotations = [
      {
        id: 'a3',
        workshop_id: 'w1',
        trace_id: 't3',
        user_id: 'u3',
        rating: 5,
        ratings: { q_1: 5, q_2: 0 },
        comment: 'Has a, comma and "quotes"',
      },
    ];

    const csv = buildAnnotationCSV(annotations, questions);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('t3,u3,5,0,"Has a, comma and ""quotes"""');
  });

  it('handles multi-line comments by quoting', () => {
    const annotations = [
      {
        id: 'a4',
        workshop_id: 'w1',
        trace_id: 't4',
        user_id: 'u4',
        rating: 3,
        ratings: { q_1: 3, q_2: 1 },
        comment: 'Line one\nLine two',
      },
    ];

    const csv = buildAnnotationCSV(annotations, questions);
    const lines = csv.split('\n');
    // Multi-line comments should be quoted
    expect(csv).toContain('"Line one\nLine two"');
  });

  it('returns only header when annotations array is empty', () => {
    const csv = buildAnnotationCSV([], questions);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  it('falls back to question IDs when no rubric questions provided', () => {
    const annotations = [
      {
        id: 'a5',
        workshop_id: 'w1',
        trace_id: 't5',
        user_id: 'u5',
        rating: 4,
        ratings: { q_1: 4 },
        comment: null,
      },
    ];

    const csv = buildAnnotationCSV(annotations, []);
    const header = csv.split('\n')[0];
    // With no questions, should have trace_id, user_id, comment only
    expect(header).toBe('trace_id,user_id,comment');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/utils/buildAnnotationCSV.test.ts`
Expected: FAIL -- `buildAnnotationCSV` module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Builds a CSV string from annotations with rubric-aware column headers.
 * Each rubric question becomes its own column, using the question title as header.
 */
import type { Annotation } from '@/client';
import type { RubricQuestion } from './rubricUtils';

function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildAnnotationCSV(
  annotations: Annotation[],
  questions: RubricQuestion[]
): string {
  // Build header
  const headers = ['trace_id', 'user_id'];
  for (const q of questions) {
    headers.push(q.title);
  }
  headers.push('comment');

  const rows: string[] = [headers.join(',')];

  for (const annotation of annotations) {
    const cells: string[] = [
      annotation.trace_id,
      annotation.user_id,
    ];

    for (const q of questions) {
      const rating = annotation.ratings?.[q.id];
      cells.push(rating !== undefined && rating !== null ? String(rating) : '');
    }

    const comment = annotation.comment ?? '';
    cells.push(comment ? escapeCSVField(comment) : '');

    rows.push(cells.join(','));
  }

  return rows.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/utils/buildAnnotationCSV.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/buildAnnotationCSV.ts client/src/utils/buildAnnotationCSV.test.ts
git commit -m "feat(annotations): add buildAnnotationCSV utility with rubric-aware columns"
```

---

## Task 2: `useExportAnnotationsCSV` Hook

**Spec criteria:** Proposed SC (facilitator CSV export)
**Files:**
- Create: `client/src/hooks/useExportAnnotationsCSV.ts`
- Test: `client/src/hooks/useExportAnnotationsCSV.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// @spec ANNOTATION_SPEC
// @req Facilitators can export all workshop annotations as a CSV file with rubric-aware column headers

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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

import { useExportAnnotationsCSV } from './useExportAnnotationsCSV';
import { useFacilitatorAnnotations, useRubric } from '@/hooks/useWorkshopApi';
import { parseRubricQuestions } from '@/utils/rubricUtils';
import { buildAnnotationCSV } from '@/utils/buildAnnotationCSV';

describe('useExportAnnotationsCSV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('returns disabled state when annotations are loading', () => {
    (useFacilitatorAnnotations as any).mockReturnValue({ data: undefined, isLoading: true });
    (useRubric as any).mockReturnValue({ data: { question: 'Q1: desc' }, isLoading: false });
    (parseRubricQuestions as any).mockReturnValue([{ id: 'q_1', title: 'Q1', description: 'desc', judgeType: 'likert' }]);

    const { result } = renderHook(() => useExportAnnotationsCSV('w1'));
    expect(result.current.isReady).toBe(false);
  });

  it('returns ready state when data is available', () => {
    (useFacilitatorAnnotations as any).mockReturnValue({ data: [{ id: 'a1' }], isLoading: false });
    (useRubric as any).mockReturnValue({ data: { question: 'Q1: desc' }, isLoading: false });
    (parseRubricQuestions as any).mockReturnValue([{ id: 'q_1', title: 'Q1', description: 'desc', judgeType: 'likert' }]);

    const { result } = renderHook(() => useExportAnnotationsCSV('w1'));
    expect(result.current.isReady).toBe(true);
  });

  it('calls buildAnnotationCSV and triggers download on exportCSV()', () => {
    const mockAnnotations = [{ id: 'a1', trace_id: 't1', user_id: 'u1', ratings: { q_1: 4 }, comment: 'ok' }];
    const mockQuestions = [{ id: 'q_1', title: 'Q1', description: 'desc', judgeType: 'likert' }];

    (useFacilitatorAnnotations as any).mockReturnValue({ data: mockAnnotations, isLoading: false });
    (useRubric as any).mockReturnValue({ data: { question: 'Q1: desc' }, isLoading: false });
    (parseRubricQuestions as any).mockReturnValue(mockQuestions);
    (buildAnnotationCSV as any).mockReturnValue('trace_id,user_id,Q1,comment\nt1,u1,4,ok');

    // Mock document.createElement for the anchor element
    const mockClick = vi.fn();
    const mockAnchor = { href: '', download: '', click: mockClick, remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);

    const { result } = renderHook(() => useExportAnnotationsCSV('w1'));
    act(() => {
      result.current.exportCSV();
    });

    expect(buildAnnotationCSV).toHaveBeenCalledWith(mockAnnotations, mockQuestions);
    expect(mockClick).toHaveBeenCalled();
    expect(mockAnchor.download).toMatch(/annotations.*\.csv$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/hooks/useExportAnnotationsCSV.test.ts`
Expected: FAIL -- `useExportAnnotationsCSV` module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Hook for exporting workshop annotations as CSV.
 * Facilitator-only: relies on useFacilitatorAnnotations which is already gated.
 */
import { useCallback } from 'react';
import { useFacilitatorAnnotations, useRubric } from '@/hooks/useWorkshopApi';
import { parseRubricQuestions } from '@/utils/rubricUtils';
import { buildAnnotationCSV } from '@/utils/buildAnnotationCSV';

export function useExportAnnotationsCSV(workshopId: string) {
  const { data: annotations, isLoading: annotationsLoading } = useFacilitatorAnnotations(workshopId);
  const { data: rubric, isLoading: rubricLoading } = useRubric(workshopId);

  const questions = rubric?.question ? parseRubricQuestions(rubric.question) : [];
  const isReady = !annotationsLoading && !rubricLoading && !!annotations;

  const exportCSV = useCallback(() => {
    if (!annotations) return;

    const csv = buildAnnotationCSV(annotations, questions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `annotations-${workshopId}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }, [annotations, questions, workshopId]);

  return { exportCSV, isReady };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/useExportAnnotationsCSV.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useExportAnnotationsCSV.ts client/src/hooks/useExportAnnotationsCSV.test.ts
git commit -m "feat(annotations): add useExportAnnotationsCSV hook for facilitator CSV download"
```

---

## Task 3: Add Export Button to FacilitatorDashboard

**Spec criteria:** Proposed SC (facilitator CSV export)
**Files:**
- Modify: `client/src/components/FacilitatorDashboard.tsx`

- [ ] **Step 1: Add import and button to FacilitatorDashboard**

In `client/src/components/FacilitatorDashboard.tsx`, add the import:

```typescript
import { useExportAnnotationsCSV } from '@/hooks/useExportAnnotationsCSV';
import { Download } from 'lucide-react';
```

Inside the `FacilitatorDashboard` component body (after existing hooks), add:

```typescript
const { exportCSV, isReady: csvReady } = useExportAnnotationsCSV(workshopId!);
```

Add the export button in the annotation section of the dashboard (near existing annotation stats):

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

- [ ] **Step 2: Verify the app builds**

Run: `cd client && npx vite build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 3: Manual verification**

1. Log in as facilitator
2. Navigate to FacilitatorDashboard
3. Verify "Export CSV" button is visible
4. Click button, verify CSV downloads with correct headers and data
5. Log in as participant -- verify button is NOT visible (FacilitatorDashboard not accessible to participants)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/FacilitatorDashboard.tsx
git commit -m "feat(annotations): add CSV export button to facilitator dashboard"
```

---

## Task 4 (Final): Verify Spec Coverage

- [ ] **Step 1: Run spec coverage**

Run: `just spec-coverage --specs ANNOTATION_SPEC`
Expected: Coverage increased from 61% (current baseline)

- [ ] **Step 2: Check for untagged tests**

Run: `just spec-validate`
Expected: All new tests tagged with `@spec ANNOTATION_SPEC` and `@req`

- [ ] **Step 3: Run full test suite for the spec**

Run: `just test-spec ANNOTATION_SPEC`
Expected: All tests PASS

- [ ] **Step 4: Update implementation log**

Update the spec's Implementation Log entry status from `planned` to `complete`.

---

## Implementation Log Entry (WOULD be appended to ANNOTATION_SPEC.md)

The following entry would be appended at the bottom of `/specs/ANNOTATION_SPEC.md`, before `## Future Work` if it exists. This is a protected operation requiring user approval.

```markdown
## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-03-12 | [CSV Export for Annotations](../.claude/plans/2026-03-12-csv-export-annotations.md) | planned | Client-side CSV export with rubric-aware column headers, facilitator-only access |
```
