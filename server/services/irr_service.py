"""Main Inter-Rater Reliability (IRR) service using Pairwise Agreement Percentage.

Uses pairwise agreement percentage as the primary, interpretable metric
(inspired by GDPval's approach), with Krippendorff's Alpha as a secondary detail.
Includes GDPval human inter-rater agreement score (A^HH) as a normalized [0,1] metric.
"""

import logging
from typing import Any, Dict, List

from server.models import Annotation, IRRResult
from server.services.irr_utils import (
  analyze_annotation_structure,
  detect_problematic_patterns,
  format_irr_result,
  validate_annotations_for_irr,
)
from server.services.krippendorff_alpha import (
  calculate_krippendorff_alpha,
)
from server.services.pairwise_agreement import (
  calculate_pairwise_agreement_per_metric,
  get_pairwise_improvement_suggestions,
  interpret_pairwise_agreement,
  is_pairwise_agreement_acceptable,
)

logger = logging.getLogger(__name__)


def calculate_irr_for_workshop(workshop_id: str, annotations: List[Annotation], db=None) -> IRRResult:
  """Calculate Inter-Rater Reliability for a workshop using pairwise agreement.

  Args:
      workshop_id: ID of the workshop to calculate IRR for
      annotations: List of annotations for the workshop
      db: Database session for user lookups

  Returns:
      IRRResult: Comprehensive IRR calculation result with pairwise agreement scores
  """
  # Validate annotations
  is_valid, error_message = validate_annotations_for_irr(annotations)
  if not is_valid:
    logger.warning(f'Invalid annotations for workshop {workshop_id}: {error_message}')
    return IRRResult(
      workshop_id=workshop_id,
      score=0.0,
      ready_to_proceed=False,
      details={'error': error_message, 'metric_used': 'none', 'num_annotations': len(annotations)},
    )

  # Analyze annotation structure
  analysis = analyze_annotation_structure(annotations)

  # Calculate IRR using pairwise agreement
  try:
    result = _calculate_pairwise_agreement_result(annotations, analysis)

    # Add diagnostic information
    result['problematic_patterns'] = detect_problematic_patterns(annotations, db)

    # Calculate GDPval human agreement score (works with 2+ raters)
    try:
      from server.services.fleiss_kappa import calculate_human_agreement_per_metric
      ha_per_metric = calculate_human_agreement_per_metric(annotations)
      if ha_per_metric:
        for question_id, ha_score in ha_per_metric.items():
          if question_id in result.get('per_metric_scores', {}):
            result['per_metric_scores'][question_id]['human_agreement'] = (
              round(ha_score, 3) if ha_score is not None else None
            )

        ha_values = [v for v in ha_per_metric.values() if v is not None]
        if ha_values:
          result['human_agreement'] = round(sum(ha_values) / len(ha_values), 3)
          logger.info(
            f"Human agreement (GDPval) for workshop {workshop_id}: "
            f"{result['human_agreement']:.3f} ({analysis['num_raters']} raters)"
          )
    except Exception as ha_err:
      logger.warning(f"Could not compute human agreement for workshop {workshop_id}: {ha_err}")

    logger.info(f'IRR calculated for workshop {workshop_id}: {result["metric_used"]} = {result["score"]:.1f}%')

    return IRRResult(
      workshop_id=workshop_id,
      score=result['score'],
      ready_to_proceed=result['ready_to_proceed'],
      details=result,
    )

  except Exception as e:
    logger.error(f'Error calculating IRR for workshop {workshop_id}: {e}')
    return IRRResult(
      workshop_id=workshop_id,
      score=0.0,
      ready_to_proceed=False,
      details={
        'error': f'Calculation failed: {str(e)}',
        'metric_used': 'none',
        'num_annotations': len(annotations),
      },
    )


def _is_binary_metric(annotations: List[Annotation], question_id: str) -> bool:
  """Check if a metric uses binary (0/1) ratings.

  Args:
      annotations: List of annotations
      question_id: The question ID to check

  Returns:
      bool: True if all ratings for this metric are 0 or 1
  """
  ratings = []
  for ann in annotations:
    if ann.ratings and question_id in ann.ratings:
      ratings.append(ann.ratings[question_id])

  if not ratings:
    return False

  return all(r in (0, 1) for r in ratings)


def _calculate_pairwise_agreement_result(annotations: List[Annotation], analysis: Dict[str, Any]) -> Dict[str, Any]:
  """Calculate pairwise agreement and format result.

  Args:
      annotations: List of annotations from any number of raters
      analysis: Annotation structure analysis

  Returns:
      Dict containing formatted pairwise agreement result with per-metric scores
  """
  # Calculate per-metric pairwise agreement
  per_metric_agreement = calculate_pairwise_agreement_per_metric(annotations)

  # Calculate overall score (average primary agreement across metrics)
  primary_scores = []
  for question_id, scores in per_metric_agreement.items():
    is_binary = _is_binary_metric(annotations, question_id)
    if is_binary:
      primary_scores.append(scores["exact_agreement"])
    else:
      primary_scores.append(scores["adjacent_agreement"])

  overall_score = sum(primary_scores) / len(primary_scores) if primary_scores else 0.0
  interpretation = interpret_pairwise_agreement(overall_score)

  # Check if all metrics are acceptable
  all_acceptable = True
  overall_suggestions = []
  for question_id, scores in per_metric_agreement.items():
    is_binary = _is_binary_metric(annotations, question_id)
    primary = scores["exact_agreement"] if is_binary else scores["adjacent_agreement"]
    if not is_pairwise_agreement_acceptable(primary, is_binary):
      all_acceptable = False

  if not all_acceptable:
    overall_suggestions.append("Some criteria have low agreement - review per-metric details below")

  result = format_irr_result(
    metric_name="Pairwise Agreement",
    score=overall_score,
    interpretation=interpretation,
    suggestions=overall_suggestions,
    analysis=analysis,
  )

  # Build per-metric scores with full detail
  result['per_metric_scores'] = {}
  for question_id, scores in per_metric_agreement.items():
    is_binary = _is_binary_metric(annotations, question_id)
    primary = scores["exact_agreement"] if is_binary else scores["adjacent_agreement"]

    # Also compute Krippendorff's alpha as secondary detail
    try:
      kr_alpha = calculate_krippendorff_alpha(annotations, question_id=question_id)
    except Exception:
      kr_alpha = None

    metric_suggestions = get_pairwise_improvement_suggestions(
      scores["exact_agreement"],
      scores["adjacent_agreement"],
      is_binary,
    )

    result['per_metric_scores'][question_id] = {
      'score': round(primary, 1),
      'exact_agreement': round(scores["exact_agreement"], 1),
      'adjacent_agreement': round(scores["adjacent_agreement"], 1),
      'interpretation': interpret_pairwise_agreement(primary, is_binary),
      'acceptable': is_pairwise_agreement_acceptable(primary, is_binary),
      'suggestions': metric_suggestions,
      'is_binary': is_binary,
      'krippendorff_alpha': round(kr_alpha, 3) if kr_alpha is not None else None,
    }

  return result


def get_irr_status_for_workshop(workshop_id: str, annotations: List[Annotation]) -> Dict[str, Any]:
  """Get current IRR status for a workshop without recalculating.

  Args:
      workshop_id: ID of the workshop
      annotations: List of annotations for the workshop

  Returns:
      Dict containing current IRR status
  """
  analysis = analyze_annotation_structure(annotations)

  return {
    'workshop_id': workshop_id,
    'has_sufficient_data': len(annotations) >= 2 and analysis['num_raters'] >= 2,
    'num_annotations': len(annotations),
    'num_raters': analysis['num_raters'],
    'num_traces': analysis['num_traces'],
    'completeness': analysis['completeness'],
    'recommended_metric': analysis['recommended_metric'],
    'ready_for_calculation': validate_annotations_for_irr(annotations)[0],
  }
