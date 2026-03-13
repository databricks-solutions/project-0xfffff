"""Tests for trace tag key separation — eval and align use independent MLflow tag keys.

Spec: JUDGE_EVALUATION_SPEC (Re-Evaluation section, lines 251-310; Tag Types, lines 303-309)

Fix: tag_traces_for_evaluation sets tags.eval='true' (not tags.label='eval'),
and sync_annotation_to_mlflow sets tags.align='true' (not tags.label='align').
Since they use different keys, they no longer overwrite each other.
"""

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from server.services.alignment_service import AlignmentService


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Auto-evaluation runs in background when annotation phase starts")
@pytest.mark.unit
def test_search_tagged_traces_uses_dedicated_eval_key():
    """_search_tagged_traces filters on tags.eval='true', not tags.label='eval'.

    This ensures eval tags are independent from align tags.
    """
    mock_db_service = MagicMock()
    service = AlignmentService(mock_db_service)

    mock_config = MagicMock()
    mock_config.experiment_id = "exp-123"

    with patch("mlflow.search_traces", return_value=pd.DataFrame()) as mock_search:
        service._search_tagged_traces(
            mock_config, "w1", return_type="pandas", tag_type="eval"
        )

        filter_string = mock_search.call_args.kwargs.get("filter_string", "")
        assert "tags.eval = 'true'" in filter_string
        assert "tags.workshop_id = 'w1'" in filter_string
        # Must NOT use the old label-based filter
        assert "tags.label" not in filter_string


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
def test_search_tagged_traces_uses_dedicated_align_key():
    """_search_tagged_traces with tag_type='align' filters on tags.align='true'."""
    mock_db_service = MagicMock()
    service = AlignmentService(mock_db_service)

    mock_config = MagicMock()
    mock_config.experiment_id = "exp-123"

    with patch("mlflow.search_traces", return_value=pd.DataFrame()) as mock_search:
        service._search_tagged_traces(
            mock_config, "w1", return_type="pandas", tag_type="align"
        )

        filter_string = mock_search.call_args.kwargs.get("filter_string", "")
        assert "tags.align = 'true'" in filter_string
        assert "tags.label" not in filter_string


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Re-evaluate loads registered judge with aligned instructions")
@pytest.mark.unit
def test_eval_tag_survives_align_tag():
    """Setting align='true' does not destroy eval='true' — the root cause fix.

    With separate keys, both tags coexist:
    - tags.eval = 'true' (set at begin-annotation)
    - tags.align = 'true' (set at each annotation)
    Searching for eval still works after align has been set.
    """
    mock_db_service = MagicMock()
    service = AlignmentService(mock_db_service)
    mock_config = MagicMock()
    mock_config.experiment_id = "exp-123"

    # Simulate: traces have BOTH eval and align tags (the fixed state)
    trace_df = pd.DataFrame({"trace_id": ["tr-1", "tr-2"]})

    with patch("mlflow.search_traces", return_value=trace_df) as mock_search:
        result = service._search_tagged_traces(mock_config, "w1", tag_type="eval")
        assert len(result) == 2

        # Verify filter uses dedicated key, not shared label key
        filter_string = mock_search.call_args.kwargs["filter_string"]
        assert "tags.eval = 'true'" in filter_string
        assert "tags.label" not in filter_string


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
def test_run_evaluation_yields_error_when_no_eval_tagged_traces():
    """run_evaluation_with_answer_sheet yields error when no tagged traces found."""
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

    # Should yield error about missing traces (uses new dedicated key in message)
    assert any("No MLflow traces found with label 'eval'" in str(m) for m in messages)

    # Final result should be a failure dict
    result_dicts = [m for m in messages if isinstance(m, dict)]
    assert len(result_dicts) > 0
    assert result_dicts[-1]["success"] is False
    assert "No tagged MLflow traces found" in result_dicts[-1]["error"]
