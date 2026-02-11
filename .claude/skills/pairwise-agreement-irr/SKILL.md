---
name: pairwise-agreement-irr
description: "Pairwise Agreement Percentage for Inter-Rater Reliability (IRR). Use when (1) modifying IRR calculation or display, (2) changing agreement thresholds, (3) adding new rubric scale types (binary/Likert), (4) updating the IRR results page, (5) debugging why IRR scores look wrong, (6) understanding how agreement is calculated. Covers: pairwise agreement algorithm, binary vs Likert handling, per-metric scoring, Krippendorff's alpha as secondary detail, and frontend display."
---

# Pairwise Agreement Percentage for IRR

## Background

Replaces Krippendorff's Alpha (abstract -1 to 1 coefficient) with **pairwise agreement percentages** (0-100%) as the primary IRR metric. Inspired by the GDPval paper's approach: "71% inter-rater agreement" is immediately understandable, whereas "alpha = 0.45" requires statistical expertise.

Krippendorff's Alpha is retained as a secondary detail per metric.

## Key Files

| File | Responsibility |
|------|---------------|
| `server/services/pairwise_agreement.py` | Core algorithm: pairwise agreement calculation |
| `server/services/irr_service.py` | Orchestration: overall score, per-metric breakdown, judge loading |
| `server/services/irr_utils.py` | Shared: validation, formatting, problematic pattern detection |
| `server/services/krippendorff_alpha.py` | Secondary detail: alpha calculation (unchanged) |
| `client/src/pages/IRRResultsDemo.tsx` | Frontend: displays agreement percentages |
| `tests/unit/services/test_pairwise_agreement.py` | Tests for pairwise agreement |
| `tests/unit/services/test_irr_service.py` | Tests for IRR orchestration |
| `tests/unit/services/test_irr_utils.py` | Tests for shared utilities |

## Algorithm

For each metric (rubric question), per trace:

```
1. Group annotations by trace_id
2. For each trace with 2+ raters, enumerate all unique pairs: N*(N-1)/2
3. For each pair, check agreement:
   - Exact:    diff == 0
   - Adjacent: diff <= 1  (within +-1)
4. Agreement % = (agreeing_pairs / total_pairs) * 100
```

```python
# Core loop (from pairwise_agreement.py)
for trace_ratings in traces.values():
    n = len(trace_ratings)
    if n < 2:
        continue
    for i in range(n):
        for j in range(i + 1, n):
            total_pairs += 1
            diff = abs(trace_ratings[i] - trace_ratings[j])
            if mode == "adjacent" and diff <= 1:
                agreeing_pairs += 1
            elif mode == "exact" and diff == 0:
                agreeing_pairs += 1
```

## Binary vs Likert Handling

This is the most important design decision. Adjacent agreement is **meaningless for binary (0/1)** because |0-1| = 1, which is always <= 1, so adjacent agreement is always 100%.

### Detection

```python
# irr_service.py: _is_binary_metric()
def _is_binary_metric(annotations, question_id):
    ratings = [ann.ratings[question_id] for ann in annotations if ann.ratings and question_id in ann.ratings]
    return all(r in (0, 1) for r in ratings)
```

### Primary Metric Selection

| Scale | Primary Metric | Secondary | Why |
|-------|---------------|-----------|-----|
| Likert (1-5) | Adjacent agreement (within +-1) | Exact agreement | Rating 3 vs 4 is reasonable disagreement |
| Binary (0/1) | Exact agreement | N/A | Adjacent is always 100% (meaningless) |

```python
# irr_service.py: _calculate_pairwise_agreement_result()
for question_id, scores in per_metric_agreement.items():
    is_binary = _is_binary_metric(annotations, question_id)
    if is_binary:
        primary_scores.append(scores["exact_agreement"])
    else:
        primary_scores.append(scores["adjacent_agreement"])
```

### Frontend Display

```
Likert metric:  "Adjacent Agreement (within +-1): 85.0%"
                "Exact agreement: 40.0%"
                "Krippendorff's alpha: 0.234"

Binary metric:  "Exact Agreement: 80.0%"
                "Krippendorff's alpha: 0.612"
```

## Overall Score

The overall IRR score is the **average primary agreement across all metrics**:

```python
overall_score = sum(primary_scores) / len(primary_scores)
```

Where each metric contributes its primary score (exact for binary, adjacent for Likert).

## Thresholds

| Threshold | Value | Used For |
|-----------|-------|----------|
| Ready to proceed | >= 75.0% | `ready_to_proceed` flag in API |
| Excellent | >= 90% | Interpretation label |
| Good | >= 75% | Interpretation label |
| Moderate | >= 60% | Interpretation label |
| Fair | >= 50% | Interpretation label |
| Poor | < 50% | Interpretation label |

```python
# irr_utils.py
'ready_to_proceed': score >= 75.0,
'threshold': 75.0,
```

## Per-Metric Result Shape

Each metric in `per_metric_scores` has this structure:

```python
{
    'score': 85.0,              # Primary % (adjacent for Likert, exact for binary)
    'exact_agreement': 40.0,     # Always computed
    'adjacent_agreement': 85.0,  # Always computed (meaningless for binary)
    'interpretation': 'Good agreement',
    'acceptable': True,          # score >= 75.0
    'suggestions': [],           # Empty if acceptable
    'is_binary': False,
    'krippendorff_alpha': 0.234, # Secondary detail (can be None)
}
```

## API Response Shape

The `IRRResult` model (`server/models.py`) is scale-agnostic:

```python
class IRRResult(BaseModel):
    workshop_id: str
    score: float          # 0-100 (overall primary agreement %)
    ready_to_proceed: bool
    details: Dict[str, Any]  # Contains metric_used, per_metric_scores, etc.
```

`details` structure:

```python
{
    'metric_used': 'Pairwise Agreement',
    'score': 82.5,
    'interpretation': 'Good agreement',
    'ready_to_proceed': True,
    'threshold': 75.0,
    'suggestions': [],
    'num_raters': 3,
    'num_traces': 10,
    'num_annotations': 28,
    'completeness': 0.933,
    'missing_data': True,
    'per_metric_scores': { ... },     # Per-question breakdown
    'problematic_patterns': [ ... ],  # Detected issues
}
```

## Annotation Model Constraint

The `Annotation` Pydantic model enforces `rating >= 1` on the legacy `rating` field. Binary (0/1) values are stored in the `ratings` dict (e.g., `{"q1": 0}`), not the top-level `rating`.

When writing tests for binary metrics:

```python
# CORRECT: binary via ratings dict, legacy rating=1 (valid)
_ann(trace_id="t1", user_id="u1", rating=1, ratings={"q1": 0})

# WRONG: rating=0 fails Pydantic validation
_ann(trace_id="t1", user_id="u1", rating=0)
```

## Frontend Color Coding

Score thresholds for display colors (`IRRResultsDemo.tsx`):

```typescript
function getScoreColor(score: number): string {
    if (score >= 80) return 'text-green-700';    // Green
    if (score >= 60) return 'text-yellow-700';   // Yellow
    return 'text-red-700';                        // Red
}
```

## Improvement Suggestions Logic

`get_pairwise_improvement_suggestions()` returns targeted advice:

- **Primary < 50%**: "Revise rubric" + "Calibration session"
- **Binary + low**: "Clarify Pass vs Fail" + "Discuss borderline cases"
- **Likert + adjacent >= 75% but exact < 50%**: "Close but not exact - may be acceptable"
- **Likert + both low**: "Clarify rubric" + "Provide anchor examples"
- **Exact < 30%**: "Consider simplifying to binary"
- **Always when low**: "Discuss high-disagreement traces"

## Common Modifications

### Adding a new scale type (e.g., 3-point)

1. Update `_is_binary_metric()` in `irr_service.py` (or add `_is_three_point_metric()`)
2. Decide primary metric (exact vs adjacent) for the new scale
3. Update the primary score selection in `_calculate_pairwise_agreement_result()`
4. Update frontend label logic in `IRRResultsDemo.tsx`
5. Add suggestions for the new scale in `get_pairwise_improvement_suggestions()`

### Changing the threshold

Update in **two places**:
1. `server/services/irr_utils.py` → `format_irr_result()` (line: `score >= 75.0`)
2. `server/services/pairwise_agreement.py` → `is_pairwise_agreement_acceptable()` (line: `>= 75.0`)

### Adding a new secondary metric

Follow the Krippendorff pattern in `irr_service.py`:

```python
try:
    new_metric = calculate_new_metric(annotations, question_id=question_id)
except Exception:
    new_metric = None

result['per_metric_scores'][question_id]['new_metric'] = round(new_metric, 3) if new_metric is not None else None
```

## Testing

```bash
just test-server  # All backend tests (323+)
```

Key test patterns:

| Test | What it verifies |
|------|-----------------|
| `test_calculate_pairwise_agreement_perfect_agreement` | Both modes return 100% |
| `test_calculate_pairwise_agreement_complete_disagreement` | Ratings 1 vs 5 → 0% both modes |
| `test_calculate_pairwise_agreement_adjacent_but_not_exact` | 3 vs 4 → 0% exact, 100% adjacent |
| `test_calculate_pairwise_agreement_multi_rater` | 3 raters → N*(N-1)/2 pairs counted |
| `test_calculate_pairwise_agreement_binary` | Binary via ratings dict, exact=50% |
| `test_per_metric_returns_scores_per_question` | Independent per-question agreement |
| `test_calculate_irr_for_workshop_perfect_agreement` | End-to-end: score=100, ready=True |
| `test_calculate_irr_per_metric_scores_include_agreement_details` | Full detail shape |

## Debugging

### "Score shows 100% but raters clearly disagree"

Check if the metric is binary and displaying adjacent agreement. Adjacent on binary is always 100%. The frontend should show "Exact Agreement" for binary metrics — check `is_binary` flag.

### "Score shows 0% but raters are close"

Check if mode is "exact" when it should be "adjacent" for Likert scales. Ratings 3 vs 4 are 0% exact but 100% adjacent.

### "per_metric_scores is empty"

Annotations don't have `ratings` dict populated. Check if `annotation.ratings` is None vs a dict with question IDs. The `get_unique_question_ids()` function only finds IDs from the `ratings` dict.

### "Krippendorff's alpha is None"

The alpha calculation threw an exception (insufficient data, all same ratings, etc.). This is non-fatal — pairwise agreement is the primary metric.
