"""Fixtures for MLflow contract tests.

Provides canonical mock objects whose shapes match the real MLflow API,
so contract tests can verify that our code handles these shapes correctly.
"""

from unittest.mock import MagicMock

import pytest


@pytest.fixture()
def mock_trace():
    """Canonical MLflow trace object matching the real API shape."""
    trace = MagicMock()

    # trace.info
    trace.info.request_id = "tr-abc123"
    trace.info.status = "OK"
    trace.info.execution_time_ms = 150
    trace.info.timestamp_ms = 1700000000000
    trace.info.tags = {"mlflow.source": "test", "workshop_id": "ws-1"}
    trace.info.assessments = []

    # trace.data
    trace.data.request = '{"messages": [{"role": "user", "content": "Hello"}]}'
    trace.data.response = '{"choices": [{"message": {"content": "Hi there"}}]}'

    span = MagicMock()
    span.name = "ChatModel"
    span.span_type = "LLM"
    span.inputs = {"messages": [{"role": "user", "content": "Hello"}]}
    span.outputs = {"choices": [{"message": {"content": "Hi there"}}]}
    trace.data.spans = [span]

    return trace


@pytest.fixture()
def mock_assessment():
    """Canonical MLflow assessment object."""
    assessment = MagicMock()
    assessment.name = "helpfulness"
    assessment.value = 4.0
    assessment.source.source_type = "HUMAN"
    assessment.source.source_id = "user-123"
    assessment.rationale = "Very helpful response"
    return assessment


@pytest.fixture()
def mock_experiment():
    """Canonical MLflow experiment object."""
    experiment = MagicMock()
    experiment.experiment_id = "exp-456"
    experiment.name = "test-experiment"
    experiment.lifecycle_stage = "active"
    return experiment
