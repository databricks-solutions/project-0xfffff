"""Pairwise Agreement Percentage for inter-rater reliability.

Inspired by the GDPval benchmark's approach of using simple, interpretable
agreement percentages rather than abstract statistical coefficients like
Krippendorff's Alpha.

For each pair of raters who rated the same trace, checks whether they agree:
- Exact agreement: identical ratings
- Adjacent agreement: ratings within ±1 (for Likert/ordinal scales)

Agreement % = (agreeing_pairs / total_pairs) × 100
"""

import logging
from collections import defaultdict
from typing import Dict, List

from server.models import Annotation

logger = logging.getLogger(__name__)


def get_unique_question_ids(annotations: List[Annotation]) -> List[str]:
  """Extract all unique question IDs from annotations.

  Args:
      annotations: List of annotations

  Returns:
      List of unique question IDs found in the annotations
  """
  question_ids = set()
  for annotation in annotations:
    if annotation.ratings:
      question_ids.update(annotation.ratings.keys())
  return sorted(list(question_ids))


def calculate_pairwise_agreement(
  annotations: List[Annotation],
  question_id: str | None = None,
  mode: str = "exact",
) -> float:
  """Calculate pairwise agreement percentage for a single metric.

  Algorithm:
  1. Group annotations by trace_id
  2. For each trace with 2+ ratings, enumerate all unique rater pairs
  3. For each pair, check if they agree
  4. Return (agreeing_pairs / total_pairs) * 100

  Args:
      annotations: List of annotations from any number of raters
      question_id: Optional question ID to use ratings dict. If None, uses legacy rating field.
      mode: "exact" for identical ratings, "adjacent" for within ±1

  Returns:
      float: Agreement percentage (0-100). Returns 0.0 if insufficient data.
  """
  if len(annotations) < 2:
    return 0.0

  # Group ratings by trace
  traces: Dict[str, List[int]] = defaultdict(list)
  for ann in annotations:
    if question_id is not None:
      if ann.ratings and question_id in ann.ratings:
        traces[ann.trace_id].append(ann.ratings[question_id])
    else:
      traces[ann.trace_id].append(ann.rating)

  total_pairs = 0
  agreeing_pairs = 0

  for trace_ratings in traces.values():
    n = len(trace_ratings)
    if n < 2:
      continue

    # Enumerate all unique pairs
    for i in range(n):
      for j in range(i + 1, n):
        total_pairs += 1
        diff = abs(trace_ratings[i] - trace_ratings[j])
        if mode == "adjacent":
          if diff <= 1:
            agreeing_pairs += 1
        else:  # exact
          if diff == 0:
            agreeing_pairs += 1

  if total_pairs == 0:
    return 0.0

  return (agreeing_pairs / total_pairs) * 100


def calculate_pairwise_agreement_per_metric(
  annotations: List[Annotation],
) -> Dict[str, Dict[str, float]]:
  """Calculate pairwise agreement for each metric/question.

  Args:
      annotations: List of annotations with multiple ratings

  Returns:
      Dict mapping question_id -> {"exact_agreement": float, "adjacent_agreement": float}
  """
  question_ids = get_unique_question_ids(annotations)

  if not question_ids:
    logger.warning("No ratings dictionary found in annotations. Cannot calculate per-metric agreement.")
    return {}

  results = {}
  for question_id in question_ids:
    exact = calculate_pairwise_agreement(annotations, question_id=question_id, mode="exact")
    adjacent = calculate_pairwise_agreement(annotations, question_id=question_id, mode="adjacent")
    results[question_id] = {
      "exact_agreement": exact,
      "adjacent_agreement": adjacent,
    }
    logger.info(f"Agreement for {question_id}: exact={exact:.1f}%, adjacent={adjacent:.1f}%")

  return results


def interpret_pairwise_agreement(agreement_pct: float, is_binary: bool = False) -> str:
  """Provide human-readable interpretation of pairwise agreement percentage.

  Args:
      agreement_pct: Agreement percentage (0-100)
      is_binary: Whether this is a binary (Pass/Fail) metric

  Returns:
      str: Human-readable interpretation
  """
  if agreement_pct >= 90:
    return "Excellent agreement"
  elif agreement_pct >= 75:
    return "Good agreement"
  elif agreement_pct >= 60:
    return "Moderate agreement"
  elif agreement_pct >= 50:
    return "Fair agreement"
  else:
    return "Poor agreement"


def is_pairwise_agreement_acceptable(agreement_pct: float, is_binary: bool = False) -> bool:
  """Check if pairwise agreement meets the threshold to proceed.

  Args:
      agreement_pct: Agreement percentage (0-100)
      is_binary: Whether this is a binary metric

  Returns:
      bool: True if agreement meets threshold (75%)
  """
  return agreement_pct >= 75.0


def get_pairwise_improvement_suggestions(
  exact_pct: float,
  adjacent_pct: float,
  is_binary: bool = False,
) -> List[str]:
  """Provide specific suggestions for improving agreement.

  Args:
      exact_pct: Exact agreement percentage
      adjacent_pct: Adjacent agreement percentage
      is_binary: Whether this is a binary (Pass/Fail) metric

  Returns:
      List[str]: Improvement suggestions
  """
  # Use the primary metric for threshold check
  primary = exact_pct if is_binary else adjacent_pct

  if primary >= 75.0:
    return []  # No suggestions needed

  suggestions = []

  if primary < 50:
    suggestions.append("Agreement is very low - consider revising the rubric for this criterion")
    suggestions.append("Conduct a calibration session with example traces before re-annotating")

  if is_binary:
    suggestions.append("Clarify what constitutes Pass vs Fail for this criterion")
    suggestions.append("Discuss specific borderline cases where raters disagreed")
  else:
    if adjacent_pct >= 75 and exact_pct < 50:
      suggestions.append("Raters are close but not exact - this may be acceptable for ordinal scales")
    else:
      suggestions.append("Clarify the rubric description to reduce subjective interpretation")
      suggestions.append("Provide anchor examples for each rating level (1-5)")
    if exact_pct < 30:
      suggestions.append("Consider simplifying to a binary (Pass/Fail) scale for this criterion")

  suggestions.append("Discuss high-disagreement traces as a group to align understanding")

  return suggestions
