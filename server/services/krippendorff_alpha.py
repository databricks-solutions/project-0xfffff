"""Krippendorff's Alpha implementation for inter-rater reliability.

Krippendorff's Alpha is appropriate for:
- Any number of raters (2 or more)
- Ordinal data (like 1-5 Likert scales)
- Binary/nominal data (like 0/1 Pass/Fail)
- Missing data (not all raters rate all items)

Formula: α = 1 - (D_o / D_e)
Where:
- D_o = observed disagreement
- D_e = expected disagreement by chance
- Uses squared distance function which works for both ordinal and binary data
  (for binary 0/1, squared distance equals nominal distance)
"""

import logging
from collections import defaultdict
from typing import Dict, List, Tuple

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


def calculate_krippendorff_alpha_per_metric(annotations: List[Annotation]) -> Dict[str, float]:
  """Calculate Krippendorff's Alpha for each metric/question separately.
  
  Args:
      annotations: List of annotations with multiple ratings
      
  Returns:
      Dict mapping question_id to Krippendorff's Alpha score
  """
  question_ids = get_unique_question_ids(annotations)
  
  if not question_ids:
    # No ratings dictionary found - annotations are using old format
    logger.warning("No ratings dictionary found in annotations. Cannot calculate per-metric IRR.")
    return {}
  
  logger.info(f"🔍 Calculating IRR for {len(question_ids)} metrics: {question_ids}")
  logger.info(f"🔍 Sample annotation ratings: {annotations[0].ratings if annotations else 'No annotations'}")
  
  results = {}
  for question_id in question_ids:
    try:
      alpha = calculate_krippendorff_alpha(annotations, question_id=question_id)
      results[question_id] = alpha
      logger.info(f"✅ IRR for {question_id}: {alpha:.3f}")
    except Exception as e:
      logger.warning(f"Failed to calculate IRR for question {question_id}: {e}")
      results[question_id] = 0.0
  
  return results


def calculate_krippendorff_alpha(annotations: List[Annotation], question_id: str = None) -> float:
  """Calculate Krippendorff's Alpha for rating data.
  
  Supports both:
  - Ordinal data (1-5 Likert scale)
  - Binary data (0/1 Pass/Fail)

  Args:
      annotations: List of annotations from any number of raters
      question_id: Optional question ID to calculate IRR for a specific metric.
                  If None, uses the legacy 'rating' field. If specified, uses
                  the 'ratings' dict with this question_id.

  Returns:
      float: Krippendorff's Alpha value (-1 to 1)
      - 1.0 = Perfect agreement
      - 0.0 = Agreement equal to chance
      - <0.0 = Systematic disagreement (raters disagree more than by chance)

  Mathematical approach:
      1. Create coincidence matrix of all rating pairs
      2. Calculate observed disagreement using squared distance function
      3. Calculate expected disagreement from marginal distributions
      4. Alpha = 1 - (observed_disagreement / expected_disagreement)
      
  Note: For binary (0/1) data, squared distance equals nominal distance,
  so the calculation is equivalent to using nominal Krippendorff's Alpha.

  Example (Likert):
      >>> annotations = [
      ...     Annotation(trace_id="t1", user_id="u1", rating=4),
      ...     Annotation(trace_id="t1", user_id="u2", rating=4),
      ... ]
      
  Example (Binary):
      >>> annotations = [
      ...     Annotation(trace_id="t1", user_id="u1", ratings={"q1": 1}),  # Pass
      ...     Annotation(trace_id="t1", user_id="u2", ratings={"q1": 0}),  # Fail
      ... ]
  """
  if len(annotations) < 2:
    return 0.0

  # Create coincidence matrix
  coincidence_matrix = _create_coincidence_matrix(annotations, question_id)

  if _is_trivial_agreement(coincidence_matrix):
    return 1.0

  # Calculate observed disagreement
  observed_disagreement = _calculate_observed_disagreement_ordinal(coincidence_matrix)

  # Calculate expected disagreement
  expected_disagreement = _calculate_expected_disagreement_ordinal(coincidence_matrix)

  if expected_disagreement == 0:
    return 1.0 if observed_disagreement == 0 else 0.0

  alpha = 1 - (observed_disagreement / expected_disagreement)
  return max(-1.0, min(1.0, alpha))  # Clamp to [-1, 1]


def _create_coincidence_matrix(annotations: List[Annotation], question_id: str = None) -> Dict[Tuple[int, int], float]:
  """Create coincidence matrix for Krippendorff's Alpha calculation.

  Args:
      annotations: List of annotations
      question_id: Optional question ID to extract ratings for a specific metric

  Returns:
      Dict[Tuple[int, int], float]: Matrix of (rating1, rating2) -> frequency

  The coincidence matrix counts how often each pair of ratings co-occurs,
  accounting for missing data by weighting each pairing appropriately.
  """
  # Organize annotations by trace
  traces = defaultdict(list)
  for annotation in annotations:
    # Get the rating for this annotation
    if question_id is not None:
      # Use ratings dict for specific question
      if annotation.ratings and question_id in annotation.ratings:
        rating = annotation.ratings[question_id]
        traces[annotation.trace_id].append(rating)
    else:
      # Use legacy rating field
      traces[annotation.trace_id].append(annotation.rating)

  # Build coincidence matrix
  coincidence_matrix = defaultdict(float)

  for trace_ratings in traces.values():
    n_ratings = len(trace_ratings)

    if n_ratings < 2:
      continue  # Skip traces with only one rating

    # Weight for each pair in this trace
    weight = 1.0 / (n_ratings - 1)

    # Add all pairs from this trace
    for i in range(n_ratings):
      for j in range(n_ratings):
        if i != j:
          rating1, rating2 = trace_ratings[i], trace_ratings[j]
          coincidence_matrix[(rating1, rating2)] += weight

  return dict(coincidence_matrix)


def _is_trivial_agreement(coincidence_matrix: Dict[Tuple[int, int], float]) -> bool:
  """Check if all ratings are identical (trivial perfect agreement).

  Args:
      coincidence_matrix: Coincidence matrix

  Returns:
      bool: True if all ratings are the same
  """
  # If only diagonal elements exist, all ratings are identical
  for (r1, r2), count in coincidence_matrix.items():
    if r1 != r2 and count > 0:
      return False
  return True


def _calculate_observed_disagreement_ordinal(
  coincidence_matrix: Dict[Tuple[int, int], float],
) -> float:
  """Calculate observed disagreement using ordinal distance function.

  Args:
      coincidence_matrix: Coincidence matrix

  Returns:
      float: Observed disagreement

  For ordinal data, disagreement is proportional to squared distance:
  δ(r1, r2) = (r1 - r2)²
  """
  total_pairs = sum(coincidence_matrix.values())

  if total_pairs == 0:
    return 0.0

  disagreement = 0.0

  for (r1, r2), count in coincidence_matrix.items():
    # Ordinal distance function: squared difference
    distance = (r1 - r2) ** 2
    disagreement += count * distance

  return disagreement / total_pairs


def _calculate_expected_disagreement_ordinal(
  coincidence_matrix: Dict[Tuple[int, int], float],
) -> float:
  """Calculate expected disagreement based on marginal distributions.

  Args:
      coincidence_matrix: Coincidence matrix

  Returns:
      float: Expected disagreement by chance

  Expected disagreement is calculated by considering all possible
  rating pairs weighted by their marginal probabilities.
  """
  # Calculate marginal frequencies
  marginal_counts = defaultdict(float)
  # TODO: this was ostensibly here for a reason, but I don't know what it is.
  # total_pairs = sum(coincidence_matrix.values())

  for (r1, r2), count in coincidence_matrix.items():
    marginal_counts[r1] += count
    marginal_counts[r2] += count

  # Total marginal count (each rating counted twice in pairs)
  total_marginal = sum(marginal_counts.values())

  if total_marginal == 0:
    return 0.0

  # Calculate expected disagreement
  expected_disagreement = 0.0

  for r1 in marginal_counts:
    for r2 in marginal_counts:
      if r1 != r2:  # Only consider disagreement pairs
        # Probability of this pair occurring by chance
        prob_r1 = marginal_counts[r1] / total_marginal
        prob_r2 = marginal_counts[r2] / total_marginal

        # Ordinal distance
        distance = (r1 - r2) ** 2

        expected_disagreement += prob_r1 * prob_r2 * distance

  return expected_disagreement


def interpret_krippendorff_alpha(alpha: float) -> str:
  """Provide human-readable interpretation of Krippendorff's Alpha score.

  Args:
      alpha: Krippendorff's Alpha value

  Returns:
      str: Human-readable interpretation

  Interpretation scale based on Krippendorff (2004):
  - α ≥ 0.800: Excellent agreement (reliable)
  - α ≥ 0.667: Good agreement (tentative conclusions acceptable)
  - α ≥ 0.300: Acceptable agreement (for exploratory research)
  - α < 0.300: Poor agreement (unreliable)
  """
  if alpha >= 0.800:
    return 'Excellent agreement (reliable for all purposes)'
  elif alpha >= 0.667:
    return 'Good agreement (tentative conclusions acceptable)'
  elif alpha >= 0.300:
    return 'Acceptable agreement (for exploratory research)'
  elif alpha >= 0.0:
    return 'Poor agreement (unreliable)'
  else:
    return 'Systematic disagreement'


def is_krippendorff_alpha_acceptable(alpha: float, threshold: float = 0.3) -> bool:
  """Check if Krippendorff's Alpha meets acceptable threshold for workshop progression.

  Args:
      alpha: Krippendorff's Alpha value
      threshold: Minimum acceptable threshold (default: 0.3)

  Returns:
      bool: True if alpha meets threshold, False otherwise

  Note:
      Krippendorff suggests α ≥ 0.800 for reliable conclusions,
      α ≥ 0.667 for tentative conclusions, and α ≥ 0.300 as the
      lowest acceptable limit for exploratory research.
  """
  return alpha >= threshold


def get_krippendorff_improvement_suggestions(alpha: float, is_binary: bool = False) -> List[str]:
  """Provide specific suggestions for improving Krippendorff's Alpha when it's low.

  Args:
      alpha: Krippendorff's Alpha value
      is_binary: Whether this is a binary (Pass/Fail) scale vs Likert scale

  Returns:
      List[str]: List of improvement suggestions

  Suggestions are tailored to the specific alpha range and scale type to provide
  actionable guidance for workshop facilitators.
  """
  if alpha >= 0.3:
    return []  # No suggestions needed for acceptable agreement

  suggestions = [
    'Clarify the rubric question - ensure all annotators interpret it identically',
    'Conduct group discussion on traces where annotators strongly disagreed',
    'Consider simplifying the rubric to reduce subjective interpretation',
    'Provide additional calibration training with gold standard examples',
  ]

  if alpha < 0.0:
    if is_binary:
      suggestions.extend(
        [
          'Systematic disagreement detected - raters are giving opposite judgments',
          'Check if annotators have the same understanding of what constitutes Pass vs Fail',
          'Review the criteria for Pass/Fail - they may be ambiguous',
        ]
      )
    else:
      suggestions.extend(
        [
          'Systematic disagreement detected - consider completely revising the rubric',
          'Check if annotators understood the rating scale direction (1=worst vs 1=best)',
          'Verify that all annotators are evaluating the same aspect of responses',
        ]
      )

  if 0.0 <= alpha < 0.15:
    suggestions.append('Agreement is very low - consider starting over with a clearer rubric')

  return suggestions
