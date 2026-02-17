"""Follow-up question generation service for Discovery Step 1.

Generates progressive AI follow-up questions during feedback collection.
Uses the exact system/user prompts from DISCOVERY_SPEC.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

FOLLOWUP_SYSTEM_PROMPT = (
    "You are a senior UX researcher analyzing chatbot responses. Your job is to ask "
    "the person giving feedback sharp, specific follow-up questions that extract "
    "actionable insights about how the chatbot response could be improved.\n"
    "Focus on clarifying: what specific aspect was problematic, what would make it "
    "better, concrete examples, and priority. Do NOT act as the chatbot - you are "
    "interviewing the feedback provider about their opinion of the chatbot's response."
)

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
    ) -> str:
        """Generate follow-up question using LLM with progressive context.

        Args:
            trace: Trace object with input/output fields.
            feedback: DiscoveryFeedback (or dict) with feedback_label, comment, followup_qna.
            question_number: 1-based question number (1, 2, or 3).
            workspace_url: Databricks workspace URL for LLM call.
            databricks_token: Auth token.
            model_name: Endpoint name.

        Returns:
            The follow-up question text.
        """
        if question_number < 1 or question_number > 3:
            raise ValueError(f"question_number must be 1-3, got {question_number}")

        user_prompt = self._build_user_prompt(trace, feedback)

        # If no LLM config, return fallback immediately
        if not workspace_url or not databricks_token or not model_name or model_name == "demo":
            return FALLBACK_QUESTIONS[question_number - 1]

        # Attempt LLM generation with retries
        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                return self._call_llm(
                    system_prompt=FOLLOWUP_SYSTEM_PROMPT,
                    user_prompt=user_prompt,
                    workspace_url=workspace_url,
                    databricks_token=databricks_token,
                    model_name=model_name,
                )
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
        return FALLBACK_QUESTIONS[question_number - 1]

    def _build_user_prompt(self, trace: Any, feedback: Any) -> str:
        """Build the user prompt with progressive context per spec."""
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

        return (
            f"CONVERSATION BEING REVIEWED:\n"
            f"Input: {trace_input}\n"
            f"Output: {trace_output}\n\n"
            f"REVIEWER'S FEEDBACK:\n"
            f"Label: {fb_label}\n"
            f"Comment: {fb_comment}\n"
            f"Prior Q/A with reviewer:\n"
            f"{qna_history}\n"
            f"Your question to the REVIEWER (about their feedback):"
        )

    def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        workspace_url: str,
        databricks_token: str,
        model_name: str,
    ) -> str:
        """Call the LLM via DSPy infrastructure."""
        from server.services.discovery_dspy import (
            build_databricks_lm,
            get_followup_question_signature,
            get_predictor,
            run_predict,
        )

        GenerateFollowUpQuestion = get_followup_question_signature()
        lm = build_databricks_lm(
            endpoint_name=model_name,
            workspace_url=workspace_url,
            token=databricks_token,
            temperature=0.3,
        )
        predictor = get_predictor(GenerateFollowUpQuestion, lm, temperature=0.3, max_tokens=200)

        result = run_predict(
            predictor,
            lm,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )

        question = getattr(result, "question", None)
        if not question or not str(question).strip():
            raise ValueError("LLM returned empty question")

        return str(question).strip()
