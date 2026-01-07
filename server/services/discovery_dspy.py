"""DSPy signatures + helpers for discovery LLM calls.

We use DSPy Signatures to declaratively specify I/O behavior and let DSPy handle
prompt formatting and structured parsing. This replaces hand-built prompts and
manual JSON parsing.

Reference: `https://dspy.ai/learn/programming/signatures/`
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class DiscoveryQuestionCandidate(BaseModel):
    prompt: str
    placeholder: str | None = None


class DiscoveryOverallSummary(BaseModel):
    themes: list[str]
    patterns: list[str]
    tendencies: list[str]
    risks_or_failure_modes: list[str]
    strengths: list[str]


class DiscoveryUserSummary(BaseModel):
    user_id: str
    user_name: str
    themes: list[str]
    tendencies: list[str]
    notable_insights: list[str]


class DiscoveryTraceSummary(BaseModel):
    trace_id: str
    themes: list[str]
    tendencies: list[str]
    notable_behaviors: list[str]


class DiscoverySummariesPayload(BaseModel):
    overall: DiscoveryOverallSummary
    by_user: list[DiscoveryUserSummary]
    by_trace: list[DiscoveryTraceSummary]


def _import_dspy():
    # Local import so the rest of the server can still import if DSPy isn't available
    # in a minimal deployment environment.
    import dspy  # type: ignore

    return dspy


def build_databricks_lm(endpoint_name: str, workspace_url: str, token: str, *, temperature: float = 0.2):
    """Create a DSPy LM pointed at Databricks model serving (OpenAI-compatible).

    Databricks Model Serving exposes an OpenAI-compatible Chat Completions API at:
      {workspace_url}/serving-endpoints
    where `model` is the endpoint name.
    """
    dspy = _import_dspy()

    api_base = f"{workspace_url.rstrip('/')}/serving-endpoints"

    # DSPy commonly uses LiteLLM-style model names like `openai/gpt-4o-mini`.
    # We keep the `openai/` provider prefix but point `api_base` to Databricks.
    model = f"databricks/{endpoint_name}"

    try:
        return dspy.LM(model=model, api_key=token, api_base=api_base, temperature=temperature)
    except TypeError:
        # Older/newer DSPy versions may use slightly different kwarg names.
        # Fall back to the simplest constructor and rely on environment/defaults.
        return dspy.LM(model=model)


@contextmanager
def _dspy_with_lm(lm: Any):
    """Run DSPy with a per-request LM using DSPy's own context mechanism.

    Notes on concurrency:
    - Prefer `dspy.settings.context(...)` (thread/async-local) rather than global `configure()`.
    - Do not wrap DSPy calls with your own locks as a primary concurrency mechanism.
    """
    dspy = _import_dspy()

    # Preferred: a proper context manager if DSPy exposes it.
    settings = getattr(dspy, "settings", None)
    if settings is not None and hasattr(settings, "context"):
        with settings.context(lm=lm):
            yield dspy
        return

    # If we get here, DSPy is too old (or API changed) to safely bind per-request config.
    # In a web server, falling back to global configure() is risky under concurrency.
    raise RuntimeError(
        "DSPy is missing `dspy.settings.context(...)`, which is required for per-request LM configuration "
        "in a concurrent server. Please upgrade DSPy (or configure a process-global LM at startup and "
        "avoid per-request model switching)."
    )


def get_predictor(signature_cls: type, lm: Any, *, temperature: float = 0.2, max_tokens: int | None = None):
    """Create a DSPy predictor bound to the provided LM."""
    with _dspy_with_lm(lm) as dspy:
        try:
            return dspy.Predict(signature_cls, temperature=temperature, max_tokens=max_tokens)
        except TypeError:
            # Some versions may not accept max_tokens / temperature at construction time.
            return dspy.Predict(signature_cls)


def run_predict(predictor: Any, lm: Any, **kwargs):
    """Execute a DSPy predictor call within the LM context."""
    with _dspy_with_lm(lm):
        return predictor(**kwargs)


def _define_signatures():
    """Define signature classes lazily (requires dspy import)."""
    dspy = _import_dspy()

    class GenerateDiscoveryQuestion(dspy.Signature):
        """Generate ONE novel discovery question for a participant.

        Constraints:
        - Single concise prompt (1-2 sentences)
        - Encourage comparison, edge cases, failure modes, missing info, root causes
        - Avoid repeating previous questions
        - Do not quote other users verbatim; paraphrase/abstract themes
        """

        workshop_id: str = dspy.InputField(desc="Workshop identifier")
        user_id: str = dspy.InputField(desc="User identifier")
        trace_id: str = dspy.InputField(desc="Trace identifier")

        trace_input: str = dspy.InputField(desc="Trace input text (trimmed)")
        trace_output: str = dspy.InputField(desc="Trace output text (trimmed)")
        trace_context_json: str = dspy.InputField(desc="Optional JSON context as a string (may be empty)")

        user_prior_finding: str = dspy.InputField(desc="User's prior finding for this trace (may be empty)")
        previous_questions: list[str] = dspy.InputField(
            desc="Questions already asked for this user/trace (may be empty)"
        )
        other_users_findings: list[str] = dspy.InputField(desc="Other users' findings for this trace (may be empty)")

        question: DiscoveryQuestionCandidate = dspy.OutputField(desc="The next question to ask the user")

    class GenerateDiscoverySummaries(dspy.Signature):
        """Summarize discovery findings for facilitators.

        Rules:
        - Focus on MODEL behavior (not participant performance)
        - Avoid quoting participants verbatim; paraphrase
        - Be specific: hallucination, instruction following, verbosity, refusal, safety, formatting, reasoning transparency, tool use
        - Note disagreements/divergent viewpoints
        - Keep bullets short
        """

        findings: list[str] = dspy.InputField(desc="Each line is one finding submission (pre-formatted)")
        payload: DiscoverySummariesPayload = dspy.OutputField(desc="Structured summaries")

    return GenerateDiscoveryQuestion, GenerateDiscoverySummaries


_SIGS: tuple[type, type] | None = None


def get_signatures() -> tuple[type, type]:
    global _SIGS
    if _SIGS is None:
        _SIGS = _define_signatures()
    return _SIGS
