"""Main Inter-Rater Reliability (IRR) service with automatic metric selection.

This service automatically chooses between Cohen's Kappa and Krippendorff's Alpha
based on the characteristics of the annotation data, providing a unified interface
for IRR calculations in the workshop application.
"""

import logging
from typing import Any, Dict, List

from server.models import Annotation, IRRResult
from server.services.cohens_kappa import (
  calculate_cohens_kappa,
  interpret_cohens_kappa,
  is_cohens_kappa_acceptable,
)
from server.services.irr_utils import (
  analyze_annotation_structure,
  detect_problematic_patterns,
  format_irr_result,
  validate_annotations_for_irr,
)
from server.services.krippendorff_alpha import (
  calculate_krippendorff_alpha,
  calculate_krippendorff_alpha_per_metric,
  get_krippendorff_improvement_suggestions,
  get_unique_question_ids,
  interpret_krippendorff_alpha,
  is_krippendorff_alpha_acceptable,
)

logger = logging.getLogger(__name__)


def calculate_irr_for_workshop(workshop_id: str, annotations: List[Annotation], db=None) -> IRRResult:
  """Calculate Inter-Rater Reliability for a workshop with automatic metric selection.

  Args:
      workshop_id: ID of the workshop to calculate IRR for
      annotations: List of annotations for the workshop
      db: Database session for user lookups

  Returns:
      IRRResult: Comprehensive IRR calculation result

  This function automatically selects the appropriate IRR metric based on:
      - Number of raters (2 = Cohen's Kappa, >2 = Krippendorff's Alpha)
      - Data completeness (missing data = Krippendorff's Alpha)
      - Data type (ordinal 1-5 scale favors Krippendorff's Alpha)

  The result includes the IRR score, interpretation, improvement suggestions,
  and metadata about the calculation process.
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

  # Calculate IRR using appropriate metric
  try:
    if analysis['recommended_metric'] == 'cohens_kappa':
      result = _calculate_cohens_kappa_result(annotations, analysis)
    else:
      result = _calculate_krippendorff_alpha_result(annotations, analysis)

    # Add diagnostic information
    result['problematic_patterns'] = detect_problematic_patterns(annotations, db)

    logger.info(f'IRR calculated for workshop {workshop_id}: {result["metric_used"]} = {result["score"]}')

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


def _calculate_cohens_kappa_result(annotations: List[Annotation], analysis: Dict[str, Any]) -> Dict[str, Any]:
  """Calculate Cohen's Kappa and format result with per-metric scores.

  Args:
      annotations: List of annotations from exactly 2 raters
      analysis: Annotation structure analysis

  Returns:
      Dict containing formatted Cohen's Kappa result with per-metric scores
  """
  # Calculate per-metric IRR using Krippendorff's Alpha
  # (Cohen's Kappa doesn't support multi-metric calculation, so we use Krippendorff's Alpha)
  per_metric_scores = calculate_krippendorff_alpha_per_metric(annotations)
  
  # Calculate overall Cohen's Kappa for the main score
  kappa = calculate_cohens_kappa(annotations)
  interpretation = interpret_cohens_kappa(kappa)
  ready_to_proceed = is_cohens_kappa_acceptable(kappa)

  # Generate suggestions if needed
  suggestions = []
  if not ready_to_proceed:
    suggestions = [
      'Consider revising the rubric to reduce ambiguity',
      'Provide additional training on the rating scale',
      'Discuss specific examples where disagreement occurred',
      'Ensure both raters understand the evaluation criteria identically',
    ]

  result = format_irr_result(
    metric_name="Cohen's Kappa",
    score=kappa,
    interpretation=interpretation,
    suggestions=suggestions,
    analysis=analysis,
  )
  
  # Add per-metric scores to the result (using Krippendorff's Alpha for each metric)
  result['per_metric_scores'] = {}
  for question_id, score in per_metric_scores.items():
    result['per_metric_scores'][question_id] = {
      'score': score,
      'interpretation': interpret_krippendorff_alpha(score),
      'acceptable': is_krippendorff_alpha_acceptable(score),
    }
  
  return result


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


def _calculate_krippendorff_alpha_result(annotations: List[Annotation], analysis: Dict[str, Any]) -> Dict[str, Any]:
  """Calculate Krippendorff's Alpha and format result.

  Args:
      annotations: List of annotations from any number of raters
      analysis: Annotation structure analysis

  Returns:
      Dict containing formatted Krippendorff's Alpha result with per-metric scores
  """
  # Calculate per-metric IRR
  per_metric_scores = calculate_krippendorff_alpha_per_metric(annotations)
  
  # Calculate overall score (average of all metrics, or legacy single rating)
  if len(per_metric_scores) == 1 and "overall" in per_metric_scores:
    # Legacy single rating
    alpha = per_metric_scores["overall"]
  else:
    # Average across all metrics
    alpha = sum(per_metric_scores.values()) / len(per_metric_scores) if per_metric_scores else 0.0
  
  interpretation = interpret_krippendorff_alpha(alpha)
  # TODO: this was ostensibly here for a reason, but I don't know what it is.
  # ready_to_proceed = is_krippendorff_alpha_acceptable(alpha)
  suggestions = get_krippendorff_improvement_suggestions(alpha)

  result = format_irr_result(
    metric_name="Krippendorff's Alpha",
    score=alpha,
    interpretation=interpretation,
    suggestions=suggestions,
    analysis=analysis,
  )
  
  # Add per-metric scores to the result with individual suggestions
  result['per_metric_scores'] = {}
  for question_id, score in per_metric_scores.items():
    # Detect if this metric uses binary scale
    is_binary = _is_binary_metric(annotations, question_id)
    metric_suggestions = get_krippendorff_improvement_suggestions(score, is_binary=is_binary)
    result['per_metric_scores'][question_id] = {
      'score': score,
      'interpretation': interpret_krippendorff_alpha(score),
      'acceptable': is_krippendorff_alpha_acceptable(score),
      'suggestions': metric_suggestions,
      'is_binary': is_binary,  # Include for frontend display
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


def compare_irr_metrics(annotations: List[Annotation]) -> Dict[str, Any]:
  """Compare Cohen's Kappa and Krippendorff's Alpha for the same data (if applicable).

  Args:
      annotations: List of annotations

  Returns:
      Dict containing comparison of both metrics

  This function is useful for understanding how different metrics
  perform on the same dataset and for educational purposes.
  """
  analysis = analyze_annotation_structure(annotations)

  results = {
    'analysis': analysis,
    'cohens_kappa': None,
    'krippendorff_alpha': None,
    'comparison': None,
  }

  # Calculate Krippendorff's Alpha (always possible with sufficient data)
  if len(annotations) >= 2 and analysis['num_raters'] >= 2:
    try:
      alpha = calculate_krippendorff_alpha(annotations)
      results['krippendorff_alpha'] = {
        'score': alpha,
        'interpretation': interpret_krippendorff_alpha(alpha),
        'acceptable': is_krippendorff_alpha_acceptable(alpha),
      }
    except Exception as e:
      results['krippendorff_alpha'] = {'error': str(e)}

  # Calculate Cohen's Kappa (only if exactly 2 raters and no missing data)
  if analysis['num_raters'] == 2 and not analysis['missing_data']:
    try:
      kappa = calculate_cohens_kappa(annotations)
      results['cohens_kappa'] = {
        'score': kappa,
        'interpretation': interpret_cohens_kappa(kappa),
        'acceptable': is_cohens_kappa_acceptable(kappa),
      }
    except Exception as e:
      results['cohens_kappa'] = {'error': str(e)}

  # Add comparison if both metrics were calculated
  if results['cohens_kappa'] and results['krippendorff_alpha']:
    kappa_score = results['cohens_kappa']['score']
    alpha_score = results['krippendorff_alpha']['score']

    results['comparison'] = {
      'difference': abs(kappa_score - alpha_score),
      'agreement': 'close' if abs(kappa_score - alpha_score) < 0.1 else 'different',
      'note': "Cohen's Kappa and Krippendorff's Alpha use different mathematical approaches",
    }

  return results
