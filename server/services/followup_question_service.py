"""Follow-up question generation service for Discovery Step 1.

Generates progressive AI follow-up questions during feedback collection.
Uses the GenerateFollowUpQuestion DSPy signature with structured input fields.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

FALLBACK_QUESTIONS = [
    "Can you describe what specifically about this response influenced your rating?",
    "What would an ideal response look like in this situation?",
    "How would you prioritize the issues you've identified so far?",
]

MAX_RETRIES = 3


class FollowUpQuestionService:
    """Generates progressive AI follow-up questions during Step 1 feedback."""

    def generate(
        self,
        trace: Any,
        feedback: Any,
        question_number: int,
        *,
        workspace_url: str | None = None,
        databricks_token: str | None = None,
        model_name: str | None = None,
        custom_base_url: str | None = None,
        custom_model_name: str | None = None,
        custom_api_key: str | None = None,
    ) -> tuple[str, bool]:
        """Generate follow-up question using LLM with progressive context.

        Args:
            trace: Trace object with input/output fields.
            feedback: DiscoveryFeedback (or dict) with feedback_label, comment, followup_qna.
            question_number: 1-based question number (1, 2, or 3).
            workspace_url: Databricks workspace URL for LLM call.
            databricks_token: Auth token.
            model_name: Endpoint name.
            custom_base_url: Base URL for a custom OpenAI-compatible provider.
            custom_model_name: Model name for the custom provider.
            custom_api_key: API key for the custom provider.

        Returns:
            Tuple of (question_text, is_fallback).
        """
        if question_number < 1 or question_number > 3:
            raise ValueError(f"question_number must be 1-3, got {question_number}")

        trace_input, trace_output, fb_label, fb_comment, prior_qna = (
            self._extract_fields(trace, feedback)
        )

        has_databricks = workspace_url and databricks_token and model_name and model_name != "demo"
        has_custom = custom_base_url and custom_model_name and custom_api_key

        # If no LLM config at all, return fallback immediately
        if not has_databricks and not has_custom:
            missing = []
            if not workspace_url:
                missing.append("workspace_url")
            if not databricks_token:
                missing.append("databricks_token")
            if not model_name or model_name == "demo":
                missing.append(f"model_name (current: {model_name!r})")
            logger.warning(
                "Follow-up Q%d: using fallback — no LLM config. Missing: %s",
                question_number,
                ", ".join(missing) if missing else "custom provider not configured",
            )
            return FALLBACK_QUESTIONS[question_number - 1], True

        # Attempt LLM generation with retries
        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                question = self._call_llm(
                    trace_input=trace_input,
                    trace_output=trace_output,
                    feedback_label=fb_label,
                    feedback_comment=fb_comment,
                    prior_qna=prior_qna,
                    workspace_url=workspace_url,
                    databricks_token=databricks_token,
                    model_name=model_name,
                    custom_base_url=custom_base_url,
                    custom_model_name=custom_model_name,
                    custom_api_key=custom_api_key,
                )
                return question, False
            except Exception as e:
                last_error = e
                logger.warning(
                    "Follow-up question generation attempt %d/%d failed: %s",
                    attempt + 1, MAX_RETRIES, e,
                )

        # All retries exhausted — return fallback
        logger.error(
            "All %d retries exhausted for follow-up question generation. "
            "Using fallback. Last error: %s",
            MAX_RETRIES, last_error,
        )
        return FALLBACK_QUESTIONS[question_number - 1], True

    def _extract_fields(
        self, trace: Any, feedback: Any
    ) -> tuple[str, str, str, str, str]:
        """Extract structured fields from trace and feedback for the DSPy signature.

        Returns:
            (trace_input, trace_output, feedback_label, feedback_comment, prior_qna)
        """
        trace_input = getattr(trace, "input", "") or ""
        trace_output = getattr(trace, "output", "") or ""

        fb_label = getattr(feedback, "feedback_label", "") or ""
        fb_comment = getattr(feedback, "comment", "") or ""

        # If feedback is a dict, handle that too
        if isinstance(feedback, dict):
            fb_label = feedback.get("feedback_label", "")
            fb_comment = feedback.get("comment", "")
            qna_list = feedback.get("followup_qna", [])
        else:
            qna_list = getattr(feedback, "followup_qna", []) or []

        # Format prior Q&A history
        qna_history = ""
        for i, qna in enumerate(qna_list, 1):
            q = qna.get("question", "")
            a = qna.get("answer", "")
            qna_history += f"Q{i}: {q}\nA{i}: {a}\n"

        if not qna_history:
            qna_history = "(none yet)"

        return trace_input, trace_output, fb_label, fb_comment, qna_history

    def _call_llm(
        self,
        trace_input: str,
        trace_output: str,
        feedback_label: str,
        feedback_comment: str,
        prior_qna: str,
        workspace_url: str | None = None,
        databricks_token: str | None = None,
        model_name: str | None = None,
        custom_base_url: str | None = None,
        custom_model_name: str | None = None,
        custom_api_key: str | None = None,
    ) -> str:
        """Call the LLM via DSPy infrastructure."""
        from server.services.discovery_dspy import (
            build_custom_llm,
            build_databricks_lm,
            get_followup_question_signature,
            get_predictor,
            run_predict,
        )

        GenerateFollowUpQuestion = get_followup_question_signature()

        if custom_base_url and custom_model_name and custom_api_key:
            lm = build_custom_llm(
                base_url=custom_base_url,
                model_name=custom_model_name,
                api_key=custom_api_key,
                temperature=0.3,
            )
        else:
            lm = build_databricks_lm(
                endpoint_name=model_name or "",
                workspace_url=workspace_url or "",
                token=databricks_token or "",
                temperature=0.3,
            )

        predictor = get_predictor(GenerateFollowUpQuestion, lm, temperature=0.3, max_tokens=200)

        result = run_predict(
            predictor,
            lm,
            trace_input=trace_input,
            trace_output=trace_output,
            feedback_label=feedback_label,
            feedback_comment=feedback_comment,
            prior_qna=prior_qna,
        )

        question = getattr(result, "question", None)
        if not question or not str(question).strip():
            raise ValueError("LLM returned empty question")

        return str(question).strip()
