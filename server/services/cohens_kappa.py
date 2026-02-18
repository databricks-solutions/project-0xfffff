"""Cohen's Kappa implementation for inter-rater reliability.

Cohen's Kappa is appropriate for:
- Exactly 2 raters
- Categorical data (though can be used with ordinal data)
- Complete data (no missing values)

Formula: κ = (p_o - p_e) / (1 - p_e)
Where:
- p_o = observed agreement
- p_e = expected agreement by chance
"""

from collections import Counter

from server.models import Annotation


def calculate_cohens_kappa(annotations: list[Annotation]) -> float:
    """Calculate Cohen's Kappa for exactly 2 raters.

    Args:
        annotations: List of annotations from exactly 2 raters

    Returns:
        float: Cohen's Kappa value (-1 to 1)
        - 1.0 = Perfect agreement
        - 0.0 = Agreement equal to chance
        - <0.0 = Systematic disagreement

    Raises:
        ValueError: If not exactly 2 raters or insufficient data

    Example:
        >>> annotations = [
        ...     Annotation(trace_id="t1", user_id="u1", rating=4),
        ...     Annotation(trace_id="t1", user_id="u2", rating=4),
        ...     Annotation(trace_id="t2", user_id="u1", rating=2),
        ...     Annotation(trace_id="t2", user_id="u2", rating=3),
        ... ]
        >>> kappa = calculate_cohens_kappa(annotations)
        >>> # Returns kappa value based on agreement between u1 and u2
    """
    if len(annotations) == 0:
        raise ValueError("No annotations provided")

    # Organize annotations by trace and rater
    data_matrix = _organize_annotations_by_trace_and_rater(annotations)

    # Validate exactly 2 raters
    all_raters = set()
    for trace_ratings in data_matrix.values():
        all_raters.update(trace_ratings.keys())

    if len(all_raters) != 2:
        raise ValueError(f"Cohen's Kappa requires exactly 2 raters, got {len(all_raters)}")

    rater1, rater2 = list(all_raters)

    # Extract paired ratings (only traces rated by both raters)
    paired_ratings = []
    for ratings in data_matrix.values():
        if rater1 in ratings and rater2 in ratings:
            paired_ratings.append((ratings[rater1], ratings[rater2]))

    if len(paired_ratings) < 2:
        raise ValueError("Need at least 2 paired ratings to calculate Cohen's Kappa")

    # Calculate observed agreement
    observed_agreement = _calculate_observed_agreement(paired_ratings)

    # Calculate expected agreement by chance
    expected_agreement = _calculate_expected_agreement(paired_ratings)

    # Calculate Cohen's Kappa
    if expected_agreement == 1.0:
        return 1.0 if observed_agreement == 1.0 else 0.0

    kappa = (observed_agreement - expected_agreement) / (1 - expected_agreement)
    return max(-1.0, min(1.0, kappa))  # Clamp to [-1, 1]


def _organize_annotations_by_trace_and_rater(
    annotations: list[Annotation],
) -> dict[str, dict[str, int]]:
    """Organize annotations into a matrix: trace_id -> rater_id -> rating.

    Args:
        annotations: List of annotations

    Returns:
        Dict[str, Dict[str, int]]: Nested dictionary of trace->rater->rating
    """
    data_matrix = {}

    for annotation in annotations:
        trace_id = annotation.trace_id
        rater_id = annotation.user_id
        rating = annotation.rating

        if trace_id not in data_matrix:
            data_matrix[trace_id] = {}

        data_matrix[trace_id][rater_id] = rating

    return data_matrix


def _calculate_observed_agreement(paired_ratings: list[tuple[int, int]]) -> float:
    """Calculate observed agreement between two raters.

    Args:
        paired_ratings: List of (rater1_rating, rater2_rating) tuples

    Returns:
        float: Proportion of ratings where both raters agreed
    """
    total_pairs = len(paired_ratings)
    agreed_pairs = sum(1 for r1, r2 in paired_ratings if r1 == r2)

    return agreed_pairs / total_pairs


def _calculate_expected_agreement(paired_ratings: list[tuple[int, int]]) -> float:
    """Calculate expected agreement by chance based on marginal distributions.

    Args:
        paired_ratings: List of (rater1_rating, rater2_rating) tuples

    Returns:
        float: Expected agreement by chance

    Mathematical approach:
        For each rating category, calculate the probability that both raters
        would assign that rating by chance, then sum across all categories.
    """
    total_pairs = len(paired_ratings)

    # Count how often each rater used each rating
    rater1_counts = Counter(r1 for r1, r2 in paired_ratings)
    rater2_counts = Counter(r2 for r1, r2 in paired_ratings)

    # Calculate expected agreement for each rating category
    expected_agreement = 0.0

    # Consider all possible rating values (1-5 for Likert scale)
    for rating in range(1, 6):
        p_rater1 = rater1_counts.get(rating, 0) / total_pairs
        p_rater2 = rater2_counts.get(rating, 0) / total_pairs

        # Probability both raters assign this rating by chance
        expected_agreement += p_rater1 * p_rater2

    return expected_agreement


def interpret_cohens_kappa(kappa: float) -> str:
    """Provide human-readable interpretation of Cohen's Kappa score.

    Args:
        kappa: Cohen's Kappa value

    Returns:
        str: Human-readable interpretation

    Interpretation scale based on Landis & Koch (1977):
    - < 0.00: Poor agreement
    - 0.00-0.20: Slight agreement
    - 0.21-0.40: Fair agreement
    - 0.41-0.60: Moderate agreement
    - 0.61-0.80: Substantial agreement
    - 0.81-1.00: Almost perfect agreement
    """
    if kappa < 0.00:
        return "Poor agreement (systematic disagreement)"
    if kappa <= 0.20:
        return "Slight agreement"
    if kappa <= 0.40:
        return "Fair agreement"
    if kappa <= 0.60:
        return "Moderate agreement"
    if kappa <= 0.80:
        return "Substantial agreement"
    return "Almost perfect agreement"


def is_cohens_kappa_acceptable(kappa: float, threshold: float = 0.3) -> bool:
    """Check if Cohen's Kappa meets acceptable threshold for workshop progression.

    Args:
        kappa: Cohen's Kappa value
        threshold: Minimum acceptable threshold (default: 0.3)

    Returns:
        bool: True if kappa meets threshold, False otherwise

    Note:
        The default threshold of 0.3 is used for consistency with Krippendorff's Alpha,
        though Cohen's Kappa typically uses different thresholds (e.g., 0.4 for fair agreement).
    """
    return kappa >= threshold
