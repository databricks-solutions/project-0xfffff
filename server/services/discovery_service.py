"""Discovery-phase business logic.

This module centralizes discovery-related operations (questions, summaries, findings,
phase transitions, completion tracking) so routers stay thin.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from server.models import (
    DiscoveryFeedback,
    DiscoveryFeedbackCreate,
    DiscoveryFinding,
    DiscoveryFindingCreate,
    WorkshopPhase,
)
from server.services.database_service import DatabaseService
from server.services.discovery_dspy import QUESTION_CATEGORIES

logger = logging.getLogger(__name__)

# Maximum number of generated questions per (user, trace) before stopping
MAX_GENERATED_QUESTIONS_PER_TRACE = 6


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
    def _compute_coverage(self, existing_questions_raw: list[dict[str, Any]]) -> dict[str, Any]:
        """Compute coverage state from existing questions.

        The baseline question (q_1) is treated as covering 'themes'.
        """
        # Categories covered by generated questions
        covered = set()
        # Baseline q_1 covers 'themes'
        covered.add("themes")

        for q in existing_questions_raw:
            cat = q.get("category")
            if cat and cat in QUESTION_CATEGORIES:
                covered.add(cat)

        missing = [c for c in QUESTION_CATEGORIES if c not in covered]
        return {
            "covered": sorted(covered),
            "missing": missing,
        }

    def _detect_disagreement(self, user_finding: str, other_findings: list[str]) -> bool:
        """Heuristic to detect if there's a potential disagreement.

        Simple heuristic: if user finding and any other finding have
        contradictory sentiment indicators or mention opposing viewpoints.
        For now, we use a simple check: if both exist, assume potential disagreement.
        A more sophisticated implementation could use embeddings or an LLM classifier.
        """
        if not user_finding or not other_findings:
            return False
        # Simple heuristic: if user has a finding and others have different findings, flag as potential disagreement
        # This encourages the model to ask a disagreement-probing question
        return len(other_findings) > 0

    def get_discovery_questions(
        self,
        workshop_id: str,
        trace_id: str,
        user_id: str | None = None,
        append: bool = False,
    ) -> dict[str, Any]:
        """Return per-user/per-trace discovery questions with coverage metadata.

        Returns:
            {
                "questions": [...],
                "can_generate_more": bool,
                "stop_reason": str | None,
                "coverage": {"covered": [...], "missing": [...]}
            }
        """
        workshop = self._get_workshop_or_404(workshop_id)

        trace = self.db_service.get_trace(trace_id)
        if not trace or trace.workshop_id != workshop_id:
            raise HTTPException(status_code=404, detail="Trace not found")

        fixed_question = {
            "id": "q_1",
            "prompt": "What makes this response effective or ineffective?",
            "placeholder": "Share your thoughts on what makes this response work well or poorly...",
            "category": "themes",
        }

        # If we don't have a user_id, we can't do per-user persistence. Return a safe fallback.
        if not user_id:
            return {
                "questions": [fixed_question],
                "can_generate_more": False,
                "stop_reason": "User ID required for question generation",
                "coverage": {"covered": ["themes"], "missing": [c for c in QUESTION_CATEGORIES if c != "themes"]},
            }

        existing_questions_raw = self.db_service.get_discovery_questions(workshop_id, trace_id, user_id)
        existing_questions: list[dict] = [
            {
                "id": str(q.get("id")),
                "prompt": str(q.get("prompt") or "").strip(),
                "placeholder": (str(q.get("placeholder")).strip() if q.get("placeholder") is not None else None),
                "category": q.get("category"),
            }
            for q in existing_questions_raw
            if (q.get("id") and q.get("prompt"))
        ]
        # Ensure we never override the fixed baseline question id.
        existing_questions = [q for q in existing_questions if q.get("id") != fixed_question["id"]]

        # Compute coverage
        coverage = self._compute_coverage(existing_questions_raw)
        generated_count = len(existing_questions)

        # Check stopping conditions
        all_covered = len(coverage["missing"]) == 0
        cap_reached = generated_count >= MAX_GENERATED_QUESTIONS_PER_TRACE

        if all_covered:
            return {
                "questions": [fixed_question, *existing_questions],
                "can_generate_more": False,
                "stop_reason": "All categories covered",
                "coverage": coverage,
            }

        if cap_reached:
            return {
                "questions": [fixed_question, *existing_questions],
                "can_generate_more": False,
                "stop_reason": f"Maximum questions reached ({MAX_GENERATED_QUESTIONS_PER_TRACE})",
                "coverage": coverage,
            }

        model_name = (getattr(workshop, "discovery_questions_model_name", None) or "demo").strip()
        if not model_name or model_name == "demo":
            logger.info(
                "Discovery questions: model is %r for workshop %s — returning fixed questions only.",
                model_name, workshop_id,
            )
            return {
                "questions": [fixed_question, *existing_questions],
                "can_generate_more": True,
                "stop_reason": None,
                "coverage": coverage,
            }

        # If we already have questions and caller didn't request append, just return them.
        if existing_questions and not append:
            return {
                "questions": [fixed_question, *existing_questions],
                "can_generate_more": True,
                "stop_reason": None,
                "coverage": coverage,
            }

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

        # Detect if there's a potential disagreement
        has_disagreement = self._detect_disagreement(user_prior_finding_text, other_findings_texts)

        # Need MLflow config (Databricks host) + token in order to call model serving.
        mlflow_config = self.db_service.get_mlflow_config(workshop_id)
        if not mlflow_config:
            logger.warning("Discovery question generation requested but MLflow config missing; falling back to fixed.")
            return {
                "questions": [fixed_question, *existing_questions],
                "can_generate_more": True,
                "stop_reason": None,
                "coverage": coverage,
            }

        from server.services.token_storage_service import token_storage

        databricks_token = token_storage.get_token(workshop_id) or self.db_service.get_databricks_token(workshop_id)
        if not databricks_token:
            logger.warning(
                "Discovery question generation requested but Databricks token missing; falling back to fixed."
            )
            return {
                "questions": [fixed_question, *existing_questions],
                "can_generate_more": True,
                "stop_reason": None,
                "coverage": coverage,
            }

        try:
            from server.services.discovery_dspy import (
                build_databricks_lm,
                get_predictor,
                get_question_signature,
                run_predict,
            )

            GenerateDiscoveryQuestion = get_question_signature()
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
                covered_categories=coverage["covered"],
                missing_categories=coverage["missing"],
                has_disagreement=has_disagreement,
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
            q_category = getattr(q_obj, "category", None) if not isinstance(q_obj, dict) else q_obj.get("category")

            q_prompt = str(q_prompt or "").strip()
            if not q_prompt:
                raise ValueError("DSPy returned empty question prompt")

            # Validate category
            if q_category and q_category not in QUESTION_CATEGORIES:
                q_category = coverage["missing"][0] if coverage["missing"] else None

            generated = {
                "prompt": q_prompt,
                "placeholder": (str(q_placeholder).strip() if q_placeholder else None),
                "category": q_category,
            }

            created = self.db_service.add_discovery_question(
                workshop_id=workshop_id,
                trace_id=trace_id,
                user_id=user_id,
                prompt=generated["prompt"],
                placeholder=generated["placeholder"],
                category=generated["category"],
            )
            existing_questions.append(
                {
                    "id": str(created["id"]),
                    "prompt": str(created["prompt"]),
                    "placeholder": (
                        str(created["placeholder"]).strip() if created.get("placeholder") is not None else None
                    ),
                    "category": created.get("category"),
                }
            )

            # Recompute coverage after adding new question
            updated_coverage = self._compute_coverage(existing_questions_raw + [{"category": generated["category"]}])
            new_generated_count = len(existing_questions)
            can_generate = (
                len(updated_coverage["missing"]) > 0 and new_generated_count < MAX_GENERATED_QUESTIONS_PER_TRACE
            )

            return {
                "questions": [fixed_question, *existing_questions],
                "can_generate_more": can_generate,
                "stop_reason": None
                if can_generate
                else (
                    "All categories covered"
                    if len(updated_coverage["missing"]) == 0
                    else f"Maximum questions reached ({MAX_GENERATED_QUESTIONS_PER_TRACE})"
                ),
                "coverage": updated_coverage,
            }

        except Exception as e:
            # Safety fallback: return fixed + any existing questions.
            logger.exception("Failed to generate discovery questions via DSPy; falling back to fixed: %s", e)
            return {
                "questions": [fixed_question, *existing_questions],
                "can_generate_more": True,
                "stop_reason": None,
                "coverage": coverage,
            }

    def set_discovery_questions_model(self, workshop_id: str, model_name: str) -> str:
        self._get_workshop_or_404(workshop_id)
        updated = self.db_service.update_discovery_questions_model_name(workshop_id, model_name)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update discovery questions model")
        return updated.discovery_questions_model_name

    # ---------------------------------------------------------------------
    # Discovery summaries (iterative pipeline)
    # ---------------------------------------------------------------------
    def _chunk_list(self, items: list, chunk_size: int) -> list:
        """Split a list into chunks of specified size."""
        return [items[i : i + chunk_size] for i in range(0, len(items), chunk_size)]

    def _group_findings_by_trace(self, findings: list) -> dict:
        """Group findings by trace_id."""
        by_trace: dict = {}
        for f in findings:
            tid = f.get("trace_id", "unknown")
            if tid not in by_trace:
                by_trace[tid] = []
            by_trace[tid].append(f)
        return by_trace

    def _group_findings_by_user(self, findings: list) -> dict:
        """Group findings by user_id."""
        by_user: dict = {}
        for f in findings:
            uid = f.get("user_id", "unknown")
            if uid not in by_user:
                by_user[uid] = []
            by_user[uid].append(f)
        return by_user

    def _compute_convergence_metrics(self, findings: list, themes: list) -> dict:
        """Compute cross-participant agreement metrics.

        For each theme, compute what fraction of users mention it.
        Overall alignment score = average theme_agreement across themes.
        """
        by_user = self._group_findings_by_user(findings)
        if not by_user or not themes:
            return {"theme_agreement": {}, "overall_alignment_score": 0.0}

        theme_agreement: dict = {}
        user_count = len(by_user)

        for theme in themes[:20]:  # Limit to first 20 themes
            theme_lower = theme.lower()
            users_mentioning = 0
            for _uid, user_findings in by_user.items():
                # Check if any of the user's findings mention this theme
                for f in user_findings:
                    insight = (f.get("insight") or "").lower()
                    if theme_lower in insight or any(word in insight for word in theme_lower.split()[:3]):
                        users_mentioning += 1
                        break
            theme_agreement[theme] = users_mentioning / user_count if user_count > 0 else 0.0

        # Overall alignment = average agreement across themes
        if theme_agreement:
            overall = sum(theme_agreement.values()) / len(theme_agreement)
        else:
            overall = 0.0

        return {"theme_agreement": theme_agreement, "overall_alignment_score": round(overall, 3)}

    def _determine_ready_for_rubric(
        self,
        candidate_rubric_questions: list,
        convergence: dict,
        key_disagreements: list,
    ) -> bool:
        """Determine if discovery is ready to proceed to rubric phase.

        Criteria:
        - At least 3 candidate rubric questions
        - Overall alignment score >= 0.3 (some agreement)
        - Major disagreements have been surfaced (even if unresolved)
        """
        min_rubric_questions = 3
        min_alignment = 0.3

        has_enough_questions = len(candidate_rubric_questions) >= min_rubric_questions
        has_alignment = convergence.get("overall_alignment_score", 0) >= min_alignment
        has_surfaced_disagreements = len(key_disagreements) >= 0  # Any surfacing counts

        return has_enough_questions and has_alignment and has_surfaced_disagreements

    def generate_discovery_summaries(self, workshop_id: str, refresh: bool = False) -> dict[str, Any]:
        """Generate discovery summaries using iterative pipeline.

        Steps:
        A. Iteratively refine overall summary from finding chunks
        B. Extract candidate rubric questions
        C. Identify key disagreements
        D. Generate discussion prompts
        E. Compute convergence metrics
        F. Determine ready-for-rubric signal
        G. Aggregate by trace and by user
        """
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
            return {
                "overall": {
                    "themes": [],
                    "patterns": [],
                    "tendencies": [],
                    "risks_or_failure_modes": [],
                    "strengths": [],
                },
                "by_user": [],
                "by_trace": [],
                "candidate_rubric_questions": [],
                "key_disagreements": [],
                "discussion_prompts": [],
                "convergence": {"theme_agreement": {}, "overall_alignment_score": 0.0},
                "ready_for_rubric": False,
            }

        # Format corpus lines
        corpus_lines: list = []
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
            from server.services.discovery_dspy import (
                DiscoveryOverallSummary,
                KeyDisagreement,
                build_databricks_lm,
                get_predictor,
                get_signatures,
                run_predict,
            )

            sigs = get_signatures()
            lm = build_databricks_lm(
                endpoint_name=model_name,
                workspace_url=mlflow_config.databricks_host,
                token=databricks_token,
                temperature=0.2,
            )

            # Step A: Iteratively refine overall summary
            overall_state = DiscoveryOverallSummary()
            chunks = self._chunk_list(corpus_lines, 50)

            RefineOverallSummary = sigs["RefineOverallSummary"]
            refine_predictor = get_predictor(RefineOverallSummary, lm, temperature=0.2)

            for chunk in chunks[:6]:  # Limit to 6 chunks (300 findings max)
                try:
                    result = run_predict(
                        refine_predictor,
                        lm,
                        current_state=overall_state,
                        findings_chunk=chunk,
                    )
                    updated = getattr(result, "updated_state", None)
                    if updated:
                        if hasattr(updated, "model_dump"):
                            overall_state = DiscoveryOverallSummary(**updated.model_dump())
                        elif isinstance(updated, dict):
                            overall_state = DiscoveryOverallSummary(**updated)
                except Exception as e:
                    logger.warning("Refinement step failed, continuing: %s", e)

            # Step B: Extract candidate rubric questions
            candidate_rubric_questions: list = []
            try:
                ExtractRubricCandidates = sigs["ExtractRubricCandidates"]
                extract_predictor = get_predictor(ExtractRubricCandidates, lm, temperature=0.2)
                result = run_predict(extract_predictor, lm, overall_summary=overall_state)
                candidates = getattr(result, "candidates", None)
                if candidates and isinstance(candidates, list):
                    candidate_rubric_questions = [str(c) for c in candidates if c][:10]
            except Exception as e:
                logger.warning("Rubric candidate extraction failed: %s", e)

            # Step C: Identify key disagreements
            key_disagreements: list = []
            try:
                IdentifyDisagreements = sigs["IdentifyDisagreements"]
                disagree_predictor = get_predictor(IdentifyDisagreements, lm, temperature=0.2)
                result = run_predict(disagree_predictor, lm, findings=corpus_lines)
                disagreements = getattr(result, "disagreements", None)
                if disagreements and isinstance(disagreements, list):
                    for d in disagreements[:10]:
                        if hasattr(d, "model_dump"):
                            key_disagreements.append(d.model_dump())
                        elif isinstance(d, dict):
                            key_disagreements.append(d)
            except Exception as e:
                logger.warning("Disagreement identification failed: %s", e)

            # Step D: Generate discussion prompts
            discussion_prompts: list = []
            try:
                GenerateDiscussionPrompts = sigs["GenerateDiscussionPrompts"]
                prompts_predictor = get_predictor(GenerateDiscussionPrompts, lm, temperature=0.2)
                # Pass key disagreements as list of KeyDisagreement objects
                disagreement_objs = [KeyDisagreement(**d) for d in key_disagreements]
                result = run_predict(
                    prompts_predictor,
                    lm,
                    themes=overall_state.themes[:10],
                    disagreements=disagreement_objs,
                )
                prompts = getattr(result, "prompts", None)
                if prompts and isinstance(prompts, list):
                    for p in prompts[:10]:
                        if hasattr(p, "model_dump"):
                            discussion_prompts.append(p.model_dump())
                        elif isinstance(p, dict):
                            discussion_prompts.append(p)
            except Exception as e:
                logger.warning("Discussion prompt generation failed: %s", e)

            # Step E: Compute convergence metrics (non-LLM)
            convergence = self._compute_convergence_metrics(findings, overall_state.themes)

            # Step F: Determine ready-for-rubric signal
            ready_for_rubric = self._determine_ready_for_rubric(
                candidate_rubric_questions, convergence, key_disagreements
            )

            # Step G: Aggregate by trace and by user
            by_trace: list = []
            by_user: list = []

            try:
                # Group findings for batch summarization
                trace_groups = self._group_findings_by_trace(findings)
                trace_blocks = []
                for tid, tfindings in list(trace_groups.items())[:20]:
                    block_lines = [f"TRACE {tid}:"]
                    for f in tfindings[:10]:
                        block_lines.append(f"  - {f.get('user_name')}: {self._trim(f.get('insight') or '', 200)}")
                    trace_blocks.append("\n".join(block_lines))

                if trace_blocks:
                    SummarizeTraces = sigs["SummarizeTraces"]
                    trace_predictor = get_predictor(SummarizeTraces, lm, temperature=0.2)
                    result = run_predict(trace_predictor, lm, trace_findings_blocks=trace_blocks)
                    summaries = getattr(result, "summaries", None)
                    if summaries and isinstance(summaries, list):
                        for s in summaries:
                            if hasattr(s, "model_dump"):
                                by_trace.append(s.model_dump())
                            elif isinstance(s, dict):
                                by_trace.append(s)
            except Exception as e:
                logger.warning("Trace summarization failed: %s", e)

            try:
                user_groups = self._group_findings_by_user(findings)
                user_blocks = []
                for uid, ufindings in list(user_groups.items())[:20]:
                    uname = ufindings[0].get("user_name", uid) if ufindings else uid
                    block_lines = [f"USER {uname} ({uid}):"]
                    for f in ufindings[:10]:
                        block_lines.append(f"  - Trace {f.get('trace_id')}: {self._trim(f.get('insight') or '', 200)}")
                    user_blocks.append("\n".join(block_lines))

                if user_blocks:
                    SummarizeUsers = sigs["SummarizeUsers"]
                    user_predictor = get_predictor(SummarizeUsers, lm, temperature=0.2)
                    result = run_predict(user_predictor, lm, user_findings_blocks=user_blocks)
                    summaries = getattr(result, "summaries", None)
                    if summaries and isinstance(summaries, list):
                        for s in summaries:
                            if hasattr(s, "model_dump"):
                                by_user.append(s.model_dump())
                            elif isinstance(s, dict):
                                by_user.append(s)
            except Exception as e:
                logger.warning("User summarization failed: %s", e)

            # Build final payload
            payload = {
                "overall": overall_state.model_dump() if hasattr(overall_state, "model_dump") else {},
                "by_user": by_user,
                "by_trace": by_trace,
                "candidate_rubric_questions": candidate_rubric_questions,
                "key_disagreements": key_disagreements,
                "discussion_prompts": discussion_prompts,
                "convergence": convergence,
                "ready_for_rubric": ready_for_rubric,
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

    def get_discovery_summaries(self, workshop_id: str) -> dict[str, Any]:
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

    def get_findings(self, workshop_id: str, user_id: str | None = None) -> list[DiscoveryFinding]:
        self._get_workshop_or_404(workshop_id)
        return self.db_service.get_findings(workshop_id, user_id)

    def get_findings_with_user_details(self, workshop_id: str, user_id: str | None = None) -> list[dict[str, Any]]:
        self._get_workshop_or_404(workshop_id)
        return self.db_service.get_findings_with_user_details(workshop_id, user_id)

    def clear_findings(self, workshop_id: str) -> None:
        self._get_workshop_or_404(workshop_id)
        self.db_service.clear_findings(workshop_id)

    # ---------------------------------------------------------------------
    # Phase transitions / discovery orchestration
    # ---------------------------------------------------------------------
    def begin_discovery_phase(
        self, workshop_id: str, trace_limit: int | None = None, randomize: bool = False
    ) -> dict[str, Any]:
        self._get_workshop_or_404(workshop_id)

        # Update workshop phase to discovery and mark discovery as started
        self.db_service.update_workshop_phase(workshop_id, WorkshopPhase.DISCOVERY)
        self.db_service.update_phase_started(workshop_id, discovery_started=True)

        # Persist randomize setting
        if randomize:
            from server.database import WorkshopDB

            workshop_db = self.db.query(WorkshopDB).filter_by(id=workshop_id).first()
            if workshop_db:
                workshop_db.discovery_randomize_traces = True
                self.db.commit()

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

    def reset_discovery(self, workshop_id: str) -> dict[str, Any]:
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

    def advance_to_discovery(self, workshop_id: str) -> dict[str, Any]:
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

    def generate_discovery_test_data(self, workshop_id: str) -> dict[str, Any]:
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
    def mark_user_discovery_complete(self, workshop_id: str, user_id: str) -> dict[str, Any]:
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

    def get_discovery_completion_status(self, workshop_id: str) -> dict[str, Any]:
        self._get_workshop_or_404(workshop_id)
        return self.db_service.get_discovery_completion_status(workshop_id)

    def is_user_discovery_complete(self, workshop_id: str, user_id: str) -> dict[str, Any]:
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

    # -----------------------------------------------------------------
    # Discovery Feedback (v2 Structured Feedback)
    # -----------------------------------------------------------------

    def submit_discovery_feedback(
        self, workshop_id: str, data: DiscoveryFeedbackCreate
    ) -> DiscoveryFeedback:
        """Submit or update initial feedback (label + comment) for a trace."""
        self._get_workshop_or_404(workshop_id)

        if not data.comment or not data.comment.strip():
            raise HTTPException(status_code=422, detail="Comment is required")

        return self.db_service.add_discovery_feedback(workshop_id, data)

    def generate_followup_question(
        self,
        workshop_id: str,
        trace_id: str,
        user_id: str,
        question_number: int,
    ) -> dict[str, Any]:
        """Generate a follow-up question for the given feedback."""
        workshop = self._get_workshop_or_404(workshop_id)

        if question_number < 1 or question_number > 3:
            raise HTTPException(status_code=400, detail="question_number must be 1, 2, or 3")

        trace = self.db_service.get_trace(trace_id)
        if not trace or trace.workshop_id != workshop_id:
            raise HTTPException(status_code=404, detail="Trace not found")

        feedback_list = self.db_service.get_discovery_feedback(
            workshop_id, user_id=user_id, trace_id=trace_id
        )
        if not feedback_list:
            raise HTTPException(status_code=404, detail="No feedback found for this trace/user")
        feedback = feedback_list[0]

        # Validate that the user hasn't already answered this many questions
        existing_qna_count = len(feedback.followup_qna or [])
        if question_number != existing_qna_count + 1:
            raise HTTPException(
                status_code=400,
                detail=f"Expected question_number={existing_qna_count + 1}, got {question_number}",
            )

        # Get LLM configuration
        workspace_url = None
        databricks_token = None
        model_name = (getattr(workshop, "discovery_questions_model_name", None) or "demo").strip()

        mlflow_config = self.db_service.get_mlflow_config(workshop_id)
        if mlflow_config:
            workspace_url = mlflow_config.databricks_host
            from server.services.token_storage_service import token_storage

            databricks_token = token_storage.get_token(workshop_id) or self.db_service.get_databricks_token(
                workshop_id
            )

        # Check for custom LLM provider configuration
        custom_base_url = None
        custom_model_name = None
        custom_api_key = None

        if model_name == "custom":
            custom_config = self.db_service.get_custom_llm_provider_config(workshop_id)
            if custom_config and custom_config.is_enabled:
                custom_base_url = custom_config.base_url
                custom_model_name = custom_config.model_name
                from server.services.token_storage_service import token_storage as ts

                custom_api_key = ts.get_token(f"custom_llm_{workshop_id}")

        logger.info(
            "Follow-up question config (workshop=%s): model=%s, workspace_url=%s, has_token=%s, has_custom=%s",
            workshop_id,
            model_name,
            bool(workspace_url),
            bool(databricks_token),
            bool(custom_base_url and custom_model_name and custom_api_key),
        )

        from server.services.followup_question_service import FollowUpQuestionService

        svc = FollowUpQuestionService()
        question, is_fallback = svc.generate(
            trace=trace,
            feedback=feedback,
            question_number=question_number,
            workspace_url=workspace_url,
            databricks_token=databricks_token,
            model_name=model_name,
            custom_base_url=custom_base_url,
            custom_model_name=custom_model_name,
            custom_api_key=custom_api_key,
        )

        return {"question": question, "question_number": question_number, "is_fallback": is_fallback}

    def submit_followup_answer(
        self,
        workshop_id: str,
        trace_id: str,
        user_id: str,
        question: str,
        answer: str,
    ) -> dict[str, Any]:
        """Append a Q&A pair to the feedback record."""
        self._get_workshop_or_404(workshop_id)

        if not answer or not answer.strip():
            raise HTTPException(status_code=422, detail="Answer is required")

        feedback = self.db_service.append_followup_qna(
            workshop_id, trace_id, user_id,
            {"question": question, "answer": answer},
        )
        return {
            "feedback_id": feedback.id,
            "qna_count": len(feedback.followup_qna),
            "complete": len(feedback.followup_qna) >= 3,
        }

    def get_discovery_feedback(
        self, workshop_id: str, user_id: str | None = None
    ) -> list[DiscoveryFeedback]:
        """Get all discovery feedback, optionally filtered by user."""
        self._get_workshop_or_404(workshop_id)
        return self.db_service.get_discovery_feedback(workshop_id, user_id=user_id)

    # --------- Assisted Facilitation v2 Methods ---------

    async def submit_finding_v2(
        self, workshop_id: str, trace_id: str, user_id: str, finding_text: str
    ) -> dict[str, Any]:
        """Submit finding with real-time classification.

        This method:
        1. Classifies finding into category using LLM (or falls back to keyword-based)
        2. Persists finding with category to database
        3. Runs disagreement detection
        4. Returns classified finding
        """
        workshop = self._get_workshop_or_404(workshop_id)
        trace = self.db_service.get_trace(trace_id)
        if not trace or trace.workshop_id != workshop_id:
            raise HTTPException(status_code=404, detail="Trace not found")

        # Try LLM-based classification if configured
        category = await self._classify_finding_with_llm(
            workshop_id=workshop_id,
            finding_text=finding_text,
            trace=trace,
        )

        # Build finding data for persistence
        finding_data = {
            "trace_id": trace_id,
            "user_id": user_id,
            "text": finding_text,
            "category": category,
        }

        # Persist the classified finding to database
        saved_finding = self.db_service.add_classified_finding(workshop_id, finding_data)

        # Run disagreement detection against other findings for this trace
        trace_findings = self.db_service.get_classified_findings_by_trace(workshop_id, trace_id)
        await self._detect_disagreements_with_llm(workshop_id, trace_id, trace_findings, trace)

        result = {
            "id": saved_finding.get("id"),
            "trace_id": trace_id,
            "user_id": user_id,
            "text": finding_text,
            "category": category,
            "question_id": "q_1",
            "promoted": False,
        }

        return result

    async def _classify_finding_with_llm(
        self, workshop_id: str, finding_text: str, trace: Any
    ) -> str:
        """Classify finding using LLM if configured, otherwise fall back to keyword-based."""
        from server.services.classification_service import ClassificationService
        from server.services.token_storage_service import token_storage

        # Get LLM configuration
        mlflow_config = self.db_service.get_mlflow_config(workshop_id)
        workshop = self.db_service.get_workshop(workshop_id)
        model_name = getattr(workshop, "discovery_questions_model_name", None) or ""

        if not mlflow_config or not model_name:
            logger.debug("No LLM config for workshop %s, using local classification", workshop_id)
            return self._classify_finding_locally(finding_text)

        # Get token from memory or database
        databricks_token = token_storage.get_token(workshop_id)
        if not databricks_token:
            databricks_token = self.db_service.get_databricks_token(workshop_id)

        if not databricks_token:
            logger.debug("No Databricks token for workshop %s, using local classification", workshop_id)
            return self._classify_finding_locally(finding_text)

        # Extract trace input/output for context
        trace_input = ""
        trace_output = ""
        if trace:
            trace_input = str(getattr(trace, "input", "") or "")[:1000]
            trace_output = str(getattr(trace, "output", "") or "")[:1000]

        # Use LLM classification
        try:
            classification_service = ClassificationService(self.db)
            category = await classification_service.classify_finding(
                finding_text=finding_text,
                trace_input=trace_input,
                trace_output=trace_output,
                workshop_id=workshop_id,
                model_name=model_name.strip(),
                databricks_host=mlflow_config.databricks_host,
                databricks_token=databricks_token,
            )
            return category
        except Exception as e:
            logger.warning("LLM classification failed for workshop %s: %s", workshop_id, e)
            return self._classify_finding_locally(finding_text)

    async def _detect_disagreements_with_llm(
        self, workshop_id: str, trace_id: str, findings: list[dict[str, Any]], trace: Any
    ) -> None:
        """Detect disagreements using LLM if configured."""
        from server.services.classification_service import ClassificationService
        from server.services.token_storage_service import token_storage
        from server.models import ClassifiedFinding

        if not findings or len(findings) < 2:
            return

        # Get LLM configuration
        mlflow_config = self.db_service.get_mlflow_config(workshop_id)
        workshop = self.db_service.get_workshop(workshop_id)
        model_name = getattr(workshop, "discovery_questions_model_name", None) or ""

        if not mlflow_config or not model_name:
            # Fall back to simple keyword-based detection
            self.detect_disagreements(workshop_id, trace_id, findings)
            return

        # Get token from memory or database
        databricks_token = token_storage.get_token(workshop_id)
        if not databricks_token:
            databricks_token = self.db_service.get_databricks_token(workshop_id)

        if not databricks_token:
            self.detect_disagreements(workshop_id, trace_id, findings)
            return

        # Convert findings to ClassifiedFinding objects
        classified_findings = []
        for f in findings:
            classified_findings.append(ClassifiedFinding(
                id=f.get("id", ""),
                workshop_id=workshop_id,
                trace_id=trace_id,
                user_id=f.get("user_id", ""),
                text=f.get("text", ""),
                category=f.get("category", "themes"),
                question_id=f.get("question_id", ""),
                promoted=f.get("promoted", False),
            ))

        try:
            classification_service = ClassificationService(self.db)
            disagreements = await classification_service.detect_disagreements(
                trace_id=trace_id,
                findings=classified_findings,
                workshop_id=workshop_id,
                model_name=model_name.strip(),
                databricks_host=mlflow_config.databricks_host,
                databricks_token=databricks_token,
            )

            # Persist disagreements to database
            for d in disagreements:
                self.db_service.save_disagreement(
                    workshop_id=workshop_id,
                    trace_id=d.trace_id,
                    user_ids=d.user_ids,
                    finding_ids=d.finding_ids,
                    summary=d.summary,
                )
        except Exception as e:
            logger.warning("LLM disagreement detection failed for workshop %s: %s", workshop_id, e)
            self.detect_disagreements(workshop_id, trace_id, findings)

    @staticmethod
    def _classify_finding_locally(finding_text: str) -> str:
        """Simple local classification without LLM (placeholder).

        In Phase 2, this will be replaced with LLM-based classification.
        """
        text_lower = finding_text.lower()

        if any(word in text_lower for word in ["missing", "lack", "no ", "absent"]):
            return "missing_info"
        elif any(word in text_lower for word in ["fail", "error", "broken", "not work"]):
            return "failure_modes"
        elif any(word in text_lower for word in ["edge", "corner", "boundary", "extreme"]):
            return "boundary_conditions"
        elif any(word in text_lower for word in ["special", "unique", "unusual", "particular"]):
            return "edge_cases"
        else:
            return "themes"

    def detect_disagreements(
        self, workshop_id: str, trace_id: str, findings: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Detect disagreements among findings for a trace using DSPy.

        Per spec: "After each finding submission, compare against other findings
        for the same trace. If conflicting viewpoints detected, create a Disagreement record."

        Args:
            workshop_id: The workshop ID
            trace_id: The trace ID
            findings: List of finding dicts for the trace

        Returns:
            List of detected disagreement dicts
        """
        if not findings or len(findings) < 2:
            return []

        # Group findings by user
        user_findings: dict[str, list[dict]] = {}
        for f in findings:
            uid = f.get("user_id", "unknown")
            if uid not in user_findings:
                user_findings[uid] = []
            user_findings[uid].append(f)

        # Need at least 2 users to have a disagreement
        if len(user_findings) < 2:
            return []

        # Get workshop and check for LLM configuration
        workshop = self.db_service.get_workshop(workshop_id)
        if not workshop:
            return []

        model_name = (getattr(workshop, "discovery_questions_model_name", None) or "").strip()
        if not model_name or model_name == "demo":
            logger.debug("Disagreement detection skipped: no LLM model configured")
            return []

        mlflow_config = self.db_service.get_mlflow_config(workshop_id)
        if not mlflow_config:
            logger.debug("Disagreement detection skipped: no MLflow config")
            return []

        from server.services.token_storage_service import token_storage

        databricks_token = token_storage.get_token(workshop_id) or self.db_service.get_databricks_token(workshop_id)
        if not databricks_token:
            logger.debug("Disagreement detection skipped: no Databricks token")
            return []

        # Get trace for context
        trace = self.db_service.get_trace(trace_id)
        if not trace:
            return []

        try:
            from server.services.discovery_dspy import (
                build_databricks_lm,
                get_disagreement_signature,
                get_predictor,
                run_predict,
            )

            DetectFindingDisagreements = get_disagreement_signature()
            lm = build_databricks_lm(
                endpoint_name=model_name,
                workspace_url=mlflow_config.databricks_host,
                token=databricks_token,
                temperature=0.1,  # Low temperature for consistent detection
            )
            predictor = get_predictor(DetectFindingDisagreements, lm, temperature=0.1, max_tokens=500)

            # Format findings as "USER_ID|FINDING_ID|FINDING_TEXT"
            findings_with_users = []
            for f in findings[:10]:  # Limit to 10 findings to avoid token limits
                user_id = f.get("user_id", "unknown")
                finding_id = f.get("id", "unknown")
                text = self._trim(f.get("text") or f.get("insight") or "", 300)
                if text:
                    findings_with_users.append(f"{user_id}|{finding_id}|{text}")

            if len(findings_with_users) < 2:
                return []

            result = run_predict(
                predictor,
                lm,
                trace_id=trace_id,
                trace_input=self._trim(trace.input or "", 1000),
                trace_output=self._trim(trace.output or "", 1000),
                findings_with_users=findings_with_users,
            )

            detected = getattr(result, "disagreements", None)
            if not detected or not isinstance(detected, list):
                return []

            # Save detected disagreements to database
            disagreements = []
            for d in detected[:5]:  # Limit to 5 disagreements
                # Extract fields from DSPy output
                if hasattr(d, "model_dump"):
                    d_dict = d.model_dump()
                elif isinstance(d, dict):
                    d_dict = d
                else:
                    continue

                user_ids = d_dict.get("user_ids", [])
                finding_ids = d_dict.get("finding_ids", [])
                summary = d_dict.get("summary", "")

                if not summary or not user_ids:
                    continue

                saved = self.db_service.save_disagreement(
                    workshop_id=workshop_id,
                    trace_id=trace_id,
                    user_ids=user_ids,
                    finding_ids=finding_ids,
                    summary=summary,
                )
                if saved:
                    disagreements.append(saved)

            return disagreements

        except Exception as e:
            logger.warning(
                "Failed to detect disagreements via DSPy (workshop=%s, trace=%s): %s",
                workshop_id,
                trace_id,
                e,
            )
            return []

    def get_trace_discovery_state(
        self, workshop_id: str, trace_id: str
    ) -> dict[str, Any]:
        """Get structured discovery state for a trace (facilitator view).

        Returns comprehensive state including:
        - Classified findings grouped by category
        - Detected disagreements
        - Questions
        - Thresholds
        """
        workshop = self._get_workshop_or_404(workshop_id)
        trace = self.db_service.get_trace(trace_id)
        if not trace or trace.workshop_id != workshop_id:
            raise HTTPException(status_code=404, detail="Trace not found")

        # Get all classified findings for this trace from ClassifiedFindingDB
        trace_findings = self.db_service.get_classified_findings_by_trace(workshop_id, trace_id)

        # Initialize categories with empty lists
        categories: dict[str, list[dict[str, Any]]] = {
            "themes": [],
            "edge_cases": [],
            "boundary_conditions": [],
            "failure_modes": [],
            "missing_info": [],
        }

        # Group findings by category
        for finding in trace_findings:
            category = finding.get("category") or "themes"  # Default to themes if no category
            if category not in categories:
                category = "themes"  # Fallback for unknown categories

            finding_dict = {
                "id": finding.get("id"),
                "trace_id": finding.get("trace_id"),
                "user_id": finding.get("user_id"),
                "text": finding.get("text"),
                "category": category,
                "question_id": finding.get("question_id", "q_1"),
                "promoted": finding.get("promoted", False),
                "created_at": finding.get("created_at"),
            }
            categories[category].append(finding_dict)

        # Get disagreements from database
        disagreements = self.db_service.get_disagreements_by_trace(workshop_id, trace_id)

        # Get thresholds from database, with defaults
        default_thresholds = {
            "themes": 3,
            "edge_cases": 2,
            "boundary_conditions": 2,
            "failure_modes": 2,
            "missing_info": 1,
        }
        saved_thresholds = self.db_service.get_thresholds(workshop_id, trace_id)
        if saved_thresholds:
            default_thresholds.update(saved_thresholds)

        return {
            "trace_id": trace_id,
            "categories": categories,
            "disagreements": disagreements,
            "questions": [],  # Questions are user-specific, not returned here
            "thresholds": default_thresholds,
        }

    def get_fuzzy_progress(self, workshop_id: str) -> dict[str, Any]:
        """Get fuzzy progress indicator for participants.

        Returns participant-safe progress:
        - "exploring": Less than 30% traces have findings
        - "good_coverage": 30-80% traces have findings
        - "complete": 80%+ traces have findings
        """
        workshop = self._get_workshop_or_404(workshop_id)
        traces = self.db_service.get_traces(workshop_id)
        findings = self.db_service.get_findings(workshop_id)

        if not traces:
            return {"status": "exploring", "percentage": 0.0}

        traces_with_findings = len(set(f.trace_id for f in findings))
        percentage = (traces_with_findings / len(traces)) * 100

        if percentage < 30:
            status = "exploring"
        elif percentage < 80:
            status = "good_coverage"
        else:
            status = "complete"

        return {"status": status, "percentage": round(percentage, 1)}

    def promote_finding(
        self, workshop_id: str, finding_id: str, promoter_id: str
    ) -> dict[str, Any]:
        """Promote a finding to draft rubric staging area.

        This allows facilitators to move findings toward rubric item candidates.
        """
        workshop = self._get_workshop_or_404(workshop_id)

        # Placeholder implementation - full DB operations in Phase 3
        return {
            "id": finding_id,
            "finding_id": finding_id,
            "promoted_by": promoter_id,
            "status": "promoted",
        }

    def update_trace_thresholds(
        self, workshop_id: str, trace_id: str, thresholds: dict[str, int]
    ) -> dict[str, Any]:
        """Update per-trace thresholds for category coverage.

        Thresholds define how many findings per category are needed for trace.
        """
        workshop = self._get_workshop_or_404(workshop_id)
        trace = self.db_service.get_trace(trace_id)
        if not trace or trace.workshop_id != workshop_id:
            raise HTTPException(status_code=404, detail="Trace not found")

        # Persist thresholds to database
        self.db_service.save_thresholds(workshop_id, trace_id, thresholds)

        return {"trace_id": trace_id, "thresholds": thresholds, "updated": True}
