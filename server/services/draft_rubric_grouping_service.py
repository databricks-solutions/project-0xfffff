"""Service for suggesting groupings of draft rubric items via LLM."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from server.models import DraftRubricItem
from server.services.database_service import DatabaseService

logger = logging.getLogger(__name__)


class DraftRubricGroupingService:
    def __init__(self, db: Session):
        self.db = db
        self.db_service = DatabaseService(db)

    def suggest_groups(
        self, workshop_id: str, items: list[DraftRubricItem]
    ) -> list[dict[str, Any]]:
        """LLM-suggested grouping of draft rubric items.

        Returns a list of group dicts (not persisted). The facilitator
        reviews and calls apply_groups() to persist.
        """
        if not items:
            return []

        # Try LLM-based grouping
        workshop = self.db_service.get_workshop(workshop_id)
        if not workshop:
            return self._fallback_grouping(items)

        model_name = (getattr(workshop, "discovery_questions_model_name", None) or "").strip()
        if not model_name or model_name == "demo":
            return self._fallback_grouping(items)

        mlflow_config = self.db_service.get_mlflow_config(workshop_id)
        if not mlflow_config:
            return self._fallback_grouping(items)

        from server.services.databricks_service import resolve_databricks_token

        try:
            databricks_token = resolve_databricks_token(mlflow_config.databricks_host if mlflow_config else None)
        except RuntimeError:
            databricks_token = None
        if not databricks_token:
            return self._fallback_grouping(items)

        try:
            from server.services.discovery_dspy import (
                build_databricks_lm,
                get_predictor,
                get_suggest_groups_signature,
                run_predict,
            )

            SuggestRubricGroups = get_suggest_groups_signature()
            lm = build_databricks_lm(
                endpoint_name=model_name,
                workspace_url=mlflow_config.databricks_host,
                token=databricks_token,
                temperature=0.2,
            )
            predictor = get_predictor(SuggestRubricGroups, lm, temperature=0.2, max_tokens=1000)

            # Format items as "ID | TEXT" lines
            items_text = "\n".join(f"{item.id} | {item.text}" for item in items)

            result = run_predict(predictor, lm, items=items_text)

            groups_out = getattr(result, "groups", None)
            if not groups_out or not isinstance(groups_out, list):
                return self._fallback_grouping(items)

            # Convert to plain dicts
            proposed = []
            for g in groups_out:
                if hasattr(g, "model_dump"):
                    proposed.append(g.model_dump())
                elif isinstance(g, dict):
                    proposed.append(g)
            return proposed

        except Exception as e:
            logger.warning("LLM grouping failed, using fallback: %s", e)
            return self._fallback_grouping(items)

    @staticmethod
    def _fallback_grouping(items: list[DraftRubricItem]) -> list[dict[str, Any]]:
        """Single-group fallback when LLM is unavailable."""
        if not items:
            return []
        return [
            {
                "name": "All Draft Items",
                "item_ids": [item.id for item in items],
                "rationale": "Grouped together because LLM grouping was unavailable.",
            }
        ]
