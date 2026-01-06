"""Shared utilities for Inter-Rater Reliability calculations.

This module provides common functionality used by both Cohen's Kappa
and Krippendorff's Alpha implementations, including metric selection
logic and result formatting.
"""

from collections import defaultdict
from typing import Dict, List, Tuple

from server.database import UserDB
from server.models import Annotation


def analyze_annotation_structure(annotations: List[Annotation]) -> Dict[str, any]:
  """Analyze the structure of annotations to determine appropriate IRR metric.

  Args:
      annotations: List of annotations to analyze

  Returns:
      Dict containing analysis results:
      - num_raters: Number of unique raters
      - num_traces: Number of unique traces
      - total_annotations: Total number of annotations
      - completeness: Proportion of possible annotations present
      - rater_participation: Dict of rater_id -> number of annotations
      - trace_coverage: Dict of trace_id -> number of annotations
      - missing_data: Whether there are missing annotations
      - recommended_metric: "cohens_kappa" or "krippendorff_alpha"

  This analysis helps determine which IRR metric is most appropriate
  for the given annotation structure.
  """
  if not annotations:
    return {
      'num_raters': 0,
      'num_traces': 0,
      'total_annotations': 0,
      'completeness': 0.0,
      'rater_participation': {},
      'trace_coverage': {},
      'missing_data': False,
      'recommended_metric': None,
    }

  # Count unique raters and traces
  raters = set(ann.user_id for ann in annotations)
  traces = set(ann.trace_id for ann in annotations)

  # Analyze rater participation
  rater_participation = defaultdict(int)
  for ann in annotations:
    rater_participation[ann.user_id] += 1

  # Analyze trace coverage
  trace_coverage = defaultdict(int)
  for ann in annotations:
    trace_coverage[ann.trace_id] += 1

  # Calculate completeness (proportion of possible annotations present)
  possible_annotations = len(raters) * len(traces)
  actual_annotations = len(annotations)
  completeness = actual_annotations / possible_annotations if possible_annotations > 0 else 0.0

  # Determine if there's missing data
  missing_data = completeness < 1.0

  # Recommend appropriate metric
  recommended_metric = _recommend_irr_metric(len(raters), missing_data, actual_annotations)

  return {
    'num_raters': len(raters),
    'num_traces': len(traces),
    'total_annotations': actual_annotations,
    'completeness': completeness,
    'rater_participation': dict(rater_participation),
    'trace_coverage': dict(trace_coverage),
    'missing_data': missing_data,
    'recommended_metric': recommended_metric,
  }


def _recommend_irr_metric(num_raters: int, missing_data: bool, total_annotations: int) -> str:
  """Recommend appropriate IRR metric based on data characteristics.

  Args:
      num_raters: Number of unique raters
      missing_data: Whether there are missing annotations
      total_annotations: Total number of annotations

  Returns:
      str: "cohens_kappa" or "krippendorff_alpha"

  Decision logic:
      - Cohen's Kappa: Exactly 2 raters, no missing data, sufficient annotations
      - Krippendorff's Alpha: Multiple raters, missing data, or ordinal data
  """
  if total_annotations < 2:
    return 'krippendorff_alpha'  # Default for insufficient data

  if num_raters == 2 and not missing_data:
    return 'cohens_kappa'
  else:
    return 'krippendorff_alpha'


def validate_annotations_for_irr(annotations: List[Annotation]) -> Tuple[bool, str]:
  """Validate that annotations are suitable for IRR calculation.

  Args:
      annotations: List of annotations to validate

  Returns:
      Tuple[bool, str]: (is_valid, error_message)

  Validation checks:
      - Minimum number of annotations
      - Valid rating range (1-5)
      - At least 2 raters
      - At least 2 traces with multiple ratings
  """
  if len(annotations) < 2:
    return False, 'Need at least 2 annotations to calculate IRR'

  # Check rating range - support both binary (0/1) and Likert (1-5)
  for ann in annotations:
    if not (0 <= ann.rating <= 5):
      return False, f'Invalid rating {ann.rating}: must be between 0 and 5'

  # Check number of raters
  raters = set(ann.user_id for ann in annotations)
  if len(raters) < 2:
    return False, f'Need at least 2 raters to calculate IRR, got {len(raters)}'

  # Check for traces with multiple ratings
  trace_ratings = defaultdict(set)
  for ann in annotations:
    trace_ratings[ann.trace_id].add(ann.user_id)

  multi_rated_traces = sum(1 for raters in trace_ratings.values() if len(raters) > 1)
  if multi_rated_traces < 2:
    return False, f'Need at least 2 traces rated by multiple raters, got {multi_rated_traces}'

  return True, ''


def format_irr_result(
  metric_name: str,
  score: float,
  interpretation: str,
  suggestions: List[str],
  analysis: Dict[str, any],
) -> Dict[str, any]:
  """Format IRR calculation result for API response.

  Args:
      metric_name: Name of the metric used ("Cohen's Kappa" or "Krippendorff's Alpha")
      score: IRR score value
      interpretation: Human-readable interpretation
      suggestions: List of improvement suggestions
      analysis: Annotation structure analysis

  Returns:
      Dict containing formatted IRR result
  """
  return {
    'metric_used': metric_name,
    'score': round(score, 3),
    'interpretation': interpretation,
    'ready_to_proceed': score >= 0.3,
    'threshold': 0.3,
    'suggestions': suggestions,
    'num_raters': analysis['num_raters'],
    'num_traces': analysis['num_traces'],
    'num_annotations': analysis['total_annotations'],
    'completeness': round(analysis['completeness'], 3),
    'missing_data': analysis['missing_data'],
  }


def get_irr_confidence_level(score: float) -> str:
  """Determine confidence level for IRR score.

  Args:
      score: IRR score (0-1)

  Returns:
      str: Confidence level description
  """
  if score >= 0.8:
    return 'High confidence - results are reliable'
  elif score >= 0.6:
    return 'Moderate confidence - results are acceptable'
  elif score >= 0.3:
    return 'Low confidence - results are tentative'
  else:
    return 'Very low confidence - results are unreliable'


def detect_problematic_patterns(annotations: List[Annotation], db=None, question_id: str = None) -> List[str]:
  """Detect problematic patterns in annotation data.

  Args:
      annotations: List of annotations to analyze
      db: Database session for user name lookups
      question_id: Optional question ID to analyze a specific metric

  Returns:
      List[str]: List of detected issues

  Detects patterns that might indicate problems:
      - Raters who always give the same rating
      - Traces with extreme disagreement
      - Systematic bias between raters
  """
  issues = []

  # Helper function to get user name
  def get_user_name(user_id: str) -> str:
    if db:
      try:
        user = db.query(UserDB).filter(UserDB.id == user_id).first()
        if user and user.name:
          return user.name
      except Exception:
        pass  # Fall back to user_id if lookup fails
    return user_id

  # Helper function to get rating from annotation
  # Prefers per-question ratings dict, falls back to legacy rating
  def get_rating(ann: Annotation) -> int:
    if ann.ratings and len(ann.ratings) > 0:
      if question_id and question_id in ann.ratings:
        return ann.ratings[question_id]
      # Return first rating if no specific question_id
      return list(ann.ratings.values())[0]
    return ann.rating

  # Collect all ratings to detect if binary
  all_ratings = [get_rating(ann) for ann in annotations if get_rating(ann) is not None]
  is_binary = all(r in (0, 1) for r in all_ratings) if all_ratings else False

  # Check for raters with no variation
  rater_ratings = defaultdict(set)
  for ann in annotations:
    rating = get_rating(ann)
    if rating is not None:
      rater_ratings[ann.user_id].add(rating)

  for rater_id, ratings in rater_ratings.items():
    if len(ratings) == 1:
      rating = list(ratings)[0]
      rater_name = get_user_name(rater_id)
      if is_binary:
        rating_label = 'Pass' if rating == 1 else 'Fail'
        issues.append(f'Rater {rater_name} always gives {rating_label} (no variation)')
      else:
        issues.append(f'Rater {rater_name} always gives rating {rating} (no variation)')

  # Check for traces with extreme disagreement
  trace_ratings = defaultdict(list)
  for ann in annotations:
    rating = get_rating(ann)
    if rating is not None:
      trace_ratings[ann.trace_id].append(rating)

  for trace_id, ratings in trace_ratings.items():
    if len(ratings) > 1:
      rating_range = max(ratings) - min(ratings)
      # For binary: any disagreement is notable; for Likert: only extreme (4+ points)
      threshold = 1 if is_binary else 4
      if rating_range >= threshold:
        if is_binary:
          issues.append(f'Trace {trace_id[:16]}... has disagreement (Pass vs Fail)')
        else:
          issues.append(f'Trace {trace_id[:16]}... has extreme disagreement (range: {rating_range})')

  # Check for systematic bias (only for Likert scale)
  if not is_binary and len(set(ann.user_id for ann in annotations)) >= 2:
    avg_by_rater = defaultdict(list)
    for ann in annotations:
      rating = get_rating(ann)
      if rating is not None:
        avg_by_rater[ann.user_id].append(rating)

    rater_averages = {rater: sum(ratings) / len(ratings) for rater, ratings in avg_by_rater.items() if ratings}

    if len(rater_averages) >= 2:
      avg_range = max(rater_averages.values()) - min(rater_averages.values())
      if avg_range >= 2:  # Large difference in average ratings
        issues.append('Raters have very different average ratings - consider discussing rating standards')

  return issues
