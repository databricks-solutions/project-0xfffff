# Draft Rubric → Rubric Creation Design

## Problem

When the facilitator clicks "Create Rubric" in the discovery sidebar, they navigate to the rubric creation page which starts empty. The draft rubric items curated during discovery (promoted findings, grouped by theme) are not used to seed the initial rubric. The facilitator must manually re-create questions that already exist as draft items.

## Solution

A new backend endpoint converts draft rubric items into a saved rubric, using group structure to derive rubric questions. The frontend calls this endpoint before navigating to the rubric page.

## Mapping: Draft Items → Rubric Questions

| Draft State | Rubric Question |
|---|---|
| Group with name + N items | **title** = group name, **description** = bullet list of item texts |
| Ungrouped item (no group_id) | **title** = item text, **description** = empty |

All questions default to `LIKERT` judge type. The facilitator adjusts per-question on the rubric creation page.

Questions are ordered: grouped items first (by group name alphabetically), then ungrouped items in promotion order.

## Backend

### New Endpoint

`POST /workshops/{workshop_id}/create-rubric-from-draft`

**Logic:**

1. Fetch all `DraftRubricItem` records for the workshop
2. Require at least 1 item (return 400 if empty)
3. Group items by `group_id` / `group_name`
4. For each group: `group_name` → question title, bullet list of item texts → description
5. For each ungrouped item: item text → question title, empty description
6. Format using existing `QUESTION_SEPARATOR` delimiter with `JUDGE_TYPE` delimiter (all LIKERT)
7. Call existing `create_rubric()` to save (this handles create-or-update)
8. Return the created `Rubric`

**Response:** Standard `Rubric` model (same as `POST /{workshop_id}/rubric`)

**Error cases:**
- 404: Workshop not found
- 400: No draft rubric items exist

### Service Layer

Add `create_rubric_from_draft(workshop_id, created_by)` to `DiscoveryService` which:
- Reads draft items via existing `get_draft_rubric_items()`
- Performs the group → question mapping
- Formats the question string using the delimiter convention
- Delegates to `DatabaseService.create_rubric()` for persistence

## Frontend

### DraftRubricSidebar / FacilitatorDiscoveryWorkspace

Update the "Create Rubric" button handler:

1. Call `POST /workshops/{id}/create-rubric-from-draft` (with loading state)
2. On success: navigate to rubric page
3. On error: show toast with error message

### New React Query Hook

`useCreateRubricFromDraft(workshopId)` — mutation that:
- POSTs to the new endpoint
- Invalidates the rubric query cache on success

### RubricCreationDemo

No changes needed. It already loads from `useRubric()` and initializes questions from the API response.

## Question Format

The rubric `question` field uses this format (existing convention):

```
Group Name: - item 1 text\n- item 2 text|||JUDGE_TYPE|||likert|||QUESTION_SEPARATOR|||Ungrouped Item: |||JUDGE_TYPE|||likert
```

This is parsed by `parseRubricQuestions()` in `rubricUtils.ts`.

## Not In Scope

- Carrying source_trace_ids into rubric questions (they served their purpose as evidence anchors during discovery)
- Changing the rubric data model
- Modifying how RubricCreationDemo renders or saves questions
