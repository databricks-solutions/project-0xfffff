# Brainstorm: Add a Button to Export Annotations as CSV

## Clarifying Questions (Self-Answered)

**Q: Who should be able to export?**
A: Facilitators should be able to export all annotations for the workshop. Individual annotators (SMEs/participants) could export their own. I will design it primarily for the facilitator use case since they have `can_view_all_annotations` permission, with a secondary path for users to export their own.

**Q: Where should the button live?**
A: Two places make sense: (1) the AnnotationReviewPage (facilitator view), and (2) the DBSQLExportPage which already has export-related UI. The most natural fit is a new "Export CSV" button on the facilitator's annotation review/monitoring UI, since that is where they already see all annotations.

**Q: Should the CSV be generated server-side or client-side?**
A: Server-side is cleaner -- it can join annotations with user details, trace info, and rubric question titles. A dedicated endpoint keeps the logic testable and avoids shipping large datasets to the browser for transformation.

**Q: What columns should the CSV contain?**
A: One row per annotation-question pair (denormalized), with human-readable rubric question titles. This is most useful for analysis. Columns: `trace_id`, `mlflow_trace_id`, `user_name`, `user_email`, `user_role`, `question_title`, `rating`, `comment`, `created_at`.

**Q: What about workshops with no annotations yet?**
A: The button should be disabled with a tooltip explaining there are no annotations to export.

---

## Current Architecture Summary

### Data Model
- **Annotation table**: `id`, `trace_id`, `user_id`, `workshop_id`, `rating` (legacy), `ratings` (JSON dict of question_id -> score), `comment`, `mlflow_trace_id`, `created_at`
- **Ratings are keyed by rubric question UUID** (e.g., `{"rubric_id_0": 4, "rubric_id_1": 5}`)
- Rubric questions are stored as pipe-delimited text in a rubric's `question` field, parsed by `parseRubricQuestions()`

### Existing API Endpoints
- `GET /workshops/{id}/annotations` -- returns list of `Annotation` objects (optionally filtered by `user_id`)
- `GET /workshops/{id}/annotations-with-users` -- returns annotations joined with user name/email/role (facilitator view)

### Existing Client Hooks
- `useUserAnnotations(workshopId, user)` -- user's own annotations
- `useFacilitatorAnnotations(workshopId)` -- all annotations with user details
- `useAnnotations(workshopId)` -- legacy, all annotations without user details

### Relevant Files
- `/server/routers/workshops.py` -- all workshop API endpoints (5579 lines)
- `/server/services/database_service.py` -- `get_annotations()`, `get_annotations_with_user_details()`
- `/server/models.py` -- `Annotation`, `AnnotationCreate` Pydantic models
- `/client/src/pages/AnnotationReviewPage.tsx` -- read-only annotation review
- `/client/src/components/AnnotationReviewPage.tsx` -- component version (similar)
- `/client/src/hooks/useWorkshopApi.ts` -- React Query hooks
- `/client/src/client/services/WorkshopsService.ts` -- generated API client
- `/client/src/utils/rubricUtils.ts` -- `parseRubricQuestions()` utility
- `/specs/ANNOTATION_SPEC.md` -- annotation specification

---

## Proposed Design

### Option A: Server-Side CSV Generation (Recommended)

Add a new backend endpoint that returns a CSV file directly as a streaming response. The frontend adds a download button that triggers a file download.

#### Backend: New Endpoint

**File**: `/server/routers/workshops.py`

```python
@router.get("/{workshop_id}/annotations/export-csv")
async def export_annotations_csv(
    workshop_id: str,
    user_id: str | None = None,
    db: Session = Depends(get_db),
):
    """Export annotations as a CSV file download.

    If user_id is provided, exports only that user's annotations.
    Otherwise exports all annotations (facilitator use case).
    """
    from fastapi.responses import StreamingResponse
    import csv
    import io

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get annotations with user details
    annotations = db_service.get_annotations_with_user_details(workshop_id, user_id)

    # Get rubric to map question IDs to human-readable titles
    rubric = db_service.get_rubric(workshop_id)
    question_map = {}  # question_id -> title
    if rubric and rubric.question:
        from server.utils.rubric_utils import parse_rubric_questions
        questions = parse_rubric_questions(rubric.question)
        for i, q in enumerate(questions):
            question_id = f"{rubric.id}_{i}"
            question_map[question_id] = q["title"]

    # Build CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "trace_id", "mlflow_trace_id", "user_name", "user_email",
        "user_role", "question_title", "question_id", "rating",
        "comment", "created_at"
    ])

    # One row per annotation-question pair
    for ann in annotations:
        ratings = ann.get("ratings") or {}
        if ratings:
            for q_id, rating_value in ratings.items():
                writer.writerow([
                    ann["trace_id"],
                    ann.get("mlflow_trace_id", ""),
                    ann["user_name"],
                    ann["user_email"],
                    ann["user_role"],
                    question_map.get(q_id, q_id),
                    q_id,
                    rating_value,
                    ann.get("comment", ""),
                    ann.get("created_at", ""),
                ])
        else:
            # Legacy single-rating format
            writer.writerow([
                ann["trace_id"],
                ann.get("mlflow_trace_id", ""),
                ann["user_name"],
                ann["user_email"],
                ann["user_role"],
                "(legacy single rating)",
                "",
                ann.get("rating", ""),
                ann.get("comment", ""),
                ann.get("created_at", ""),
            ])

    output.seek(0)
    filename = f"annotations_{workshop_id}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

#### Frontend: Download Button

**Where to add it**: The facilitator's annotation monitoring view. A simple approach using `window.open()` or an anchor tag to hit the endpoint directly (since it returns a file, no need for fetch/JSON parsing).

```tsx
// In the facilitator's annotation review/monitoring area
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OpenAPI } from '@/client';

function ExportCSVButton({ workshopId, disabled }: { workshopId: string; disabled?: boolean }) {
  const handleExport = () => {
    const baseUrl = OpenAPI.BASE || '';
    const url = `${baseUrl}/workshops/${workshopId}/annotations/export-csv`;
    window.open(url, '_blank');
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled}
    >
      <Download className="h-4 w-4 mr-2" />
      Export CSV
    </Button>
  );
}
```

**Placement locations** (in priority order):
1. `AnnotationReviewPage` (both `/client/src/pages/` and `/client/src/components/` versions) -- next to the page header
2. `DBSQLExportPage` -- as a lightweight alternative to the full DBSQL export
3. `JudgeTuningPage` -- where facilitators already view all annotations

### Option B: Client-Side CSV Generation (Simpler, No Backend Change)

Use the existing `useFacilitatorAnnotations` hook data and generate CSV in the browser using a library like `papaparse` or manual string building. Pros: no backend change. Cons: less control over formatting, requires all data in memory on client, harder to include rubric question titles.

---

## Recommended Approach: Option A

Server-side generation is the better fit because:
1. The `get_annotations_with_user_details()` service method already returns the joined data needed
2. Rubric question title resolution is easier on the server (direct DB access)
3. No new client dependencies needed
4. The CSV is generated on demand, not cached, so it always reflects current state
5. Works naturally as a file download without complex client state management

---

## Implementation Plan

### Step 1: Backend Endpoint
- Add `GET /workshops/{workshop_id}/annotations/export-csv` to `/server/routers/workshops.py`
- Accept optional `user_id` query param for user-scoped exports
- Join annotations with rubric question titles for human-readable output
- Return `StreamingResponse` with `Content-Disposition: attachment`
- Handle edge cases: no annotations (return CSV with headers only), legacy rating format

### Step 2: Frontend Button
- Add `ExportCSVButton` component (or inline) to the facilitator annotation view
- Use `window.open()` pointing to the new endpoint for simple file download
- Disable button when no annotations exist
- Use the `Download` icon from lucide-react (already used in `DBSQLExportPage`)

### Step 3: Authentication Guard
- The endpoint should respect the same auth as other annotation endpoints
- If auth is cookie/session-based, `window.open()` will carry credentials automatically
- If token-based, may need to use `fetch()` + `Blob` + `URL.createObjectURL()` pattern instead

### Step 4: OpenAPI Regeneration
- After adding the endpoint, regenerate the TypeScript client: the generated `WorkshopsService` will pick up the new method
- However, for a file download endpoint, the generated client may not handle binary responses well -- the `window.open()` approach sidesteps this

### Step 5: Testing
- **Backend**: pytest for the new endpoint -- mock DB service, verify CSV content and headers
- **Frontend**: Vitest unit test for the button component -- verify it renders, verify the URL construction
- **E2E**: Playwright test that clicks the button and verifies a file download occurs

---

## CSV Format Example

```csv
trace_id,mlflow_trace_id,user_name,user_email,user_role,question_title,question_id,rating,comment,created_at
trace-abc,mlflow-123,Jane Doe,jane@example.com,sme,Response Quality,rubric1_0,4,"Good response overall",2026-03-10T14:30:00
trace-abc,mlflow-123,Jane Doe,jane@example.com,sme,Factual Accuracy,rubric1_1,5,"Good response overall",2026-03-10T14:30:00
trace-abc,mlflow-123,Bob Smith,bob@example.com,participant,Response Quality,rubric1_0,3,"Needs improvement",2026-03-10T15:00:00
trace-abc,mlflow-123,Bob Smith,bob@example.com,participant,Factual Accuracy,rubric1_1,4,"Needs improvement",2026-03-10T15:00:00
```

Note: The comment is repeated for each question row since it is per-annotation, not per-question. An alternative design would put the comment only on the first row for each annotation, or add a separate "annotation_id" column and deduplicate comments.

---

## Estimated Effort

| Task | Effort |
|------|--------|
| Backend endpoint | ~30 min |
| Frontend button + placement | ~20 min |
| Tests (backend + frontend) | ~30 min |
| OpenAPI regen + verification | ~10 min |
| **Total** | **~1.5 hours** |

---

## Risks and Considerations

1. **Large exports**: For workshops with thousands of annotations, streaming the CSV is important. The proposed `StringIO` approach loads everything in memory. For very large datasets, switch to a true streaming generator.
2. **Authentication**: If the app uses token-based auth, `window.open()` will not carry the Authorization header. Would need a fetch-based download approach instead.
3. **Comment escaping**: Python's `csv.writer` handles quoting/escaping of commas and newlines in comments correctly by default.
4. **Spec update**: `ANNOTATION_SPEC.md` should be updated with the new endpoint and export capability as a success criterion.
5. **Role permissions**: Consider whether only facilitators should export all annotations, or if participants/SMEs can export their own subset.
