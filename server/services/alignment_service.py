"""Service for judge alignment using MLflow and LikertSIMBAAlignmentOptimizer."""

import logging
import math
import os
import threading
import time
from collections import Counter
from statistics import mean
from typing import Any, Callable, Dict, Generator, List, Optional

from sklearn.metrics import accuracy_score, cohen_kappa_score, confusion_matrix

import pandas as pd

from server.services.database_service import DatabaseService

# Configure logging
logger = logging.getLogger(__name__)

# Likert scale configuration (hardcoded per user requirements)
LIKERT_MIN = 1
LIKERT_MAX = 5


def _to_float_maybe(x: Any) -> Optional[float]:
    """Convert a value to float if possible, otherwise return None."""
    try:
        return float(x)
    except Exception:
        return None


def likert_agreement_metric(example: Any, prediction: Any) -> float:
    """
    Likert agreement metric:
        score = 1 - |llm - human| / (LIKERT_MAX - LIKERT_MIN)

    Reads from:
      - Human label: example._store["result"]
      - LLM/judge score: prediction._store["result"]
    """
    metric_logger = logging.getLogger("dspy.teleprompt.simba")

    human = None
    llm = None

    # Primary: read from example._store / prediction._store
    ex_store = getattr(example, "_store", None)
    if isinstance(ex_store, dict) and "result" in ex_store:
        human = _to_float_maybe(ex_store["result"])

    pred_store = getattr(prediction, "_store", None)
    if isinstance(pred_store, dict) and "result" in pred_store:
        llm = _to_float_maybe(pred_store["result"])

    # Fallbacks
    if human is None:
        for key in ("human_score", "human_value", "label", "target", "score", "y"):
            if hasattr(example, key):
                human = _to_float_maybe(getattr(example, key))
                if human is not None:
                    break
            if isinstance(example, dict) and key in example:
                human = _to_float_maybe(example[key])
                if human is not None:
                    break

    if llm is None:
        if isinstance(prediction, dict):
            for k in ("llm_score", "value", "score", "rating", "label", "y_hat"):
                if k in prediction:
                    llm = _to_float_maybe(prediction[k])
                    if llm is not None:
                        break
        if llm is None:
            llm = _to_float_maybe(prediction)

    if human is None or llm is None:
        metric_logger.info(
            "LIKERT: missing scores (human=%r, llm=%r) -> 0.0",
            human,
            llm,
        )
        return 0.0

    # Clamp to configured Likert range
    human = max(LIKERT_MIN, min(LIKERT_MAX, human))
    llm = max(LIKERT_MIN, min(LIKERT_MAX, llm))

    score = max(0.0, 1.0 - abs(llm - human) / (LIKERT_MAX - LIKERT_MIN))
    return score


class LikertSIMBAAlignmentOptimizer:
    """Unified optimizer: injects Likert metric, batch size, max_demos, and optional verbose logging.

    Uses configuration parameters from the config cell above.
    """

    def __init__(
        self,
        model: str,
        batch_size: int = 6,
        max_demos: int = 0,
        metric_fn: Optional[Callable[[Any, Any], float]] = None,
        verbose: bool = False,
    ):
        self.model = model
        self.batch_size = batch_size
        self.max_demos = max_demos
        self.metric_fn = metric_fn
        self.verbose = verbose

    # ---- Internal helpers for verbose logging ----
    class _BatchScoreAggregator:
        def __init__(self):
            self.all_batches: List[List[float]] = []
            self.current: List[float] = []
            self.batch_idx: int = 0

        def start_batch(self):
            if self.current:
                self._log_current_summary()
                self.all_batches.append(self.current)
            self.current = []
            self.batch_idx += 1

        def add(self, score: float):
            if isinstance(score, (int, float)):
                self.current.append(float(score))

        def end(self):
            if self.current:
                self._log_current_summary()
                self.all_batches.append(self.current)
                self.current = []
            all_flat = [s for batch in self.all_batches for s in batch]
            if all_flat:
                best = max(all_flat)
                batches_n = len(self.all_batches)
                logging.getLogger("dspy.teleprompt.simba").info(
                    "Scores after %d batches: %s, Best: %s",
                    batches_n,
                    [round(mean(b), 3) if b else 0.0 for b in self.all_batches],
                    round(best, 3),
                )

        def _log_current_summary(self):
            lg = logging.getLogger("dspy.teleprompt.simba")
            if not self.current:
                return
            mx = max(self.current)
            mn = min(self.current)
            avg = mean(self.current)
            lg.info(
                "Processing bucket #%d, with max score %s, max-to-min gap %s, and max-to-avg gap %s.",
                self.batch_idx if self.batch_idx else 1,
                round(mx, 3),
                round(mx - mn, 3),
                round(mx - avg, 3),
            )

    class _SIMBABatchLogHandler(logging.Handler):
        def __init__(self, aggregator: "LikertSIMBAAlignmentOptimizer._BatchScoreAggregator"):
            super().__init__()
            self.aggregator = aggregator

        def emit(self, record: logging.LogRecord):
            msg = record.getMessage()
            if "Starting batch" in msg and "of" in msg:
                self.aggregator.start_batch()

    def _wrap_metric_for_logging(self, metric_fn: Callable[[Any, Any], float]):
        aggregator = self._BatchScoreAggregator()

        def logged_metric(example, prediction):  
            score = metric_fn(example, prediction)
            aggregator.add(score)
            return score

        batch_handler = self._SIMBABatchLogHandler(aggregator)
        simba_logger = logging.getLogger("dspy.teleprompt.simba")
        simba_utils_logger = logging.getLogger("dspy.teleprompt.simba_utils")
        simba_logger.setLevel(logging.INFO)
        simba_utils_logger.setLevel(logging.INFO)
        if all(not isinstance(h, LikertSIMBAAlignmentOptimizer._SIMBABatchLogHandler) for h in simba_logger.handlers):
            simba_logger.addHandler(batch_handler)
        return logged_metric, aggregator, simba_logger, batch_handler

    def align(self, judge: Any, traces: list) -> Any:
        """Run alignment on the given judge with the provided traces."""
        try:
            import dspy.teleprompt.simba as dsimba
            from mlflow.genai.judges.optimizers import SIMBAAlignmentOptimizer as _BaseSIMBA
        except ImportError as e:
            raise ImportError(
                f"Required packages not available: {e}. "
                "Make sure mlflow[genai] and dspy are installed."
            )

        # Choose metric function
        metric_fn = self.metric_fn if self.metric_fn is not None else likert_agreement_metric
        logging.getLogger("dspy.teleprompt.simba").info(
            "Using SIMBA metric_fn=%s",
            getattr(metric_fn, "__name__", repr(metric_fn)),
        )
        
        # Optionally wrap metric for verbose logging
        aggregator = None
        simba_logger = None
        batch_handler = None
        if self.verbose:
            metric_fn, aggregator, simba_logger, batch_handler = self._wrap_metric_for_logging(metric_fn)

        # Patch DSPy SIMBA init to inject our parameters
        original_init = dsimba.SIMBA.__init__
        batch_size = self.batch_size
        max_demos = self.max_demos

        def patched_init(self_, *args, **kwargs): 
            # Force our settings
            logging.getLogger("dspy.teleprompt.simba").info(
                "Patched SIMBA.__init__: forcing metric_fn=%s, bsize=%s, max_demos=%s",
                getattr(metric_fn, "__name__", repr(metric_fn)),
                batch_size,
                max_demos,
            )

            kwargs["metric"] = metric_fn
            kwargs["bsize"] = batch_size
            kwargs["max_demos"] = max_demos

            return original_init(self_, *args, **kwargs)

        dsimba.SIMBA.__init__ = patched_init
        try:
            base = _BaseSIMBA(model=self.model)
            result = base.align(judge=judge, traces=traces)
        finally:
            dsimba.SIMBA.__init__ = original_init
            if aggregator is not None:
                aggregator.end()
            if simba_logger is not None and batch_handler is not None:
                try:
                    simba_logger.removeHandler(batch_handler)
                except Exception:
                    pass
        return result


class AlignmentService:
    """Service for running judge alignment with MLflow."""

    def __init__(self, db_service: DatabaseService):
        self.db_service = db_service

    @staticmethod
    def _normalize_judge_prompt(judge_prompt: str) -> str:
        """Ensure judge prompts use MLflow-compatible placeholders."""
        if not judge_prompt:
            return judge_prompt
        normalized = judge_prompt
        # Convert legacy single-brace placeholders to double-brace templates required by mlflow
        normalized = normalized.replace('{{ inputs }}', '{inputs}')
        normalized = normalized.replace('{{ outputs }}', '{outputs}')
        normalized = normalized.replace('{input}', '{inputs}')
        normalized = normalized.replace('{output}', '{outputs}')
        # Now ensure final form uses double braces
        normalized = normalized.replace('{inputs}', '{{ inputs }}')
        normalized = normalized.replace('{outputs}', '{{ outputs }}')
        return normalized

    def _search_tagged_traces(
        self,
        mlflow_config: Any,
        workshop_id: str,
        return_type: str = "pandas",
    ):
        """Fetch traces labeled for this workshop via mlflow.search_traces."""
        import mlflow

        filter_parts = [
            "tags.label = 'jbws'",
            f"tags.workshop_id = '{workshop_id}'",
        ]
        filter_string = " AND ".join(filter_parts)

        return mlflow.search_traces(
            experiment_ids=[mlflow_config.experiment_id],
            filter_string=filter_string,
            return_type=return_type,
        )

    def prepare_alignment_data(
        self, 
        workshop_id: str, 
        judge_name: str
    ) -> Dict[str, Any]:
        """Prepare traces with human feedback for alignment.
        
        Returns a dict with:
        - traces: List of traces formatted for MLflow
        - human_feedback: Dict mapping trace_id to feedback data
        - trace_count: Number of traces prepared
        """
        # Get traces marked for alignment
        traces = self.db_service.get_traces_for_alignment(workshop_id)
        
        # Get all annotations
        annotations = self.db_service.get_annotations(workshop_id)
        
        # Group annotations by trace and calculate mode rating + aggregate feedback
        trace_data = []
        missing_mlflow_ids = 0
        for trace in traces:
            trace_annotations = [a for a in annotations if a.trace_id == trace.id]
            
            if not trace_annotations:
                continue
            if not trace.mlflow_trace_id:
                missing_mlflow_ids += 1
                continue
            
            # Calculate mode (most common rating) as ground truth
            ratings = [a.rating for a in trace_annotations]
            rating_counts = Counter(ratings)
            mode_rating = rating_counts.most_common(1)[0][0]
            
            # Aggregate feedback from all annotations
            feedback_parts = []
            for ann in trace_annotations:
                if ann.comment and ann.comment.strip():
                    feedback_parts.append(ann.comment.strip())
            
            aggregated_feedback = "\n".join(feedback_parts) if feedback_parts else None
            
            trace_data.append({
                'trace_id': trace.mlflow_trace_id,
                'workshop_id': trace.id,
                'human_rating': mode_rating,
                'sme_feedback': aggregated_feedback,
            })
        
        if missing_mlflow_ids:
            logger.warning(
                "prepare_alignment_data: skipped %s traces without mlflow_trace_id",
                missing_mlflow_ids,
            )

        return {
            'traces': trace_data,
            'judge_name': judge_name,
            'trace_count': len(trace_data),
        }

    @staticmethod
    def _calculate_eval_metrics(evaluations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Compute Cohen's κ, accuracy, and related stats for evaluation results."""
        valid_pairs = [
            (e.get('human_rating'), e.get('predicted_rating'))
            for e in evaluations
            if isinstance(e.get('human_rating'), (int, float)) and isinstance(e.get('predicted_rating'), (int, float))
        ]
        total = len(valid_pairs)
        default_matrix = [[0] * 5 for _ in range(5)]
        default_agreement = {str(r): 0.0 for r in range(1, 6)}

        if total == 0:
            return {
                'correlation': 0.0,
                'accuracy': 0.0,
                'mean_absolute_error': 0.0,
                'agreement_by_rating': default_agreement,
                'confusion_matrix': default_matrix,
                'total_evaluations': 0,
            }

        humans = [int(h) for h, _ in valid_pairs]
        preds = [int(round(p)) for _, p in valid_pairs]

        matches = sum(1 for h, p in zip(humans, preds) if h == p)
        simple_agreement = matches / total if total else 0.0

        try:
            kappa = cohen_kappa_score(humans, preds)
        except Exception:
            kappa = simple_agreement
        if math.isnan(kappa):
            kappa = simple_agreement

        try:
            accuracy = accuracy_score(humans, preds)
        except Exception:
            accuracy = simple_agreement

        mean_abs_error = sum(abs(h - p) for h, p in zip(humans, preds)) / total if total else 0.0

        agreement_by_rating: Dict[str, float] = {}
        for rating in range(1, 6):
            rating_preds = [p for h, p in zip(humans, preds) if h == rating]
            if rating_preds:
                rating_matches = sum(1 for p in rating_preds if p == rating)
                agreement_by_rating[str(rating)] = rating_matches / len(rating_preds)
            else:
                agreement_by_rating[str(rating)] = 0.0

        try:
            cm = confusion_matrix(humans, preds, labels=[1, 2, 3, 4, 5]).tolist()
        except Exception:
            cm = default_matrix

        logger.info(
            "Computed evaluation metrics: kappa=%.3f accuracy=%.3f (n=%d)",
            kappa,
            accuracy,
            total,
        )

        return {
            'correlation': float(kappa),
            'accuracy': float(accuracy),
            'mean_absolute_error': float(mean_abs_error),
            'agreement_by_rating': agreement_by_rating,
            'confusion_matrix': cm,
            'total_evaluations': total,
        }

    def run_evaluation_with_answer_sheet(
        self,
        workshop_id: str,
        judge_name: str,
        judge_prompt: str,
        evaluation_model_name: str,
        mlflow_config: Any,
    ) -> Generator[str, None, Dict[str, Any]]:
        """Run evaluation using mlflow.genai.evaluate() with answer sheet approach.
        
        This generator yields log messages and finally returns the evaluation results.
        
        Critical: The judge_name must match for both human feedback and LLM evaluation
        so that align() can properly correlate them.
        """
        # Stream connection is established by router's immediate "Establishing Connection" message
        logger.info("Evaluation generator started for judge '%s'", judge_name)
        
        try:
            import mlflow
            from mlflow.genai import evaluate
        except ImportError as e:
            yield f"ERROR: Required package not available: {e}"
            yield {"error": str(e), "success": False}
        
        yield f"Starting evaluation for judge: {judge_name}"
        
        # Set up MLflow environment based on available credentials
        os.environ['DATABRICKS_HOST'] = mlflow_config.databricks_host.rstrip('/')
        has_oauth = bool(os.environ.get('DATABRICKS_CLIENT_ID') and os.environ.get('DATABRICKS_CLIENT_SECRET'))
        if has_oauth:
            os.environ.pop('DATABRICKS_TOKEN', None)
        else:
            os.environ['DATABRICKS_TOKEN'] = mlflow_config.databricks_token
            os.environ.pop('DATABRICKS_CLIENT_ID', None)
            os.environ.pop('DATABRICKS_CLIENT_SECRET', None)
        # Set tracking URI
        mlflow.set_tracking_uri('databricks')
        
        # Prepare the evaluation data
        alignment_data = self.prepare_alignment_data(workshop_id, judge_name)
        traces_for_eval = alignment_data['traces']
        
        if not traces_for_eval:
            yield "ERROR: No traces available for evaluation"
            yield {"error": "No traces available for evaluation", "success": False}
        
        human_feedback_map: Dict[str, Dict[str, Any]] = {}
        for trace in traces_for_eval:
            trace_id = str(trace['trace_id']).strip()
            human_rating = trace.get('human_rating')
            if trace_id and human_rating is not None:
                human_feedback_map[trace_id] = trace
        
        if not human_feedback_map:
            yield "ERROR: Annotated traces are missing human ratings"
            yield {"error": "Annotated traces missing ratings", "success": False}
        
        try:
            trace_df = self._search_tagged_traces(mlflow_config, workshop_id, return_type="pandas")
        except Exception as exc:
            yield f"ERROR: Failed to query MLflow traces: {exc}"
            yield {"error": f"Failed to query MLflow traces: {exc}", "success": False}
        
        if trace_df is None or trace_df.empty:
            yield "ERROR: No MLflow traces found with label 'jbws'"
            yield {"error": "No tagged MLflow traces found", "success": False}
        
        if 'trace_id' not in trace_df.columns:
            yield "ERROR: MLflow traces result is missing 'trace_id'"
            yield {"error": "search_traces missing trace_id", "success": False}
        
        trace_df = trace_df.copy()
        trace_df['trace_id'] = trace_df['trace_id'].astype(str).str.strip()
        
        filtered_df = trace_df[trace_df['trace_id'].isin(human_feedback_map.keys())]
        if filtered_df.empty:
            yield "ERROR: MLflow trace_ids do not match annotated traces"
            yield {"error": "No overlap between MLflow traces and annotations", "success": False}
        
        trace_ids_for_eval = filtered_df['trace_id'].tolist()
        yield f"Prepared {len(trace_ids_for_eval)} traces for evaluation"
        
        missing_ids = sorted(set(human_feedback_map.keys()) - set(trace_ids_for_eval))
        if missing_ids:
            preview = missing_ids[:5]
            suffix = "..." if len(missing_ids) > 5 else ""
            yield (
                f"WARNING: {len(missing_ids)} annotated traces lacked MLflow tags and were skipped "
                f"(sample: {preview}{suffix})"
            )
        
        eval_df = filtered_df
        yield f"search_traces returned {len(trace_df)} tagged rows; evaluating {len(eval_df)} traces"
        
        experiment_id = mlflow_config.experiment_id
        if not experiment_id:
            error_msg = "MLflow experiment ID is not configured. Please set it in the Intake phase."
            yield f"ERROR: {error_msg}"
            yield {"error": error_msg, "success": False}
            return
        try:
            mlflow.set_experiment(experiment_id=experiment_id)
            yield f"Using MLflow experiment ID: {experiment_id}"
        except Exception as e:
            error_msg = f"Failed to set experiment {experiment_id}: {e}"
            yield f"ERROR: {error_msg}"
            yield {"error": error_msg, "success": False}
            return
        
        yield f"Created evaluation DataFrame with {len(eval_df)} rows via search_traces"
        
        # Determine model URI for evaluation judge
        if evaluation_model_name.startswith('databricks-'):
            model_uri = f'databricks:/{evaluation_model_name}'
        elif evaluation_model_name.startswith('openai-'):
            model_uri = f'openai:/{evaluation_model_name.replace("openai-", "")}'
        else:
            model_uri = f'databricks:/{evaluation_model_name}'
        
        yield f"Using evaluation model: {model_uri}"
        
        try:
            # Create the judge using mlflow.genai.judges.make_judge
            from mlflow.genai.judges import make_judge
            
            # The prompt template with placeholders for judge instructions
            mlflow_prompt_template = self._normalize_judge_prompt(judge_prompt)
            
            # Create judge with the judge name - this name is critical for alignment
            # The judge can be used as a scorer in evaluate()
            judge = make_judge(
                name=judge_name,  # Critical: must match for alignment
                instructions=mlflow_prompt_template,
                feedback_value_type=float,
                model=model_uri,
            )
            
            yield f"Created judge: {judge_name}"
            
            # Run evaluation using the judge as a scorer
            yield "Running mlflow.genai.evaluate()..."
            
            results = evaluate(
                data=eval_df,
                scorers=[judge],  # Judge can be used as scorer
            )
            
            yield f"Evaluation complete. Processing results..."
            
            result_df = results.result_df
            judge_value_col = None
            evaluations = []
            
            if result_df is not None:
                columns_list = list(result_df.columns)
                # Look for the judge's value column: {judge_name}/value
                expected_value_col = f"{judge_name}/value"
                
                if expected_value_col in result_df.columns:
                    judge_value_col = expected_value_col
                
                yield f"Looking for column '{expected_value_col}': {'found' if judge_value_col else 'NOT FOUND'}"
                
                if judge_value_col:
                    null_prediction_rows = 0
                    rows_without_trace_id = 0
                    skipped_unknown_traces = 0
                    
                    for idx, (_, row) in enumerate(result_df.iterrows()):
                        raw_trace_id = row.get('trace_id')
                        if raw_trace_id is None:
                            rows_without_trace_id += 1
                            continue
                        
                        trace_id = str(raw_trace_id).strip()
                        trace_data = human_feedback_map.get(trace_id)
                        if trace_data is None:
                            skipped_unknown_traces += 1
                            continue
                        workshop_uuid = trace_data.get('workshop_id')
                        
                        predicted_value = row.get(judge_value_col)
                        predicted_rating = None
                        if predicted_value is not None and not pd.isna(predicted_value):
                            try:
                                predicted_rating = float(predicted_value)
                            except (ValueError, TypeError) as e:
                                yield f"WARNING: Could not convert '{predicted_value}' to float for trace {trace_id}: {e}"
                        else:
                            null_prediction_rows += 1
                        
                        evaluations.append({
                            'trace_id': trace_id,
                            'workshop_uuid': workshop_uuid,
                            'predicted_rating': predicted_rating,
                            'human_rating': trace_data.get('human_rating'),
                            'reasoning': None,
                        })
                    
                    if rows_without_trace_id:
                        yield f"WARNING: {rows_without_trace_id} result rows were missing trace_id values."
                    if skipped_unknown_traces:
                        yield f"WARNING: {skipped_unknown_traces} result rows referenced traces without human labels."
                    if len(evaluations) < len(trace_ids_for_eval):
                        missing = len(trace_ids_for_eval) - len(evaluations)
                        yield f"WARNING: Missing evaluation scores for {missing} traces."
                    
                    valid_count = sum(1 for e in evaluations if e['predicted_rating'] is not None)
                    yield (
                        f"Extracted {valid_count}/{len(evaluations)} evaluations with scores "
                        f"(null predictions: {null_prediction_rows})"
                    )
                else:
                    yield f"ERROR: Column '{expected_value_col}' not found. Available: {columns_list}"
            else:
                yield f"WARNING: Result DataFrame is None"
            
            # Extract results
            metrics_payload = self._calculate_eval_metrics(evaluations)
            evaluation_results = {
                'judge_name': judge_name,
                'trace_count': len(trace_ids_for_eval),
                'metrics': metrics_payload,
                'evaluations': evaluations,
                'success': True,
            }
            
            yield f"Evaluation results prepared for {len(evaluations)} traces"
            
            yield evaluation_results
            
        except Exception as e:
            error_msg = f"Evaluation failed: {str(e)}"
            yield f"ERROR: {error_msg}"
            yield {"error": error_msg, "success": False}

    def run_alignment(
        self,
        workshop_id: str,
        judge_name: str,
        judge_prompt: str,
        evaluation_model_name: str,  # Model for judge creation
        alignment_model_name: str,  # Model for SIMBA optimizer
        mlflow_config: Any,
    ) -> Generator[str, None, Dict[str, Any]]:
        """Run judge alignment using LikertSIMBAAlignmentOptimizer.
        
        This generator yields log messages and finally returns the aligned judge.
        
        Prerequisites:
        - evaluate() must have been run first to create LLM assessments
        - Human feedback must exist on the traces with the same judge_name
        """
        logger.info("run_alignment() started for judge '%s'", judge_name)
        
        try:
            import mlflow
            from mlflow.genai.judges import make_judge
        except ImportError as e:
            error_msg = f"Required package not available: {e}"
            logger.error(error_msg)
            yield f"ERROR: {error_msg}"
            yield {"error": error_msg, "success": False}
            return
        
        try:
            # Set up MLflow environment
            os.environ['DATABRICKS_HOST'] = mlflow_config.databricks_host.rstrip('/')
            has_oauth = bool(os.environ.get('DATABRICKS_CLIENT_ID') and os.environ.get('DATABRICKS_CLIENT_SECRET'))
            if has_oauth:
                os.environ.pop('DATABRICKS_TOKEN', None)
            else:
                os.environ['DATABRICKS_TOKEN'] = mlflow_config.databricks_token
                os.environ.pop('DATABRICKS_CLIENT_ID', None)
                os.environ.pop('DATABRICKS_CLIENT_SECRET', None)
            mlflow.set_tracking_uri('databricks')
            
            # Enable SIMBA debug logging
            logging.getLogger("mlflow.genai.judges.optimizers.simba").setLevel(logging.DEBUG)
            
            experiment_id = mlflow_config.experiment_id
            if not experiment_id:
                yield "ERROR: MLflow experiment ID is not configured. Please set it in the Intake phase."
                yield {"error": "MLflow experiment ID not configured", "success": False}
                return
            try:
                mlflow.set_experiment(experiment_id=experiment_id)
            except Exception as e:
                yield f"ERROR: Failed to set experiment {experiment_id}: {e}"
                yield {"error": f"Failed to set experiment {experiment_id}: {e}", "success": False}
                return
            
            # Fetch labeled traces
            try:
                mlflow_traces = self._search_tagged_traces(mlflow_config, workshop_id, return_type="list")
            except Exception as exc:
                yield f"ERROR: Failed to search MLflow traces: {exc}"
                yield {"error": f"Failed to search MLflow traces: {exc}", "success": False}
                return

            logger.info("Found %d tagged traces for alignment", len(mlflow_traces))
            if not mlflow_traces:
                yield "ERROR: No labeled traces available for alignment"
                yield {"error": "No labeled traces available", "success": False}
                return
            
            # Determine model URI for the judge (use evaluation model)
            if evaluation_model_name.startswith('databricks-'):
                judge_model_uri = f'databricks:/{evaluation_model_name}'
            elif evaluation_model_name.startswith('openai-'):
                judge_model_uri = f'openai:/{evaluation_model_name.replace("openai-", "")}'
            else:
                judge_model_uri = f'databricks:/{evaluation_model_name}'
            
            normalized_judge_prompt = self._normalize_judge_prompt(judge_prompt)

            # Create judge with feedback_value_type for 1-5 Likert scale
            judge = make_judge(
                name=judge_name,
                instructions=normalized_judge_prompt,
                feedback_value_type=float,
                model=judge_model_uri,
            )
            
            logger.info("Judge '%s' created using model '%s'", judge.name, judge_model_uri)
            yield f"Initial Judge Text:\n{judge.instructions}"
            
            # Determine model URI for the optimizer
            alignment_model = alignment_model_name or evaluation_model_name
            if alignment_model.startswith('databricks-'):
                optimizer_model_uri = f'databricks:/{alignment_model}'
            elif alignment_model.startswith('openai-'):
                optimizer_model_uri = f'openai:/{alignment_model.replace("openai-", "")}'
            else:
                optimizer_model_uri = f'databricks:/{alignment_model}'
            
            # Set up log capture for SIMBA loggers
            log_handler = SimpleLogHandler()
            log_handler.setLevel(logging.DEBUG)
            formatter = logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s', datefmt='%Y/%m/%d %H:%M:%S')
            log_handler.setFormatter(formatter)
            
            target_loggers = [
                logging.getLogger("dspy.teleprompt.simba"),
                logging.getLogger("dspy.teleprompt.simba_utils"),
                logging.getLogger("mlflow.genai.judges.optimizers.simba"),
            ]
            for lg in target_loggers:
                lg.handlers.clear()
                lg.setLevel(logging.DEBUG)
                lg.propagate = False
                lg.addHandler(log_handler)
            
            # Create the optimizer
            yield "Creating LikertSIMBA optimizer..."
            
            optimizer = LikertSIMBAAlignmentOptimizer(
                model=optimizer_model_uri,
                batch_size=6,
                max_demos=0,
                verbose=True,
            )
            
            yield f"Optimizer created with model={optimizer_model_uri}, batch_size=6"
            yield f"Running alignment with {len(mlflow_traces)} traces... (this may take 20+ minutes)"
            
            # Run alignment in background thread so we can yield logs periodically
            aligned_judge_container: Dict[str, Any] = {}
            alignment_error: Optional[Exception] = None
            last_status_emit = time.time()
            
            def _alignment_worker():
                nonlocal alignment_error
                try:
                    aligned_judge_container["judge"] = judge.align(mlflow_traces, optimizer)
                except Exception as exc:
                    alignment_error = exc
                    logger.exception("Alignment failed: %s", exc)

            worker = threading.Thread(target=_alignment_worker, daemon=True)
            worker.start()
            yield "SIMBA optimization in progress..."

            try:
                while worker.is_alive():
                    # Drain captured SIMBA logs
                    new_logs = log_handler.get_new_messages()
                    if new_logs:
                        last_status_emit = time.time()
                        for log_message in new_logs:
                            yield log_message
                    
                    # Yield heartbeat if no activity
                    if not new_logs and time.time() - last_status_emit >= 5:
                        yield "SIMBA still optimizing..."
                        last_status_emit = time.time()
                    
                    worker.join(timeout=0.5)
                
                # Drain any remaining logs
                for log_message in log_handler.get_new_messages():
                    yield log_message
            finally:
                # Clean up handlers
                for lg in target_loggers:
                    try:
                        lg.removeHandler(log_handler)
                    except Exception:
                        pass

            if alignment_error:
                error_msg = f"Alignment failed: {alignment_error}"
                yield f"ERROR: {error_msg}"
                yield {"error": error_msg, "success": False}
                return

            aligned_judge = aligned_judge_container["judge"]
            logger.info("Alignment complete for judge '%s' (%d traces)", aligned_judge.name, len(mlflow_traces))
            yield "Alignment complete!"
            yield f"Aligned judge instructions length: {len(aligned_judge.instructions)} chars"

            # Log to MLflow
            mlflow_run = mlflow.active_run()
            started_run = False
            if mlflow_run is None:
                mlflow_run = mlflow.start_run(run_name=f"align-{judge_name}")
                started_run = True
                yield f"Started MLflow run {mlflow_run.info.run_id}"

            try:
                try:
                    mlflow.log_param("alignment.trace_count", len(mlflow_traces))
                    mlflow.log_param("alignment.judge_name", judge_name)
                    mlflow.log_param("alignment.model_uri", judge_model_uri)
                except Exception as param_err:
                    logger.warning("Failed to log MLflow params: %s", param_err)

                try:
                    mlflow.log_text(
                        aligned_judge.instructions or "",
                        artifact_file=f"aligned_judge_{judge_name}.txt",
                    )
                    yield "Logged aligned instructions as MLflow artifact"
                except Exception as artifact_err:
                    logger.warning("Failed to log artifact: %s", artifact_err)

                registered_judge_name: Optional[str] = None
                try:
                    registered_judge_name = f"{judge_name}_aligned"
                    aligned_judge.register(
                        experiment_id=experiment_id,
                        name=registered_judge_name,
                    )
                    yield f"Registered aligned judge as '{registered_judge_name}'"
                except Exception as register_err:
                    registered_judge_name = None
                    yield f"WARNING: Failed to register aligned judge: {register_err}"

            finally:
                if started_run:
                    try:
                        mlflow.end_run()
                    except Exception:
                        pass

            yield {
                'success': True,
                'judge_name': aligned_judge.name,
                'aligned_instructions': aligned_judge.instructions,
                'trace_count': len(mlflow_traces),
                'mlflow_run_id': mlflow_run.info.run_id if mlflow_run else None,
                'registered_judge_name': registered_judge_name,
            }
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            error_msg = f"Alignment failed: {str(e)}"
            logger.exception("Alignment error: %s", error_details)
            yield f"ERROR: {error_msg}"
            yield {"error": error_msg, "success": False}


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

