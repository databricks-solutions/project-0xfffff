"""Eval-mode rubric rendering, score aggregation, judge execution, and IRR."""

from __future__ import annotations

import json
import logging
import os
import time
from collections import defaultdict
from typing import Any

from server.models import (
    CriterionEvaluation,
    CriterionScoreResult,
    Trace,
    TraceCriterion,
    TraceCriterionType,
    TraceEvalScore,
    TraceRubric,
)

logger = logging.getLogger(__name__)

JOB_DIR = "/tmp/eval_mode_jobs"
os.makedirs(JOB_DIR, exist_ok=True)


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

    # ------------------------------------------------------------------
    # Lineage-scoped context builder
    # ------------------------------------------------------------------

    @staticmethod
    def build_judge_context(trace: Trace, criterion: TraceCriterion) -> str:
        """Build lineage-scoped context for a single criterion evaluation.

        If the criterion has milestone_refs and the trace has a summary with
        milestones, extract only the referenced milestone sections. Otherwise
        fall back to the full trace input/output.
        """
        milestone_refs = criterion.milestone_refs or []
        summary = trace.summary if hasattr(trace, "summary") else None

        if milestone_refs and isinstance(summary, dict):
            milestones = summary.get("milestones") or []
            if milestones:
                ref_ids = set()
                for ref in milestone_refs:
                    parts = ref.split(":")
                    ref_ids.add(parts[-1] if len(parts) > 1 else parts[0])

                sections: list[str] = []
                executive = summary.get("executive_summary", "")
                if executive:
                    sections.append(f"Executive summary: {executive}")

                for m in milestones:
                    mid = m.get("id", "")
                    if mid in ref_ids:
                        title = m.get("title", mid)
                        detail = m.get("detail") or m.get("description") or ""
                        sections.append(f"[{mid}] {title}: {detail}")

                if sections:
                    return "\n".join(sections)

        parts = []
        if trace.input:
            parts.append(f"Input: {trace.input}")
        if trace.output:
            parts.append(f"Output: {trace.output}")
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Judge execution
    # ------------------------------------------------------------------

    @staticmethod
    def build_criterion_judge_prompt(trace_context: str, criterion: TraceCriterion) -> str:
        """Build a judge prompt for a single criterion evaluation."""
        ctype = "HURDLE (gate)" if criterion.criterion_type == TraceCriterionType.HURDLE else "Standard"
        return f"""You are an expert evaluator. Determine whether the trace meets a single evaluation criterion.

## Trace Context
{trace_context}

## Criterion
Type: {ctype}
{criterion.text}

## Instructions
- Return a JSON object with exactly two fields: "met" (boolean) and "rationale" (string).
- "met" should be true if the trace meets the criterion, false otherwise.
- "rationale" should be a brief explanation of your decision.
- Do NOT evaluate any other criteria — focus solely on this one."""

    @staticmethod
    def parse_judge_response(raw_text: str) -> tuple[bool, str]:
        """Parse judge response into (met, rationale)."""
        text = raw_text.strip()
        try:
            if "```json" in text:
                text = text.split("```json")[-1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            data = json.loads(text)
            met = bool(data.get("met", False))
            rationale = str(data.get("rationale", ""))
            return met, rationale
        except (json.JSONDecodeError, IndexError, KeyError):
            pass

        lower = text.lower()
        if '"met": true' in lower or '"met":true' in lower:
            return True, text
        if '"met": false' in lower or '"met":false' in lower:
            return False, text

        return False, f"Could not parse judge response: {text[:200]}"

    # ------------------------------------------------------------------
    # Eval-mode IRR (pairwise agreement on criterion decisions)
    # ------------------------------------------------------------------

    @staticmethod
    def calculate_eval_irr(
        criteria: list[TraceCriterion],
        evaluations: list[CriterionEvaluation],
    ) -> dict[str, Any]:
        """Compute pairwise agreement between HUMAN and LLM criterion evaluations.

        For each criterion that has both a HUMAN and LLM evaluation, check if
        they agree on met/not-met. Returns overall agreement % and per-criterion
        breakdown.
        """
        human_by_criterion: dict[str, bool] = {}
        llm_by_criterion: dict[str, bool] = {}

        grouped: dict[str, list[CriterionEvaluation]] = defaultdict(list)
        for ev in evaluations:
            grouped[ev.criterion_id].append(ev)

        for criterion_id, evals in grouped.items():
            humans = [e for e in evals if e.judge_model == "HUMAN"]
            llms = [e for e in evals if e.judge_model != "HUMAN"]
            if humans:
                latest_human = sorted(humans, key=lambda e: e.created_at)[-1]
                human_by_criterion[criterion_id] = bool(latest_human.met)
            if llms:
                latest_llm = sorted(llms, key=lambda e: e.created_at)[-1]
                llm_by_criterion[criterion_id] = bool(latest_llm.met)

        paired_ids = set(human_by_criterion.keys()) & set(llm_by_criterion.keys())
        if not paired_ids:
            return {
                "agreement_pct": 0.0,
                "total_pairs": 0,
                "agreeing_pairs": 0,
                "per_criterion": {},
                "ready_to_proceed": False,
                "interpretation": "No paired evaluations available",
            }

        agreeing = 0
        per_criterion: dict[str, dict[str, Any]] = {}
        for cid in paired_ids:
            h = human_by_criterion[cid]
            l = llm_by_criterion[cid]
            agreed = h == l
            if agreed:
                agreeing += 1
            crit = next((c for c in criteria if c.id == cid), None)
            per_criterion[cid] = {
                "criterion_text": crit.text if crit else cid,
                "human_met": h,
                "llm_met": l,
                "agreed": agreed,
            }

        total = len(paired_ids)
        pct = (agreeing / total) * 100 if total > 0 else 0.0

        if pct >= 90:
            interpretation = "Excellent agreement"
        elif pct >= 75:
            interpretation = "Good agreement"
        elif pct >= 60:
            interpretation = "Moderate agreement"
        elif pct >= 50:
            interpretation = "Fair agreement"
        else:
            interpretation = "Poor agreement"

        return {
            "agreement_pct": round(pct, 1),
            "total_pairs": total,
            "agreeing_pairs": agreeing,
            "per_criterion": per_criterion,
            "ready_to_proceed": pct >= 75.0,
            "interpretation": interpretation,
        }


# ------------------------------------------------------------------
# Eval job persistence (file-based, same pattern as workshop alignment jobs)
# ------------------------------------------------------------------


class EvalJob:
    """Lightweight file-based job tracker for eval-mode judge runs."""

    def __init__(self, job_id: str, workshop_id: str):
        self.job_id = job_id
        self.workshop_id = workshop_id
        self.status = "pending"
        self.total = 0
        self.completed = 0
        self.failed = 0
        self.logs: list[str] = []
        self.result: dict[str, Any] | None = None
        self.error: str | None = None
        self.created_at = time.time()
        self.updated_at = time.time()

    @property
    def _meta_path(self) -> str:
        return os.path.join(JOB_DIR, f"{self.job_id}.json")

    @property
    def _log_path(self) -> str:
        return os.path.join(JOB_DIR, f"{self.job_id}.logs")

    def save(self):
        data = {
            "job_id": self.job_id,
            "workshop_id": self.workshop_id,
            "status": self.status,
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
        temp_path = self._meta_path + ".tmp"
        with open(temp_path, "w") as f:
            json.dump(data, f)
        os.rename(temp_path, self._meta_path)

    @classmethod
    def load(cls, job_id: str) -> EvalJob | None:
        path = os.path.join(JOB_DIR, f"{job_id}.json")
        if not os.path.exists(path):
            return None
        try:
            with open(path) as f:
                data = json.load(f)
            job = cls(data["job_id"], data["workshop_id"])
            job.status = data["status"]
            job.total = data.get("total", 0)
            job.completed = data.get("completed", 0)
            job.failed = data.get("failed", 0)
            job.result = data.get("result")
            job.error = data.get("error")
            job.created_at = data.get("created_at", time.time())
            job.updated_at = data.get("updated_at", time.time())
            log_path = job._log_path
            if os.path.exists(log_path):
                with open(log_path) as f:
                    job.logs = [
                        json.loads(line) for line in f if line.strip()
                    ]
            return job
        except Exception as e:
            logger.error("Failed to load eval job %s: %s", job_id, e)
            return None

    def add_log(self, message: str):
        self.logs.append(message)
        self.updated_at = time.time()
        with open(self._log_path, "a") as f:
            f.write(json.dumps(message) + "\n")

    def set_status(self, status: str):
        self.status = status
        self.updated_at = time.time()
        self.save()
