"""Human Inter-Rater Agreement from the GDPval paper (OpenAI).

For a given sample s, with human scores H_1, H_2 normalized to [0, 1]:

    A_s^HH = E[1 - |H_1 - H_2|]

Estimated by the empirical mean over all pairs of ratings for that sample.
The final human inter-rater agreement is the mean of sample-level scores
over all samples with at least two human graders.

Rating normalization:
- Likert 1-5: (rating - 1) / 4  →  [0, 1]
- Binary 0/1: already in [0, 1]

Score interpretation:
- 1.0 = perfect agreement (all raters identical)
- 0.0 = maximum disagreement
"""

import logging
from collections import defaultdict
from typing import Dict, List, Optional

from server.models import Annotation

logger = logging.getLogger(__name__)


def _normalize_rating(rating: int, is_binary: bool = False) -> float:
  """Normalize a rating to [0, 1] scale.

  Args:
      rating: Raw rating value (1-5 for Likert, 0-1 for binary)
      is_binary: Whether this metric uses binary (0/1) ratings

  Returns:
      float in [0, 1]
  """
  if is_binary:
    return float(max(0, min(1, rating)))
  # Likert 1-5 → [0, 1]
  return max(0.0, min(1.0, (rating - 1) / 4.0))


def _detect_binary(ratings: List[int]) -> bool:
  """Detect if ratings are binary (all values are 0 or 1)."""
  return all(r in (0, 1) for r in ratings)


def calculate_human_agreement(
  annotations: List[Annotation],
  question_id: Optional[str] = None,
) -> Optional[float]:
  """Calculate GDPval human inter-rater agreement.

  A_s^HH = E[1 - |H_1 - H_2|]  averaged over all samples.

  Args:
      annotations: List of annotations from 2+ raters
      question_id: Optional question ID for per-question ratings.
                   If None, uses legacy rating field.

  Returns:
      float: Agreement score in [0, 1], or None if insufficient data.
  """
  if len(annotations) < 2:
    return None

  # Group ratings by trace
  traces: Dict[str, List[int]] = defaultdict(list)
  for ann in annotations:
    if question_id is not None:
      if ann.ratings and question_id in ann.ratings:
        traces[ann.trace_id].append(ann.ratings[question_id])
    else:
      traces[ann.trace_id].append(ann.rating)

  # Collect all ratings to detect scale
  all_ratings = []
  for ratings in traces.values():
    all_ratings.extend(ratings)

  if not all_ratings:
    return None

  is_binary = _detect_binary(all_ratings)

  # Calculate per-sample agreement
  sample_scores = []
  for trace_id, ratings in traces.items():
    if len(ratings) < 2:
      continue

    # Normalize all ratings to [0, 1]
    normalized = [_normalize_rating(r, is_binary) for r in ratings]

    # Compute mean over all pairs: 1 - |H_i - H_j|
    pair_scores = []
    n = len(normalized)
    for i in range(n):
      for j in range(i + 1, n):
        pair_scores.append(1.0 - abs(normalized[i] - normalized[j]))

    if pair_scores:
      sample_scores.append(sum(pair_scores) / len(pair_scores))

  if not sample_scores:
    return None

  return sum(sample_scores) / len(sample_scores)


def calculate_human_agreement_per_metric(
  annotations: List[Annotation],
) -> Dict[str, Optional[float]]:
  """Calculate GDPval human agreement for each rubric question.

  Args:
      annotations: List of annotations with per-question ratings

  Returns:
      Dict mapping question_id -> agreement score (or None)
  """
  question_ids = set()
  for ann in annotations:
    if ann.ratings:
      question_ids.update(ann.ratings.keys())

  if not question_ids:
    return {}

  results = {}
  for question_id in sorted(question_ids):
    score = calculate_human_agreement(annotations, question_id=question_id)
    results[question_id] = score
    if score is not None:
      logger.info(
        f"Human agreement for {question_id}: {score:.3f}"
      )

  return results


def interpret_human_agreement(score: float) -> str:
  """Provide human-readable interpretation of agreement score.

  Args:
      score: Agreement score in [0, 1]

  Returns:
      str: Human-readable interpretation
  """
  if score >= 0.90:
    return "Excellent agreement"
  elif score >= 0.75:
    return "Good agreement"
  elif score >= 0.60:
    return "Moderate agreement"
  elif score >= 0.50:
    return "Fair agreement"
  else:
    return "Poor agreement"
