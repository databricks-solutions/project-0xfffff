# Human Agreement Specification (GDPVal A^HH)

## Overview

This specification defines the GDPVal Human Inter-Rater Agreement system for the Human Evaluation Workshop. Based on the GDPVal paper (OpenAI), it measures **human-to-human** agreement between SME annotators using the A^HH metric — a normalized pairwise agreement score in [0, 1]. This is used alongside pairwise agreement percentages to determine whether annotators are calibrated before proceeding to judge alignment.

## Key Distinction

| Metric | What It Measures | Where It's Used |
|--------|-----------------|-----------------|
| **GDPVal A^HH** (this spec) | Human vs Human agreement | IRR Results page |
| Pairwise Agreement % | Human vs Human agreement (percentage) | IRR Results page |

GDPVal A^HH and Pairwise Agreement % both measure inter-rater reliability between human annotators, but use different formulas. 

## Position in Workshop Pipeline

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Annotation   │    │  IRR         │    │   Judge      │
│   Phase       │───▶│  Analysis    │───▶│   Tuning     │
│  (2+ SMEs)    │    │  (GDPVal)    │    │  (Alignment) │
└──────────────┘    └──────────────┘    └──────────────┘
  Multiple SMEs       A^HH score          Only proceed if
  rate same traces    per rubric Q        humans agree
```

GDPVal is a quality gate: if human annotators don't agree with each other, aligning a judge to them would be unreliable.

## Core Concepts

### GDPVal A^HH Formula

For a given sample (trace) `s`, with human scores `H_1, H_2` normalized to [0, 1]:

```
A_s^HH = E[1 - |H_1 - H_2|]
```

Estimated by the empirical mean over all pairs of ratings for that sample. The final score is the mean of sample-level scores over all samples with at least two human raters.

### Rating Normalization

Ratings are normalized to [0, 1] before computing A^HH:

| Scale | Raw Range | Normalization | Examples |
|-------|-----------|---------------|----------|
| Likert | 1-5 | `(rating - 1) / 4` | 1→0.0, 3→0.5, 5→1.0 |
| Binary | 0-1 | As-is | 0→0.0, 1→1.0 |

### Score Interpretation

| A^HH Score | Interpretation |
|-----------|----------------|
| >= 0.90 | Excellent agreement |
| >= 0.75 | Good agreement |
| >= 0.60 | Moderate agreement |
| >= 0.50 | Fair agreement |
| < 0.50 | Poor agreement |

### Worked Examples

**Perfect agreement (Likert):**
```
Trace 1: raters give [4, 4, 4] → normalized [0.75, 0.75, 0.75]
  All pairs: |0.75-0.75| = 0 → 1 - 0 = 1.0 for each pair
  Sample score = 1.0
A^HH = 1.0
```

**Adjacent ratings (Likert):**
```
Trace 1: [3, 4] → normalized [0.5, 0.75]
  |0.5 - 0.75| = 0.25 → 1 - 0.25 = 0.75
Trace 2: [2, 3] → normalized [0.25, 0.5]
  |0.25 - 0.5| = 0.25 → 1 - 0.25 = 0.75
A^HH = (0.75 + 0.75) / 2 = 0.75
```

**Maximum disagreement (Likert):**
```
Trace 1: [1, 5] → normalized [0.0, 1.0]
  |0.0 - 1.0| = 1.0 → 1 - 1.0 = 0.0
A^HH = 0.0
```

**Binary partial agreement (3 raters):**
```
Trace 1: [1, 1, 0] → already [0, 1]
  Pairs: |1-1|=0, |1-0|=1, |1-0|=1
  1-diff: 1.0, 0.0, 0.0 → mean = 1/3
Trace 2: [0, 0, 1]
  Pairs: |0-0|=0, |0-1|=1, |0-1|=1
  1-diff: 1.0, 0.0, 0.0 → mean = 1/3
A^HH = (1/3 + 1/3) / 2 = 1/3 ≈ 0.333
```

## Relationship to Pairwise Agreement Percentage

Both metrics appear on the IRR Results page. They measure the same thing (human-human agreement) but differently:

| Aspect | GDPVal A^HH | Pairwise Agreement % |
|--------|-------------|---------------------|
| Range | [0, 1] | [0, 100]% |
| Formula | `E[1 - \|H_1 - H_2\|]` (normalized) | `agreeing_pairs / total_pairs × 100` |
| Agreement check | Continuous (uses distance) | Discrete (exact or ±1 match) |
| Likert primary | Uses full distance | Adjacent agreement (within ±1) |
| Binary primary | Same as exact (0/1 distance) | Exact agreement |
| Threshold | >= 0.75 = Good | >= 75% = Ready to proceed |

### Integration in IRR Service

GDPVal A^HH is computed alongside pairwise agreement in `irr_service.py`:

```python
# irr_service.py: calculate_irr_for_workshop()
result = _calculate_pairwise_agreement_result(annotations, analysis)  # Pairwise %

# Then add GDPVal A^HH per metric
ha_per_metric = calculate_human_agreement_per_metric(annotations)
for question_id, ha_score in ha_per_metric.items():
    result['per_metric_scores'][question_id]['human_agreement'] = ha_score

# Overall A^HH = average across metrics
result['human_agreement'] = mean(ha_per_metric.values())
```

## Binary Detection

Automatic detection of binary vs Likert scale from actual rating values:

```python
def _detect_binary(ratings: List[int]) -> bool:
    return all(r in (0, 1) for r in ratings)
```

This affects normalization:
- **Binary detected**: ratings used as-is (already [0, 1])
- **Likert detected**: ratings normalized via `(rating - 1) / 4`

## Data Model

### Input: Annotations

```python
class Annotation:
    trace_id: str
    user_id: str
    rating: int                     # Legacy single rating (1-5)
    ratings: Dict[str, int]         # Per-question ratings {"q_uuid": 4, ...}
```

### Output: Per-Metric Result

Each metric in `per_metric_scores` includes:

```python
{
    'score': 85.0,                    # Primary pairwise % (adjacent for Likert, exact for binary)
    'exact_agreement': 40.0,          # Pairwise exact %
    'adjacent_agreement': 85.0,       # Pairwise adjacent %
    'human_agreement': 0.812,         # GDPVal A^HH score [0, 1]
    'interpretation': 'Good agreement',
    'acceptable': True,
    'is_binary': False,
    'krippendorff_alpha': 0.234,      # Secondary detail
    'suggestions': [],
}
```

### Output: Overall Result

```python
{
    'metric_used': 'Pairwise Agreement',
    'score': 82.5,                    # Overall pairwise %
    'human_agreement': 0.812,         # Overall A^HH (average across metrics)
    'ready_to_proceed': True,         # score >= 75.0
    'threshold': 75.0,
    'per_metric_scores': { ... },     # Per-question breakdown (includes A^HH)
    'problematic_patterns': [ ... ],  # Detected issues
    'num_raters': 3,
    'num_traces': 10,
}
```

## API Endpoint

### Calculate IRR

```
GET /workshops/{workshop_id}/irr
```

Response: `IRRResult` with `details` containing both pairwise agreement and GDPVal A^HH scores.

## Frontend Display

### File: `client/src/pages/IRRResultsDemo.tsx`

A^HH is displayed as the **primary score** per rubric question:

```
┌─────────────────────────────────────────────────────┐
│  Human Agreement A^HH (GDPval)                      │
│                                                      │
│              0.812                                    │
│         Good agreement                               │
│                                                      │
│  Score of 1.0 = raters always agree.                │
│  Score of 0.0 = maximum disagreement.               │
│  Ratings normalized to [0, 1] scale.                │
└─────────────────────────────────────────────────────┘
```

### Color Coding

| A^HH Score | Color | Label |
|-----------|-------|-------|
| >= 0.75 | Green | Good/Excellent |
| >= 0.60 | Yellow | Moderate |
| >= 0.50 | Orange | Fair |
| < 0.50 | Red | Poor |

### Fallback Display

When `human_agreement` is `null` (insufficient data), the page falls back to displaying the pairwise agreement percentage instead.

## Implementation Files

| File | Role |
|------|------|
| `server/services/fleiss_kappa.py` | GDPVal A^HH calculation (`calculate_human_agreement`, `calculate_human_agreement_per_metric`) |
| `server/services/irr_service.py` | Orchestration: integrates A^HH into IRR results |
| `server/services/pairwise_agreement.py` | Pairwise agreement % (companion metric) |
| `server/services/irr_utils.py` | Validation, formatting, problematic pattern detection |
| `server/services/krippendorff_alpha.py` | Krippendorff's Alpha (secondary detail) |
| `client/src/pages/IRRResultsDemo.tsx` | Frontend: displays A^HH as primary per-metric score |
| `tests/unit/services/test_fleiss_kappa.py` | Tests for A^HH calculation (20+ tests) |

## Algorithm Detail

### Per-Sample Calculation

```python
def calculate_human_agreement(annotations, question_id=None):
    # 1. Group ratings by trace
    traces = group_by_trace(annotations, question_id)

    # 2. Detect binary scale
    is_binary = all(r in (0, 1) for r in all_ratings)

    # 3. Per-sample: enumerate all rater pairs
    sample_scores = []
    for trace_id, ratings in traces.items():
        if len(ratings) < 2:
            continue  # Need 2+ raters

        normalized = [normalize(r, is_binary) for r in ratings]

        # All unique pairs: N*(N-1)/2
        pair_scores = []
        for i in range(len(normalized)):
            for j in range(i + 1, len(normalized)):
                pair_scores.append(1.0 - abs(normalized[i] - normalized[j]))

        sample_scores.append(mean(pair_scores))

    # 4. A^HH = mean across all samples
    return mean(sample_scores)
```

### Per-Metric Calculation

Computes A^HH independently for each rubric question:

```python
def calculate_human_agreement_per_metric(annotations):
    question_ids = collect_all_question_ids(annotations)
    return {qid: calculate_human_agreement(annotations, question_id=qid)
            for qid in question_ids}
```

## Edge Cases

- **Single rater per trace**: trace is excluded (need 2+ raters)
- **Single annotation total**: returns `None`
- **No ratings dict**: `calculate_human_agreement_per_metric` returns `{}`
- **Mixed scales across questions**: each question detected independently
- **All raters identical**: returns 1.0 (perfect agreement)
- **4+ raters**: all unique pairs enumerated (N*(N-1)/2 pairs)

## Success Criteria

- [ ] A^HH correctly computed using `E[1 - |H_1 - H_2|]` formula
- [ ] Likert ratings normalized via `(rating - 1) / 4` to [0, 1]
- [ ] Binary ratings used as-is (already [0, 1])
- [ ] Binary auto-detected from actual rating values
- [ ] Per-question A^HH computed independently
- [ ] Overall A^HH = average across per-question scores
- [ ] Traces with < 2 raters excluded from calculation
- [ ] Multi-rater traces enumerate all N*(N-1)/2 pairs
- [ ] A^HH displayed as primary score on IRR Results page
- [ ] Falls back to pairwise % when A^HH unavailable
- [ ] Integrated into `per_metric_scores` alongside pairwise agreement

## Testing Scenarios

### Test 1: Perfect Agreement (Likert)
1. All raters give same ratings on all traces
2. Verify A^HH = 1.0

### Test 2: Maximum Disagreement (Likert)
1. Raters give 1 and 5 on all traces
2. Verify A^HH = 0.0

### Test 3: Adjacent Ratings
1. Raters differ by 1 on Likert scale (e.g., 3 vs 4)
2. Verify A^HH = 0.75

### Test 4: Binary Perfect Agreement
1. All raters agree on Pass/Fail per trace
2. Verify A^HH = 1.0 (using `question_id` parameter)

### Test 5: Binary Complete Disagreement
1. One rater says Pass, other says Fail on all traces
2. Verify A^HH = 0.0

### Test 6: Three Raters Known Value
1. Trace 1: [3, 4, 5], Trace 2: [1, 1, 2]
2. Verify A^HH = 0.75 (hand-calculated)

### Test 7: Per-Metric Independence
1. Two questions: q_1 has perfect agreement, q_2 has max disagreement
2. Verify A^HH(q_1) = 1.0, A^HH(q_2) = 0.0

### Test 8: Single-Rater Traces Excluded
1. Some traces have only 1 rater
2. Verify those traces are excluded, result only from multi-rater traces
