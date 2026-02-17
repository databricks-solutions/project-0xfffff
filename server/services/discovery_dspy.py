"""DSPy signatures + helpers for discovery LLM calls.

We use DSPy Signatures to declaratively specify I/O behavior and let DSPy handle
prompt formatting and structured parsing. This replaces hand-built prompts and
manual JSON parsing.

Reference: `https://dspy.ai/learn/programming/signatures/`
"""

from __future__ import annotations

import logging
import os
import threading
from contextlib import contextmanager
from typing import Any, Literal

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional MLflow DSPy autologging (dev-only)
# ---------------------------------------------------------------------------
# If set, this env var contains the MLflow experiment id to send DSPy traces to.
# This is intended for development and is independent of the workshop's configured
# MLflow intake experiment.
DSPY_DEV_MLFLOW_EXPERIMENT_ID_ENV = "MLFLOW_DSPY_DEV_EXPERIMENT_ID"
_MLFLOW_DSPY_AUTOLOG_LOCK = threading.Lock()
_MLFLOW_DSPY_AUTOLOG_ENABLED: bool | None = None


def _maybe_enable_mlflow_dspy_autolog() -> None:
    """Enable MLflow DSPy autologging when configured via env var.

    This function is safe to call repeatedly; it will only try to initialize once.
    """
    global _MLFLOW_DSPY_AUTOLOG_ENABLED

    if _MLFLOW_DSPY_AUTOLOG_ENABLED is not None:
        return

    exp_id = (os.getenv(DSPY_DEV_MLFLOW_EXPERIMENT_ID_ENV) or "").strip()
    if not exp_id:
        _MLFLOW_DSPY_AUTOLOG_ENABLED = False
        return

    with _MLFLOW_DSPY_AUTOLOG_LOCK:
        if _MLFLOW_DSPY_AUTOLOG_ENABLED is not None:
            return

        try:
            import mlflow

            # If the user didn't explicitly set a tracking URI, default to Databricks for
            # this dev-only experiment-id based tracing. This avoids accidentally creating
            # a local SQLite-backed MLflow store (which would never write to a Databricks
            # experiment id).
            if not (os.getenv("MLFLOW_TRACKING_URI") or "").strip():
                try:
                    mlflow.set_tracking_uri("databricks")
                except Exception as exc:
                    logger.debug("Failed to set MLflow tracking URI to databricks: %s", exc)

            # Pin to the requested experiment id for these dev traces.
            # (If the tracking URI/credentials aren't configured, this will throw;
            # we swallow errors so discovery still works in non-MLflow environments.)
            mlflow.set_experiment(experiment_id=exp_id)

            # Enable DSPy autologging to capture spans/traces for predictor calls.
            # Leave defaults (log_traces=True) and keep it quiet unless debugging.
            import mlflow.dspy  # noqa: F401

            mlflow.dspy.autolog(log_traces=True, silent=True)

            _MLFLOW_DSPY_AUTOLOG_ENABLED = True
            logger.info(
                "Enabled MLflow DSPy autologging for discovery via %s=%s",
                DSPY_DEV_MLFLOW_EXPERIMENT_ID_ENV,
                exp_id,
            )
        except Exception as exc:
            _MLFLOW_DSPY_AUTOLOG_ENABLED = False
            logger.warning(
                "MLflow DSPy autologging NOT enabled (env %s=%s). "
                "Common causes: missing Databricks auth (DATABRICKS_HOST/DATABRICKS_TOKEN or CLI profile), "
                "or MLFLOW_TRACKING_URI not pointing at Databricks. Error: %s",
                DSPY_DEV_MLFLOW_EXPERIMENT_ID_ENV,
                exp_id,
                exc,
            )


# ---------------------------------------------------------------------------
# Question generation coverage categories
# ---------------------------------------------------------------------------
QUESTION_CATEGORIES: list[str] = [
    "themes",
    "edge_cases",
    "boundary_conditions",
    "failure_modes",
    "missing_info",
    "disagreements",
]

QuestionCategory = Literal[
    "themes",
    "edge_cases",
    "boundary_conditions",
    "failure_modes",
    "missing_info",
    "disagreements",
]


class DiscoveryQuestionCandidate(BaseModel):
    """Output model for a generated discovery question."""

    prompt: str
    placeholder: str | None = None
    category: str | None = Field(
        default=None,
        description="Coverage category: themes, edge_cases, boundary_conditions, failure_modes, missing_info, disagreements",
    )


# ---------------------------------------------------------------------------
# Summary Pydantic models (enriched for rubric bridging)
# ---------------------------------------------------------------------------
class DiscoveryOverallSummary(BaseModel):
    themes: list[str] = Field(default_factory=list)
    patterns: list[str] = Field(default_factory=list)
    tendencies: list[str] = Field(default_factory=list)
    risks_or_failure_modes: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)


class DiscoveryUserSummary(BaseModel):
    user_id: str
    user_name: str
    themes: list[str] = Field(default_factory=list)
    tendencies: list[str] = Field(default_factory=list)
    notable_insights: list[str] = Field(default_factory=list)


class DiscoveryTraceSummary(BaseModel):
    trace_id: str
    themes: list[str] = Field(default_factory=list)
    tendencies: list[str] = Field(default_factory=list)
    notable_behaviors: list[str] = Field(default_factory=list)


class KeyDisagreement(BaseModel):
    """A disagreement between participants on a theme or trace."""

    theme: str
    trace_ids: list[str] = Field(default_factory=list)
    viewpoints: list[str] = Field(default_factory=list, description="Paraphrased conflicting viewpoints")


class DiscussionPrompt(BaseModel):
    """A facilitator discussion prompt for a theme or disagreement."""

    theme: str
    prompt: str


class ConvergenceMetrics(BaseModel):
    """Cross-participant agreement metrics."""

    theme_agreement: dict[str, float] = Field(
        default_factory=dict, description="Map from theme to fraction of users who mention it"
    )
    overall_alignment_score: float = Field(default=0.0, description="0-1 score of cross-user agreement")


class DiscoverySummariesPayload(BaseModel):
    """Enriched discovery summaries payload for facilitators."""

    overall: DiscoveryOverallSummary = Field(default_factory=DiscoveryOverallSummary)
    by_user: list[DiscoveryUserSummary] = Field(default_factory=list)
    by_trace: list[DiscoveryTraceSummary] = Field(default_factory=list)
    # New fields for rubric bridging
    candidate_rubric_questions: list[str] = Field(
        default_factory=list, description="Concrete quality dimensions that could become rubric questions"
    )
    key_disagreements: list[KeyDisagreement] = Field(
        default_factory=list, description="Conflicting viewpoints among participants"
    )
    discussion_prompts: list[DiscussionPrompt] = Field(
        default_factory=list, description="Facilitator discussion prompts per theme/disagreement"
    )
    convergence: ConvergenceMetrics = Field(default_factory=ConvergenceMetrics)
    ready_for_rubric: bool = Field(
        default=False, description="True when discovery has sufficient coverage to proceed to rubric"
    )


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
    # We keep the `databricks/` provider prefix but point `api_base` to Databricks.
    # Handle case where endpoint_name already has the prefix
    if endpoint_name.startswith("databricks/"):
        model = endpoint_name
    else:
        model = f"databricks/{endpoint_name}"

    try:
        return dspy.LM(model=model, api_key=token, api_base=api_base, temperature=temperature)
    except TypeError:
        # Older/newer DSPy versions may use slightly different kwarg names.
        # Fall back to the simplest constructor and rely on environment/defaults.
        return dspy.LM(model=model)


def build_custom_llm(base_url: str, model_name: str, api_key: str, *, temperature: float = 0.2):
    """Create a DSPy LM pointed at a custom OpenAI-compatible endpoint.

    Works with any provider that exposes /v1/chat/completions (e.g. vLLM,
    Ollama, Together AI, etc.).
    """
    dspy = _import_dspy()

    # DSPy uses LiteLLM under the hood — prefix with openai/ to force the
    # OpenAI-compatible path.
    if not model_name.startswith("openai/"):
        model = f"openai/{model_name}"
    else:
        model = model_name

    try:
        return dspy.LM(model=model, api_key=api_key, api_base=base_url, temperature=temperature)
    except TypeError:
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
    _maybe_enable_mlflow_dspy_autolog()
    with _dspy_with_lm(lm):
        return predictor(**kwargs)


def _define_signatures():
    """Define signature classes lazily (requires dspy import)."""
    dspy = _import_dspy()

    class GenerateDiscoveryQuestion(dspy.Signature):
        """Generate ONE novel discovery question for a participant.

        Constraints:
        - Single concise prompt (1-2 sentences)
        - Pick a category from the missing_categories list
        - If has_disagreement is True and 'disagreements' is in missing_categories, prioritize that category
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

        # Coverage tracking inputs
        covered_categories: list[str] = dspy.InputField(
            desc="Categories already covered: themes, edge_cases, boundary_conditions, failure_modes, missing_info, disagreements"
        )
        missing_categories: list[str] = dspy.InputField(desc="Categories NOT yet covered (pick from these)")
        has_disagreement: bool = dspy.InputField(
            desc="True if other_users_findings conflict with user_prior_finding; prioritize 'disagreements' category if True"
        )

        question: DiscoveryQuestionCandidate = dspy.OutputField(
            desc="The next question to ask; must include category from missing_categories"
        )

    # Legacy one-shot signature (kept for backwards compatibility, but prefer iterative pipeline)
    class GenerateDiscoverySummaries(dspy.Signature):
        """Summarize discovery findings for facilitators (legacy one-shot).

        Rules:
        - Focus on MODEL behavior (not participant performance)
        - Avoid quoting participants verbatim; paraphrase
        - Be specific: hallucination, instruction following, verbosity, refusal, safety, formatting, reasoning transparency, tool use
        - Note disagreements/divergent viewpoints
        - Keep bullets short
        """

        findings: list[str] = dspy.InputField(desc="Each line is one finding submission (pre-formatted)")
        payload: DiscoverySummariesPayload = dspy.OutputField(desc="Structured summaries")

    # ---------------------------------------------------------------------------
    # Iterative summary signatures
    # ---------------------------------------------------------------------------
    class RefineOverallSummary(dspy.Signature):
        """Iteratively refine an overall summary given a chunk of findings.

        Take the current state and incorporate new findings to update themes, patterns,
        tendencies, risks_or_failure_modes, and strengths. Avoid duplicates.
        """

        current_state: DiscoveryOverallSummary = dspy.InputField(desc="Current summary state (may be empty)")
        findings_chunk: list[str] = dspy.InputField(desc="New batch of finding lines to incorporate")
        updated_state: DiscoveryOverallSummary = dspy.OutputField(desc="Updated summary incorporating new findings")

    class ExtractRubricCandidates(dspy.Signature):
        """Extract candidate rubric questions from an overall summary.

        Convert themes and patterns into concrete, actionable quality dimensions
        that could become rubric questions for human annotation.
        Examples: "Does the response cite sources?", "Is the tone appropriate?"
        """

        overall_summary: DiscoveryOverallSummary = dspy.InputField(desc="Overall summary with themes/patterns")
        candidates: list[str] = dspy.OutputField(desc="List of candidate rubric question strings")

    class IdentifyDisagreements(dspy.Signature):
        """Identify key disagreements among participant findings.

        Scan findings for conflicting viewpoints on the same trace or theme.
        Paraphrase viewpoints without quoting participants directly.
        """

        findings: list[str] = dspy.InputField(desc="All finding lines (pre-formatted with trace/user info)")
        disagreements: list[KeyDisagreement] = dspy.OutputField(desc="List of key disagreements")

    class GenerateDiscussionPrompts(dspy.Signature):
        """Generate facilitator discussion prompts for themes and disagreements.

        Create short, actionable prompts to guide group discussion.
        Example: "Ask participants: What would make this response clearly 'good' vs. 'acceptable'?"
        """

        themes: list[str] = dspy.InputField(desc="Major themes from the overall summary")
        disagreements: list[KeyDisagreement] = dspy.InputField(desc="Key disagreements to discuss")
        prompts: list[DiscussionPrompt] = dspy.OutputField(desc="Discussion prompts for facilitators")

    class SummarizeTraces(dspy.Signature):
        """Summarize findings grouped by trace.

        For each trace, extract themes, tendencies, and notable behaviors.
        """

        trace_findings_blocks: list[str] = dspy.InputField(
            desc="Blocks of findings grouped by trace (each block starts with TRACE <id>)"
        )
        summaries: list[DiscoveryTraceSummary] = dspy.OutputField(desc="Per-trace summaries")

    class SummarizeUsers(dspy.Signature):
        """Summarize findings grouped by user.

        For each user, extract themes, tendencies, and notable insights.
        """

        user_findings_blocks: list[str] = dspy.InputField(
            desc="Blocks of findings grouped by user (each block starts with USER <name>)"
        )
        summaries: list[DiscoveryUserSummary] = dspy.OutputField(desc="Per-user summaries")

    return {
        "GenerateDiscoveryQuestion": GenerateDiscoveryQuestion,
        "GenerateDiscoverySummaries": GenerateDiscoverySummaries,
        "RefineOverallSummary": RefineOverallSummary,
        "ExtractRubricCandidates": ExtractRubricCandidates,
        "IdentifyDisagreements": IdentifyDisagreements,
        "GenerateDiscussionPrompts": GenerateDiscussionPrompts,
        "SummarizeTraces": SummarizeTraces,
        "SummarizeUsers": SummarizeUsers,
    }


_SIGS: dict[str, type] | None = None


def get_signatures() -> dict[str, type]:
    """Get all DSPy signature classes as a dict."""
    global _SIGS
    if _SIGS is None:
        _SIGS = _define_signatures()
    return _SIGS


def get_question_signature():
    """Get the question generation signature."""
    return get_signatures()["GenerateDiscoveryQuestion"]


def get_legacy_summaries_signature():
    """Get the legacy one-shot summaries signature."""
    return get_signatures()["GenerateDiscoverySummaries"]


# ---------------------------------------------------------------------------
# Classification Signatures for Assisted Facilitation v2
# ---------------------------------------------------------------------------


class CategoryOutput(BaseModel):
    """Output model for classification."""

    category: str = Field(
        description="One of: themes, edge_cases, boundary_conditions, failure_modes, missing_info"
    )


class DisagreementOutput(BaseModel):
    """Output model for disagreement detection."""

    summary: str = Field(description="Summary of the disagreement between participants")


class ClassifyFinding(BaseModel):
    """Classify a discovery finding into exactly one category."""

    finding_text: str = Field(description="The finding text to classify")
    trace_input: str = Field(description="The LLM input for context")
    trace_output: str = Field(description="The LLM output for context")
    category: str = Field(
        description="One of: themes, edge_cases, boundary_conditions, failure_modes, missing_info"
    )


def _define_classification_signature():
    """Define the classification DSPy signature."""
    dspy = _import_dspy()

    class ClassifyDiscoveryFinding(dspy.Signature):
        """Classify a discovery finding into exactly one category.

        Categories:
        - themes: General observations about quality, clarity, maintainability, patterns
        - edge_cases: Unusual inputs, special cases, uncommon scenarios
        - boundary_conditions: Limits, size boundaries, performance at scale
        - failure_modes: Crashes, errors, broken functionality, bugs
        - missing_info: Missing validation, incomplete handling, absent checks

        Rules:
        - Choose the single most appropriate category
        - Consider the finding text in context of the trace input/output
        - "missing" usually means missing_info
        - "crash", "fail", "error", "broken" usually means failure_modes
        - "edge", "corner", "unusual" usually means edge_cases
        - "boundary", "limit", "scale" usually means boundary_conditions
        - Everything else is typically themes
        """

        finding_text: str = dspy.InputField(desc="The finding text to classify")
        trace_input: str = dspy.InputField(desc="The LLM input for context")
        trace_output: str = dspy.InputField(desc="The LLM output for context")

        category: str = dspy.OutputField(
            desc="One of: themes, edge_cases, boundary_conditions, failure_modes, missing_info"
        )

    return ClassifyDiscoveryFinding


_CLASSIFICATION_SIG: type | None = None


def get_classification_signature():
    """Get the classification DSPy signature."""
    global _CLASSIFICATION_SIG
    if _CLASSIFICATION_SIG is None:
        _CLASSIFICATION_SIG = _define_classification_signature()
    return _CLASSIFICATION_SIG


class FollowUpQuestionOutput(BaseModel):
    """Output model for a follow-up question."""

    question: str = Field(description="The follow-up question to ask the reviewer")


def _define_followup_question_signature():
    """Define the follow-up question DSPy signature."""
    dspy = _import_dspy()

    class GenerateFollowUpQuestion(dspy.Signature):
        """Generate a follow-up question for a reviewer based on their feedback.

        The question should probe deeper into the reviewer's assessment,
        building on any prior Q&A context provided.
        """

        system_prompt: str = dspy.InputField(desc="System prompt for the UX researcher persona")
        user_prompt: str = dspy.InputField(desc="User prompt with trace + feedback context")

        question: str = dspy.OutputField(desc="The follow-up question for the reviewer")

    return GenerateFollowUpQuestion


_FOLLOWUP_SIG: type | None = None


def get_followup_question_signature():
    """Get the follow-up question generation DSPy signature."""
    global _FOLLOWUP_SIG
    if _FOLLOWUP_SIG is None:
        _FOLLOWUP_SIG = _define_followup_question_signature()
    return _FOLLOWUP_SIG


class DetectedDisagreement(BaseModel):
    """A detected disagreement between participants on a trace."""

    user_ids: list[str] = Field(description="User IDs involved in the disagreement")
    finding_ids: list[str] = Field(description="Finding IDs that conflict")
    summary: str = Field(description="Brief summary of the conflicting viewpoints")


def _define_disagreement_signature():
    """Define the disagreement detection DSPy signature."""
    dspy = _import_dspy()

    class DetectFindingDisagreements(dspy.Signature):
        """Detect semantic disagreements among participant findings for a trace.

        Analyze findings from different users and identify conflicting viewpoints.
        A disagreement exists when participants have opposing or contradictory
        assessments of the same aspect of the LLM response.

        Rules:
        - Only flag genuine semantic conflicts, not just different observations
        - A disagreement requires at least 2 users with opposing views
        - Summarize the conflict without quoting users verbatim
        - Focus on substantive disagreements about quality, correctness, or behavior
        """

        trace_id: str = dspy.InputField(desc="Trace identifier")
        trace_input: str = dspy.InputField(desc="The LLM input (for context)")
        trace_output: str = dspy.InputField(desc="The LLM output (for context)")
        findings_with_users: list[str] = dspy.InputField(
            desc="Findings formatted as 'USER_ID|FINDING_ID|FINDING_TEXT'"
        )

        disagreements: list[DetectedDisagreement] = dspy.OutputField(
            desc="List of detected disagreements between users (may be empty)"
        )

    return DetectFindingDisagreements


_DISAGREEMENT_SIG: type | None = None


def get_disagreement_signature():
    """Get the disagreement detection DSPy signature."""
    global _DISAGREEMENT_SIG
    if _DISAGREEMENT_SIG is None:
        _DISAGREEMENT_SIG = _define_disagreement_signature()
    return _DISAGREEMENT_SIG
