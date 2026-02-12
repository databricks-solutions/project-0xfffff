"""Service for managing judge prompt evaluation and tuning."""

import json
import os
import random
import uuid
from typing import Any, Dict, List

import numpy as np
from fastapi import HTTPException
from sklearn.metrics import accuracy_score, cohen_kappa_score, confusion_matrix

from server.models import (
  JudgeEvaluation,
  JudgeEvaluationDirectRequest,
  JudgeEvaluationRequest,
  JudgeEvaluationResult,
  JudgeExportConfig,
  JudgePerformanceMetrics,
  JudgePrompt,
)
from server.services.database_service import DatabaseService

try:
  import mlflow
  from mlflow.metrics.genai import make_genai_metric_from_prompt

  MLFLOW_AVAILABLE = True
except ImportError:
  MLFLOW_AVAILABLE = False


class JudgeService:
  """Service for judge prompt evaluation and management."""

  def __init__(self, db_service: DatabaseService):
    self.db_service = db_service

  def evaluate_prompt(self, workshop_id: str, evaluation_request: JudgeEvaluationRequest) -> JudgePerformanceMetrics:
    """Evaluate a judge prompt against human annotations."""
    # Get the prompt
    prompt = self.db_service.get_judge_prompt(workshop_id, evaluation_request.prompt_id)
    if not prompt:
      raise ValueError(f'Judge prompt {evaluation_request.prompt_id} not found')

    # Clear old cached evaluations for this prompt to prevent stale data
    self.db_service.clear_judge_evaluations(workshop_id, evaluation_request.prompt_id)

    # Get annotations for evaluation
    annotations = self.db_service.get_annotations(workshop_id)
    if not annotations:
      raise ValueError('No annotations found for evaluation')

    # Filter to specific traces if requested
    if evaluation_request.trace_ids:
      annotations = [a for a in annotations if a.trace_id in evaluation_request.trace_ids]

    # Check if we should use real MLflow or simulation
    # IMPORTANT: Use override_model from UI if provided (e.g., user selected 'demo')
    effective_model = evaluation_request.override_model if evaluation_request.override_model else prompt.model_name
    use_mlflow = effective_model != 'demo' and MLFLOW_AVAILABLE

    # Add debug logging to track what's happening
    print(
      f"""Judge evaluation: saved_model='{prompt.model_name}',
      override_model='{evaluation_request.override_model}', effective_model='{effective_model}',
      use_mlflow={use_mlflow}, MLFLOW_AVAILABLE={MLFLOW_AVAILABLE}"""
    )

    # Get MLflow configuration if needed
    mlflow_config = None
    if use_mlflow:
      mlflow_config = self.db_service.get_mlflow_config(workshop_id)
      if not mlflow_config:
        # No fallback - raise error
        raise HTTPException(
          status_code=400,
          detail='MLflow configuration required for AI judge evaluation. Configure in Intake phase.',
        )

      # Get token from memory storage
      from server.services.token_storage_service import token_storage

      databricks_token = token_storage.get_token(workshop_id)
      if not databricks_token:
        databricks_token = self.db_service.get_databricks_token(workshop_id)
        if databricks_token:
          token_storage.store_token(workshop_id, databricks_token)
      if not databricks_token:
        raise HTTPException(
          status_code=400,
          detail='Databricks token not found. Please configure MLflow intake with your token.',
        )

      # Validate MLflow credentials before proceeding
      if not mlflow_config.databricks_host:
        raise HTTPException(status_code=400, detail='Invalid MLflow configuration: missing Databricks host')

      # Update the config with the token from memory
      mlflow_config.databricks_token = databricks_token

      # Validate the effective model has a valid non-demo model
      if not effective_model or effective_model == 'demo':
        raise HTTPException(
          status_code=400,
          detail='Cannot use MLflow evaluation with demo model. Select a real model (databricks-*, openai-*)',
        )

    # Calculate mode-based ground truth at the evaluate_prompt level for meaningful aggregation
    from collections import Counter

    # Group annotations by trace_id and calculate mode (most common rating) as ground truth
    trace_ground_truth = {}
    trace_objects = {}

    for annotation in annotations:
      trace_id = annotation.trace_id
      if trace_id not in trace_ground_truth:
        trace_ground_truth[trace_id] = []
        # Get trace object
        trace = self.db_service.get_trace(trace_id)
        if trace:
          trace_objects[trace_id] = trace

      trace_ground_truth[trace_id].append(annotation.rating)

    # Calculate mode for each trace and create unique evaluations
    unique_evaluations = []
    for trace_id, ratings in trace_ground_truth.items():
      if trace_id in trace_objects:
        # Calculate mode (most common rating)
        rating_counts = Counter(ratings)
        mode_rating = rating_counts.most_common(1)[0][0]  # Most frequent rating

        trace = trace_objects[trace_id]

        # Evaluate using either MLflow or simulation
        if use_mlflow:
          try:
            predicted_rating, reasoning = self._evaluate_with_mlflow(workshop_id, prompt, trace.input, trace.output, mlflow_config)
          except Exception as e:
            # Don't fallback - propagate the error
            raise HTTPException(status_code=503, detail=f'MLflow evaluation failed: {str(e)}')
        else:
          predicted_rating = self._simulate_judge_rating(prompt.prompt_text, trace.input, trace.output, mode_rating)
          reasoning = 'Test judge evaluation (development mode)'

        evaluation = JudgeEvaluation(
          id=str(uuid.uuid4()),
          workshop_id=workshop_id,
          prompt_id=evaluation_request.prompt_id,
          trace_id=trace_id,
          predicted_rating=predicted_rating,
          human_rating=mode_rating,  # Use mode-based ground truth
          confidence=None,  # Don't fake confidence values
          reasoning=reasoning,
        )
        unique_evaluations.append(evaluation)

    # Store evaluations in database
    self.db_service.store_judge_evaluations(unique_evaluations)

    # Calculate performance metrics
    metrics = self._calculate_performance_metrics(unique_evaluations)

    # Update prompt with performance metrics
    self.db_service.update_judge_prompt_metrics(evaluation_request.prompt_id, metrics.__dict__)

    return metrics

  def evaluate_prompt_direct(self, workshop_id: str, evaluation_request: JudgeEvaluationDirectRequest) -> JudgeEvaluationResult:
    """Evaluate a judge prompt without saving it to history."""
    # Create a temporary prompt object for evaluation
    from datetime import datetime

    temp_prompt = JudgePrompt(
      id='temp',  # Temporary ID
      workshop_id=workshop_id,
      prompt_text=evaluation_request.prompt_text,
      version=0,  # Temporary version
      few_shot_examples=[],
      model_name=evaluation_request.model_name,
      model_parameters=evaluation_request.model_parameters,
      created_by='temp',
      created_at=datetime.now(),
      performance_metrics=None,
    )

    # Get annotations for evaluation
    annotations = self.db_service.get_annotations(workshop_id)
    if not annotations:
      raise ValueError('No annotations found for evaluation')

    # Filter to specific traces if requested
    if evaluation_request.trace_ids:
      annotations = [a for a in annotations if a.trace_id in evaluation_request.trace_ids]

    # Use the model from the request
    use_mlflow = evaluation_request.model_name != 'demo' and MLFLOW_AVAILABLE

    # Get MLflow configuration if needed
    mlflow_config = None
    if use_mlflow:
      mlflow_config = self.db_service.get_mlflow_config(workshop_id)
      if not mlflow_config:
        raise HTTPException(
          status_code=400,
          detail='MLflow configuration required for AI judge evaluation. Configure in Intake phase.',
        )

      # Validate MLflow credentials before proceeding
      if not mlflow_config.databricks_host or not mlflow_config.databricks_token:
        raise HTTPException(status_code=400, detail='Invalid MLflow configuration: missing Databricks host or token')

    # Calculate mode-based ground truth
    from collections import Counter

    # Group annotations by trace_id and calculate mode (most common rating) as ground truth
    trace_ground_truth = {}
    trace_objects = {}

    for annotation in annotations:
      trace_id = annotation.trace_id
      if trace_id not in trace_ground_truth:
        trace_ground_truth[trace_id] = []
        # Get trace object
        trace = self.db_service.get_trace(trace_id)
        if trace:
          trace_objects[trace_id] = trace

      trace_ground_truth[trace_id].append(annotation.rating)

    # Calculate mode for each trace and create unique evaluations
    unique_evaluations = []
    for trace_id, ratings in trace_ground_truth.items():
      if trace_id in trace_objects:
        # Calculate mode (most common rating)
        rating_counts = Counter(ratings)
        mode_rating = rating_counts.most_common(1)[0][0]

        trace = trace_objects[trace_id]

        # Evaluate using either MLflow or simulation
        if use_mlflow:
          try:
            predicted_rating, reasoning = self._evaluate_with_mlflow(workshop_id, temp_prompt, trace.input, trace.output, mlflow_config)
          except Exception as e:
            raise HTTPException(status_code=503, detail=f'MLflow evaluation failed: {str(e)}')
        else:
          predicted_rating = self._simulate_judge_rating(temp_prompt.prompt_text, trace.input, trace.output, mode_rating)
          reasoning = 'Test judge evaluation (development mode)'

        evaluation = JudgeEvaluation(
          id=str(uuid.uuid4()),
          workshop_id=workshop_id,
          prompt_id='temp',  # Temporary prompt ID
          trace_id=trace_id,
          predicted_rating=predicted_rating,
          human_rating=mode_rating,
          confidence=None,
          reasoning=reasoning,
        )
        unique_evaluations.append(evaluation)

    # Calculate performance metrics (don't store evaluations)
    metrics = self._calculate_performance_metrics(unique_evaluations)
    metrics.prompt_id = 'temp'  # Set temporary prompt ID for metrics

    # Return both metrics and evaluations for UI display
    return JudgeEvaluationResult(metrics=metrics, evaluations=unique_evaluations)

  def _evaluate_with_mlflow(self, workshop_id: str, prompt: JudgePrompt, input_text: str, output_text: str, mlflow_config) -> tuple[int, str]:
    """Evaluate using real MLflow LLM judge."""
    # Set up MLflow with Databricks credentials
    os.environ['DATABRICKS_HOST'] = mlflow_config.databricks_host.rstrip('/')
    os.environ['DATABRICKS_TOKEN'] = mlflow_config.databricks_token

    # Validate credentials format
    if not mlflow_config.databricks_host.startswith('https://'):
      raise ValueError('Databricks host must start with https://')
    if not mlflow_config.databricks_token.startswith('dapi'):
      print(f"Warning: Databricks token should typically start with 'dapi'. Current token starts with: {mlflow_config.databricks_token[:10]}...")

    # Initialize MLflow with proper experiment context
    try:
      # Use same method as intake service - "databricks" URI with environment variables
      # This leverages databricks-sdk for authentication which works reliably
      mlflow.set_tracking_uri('databricks')

      # Use existing experiment from MLflow config instead of creating new ones
      # NOTE: Default experiment ID '0' often requires special permissions in Databricks
      if hasattr(mlflow_config, 'experiment_id') and mlflow_config.experiment_id:
        # Use the experiment_id from intake config directly
        experiment_id = mlflow_config.experiment_id
      elif hasattr(mlflow_config, 'experiment_name') and mlflow_config.experiment_name:
        experiment_name = mlflow_config.experiment_name
        try:
          experiment = mlflow.get_experiment_by_name(experiment_name)
          if experiment:
            experiment_id = experiment.experiment_id
          else:
            # Try to create experiment if it doesn't exist
            experiment_id = mlflow.create_experiment(experiment_name)
        except Exception as exp_err:
          # Don't fall back to experiment '0' - it often has permission issues
          error_msg = str(exp_err)
          if 'PERMISSION_DENIED' in error_msg:
            raise ValueError(
              'Permission denied accessing MLflow experiments. Please configure an experiment in Intake phase with proper permissions.'
            )
          else:
            raise ValueError(f"Could not access experiment '{experiment_name}': {error_msg}")
      else:
        # Don't default to experiment '0' - require explicit config
        raise ValueError('No MLflow experiment configured. Please configure an experiment ID in the Intake phase.')

      mlflow.set_experiment(experiment_id=experiment_id)

      # Test the connection by trying to get experiment info
      try:
        current_exp = mlflow.get_experiment(experiment_id)
        print(f'Successfully connected to MLflow experiment: {current_exp.name if current_exp else "Default"}')
      except Exception as test_err:
        print(f'Warning: Could not verify MLflow experiment connection: {test_err}')

    except Exception as e:
      # Provide helpful error messages for common issues
      error_msg = str(e)
      if '401' in error_msg or 'credential' in error_msg.lower():
        raise ValueError(f'MLflow authentication failed. Please check your Databricks token. Error: {error_msg}')
      elif '404' in error_msg or 'not found' in error_msg.lower():
        raise ValueError(f'MLflow tracking server not found. Please verify your Databricks host URL. Error: {error_msg}')
      elif 'databricks-sdk' in error_msg:
        raise ValueError(f'Databricks SDK authentication issue. Using direct URL method but got: {error_msg}')
      else:
        raise ValueError(f'Failed to initialize MLflow experiment: {error_msg}')

    # Determine model URI based on model name
    if prompt.model_name.startswith('databricks-'):
      model_uri = f'databricks:/{prompt.model_name}'
    elif prompt.model_name.startswith('openai-'):
      model_name = prompt.model_name.replace('openai-', '')
      model_uri = f'openai:/{model_name}'
    else:
      raise ValueError(f'Unsupported model: {prompt.model_name}')

    # MLflow expects the prompt TEMPLATE with placeholders, not a formatted prompt
    # Replace {input} with {inputs} and {output} with {outputs} for MLflow compatibility
    mlflow_prompt_template = prompt.prompt_text.replace('{input}', '{inputs}').replace('{output}', '{outputs}')

    # Create the metric with the TEMPLATE (MLflow will do the formatting)
    try:
      metric = make_genai_metric_from_prompt(
        name='workshop_judge',
        judge_prompt=mlflow_prompt_template,  # Pass template, not formatted prompt!
        model=model_uri,
        parameters=prompt.model_parameters or {'temperature': 0.0, 'max_tokens': 10},
      )
    except Exception as e:
      raise ValueError(f'Failed to create MLflow metric: {str(e)}')

    # Evaluate single trace using MLflow
    import pandas as pd

    # Create single-row evaluation dataset
    # Use 'input' and 'output' (singular) as column names
    eval_df = pd.DataFrame([{'input': input_text, 'output': output_text}])

    try:
      # Run MLflow evaluation with explicit column mapping
      results = mlflow.evaluate(
        data=eval_df,
        predictions='output',
        model_type='text',
        extra_metrics=[metric],
        evaluator_config={
          'col_mapping': {
            'inputs': 'input',  # Map 'inputs' in prompt to 'input' column
            'outputs': 'output',  # Map 'outputs' in prompt to 'output' column
          }
        },
      )
    except Exception as e:
      raise ValueError(f'MLflow evaluation failed: {str(e)}')

    # Extract rating from results - fail explicitly if not found
    if not hasattr(results, 'metrics') or not results.metrics:
      raise ValueError('MLflow evaluation returned no metrics')

    metric_results = results.metrics

    # Debug: Log what MLflow returned
    print(f'MLflow metrics available: {list(metric_results.keys())}')
    print(f'Full metrics: {metric_results}')

    # Look for the specific workshop_judge/mean key
    expected_key = 'workshop_judge/mean'

    if expected_key not in metric_results:
      # Log all available keys for debugging
      available_keys = list(metric_results.keys())
      raise ValueError(
        f"Expected '{expected_key}' not found in MLflow results. "
        f'Available keys: {available_keys}. '
        f'This indicates either a bug in our metric creation or an MLflow API change.'
      )

    score = metric_results[expected_key]
    print(f'MLflow score for trace: {score}')

    # Validate score is numeric (but don't assume range - user controls this)
    if not isinstance(score, (int, float)):
      raise ValueError(f'Expected numeric score, got {type(score)}: {score}')

    # Check for NaN values which can occur if MLflow evaluation fails
    import math

    if math.isnan(score):
      raise ValueError(
        'MLflow returned NaN for the judge score. This typically means the LLM could not parse a numeric rating from the response. '
        'Check the MLflow run at the Databricks URL in the logs to see the actual LLM response. '
        'Make sure your judge prompt clearly instructs the model to return a numeric rating.'
      )

    # Convert to integer rating (user's prompt should produce appropriate range)
    rating = int(round(score))
    reasoning = f'MLflow judge evaluation (score: {score:.2f})'

    return rating, reasoning

  def _simulate_judge_rating(self, prompt: str, input_text: str, output_text: str, human_rating: int) -> int:
    """Simulate an LLM judge rating for demo mode."""
    # Baseline simulation: GPT-3.5-level performance
    # Creates ~70-80% correlation with human ratings
    base_rating = human_rating

    # Simulate systematic bias: baseline judge tends to be slightly more lenient
    bias = 0.3  # Slight upward bias

    # Add variation based on prompt quality
    if 'specific' in prompt.lower() or 'detailed' in prompt.lower():
      # Better prompts have higher correlation (simulating GPT-4 level)
      variation = random.choice([-1, 0, 0, 0, 1])
    else:
      # Basic prompts have more variation (simulating GPT-3.5 level)
      variation = random.choice([-2, -1, 0, 1, 2])

    # Add occasional random noise (10% chance of bigger disagreement)
    noise = random.choice([-1, 0, 1]) if random.random() < 0.1 else 0

    # Calculate final rating
    predicted_raw = base_rating + bias + variation + noise
    predicted = max(1, min(5, round(predicted_raw)))

    return predicted

  def _calculate_performance_metrics(self, evaluations: List[JudgeEvaluation]) -> JudgePerformanceMetrics:
    """Calculate performance metrics for judge evaluations."""
    if not evaluations:
      raise ValueError('No evaluations to calculate metrics from')

    human_ratings = [e.human_rating for e in evaluations]
    predicted_ratings = [e.predicted_rating for e in evaluations]

    # Debug logging
    print(f'🔍 Calculating metrics for {len(evaluations)} evaluations')
    print(f'🔍 Human ratings: {human_ratings}')
    print(f'🔍 Predicted ratings: {predicted_ratings}')
    print(f'🔍 Human ratings variance: {np.var(human_ratings)}')
    print(f'🔍 Predicted ratings variance: {np.var(predicted_ratings)}')

    # Calculate Cohen's kappa (inter-rater reliability for categorical data)
    try:
      kappa = cohen_kappa_score(human_ratings, predicted_ratings)
      print(f"🔍 Cohen's kappa: {kappa}")

      # Handle edge cases where kappa might be NaN or undefined
      if np.isnan(kappa):
        # Fallback to simple agreement when kappa is undefined
        matches = sum(1 for h, p in zip(human_ratings, predicted_ratings) if h == p)
        kappa = matches / len(evaluations)  # Simple agreement ratio
        print(f'🔍 Kappa undefined, using agreement ratio: {kappa}')
    except Exception as e:
      # If kappa calculation fails for any reason, use simple agreement
      print(f'🔍 Kappa calculation failed: {e}, using agreement ratio')
      matches = sum(1 for h, p in zip(human_ratings, predicted_ratings) if h == p)
      kappa = matches / len(evaluations)  # Simple agreement ratio

    # Calculate accuracy (exact match)
    accuracy = accuracy_score(human_ratings, predicted_ratings)

    # Calculate agreement by rating level
    agreement_by_rating = {}
    for rating in range(1, 6):
      human_at_rating = [h for h, p in zip(human_ratings, predicted_ratings) if h == rating]
      predicted_at_rating = [p for h, p in zip(human_ratings, predicted_ratings) if h == rating]
      if human_at_rating:
        agreement_by_rating[str(rating)] = accuracy_score(human_at_rating, predicted_at_rating)
      else:
        agreement_by_rating[str(rating)] = 0.0

    # Calculate confusion matrix
    cm = confusion_matrix(human_ratings, predicted_ratings, labels=[1, 2, 3, 4, 5])

    return JudgePerformanceMetrics(
      prompt_id=evaluations[0].prompt_id,
      correlation=float(kappa) if not np.isnan(kappa) else 0.0,  # Using kappa instead of correlation
      accuracy=float(accuracy),
      mean_absolute_error=0.0,  # Deprecated, kept for backwards compatibility
      agreement_by_rating=agreement_by_rating,
      confusion_matrix=cm.tolist(),
      total_evaluations=len(evaluations),
    )

  def export_judge(self, workshop_id: str, export_config: JudgeExportConfig) -> Dict[str, Any]:
    """Export a judge configuration for production use."""
    # Get the prompt
    prompt = self.db_service.get_judge_prompt(workshop_id, export_config.prompt_id)
    if not prompt:
      raise ValueError(f'Judge prompt {export_config.prompt_id} not found')

    # Get rubric for context
    rubric = self.db_service.get_rubric(workshop_id)

    # Get few-shot examples if requested
    few_shot_examples = []
    if export_config.include_examples and prompt.few_shot_examples:
      for trace_id in prompt.few_shot_examples:
        trace = self.db_service.get_trace(trace_id)
        annotations = self.db_service.get_annotations(workshop_id, user_id=None)
        trace_annotations = [a for a in annotations if a.trace_id == trace_id]

        if trace and trace_annotations:
          # Use the most common rating if multiple annotations
          ratings = [a.rating for a in trace_annotations]
          most_common_rating = max(set(ratings), key=ratings.count)

          few_shot_examples.append(
            {
              'input': trace.input,
              'output': trace.output,
              'rating': most_common_rating,
              'reasoning': f'This response rates {most_common_rating}/5 based on the evaluation criteria.',
            }
          )

    # Format based on export type
    if export_config.export_format == 'json':
      return {
        'judge_config': {
          'prompt': prompt.prompt_text,
          'rubric_question': rubric.question if rubric else None,
          'few_shot_examples': few_shot_examples,
          'rating_scale': '1-5',
          'performance_metrics': prompt.performance_metrics,
        },
        'metadata': {
          'workshop_id': workshop_id,
          'prompt_id': prompt.id,
          'version': prompt.version,
          'created_at': prompt.created_at.isoformat(),
          'created_by': prompt.created_by,
        },
      }

    elif export_config.export_format == 'python':
      # Generate Python code for MLflow
      model_str = f"'{prompt.model_name}'" if prompt.model_name != 'demo' else "'databricks-dbrx-instruct'"  # Default to DBRX

      python_code = f'''
"""
MLflow Judge Metric
Generated from Workshop: {workshop_id}
Prompt Version: {prompt.version}
Model: {prompt.model_name}
Performance: {prompt.performance_metrics.get('correlation', 0) * 100:.1f}% correlation with human ratings
"""

import mlflow
from mlflow.metrics.genai import make_genai_metric_from_prompt

# Judge prompt template
JUDGE_PROMPT = """{prompt.prompt_text}"""

# Model configuration
MODEL_NAME = {model_str}
MODEL_PARAMETERS = {json.dumps(prompt.model_parameters or {'temperature': 0.0, 'max_tokens': 10}, indent=4)}

# Create the judge metric
judge_metric = make_genai_metric_from_prompt(
    judge_prompt=JUDGE_PROMPT,
    model=MODEL_NAME,
    parameters=MODEL_PARAMETERS,
    metric_name="workshop_judge",
    metric_description="Judge trained on workshop annotations"
)

# Example usage:
# results = mlflow.evaluate(
#     data=eval_df,
#     predictions="model_output",
#     model_type="text",
#     extra_metrics=[judge_metric]
# )

# Few-shot examples from workshop:
examples = {json.dumps(few_shot_examples[:3], indent=4)}
'''
      return {'code': python_code, 'filename': f'mlflow_judge_{prompt.version}.py'}

    elif export_config.export_format == 'mlflow' or export_config.export_format == 'json':
      # Generate MLflow metric configuration
      return {
        'mlflow_metric': {
          'metric_name': f'workshop_judge_v{prompt.version}',
          'prompt_template': prompt.prompt_text,
          'model': prompt.model_name,
          'model_parameters': prompt.model_parameters or {'temperature': 0.0, 'max_tokens': 10},
          'few_shot_examples': few_shot_examples,
          'performance_metrics': prompt.performance_metrics,
        },
        'metadata': {
          'workshop_id': workshop_id,
          'prompt_id': prompt.id,
          'version': prompt.version,
          'created_at': prompt.created_at.isoformat(),
          'created_by': prompt.created_by,
        },
      }

    elif export_config.export_format == 'notebook':
      # Generate Databricks notebook format
      notebook_content = {
        'version': '1',
        'cells': [
          {
            'cell_type': 'markdown',
            'source': f"""# MLflow Judge from Workshop\n\nThis judge was trained on {len(few_shot_examples)}
            annotated examples with {(prompt.performance_metrics.get('correlation', 0) * 100):.1f}%
            correlation to human ratings.""",  # noqa: E501
          },
          {
            'cell_type': 'code',
            'source': """# Install dependencies\n%pip install mlflow[genai]>=2.0\ndbutils.library.restartPython()""",
          },
          {
            'cell_type': 'code',
            'source': f"""import mlflow\nfrom mlflow.metrics.genai import make_genai_metric_from_prompt\nimport pandas as pd\n\n
            # Judge configuration\nJUDGE_PROMPT = \"\"\"{prompt.prompt_text}\"\"\"\n\nMODEL_NAME = '{prompt.model_name}'\n
            # MODEL_PARAMETERS = {json.dumps(prompt.model_parameters or {'temperature': 0.0})}""",  # noqa: E501
          },
          {
            'cell_type': 'code',
            'source': """# Create the judge metric\njudge_metric = make_genai_metric_from_prompt(\n    judge_prompt=JUDGE_PROMPT,\n
            model=MODEL_NAME,\n    parameters=MODEL_PARAMETERS\n)""",  # noqa: E501
          },
          {
            'cell_type': 'code',
            'source': """# Example evaluation\neval_df = pd.DataFrame([\n
            {{"input": "What is MLflow?", "output": "MLflow is an open-source platform for ML lifecycle management."}},\n
            {{"input": "Explain transformers", "output": "Transformers are a neural network architecture..."}}\n])
            \n\nresults = mlflow.evaluate(\n    data=eval_df,\n    predictions="output",\n    model_type="text",\n
            extra_metrics=[judge_metric]\n)\n\nprint(results.metrics)\nresults.tables['eval_results_table'].show()""",  # noqa: E501
          },
        ],
      }
      return {
        'notebook': notebook_content,
        'filename': f'mlflow_judge_workshop_{prompt.version}.ipynb',
      }

    else:
      raise ValueError(f'Unsupported export format: {export_config.export_format}')

  def select_few_shot_examples(self, workshop_id: str, num_examples: int = 3) -> List[str]:
    """Intelligently select few-shot examples from annotations."""
    annotations = self.db_service.get_annotations(workshop_id)

    if len(annotations) < num_examples:
      return [a.trace_id for a in annotations]

    # Group by rating to get diverse examples
    by_rating = {}
    for annotation in annotations:
      if annotation.rating not in by_rating:
        by_rating[annotation.rating] = []
      by_rating[annotation.rating].append(annotation)

    selected = []
    ratings = sorted(by_rating.keys())

    # Try to get examples from different rating levels
    for rating in ratings:
      if len(selected) >= num_examples:
        break
      # Select one example from this rating level
      examples_at_rating = by_rating[rating]
      selected.append(random.choice(examples_at_rating).trace_id)

    # Fill remaining slots randomly if needed
    remaining_annotations = [a for a in annotations if a.trace_id not in selected]
    while len(selected) < num_examples and remaining_annotations:
      selected.append(random.choice(remaining_annotations).trace_id)
      remaining_annotations = [a for a in remaining_annotations if a.trace_id != selected[-1]]

    return selected
