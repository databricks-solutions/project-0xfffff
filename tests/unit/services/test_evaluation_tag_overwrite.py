"""Tests for evaluation tag search after annotation sync overwrites labels.

Spec: JUDGE_EVALUATION_SPEC (Re-Evaluation section, lines 251-310)

Root cause: tag_traces_for_evaluation sets tags.label='eval', but
sync_annotation_to_mlflow later sets tags.label='align' on the same traces.
Since MLflow tags are scalar, the 'eval' value is destroyed.
When re-evaluate searches for tags.label='eval', it finds nothing.
"""

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from server.services.alignment_service import AlignmentService


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
def test_search_tagged_traces_returns_empty_after_align_overwrite():
    """_search_tagged_traces returns no results when label was overwritten to 'align'.

    Simulates the deployed failure:
    1. Traces tagged label='eval' during begin-annotation
    2. Human annotates -> sync_annotation_to_mlflow sets label='align'
    3. Re-evaluate -> _search_tagged_traces(tag_type='eval') -> empty
    4. Error: "No MLflow traces found with label 'eval'"
    """
    mock_db_service = MagicMock()
    service = AlignmentService(mock_db_service)

    mock_config = MagicMock()
    mock_config.experiment_id = "exp-123"

    with patch("mlflow.search_traces", return_value=pd.DataFrame()) as mock_search:
        result = service._search_tagged_traces(
            mock_config, "w1", return_type="pandas", tag_type="eval"
        )

        # Verify the filter searches for eval label
        call_kwargs = mock_search.call_args
        filter_string = call_kwargs.kwargs.get("filter_string", "")
        assert "tags.label = 'eval'" in filter_string

        # Empty result — the production failure scenario
        assert result.empty


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
def test_run_evaluation_yields_error_when_no_eval_tagged_traces():
    """run_evaluation_with_answer_sheet yields the exact production error.

    Reproduces the deployed logs:
    - "Built MLflow-to-workshop trace mapping (13 traces)"
    - "ERROR: No MLflow traces found with label 'eval'"
    - "Re-evaluation failed: No tagged MLflow traces found"
    """
    mock_db_service = MagicMock()
    mock_db_service.get_traces.return_value = [
        MagicMock(id=f"t{i}", mlflow_trace_id=f"mlflow-t{i}")
        for i in range(13)
    ]

    service = AlignmentService(mock_db_service)

    mock_config = MagicMock()
    mock_config.experiment_id = "exp-123"
    mock_config.databricks_host = "https://test.databricks.com"
    mock_config.databricks_token = "test-token"

    with patch("mlflow.search_traces", return_value=pd.DataFrame()), \
         patch("mlflow.set_tracking_uri"), \
         patch("mlflow.genai.evaluate"):
        messages = list(service.run_evaluation_with_answer_sheet(
            workshop_id="w1",
            judge_name="accuracy_judge",
            judge_prompt="Evaluate accuracy",
            evaluation_model_name="test-model",
            mlflow_config=mock_config,
            judge_type="likert",
            require_human_ratings=False,
            tag_type="eval",
        ))

    # Should log the 13-trace mapping
    assert any("Built MLflow-to-workshop trace mapping (13 traces)" in str(m) for m in messages)

    # Should yield the exact error from production
    assert any("No MLflow traces found with label 'eval'" in str(m) for m in messages)

    # Final result should be a failure dict
    result_dicts = [m for m in messages if isinstance(m, dict)]
    assert len(result_dicts) > 0
    assert result_dicts[-1]["success"] is False
    assert "No tagged MLflow traces found" in result_dicts[-1]["error"]
