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
from server.utils.jsonpath_utils import apply_jsonpath

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

Distill specific, actionable evaluation criteria from the feedback. Each
criterion should describe one quality dimension that could be used to assess
future responses. Focus on:
- User preferences and expectations for quality
- Specific aspects users care about (tone, accuracy, efficiency, empathy, etc.)
- Patterns in what makes responses "good" vs "needs improvement"

For each criterion, cite the trace IDs that provide evidence and assign a
priority (high/medium/low) based on how frequently or strongly it appears
in the feedback.

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

        # Get workshop for JSONPath config
        workshop = self.db_service.get_workshop(workshop_id)
        input_jsonpath = workshop.input_jsonpath if workshop else None
        output_jsonpath = workshop.output_jsonpath if workshop else None

        # Get traces for input/output
        traces = self.db_service.get_traces(workshop_id)
        trace_map = {t.id: t for t in traces}

        aggregated: dict[str, Any] = {}
        for fb in feedback_rows:
            if fb.trace_id not in aggregated:
                trace = trace_map.get(fb.trace_id)
                if trace:
                    # Use JSONPath-extracted values if configured
                    trace_input = trace.input
                    trace_output = trace.output
                    extracted_input, ok = apply_jsonpath(trace.input, input_jsonpath)
                    if ok:
                        trace_input = extracted_input
                    extracted_output, ok = apply_jsonpath(trace.output, output_jsonpath)
                    if ok:
                        trace_output = extracted_output
                else:
                    trace_input = ""
                    trace_output = ""

                aggregated[fb.trace_id] = {
                    "input": trace_input,
                    "output": trace_output,
                    "feedback_entries": [],
                }

            aggregated[fb.trace_id]["feedback_entries"].append({
                "user": fb.user_id,
                "label": fb.feedback_label,
                "comment": fb.comment,
                "followup_qna": fb.followup_qna or [],
            })

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
        distillation = self.distill(template, aggregated, disagreements, model)

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

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _format_feedback_for_prompt(self, aggregated: dict[str, Any]) -> str:
        """Format aggregated feedback for the LLM prompt."""
        parts = []
        for trace_id, data in list(aggregated.items())[:20]:  # Cap at 20 traces
            parts.append(f"### Trace {trace_id[:8]}")
            parts.append(f"**Input:** {data['input'][:500]}")
            parts.append(f"**Output:** {data['output'][:500]}")
            for entry in data["feedback_entries"][:10]:
                label = entry["label"].upper()
                parts.append(f"- [{label}] {entry['comment']}")
                for qna in entry.get("followup_qna", [])[:3]:
                    parts.append(f"  Q: {qna.get('question', '')}")
                    parts.append(f"  A: {qna.get('answer', '')}")
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
                parts.append(f"**{label} PRIORITY** ({len(trace_ids)} traces): {', '.join(t[:8] for t in trace_ids)}")
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
