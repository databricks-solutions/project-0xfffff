"""Real-time finding classification service using LLM.

This service handles classification of discovery findings into predefined categories
and detection of disagreements between participants.
"""

from __future__ import annotations

import logging
from typing import List

from sqlalchemy.orm import Session

from server.models import ClassifiedFinding, Disagreement, ClassifiedFindingCreate
from server.services.database_service import DatabaseService
from server.services.discovery_dspy import build_databricks_lm, get_predictor, run_predict

logger = logging.getLogger(__name__)

FINDING_CATEGORIES = [
    "themes",
    "edge_cases",
    "boundary_conditions",
    "failure_modes",
    "missing_info",
]


class ClassificationService:
    """Real-time finding classification using LLM."""

    def __init__(self, db: Session):
        self.db = db
        self.db_service = DatabaseService(db)

    async def classify_finding(
        self,
        finding_text: str,
        trace_input: str,
        trace_output: str,
        workshop_id: str,
        model_name: str,
        databricks_host: str,
        databricks_token: str,
    ) -> str:
        """Classify finding into one of 5 categories.

        Args:
            finding_text: The finding text to classify
            trace_input: The trace input for context
            trace_output: The trace output for context
            workshop_id: Workshop ID for logging
            model_name: LLM endpoint name
            databricks_host: Databricks workspace URL
            databricks_token: Databricks API token

        Returns:
            Category string (one of FINDING_CATEGORIES) or empty string on error
        """
        if not finding_text or not model_name or not databricks_token:
            # Default to 'themes' if classification is unavailable
            logger.warning(
                "Classification skipped: missing inputs (finding_text=%s, model_name=%s, token_exists=%s)",
                bool(finding_text),
                bool(model_name),
                bool(databricks_token),
            )
            return "themes"

        try:
            from server.services.discovery_dspy import ClassifyFinding

            lm = build_databricks_lm(
                endpoint_name=model_name,
                workspace_url=databricks_host,
                token=databricks_token,
                temperature=0.1,  # Lower temp for consistent classification
            )

            predictor = get_predictor(ClassifyFinding, lm, temperature=0.1, max_tokens=50)

            result = run_predict(
                predictor,
                lm,
                finding_text=finding_text[:1000],  # Trim to avoid token limits
                trace_input=trace_input[:1000],
                trace_output=trace_output[:1000],
            )

            category = getattr(result, "category", None)
            if category and category in FINDING_CATEGORIES:
                return category

            # Fallback to themes if classification failed
            logger.warning(
                "Classification returned invalid category: %s (workshop=%s)", category, workshop_id
            )
            return "themes"

        except Exception as e:
            logger.exception(
                "Failed to classify finding via LLM (workshop=%s, model=%s): %s",
                workshop_id,
                model_name,
                e,
            )
            return "themes"

    async def detect_disagreements(
        self,
        trace_id: str,
        findings: List[ClassifiedFinding],
        workshop_id: str,
        model_name: str,
        databricks_host: str,
        databricks_token: str,
    ) -> List[Disagreement]:
        """Compare findings and detect conflicting viewpoints.

        Args:
            trace_id: The trace ID
            findings: List of classified findings for the trace
            workshop_id: Workshop ID
            model_name: LLM endpoint name
            databricks_host: Databricks workspace URL
            databricks_token: Databricks API token

        Returns:
            List of detected disagreements
        """
        if not findings or len(findings) < 2:
            return []

        if not model_name or not databricks_token:
            logger.warning("Disagreement detection skipped: missing LLM configuration")
            return []

        try:
            from server.services.discovery_dspy import DetectDisagreements

            lm = build_databricks_lm(
                endpoint_name=model_name,
                workspace_url=databricks_host,
                token=databricks_token,
                temperature=0.1,
            )

            predictor = get_predictor(DetectDisagreements, lm, temperature=0.1, max_tokens=500)

            # Format findings with user attribution
            findings_text = [
                f"User {f.user_id}: {f.text[:200]}" for f in findings[:10]
            ]

            result = run_predict(
                predictor,
                lm,
                findings=findings_text,
            )

            disagreements = getattr(result, "disagreements", None)
            if not disagreements or not isinstance(disagreements, list):
                return []

            # Convert to Disagreement models
            result_list = []
            for d in disagreements[:5]:  # Limit to 5 disagreements
                if hasattr(d, "summary"):
                    # Create Disagreement object from predictor output
                    disagreement = Disagreement(
                        id="auto_" + trace_id,
                        workshop_id=workshop_id,
                        trace_id=trace_id,
                        user_ids=[f.user_id for f in findings],
                        finding_ids=[f.id for f in findings],
                        summary=d.summary,
                    )
                    result_list.append(disagreement)

            return result_list

        except Exception as e:
            logger.exception(
                "Failed to detect disagreements via LLM (trace=%s, workshop=%s): %s",
                trace_id,
                workshop_id,
                e,
            )
            return []
