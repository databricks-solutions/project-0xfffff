"""Service for judge alignment using MLflow and MemAlignOptimizer.

Supports all judge types (Likert, Binary, etc.) using MemAlign's dual memory system.
MemAlign distills general guidelines from human feedback (semantic memory) and
incorporates them into the judge's instructions.

Note: Episodic memory (example retrieval) is available during alignment but is not
persisted when registering the judge. Future MLflow versions may support native
MemoryAugmentedJudge registration with full memory preservation.
"""

import logging
import math
import os
import threading
import time
from collections import Counter
from typing import Any, Dict, Generator, List, Optional

from sklearn.metrics import accuracy_score, cohen_kappa_score, confusion_matrix

import pandas as pd

from server.services.database_service import DatabaseService

# Configure logging
logger = logging.getLogger(__name__)

# Likert scale configuration (hardcoded per user requirements)
LIKERT_MIN = 1
LIKERT_MAX = 5

# Binary judge configuration
BINARY_PASS_VALUE = 1.0
BINARY_FAIL_VALUE = 0.0


def get_judge_type_from_rubric(db_service: DatabaseService, workshop_id: str) -> str:
    """Get the judge type from the workshop's rubric.
    
    First checks individual question judge types (more accurate), then falls back to rubric-level judge_type.
    Returns 'likert', 'binary', or 'freeform'. Defaults to 'likert' if not set.
    """
    try:
        from server.models import JudgeType
        rubric = db_service.get_rubric(workshop_id)
        if not rubric:
            return 'likert'  # Default
        
        # First, try to parse rubric questions to get per-question judge types
        # This is more accurate than the rubric-level judge_type
        if rubric.question:
            try:
                questions = db_service._parse_rubric_questions(rubric.question)
                if questions:
                    # Check if any question is binary
                    binary_questions = [q for q in questions if q.get('judge_type') == 'binary']
                    likert_questions = [q for q in questions if q.get('judge_type') == 'likert']
                    
                    if binary_questions and not likert_questions:
                        # All questions are binary
                        logger.info(f"Detected binary judge type from rubric questions ({len(binary_questions)} binary questions)")
                        return 'binary'
                    elif likert_questions and not binary_questions:
                        # All questions are likert
                        logger.info(f"Detected likert judge type from rubric questions ({len(likert_questions)} likert questions)")
                        return 'likert'
                    elif binary_questions:
                        # Mixed - but if we have binary questions, prefer binary
                        # (most common case: rubric has default likert but questions are binary)
                        logger.info(f"Detected binary judge type from rubric questions (mixed types, {len(binary_questions)} binary questions)")
                        return 'binary'
            except Exception as parse_error:
                logger.warning(f"Could not parse rubric questions for judge type detection: {parse_error}")
        
        # Fallback to rubric-level judge_type if no questions parsed or all questions are likert
        if hasattr(rubric, 'judge_type') and rubric.judge_type:
            # Handle JudgeType enum - extract string value
            judge_type = rubric.judge_type
            if isinstance(judge_type, JudgeType):
                return judge_type.value
            return str(judge_type)
    except Exception as e:
        logger.warning("Could not get rubric judge_type for workshop %s: %s", workshop_id, e)
    return 'likert'  # Default


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
        tag_type: str = "eval",
    ):
        """Fetch traces labeled for this workshop via mlflow.search_traces.

        Args:
            mlflow_config: MLflow configuration with experiment_id
            workshop_id: Workshop ID to filter by
            return_type: Either "pandas" or "list"
            tag_type: Tag value to search for:
                     - 'eval': tags.label='eval' — traces tagged for auto-evaluation
                     - 'align': tags.annotation_status='align' — traces tagged after human annotation
        """
        import mlflow

        # 'eval' uses tags.label, 'align' uses tags.annotation_status
        tag_key = "annotation_status" if tag_type == "align" else "label"
        filter_parts = [
            f"tags.{tag_key} = '{tag_type}'",
            f"tags.workshop_id = '{workshop_id}'",
        ]
        filter_string = " AND ".join(filter_parts)
        
        logger.info("Searching for traces with tag_type='%s' in workshop '%s'", tag_type, workshop_id)

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
    def _calculate_eval_metrics(evaluations: List[Dict[str, Any]], judge_type: str = 'likert') -> Dict[str, Any]:
        """Compute Cohen's κ, accuracy, and related stats for evaluation results.
        
        Args:
            evaluations: List of evaluation dictionaries with human_rating and predicted_rating
            judge_type: 'likert' for 1-5 scale, 'binary' for pass/fail
        """
        # Count total evaluations and valid pairs
        total_evaluations = len(evaluations)
        valid_pairs = [
            (e.get('human_rating'), e.get('predicted_rating'))
            for e in evaluations
            if isinstance(e.get('human_rating'), (int, float)) and isinstance(e.get('predicted_rating'), (int, float))
        ]
        total = len(valid_pairs)
        
        # Log if there's a discrepancy
        if total_evaluations > total:
            missing_count = total_evaluations - total
            logger.warning(
                "Metrics calculation: %d evaluations have missing or invalid ratings (total=%d, valid=%d)",
                missing_count,
                total_evaluations,
                total,
            )
        
        # Handle binary judges differently
        if judge_type == 'binary':
            default_matrix = [[0, 0], [0, 0]]  # 2x2 for binary
            default_agreement = {'pass': 0.0, 'fail': 0.0}
            
            if total == 0:
                return {
                    'correlation': 0.0,
                    'accuracy': 0.0,
                    'mean_absolute_error': 0.0,
                    'agreement_by_rating': default_agreement,
                    'confusion_matrix': default_matrix,
                    'total_evaluations': 0,
                    'total_evaluations_all': total_evaluations,
                    'judge_type': 'binary',
                }
            
            # Convert to binary: >= 0.5 is pass (1), < 0.5 is fail (0)
            humans = [1 if h >= 0.5 else 0 for h, _ in valid_pairs]
            preds = [1 if p >= 0.5 else 0 for _, p in valid_pairs]
            
            matches = sum(1 for h, p in zip(humans, preds, strict=False) if h == p)
            simple_agreement = matches / total if total else 0.0
            
            # Check if there's any variation in the data
            unique_humans = set(humans)
            unique_preds = set(preds)
            
            # If all values are the same and they match, that's perfect agreement (kappa = 1.0)
            if len(unique_humans) == 1 and len(unique_preds) == 1 and humans == preds:
                kappa = 1.0  # Perfect agreement when all values are the same and match
            elif len(unique_humans) == 1 or len(unique_preds) == 1:
                # No variation in one set - can't calculate meaningful kappa, use simple agreement
                kappa = simple_agreement
            else:
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
            
            # For binary, agreement by pass/fail
            agreement_by_rating = {}
            for label, value in [('pass', 1), ('fail', 0)]:
                label_preds = [p for h, p in zip(humans, preds, strict=False) if h == value]
                if label_preds:
                    label_matches = sum(1 for p in label_preds if p == value)
                    agreement_by_rating[label] = label_matches / len(label_preds)
                else:
                    agreement_by_rating[label] = 0.0
            
            try:
                cm = confusion_matrix(humans, preds, labels=[0, 1]).tolist()
            except Exception:
                cm = default_matrix
            
            logger.info(
                "Computed BINARY evaluation metrics: kappa=%.3f accuracy=%.3f (n=%d)",
                kappa,
                accuracy,
                total,
            )
            
            return {
                'correlation': float(kappa),
                'accuracy': float(accuracy),
                'mean_absolute_error': 0.0,  # Not meaningful for binary
                'agreement_by_rating': agreement_by_rating,
                'confusion_matrix': cm,
                'total_evaluations': total,  # Valid evaluations (both human and predicted ratings available)
                'total_evaluations_all': total_evaluations,  # All evaluations including those with missing ratings
                'judge_type': 'binary',
            }
        
        # Likert scale (default)
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
                'total_evaluations_all': total_evaluations,
                'judge_type': 'likert',
            }

        humans = [int(h) for h, _ in valid_pairs]
        preds = [int(round(p)) for _, p in valid_pairs]

        matches = sum(1 for h, p in zip(humans, preds, strict=False) if h == p)
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

        mean_abs_error = sum(abs(h - p) for h, p in zip(humans, preds, strict=False)) / total if total else 0.0

        agreement_by_rating: Dict[str, float] = {}
        for rating in range(1, 6):
            rating_preds = [p for h, p in zip(humans, preds, strict=False) if h == rating]
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
            "Computed LIKERT evaluation metrics: kappa=%.3f accuracy=%.3f (n=%d)",
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
            'total_evaluations': total,  # Valid evaluations (both human and predicted ratings available)
            'total_evaluations_all': total_evaluations,  # All evaluations including those with missing ratings
            'judge_type': 'likert',
        }

    def run_evaluation_with_answer_sheet(
        self,
        workshop_id: str,
        judge_name: str,
        judge_prompt: str,
        evaluation_model_name: str,
        mlflow_config: Any,
        judge_type: str = None,  # Explicit judge type from selected rubric question
        require_human_ratings: bool = True,  # Set to False for auto-evaluation without human ratings
        trace_ids_override: List[str] = None,  # Optional list of specific trace IDs to evaluate
        tag_type: str = "eval",  # Tag to search for: 'eval' for auto-evaluation, 'align' for re-evaluation
        use_registered_judge: bool = False,  # If True, loads the registered judge from MLflow (with memory)
    ) -> Generator[str, None, Dict[str, Any]]:
        """Run evaluation using mlflow.genai.evaluate() with answer sheet approach.
        
        This generator yields log messages and finally returns the evaluation results.
        
        Critical: The judge_name must match for both human feedback and LLM evaluation
        so that align() can properly correlate them.
        
        Args:
            judge_type: Explicit judge type ('likert', 'binary', 'freeform'). If not provided,
                       falls back to detecting from rubric (legacy behavior).
            require_human_ratings: If True (default), only evaluates traces with human ratings.
                                  If False, evaluates all tagged traces (for auto-evaluation).
            trace_ids_override: Optional list of specific trace IDs to evaluate. If provided,
                               uses these instead of searching for tagged traces.
            tag_type: Tag to search for when finding traces. Use 'eval' for auto-evaluation
                     (traces tagged when annotation starts), 'align' for re-evaluation
                     (traces that have been human-annotated).
            use_registered_judge: If True, loads the registered judge from MLflow instead of
                                 creating a new one from the prompt. This uses the aligned
                                 judge with episodic/semantic memory from memalign.
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
        yield f"Mode: {'require human ratings' if require_human_ratings else 'auto-evaluation (no human ratings required)'}"
        
        # Build mapping from MLflow trace IDs to workshop trace IDs for auto-eval mode
        mlflow_to_workshop_trace_map: Dict[str, str] = {}
        if not require_human_ratings:
            # Query database to get mapping
            traces = self.db_service.get_traces(workshop_id)
            for trace in traces:
                if hasattr(trace, 'mlflow_trace_id') and trace.mlflow_trace_id:
                    mlflow_to_workshop_trace_map[trace.mlflow_trace_id] = trace.id
            yield f"Built MLflow-to-workshop trace mapping ({len(mlflow_to_workshop_trace_map)} traces)"
        
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
        human_feedback_map: Dict[str, Dict[str, Any]] = {}
        
        if require_human_ratings:
            # Original behavior: require human ratings
            alignment_data = self.prepare_alignment_data(workshop_id, judge_name)
            traces_for_eval = alignment_data['traces']
            
            if not traces_for_eval:
                yield "ERROR: No traces available for evaluation"
                yield {"error": "No traces available for evaluation", "success": False}
                return
            
            for trace in traces_for_eval:
                trace_id = str(trace['trace_id']).strip()
                human_rating = trace.get('human_rating')
                if trace_id and human_rating is not None:
                    human_feedback_map[trace_id] = trace
            
            if not human_feedback_map:
                yield "ERROR: Annotated traces are missing human ratings"
                yield {"error": "Annotated traces missing ratings", "success": False}
                return
        else:
            # Auto-evaluation mode: no human ratings required
            yield "Auto-evaluation mode: will evaluate all tagged traces without human ratings"
        
        try:
            # Use specified tag_type: 'eval' for auto-evaluation, 'align' for re-evaluation
            trace_df = self._search_tagged_traces(mlflow_config, workshop_id, return_type="pandas", tag_type=tag_type)
        except Exception as exc:
            yield f"ERROR: Failed to query MLflow traces: {exc}"
            yield {"error": f"Failed to query MLflow traces: {exc}", "success": False}
            return
        
        if trace_df is None or trace_df.empty:
            yield f"ERROR: No MLflow traces found with label '{tag_type}'"
            yield {"error": "No tagged MLflow traces found", "success": False}
            return
        
        if 'trace_id' not in trace_df.columns:
            yield "ERROR: MLflow traces result is missing 'trace_id'"
            yield {"error": "search_traces missing trace_id", "success": False}
            return
        
        trace_df = trace_df.copy()
        trace_df['trace_id'] = trace_df['trace_id'].astype(str).str.strip()
        
        # Filter traces based on mode
        if require_human_ratings:
            # Only include traces with human ratings
            filtered_df = trace_df[trace_df['trace_id'].isin(human_feedback_map.keys())]
        elif trace_ids_override:
            # Use specific trace IDs if provided
            filtered_df = trace_df[trace_df['trace_id'].isin(trace_ids_override)]
            yield f"Filtering to {len(trace_ids_override)} specific trace IDs"
        else:
            # Auto-evaluation: use all tagged traces
            filtered_df = trace_df
        if filtered_df.empty:
            if require_human_ratings:
                yield "ERROR: MLflow trace_ids do not match annotated traces"
                yield {"error": "No overlap between MLflow traces and annotations", "success": False}
            else:
                yield "ERROR: No tagged traces found for evaluation"
                yield {"error": "No tagged traces found", "success": False}
            return
        
        trace_ids_for_eval = filtered_df['trace_id'].tolist()
        yield f"Prepared {len(trace_ids_for_eval)} traces for evaluation"
        
        # Only check for missing IDs when human ratings are required
        if require_human_ratings and human_feedback_map:
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
            
            # Use explicit judge type if provided, otherwise detect from rubric (legacy)
            effective_judge_type = judge_type if judge_type else get_judge_type_from_rubric(self.db_service, workshop_id)
            yield f"Using judge type: {effective_judge_type}" + (f" (explicitly set)" if judge_type else " (detected from rubric)")
            
            # Try to load registered judge if requested (for re-evaluation after alignment)
            judge = None
            if use_registered_judge:
                try:
                    from mlflow.genai.scorers import get_scorer
                    experiment_id = mlflow_config.experiment_id
                    
                    yield f"Attempting to load registered judge '{judge_name}' from MLflow..."
                    
                    # get_scorer loads the judge with all its aligned properties including memory
                    judge = get_scorer(name=judge_name, experiment_id=experiment_id)
                    
                    if judge is not None:
                        yield f"✓ Loaded registered judge '{judge_name}' (with episodic/semantic memory from alignment)"
                        # Check if the judge has aligned instructions
                        if hasattr(judge, 'instructions') and judge.instructions:
                            yield f"Judge has {len(judge.instructions)} chars of instructions"
                    else:
                        yield f"WARNING: get_scorer returned None for '{judge_name}' - will create from prompt"
                except Exception as load_err:
                    yield f"WARNING: Could not load registered judge: {load_err}"
                    yield f"Falling back to creating judge from prompt text"
                    judge = None
            
            # If we didn't load a registered judge, create one from the prompt
            if judge is None:
                # The prompt template with placeholders for judge instructions
                mlflow_prompt_template = self._normalize_judge_prompt(judge_prompt)
                
                # For binary rubrics, enhance the prompt to clarify pass/fail criteria
                # NOTE: Do NOT add custom output format instructions - MLflow InstructionsJudge
                # expects JSON output with "result" and "rationale" fields, handled automatically
                if effective_judge_type == 'binary':
                    yield "Binary judge - MLflow will handle JSON output format automatically"
                
                # Set feedback_value_type based on judge type
                # - Binary judges: use float for 0/1 numeric ratings (NOT bool - bool is unreliable)
                # - Likert judges: use float for 1-5 scale
                # NOTE: feedback_value_type only affects parsing, not model output. Strong prompt instructions are critical.
                if effective_judge_type == 'binary':
                    feedback_type = float  # Use float, not bool - more reliable for 0/1 parsing
                    yield f"Binary judge - creating with feedback_value_type=float (expecting 0 or 1)"
                else:
                    feedback_type = float
                    yield f"Likert judge - creating with feedback_value_type=float (expecting 1-5)"
                
                # Create judge with the judge name - this name is critical for alignment
                # The judge can be used as a scorer in evaluate()
                judge = make_judge(
                    name=judge_name,  # Critical: must match for alignment
                    instructions=mlflow_prompt_template,
                    feedback_value_type=feedback_type,
                    model=model_uri,
                )
                
                yield f"Created new judge from prompt: {judge_name}"
            
            yield f"Judge ready for evaluation: {judge_name}"
            
            # Ensure eval_df has 'inputs' and 'outputs' columns required by MLflow evaluate()
            # MLflow's search_traces returns traces, but we need to fetch full trace data to get inputs/outputs
            if 'inputs' not in eval_df.columns or 'outputs' not in eval_df.columns:
                yield f"Preparing inputs/outputs columns from MLflow trace data..."
                
                # Fetch full trace data for each trace_id to extract inputs/outputs
                eval_df = eval_df.copy()
                inputs_list = []
                outputs_list = []
                
                for trace_id in eval_df['trace_id']:
                    try:
                        full_trace = mlflow.get_trace(trace_id)
                        # Extract inputs/outputs from trace data structure
                        # MLflow traces have data.request and data.response
                        trace_inputs = None
                        trace_outputs = None
                        
                        if hasattr(full_trace, 'data'):
                            if hasattr(full_trace.data, 'request'):
                                trace_inputs = full_trace.data.request
                            if hasattr(full_trace.data, 'response'):
                                trace_outputs = full_trace.data.response
                        
                        inputs_list.append(trace_inputs)
                        outputs_list.append(trace_outputs)
                    except Exception as e:
                        yield f"WARNING: Could not fetch trace {trace_id[:8]}...: {e}"
                        inputs_list.append(None)
                        outputs_list.append(None)
                
                # Add inputs and outputs columns
                if 'inputs' not in eval_df.columns:
                    eval_df['inputs'] = inputs_list
                if 'outputs' not in eval_df.columns:
                    eval_df['outputs'] = outputs_list
                
                # Check if we successfully created the columns
                missing_inputs = eval_df['inputs'].isna().sum() if 'inputs' in eval_df.columns else len(eval_df)
                missing_outputs = eval_df['outputs'].isna().sum() if 'outputs' in eval_df.columns else len(eval_df)
                
                if missing_inputs > 0 or missing_outputs > 0:
                    yield f"WARNING: Missing inputs for {missing_inputs} traces, missing outputs for {missing_outputs} traces"
                    # Filter out rows with missing inputs or outputs
                    before_count = len(eval_df)
                    eval_df = eval_df[eval_df['inputs'].notna() & eval_df['outputs'].notna()]
                    after_count = len(eval_df)
                    if before_count != after_count:
                        yield f"Filtered out {before_count - after_count} traces with missing inputs/outputs"
                else:
                    yield f"✅ Successfully prepared inputs/outputs columns for {len(eval_df)} traces"
            
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
                yield f"Available columns in result_df: {columns_list}"
                
                # Look for the judge's value column: {judge_name}/value
                expected_value_col = f"{judge_name}/value"
                
                if expected_value_col in result_df.columns:
                    judge_value_col = expected_value_col
                
                # Also look for reasoning/explanation/output columns that might contain the raw text response
                reasoning_col = None
                possible_reasoning_cols = [
                    f"{judge_name}/explanation",
                    f"{judge_name}/reasoning",
                    f"{judge_name}/output",
                    f"{judge_name}/text",
                    f"{judge_name}/response",
                ]
                for col_name in possible_reasoning_cols:
                    if col_name in result_df.columns:
                        reasoning_col = col_name
                        break
                
                yield f"Looking for column '{expected_value_col}': {'found' if judge_value_col else 'NOT FOUND'}"
                if reasoning_col:
                    yield f"Found reasoning column: {reasoning_col}"
                else:
                    yield f"WARNING: No reasoning/explanation column found. Available columns: {columns_list}"
                
                if judge_value_col:
                    null_prediction_rows = 0
                    rows_without_trace_id = 0
                    skipped_unknown_traces = 0
                    
                    # Use the effective judge type determined earlier (explicit > detected)
                    is_binary = effective_judge_type == 'binary'
                    yield f"🔍 Processing results with judge_type='{effective_judge_type}', is_binary={is_binary}"
                    if is_binary:
                        yield f"Binary judge - will convert PASS/FAIL to 1/0 and reject any values not 0 or 1"
                    
                    for idx, (_, row) in enumerate(result_df.iterrows()):
                        raw_trace_id = row.get('trace_id')
                        if raw_trace_id is None:
                            rows_without_trace_id += 1
                            continue
                        
                        trace_id = str(raw_trace_id).strip()
                        trace_data = human_feedback_map.get(trace_id)
                        
                        # In auto-evaluation mode (require_human_ratings=False), 
                        # we don't skip traces without human ratings
                        if trace_data is None:
                            if require_human_ratings:
                                skipped_unknown_traces += 1
                                continue
                            else:
                                # Auto-eval mode: create minimal trace data with workshop trace ID
                                workshop_trace_id = mlflow_to_workshop_trace_map.get(trace_id, trace_id)
                                trace_data = {
                                    'trace_id': trace_id, 
                                    'workshop_id': workshop_trace_id,
                                    'human_rating': None
                                }
                        
                        workshop_uuid = trace_data.get('workshop_id', trace_id)
                        
                        predicted_value = row.get(judge_value_col)
                        # Also try to get raw text response from reasoning column if available
                        raw_text_response = None
                        if reasoning_col and reasoning_col in result_df.columns:
                            raw_text_response = row.get(reasoning_col)
                        
                        predicted_rating = None
                        
                        # For binary judges, prioritize parsing numeric 0/1 values first
                        # We now request 0/1 numeric format, so MLflow should return float values
                        if is_binary and predicted_value is not None and not pd.isna(predicted_value):
                            # First, try to parse as numeric 0 or 1
                            if isinstance(predicted_value, (int, float)):
                                numeric_value = float(predicted_value)
                                if numeric_value == 0 or numeric_value == 0.0:
                                    predicted_rating = 0.0
                                elif numeric_value == 1 or numeric_value == 1.0:
                                    predicted_rating = 1.0
                                else:
                                    # Invalid numeric value (not 0 or 1) - try to parse from text
                                    if raw_text_response:
                                        text_lower = str(raw_text_response).lower()
                                        text_trimmed = text_lower.strip()
                                        if text_trimmed.startswith('0') and (len(text_trimmed) == 1 or text_trimmed[1] in [' ', '\n', '.', ',', ':', ';']):
                                            predicted_rating = 0.0
                                        elif text_trimmed.startswith('1') and (len(text_trimmed) == 1 or text_trimmed[1] in [' ', '\n', '.', ',', ':', ';']):
                                            predicted_rating = 1.0
                        
                        # If we didn't parse from numeric value, try parsing from raw text response
                        if predicted_rating is None and is_binary and raw_text_response:
                            text_lower = str(raw_text_response).lower()
                            text_trimmed = text_lower.strip()
                            if text_trimmed.startswith('0') and (len(text_trimmed) == 1 or text_trimmed[1] in [' ', '\n', '.', ',', ':', ';']):
                                predicted_rating = 0.0
                            elif text_trimmed.startswith('1') and (len(text_trimmed) == 1 or text_trimmed[1] in [' ', '\n', '.', ',', ':', ';']):
                                predicted_rating = 1.0
                            else:
                                # Fallback to PASS/FAIL text parsing (for backward compatibility)
                                if 'pass' in text_lower and 'fail' not in text_lower[:text_lower.find('pass')+10]:
                                    predicted_rating = 1.0
                                elif 'fail' in text_lower and 'pass' not in text_lower[:text_lower.find('fail')+10]:
                                    predicted_rating = 0.0
                        
                        # If we still didn't parse, try the parsed value as fallback
                        if predicted_rating is None and predicted_value is not None and not pd.isna(predicted_value):
                            # Handle boolean values (backward compatibility)
                            if isinstance(predicted_value, bool):
                                predicted_rating = 1.0 if predicted_value else 0.0
                            else:
                                # Try to convert strings to 0/1 for binary rubrics
                                str_value = str(predicted_value).strip().upper()
                                if str_value in ('0', '0.0', '0.', '0!', '0:', '0;'):
                                    predicted_rating = 0.0
                                elif str_value in ('1', '1.0', '1.', '1!', '1:', '1;'):
                                    predicted_rating = 1.0
                                elif str_value in ('PASS', 'PASS.', 'PASS!', 'PASS:', 'PASS;'):
                                    predicted_rating = 1.0
                                elif str_value in ('FAIL', 'FAIL.', 'FAIL!', 'FAIL:', 'FAIL;'):
                                    predicted_rating = 0.0
                                elif str_value in ('TRUE', 'TRUE.', 'TRUE!', 'TRUE:', 'TRUE;'):
                                    predicted_rating = 1.0
                                elif str_value in ('FALSE', 'FALSE.', 'FALSE!', 'FALSE:', 'FALSE;'):
                                    predicted_rating = 0.0
                                elif str_value in ('YES', 'CORRECT', 'GOOD', 'ACCEPTABLE'):
                                    predicted_rating = 1.0
                                elif str_value in ('NO', 'INCORRECT', 'BAD', 'UNACCEPTABLE'):
                                    predicted_rating = 0.0
                                else:
                                    # Try numeric conversion
                                    try:
                                        numeric_value = float(predicted_value)
                                        if is_binary:
                                            if numeric_value == 0 or numeric_value == 0.0:
                                                predicted_rating = 0.0
                                            elif numeric_value == 1 or numeric_value == 1.0:
                                                predicted_rating = 1.0
                                            else:
                                                # Invalid binary value - try to parse from raw text response if available
                                                if raw_text_response:
                                                    text_lower = str(raw_text_response).lower()
                                                    if 'pass' in text_lower and 'fail' not in text_lower[:text_lower.find('pass')+10]:
                                                        predicted_rating = 1.0
                                                    elif 'fail' in text_lower and 'pass' not in text_lower[:text_lower.find('fail')+10]:
                                                        predicted_rating = 0.0
                                                    elif any(word in text_lower for word in ['true', 'yes', 'correct', 'meets', 'acceptable']):
                                                        predicted_rating = 1.0
                                                    elif any(word in text_lower for word in ['false', 'no', 'incorrect', 'does not meet', 'unacceptable']):
                                                        predicted_rating = 0.0
                                                    elif 1 <= numeric_value <= 5:
                                                        # Fallback: convert Likert-style response to binary using threshold
                                                        predicted_rating = 1.0 if numeric_value >= 3 else 0.0
                                                    else:
                                                        predicted_rating = None
                                                else:
                                                    # No raw text available - try threshold conversion as last resort
                                                    if 1 <= numeric_value <= 5:
                                                        predicted_rating = 1.0 if numeric_value >= 3 else 0.0
                                                    else:
                                                        predicted_rating = None
                                        else:
                                            # Likert scale: allow 1-5, clamp if out of range
                                            if numeric_value == 0:
                                                predicted_rating = None  # Reject 0 for Likert
                                            elif 1 <= numeric_value <= 5:
                                                predicted_rating = numeric_value
                                            else:
                                                predicted_rating = max(1.0, min(5.0, numeric_value))
                                    except (ValueError, TypeError):
                                        pass  # Could not convert to rating
                        else:
                            null_prediction_rows += 1
                        
                        # If we still couldn't parse a rating, use a sensible default
                        if predicted_rating is None:
                            if is_binary:
                                # Default to PASS (1) for binary - matches simple evaluation behavior
                                predicted_rating = 1.0
                                yield f"⚠️ Could not parse rating for trace {trace_id[:8]}... - defaulting to 1.0 (PASS)"
                            else:
                                # Default to neutral (3) for Likert - matches simple evaluation behavior
                                predicted_rating = 3.0
                                yield f"⚠️ Could not parse rating for trace {trace_id[:8]}... - defaulting to 3.0 (neutral)"
                        
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
            
            # Use effective_judge_type for appropriate metrics calculation
            yield f"Computing metrics for judge type: {effective_judge_type}"
            
            # Extract results with appropriate metrics for judge type
            metrics_payload = self._calculate_eval_metrics(evaluations, judge_type=effective_judge_type)
            evaluation_results = {
                'judge_name': judge_name,
                'trace_count': len(trace_ids_for_eval),
                'metrics': metrics_payload,
                'evaluations': evaluations,
                'success': True,
                'judge_type': effective_judge_type,
            }
            
            yield f"Evaluation results prepared for {len(evaluations)} traces"
            
            # Sync AI evaluations to MLflow for SIMBA alignment
            try:
                sync_result = self.db_service.sync_evaluations_to_mlflow(
                    workshop_id=workshop_id,
                    judge_name=judge_name,
                    evaluations=evaluations
                )
                yield f"Synced {sync_result.get('synced', 0)} AI evaluations to MLflow for judge '{judge_name}'"
            except Exception as sync_err:
                yield f"WARNING: Could not sync AI evaluations to MLflow: {sync_err}"
            
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
        alignment_model_name: str,  # Model for MemAlign optimizer (reflection/distillation)
        mlflow_config: Any,
    ) -> Generator[str, None, Dict[str, Any]]:
        """Run judge alignment using MemAlignOptimizer.
        
        MemAlign uses dual memory systems to align judges with human feedback:
        - Semantic Memory: Distills general guidelines from feedback patterns
        - Episodic Memory: Retrieves similar past examples during evaluation
        
        This generator yields log messages and finally returns the aligned judge.
        
        Prerequisites:
        - evaluate() must have been run first to create LLM assessments
        - Human feedback must exist on the traces with the same judge_name
        
        Note: MemAlign works universally across all judge types (binary, likert, etc.)
        without requiring type-specific configuration.
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
            
            # Enable MemAlign debug logging
            logging.getLogger("mlflow.genai.judges.optimizers.memalign").setLevel(logging.DEBUG)
            
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
            
            # Fetch labeled traces - use annotation_status='align' for traces with human annotations
            try:
                mlflow_traces = self._search_tagged_traces(mlflow_config, workshop_id, return_type="list", tag_type="align")
            except Exception as exc:
                yield f"ERROR: Failed to search MLflow traces: {exc}"
                yield {"error": f"Failed to search MLflow traces: {exc}", "success": False}
                return

            logger.info("Found %d tagged traces with annotation_status='align' for alignment", len(mlflow_traces))
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
            
            # Get judge type from rubric to determine feedback_value_type
            judge_type = get_judge_type_from_rubric(self.db_service, workshop_id)
            
            # For binary rubrics, log the judge type
            # NOTE: Do NOT add custom output format instructions - MLflow InstructionsJudge
            # expects JSON output with "result" and "rationale" fields, handled automatically
            if judge_type == 'binary':
                yield "Binary judge - MLflow will handle JSON output format automatically"
            
            # Set feedback_value_type based on judge type
            # - Binary judges: use float for 0/1 numeric ratings
            # - Likert judges: use float for 1-5 scale
            if judge_type == 'binary':
                feedback_type = float
                yield f"Creating binary judge with feedback_value_type=float (expecting 0 or 1)"
            else:
                feedback_type = float
                yield f"Creating Likert judge with feedback_value_type=float"

            # Create judge with appropriate feedback_value_type
            judge = make_judge(
                name=judge_name,
                instructions=normalized_judge_prompt,
                feedback_value_type=feedback_type,
                model=judge_model_uri,
            )
            
            logger.info("Judge '%s' created using model '%s' (type=%s)", judge.name, judge_model_uri, judge_type)
            yield f"Initial Judge Text:\n{judge.instructions}"
            
            # Register or update the judge BEFORE alignment so it exists in MLflow
            try:
                # Try to register first
                judge.register(
                    experiment_id=experiment_id,
                    name=judge_name,
                )
                yield f"Registered initial judge '{judge_name}' before alignment"
            except Exception as pre_register_err:
                # If already registered, try to update instead
                if "already been registered" in str(pre_register_err):
                    try:
                        judge.update(
                            experiment_id=experiment_id,
                            name=judge_name,
                        )
                        yield f"Updated existing judge '{judge_name}' before alignment"
                    except Exception as update_err:
                        yield f"WARNING: Could not update existing judge: {update_err}"
                else:
                    yield f"WARNING: Could not pre-register judge: {pre_register_err}"
            
            # Determine model URI for the optimizer
            alignment_model = alignment_model_name or evaluation_model_name
            if alignment_model.startswith('databricks-'):
                optimizer_model_uri = f'databricks:/{alignment_model}'
            elif alignment_model.startswith('openai-'):
                optimizer_model_uri = f'openai:/{alignment_model.replace("openai-", "")}'
            else:
                optimizer_model_uri = f'databricks:/{alignment_model}'
            
            # Set up log capture for MemAlign loggers
            log_handler = SimpleLogHandler()
            log_handler.setLevel(logging.DEBUG)
            formatter = logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s', datefmt='%Y/%m/%d %H:%M:%S')
            log_handler.setFormatter(formatter)
            
            target_loggers = [
                logging.getLogger("mlflow.genai.judges.optimizers.memalign"),
                logging.getLogger("mlflow.genai.judges.optimizers.memalign.optimizer"),
                logging.getLogger("mlflow.genai.judges.optimizers.memalign.utils"),
            ]
            for lg in target_loggers:
                lg.handlers.clear()
                lg.setLevel(logging.DEBUG)
                lg.propagate = False
                lg.addHandler(log_handler)
            
            # Get judge type for informational purposes (MemAlign works with all types)
            judge_type = get_judge_type_from_rubric(self.db_service, workshop_id)
            logger.info("Detected judge type from rubric: %s", judge_type)
            yield f"Detected judge type: {judge_type}"
            
            # Create MemAlignOptimizer - works universally for all judge types
            # MemAlign uses dual memory systems:
            # - Semantic Memory: Distills general guidelines from feedback
            # - Episodic Memory: Retrieves similar past examples during evaluation
            yield "Creating MemAlign optimizer..."

            try:
                from mlflow.genai.judges.optimizers import MemAlignOptimizer

                # IMPORTANT: Databricks models don't support the JSON schema format required
                # for guideline distillation (additionalProperties: false). OpenAI and Claude models
                # support this, so we prefer those for the reflection_lm.
                openai_api_key = os.environ.get('OPENAI_API_KEY')
                is_openai_model = alignment_model.startswith('openai-') or alignment_model.startswith('gpt-')
                is_claude_model = alignment_model.startswith('claude-') or 'claude' in alignment_model.lower()

                if is_openai_model or is_claude_model:
                    # User selected OpenAI/Claude model - use it for reflection (supports JSON schema)
                    reflection_model = optimizer_model_uri
                    yield f"Using {alignment_model} for guideline distillation"
                elif openai_api_key:
                    # Databricks model selected but OpenAI key available - use OpenAI for reflection
                    reflection_model = "openai:/gpt-4o-mini"
                    yield "Using OpenAI (gpt-4o-mini) for guideline distillation (Databricks doesn't support required JSON schema)"
                else:
                    # Fall back to Databricks - guideline distillation will fail but episodic memory will work
                    reflection_model = optimizer_model_uri
                    yield "WARNING: Using Databricks model for reflection."
                    yield "Guideline distillation may fail (Databricks doesn't support required JSON schema)."
                    yield "Alignment will still work using episodic memory (example-based learning)."

                optimizer = MemAlignOptimizer(
                    reflection_lm=reflection_model,  # Model for distilling guidelines
                    retrieval_k=5,  # Number of similar examples to retrieve
                    embedding_model="databricks:/databricks-gte-large-en",  # Databricks embedding model
                )
                yield f"MemAlign optimizer created with reflection_lm={reflection_model}, retrieval_k=5"
                yield "Using MemAlign dual memory system (semantic + episodic memory)"
            except ImportError as e:
                error_msg = f"MemAlign optimizer not available: {e}. Ensure mlflow>=3.9 is installed."
                yield f"ERROR: {error_msg}"
                yield {"error": error_msg, "success": False}
                return
            
            yield f"Running alignment with {len(mlflow_traces)} traces..."
            
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
            yield "MemAlign optimization in progress (distilling guidelines and building memory)..."

            try:
                while worker.is_alive():
                    # Drain captured MemAlign logs
                    new_logs = log_handler.get_new_messages()
                    if new_logs:
                        last_status_emit = time.time()
                        for log_message in new_logs:
                            yield log_message
                    
                    # Yield heartbeat if no activity
                    if not new_logs and time.time() - last_status_emit >= 5:
                        yield "MemAlign still optimizing..."
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
            
            # Extract the aligned instructions (original prompt + distilled guidelines)
            aligned_instructions = aligned_judge.instructions
            
            # Extract memory statistics for logging
            semantic_memory = getattr(aligned_judge, '_semantic_memory', [])
            episodic_memory = getattr(aligned_judge, '_episodic_memory', [])
            guideline_count = len(semantic_memory)
            example_count = len(episodic_memory)
            
            yield f"Aligned judge instructions length: {len(aligned_instructions)} chars"
            yield f"Semantic memory: {guideline_count} distilled guidelines"
            yield f"Episodic memory: {example_count} examples (not persisted to registered judge)"

            # Explain if no guidelines were distilled (common with Databricks models)
            if guideline_count == 0 and example_count > 0:
                yield "NOTE: Guideline distillation requires JSON structured output which Databricks models may not fully support."
                yield "The alignment still succeeded using episodic memory (example-based learning)."
                yield "The judge will use the original instructions + learned examples for evaluation."

            # Log the distilled guidelines
            if semantic_memory:
                yield "--- Distilled Guidelines (Semantic Memory) ---"
                for i, guideline in enumerate(semantic_memory, 1):
                    guideline_text = getattr(guideline, 'guideline_text', str(guideline))
                    # Truncate long guidelines for display
                    if len(guideline_text) > 200:
                        guideline_text = guideline_text[:200] + "..."
                    yield f"  {i}. {guideline_text}"
            
            # Log sample episodic memory examples
            if episodic_memory:
                yield "--- Sample Episodic Memory Examples ---"
                for i, example in enumerate(episodic_memory[:3], 1):  # Show first 3
                    ex_dict = dict(example) if hasattr(example, '__iter__') else {}
                    trace_id = getattr(example, '_trace_id', 'N/A')
                    # Get a preview of inputs/outputs
                    inputs_preview = str(ex_dict.get('inputs', ''))[:80]
                    if len(str(ex_dict.get('inputs', ''))) > 80:
                        inputs_preview += "..."
                    yield f"  Example {i} (trace: {trace_id}): {inputs_preview}"
                if len(episodic_memory) > 3:
                    yield f"  ... and {len(episodic_memory) - 3} more examples"

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
                        aligned_instructions or "",
                        artifact_file=f"aligned_judge_{judge_name}.txt",
                    )
                    yield "Logged aligned instructions as MLflow artifact"
                except Exception as artifact_err:
                    logger.warning("Failed to log artifact: %s", artifact_err)

                # Update the existing registered judge with aligned instructions
                # The aligned_instructions contain the original prompt + distilled guidelines (semantic memory)
                # Note: Episodic memory (example retrieval) is not preserved - waiting for native MLflow support
                registered_judge_name: Optional[str] = None
                try:
                    from mlflow.genai.scorers import ScorerSamplingConfig
                    
                    # Create judge with aligned instructions using the SAME name
                    registered_judge_name = judge_name  # Use original name, not _aligned suffix
                    aligned_judge_for_registration = make_judge(
                        name=registered_judge_name,
                        instructions=aligned_instructions,
                        feedback_value_type=feedback_type,
                        model=judge_model_uri,
                    )
                    
                    # Try to update existing scorer first, fall back to register if it doesn't exist
                    try:
                        # Use update() for existing scorers - this creates a new version
                        aligned_judge_for_registration.update(
                            experiment_id=experiment_id,
                            name=registered_judge_name,
                            sampling_config=ScorerSamplingConfig(sample_rate=0.0),
                        )
                        yield f"Updated existing judge '{registered_judge_name}' with aligned instructions"
                    except Exception as update_err:
                        # If update fails (scorer doesn't exist), try register
                        if "not found" in str(update_err).lower() or "does not exist" in str(update_err).lower():
                            aligned_judge_for_registration.register(
                                experiment_id=experiment_id,
                                name=registered_judge_name,
                            )
                            yield f"Registered new judge '{registered_judge_name}' with aligned instructions"
                            # Set sampling config after registration
                            try:
                                aligned_judge_for_registration.update(
                                    experiment_id=experiment_id,
                                    name=registered_judge_name,
                                    sampling_config=ScorerSamplingConfig(sample_rate=0.0),
                                )
                                yield f"Set sample_rate=0 for judge '{registered_judge_name}'"
                            except Exception as config_err:
                                yield f"WARNING: Could not update sampling config: {config_err}"
                        else:
                            yield f"WARNING: Could not update judge: {update_err}"
                        
                except Exception as register_err:
                    registered_judge_name = None
                    yield f"WARNING: Failed to update/register aligned judge: {register_err}"

            finally:
                if started_run:
                    try:
                        mlflow.end_run()
                    except Exception:
                        pass

            yield {
                'success': True,
                'judge_name': judge_name,
                'aligned_instructions': aligned_instructions,
                'trace_count': len(mlflow_traces),
                'mlflow_run_id': mlflow_run.info.run_id if mlflow_run else None,
                'registered_judge_name': registered_judge_name,
                'guideline_count': guideline_count,  # Semantic memory - persisted in instructions
                'example_count': example_count,  # Episodic memory - not persisted
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

