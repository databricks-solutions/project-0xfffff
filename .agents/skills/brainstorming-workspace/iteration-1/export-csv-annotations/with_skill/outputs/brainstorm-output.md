# Brainstorming: Export Annotations as CSV

## Step 1: Find the Governing Spec

Searched `/specs/README.md` keyword index for "annotation", "CSV export", and "export".

**Results:**
- "annotation" -> [ANNOTATION_SPEC](../../../../../specs/ANNOTATION_SPEC.md)
- "CSV export" -> [UI_COMPONENTS_SPEC](../../../../../specs/UI_COMPONENTS_SPEC.md)

Two specs are relevant. The ANNOTATION_SPEC governs annotation data and lifecycle. The UI_COMPONENTS_SPEC governs CSV export (currently only for TraceDataViewer table data, not annotations).

## Step 2: Read the Specs

### ANNOTATION_SPEC findings
- Annotations contain: `trace_id`, `user_id`, `workshop_id`, `ratings` (JSON dict of question_id -> numeric value), `comment` (nullable text), `created_at`, `updated_at`
- Annotations map to MLflow Feedback: `ratings -> value`, `comment -> rationale`, `user_id -> source.id`
- Existing API endpoints:
  - `GET /workshops/{workshop_id}/annotations` — returns annotations, filterable by `user_id`
  - `GET /workshops/{workshop_id}/annotations-with-users` — returns annotations joined with user details (name, email, role)
- No existing success criteria mention CSV export of annotations

### UI_COMPONENTS_SPEC findings
- CSV export exists only for TraceDataViewer (trace table data)
- Success criterion: "CSV export includes all table data" — this is about trace data tables, not annotations
- Existing `downloadAsCSV()` pattern in `TraceDataViewer.tsx` creates a Blob, builds CSV content with proper escaping, and triggers download via a temporary anchor element

## Step 3: Assess the Situation

**Decision: Spec Exists but Doesn't Cover This Work.**

The ANNOTATION_SPEC governs annotations, but none of its success criteria address exporting annotations as CSV. The UI_COMPONENTS_SPEC has a CSV export pattern, but only for trace data tables. This feature falls in the gap between these two specs — annotation data + CSV export functionality.

The ANNOTATION_SPEC needs new success criteria for CSV export.

## Step 4: Socratic Exploration (Clarifying Questions)

### Q1: What problem does this solve?

> **Clarifying question:** What's the primary use case for exporting annotations as CSV?
> - (a) Facilitators analyzing annotation quality/consistency offline (e.g., in Excel/Sheets)
> - (b) Data pipeline integration — feeding annotations into external analysis tools
> - (c) Archival/backup of annotation data
> - (d) Sharing results with stakeholders who don't have workshop access

**Self-answer:** Most likely (a) and (d). Facilitators need to review and share annotation results. The workshop is a collaborative evaluation platform — at some point the facilitator needs to extract results. I'll assume the primary audience is facilitators who want to analyze or share annotation data outside the workshop. This also supports (c) as a secondary benefit.

### Q2: Who should be able to export?

> **Clarifying question:** Who should have access to the export button?
> - (a) Only facilitators (they manage the workshop)
> - (b) Facilitators and SMEs
> - (c) Any logged-in user (participants can export their own annotations)

**Self-answer:** (a) is the safest default. The `annotations-with-users` endpoint is already described as "for facilitator view." Facilitators oversee the workshop and are the natural consumers of aggregate annotation data. Participants can already review their own annotations in the AnnotationReviewPage. Exporting all annotations (including other users' data) should be a facilitator privilege. I'll go with facilitator-only export of all annotations.

### Q3: What data should be in the CSV?

> **Clarifying question:** What columns should the CSV contain?
> - (a) Flat format: one row per annotation, with ratings as separate columns per rubric question
> - (b) Narrow format: one row per rating (annotation x question), more database-like
> - (c) Both options available

**Self-answer:** (a) is most useful for analysis. One row per annotation with columns: `trace_id`, `user_name`, `user_email`, `user_role`, then one column per rubric question (using the question title as the header), then `comment`, `created_at`. This maps naturally to a spreadsheet where each row is one person's evaluation of one trace. The ratings JSON should be "unpacked" into separate columns using the rubric question titles as headers. This matches how facilitators think about the data.

### Q4: Where should the button live?

> **Clarifying question:** Where in the UI should the export button be placed?
> - (a) On the facilitator's annotation results/review page
> - (b) On the workshop settings/management page
> - (c) In the workshop header/toolbar area

**Self-answer:** (a) makes the most sense. The facilitator already has a view of annotations. The export button should be adjacent to where they see annotation data. Looking at the codebase, `AnnotationReviewPage` exists in both `client/src/pages/` (the facilitator's view with all annotations) and `client/src/components/` (participant's read-only view when paused). The button belongs in the facilitator's annotation overview — likely wherever annotations are listed. I'll assume there's a facilitator dashboard or results view; the button goes there.

### Q5: Should export happen client-side or server-side?

> **Clarifying question:** Should CSV generation happen in the browser or on the server?
> - (a) Client-side: fetch annotations via existing API, build CSV in JavaScript, trigger download
> - (b) Server-side: new endpoint returns CSV file directly with proper Content-Type headers

**Self-answer:** (a) client-side is simpler and follows the existing pattern (TraceDataViewer's `downloadAsCSV()` already does this). The data is already available via `GET /annotations-with-users`. No new backend endpoint needed. This is the YAGNI choice — server-side export only matters for very large datasets, and workshop annotation counts are typically manageable in-browser.

### Q6: What's explicitly out of scope?

**Self-answer:**
- Filtering which annotations to export (export all for the workshop)
- Custom column selection
- Other export formats (XLSX, JSON export — JSON is already available via the API)
- Server-side CSV generation endpoint
- Export of trace content alongside annotations (too much data; trace_id is sufficient for joining)
- Scheduled/automated exports

## Step 5: Proposed Approaches

### Approach A: Client-Side CSV with Rubric-Aware Column Headers (Recommended)

**How it works:**
1. Facilitator clicks "Export Annotations (CSV)" button
2. Frontend fetches annotations via existing `GET /workshops/{id}/annotations-with-users` endpoint
3. Frontend fetches rubric via existing rubric endpoint to get question titles
4. JavaScript builds CSV: maps `ratings` JSON keys to rubric question titles as column headers
5. Downloads via Blob + temporary anchor (matching existing TraceDataViewer pattern)

**Columns:**
```
trace_id, mlflow_trace_id, annotator_name, annotator_email, annotator_role, <Question 1 Title>, <Question 2 Title>, ..., comment, created_at
```

**Trade-offs:**
- (+) No backend changes needed
- (+) Follows existing CSV export pattern in codebase
- (+) Rubric question titles as headers are human-readable
- (-) Large annotation sets could be slow in-browser (unlikely in practice)
- (-) If rubric changes, column headers reflect current rubric, not the rubric at annotation time

### Approach B: Server-Side CSV Endpoint

**How it works:**
1. New endpoint: `GET /workshops/{id}/annotations/export?format=csv`
2. Server builds CSV with streaming response
3. Frontend triggers download via direct link/fetch

**Trade-offs:**
- (+) Handles large datasets better
- (+) Server has direct access to rubric + annotations in one query
- (-) New endpoint to maintain
- (-) More complex (streaming response, proper headers)
- (-) Overkill for expected data sizes

### Approach C: Client-Side with Configurable Columns

Like Approach A but with a modal letting the facilitator choose which columns to include.

**Trade-offs:**
- (+) More flexible
- (-) Significantly more UI complexity
- (-) YAGNI — facilitators can delete columns in Excel

**Recommendation: Approach A.** It's the simplest, follows existing patterns, needs no backend changes, and serves the core use case. If data sizes become a problem later, Approach B can be added without breaking anything.

## Step 6: Design

### Architecture

```
+---------------------------+
|  Facilitator View         |
|  (Export button)          |
|         |                 |
|         v                 |
|  useExportAnnotationsCSV  |  <- new hook
|    |           |          |
|    v           v          |
|  Fetch       Fetch        |
|  Annotations  Rubric      |
|    |           |          |
|    v           v          |
|  buildAnnotationCSV()     |  <- new utility function
|         |                 |
|         v                 |
|  triggerDownload()        |  <- reuse existing pattern
+---------------------------+
```

### Components

**1. `buildAnnotationCSV(annotations, rubricQuestions)` utility function**
- Location: `client/src/utils/csvExport.ts` (new file)
- Purpose: Converts annotation data + rubric question metadata into a CSV string
- Input: Array of annotation-with-user objects, array of parsed rubric questions
- Output: CSV string with proper escaping (commas, quotes, newlines in comments)
- Unit: Pure function, easily testable

**2. `useExportAnnotationsCSV(workshopId)` hook**
- Location: `client/src/hooks/useExportAnnotationsCSV.ts` (new file)
- Purpose: Orchestrates fetching data and triggering download
- Depends on: existing `useWorkshopApi` hooks for annotations-with-users and rubric
- Returns: `{ exportCSV: () => void, isExporting: boolean }`
- Handles: loading state, error toasts, filename generation (`annotations_<workshop_id>_<date>.csv`)

**3. Export button in facilitator view**
- Location: Added to the appropriate facilitator annotation overview page
- UI: Button with download icon, "Export CSV" label
- States: Default, loading (spinner + "Exporting..."), disabled when no annotations
- Design: Follows existing button patterns in the codebase (Tailwind, lucide-react icons)

### Data Flow

1. User clicks "Export CSV"
2. Hook sets `isExporting = true`
3. Hook fetches `GET /workshops/{id}/annotations-with-users` (all users)
4. Hook fetches rubric for question title mapping
5. `buildAnnotationCSV()` constructs the CSV:
   - Header row: `trace_id, mlflow_trace_id, annotator_name, annotator_email, annotator_role, [question titles...], comment, created_at`
   - Data rows: one per annotation, ratings unpacked by question ID -> title mapping
   - Comments escaped for CSV (quotes doubled, field wrapped in quotes if it contains commas/newlines/quotes)
6. Create Blob, create temporary anchor, trigger download, revoke URL
7. Toast: "Exported {N} annotations"
8. Hook sets `isExporting = false`

### CSV Escaping Rules

Following RFC 4180 and matching the existing `TraceDataViewer.downloadAsCSV()` pattern:
- Fields containing commas, double quotes, or newlines are enclosed in double quotes
- Double quotes within fields are escaped by doubling them (`"` -> `""`)
- Newlines within comments are preserved (enclosed in quotes)

### Error Handling

- No annotations exist: Button disabled with tooltip "No annotations to export"
- Fetch fails: Toast error "Failed to export annotations"
- Rubric not found: Fall back to question IDs as column headers instead of titles

### Testing Approach

- **Unit test** (`buildAnnotationCSV`): Pure function, test with various annotation shapes, special characters in comments, missing ratings, empty annotations
- **Unit test** (hook): Mock API calls, verify download trigger, verify loading states
- **E2E test**: Facilitator clicks export, verify file downloads (Playwright can intercept downloads)

## Step 7: Proposed Spec Additions

The ANNOTATION_SPEC needs new success criteria. These would be added under a new category:

### Proposed additions to ANNOTATION_SPEC Success Criteria:

```markdown
### CSV Export
- [ ] Facilitator can export all workshop annotations as a CSV file
- [ ] CSV contains one row per annotation with columns: trace_id, annotator details, per-question ratings, comment, timestamp
- [ ] Rubric question titles used as column headers for rating columns
- [ ] Comments with newlines and special characters properly escaped in CSV
- [ ] Export button disabled when no annotations exist
- [ ] Toast notification confirms export with annotation count
```

### Proposed additions to `/specs/README.md` Keyword Search Index:

Under **Annotation System**:
```markdown
- **export annotations** -> [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **annotation CSV** -> [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **download annotations** -> [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **buildAnnotationCSV** -> [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
```

**[WAITING FOR APPROVAL]** — Normally I would stop here and present these spec additions to the user before proceeding. Continuing with the assumption that the proposed spec additions and design (Approach A) are approved.

## Step 8: Transition

With the design approved, the next step would be to invoke the `writing-plans` skill to create a detailed implementation plan. The plan would cover:

1. Create `client/src/utils/csvExport.ts` with `buildAnnotationCSV()` function
2. Create `client/src/hooks/useExportAnnotationsCSV.ts` hook
3. Add export button to the facilitator annotation view
4. Write unit tests for `buildAnnotationCSV` (special characters, missing data, multiple rubric questions)
5. Write unit tests for the export hook
6. Update ANNOTATION_SPEC with new success criteria
7. Update `/specs/README.md` with new keywords
8. Tag tests with `@req` markers linking to the new success criteria

**Terminal state reached. Next step: invoke `writing-plans` skill.**

---

## Summary

| Item | Decision |
|------|----------|
| Governing spec | ANNOTATION_SPEC (needs additions) |
| Approach | Client-side CSV generation (Approach A) |
| Who can export | Facilitators only |
| CSV format | One row per annotation, rubric question titles as column headers |
| Backend changes | None needed |
| New files | `csvExport.ts` (utility), `useExportAnnotationsCSV.ts` (hook) |
| Button location | Facilitator annotation overview |
| Spec updates | 6 new success criteria, 4 new keyword entries |
