# Rubric Question Format Update

## Problem

The previous implementation used double newlines (`\n\n`) to separate rubric questions. This caused issues when users added newlines within question descriptions - the description would be incorrectly split into multiple questions.

### Example of the Problem

**Input by user:**
```
Question Title: First, try power cycling your router by unplugging it from the power source,
Question Description: First, try power cycling your router by unplugging it from the power source,
waiting about 30 seconds, and then plugging it back in.
```

**What happened with old format:**
When stored and parsed, the double newline in the description would split it into separate questions.

## Solution

Changed the delimiter from double newlines (`\n\n`) to a special delimiter (`|||QUESTION_SEPARATOR|||`) that will not appear in user input. This allows question descriptions to contain any number of newlines without breaking the parsing logic.

## Changes Made

### Backend Changes

1. **`server/services/database_service.py`**
   - Updated `_parse_rubric_questions()` to use the new delimiter
   - Updated `_reconstruct_rubric_questions()` to use the new delimiter
   - Added empty part filtering to handle edge cases

2. **`server/routers/workshops.py`**
   - Updated annotation migration endpoint to use the new delimiter

3. **`process_sqllite_db_mlflow.py`**
   - Updated rubric question parsing to use the new delimiter

### Frontend Changes

1. **Created new utility file: `client/src/utils/rubricUtils.ts`**
   - Centralized parsing and formatting logic
   - Exported shared constants and interfaces
   - Provides `parseRubricQuestions()` and `formatRubricQuestions()` functions

2. **Updated all files that parse rubric questions:**
   - `client/src/pages/RubricCreationDemo.tsx`
   - `client/src/pages/AnnotationDemo.tsx`
   - `client/src/pages/AnnotationReviewPage.tsx`
   - `client/src/pages/IRRResultsDemo.tsx`
   - `client/src/components/AnnotationReviewPage.tsx`
   - `client/src/components/RubricViewPage.tsx`

All now import and use the shared utility functions for consistent parsing.

## Testing

Tested the delimiter logic with various scenarios:
- ✅ Simple questions without newlines
- ✅ Questions with single newlines in descriptions
- ✅ Questions with double newlines in descriptions (the key fix)
- ✅ Multiple questions with mixed formatting

## Backwards Compatibility

⚠️ **Important**: Existing rubric data in the database that uses the old `\n\n` delimiter will need to be migrated.

### Migration Path

For existing workshops with rubric data:

1. **New questions** created after this update will automatically use the new delimiter
2. **Existing questions** will continue to work if they don't have newlines in descriptions
3. **Existing questions with newlines** may appear incorrectly split until migrated

If you have existing rubric data that needs migration, you can:
- Re-create the rubric questions through the UI, or
- Run a database migration script (to be created if needed)

## Delimiter Choice

We chose `|||QUESTION_SEPARATOR|||` because:
- It's highly unlikely to appear in user input
- It's human-readable for debugging
- It's a simple string (no special regex characters)
- It's consistent across frontend and backend

Alternative delimiters considered but not used:
- JSON format (more complex, harder to read in DB)
- UUID-based separators (less readable)
- Special Unicode characters (potential encoding issues)

