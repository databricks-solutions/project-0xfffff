"""Discovery-phase business logic.

This module centralizes discovery-related operations (questions, summaries, findings,
phase transitions, completion tracking) so routers stay thin.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from server.models import DiscoveryFinding, DiscoveryFindingCreate, WorkshopPhase
from server.services.database_service import DatabaseService

logger = logging.getLogger(__name__)


class DiscoveryService:
    def __init__(self, db: Session):
        self.db = db
        self.db_service = DatabaseService(db)

    # ---------------------------------------------------------------------
    # Shared helpers
    # ---------------------------------------------------------------------
    @staticmethod
    def _trim(text: str, max_chars: int) -> str:
        if not text:
            return ""
        normalized = " ".join(str(text).split())
        if len(normalized) <= max_chars:
            return normalized
        return normalized[: max_chars - 1] + "…"

    @staticmethod
    def _parse_llm_json_message(message: Any) -> dict:
        """Parse model output expected to be JSON (dict or JSON string).

        Supports tool_calls[].function.arguments as an alternate structured path.
        """
        if not isinstance(message, dict):
            raise ValueError("Model did not return a JSON object")

        content = message.get("content")
        refusal = message.get("refusal")
        if (content is None or (isinstance(content, str) and not content.strip())) and refusal:
            raise ValueError(f"Model refused: {refusal}")

        # Some models may use tool calls for structured data
        tool_calls = message.get("tool_calls") or []
        if isinstance(tool_calls, list):
            for tc in tool_calls:
                if not isinstance(tc, dict):
                    continue
                fn = tc.get("function") or {}
                if not isinstance(fn, dict):
                    continue
                args = fn.get("arguments")
                if isinstance(args, str) and args.strip():
                    return json.loads(args)

        if isinstance(content, dict):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for p in content:
                if isinstance(p, str):
                    parts.append(p)
                elif isinstance(p, dict) and isinstance(p.get("text"), str):
                    parts.append(p["text"])
            content = "\n".join([p for p in parts if p.strip()])
        if not isinstance(content, str):
            raise ValueError("Model did not return a JSON object")

        text = content.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Fallback only: strip code fences and extract outer-most object.
            if "```" in text:
                parts = [p for p in text.split("```") if p.strip()]
                text = parts[-1].strip() if parts else text
            start = text.find("{")
            end = text.rfind("}")
            if start == -1 or end == -1 or end <= start:
                raise
            return json.loads(text[start : end + 1])

    def _get_workshop_or_404(self, workshop_id: str):
        workshop = self.db_service.get_workshop(workshop_id)
        if not workshop:
            raise HTTPException(status_code=404, detail="Workshop not found")
        return workshop

    # ---------------------------------------------------------------------
    # Discovery questions
    # ---------------------------------------------------------------------
    def get_discovery_questions(
        self,
        workshop_id: str,
        trace_id: str,
        user_id: Optional[str] = None,
        append: bool = False,
    ) -> List[Dict[str, Any]]:
        """Return per-user/per-trace discovery questions as a list of dicts."""
        workshop = self._get_workshop_or_404(workshop_id)

        trace = self.db_service.get_trace(trace_id)
        if not trace or trace.workshop_id != workshop_id:
            raise HTTPException(status_code=404, detail="Trace not found")

        fixed_question = {
            "id": "q_1",
            "prompt": "What makes this response effective or ineffective?",
            "placeholder": "Share your thoughts on what makes this response work well or poorly...",
        }

        # If we don't have a user_id, we can't do per-user persistence. Return a safe fallback.
        if not user_id:
            return [fixed_question]

        existing_questions_raw = self.db_service.get_discovery_questions(workshop_id, trace_id, user_id)
        existing_questions: list[dict] = [
            {
                "id": str(q.get("id")),
                "prompt": str(q.get("prompt") or "").strip(),
                "placeholder": (str(q.get("placeholder")).strip() if q.get("placeholder") is not None else None),
            }
            for q in existing_questions_raw
            if (q.get("id") and q.get("prompt"))
        ]
        # Ensure we never override the fixed baseline question id.
        existing_questions = [q for q in existing_questions if q.get("id") != fixed_question["id"]]

        model_name = (getattr(workshop, "discovery_questions_model_name", None) or "demo").strip()
        if not model_name or model_name == "demo":
            return [fixed_question, *existing_questions]

        # If we already have questions and caller didn't request append, just return them.
        if existing_questions and not append:
            return [fixed_question, *existing_questions]

        # Collect existing findings to steer the question towards novel insights / themes.
        user_prior_finding_text = ""
        other_findings_texts: list[str] = []
        try:
            user_findings = self.db_service.get_findings(workshop_id, user_id=user_id)
            user_finding = next((f for f in user_findings if f.trace_id == trace_id), None)
            if user_finding and user_finding.insight:
                user_prior_finding_text = user_finding.insight

            all_findings = self.db_service.get_findings(workshop_id)
            trace_findings = [f for f in all_findings if f.trace_id == trace_id and f.user_id != user_id]
            for f in trace_findings[:5]:
                if f.insight:
                    other_findings_texts.append(f.insight)
        except Exception as e:
            logger.warning(
                "Failed to load findings for question generation (workshop=%s trace=%s): %s", workshop_id, trace_id, e
            )

        # Need MLflow config (Databricks host) + token in order to call model serving.
        mlflow_config = self.db_service.get_mlflow_config(workshop_id)
        if not mlflow_config:
            logger.warning("Discovery question generation requested but MLflow config missing; falling back to fixed.")
            return [fixed_question, *existing_questions]

        from server.services.token_storage_service import token_storage

        databricks_token = token_storage.get_token(workshop_id) or self.db_service.get_databricks_token(workshop_id)
        if not databricks_token:
            logger.warning(
                "Discovery question generation requested but Databricks token missing; falling back to fixed."
            )
            return [fixed_question, *existing_questions]

        try:
            from server.services.discovery_dspy import build_databricks_lm, get_predictor, get_signatures, run_predict

            GenerateDiscoveryQuestion, _ = get_signatures()
            lm = build_databricks_lm(
                endpoint_name=model_name,
                workspace_url=mlflow_config.databricks_host,
                token=databricks_token,
                temperature=0.2,
            )
            predictor = get_predictor(GenerateDiscoveryQuestion, lm, temperature=0.2, max_tokens=300)

            trace_context_json = json.dumps(trace.context, ensure_ascii=False) if trace.context is not None else ""
            previous_prompts = [str(q.get("prompt") or "").strip() for q in existing_questions if q.get("prompt")]
            other_findings_trimmed = [
                self._trim(txt, 600) for txt in other_findings_texts if txt and self._trim(txt, 600)
            ]

            result = run_predict(
                predictor,
                lm,
                workshop_id=workshop_id,
                user_id=user_id,
                trace_id=trace_id,
                trace_input=self._trim(trace.input or "", 2000),
                trace_output=self._trim(trace.output or "", 2000),
                trace_context_json=self._trim(trace_context_json, 2000),
                user_prior_finding=self._trim(user_prior_finding_text, 1200),
                previous_questions=previous_prompts,
                other_users_findings=other_findings_trimmed,
            )

            # DSPy returns a Prediction-like object; grab the structured output.
            q_obj = getattr(result, "question", None)
            if q_obj is None:
                raise ValueError("DSPy output missing `question`")

            # Support either a pydantic model or a dict-like.
            q_prompt = getattr(q_obj, "prompt", None) if not isinstance(q_obj, dict) else q_obj.get("prompt")
            q_placeholder = (
                getattr(q_obj, "placeholder", None) if not isinstance(q_obj, dict) else q_obj.get("placeholder")
            )
            q_prompt = str(q_prompt or "").strip()
            if not q_prompt:
                raise ValueError("DSPy returned empty question prompt")

            generated = {"prompt": q_prompt, "placeholder": (str(q_placeholder).strip() if q_placeholder else None)}

            created = self.db_service.add_discovery_question(
                workshop_id=workshop_id,
                trace_id=trace_id,
                user_id=user_id,
                prompt=generated["prompt"],
                placeholder=generated["placeholder"],
            )
            existing_questions.append(
                {
                    "id": str(created["id"]),
                    "prompt": str(created["prompt"]),
                    "placeholder": (
                        str(created["placeholder"]).strip() if created.get("placeholder") is not None else None
                    ),
                }
            )
            return [fixed_question, *existing_questions]

        except Exception as e:
            # Safety fallback: return fixed + any existing questions.
            logger.exception("Failed to generate discovery questions via DSPy; falling back to fixed: %s", e)
            return [fixed_question, *existing_questions]

    def set_discovery_questions_model(self, workshop_id: str, model_name: str) -> str:
        self._get_workshop_or_404(workshop_id)
        updated = self.db_service.update_discovery_questions_model_name(workshop_id, model_name)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update discovery questions model")
        return updated.discovery_questions_model_name

    # ---------------------------------------------------------------------
    # Discovery summaries
    # ---------------------------------------------------------------------
    def generate_discovery_summaries(self, workshop_id: str, refresh: bool = False) -> Dict[str, Any]:
        workshop = self._get_workshop_or_404(workshop_id)

        if not refresh:
            cached = self.db_service.get_latest_discovery_summary(workshop_id)
            if cached and isinstance(cached.get("payload"), dict):
                return cached["payload"]

        model_name = (getattr(workshop, "discovery_questions_model_name", None) or "demo").strip()
        if not model_name or model_name == "demo":
            raise HTTPException(
                status_code=400,
                detail="No LLM configured for summaries. Set a discovery question model (non-demo) first.",
            )

        findings = self.db_service.get_findings_with_user_details(workshop_id)
        if not findings:
            return {"overall": {"themes": []}, "by_user": [], "by_trace": []}

        corpus_lines: List[str] = []
        for f in findings[:300]:
            corpus_lines.append(
                f"TRACE {f.get('trace_id')} | USER {f.get('user_name')} ({f.get('user_id')}): {self._trim(f.get('insight') or '', 800)}"
            )

        mlflow_config = self.db_service.get_mlflow_config(workshop_id)
        if not mlflow_config:
            raise HTTPException(status_code=400, detail="MLflow/Databricks configuration not found for workshop")

        from server.services.token_storage_service import token_storage

        databricks_token = token_storage.get_token(workshop_id) or self.db_service.get_databricks_token(workshop_id)
        if not databricks_token:
            raise HTTPException(status_code=400, detail="Databricks token not found for workshop")

        try:
            from server.services.discovery_dspy import build_databricks_lm, get_predictor, get_signatures, run_predict

            _, GenerateDiscoverySummaries = get_signatures()
            lm = build_databricks_lm(
                endpoint_name=model_name,
                workspace_url=mlflow_config.databricks_host,
                token=databricks_token,
                temperature=0.2,
            )
            predictor = get_predictor(GenerateDiscoverySummaries, lm, temperature=0.2)

            pred = run_predict(predictor, lm, findings=corpus_lines)
            payload_obj = getattr(pred, "payload", None)
            if payload_obj is None:
                raise ValueError("DSPy output missing `payload`")

            # Convert to plain dict for persistence / API return.
            if hasattr(payload_obj, "model_dump"):
                payload = payload_obj.model_dump()
            elif isinstance(payload_obj, dict):
                payload = payload_obj
            else:
                payload = {
                    "overall": getattr(payload_obj, "overall", {}),
                    "by_user": getattr(payload_obj, "by_user", []),
                    "by_trace": getattr(payload_obj, "by_trace", []),
                }

            try:
                self.db_service.save_discovery_summary(workshop_id=workshop_id, payload=payload, model_name=model_name)
            except Exception as persist_err:
                logger.warning("Failed to persist discovery summaries (workshop=%s): %s", workshop_id, persist_err)

            return payload
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Failed to generate discovery summaries via DSPy: %s", e)
            raise HTTPException(status_code=502, detail=f"Failed to generate summaries: {str(e)}") from e

    def get_discovery_summaries(self, workshop_id: str) -> Dict[str, Any]:
        self._get_workshop_or_404(workshop_id)
        cached = self.db_service.get_latest_discovery_summary(workshop_id)
        if not cached or not isinstance(cached.get("payload"), dict):
            raise HTTPException(status_code=404, detail="No discovery summaries found for this workshop")
        return cached["payload"]

    # ---------------------------------------------------------------------
    # Findings
    # ---------------------------------------------------------------------
    def submit_finding(self, workshop_id: str, finding: DiscoveryFindingCreate) -> DiscoveryFinding:
        self._get_workshop_or_404(workshop_id)
        return self.db_service.add_finding(workshop_id, finding)

    def get_findings(self, workshop_id: str, user_id: Optional[str] = None) -> List[DiscoveryFinding]:
        self._get_workshop_or_404(workshop_id)
        return self.db_service.get_findings(workshop_id, user_id)

    def get_findings_with_user_details(self, workshop_id: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        self._get_workshop_or_404(workshop_id)
        return self.db_service.get_findings_with_user_details(workshop_id, user_id)

    def clear_findings(self, workshop_id: str) -> None:
        self._get_workshop_or_404(workshop_id)
        self.db_service.clear_findings(workshop_id)

    # ---------------------------------------------------------------------
    # Phase transitions / discovery orchestration
    # ---------------------------------------------------------------------
    def begin_discovery_phase(self, workshop_id: str, trace_limit: Optional[int] = None) -> Dict[str, Any]:
        self._get_workshop_or_404(workshop_id)

        # Update workshop phase to discovery and mark discovery as started
        self.db_service.update_workshop_phase(workshop_id, WorkshopPhase.DISCOVERY)
        self.db_service.update_phase_started(workshop_id, discovery_started=True)

        traces = self.db_service.get_traces(workshop_id)
        total_traces = len(traces)
        if total_traces == 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot start discovery: No traces available. Please complete MLflow ingestion in the Intake phase first.",
            )

        if trace_limit and trace_limit > 0 and trace_limit < total_traces:
            selected_traces = traces[: min(trace_limit, total_traces)]
            trace_ids_to_use = [trace.id for trace in selected_traces]
            traces_used = len(selected_traces)
        else:
            trace_ids_to_use = [trace.id for trace in traces]
            traces_used = total_traces

        self.db_service.update_active_discovery_traces(workshop_id, trace_ids_to_use)

        return {
            "message": f"Discovery phase started with {traces_used} traces from {total_traces} total (each user will see traces in randomized order)",
            "phase": "discovery",
            "total_traces": total_traces,
            "traces_used": traces_used,
            "trace_limit": trace_limit,
        }

    def reset_discovery(self, workshop_id: str) -> Dict[str, Any]:
        self._get_workshop_or_404(workshop_id)
        updated_workshop = self.db_service.reset_workshop_to_discovery(workshop_id)
        if not updated_workshop:
            raise HTTPException(status_code=500, detail="Failed to reset workshop")
        traces = self.db_service.get_traces(workshop_id)
        return {
            "message": "Discovery reset. You can now select a different trace configuration.",
            "workshop_id": workshop_id,
            "current_phase": updated_workshop.current_phase,
            "discovery_started": updated_workshop.discovery_started,
            "traces_available": len(traces),
        }

    def advance_to_discovery(self, workshop_id: str) -> Dict[str, Any]:
        workshop = self._get_workshop_or_404(workshop_id)

        if workshop.current_phase != WorkshopPhase.INTAKE:
            raise HTTPException(
                status_code=400, detail=f"Cannot advance to discovery from {workshop.current_phase} phase"
            )

        traces = self.db_service.get_traces(workshop_id)
        if len(traces) == 0:
            raise HTTPException(status_code=400, detail="Cannot start discovery phase: No traces uploaded to workshop")

        self.db_service.update_workshop_phase(workshop_id, WorkshopPhase.DISCOVERY)

        return {
            "message": "Workshop advanced to discovery phase",
            "phase": "discovery",
            "workshop_id": workshop_id,
            "traces_available": len(traces),
        }

    def generate_discovery_test_data(self, workshop_id: str) -> Dict[str, Any]:
        import uuid

        workshop = self._get_workshop_or_404(workshop_id)

        try:
            from server.database import DiscoveryFindingDB, TraceDB

            traces = self.db.query(TraceDB).filter(TraceDB.workshop_id == workshop_id).all()
            if not traces:
                raise HTTPException(status_code=400, detail="No traces found in workshop")

            self.db.query(DiscoveryFindingDB).filter(DiscoveryFindingDB.workshop_id == workshop_id).delete()

            demo_users = [
                {"user_id": "expert_1", "name": "Expert 1"},
                {"user_id": "expert_2", "name": "Expert 2"},
                {"user_id": "expert_3", "name": "Expert 3"},
                {"user_id": "participant_1", "name": "Participant 1"},
                {"user_id": "participant_2", "name": "Participant 2"},
            ]

            findings_created = 0
            for user in demo_users:
                for trace in traces:
                    finding_text = (
                        "Quality Assessment: This response demonstrates "
                        f"{'good' if 'helpful' in (trace.output or '').lower() else 'poor'} customer service quality.\n\n"
                        "Improvement Analysis: "
                        f"{'The response is clear and helpful' if 'helpful' in (trace.output or '').lower() else 'The response could be more specific and actionable'}."
                    )

                    finding = DiscoveryFindingDB(
                        id=str(uuid.uuid4()),
                        workshop_id=workshop_id,
                        trace_id=trace.id,
                        user_id=user["user_id"],
                        insight=finding_text,
                        created_at=workshop.created_at,
                    )
                    self.db.add(finding)
                    findings_created += 1

            self.db.commit()

            return {
                "message": f"Generated {findings_created} realistic discovery findings",
                "findings_created": findings_created,
                "users": len(demo_users),
                "traces_analyzed": len(traces),
            }

        except HTTPException:
            self.db.rollback()
            raise
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to generate discovery data: {str(e)}") from e

    # ---------------------------------------------------------------------
    # User completion tracking
    # ---------------------------------------------------------------------
    def mark_user_discovery_complete(self, workshop_id: str, user_id: str) -> Dict[str, Any]:
        self._get_workshop_or_404(workshop_id)
        user = self.db_service.get_user(user_id)
        if not user or user.workshop_id != workshop_id:
            raise HTTPException(status_code=404, detail="User not found in workshop")
        self.db_service.mark_user_discovery_complete(workshop_id, user_id)
        return {
            "message": f"User {user_id} marked as discovery complete",
            "workshop_id": workshop_id,
            "user_id": user_id,
        }

    def get_discovery_completion_status(self, workshop_id: str) -> Dict[str, Any]:
        self._get_workshop_or_404(workshop_id)
        return self.db_service.get_discovery_completion_status(workshop_id)

    def is_user_discovery_complete(self, workshop_id: str, user_id: str) -> Dict[str, Any]:
        self._get_workshop_or_404(workshop_id)
        user = self.db_service.get_user(user_id)
        if not user or user.workshop_id != workshop_id:
            raise HTTPException(status_code=404, detail="User not found in workshop")
        is_complete = self.db_service.is_user_discovery_complete(workshop_id, user_id)
        return {
            "workshop_id": workshop_id,
            "user_id": user_id,
            "user_name": user.name,
            "user_email": user.email,
            "discovery_complete": is_complete,
        }
