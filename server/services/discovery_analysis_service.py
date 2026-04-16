"""
Service for AI-powered discovery analysis: feedback aggregation,
disagreement detection, and LLM-based findings distillation.

Follows the RubricGenerationService pattern for LLM calls and JSON parsing.
"""

import json
import logging
import re
from typing import Any

from server.models import AnalysisTemplate, DistillationOutput
from server.services.database_service import DatabaseService
from server.services.databricks_service import DatabricksService
from server.utils.trace_display_utils import get_display_text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt shared by both templates
# ---------------------------------------------------------------------------
ANALYSIS_SYSTEM_PROMPT = """You are an expert evaluation analyst reviewing participant feedback on AI/LLM responses.

Your job is to analyze aggregated feedback, detect patterns, and produce structured JSON output.

CRITICAL: Return ONLY valid JSON matching the schema below. No markdown, no code blocks, no commentary outside the JSON.

Required JSON structure:
{
  "findings": [
    {
      "text": "Description of the finding (criterion or theme)",
      "evidence_trace_ids": ["trace-id-1", "trace-id-2"],
      "evidence_milestone_refs": ["trace-id-1:all", "trace-id-1:m2"],
      "priority": "high" | "medium" | "low"
    }
  ],
  "high_priority_disagreements": [
    {
      "trace_id": "trace-id",
      "summary": "What they disagreed about",
      "underlying_theme": "Quality dimension at play",
      "followup_questions": ["Question 1", "Question 2"],
      "facilitator_suggestions": ["Suggestion 1"]
    }
  ],
  "medium_priority_disagreements": [ ... same structure ... ],
  "lower_priority_disagreements": [ ... same structure ... ],
  "summary": "Brief overall summary of the analysis (1-3 sentences)"
}
"""

# ---------------------------------------------------------------------------
# Template-specific instructions (from spec lines 599-663)
# ---------------------------------------------------------------------------
EVALUATION_CRITERIA_PROMPT = """Analyze the participant feedback below to extract evaluation criteria and
analyze disagreements between reviewers.

## Findings: Evaluation Criteria

Distill specific, actionable process-aware evaluation criteria from the feedback.
Each finding should be reusable for offline evaluation and should focus on:
- Process criteria (order-of-operations expectations like "should do X before Y")
- Hurdle criteria (must-pass gates that invalidate otherwise good responses)
- Implicit weighting signals (what participants consistently treat as high-impact
  vs secondary trade-offs)

Use milestone summaries and milestone references when present to ground findings
in trajectory-level evidence, not just final response text.

For each finding:
- Cite evidence trace IDs
- Include evidence_milestone_refs when the finding is tied to specific milestones
- Assign priority (high/medium/low) based on frequency and impact on evaluator decisions
- Adapt criteria to the workshop use-case context (domain, goals, constraints)

## Disagreement Analysis

For each detected disagreement, analyze:
- HIGH PRIORITY (rating disagreements — one GOOD, one BAD): What quality
  dimension is unclear? What follow-up questions would resolve it? What
  concrete calibration actions should the facilitator take?
- MEDIUM PRIORITY (both BAD, different issues): What different problems
  were identified? Are they independent or related? Which should be fixed
  first?
- LOWER PRIORITY (both GOOD, different strengths): What different aspects
  were valued? Do these reflect different user types or priorities?"""

THEMES_PATTERNS_PROMPT = """Analyze the participant feedback below to identify recurring themes and
patterns, and analyze disagreements between reviewers.

## Findings: Themes & Patterns

Identify emergent themes, recurring patterns, notable tendencies, risks,
and strengths across the feedback. Unlike formal criteria, themes can be
broader observations about how users interact with and evaluate the
responses. Look for:
- Recurring concerns or praise across multiple traces
- Patterns in what users notice first or care most about
- Tendencies in how different user types evaluate responses
- Risks or failure modes that appeared across traces
- Strengths worth preserving

For each theme, cite the trace IDs that provide evidence and assign a
priority (high/medium/low) based on prevalence and impact.
Ground findings in the provided workshop use-case context.

## Disagreement Analysis

For each detected disagreement, analyze:
- HIGH PRIORITY (rating disagreements — one GOOD, one BAD): What
  underlying theme explains the split? What perspectives are in tension?
- MEDIUM PRIORITY (both BAD, different issues): What different themes
  do the issues fall under? Are they facets of the same problem?
- LOWER PRIORITY (both GOOD, different strengths): What different
  themes do the valued aspects represent?"""

_TEMPLATE_PROMPTS = {
    AnalysisTemplate.EVALUATION_CRITERIA: EVALUATION_CRITERIA_PROMPT,
    AnalysisTemplate.THEMES_PATTERNS: THEMES_PATTERNS_PROMPT,
}


class DiscoveryAnalysisService:
    """Aggregates feedback, detects disagreements, and runs LLM distillation."""

    def __init__(self, db_service: DatabaseService, databricks_service: DatabricksService):
        self.db_service = db_service
        self.databricks_service = databricks_service

    # ------------------------------------------------------------------
    # Aggregate
    # ------------------------------------------------------------------
    def aggregate_feedback(self, workshop_id: str) -> dict[str, Any]:
        """Group all discovery feedback by trace_id with trace input/output.

        Returns:
            {
              trace_id: {
                "input": str,
                "output": str,
                "feedback_entries": [
                  {"user": str, "label": str, "comment": str, "followup_qna": [...]}
                ]
              }
            }
        """
        feedback_rows = self.db_service.get_discovery_feedback(workshop_id)
        if not feedback_rows:
            return {}

        # Get workshop for display pipeline
        workshop = self.db_service.get_workshop(workshop_id)

        # Get traces for input/output
        traces = self.db_service.get_traces(workshop_id)
        trace_map = {t.id: t for t in traces}

        aggregated: dict[str, Any] = {}
        for fb in feedback_rows:
            if fb.trace_id not in aggregated:
                trace = trace_map.get(fb.trace_id)
                if trace:
                    trace_input, trace_output = get_display_text(trace, workshop)
                else:
                    trace_input = ""
                    trace_output = ""

                aggregated[fb.trace_id] = {
                    "input": trace_input,
                    "output": trace_output,
                    "summary_context": self._format_trace_summary_context(getattr(trace, "summary", None)),
                    "feedback_entries": [],
                }

            aggregated[fb.trace_id]["feedback_entries"].append({
                "user": fb.user_id,
                "label": fb.feedback_label,
                "comment": fb.comment,
                "followup_qna": fb.followup_qna or [],
            })

        for trace_id, data in aggregated.items():
            data["referenced_milestones"] = self._extract_milestone_references_from_feedback(data["feedback_entries"], trace_id)

        return aggregated

    # ------------------------------------------------------------------
    # Disagreement Detection (deterministic, no LLM)
    # ------------------------------------------------------------------
    def detect_disagreements(self, aggregated: dict[str, Any]) -> dict[str, list[str]]:
        """Detect 3-tier disagreements from aggregated feedback.

        For each trace with multiple reviewers:
        - Labels differ (GOOD vs BAD) → HIGH
        - All BAD → MEDIUM
        - All GOOD → LOWER
        Single-reviewer traces are skipped.

        Returns:
            {"high": [trace_ids], "medium": [trace_ids], "lower": [trace_ids]}
        """
        result: dict[str, list[str]] = {"high": [], "medium": [], "lower": []}

        for trace_id, data in aggregated.items():
            entries = data["feedback_entries"]
            if len(entries) < 2:
                continue

            labels = {e["label"].lower() for e in entries}

            if "good" in labels and "bad" in labels:
                result["high"].append(trace_id)
            elif labels == {"bad"}:
                result["medium"].append(trace_id)
            elif labels == {"good"}:
                result["lower"].append(trace_id)

        return result

    # ------------------------------------------------------------------
    # LLM Distillation
    # ------------------------------------------------------------------
    def distill(
        self,
        template: str,
        aggregated: dict[str, Any],
        disagreements: dict[str, list[str]],
        model: str,
        use_case_description: str | None = None,
    ) -> DistillationOutput:
        """Call LLM to distill findings and analyze disagreements.

        Args:
            template: Analysis template key (evaluation_criteria | themes_patterns)
            aggregated: Feedback grouped by trace
            disagreements: Detected disagreement tiers
            model: Model endpoint name

        Returns:
            DistillationOutput with findings and disagreement analysis
        """
        instruction = _TEMPLATE_PROMPTS.get(template, EVALUATION_CRITERIA_PROMPT)

        # Build the user message
        feedback_text = self._format_feedback_for_prompt(aggregated)
        disagreement_text = self._format_disagreements_for_prompt(disagreements, aggregated)

        user_message = f"""{instruction}

## Workshop Use Case Description

{(use_case_description or "").strip() or "(not provided)"}

## Feedback Data

{feedback_text}

## Detected Disagreements

{disagreement_text}"""

        # Call LLM
        try:
            response = self.databricks_service.call_chat_completion(
                endpoint_name=model,
                messages=[
                    {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.3,
                max_tokens=4000,
            )
        except Exception as e:
            logger.error(f"Failed to call LLM for discovery analysis: {e}")
            raise Exception(f"LLM call failed: {e!s}") from e

        # Parse response
        return self._parse_distillation_response(response)

    # ------------------------------------------------------------------
    # Full Pipeline
    # ------------------------------------------------------------------
    def run_analysis(
        self,
        workshop_id: str,
        template: str,
        model: str,
    ) -> dict[str, Any]:
        """Full workflow: aggregate → count participants → detect → distill → store.

        Returns:
            The created analysis record as a dict
        """
        logger.info(f"Running discovery analysis for workshop {workshop_id}, template={template}")

        # 1. Aggregate
        aggregated = self.aggregate_feedback(workshop_id)
        if not aggregated:
            raise ValueError("No discovery feedback available for analysis")

        # 2. Count unique participants
        all_users = set()
        for data in aggregated.values():
            for entry in data["feedback_entries"]:
                all_users.add(entry["user"])
        participant_count = len(all_users)

        # 3. Detect disagreements
        disagreements = self.detect_disagreements(aggregated)

        # 4. Distill via LLM
        workshop = self.db_service.get_workshop(workshop_id)
        use_case_description = getattr(workshop, "description", None) if workshop else None
        distillation = self.distill(template, aggregated, disagreements, model, use_case_description)
        self._backfill_milestone_refs(distillation, aggregated)

        # 5. Serialize findings & disagreements for storage
        findings_data = [f.model_dump() for f in distillation.findings]
        disagreements_data = {
            "high": [d.model_dump() for d in distillation.high_priority_disagreements],
            "medium": [d.model_dump() for d in distillation.medium_priority_disagreements],
            "lower": [d.model_dump() for d in distillation.lower_priority_disagreements],
        }

        # 6. Store
        record = self.db_service.save_discovery_analysis(
            workshop_id=workshop_id,
            template_used=template,
            analysis_data=distillation.summary,
            findings=findings_data,
            disagreements=disagreements_data,
            participant_count=participant_count,
            model_used=model,
        )

        logger.info(f"Analysis saved: {record.id} ({len(findings_data)} findings)")

        return {
            "id": record.id,
            "workshop_id": record.workshop_id,
            "template_used": record.template_used,
            "analysis_data": record.analysis_data,
            "findings": record.findings,
            "disagreements": record.disagreements,
            "participant_count": record.participant_count,
            "model_used": record.model_used,
            "created_at": record.created_at.isoformat() if record.created_at else None,
            "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        }

    def _backfill_milestone_refs(
        self, distillation: DistillationOutput, aggregated: dict[str, Any]
    ) -> None:
        """Ensure findings preserve explicit milestone references when available."""
        trace_to_refs: dict[str, list[str]] = {}
        for trace_id, data in aggregated.items():
            refs = data.get("referenced_milestones") or []
            if isinstance(refs, list):
                trace_to_refs[trace_id] = [str(ref) for ref in refs if str(ref).strip()]

        if not trace_to_refs:
            return

        for finding in distillation.findings:
            if finding.evidence_milestone_refs:
                continue
            collected: list[str] = []
            for trace_id in finding.evidence_trace_ids:
                for ref in trace_to_refs.get(trace_id, []):
                    if ref not in collected:
                        collected.append(ref)
            if collected:
                finding.evidence_milestone_refs = collected[:6]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _format_trace_summary_context(self, summary: Any) -> str:
        """Format trace milestone summary for analysis prompts."""
        if not isinstance(summary, dict):
            return ""

        lines: list[str] = []
        executive = str(summary.get("executive_summary") or "").strip()
        if executive:
            lines.append(f"Executive summary: {executive}")

        milestones = summary.get("milestones")
        if isinstance(milestones, list) and milestones:
            lines.append("Milestones:")
            for milestone in milestones[:10]:
                if not isinstance(milestone, dict):
                    continue
                number = milestone.get("number")
                title = str(milestone.get("title") or "").strip()
                description = str(milestone.get("description") or "").strip()
                milestone_id = f"m{number}" if number is not None else "m?"
                detail = title or description
                if detail:
                    lines.append(f"- {milestone_id}: {detail}")

        return "\n".join(lines)

    def _normalize_milestone_ref(self, trace_id: str, raw_ref: Any) -> str | None:
        """Normalize milestone references into `trace_id:ref` format."""
        if not isinstance(raw_ref, str):
            return None
        token = raw_ref.strip().lower()
        if not token:
            return None
        if ":" in token:
            token = token.split(":")[-1].strip()
        if token in {"all", "whole", "full"}:
            return f"{trace_id}:all"
        if token.startswith("m"):
            return f"{trace_id}:{token}"
        if token.isdigit():
            return f"{trace_id}:m{token}"
        return f"{trace_id}:{token}"

    def _extract_milestone_references_from_feedback(
        self, feedback_entries: list[dict[str, Any]], trace_id: str
    ) -> list[str]:
        """Collect unique milestone references from follow-up Q&A payloads."""
        refs: list[str] = []
        seen: set[str] = set()

        for entry in feedback_entries:
            for qna in entry.get("followup_qna", []) or []:
                if not isinstance(qna, dict):
                    continue
                for raw_ref in qna.get("milestone_references", []) or []:
                    normalized = self._normalize_milestone_ref(trace_id, raw_ref)
                    if normalized and normalized not in seen:
                        seen.add(normalized)
                        refs.append(normalized)
        return refs

    def _format_feedback_for_prompt(self, aggregated: dict[str, Any]) -> str:
        """Format aggregated feedback for the LLM prompt."""
        parts = []
        for trace_id, data in list(aggregated.items())[:20]:  # Cap at 20 traces
            parts.append(f"### Trace {trace_id}")
            parts.append(f"**Input:** {data['input'][:500]}")
            parts.append(f"**Output:** {data['output'][:500]}")
            if data.get("summary_context"):
                parts.append("**Milestone Summary Context:**")
                parts.append(data["summary_context"][:1500])
            if data.get("referenced_milestones"):
                parts.append(
                    f"**Referenced milestones:** {', '.join(data['referenced_milestones'])}"
                )
            for entry in data["feedback_entries"][:10]:
                label = entry["label"].upper()
                parts.append(f"- [{label}] {entry['comment']}")
                for qna in entry.get("followup_qna", [])[:3]:
                    parts.append(f"  Q: {qna.get('question', '')}")
                    parts.append(f"  A: {qna.get('answer', '')}")
                    milestone_refs = qna.get("milestone_references", []) if isinstance(qna, dict) else []
                    if milestone_refs:
                        parts.append(f"  Milestone refs: {', '.join([str(ref) for ref in milestone_refs])}")
            parts.append("")
        return "\n".join(parts)

    def _format_disagreements_for_prompt(
        self, disagreements: dict[str, list[str]], aggregated: dict[str, Any]
    ) -> str:
        """Format detected disagreements for the LLM prompt."""
        parts = []
        for tier, label in [("high", "HIGH"), ("medium", "MEDIUM"), ("lower", "LOWER")]:
            trace_ids = disagreements.get(tier, [])
            if trace_ids:
                parts.append(f"**{label} PRIORITY** ({len(trace_ids)} traces): {', '.join(trace_ids)}")
            else:
                parts.append(f"**{label} PRIORITY**: None detected")
        return "\n".join(parts)

    def _parse_distillation_response(self, response: dict[str, Any]) -> DistillationOutput:
        """Parse LLM response into DistillationOutput."""
        content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not content:
            logger.error("Empty response from LLM")
            raise Exception("Empty response from AI model")

        # Try direct JSON parse
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            # Fallback: extract JSON from markdown code blocks
            data = self._extract_json_from_markdown(content)

        if not isinstance(data, dict):
            raise Exception("AI response is not a JSON object")

        return DistillationOutput(**data)

    def _extract_json_from_markdown(self, content: str) -> dict[str, Any]:
        """Extract JSON object from markdown code blocks."""
        pattern1 = r"```json\s*([\s\S]*?)\s*```"
        match = re.search(pattern1, content)
        if not match:
            pattern2 = r"```\s*([\s\S]*?)\s*```"
            match = re.search(pattern2, content)
        if match:
            return json.loads(match.group(1).strip())
        raise Exception("Could not extract JSON from response")
