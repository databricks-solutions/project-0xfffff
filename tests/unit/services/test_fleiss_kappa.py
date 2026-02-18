"""Tests for GDPval Human Inter-Rater Agreement (A^HH).

Verifies the normalized pairwise agreement metric from the GDPval paper:
  A_s^HH = E[1 - |H_1 - H_2|]
where ratings are normalized to [0, 1].
"""

import pytest

from server.models import Annotation
from server.services.fleiss_kappa import (
    _normalize_rating,
    calculate_human_agreement,
    calculate_human_agreement_per_metric,
    interpret_human_agreement,
)


# ── Factories ──────────────────────────────────────────────────────────


def _ann(*, trace_id: str, user_id: str, rating: int = 3, ratings=None) -> Annotation:
    return Annotation(
        id=f"{trace_id}:{user_id}",
        workshop_id="w1",
        trace_id=trace_id,
        user_id=user_id,
        rating=rating,
        ratings=ratings,
        comment=None,
    )


# ── _normalize_rating ──────────────────────────────────────────────────


@pytest.mark.spec("IRR_SPEC")
class TestNormalizeRating:
    """Tests for rating normalization to [0, 1]."""

    def test_likert_1_maps_to_0(self):
        assert _normalize_rating(1) == 0.0

    def test_likert_5_maps_to_1(self):
        assert _normalize_rating(5) == 1.0

    def test_likert_3_maps_to_half(self):
        assert _normalize_rating(3) == 0.5

    def test_likert_2_maps_to_quarter(self):
        assert _normalize_rating(2) == 0.25

    def test_likert_4_maps_to_three_quarters(self):
        assert _normalize_rating(4) == 0.75

    def test_binary_0(self):
        assert _normalize_rating(0, is_binary=True) == 0.0

    def test_binary_1(self):
        assert _normalize_rating(1, is_binary=True) == 1.0


# ── calculate_human_agreement ──────────────────────────────────────────


@pytest.mark.spec("IRR_SPEC")
class TestCalculateHumanAgreement:
    """Tests for the GDPval A^HH calculation."""

    def test_empty_annotations_returns_none(self):
        assert calculate_human_agreement([]) is None

    def test_single_annotation_returns_none(self):
        anns = [_ann(trace_id="t1", user_id="u1", rating=3)]
        assert calculate_human_agreement(anns) is None

    def test_perfect_agreement_same_rating(self):
        """All raters give same rating → A^HH = 1.0."""
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=4),
            _ann(trace_id="t1", user_id="u2", rating=4),
            _ann(trace_id="t1", user_id="u3", rating=4),
            _ann(trace_id="t2", user_id="u1", rating=2),
            _ann(trace_id="t2", user_id="u2", rating=2),
            _ann(trace_id="t2", user_id="u3", rating=2),
        ]
        result = calculate_human_agreement(anns)
        assert result == 1.0

    def test_maximum_disagreement(self):
        """Raters at opposite ends of scale → low A^HH.

        Trace 1: ratings [1, 5] → normalized [0, 1] → 1 - |0 - 1| = 0
        Trace 2: ratings [1, 5] → normalized [0, 1] → 1 - |0 - 1| = 0
        A^HH = 0.0
        """
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=1),
            _ann(trace_id="t1", user_id="u2", rating=5),
            _ann(trace_id="t2", user_id="u1", rating=1),
            _ann(trace_id="t2", user_id="u2", rating=5),
        ]
        result = calculate_human_agreement(anns)
        assert result == 0.0

    def test_adjacent_ratings(self):
        """Adjacent ratings (differ by 1) on 1-5 scale.

        Trace 1: [3, 4] → normalized [0.5, 0.75] → 1 - 0.25 = 0.75
        Trace 2: [2, 3] → normalized [0.25, 0.5] → 1 - 0.25 = 0.75
        A^HH = 0.75
        """
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=3),
            _ann(trace_id="t1", user_id="u2", rating=4),
            _ann(trace_id="t2", user_id="u1", rating=2),
            _ann(trace_id="t2", user_id="u2", rating=3),
        ]
        result = calculate_human_agreement(anns)
        assert result is not None
        assert abs(result - 0.75) < 0.001

    def test_known_value_three_raters(self):
        """Hand-calculated: 3 raters on 1-5 scale.

        Trace 1: [3, 4, 5] → normalized [0.5, 0.75, 1.0]
          pairs: |0.5-0.75|=0.25, |0.5-1.0|=0.5, |0.75-1.0|=0.25
          mean(1-diff) = mean(0.75, 0.5, 0.75) = 2.0/3 ≈ 0.6667

        Trace 2: [1, 1, 2] → normalized [0, 0, 0.25]
          pairs: |0-0|=0, |0-0.25|=0.25, |0-0.25|=0.25
          mean(1-diff) = mean(1.0, 0.75, 0.75) = 2.5/3 ≈ 0.8333

        A^HH = (0.6667 + 0.8333) / 2 = 0.75
        """
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=3),
            _ann(trace_id="t1", user_id="u2", rating=4),
            _ann(trace_id="t1", user_id="u3", rating=5),
            _ann(trace_id="t2", user_id="u1", rating=1),
            _ann(trace_id="t2", user_id="u2", rating=1),
            _ann(trace_id="t2", user_id="u3", rating=2),
        ]
        result = calculate_human_agreement(anns)
        assert result is not None
        assert abs(result - 0.75) < 0.001

    def test_binary_perfect_agreement(self):
        """Binary (0/1) ratings with perfect agreement → 1.0."""
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=1, ratings={"q_1": 1}),
            _ann(trace_id="t1", user_id="u2", rating=1, ratings={"q_1": 1}),
            _ann(trace_id="t1", user_id="u3", rating=1, ratings={"q_1": 1}),
            _ann(trace_id="t2", user_id="u1", rating=1, ratings={"q_1": 0}),
            _ann(trace_id="t2", user_id="u2", rating=1, ratings={"q_1": 0}),
            _ann(trace_id="t2", user_id="u3", rating=1, ratings={"q_1": 0}),
        ]
        result = calculate_human_agreement(anns, question_id="q_1")
        assert result == 1.0

    def test_binary_complete_disagreement(self):
        """Binary: one says 0, other says 1 → A^HH = 0.

        Trace 1: [0, 1] → 1 - |0-1| = 0
        Trace 2: [0, 1] → 1 - |0-1| = 0
        """
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=1, ratings={"q_1": 0}),
            _ann(trace_id="t1", user_id="u2", rating=1, ratings={"q_1": 1}),
            _ann(trace_id="t2", user_id="u1", rating=1, ratings={"q_1": 0}),
            _ann(trace_id="t2", user_id="u2", rating=1, ratings={"q_1": 1}),
        ]
        result = calculate_human_agreement(anns, question_id="q_1")
        assert result == 0.0

    def test_binary_partial_agreement(self):
        """Binary: 2 agree, 1 disagrees per trace.

        Trace 1: [1, 1, 0] → pairs: 0, 1, 1 → 1-diff: 1, 0, 0 → mean=1/3
        Trace 2: [0, 0, 1] → pairs: 0, 1, 1 → 1-diff: 1, 0, 0 → mean=1/3
        A^HH = 1/3
        """
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=1, ratings={"q_1": 1}),
            _ann(trace_id="t1", user_id="u2", rating=1, ratings={"q_1": 1}),
            _ann(trace_id="t1", user_id="u3", rating=1, ratings={"q_1": 0}),
            _ann(trace_id="t2", user_id="u1", rating=1, ratings={"q_1": 0}),
            _ann(trace_id="t2", user_id="u2", rating=1, ratings={"q_1": 0}),
            _ann(trace_id="t2", user_id="u3", rating=1, ratings={"q_1": 1}),
        ]
        result = calculate_human_agreement(anns, question_id="q_1")
        assert result is not None
        assert abs(result - 1 / 3) < 0.001

    def test_with_question_id(self):
        """Per-question ratings via question_id parameter."""
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=3, ratings={"q_1": 4, "q_2": 1}),
            _ann(trace_id="t1", user_id="u2", rating=3, ratings={"q_1": 4, "q_2": 5}),
            _ann(trace_id="t2", user_id="u1", rating=3, ratings={"q_1": 2, "q_2": 1}),
            _ann(trace_id="t2", user_id="u2", rating=3, ratings={"q_1": 2, "q_2": 5}),
        ]
        # q_1: perfect agreement → 1.0
        result_q1 = calculate_human_agreement(anns, question_id="q_1")
        assert result_q1 == 1.0

        # q_2: max disagreement (1 vs 5) → 0.0
        result_q2 = calculate_human_agreement(anns, question_id="q_2")
        assert result_q2 == 0.0

    def test_result_always_in_zero_one(self):
        """A^HH is always in [0, 1]."""
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=1),
            _ann(trace_id="t1", user_id="u2", rating=3),
            _ann(trace_id="t1", user_id="u3", rating=5),
            _ann(trace_id="t2", user_id="u1", rating=2),
            _ann(trace_id="t2", user_id="u2", rating=4),
            _ann(trace_id="t2", user_id="u3", rating=1),
        ]
        result = calculate_human_agreement(anns)
        assert result is not None
        assert 0.0 <= result <= 1.0

    def test_four_raters(self):
        """Works with 4 raters, all agreeing → 1.0."""
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=5),
            _ann(trace_id="t1", user_id="u2", rating=5),
            _ann(trace_id="t1", user_id="u3", rating=5),
            _ann(trace_id="t1", user_id="u4", rating=5),
            _ann(trace_id="t2", user_id="u1", rating=2),
            _ann(trace_id="t2", user_id="u2", rating=2),
            _ann(trace_id="t2", user_id="u3", rating=2),
            _ann(trace_id="t2", user_id="u4", rating=2),
        ]
        result = calculate_human_agreement(anns)
        assert result == 1.0

    def test_traces_with_single_rater_ignored(self):
        """Traces with only 1 rater are excluded from calculation."""
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=4),
            _ann(trace_id="t1", user_id="u2", rating=4),
            _ann(trace_id="t2", user_id="u1", rating=3),
            _ann(trace_id="t2", user_id="u2", rating=3),
            # Trace 3: only 1 rater → ignored
            _ann(trace_id="t3", user_id="u1", rating=1),
        ]
        result = calculate_human_agreement(anns)
        # Only t1 and t2 counted, both perfect → 1.0
        assert result == 1.0

    def test_many_traces(self):
        """Handles many traces correctly."""
        anns = []
        for i in range(10):
            for user in ["u1", "u2", "u3"]:
                anns.append(_ann(trace_id=f"t{i}", user_id=user, rating=(i % 5) + 1))
        result = calculate_human_agreement(anns)
        assert result == 1.0


# ── calculate_human_agreement_per_metric ───────────────────────────────


@pytest.mark.spec("IRR_SPEC")
class TestCalculateHumanAgreementPerMetric:
    """Tests for per-metric A^HH calculation."""

    def test_no_ratings_dict_returns_empty(self):
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=3),
            _ann(trace_id="t1", user_id="u2", rating=3),
        ]
        assert calculate_human_agreement_per_metric(anns) == {}

    def test_single_metric_perfect(self):
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=3, ratings={"q_1": 4}),
            _ann(trace_id="t1", user_id="u2", rating=3, ratings={"q_1": 4}),
            _ann(trace_id="t2", user_id="u1", rating=3, ratings={"q_1": 2}),
            _ann(trace_id="t2", user_id="u2", rating=3, ratings={"q_1": 2}),
        ]
        result = calculate_human_agreement_per_metric(anns)
        assert "q_1" in result
        assert result["q_1"] == 1.0

    def test_multiple_metrics(self):
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=3, ratings={"q_1": 4, "q_2": 1}),
            _ann(trace_id="t1", user_id="u2", rating=3, ratings={"q_1": 4, "q_2": 5}),
            _ann(trace_id="t2", user_id="u1", rating=3, ratings={"q_1": 2, "q_2": 1}),
            _ann(trace_id="t2", user_id="u2", rating=3, ratings={"q_1": 2, "q_2": 5}),
        ]
        result = calculate_human_agreement_per_metric(anns)
        assert result["q_1"] == 1.0
        assert result["q_2"] == 0.0

    def test_insufficient_data_returns_none(self):
        """Single annotation → None for that metric."""
        anns = [
            _ann(trace_id="t1", user_id="u1", rating=3, ratings={"q_1": 4}),
        ]
        result = calculate_human_agreement_per_metric(anns)
        assert "q_1" in result
        assert result["q_1"] is None


# ── interpret_human_agreement ──────────────────────────────────────────


@pytest.mark.spec("IRR_SPEC")
class TestInterpretHumanAgreement:
    """Tests for agreement interpretation."""

    def test_excellent(self):
        assert "Excellent" in interpret_human_agreement(0.95)

    def test_good(self):
        assert "Good" in interpret_human_agreement(0.80)

    def test_moderate(self):
        assert "Moderate" in interpret_human_agreement(0.65)

    def test_fair(self):
        assert "Fair" in interpret_human_agreement(0.55)

    def test_poor(self):
        assert "Poor" in interpret_human_agreement(0.30)

    def test_boundary_one(self):
        assert "Excellent" in interpret_human_agreement(1.0)

    def test_boundary_zero(self):
        assert "Poor" in interpret_human_agreement(0.0)
