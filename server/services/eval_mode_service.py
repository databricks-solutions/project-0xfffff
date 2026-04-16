"""Eval-mode rubric rendering and score aggregation."""

from __future__ import annotations

from collections import defaultdict

from server.models import (
    CriterionEvaluation,
    CriterionScoreResult,
    TraceCriterion,
    TraceCriterionType,
    TraceEvalScore,
    TraceRubric,
)


class EvalModeService:
    """Pure eval-mode domain logic independent of transport/persistence."""

    @staticmethod
    def render_trace_rubric(workshop_id: str, trace_id: str, criteria: list[TraceCriterion]) -> TraceRubric:
        lines: list[str] = ["## Criteria", ""]
        for criterion in criteria:
            heading = criterion.text
            if criterion.criterion_type == TraceCriterionType.HURDLE:
                heading = f"[HURDLE] {heading}"
            lines.append(f"### {heading}")
            lines.append("")
            if criterion.criterion_type == TraceCriterionType.HURDLE:
                lines.append("**Weight: gate**")
            else:
                lines.append(f"**Weight: {criterion.weight:+d}**")
            lines.append("")

        markdown = "\n".join(lines).strip()
        return TraceRubric(
            workshop_id=workshop_id,
            trace_id=trace_id,
            criteria=criteria,
            markdown=markdown,
        )

    @staticmethod
    def aggregate_trace_score(
        trace_id: str,
        criteria: list[TraceCriterion],
        evaluations: list[CriterionEvaluation],
    ) -> TraceEvalScore:
        latest_eval_by_criterion: dict[str, CriterionEvaluation] = {}
        grouped = defaultdict(list)
        for evaluation in evaluations:
            grouped[evaluation.criterion_id].append(evaluation)
        for criterion_id, criterion_evals in grouped.items():
            latest_eval_by_criterion[criterion_id] = sorted(
                criterion_evals,
                key=lambda e: e.created_at,
            )[-1]

        hurdle_results: list[CriterionScoreResult] = []
        criteria_results: list[CriterionScoreResult] = []

        for criterion in criteria:
            evaluation = latest_eval_by_criterion.get(criterion.id)
            met = bool(evaluation.met) if evaluation is not None else False
            rationale = evaluation.rationale if evaluation is not None else None

            if criterion.criterion_type == TraceCriterionType.HURDLE:
                hurdle_results.append(
                    CriterionScoreResult(
                        criterion_id=criterion.id,
                        criterion_text=criterion.text,
                        criterion_type=criterion.criterion_type,
                        weight=criterion.weight,
                        met=met,
                        rationale=rationale,
                        score=0.0,
                    )
                )
                continue

            score = float(criterion.weight if met else 0)
            criteria_results.append(
                CriterionScoreResult(
                    criterion_id=criterion.id,
                    criterion_text=criterion.text,
                    criterion_type=criterion.criterion_type,
                    weight=criterion.weight,
                    met=met,
                    rationale=rationale,
                    score=score,
                )
            )

        hurdle_passed = all(result.met for result in hurdle_results) if hurdle_results else True
        if not hurdle_passed:
            return TraceEvalScore(
                trace_id=trace_id,
                hurdle_passed=False,
                hurdle_results=hurdle_results,
                criteria_results=criteria_results,
                raw_score=0.0,
                max_possible=0.0,
                normalized_score=0.0,
            )

        raw_score = float(sum(result.score for result in criteria_results))
        max_possible = float(
            sum(
                criterion.weight
                for criterion in criteria
                if criterion.criterion_type == TraceCriterionType.STANDARD and criterion.weight > 0
            )
        )
        if max_possible <= 0:
            normalized = 0.0
        else:
            normalized = max(0.0, min(1.0, raw_score / max_possible))

        return TraceEvalScore(
            trace_id=trace_id,
            hurdle_passed=True,
            hurdle_results=hurdle_results,
            criteria_results=criteria_results,
            raw_score=raw_score,
            max_possible=max_possible,
            normalized_score=normalized,
        )
