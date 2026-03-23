# Annotation Specification

## Overview

This specification defines the annotation system for the Human Evaluation Workshop, including how users submit ratings, edit previous annotations, handle multi-line comments, and receive appropriate feedback through notifications.

## MLflow Integration Context

### Annotations as MLflow Feedback

Workshop annotations are the human-generated ground truth that ultimately becomes [MLflow Feedback](https://mlflow.org/docs/latest/genai/assessments/feedback/). The flow is:

```
┌─────────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│  Workshop UI        │      │  Workshop Database  │      │  MLflow Feedback    │
│  (Annotation Demo)  │ ───▶ │  (annotations table)│ ───▶ │  (trace assessments)│
└─────────────────────┘      └─────────────────────┘      └─────────────────────┘
     Human raters              Local persistence           MLflow tracking
```

**Why this matters:**
- Annotations collected in the workshop are exported as MLflow Feedback attached to traces
- MLflow Feedback enables judge alignment via `mlflow.genai.align()`
- The `include_in_alignment` tag on traces marks which feedback to use for training
- Multiple annotators on the same trace enable inter-rater reliability (IRR) measurement

### MLflow Feedback Schema Alignment

Workshop annotations map to MLflow Feedback fields:

| Workshop Field | MLflow Feedback Field | Notes |
|----------------|----------------------|-------|
| `ratings[question_id]` | `value` | Numeric score (Likert 1-5 or Binary 0/1) |
| `comment` | `rationale` | Free-text explanation |
| `user_id` | `source.id` | Annotator identifier |
| `trace_id` | Associated trace | Links feedback to trace |
| Rubric question | `name` | What aspect is being evaluated |

See [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md) for details on how feedback is used in judge alignment.

## Core Concepts

### Annotation
- A user's evaluation of a trace against rubric criteria
- Contains one or more ratings (Likert or binary) and an optional comment
- Supports editing after initial submission
- Persisted to database with full audit trail

### Rating
- Numeric score for a rubric question
- **Likert scale**: 1-5 integer values
- **Binary scale**: 0 (Fail) or 1 (Pass)
- Each rubric question has its own rating

### Comment
- Free-form text feedback on a trace
- Supports multi-line input with newline preservation
- Optional field (can be null)
- Trimmed on save (leading/trailing whitespace removed, internal newlines preserved)

## Annotation Lifecycle

### New Annotation Flow

```
New Annotation:
1. User views unannotated trace
2. User provides ratings for each rubric question
3. User optionally adds comment
4. User clicks Next or Previous to navigate
5. System detects this is new (not in submittedAnnotations)
6. System saves annotation to database
7. Toast shows: "Annotation saved!"
8. Trace marked as submitted
```

### Edit Annotation Flow

```
Edit Annotation:
1. User navigates to previously annotated trace
2. System loads existing annotation (ratings + comment)
3. System stores original values for comparison
4. User modifies ratings and/or comment
5. User clicks Next or Previous to navigate
6. System compares current values to original
7. If changed:
   a. System saves updated annotation
   b. Toast shows: "Annotation updated!"
8. If unchanged:
   a. No save operation
   b. No toast notification
```

### View-Only Navigation

```
View Without Edit:
1. User navigates to previously annotated trace
2. User views but doesn't change anything
3. User clicks Next or Previous
4. System detects no changes (hasAnnotationChanged() = false)
5. No save operation, no toast
6. Silent navigation to next trace
```

## Change Detection

### Algorithm

The `hasAnnotationChanged()` function compares current values against stored originals:

```typescript
function hasAnnotationChanged(): boolean {
  // Compare ratings
  for (const questionId of rubricQuestionIds) {
    if (currentRatings[questionId] !== originalRatings[questionId]) {
      return true;
    }
  }

  // Compare comments (trimmed)
  const currentTrimmed = (currentComment || '').trim();
  const originalTrimmed = (originalComment || '').trim();
  if (currentTrimmed !== originalTrimmed) {
    return true;
  }

  return false;
}
```

### State Management

```typescript
// Current values (user can modify)
const [ratings, setRatings] = useState<Record<string, number>>({});
const [comment, setComment] = useState<string>('');

// Original values (for comparison)
const [originalRatings, setOriginalRatings] = useState<Record<string, number>>({});
const [originalComment, setOriginalComment] = useState<string>('');
```

When loading an existing annotation:
1. Set both current and original values
2. Original values remain unchanged until next load
3. Current values update as user interacts

## Comment Handling

### Newline Preservation

Comments support multi-line text with full newline preservation throughout the stack:

| Layer | Handling |
|-------|----------|
| Input (textarea) | Native HTML textarea captures newlines |
| State | Stored as string with `\n` characters |
| API Submission | `comment.trim() \|\| null` (preserves internal newlines) |
| Database | `Text` column stores newlines as-is |
| API Response | Returns with newlines intact |
| Display | CSS `whitespace-pre-wrap` renders newlines |

### CSS Requirements

All comment display locations must use:

```css
.comment-display {
  white-space: pre-wrap;
}
```

This ensures:
- Newlines (`\n`) render as line breaks
- Multiple spaces preserved
- Long lines wrap to container width
- No horizontal scrolling

### Textarea Styling

```tsx
<textarea
  className="whitespace-pre-wrap"
  style={{ whiteSpace: 'pre-wrap' }}
  value={comment}
  onChange={(e) => setComment(e.target.value)}
/>
```

## Notification Behavior

### Toast Messages

| Scenario | Toast Message | When Shown |
|----------|---------------|------------|
| New annotation saved | "Annotation saved!" | After first submission |
| Annotation updated | "Annotation updated!" | After editing changes |
| No changes made | (none) | Silent navigation |

### Key Principle

**Only show notifications when meaningful action occurs.** Navigating through previously-annotated traces without changes should be silent.

## Data Model

### Annotation Table

```sql
CREATE TABLE annotations (
  id VARCHAR PRIMARY KEY,
  trace_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  workshop_id VARCHAR NOT NULL,
  ratings JSON NOT NULL,        -- {"question_id": rating_value, ...}
  comment TEXT,                  -- Nullable, supports newlines
  created_at DATETIME,
  updated_at DATETIME,
  UNIQUE(trace_id, user_id, workshop_id)
);
```

### Ratings Format

```json
{
  "question_uuid_1": 4,
  "question_uuid_2": 5,
  "question_uuid_3": 1
}
```

For binary scale:
```json
{
  "question_uuid_1": 1,
  "question_uuid_2": 0
}
```

## API Endpoints

### Submit/Update Annotation

```
PUT /workshops/{workshop_id}/annotations
```

Request body:
```json
{
  "trace_id": "string",
  "user_id": "string",
  "ratings": {"question_id": number},
  "comment": "string or null"
}
```

Behavior: Upsert (create if new, update if exists)

### Get Annotation

```
GET /workshops/{workshop_id}/annotations/{trace_id}?user_id={user_id}
```

Response:
```json
{
  "id": "string",
  "trace_id": "string",
  "ratings": {"question_id": number},
  "comment": "string or null",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

## Implementation

### File: `client/src/pages/AnnotationDemo.tsx`

Key implementation points:

1. **State initialization** - Track both current and original values
2. **Load existing annotation** - Populate both current and original on trace change
3. **Change detection** - Compare before save operations
4. **Conditional save** - Only save when changes detected or new annotation
5. **Conditional toast** - Only notify when action meaningful
6. **Navigation handling** - Save on Next/Previous, not on explicit button

### Legacy Format Support

The system supports both single-rating (legacy) and multi-rating (current) formats:

```typescript
// Legacy: single rating field
{ rating: 4, comment: "..." }

// Current: multiple ratings
{ ratings: { q1: 4, q2: 5 }, comment: "..." }
```

Load logic detects format and normalizes to current structure.

## Success Criteria

### Core Annotation Behavior

- [ ] Users can edit previously submitted annotations
- [ ] Changes automatically save on navigation (Next/Previous)
- [ ] Toast shows "Annotation saved!" for new submissions
- [ ] Toast shows "Annotation updated!" only when changes detected
- [ ] No toast when navigating without changes
- [ ] Multi-line comments preserved throughout the stack
- [ ] Comments display with proper line breaks
- [ ] Next button enabled for annotated traces (allows re-navigation)
- [ ] Annotation count reflects unique submissions (not re-submissions)

### MLflow Sync

- [ ] Annotations sync to MLflow as feedback on save (one entry per rubric question)
- [ ] MLflow trace tagged with `label: "align"` and `workshop_id` on annotation
- [ ] Feedback source is HUMAN with annotator's user_id
- [ ] Annotation comment maps to MLflow feedback rationale
- [ ] Duplicate feedback entries are detected and skipped
- [ ] Bulk resync re-exports all annotations when rubric titles change

### Save Reliability

- [ ] Failed saves are queued and retried automatically with exponential backoff
- [ ] Navigation is optimistic (UI advances immediately, save completes in background)
- [ ] Navigation debounced at 300ms to prevent duplicate saves

### Freeform Questions

- [ ] Freeform question responses are optional (not required for navigation)
- [ ] Freeform responses are encoded in the comment field as JSON

### Backwards Compatibility

- [ ] Legacy single-rating format loads correctly alongside multi-rating format

## Testing Scenarios

### Test 1: New Annotation
1. Navigate to unannotated trace
2. Provide ratings
3. Click Next
4. Verify toast: "Annotation saved!"
5. Navigate back, verify values persisted

### Test 2: Edit Annotation
1. Navigate to annotated trace
2. Change a rating
3. Click Next
4. Verify toast: "Annotation updated!"
5. Navigate back, verify changes persisted

### Test 3: View Without Change
1. Navigate to annotated trace
2. Don't change anything
3. Click Next
4. Verify NO toast appears

### Test 4: Multi-line Comment
1. Enter comment with multiple lines
2. Save annotation
3. Navigate away and back
4. Verify all newlines preserved

### Test 5: Comment-Only Edit
1. Navigate to annotated trace
2. Change only the comment (not ratings)
3. Click Next
4. Verify toast: "Annotation updated!"

## Backwards Compatibility

- All existing annotations continue to work
- Database schema unchanged
- API endpoints unchanged (upsert logic handles both create and update)
- Legacy single-rating format supported alongside multi-rating format
