# Rubric Specification

## Overview

This specification defines the rubric system for the Human Evaluation Workshop, including how evaluation criteria are structured, stored, parsed, and used across the annotation workflow. Rubrics support both Likert (1-5) and binary (Pass/Fail) scales.

## Core Concepts

### Rubric
- A collection of evaluation questions/criteria for rating traces
- Associated with a specific workshop
- Defines the evaluation framework for annotation phase
- Supports multiple scale types (Likert, Binary)

### Rubric Question
- A single evaluation criterion within a rubric
- Has a title (short label) and description (detailed guidance)
- Specifies the rating scale (Likert 1-5 or Binary 0/1)
- For binary scales, includes custom labels (e.g., "Good/Bad", "Pass/Fail")

### Scale Types

| Scale | Values | Use Case |
|-------|--------|----------|
| **Likert** | 1, 2, 3, 4, 5 | Nuanced quality assessment |
| **Binary** | 0 (Fail), 1 (Pass) | Pass/fail or categorical judgment |

## Data Model

### Rubric

```
Rubric:
  - id: UUID
  - workshop_id: UUID
  - name: string
  - questions: string          # Serialized question data (see format below)
  - judge_type: 'likert' | 'binary'
  - binary_labels: Optional[{pass: string, fail: string}]
  - created_at: timestamp
  - updated_at: timestamp
```

### Question Format (Serialized)

Questions are stored as a delimited string in the database:

```
Title 1
Description for question 1 that can span
multiple lines without breaking parsing
|||QUESTION_SEPARATOR|||
Title 2
Description for question 2
|||QUESTION_SEPARATOR|||
Title 3
Description for question 3
```

### Question Object (Parsed)

```typescript
interface RubricQuestion {
  id: string;           // Generated UUID
  title: string;        // First line of question block
  description: string;  // Remaining lines of question block
  judgeType: 'likert' | 'binary' | 'freeform';  // Per-question judge type
}
```

### Per-Question Judge Type

Each question can specify its own judge type using a delimiter:

```
Question Title [JUDGE_TYPE:binary]
Question description here
|||QUESTION_SEPARATOR|||
Another Question [JUDGE_TYPE:likert]
Description for likert scale question
```

**Delimiter**: `|||JUDGE_TYPE_DELIMITER|||` or `[JUDGE_TYPE:xxx]` format

**Parsing Logic**:
1. Check for `[JUDGE_TYPE:xxx]` in title
2. Extract judge type (binary, likert, freeform)
3. Remove delimiter from title for display
4. Default to 'likert' if not specified

This enables mixed rubrics where some questions use Pass/Fail and others use 1-5 scale.

## Delimiter System

### The Problem

Previous implementations used double newlines (`\n\n`) as the question delimiter. This broke when users included blank lines in question descriptions.

### The Solution

Use a unique delimiter that won't appear in user input:

```
|||QUESTION_SEPARATOR|||
```

### Why This Delimiter?

- Highly unlikely to appear in natural text
- Human-readable for debugging
- No special regex characters (simple string match)
- Consistent across frontend and backend

## Parsing & Formatting

### Shared Utility: `client/src/utils/rubricUtils.ts`

```typescript
const QUESTION_DELIMITER = '|||QUESTION_SEPARATOR|||';
const JUDGE_TYPE_DELIMITER = '|||JUDGE_TYPE_DELIMITER|||';

interface RubricQuestion {
  id: string;
  title: string;
  description: string;
  judgeType: 'likert' | 'binary' | 'freeform';
}

function parseRubricQuestions(raw: string): RubricQuestion[] {
  if (!raw || !raw.trim()) return [];

  const parts = raw.split(QUESTION_DELIMITER);

  return parts
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .map(part => {
      const lines = part.split('\n');
      let title = lines[0]?.trim() || '';
      const description = lines.slice(1).join('\n').trim();

      // Parse judge type from title
      let judgeType: 'likert' | 'binary' | 'freeform' = 'likert';
      const judgeTypeMatch = title.match(/\[JUDGE_TYPE:(\w+)\]/i);
      if (judgeTypeMatch) {
        judgeType = judgeTypeMatch[1].toLowerCase() as any;
        title = title.replace(/\s*\[JUDGE_TYPE:\w+\]/i, '').trim();
      }

      return {
        id: generateUUID(),
        title,
        description,
        judgeType,
      };
    });
}

function formatRubricQuestions(questions: RubricQuestion[]): string {
  return questions
    .map(q => `${q.title}${JUDGE_TYPE_DELIMITER}${q.judgeType}\n${q.description}`)
    .join(`\n${QUESTION_DELIMITER}\n`);
}
```

### Backend Parsing: `server/services/database_service.py`

```python
QUESTION_DELIMITER = '|||QUESTION_SEPARATOR|||'

def _parse_rubric_questions(raw: str) -> List[Dict]:
    if not raw or not raw.strip():
        return []

    parts = raw.split(QUESTION_DELIMITER)

    questions = []
    for part in parts:
        part = part.strip()
        if not part:
            continue

        lines = part.split('\n')
        title = lines[0].strip() if lines else ''
        description = '\n'.join(lines[1:]).strip()

        questions.append({
            'id': str(uuid.uuid4()),
            'title': title,
            'description': description,
        })

    return questions
```

## Judge Type Integration

### Likert Scale

```typescript
// Rubric definition
{
  judge_type: 'likert',
  binary_labels: null
}

// Rating UI shows: 1 2 3 4 5
// Rating values: integers 1-5
```

### Binary Scale

```typescript
// Rubric definition
{
  judge_type: 'binary',
  binary_labels: { pass: 'Good', fail: 'Bad' }
}

// Rating UI shows: [Bad] [Good]
// Rating values: 0 (Bad) or 1 (Good)
```

### Default Binary Labels

If no custom labels provided:
- Pass: "Pass"
- Fail: "Fail"

## Files Using Rubric Parsing

All these files import from `rubricUtils.ts`:

| File | Usage |
|------|-------|
| `RubricCreationDemo.tsx` | Create/edit rubric questions |
| `AnnotationDemo.tsx` | Display questions for rating |
| `AnnotationReviewPage.tsx` | Show questions in review |
| `IRRResultsDemo.tsx` | Display questions in IRR analysis |
| `RubricViewPage.tsx` | Read-only rubric display |

## API Endpoints

### Create Rubric

```
POST /workshops/{workshop_id}/rubric
{
  "name": "Quality Assessment",
  "questions": "Accuracy\nIs the response factually correct?\n|||QUESTION_SEPARATOR|||\nHelpfulness\nDoes the response address the user's need?",
  "judge_type": "likert"
}
```

### Get Rubric

```
GET /workshops/{workshop_id}/rubric

Response:
{
  "id": "uuid",
  "name": "Quality Assessment",
  "questions": "...",
  "judge_type": "likert",
  "binary_labels": null,
  "parsed_questions": [
    { "id": "uuid", "title": "Accuracy", "description": "..." },
    { "id": "uuid", "title": "Helpfulness", "description": "..." }
  ]
}
```

## Rubric Lifecycle

### CRUD Operations

Only one rubric exists per workshop. Create and update are upsert — `POST` and `PUT /workshops/{id}/rubric` both call the same underlying method. If a rubric exists, it is updated; otherwise a new one is created.

**Create/Add Question**: Facilitator opens the "Add Criterion" dialog and provides:
- **Title** (required) — short label for the criterion
- **Description/Definition** (required) — what the criterion measures
- **Positive direction** (optional) — what a good response looks like
- **Negative direction** (optional) — what a poor response looks like
- **Examples** (optional) — concrete good/bad examples
- **Evaluation type** — Likert, Binary, or Free-form (per-question)

The optional structured fields are serialized into the description text by the frontend.

**Edit Question**: Facilitator clicks the edit icon on an existing question card. The dialog pre-populates with the question's current data. Updates are sent via `PUT /workshops/{id}/rubric/questions/{question_id}`.

**Delete Question**: Facilitator clicks the delete icon. The question is removed from the serialized list and remaining questions are re-indexed sequentially (`q_1`, `q_2`, ...). If the last question is deleted, the entire rubric record is removed from the database. Annotation data for deleted questions is preserved in the database but excluded from IRR calculations and UI display.

**No phase restriction**: Rubric CRUD is allowed regardless of workshop phase — facilitators can refine criteria at any time.

### Phase Integration

- Workshop advances from Discovery to Rubric phase when at least one finding exists
- Rubric must exist before the workshop can advance from Rubric to Annotation phase
- `begin_annotation_phase()` also validates that a rubric exists before starting auto-evaluation

### MLflow Integration

On rubric create or update:
1. A workshop `judge_name` is auto-derived from the first rubric question title (e.g., "Response Accuracy" → `response_accuracy_judge`)
2. A background MLflow re-sync is triggered to update all annotation feedback entries with current judge names
3. MLflow sync is best-effort — failures are logged but do not block the rubric operation

### Rating Validation

Annotation submissions validate each rating against its question's judge type:
- **Binary**: only 0 or 1 accepted
- **Likert**: only 1–5 accepted
- If all ratings in a submission fail validation, existing annotation data is preserved (not overwritten)

## AI-Powered Rubric Generation

Facilitators can generate rubric suggestions using an AI model that analyzes discovery findings and participant notes.

### Workflow

1. Facilitator opens the suggestion panel and selects an AI model
2. System calls `POST /workshops/{id}/generate-rubric-suggestions` with endpoint name, temperature, and whether to include notes
3. Service fetches all discovery findings (grouped by trace, max 15) and participant notes (max 15)
4. AI returns a JSON array of suggested criteria
5. Facilitator can accept, reject, or edit each suggestion before adding it to the rubric

### Validation Rules

- At least one finding or note must exist (400 if both empty)
- Suggestions with title < 3 characters are filtered out
- Suggestions with description < 10 characters are filtered out
- Title truncated at 100 characters, description at 1000
- Invalid `judgeType` values default to `'likert'`
- If zero suggestions pass validation, the request fails

### No Phase Restriction

AI generation is allowed at any workshop phase — facilitators can regenerate or refine criteria at any time.

## Migration Considerations

### Existing Data

Rubrics created before the delimiter change use `\n\n` as separator:
- Questions without internal newlines: Parse correctly
- Questions with internal newlines: May split incorrectly

### Migration Options

1. **Re-create through UI**: Delete and recreate rubric
2. **Database update**: Run script to replace `\n\n` with new delimiter
3. **Graceful parsing**: Try new delimiter first, fall back to old

## Success Criteria

### Parsing & Serialization

- [ ] Questions with multi-line descriptions parse correctly
- [ ] Delimiter never appears in user input (by design)
- [ ] Frontend and backend use same delimiter constant
- [ ] Per-question judge_type parsed from `[JUDGE_TYPE:xxx]` format
- [ ] Parsed questions have stable UUIDs within session
- [ ] Empty/whitespace-only parts filtered out

### Scale Rendering

- [ ] Likert scale shows 1-5 rating options
- [ ] Binary scale shows Pass/Fail buttons (not star ratings)
- [ ] Binary feedback logged as 0/1 to MLflow (not 3)
- [ ] Mixed rubrics support different scales per question

### CRUD Lifecycle

- [ ] Facilitator can create a rubric question with title and description
- [ ] Facilitator can edit an existing rubric question
- [ ] Facilitator can delete a rubric question
- [ ] Only one rubric exists per workshop (upsert semantics)
- [ ] Rubric persists and is retrievable via GET after creation

### Phase & Workflow Integration

- [ ] Rubric required before advancing to annotation phase
- [ ] No phase restriction on rubric CRUD
- [ ] Question IDs re-indexed sequentially after deletion
- [ ] Annotation data preserved when rubric questions are deleted

### MLflow Integration

- [ ] Judge name auto-derived from first rubric question title
- [ ] MLflow re-sync triggered on rubric create/update (best-effort)

### AI-Powered Generation

- [ ] AI suggestions generated from discovery findings and participant notes
- [ ] Suggestions validated: title >= 3 chars, description >= 10 chars
- [ ] Invalid judge type in suggestions defaults to likert
- [ ] Facilitator can accept, reject, or edit suggestions before adding to rubric

## Testing Scenarios

### Test 1: Simple Questions
```
Input:
"Question 1\nDescription 1|||QUESTION_SEPARATOR|||Question 2\nDescription 2"

Expected:
[
  { title: "Question 1", description: "Description 1" },
  { title: "Question 2", description: "Description 2" }
]
```

### Test 2: Multi-line Description
```
Input:
"Question 1\nLine 1 of description\nLine 2 of description\n\nLine 3 after blank"

Expected:
[
  {
    title: "Question 1",
    description: "Line 1 of description\nLine 2 of description\n\nLine 3 after blank"
  }
]
```

### Test 3: Binary Scale
```
Rubric:
{ judge_type: 'binary', binary_labels: { pass: 'Acceptable', fail: 'Unacceptable' } }

UI shows: [Unacceptable] [Acceptable]  (Pass/Fail buttons, not star ratings)
Rating value for Acceptable: 1
Rating value for Unacceptable: 0

MLflow feedback logged: 0 or 1 (NOT 3 for neutral)
```

### Test 4: Per-Question Judge Type
```
Input:
"Accuracy [JUDGE_TYPE:binary]\nIs the response factually correct?|||QUESTION_SEPARATOR|||Helpfulness [JUDGE_TYPE:likert]\nRate helpfulness 1-5"

Expected:
[
  { title: "Accuracy", description: "Is the response factually correct?", judgeType: "binary" },
  { title: "Helpfulness", description: "Rate helpfulness 1-5", judgeType: "likert" }
]

UI shows:
- Question 1: Pass/Fail buttons
- Question 2: 1-5 star rating
```

### Test 5: Mixed Rubric Evaluation
```
Rubric with binary Question 1 and likert Question 2

When evaluating:
- Question 1 uses binary judge (0/1 output)
- Question 2 uses likert judge (1-5 output)
- Results stored with correct scale per question
```

## Backwards Compatibility

- Existing rubrics with old delimiter continue to work if no internal newlines
- New rubrics use new delimiter automatically
- API response includes both raw and parsed questions
- Legacy single-rating annotations supported alongside multi-rating
