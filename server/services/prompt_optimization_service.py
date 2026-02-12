"""Service for agent prompt optimization using MLflow GEPA (Guided Evolutionary Prompt Augmentation).

Uses GEPA to iteratively improve an agent's system prompt based on human evaluation
feedback collected during the workshop. The aligned judge serves as the scorer.
"""

import io
import logging
import os
import sys
import threading
import time
from typing import Any, Dict, Generator, List, Optional

from server.services.database_service import DatabaseService

logger = logging.getLogger(__name__)


class SimpleLogHandler(logging.Handler):
    """Simple log handler that collects messages for polling."""

    def __init__(self):
        super().__init__()
        self.messages: List[str] = []
        self._lock = threading.Lock()

    def emit(self, record: logging.LogRecord):
        msg = self.format(record)
        with self._lock:
            self.messages.append(msg)

    def get_new_messages(self) -> List[str]:
        """Get and clear accumulated messages."""
        with self._lock:
            messages = self.messages.copy()
            self.messages.clear()
        return messages


class StdoutCapture:
    """Captures stdout/stderr writes and stores them for polling.

    DSPy/GEPA print iteration scores and "Proposed new text" directly to
    stdout (not via Python logging), so we intercept sys.stdout to capture
    those messages and forward them to the frontend log panel.

    Long outputs (like full proposed prompts) are split into multiple lines
    so they display nicely in the log viewer.
    """

    def __init__(self, original_stream):
        self._original = original_stream
        self._messages: List[str] = []
        self._lock = threading.Lock()
        self._buffer = ""

    def write(self, text: str):
        # Always pass through to original so server console still shows output
        self._original.write(text)
        if not text:
            return
        # IMPORTANT: Do NOT skip text == "\n" — print() sends content and "\n"
        # separately.  If we drop the "\n", the buffer line never terminates and
        # the message is lost until get_new_messages() flushes the buffer.
        with self._lock:
            self._buffer += text
            # Split on newlines and collect complete lines
            while "\n" in self._buffer:
                line, self._buffer = self._buffer.split("\n", 1)
                line = line.rstrip()
                if line:
                    self._messages.append(line)

    def flush(self):
        self._original.flush()

    def get_new_messages(self) -> List[str]:
        with self._lock:
            # Flush any remaining buffer content as a line
            if self._buffer.strip():
                self._messages.append(self._buffer.rstrip())
                self._buffer = ""
            messages = self._messages.copy()
            self._messages.clear()
        return messages

    # Proxy all other attributes to the original stream so logging etc. still work
    def __getattr__(self, name):
        return getattr(self._original, name)


class PromptOptimizationService:
    """Service for running GEPA prompt optimization with MLflow."""

    def __init__(self, db_service: DatabaseService):
        self.db_service = db_service

    def run_optimization(
        self,
        workshop_id: str,
        optimizer_model_name: str,
        num_iterations: int,
        num_candidates: int,
        judge_name: str,
        mlflow_config: Any,
        prompt_text: Optional[str] = None,
        prompt_uri: Optional[str] = None,
        prompt_name: Optional[str] = None,
        uc_catalog: Optional[str] = None,
        uc_schema: Optional[str] = None,
        judge_names: Optional[List[str]] = None,
        target_endpoint: Optional[str] = None,
    ) -> Generator[Any, None, None]:
        """Run GEPA prompt optimization.

        This generator yields log messages (str) and finally yields a result dict.

        Either prompt_text or prompt_uri must be provided:
        - prompt_text: The agent system prompt entered directly by the user.
          Will be registered to MLflow before optimization.
        - prompt_uri: An existing MLflow prompt URI to load.

        Args:
            workshop_id: Workshop ID
            optimizer_model_name: Model for GEPA optimizer
            num_iterations: Number of optimization iterations
            num_candidates: Number of candidate prompts per iteration
            judge_name: Name of the aligned judge to use as scorer (fallback if judge_names is empty)
            mlflow_config: MLflow configuration with experiment_id, tokens, etc.
            prompt_text: Agent prompt text entered directly (alternative to prompt_uri)
            prompt_uri: MLflow prompt URI to load (alternative to prompt_text)
            prompt_name: Name for registering prompt in MLflow (used with prompt_text)
            uc_catalog: Unity Catalog catalog name (e.g. 'main')
            uc_schema: Unity Catalog schema name (e.g. 'my_schema')
            judge_names: List of aligned judge names (one per rubric question). If provided,
                all judges are loaded and passed to GEPA as scorers.
            target_endpoint: Serving endpoint name for predict_fn. If set, uses
                mlflow.deployments client to query the endpoint instead of the
                Databricks OpenAI client. Supports chat/completions and
                agent/v1/responses formats (auto-detected).
        """
        logger.info(
            "run_optimization() started for workshop '%s', prompt_uri='%s', has_text=%s",
            workshop_id, prompt_uri, bool(prompt_text),
        )

        if not prompt_text and not prompt_uri:
            yield "ERROR: Either prompt text or prompt URI must be provided"
            yield {"error": "No prompt provided", "success": False}
            return

        # Normalize prompt URI: prompts:// → prompts:/ (common user mistake)
        if prompt_uri and prompt_uri.startswith("prompts://"):
            prompt_uri = "prompts:/" + prompt_uri[len("prompts://"):]
            yield f"Normalized prompt URI to: {prompt_uri}"

        try:
            import mlflow
        except ImportError as e:
            error_msg = f"Required package not available: {e}"
            logger.error(error_msg)
            yield f"ERROR: {error_msg}"
            yield {"error": error_msg, "success": False}
            return

        # Track original stdout/stderr for safe restoration on any error
        _original_stdout_ref = sys.stdout
        _original_stderr_ref = sys.stderr

        # Declare early so the error handler can include it if loaded before failure
        original_prompt_text = None

        try:
            # Set up MLflow environment (same pattern as alignment_service.py)
            os.environ['DATABRICKS_HOST'] = mlflow_config.databricks_host.rstrip('/')
            has_oauth = bool(
                os.environ.get('DATABRICKS_CLIENT_ID')
                and os.environ.get('DATABRICKS_CLIENT_SECRET')
            )
            if has_oauth:
                os.environ.pop('DATABRICKS_TOKEN', None)
            else:
                os.environ['DATABRICKS_TOKEN'] = mlflow_config.databricks_token
                os.environ.pop('DATABRICKS_CLIENT_ID', None)
                os.environ.pop('DATABRICKS_CLIENT_SECRET', None)
            mlflow.set_tracking_uri('databricks')

            experiment_id = mlflow_config.experiment_id
            if not experiment_id:
                yield "ERROR: MLflow experiment ID is not configured."
                yield {"error": "MLflow experiment ID not configured", "success": False}
                return

            try:
                mlflow.set_experiment(experiment_id=experiment_id)
            except Exception as e:
                yield f"ERROR: Failed to set experiment {experiment_id}: {e}"
                yield {"error": f"Failed to set experiment: {e}", "success": False}
                return

            yield f"MLflow experiment set: {experiment_id}"

            # Get the prompt — either from direct text or MLflow URI
            original_prompt_obj = None
            original_prompt_text = None

            if prompt_text:
                # User entered prompt text directly — register it to MLflow first
                original_prompt_text = prompt_text
                # Use prompt as-is (no template variable injection).
                # GEPA intercepts load_prompt().format() — the user input is sent
                # as a separate user message, not embedded in the prompt template.
                template_text = prompt_text
                base_name = prompt_name or f"workshop_{workshop_id.replace('-', '_')}_agent_prompt"
                # Sanitize base name: only alphanumeric and underscores
                base_name = ''.join(c if c.isalnum() or c == '_' else '_' for c in base_name)
                # Construct UC-qualified name if catalog and schema are provided
                if uc_catalog and uc_schema:
                    reg_name = f"{uc_catalog}.{uc_schema}.{base_name}"
                else:
                    reg_name = base_name
                yield f"Registering prompt to MLflow as '{reg_name}'..."
                try:
                    original_prompt_obj = mlflow.genai.register_prompt(
                        name=reg_name,
                        template=template_text,
                    )
                    reg_version = getattr(original_prompt_obj, 'version', None)
                    prompt_uri = f"prompts:/{reg_name}/{reg_version}" if reg_version else f"prompts:/{reg_name}/latest"
                    yield f"Registered prompt: {prompt_uri} (version {reg_version})"
                except Exception as e:
                    error_msg = f"Failed to register prompt to MLflow: {e}"
                    yield f"ERROR: {error_msg}"
                    yield {"error": error_msg, "success": False}
                    return
                yield f"Using entered prompt ({len(original_prompt_text)} chars)"
            else:
                # Load from MLflow URI
                yield f"Loading prompt from: {prompt_uri}"
                try:
                    original_prompt_obj = mlflow.genai.load_prompt(prompt_uri)
                    original_prompt_text = original_prompt_obj.template
                    yield f"Loaded prompt ({len(original_prompt_text)} chars)"
                except Exception as e:
                    yield f"ERROR: Failed to load prompt '{prompt_uri}': {e}"
                    yield {"error": f"Failed to load prompt: {e}", "success": False}
                    return

            # Build training data from human-annotated traces
            yield "Building training dataset from annotated traces..."
            try:
                train_data = self._build_train_data(workshop_id, mlflow_config)
            except Exception as e:
                yield f"ERROR: Failed to build training data: {e}"
                yield {"error": f"Failed to build training data: {e}", "success": False,
                       "original_prompt": original_prompt_text}
                return

            if not train_data or len(train_data) == 0:
                yield "ERROR: No annotated traces available for optimization"
                yield {"error": "No annotated traces available", "success": False,
                       "original_prompt": original_prompt_text}
                return

            yield f"Training dataset: {len(train_data)} annotated traces"

            # Load aligned judges as scorers (registered during alignment phase).
            # If judge_names is provided, load ALL aligned judges (one per rubric question).
            # Otherwise fall back to loading a single judge by judge_name.
            names_to_load = judge_names if judge_names else [judge_name]
            yield f"Loading {len(names_to_load)} aligned judge(s) as scorer(s)..."
            scorers = []
            try:
                from mlflow.genai.scorers import get_scorer

                for jn in names_to_load:
                    yield f"  Loading judge '{jn}'..."
                    scorer = get_scorer(name=jn, experiment_id=experiment_id)
                    if scorer is None:
                        yield f"  WARNING: Judge '{jn}' not found — skipping"
                    else:
                        scorers.append(scorer)
                        yield f"  Loaded registered judge '{jn}'"

                if not scorers:
                    yield "ERROR: No judges could be loaded. Run alignment first."
                    yield {"error": "No aligned judges found. Run alignment on at least one rubric question first.", "success": False,
                           "original_prompt": original_prompt_text}
                    return
                yield f"Loaded {len(scorers)} judge(s) as scorers"
            except Exception as e:
                yield f"ERROR: Failed to load judges: {e}"
                yield {"error": f"Failed to load judges: {e}", "success": False,
                       "original_prompt": original_prompt_text}
                return

            # Determine model URI for the optimizer
            if optimizer_model_name.startswith('databricks-'):
                optimizer_model_uri = f'databricks:/{optimizer_model_name}'
            elif optimizer_model_name.startswith('openai-'):
                optimizer_model_uri = f'openai:/{optimizer_model_name.replace("openai-", "")}'
            else:
                optimizer_model_uri = f'databricks:/{optimizer_model_name}'

            yield f"Optimizer model: {optimizer_model_uri}"
            yield f"Configuration: {num_iterations} iterations, {num_candidates} candidates each"

            # Set up log capture — broadly capture all GEPA/MLflow/DSPy loggers
            log_handler = SimpleLogHandler()
            log_handler.setLevel(logging.DEBUG)
            formatter = logging.Formatter(
                '%(asctime)s %(levelname)s %(name)s: %(message)s',
                datefmt='%Y/%m/%d %H:%M:%S',
            )
            log_handler.setFormatter(formatter)

            # Capture parent loggers so all child loggers propagate to our handler
            target_loggers = [
                logging.getLogger("mlflow.genai"),    # All mlflow.genai.* (optimize, etc.)
                logging.getLogger("gepa"),             # GEPA's own logger
                logging.getLogger("dspy"),             # DSPy (used by GEPA internally)
                logging.getLogger("dsp"),              # DSPy also uses "dsp" logger
            ]
            for lg in target_loggers:
                lg.setLevel(logging.DEBUG)
                lg.addHandler(log_handler)

            # Install stdout/stderr capture BEFORE importing DSPy/GEPA.
            # DSPy caches sys.stdout at import time; if we replace it after
            # import, DSPy's print() calls bypass our capture entirely.
            stdout_capture = StdoutCapture(sys.stdout)
            stderr_capture = StdoutCapture(sys.stderr)
            _original_stdout = sys.stdout
            _original_stderr = sys.stderr
            sys.stdout = stdout_capture
            sys.stderr = stderr_capture

            # Create GEPA optimizer (imports DSPy — must happen AFTER stdout capture)
            yield "Initializing GEPA optimizer..."
            try:
                from mlflow.genai.optimize import GepaPromptOptimizer

                optimizer = GepaPromptOptimizer(
                    reflection_model=optimizer_model_uri,
                    max_metric_calls=num_iterations * num_candidates * max(len(train_data), 5),
                )
                yield "GEPA optimizer created"
            except ImportError:
                # Try alternative import path
                try:
                    from mlflow.genai.optimize.optimizers import GepaPromptOptimizer

                    optimizer = GepaPromptOptimizer(
                        reflection_model=optimizer_model_uri,
                        max_metric_calls=num_iterations * num_candidates * max(len(train_data), 5),
                    )
                    yield "GEPA optimizer created (via mlflow.genai.optimize.optimizers)"
                except ImportError as e:
                    # Restore stdout before returning error
                    sys.stdout = _original_stdout
                    sys.stderr = _original_stderr
                    error_msg = f"GEPA optimizer not available: {e}. Ensure mlflow>=3.5 and gepa are installed."
                    yield f"ERROR: {error_msg}"
                    yield {"error": error_msg, "success": False,
                           "original_prompt": original_prompt_text}
                    return

            # Log the original prompt and training data so the user sees what's being optimized
            yield "━━━ Original Prompt ━━━"
            # Show full prompt (it's the system prompt being optimized)
            for line in original_prompt_text.splitlines():
                yield f"  {line}"
            yield f"━━━ End Prompt ({len(original_prompt_text)} chars) ━━━"
            yield ""
            yield f"━━━ Training Data ({len(train_data)} examples) ━━━"
            for idx, example in enumerate(train_data[:5]):  # Show first 5
                req = example.get("inputs", {}).get("request", "")
                resp = example.get("outputs", "")
                yield f"  Example {idx + 1}: input='{req[:120]}{'...' if len(req) > 120 else ''}'"
                yield f"             output='{resp[:120]}{'...' if len(resp) > 120 else ''}'"
            if len(train_data) > 5:
                yield f"  ... and {len(train_data) - 5} more examples"
            yield "━━━━━━━━━━━━━━━━━━━━━━━"

            # Define predict_fn that uses the prompt template and calls the model
            # GEPA intercepts mlflow.genai.load_prompt() to swap candidate prompts
            _prompt_uri = prompt_uri  # capture for closure
            _target_model = optimizer_model_name  # use same model as target
            _use_custom_endpoint = bool(target_endpoint)
            _endpoint_name = target_endpoint  # may be endpoint name or URL

            # Parse full invocation URLs to extract the endpoint name.
            # e.g. "https://host/serving-endpoints/my-endpoint/invocations" → "my-endpoint"
            if _endpoint_name and ("://" in _endpoint_name or _endpoint_name.startswith("http")):
                from urllib.parse import urlparse
                parsed = urlparse(_endpoint_name)
                path_parts = [p for p in parsed.path.split("/") if p]
                # Pattern: /serving-endpoints/{name}/invocations
                if "serving-endpoints" in path_parts:
                    idx = path_parts.index("serving-endpoints")
                    if idx + 1 < len(path_parts):
                        _endpoint_name = path_parts[idx + 1]
                        yield f"Parsed endpoint name from URL: {_endpoint_name}"

            # Set up the client for predict_fn based on whether a custom endpoint is used
            _deploy_client = None
            _openai_client = None
            _endpoint_task_type = None  # "llm/v1/chat" or "agents/v1/responses" etc.

            if _use_custom_endpoint:
                yield f"Setting up custom endpoint: {_endpoint_name}"
                try:
                    import mlflow.deployments
                    _deploy_client = mlflow.deployments.get_deploy_client("databricks")
                    yield "MLflow deployments client ready"

                    # Try to detect endpoint task type for logging (not critical —
                    # _query_endpoint_auto handles format detection via retry).
                    # Reference pattern: ep.task is a top-level attribute on the endpoint.
                    try:
                        from databricks.sdk import WorkspaceClient
                        _ws = WorkspaceClient()
                        ep_info = _ws.serving_endpoints.get(_endpoint_name)
                        if ep_info and getattr(ep_info, 'task', None):
                            _endpoint_task_type = str(ep_info.task)
                        yield f"Detected endpoint task type: {_endpoint_task_type or 'unknown (will auto-detect on first call)'}"
                    except Exception as detect_err:
                        yield f"Could not detect endpoint task type ({detect_err}), will auto-detect on first call"
                        _endpoint_task_type = None
                except Exception as client_err:
                    yield f"ERROR: Failed to create deployments client: {client_err}"
                    yield {"error": f"Failed to create deployments client: {client_err}", "success": False,
                           "original_prompt": original_prompt_text}
                    return
            else:
                # Create OpenAI client via Databricks SDK (same pattern as reference notebook)
                yield "Creating Databricks OpenAI client..."
                try:
                    from databricks.sdk import WorkspaceClient
                    _ws_client = WorkspaceClient()
                    _openai_client = _ws_client.serving_endpoints.get_open_ai_client()
                    yield "Databricks OpenAI client ready"
                except Exception as client_err:
                    yield f"ERROR: Failed to create Databricks client: {client_err}"
                    yield {"error": f"Failed to create Databricks client: {client_err}", "success": False,
                           "original_prompt": original_prompt_text}
                    return

            # Progress tracking counters (shared across predict_fn/aggregation_fn calls)
            _predict_call_count = {"n": 0}
            _eval_call_count = {"n": 0, "scores": []}
            _dataset_size = len(train_data)
            _last_prompt_preview = {"text": ""}  # Track prompt changes across candidates

            # Track which request format works for this endpoint.
            # "chat" = {"messages": [...]}, "input" = {"input": [...]}, None = not yet detected
            _detected_format = {"fmt": None}  # mutable for closure

            def _query_with_messages(endpoint: str, messages: list) -> str:
                """Query endpoint using chat/completions format: {"messages": [...]}."""
                response = _deploy_client.predict(
                    endpoint=endpoint,
                    inputs={"messages": messages, "max_tokens": 1024},
                )
                return _extract_response_content(response)

            def _query_with_input(endpoint: str, messages: list) -> str:
                """Query endpoint using agent/responses format: {"input": [...], "context": {}}.

                Matches the reference pattern from model_serving_utils._query_responses_endpoint:
                no max_tokens, includes context dict.
                """
                response = _deploy_client.predict(
                    endpoint=endpoint,
                    inputs={"input": messages, "context": {}},
                )
                return _extract_response_content(response)

            def _extract_response_content(response: dict) -> str:
                """Extract text content from either chat or agent response format."""
                # Chat format: {"choices": [{"message": {"content": "..."}}]}
                choices = response.get("choices", [])
                if choices:
                    msg = choices[0].get("message", {})
                    content = msg.get("content", "")
                    # Content can be a list of structured objects (e.g. [{"type": "text", "text": "..."}])
                    if isinstance(content, list):
                        return "".join(
                            part.get("text", "") for part in content
                            if isinstance(part, dict) and part.get("type") == "text"
                        )
                    return content or ""
                # Agent/Responses format: {"output": [{"type": "message", "content": [{"type": "output_text", "text": "..."}]}]}
                output = response.get("output", [])
                if isinstance(output, list):
                    text_parts = []
                    for item in output:
                        if not isinstance(item, dict):
                            continue
                        # Only extract from message items (skip function_call, function_call_output)
                        if item.get("type") != "message":
                            continue
                        content_parts = item.get("content", [])
                        if isinstance(content_parts, list):
                            for part in content_parts:
                                if isinstance(part, dict) and part.get("type") == "output_text":
                                    text_parts.append(part.get("text", ""))
                        elif isinstance(content_parts, str):
                            text_parts.append(content_parts)
                    if text_parts:
                        return "\n".join(text_parts)
                if isinstance(output, str):
                    return output
                return str(response)

            def _query_endpoint_auto(endpoint: str, messages: list) -> str:
                """Query the endpoint, auto-detecting the correct format.

                On the first call, tries chat format (messages key). If the endpoint
                rejects it with "use 'input' field", retries with input format.
                Caches the detected format for all subsequent calls.
                """
                fmt = _detected_format["fmt"]

                # Already detected — use cached format
                if fmt == "input":
                    return _query_with_input(endpoint, messages)
                if fmt == "chat":
                    return _query_with_messages(endpoint, messages)

                # Not yet detected — try chat first, fall back to input
                try:
                    result = _query_with_messages(endpoint, messages)
                    _detected_format["fmt"] = "chat"
                    return result
                except Exception as e:
                    err_str = str(e).lower()
                    if "'input'" in err_str or "use 'input'" in err_str or "'messages' field is not supported" in err_str:
                        log_handler.emit(logging.LogRecord(
                            name="gepa.predict", level=logging.INFO, pathname="", lineno=0,
                            msg=f"Endpoint requires 'input' format (not 'messages'), switching...",
                            args=(), exc_info=None,
                        ))
                        _detected_format["fmt"] = "input"
                        return _query_with_input(endpoint, messages)
                    raise  # Re-raise if it's a different error

            def predict_fn(request: str) -> str:
                """Predict function that loads the prompt and calls the model.

                Follows the pattern from the reference notebook:
                - load_prompt() + format() triggers GEPA interception
                - System prompt sent as system message, user input as user message
                - Routes to custom endpoint (chat or responses) or Databricks OpenAI client
                """
                import mlflow
                _predict_call_count["n"] += 1
                call_num = _predict_call_count["n"]

                # Load prompt — GEPA intercepts this to substitute candidate prompts
                prompt_version = mlflow.genai.load_prompt(_prompt_uri)
                # Call format() to trigger GEPA interception.
                template = prompt_version.template
                if '{{request}}' in template or '{{ request }}' in template:
                    system_prompt = prompt_version.format(request=request)
                else:
                    system_prompt = prompt_version.format()

                # Log the candidate prompt when it changes (new candidate detected)
                prompt_preview = system_prompt[:200]
                if prompt_preview != _last_prompt_preview["text"]:
                    _last_prompt_preview["text"] = prompt_preview
                    candidate_idx = (call_num - 1) // _dataset_size + 1
                    log_handler.emit(logging.LogRecord(
                        name="gepa.predict", level=logging.INFO, pathname="", lineno=0,
                        msg=f"━━━ Candidate Prompt #{candidate_idx} ({len(system_prompt)} chars) ━━━",
                        args=(), exc_info=None,
                    ))
                    # Log full candidate prompt so user can see what GEPA generated
                    for line in system_prompt.splitlines():
                        log_handler.emit(logging.LogRecord(
                            name="gepa.predict", level=logging.INFO, pathname="", lineno=0,
                            msg=f"  {line}",
                            args=(), exc_info=None,
                        ))

                # Log input and call progress
                example_idx = (call_num - 1) % _dataset_size + 1
                log_handler.emit(logging.LogRecord(
                    name="gepa.predict", level=logging.INFO, pathname="", lineno=0,
                    msg=f"[Predict #{call_num}] Example {example_idx}/{_dataset_size} | Input: '{request[:150]}{'...' if len(request) > 150 else ''}'",
                    args=(), exc_info=None,
                ))

                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": request},
                ]

                if _use_custom_endpoint:
                    result = _query_endpoint_auto(_endpoint_name, messages)
                else:
                    # Default: Databricks OpenAI-compatible client
                    completion = _openai_client.chat.completions.create(
                        model=_target_model,
                        messages=messages,
                        max_tokens=1024,
                    )
                    result = completion.choices[0].message.content

                log_handler.emit(logging.LogRecord(
                    name="gepa.predict", level=logging.INFO, pathname="", lineno=0,
                    msg=f"[Predict #{call_num}] Output: '{result[:150]}{'...' if len(result) > 150 else ''}'",
                    args=(), exc_info=None,
                ))
                return result

            # Define aggregation function to normalize judge scores for GEPA.
            # GEPA expects scores in 0-1 range where 1.0 is perfect.
            # Our judges return Likert (1-5) or Binary (0/1) scores via Feedback objects.
            # When multiple judges are used, each key in `scores` is a different judge —
            # we average across all judges to get a single composite score.
            _num_scorers = len(scorers)

            def _extract_score(feedback) -> Optional[float]:
                """Extract a numeric score from an MLflow Feedback object or direct value."""
                raw = None
                # Handle MLflow Feedback object (feedback.feedback.value)
                if feedback and hasattr(feedback, 'feedback') and hasattr(feedback.feedback, 'value'):
                    try:
                        raw = float(feedback.feedback.value)
                    except (ValueError, TypeError):
                        pass
                # Handle direct numeric value
                if raw is None and feedback is not None:
                    try:
                        raw = float(feedback)
                    except (ValueError, TypeError):
                        pass
                return raw

            def aggregation_fn(scores: dict) -> float:
                """Normalize judge Feedback scores to 0-1 for GEPA.

                When multiple scorers are present, averages across all of them.
                """
                raw_scores = []
                normalized_scores = []

                for key, feedback in scores.items():
                    raw = _extract_score(feedback)
                    if raw is not None:
                        raw_scores.append(raw)
                        # Normalize: Likert 1-5 → /5.0, Binary 0/1 → /1.0
                        if raw <= 1.0:
                            normalized_scores.append(raw)  # Binary: already 0-1
                        elif raw <= 5.0:
                            normalized_scores.append(raw / 5.0)  # Likert 1-5
                        else:
                            normalized_scores.append(raw / 100.0)  # Percentage

                if normalized_scores:
                    composite = sum(normalized_scores) / len(normalized_scores)
                    avg_raw = sum(raw_scores) / len(raw_scores)
                else:
                    composite = 0.6  # Default to middle score
                    avg_raw = 3.0

                # Track scores per candidate and report progress
                _eval_call_count["n"] += 1
                _eval_call_count["scores"].append(avg_raw)

                # When we've evaluated all examples for one candidate, report summary
                if len(_eval_call_count["scores"]) >= _dataset_size:
                    avg = sum(_eval_call_count["scores"]) / len(_eval_call_count["scores"])
                    candidate_num = _eval_call_count["n"] // _dataset_size
                    judges_info = f" (avg across {_num_scorers} judges)" if _num_scorers > 1 else ""
                    log_handler.emit(logging.LogRecord(
                        name="gepa.eval", level=logging.INFO, pathname="", lineno=0,
                        msg=f"Candidate #{candidate_num} evaluated — avg score: {avg:.2f}{judges_info} (normalized: {composite:.3f})",
                        args=(), exc_info=None,
                    ))
                    _eval_call_count["scores"] = []  # Reset for next candidate

                return composite

            # Run optimization in background thread so we can yield logs
            result_container: Dict[str, Any] = {}
            optimization_error: Optional[Exception] = None
            last_status_emit = time.time()

            # stdout/stderr capture already installed above (before GEPA import)

            def _optimization_worker():
                nonlocal optimization_error
                try:
                    optimized = mlflow.genai.optimize_prompts(
                        predict_fn=predict_fn,
                        train_data=train_data,
                        prompt_uris=[_prompt_uri],
                        optimizer=optimizer,
                        scorers=scorers,
                        aggregation=aggregation_fn,
                    )
                    result_container["result"] = optimized
                except Exception as exc:
                    optimization_error = exc
                    logger.exception("GEPA optimization failed: %s", exc)

            # Drain any stdout captured during setup (import noise from DSPy, etc.)
            for _setup_msg in stdout_capture.get_new_messages():
                pass  # Discard import-time prints
            for _setup_msg in stderr_capture.get_new_messages():
                pass

            worker = threading.Thread(target=_optimization_worker, daemon=True)
            worker.start()
            yield "GEPA optimization in progress..."

            try:
                while worker.is_alive():
                    # Drain captured GEPA logs (Python logging)
                    new_logs = log_handler.get_new_messages()
                    # Drain captured stdout/stderr (DSPy print statements)
                    stdout_lines = stdout_capture.get_new_messages()
                    stderr_lines = stderr_capture.get_new_messages()
                    all_new = new_logs + stdout_lines + stderr_lines

                    if all_new:
                        last_status_emit = time.time()
                        for log_message in all_new:
                            yield log_message

                    # Yield heartbeat if no activity
                    if not all_new and time.time() - last_status_emit >= 5:
                        yield "GEPA still optimizing..."
                        last_status_emit = time.time()

                    worker.join(timeout=0.5)

                # Drain remaining logs from all sources
                for log_message in log_handler.get_new_messages():
                    yield log_message
                for log_message in stdout_capture.get_new_messages():
                    yield log_message
                for log_message in stderr_capture.get_new_messages():
                    yield log_message
            finally:
                # Always restore stdout/stderr
                sys.stdout = _original_stdout
                sys.stderr = _original_stderr
                for lg in target_loggers:
                    try:
                        lg.removeHandler(log_handler)
                    except Exception:
                        pass

            if optimization_error:
                error_msg = f"GEPA optimization failed: {optimization_error}"
                yield f"ERROR: {error_msg}"
                yield {"error": error_msg, "success": False,
                       "original_prompt": original_prompt_text}
                return

            optimized_result = result_container.get("result")
            if not optimized_result:
                yield "ERROR: Optimization returned no result"
                yield {"error": "Optimization returned no result", "success": False,
                       "original_prompt": original_prompt_text}
                return

            # Extract optimized prompt from PromptOptimizationResult.
            # optimize_prompts() returns PromptOptimizationResult with:
            #   optimized_prompts: list[PromptVersion]  (one per input prompt_uri)
            #   initial_eval_score / final_eval_score: float
            # Each PromptVersion has .template, .name, .version, .uri
            # GEPA registers the optimized prompt itself, so PromptVersion
            # already has a .uri and .version we can use directly.

            # Diagnostic logging — helps debug unexpected result structures
            yield f"Result type: {type(optimized_result).__name__}"
            yield f"Result attrs: {[a for a in dir(optimized_result) if not a.startswith('_')]}"

            optimized_prompts = getattr(optimized_result, 'optimized_prompts', None)
            optimized_prompt_text = None
            optimized_version = None
            optimized_prompt_name = None
            optimized_uri = None

            if optimized_prompts and len(optimized_prompts) > 0:
                first_prompt = optimized_prompts[0]
                yield f"PromptVersion type: {type(first_prompt).__name__}"
                yield f"PromptVersion attrs: {[a for a in dir(first_prompt) if not a.startswith('_')]}"

                # Extract template — may be str or list[dict] (chat messages format)
                raw_template = getattr(first_prompt, 'template', None)
                if isinstance(raw_template, str) and len(raw_template) > 10:
                    optimized_prompt_text = raw_template
                elif isinstance(raw_template, list):
                    # Chat messages format: [{"role": "system", "content": "..."}]
                    # Combine all content fields
                    parts = []
                    for msg in raw_template:
                        if isinstance(msg, dict) and msg.get("content"):
                            parts.append(msg["content"])
                    optimized_prompt_text = "\n\n".join(parts) if parts else str(raw_template)
                    yield f"Extracted prompt from chat messages format ({len(raw_template)} messages)"

                # Use GEPA-registered version/URI if available (GEPA registers it during optimization)
                pv_uri = getattr(first_prompt, 'uri', None)
                pv_version = getattr(first_prompt, 'version', None)
                pv_name = getattr(first_prompt, 'name', None)
                if pv_uri:
                    optimized_uri = pv_uri
                    optimized_version = pv_version
                    optimized_prompt_name = pv_name
                    yield f"GEPA registered prompt: {pv_uri} (v{pv_version})"

                # If template extraction failed, try loading from the registered version
                if not optimized_prompt_text and pv_uri:
                    try:
                        loaded = mlflow.genai.load_prompt(pv_uri)
                        raw_template = loaded.template
                        if isinstance(raw_template, str) and len(raw_template) > 20:
                            optimized_prompt_text = raw_template
                        elif isinstance(raw_template, list):
                            parts = [m["content"] for m in raw_template if isinstance(m, dict) and m.get("content")]
                            optimized_prompt_text = "\n\n".join(parts) if parts else None
                        yield f"Loaded optimized prompt from registered URI ({len(optimized_prompt_text or '')} chars)"
                    except Exception as load_err:
                        yield f"WARNING: Could not load optimized prompt from {pv_uri}: {load_err}"

                # If GEPA returned the same (or shorter) prompt as the original,
                # it means no improvement was found — fall back to original.
                if not optimized_prompt_text or len(optimized_prompt_text) < 20:
                    optimized_prompt_text = original_prompt_text
                    yield f"NOTE: GEPA did not find a better prompt — using original ({len(optimized_prompt_text)} chars)"
            else:
                # Fallback for older MLflow versions
                optimized_prompt_text = getattr(optimized_result, 'template', str(optimized_result))
                yield f"WARNING: No optimized_prompts list — using fallback ({len(optimized_prompt_text)} chars)"

            yield "Optimization complete!"
            yield f"Optimized prompt ({len(optimized_prompt_text)} chars)"

            # Log optimization scores if available
            initial_score = getattr(optimized_result, 'initial_eval_score', None)
            final_score = getattr(optimized_result, 'final_eval_score', None)
            if initial_score is not None and final_score is not None:
                yield f"Score improvement: {initial_score:.3f} → {final_score:.3f}"

            # Register optimized prompt as new version if GEPA didn't already.
            # GEPA usually registers it (optimized_uri will be set above).
            # If not, register manually as the next version of the same prompt.
            if not optimized_uri:
                yield "Registering optimized prompt as next version in UC..."
                try:
                    base_prompt_name = prompt_uri.split(":/")[1].split("/")[0] if ":/" in prompt_uri else prompt_uri
                    optimized_prompt_name = base_prompt_name
                    registered = mlflow.genai.register_prompt(
                        name=optimized_prompt_name,
                        template=optimized_prompt_text,
                    )
                    optimized_version = getattr(registered, 'version', None)
                    optimized_uri = f"prompts:/{optimized_prompt_name}/{optimized_version}"
                    yield f"Registered optimized prompt: {optimized_prompt_name} (version {optimized_version})"
                except Exception as reg_err:
                    yield f"WARNING: Could not register optimized prompt: {reg_err}"
            else:
                yield f"Optimized prompt already registered by GEPA: {optimized_uri}"

            # Set champion alias on the optimized version
            if optimized_prompt_name and optimized_version:
                try:
                    mlflow.genai.set_prompt_alias(
                        name=optimized_prompt_name,
                        alias="champion",
                        version=optimized_version,
                    )
                    yield f"Set alias 'champion' on version {optimized_version}"
                except Exception as alias_err:
                    yield f"WARNING: Could not set alias: {alias_err}"

            metrics = {
                "original_length": len(original_prompt_text),
                "optimized_length": len(optimized_prompt_text),
                "num_iterations": num_iterations,
                "num_candidates": num_candidates,
                "train_data_size": len(train_data),
            }

            final_result = {
                "success": True,
                "original_prompt": original_prompt_text,
                "optimized_prompt": optimized_prompt_text,
                "prompt_uri": prompt_uri,
                "optimized_uri": optimized_uri,
                "optimized_prompt_name": optimized_prompt_name,
                "optimized_version": optimized_version,
                "optimizer_model": optimizer_model_name,
                "target_endpoint": target_endpoint,
                "metrics": metrics,
            }

            # Log the full optimized prompt so it appears in the running log panel
            yield "━━━ Final Optimized Prompt ━━━"
            for line in optimized_prompt_text.splitlines():
                yield f"  {line}"
            yield f"━━━ End Optimized Prompt ({len(optimized_prompt_text)} chars) ━━━"
            if optimized_uri:
                yield f"Optimized prompt URI: {optimized_uri}"
            yield final_result

        except Exception as e:
            # Restore stdout/stderr if they were replaced (safety net)
            sys.stdout = _original_stdout_ref
            sys.stderr = _original_stderr_ref
            error_msg = f"Prompt optimization failed: {e}"
            logger.exception(error_msg)
            yield f"ERROR: {error_msg}"
            error_result: Dict[str, Any] = {"error": error_msg, "success": False}
            # Include original_prompt if it was loaded before the failure
            if original_prompt_text:
                error_result["original_prompt"] = original_prompt_text
            yield error_result

    def _build_train_data(
        self, workshop_id: str, mlflow_config: Any
    ) -> List[Dict[str, Any]]:
        """Build training dataset from human-annotated traces.

        Returns a list of dicts with 'request', 'response', and 'expected_facts'
        suitable for GEPA optimization.
        """
        import mlflow

        # Get traces tagged for alignment (these have human annotations)
        filter_string = f"tags.label = 'align' AND tags.workshop_id = '{workshop_id}'"
        traces = mlflow.search_traces(
            experiment_ids=[mlflow_config.experiment_id],
            filter_string=filter_string,
            return_type="list",
        )

        if not traces:
            # Fall back to eval-tagged traces
            filter_string = f"tags.label = 'eval' AND tags.workshop_id = '{workshop_id}'"
            traces = mlflow.search_traces(
                experiment_ids=[mlflow_config.experiment_id],
                filter_string=filter_string,
                return_type="list",
            )

        # Also get annotations for ground truth
        annotations = self.db_service.get_annotations(workshop_id)
        annotation_map = {}
        for ann in annotations:
            if ann.trace_id not in annotation_map:
                annotation_map[ann.trace_id] = []
            annotation_map[ann.trace_id].append(ann)

        train_data = []
        for trace in traces:
            trace_info = trace.info if hasattr(trace, 'info') else trace
            trace_id = getattr(trace_info, 'request_id', None) or getattr(trace_info, 'trace_id', None)

            # Extract request/response from trace.
            # trace.data.request can be a raw JSON string like:
            #   '{"messages": [{"role": "system", ...}, {"role": "user", "content": "actual question"}]}'
            # We need to extract just the user message content for clean training data.
            request_text = ""
            response_text = ""
            try:
                trace_data = trace.data if hasattr(trace, 'data') else trace
                if hasattr(trace_data, 'request'):
                    raw_request = trace_data.request
                    request_text = self._extract_user_message(raw_request)
                if hasattr(trace_data, 'response'):
                    raw_response = trace_data.response
                    response_text = self._extract_response_text(raw_response)
            except Exception:
                continue

            if not request_text:
                continue

            # Build expected_facts from human annotations
            expected_facts = []
            workshop_traces = self.db_service.get_traces(workshop_id)
            for wt in workshop_traces:
                if wt.mlflow_trace_id == trace_id and wt.id in annotation_map:
                    for ann in annotation_map[wt.id]:
                        if ann.comment:
                            expected_facts.append(ann.comment)
                    break

            train_data.append({
                "inputs": {"request": request_text},
                "outputs": response_text,
            })

        return train_data

    @staticmethod
    def _extract_user_message(raw_request) -> str:
        """Extract clean user message text from a trace request.

        Handles multiple formats:
        1. Plain string → return as-is
        2. JSON string with messages array → extract last user role content
        3. JSON string with input array → extract last user role content
        4. Dict with messages/input → extract last user role content
        """
        import json

        # If already a plain string that doesn't look like JSON, return as-is
        if isinstance(raw_request, str):
            stripped = raw_request.strip()
            if not (stripped.startswith('{') or stripped.startswith('[')):
                return stripped
            # Try to parse as JSON
            try:
                raw_request = json.loads(stripped)
            except (json.JSONDecodeError, ValueError):
                return stripped

        if isinstance(raw_request, dict):
            # Look for messages or input arrays
            messages = raw_request.get("messages") or raw_request.get("input") or []
            if isinstance(messages, list):
                # Find the last user message
                for msg in reversed(messages):
                    if isinstance(msg, dict) and msg.get("role") == "user":
                        content = msg.get("content", "")
                        if isinstance(content, str):
                            return content
                        # Content can be a list of parts
                        if isinstance(content, list):
                            return " ".join(
                                p.get("text", "") for p in content
                                if isinstance(p, dict) and p.get("text")
                            )
            # Fallback: check for a top-level "query" or "question" key
            for key in ("query", "question", "prompt", "text", "input"):
                if key in raw_request and isinstance(raw_request[key], str):
                    return raw_request[key]

        return str(raw_request)

    @staticmethod
    def _extract_response_text(raw_response) -> str:
        """Extract clean response text from a trace response.

        Handles multiple formats:
        1. Plain string → return as-is
        2. JSON/dict with choices (chat format) → extract assistant content
        3. JSON/dict with output (agent format) → extract output_text
        """
        import json

        if isinstance(raw_response, str):
            stripped = raw_response.strip()
            if not (stripped.startswith('{') or stripped.startswith('[')):
                return stripped
            try:
                raw_response = json.loads(stripped)
            except (json.JSONDecodeError, ValueError):
                return stripped

        if isinstance(raw_response, dict):
            # Chat format: {"choices": [{"message": {"content": "..."}}]}
            choices = raw_response.get("choices", [])
            if choices and isinstance(choices, list):
                msg = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
                content = msg.get("content", "")
                if isinstance(content, str) and content:
                    return content

            # Agent format: {"output": [{"type": "message", "content": [{"type": "output_text", "text": "..."}]}]}
            output = raw_response.get("output", [])
            if isinstance(output, list):
                texts = []
                for item in output:
                    if isinstance(item, dict) and item.get("type") == "message":
                        content_parts = item.get("content", [])
                        if isinstance(content_parts, list):
                            for part in content_parts:
                                if isinstance(part, dict) and part.get("type") == "output_text":
                                    texts.append(part.get("text", ""))
                        elif isinstance(content_parts, str):
                            texts.append(content_parts)
                if texts:
                    return "\n".join(texts)
            if isinstance(output, str):
                return output

        return str(raw_response)
