# Release v1.3.0

## 🎯 Binary Judge Evaluation Fix

This release fixes a critical issue where MLflow binary judges were returning Likert-scale values (e.g., 3.0) instead of binary 0/1 values, causing all evaluations to be rejected.

## 🐛 Bug Fixes

### Binary Judge Returns Wrong Values

**Problem:** When using a binary rubric (expecting 0 or 1 / PASS or FAIL), MLflow was returning `3.0` (Likert-style) instead of binary values. All evaluations were rejected as invalid.

**Root Cause:** 
1. `feedback_value_type=bool` doesn't force models to output boolean values - it only affects parsing
2. Prompt instructions were appended at the end where models pay less attention
3. No fallback handling for when models ignore binary format instructions

**Solution (3 Fixes):**

1. **Strong Binary Prompt Instructions (Prepended)**
   ```python
   # Before: Weak instruction appended at end
   prompt += "Return 1 if meets criteria, 0 if not."
   
   # After: Strong instructions PREPENDED to prompt
   binary_prefix = """## CRITICAL OUTPUT FORMAT REQUIREMENT
   You are a BINARY judge. Output EXACTLY "0" or "1"...
   """
   prompt = binary_prefix + prompt
   ```

2. **Use `float` Instead of `bool`**
   ```python
   # Before (unreliable)
   feedback_type = bool
   
   # After (more reliable)
   feedback_type = float
   ```

3. **Fallback Threshold Conversion**
   ```python
   # If model returns Likert-style (1-5), convert to binary:
   # >= 3 = PASS (1.0)
   # < 3 = FAIL (0.0)
   if 1 <= value <= 5:
       binary_value = 1.0 if value >= 3 else 0.0
   ```

### Database Indentation Error

Fixed `IndentationError` in `server/database.py` that prevented server startup due to mixed 2-space and 4-space indentation.

## ✨ New Features

### MLflow GenAI Claude Skills

Added comprehensive Claude skills for MLflow GenAI in `.cursor/skills/`:

| Skill | Description |
|-------|-------------|
| `mlflow-genai.md` | Core APIs, judge types, model URIs, common issues |
| `mlflow-genai-evaluation.md` | make_judge API, binary/Likert patterns, validation |
| `mlflow-genai-tracing.md` | Autologging, searching traces, OpenTelemetry |

These skills provide context-aware assistance when working with MLflow GenAI evaluation code.

## 📊 Expected Behavior After Upgrade

**Before v1.3.0:**
```
🔍 Raw MLflow response: type=<class 'float'>, value=3.0
ERROR: Invalid binary rating 3.0 - must be 0 or 1, rejecting
Extracted 0/10 evaluations with scores
```

**After v1.3.0:**
```
🔍 Raw MLflow response: type=<class 'float'>, value=3.0
⚠️ FALLBACK: Model returned Likert-style 3.0 - converting to 1.0 using threshold (>=3 = PASS)
Extracted 10/10 evaluations with scores
```

## 🔧 Files Changed

- `server/services/alignment_service.py` - Binary judge fixes
- `server/database.py` - Indentation fix
- `doc/CHANGELOG.md` - Updated changelog
- `.cursor/skills/mlflow-genai*.md` - New skills (3 files)

## 📋 Upgrade Instructions

1. Pull the latest changes:
   ```bash
   git pull origin main
   ```

2. Restart the server:
   ```bash
   uv run uvicorn server.app:app --reload --port 8000
   ```

3. Re-run any failed binary judge evaluations - they should now succeed with the fallback conversion.

## 🔗 Related Documentation

- [MLflow GenAI Documentation](https://mlflow.org/docs/latest/genai/)
- [CHANGELOG.md](CHANGELOG.md) - Full version history
