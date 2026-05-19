import pytest

from server.services.databricks_service import get_databricks_host, get_experiment_id, normalize_experiment_id


def test_normalize_experiment_id_strips_wrapping_quotes_and_whitespace():
    assert normalize_experiment_id('  "12345"  ') == "12345"
    assert normalize_experiment_id("  'abc-123'  ") == "abc-123"


def test_get_experiment_id_normalizes_env_value(monkeypatch):
    monkeypatch.setenv("MLFLOW_EXPERIMENT_ID", '  "12345"  ')
    assert get_experiment_id() == "12345"


def test_get_experiment_id_raises_for_empty_after_normalization(monkeypatch):
    monkeypatch.setenv("MLFLOW_EXPERIMENT_ID", '""')
    with pytest.raises(RuntimeError, match="MLFLOW_EXPERIMENT_ID not set"):
        get_experiment_id()


def test_get_databricks_host_adds_https_when_scheme_missing(monkeypatch):
    monkeypatch.setenv("DATABRICKS_HOST", "adb-1234567890123456.7.azuredatabricks.net/")
    assert get_databricks_host() == "https://adb-1234567890123456.7.azuredatabricks.net"


def test_get_databricks_host_preserves_existing_scheme(monkeypatch):
    monkeypatch.setenv("DATABRICKS_HOST", "https://dbc-example.cloud.databricks.com/")
    assert get_databricks_host() == "https://dbc-example.cloud.databricks.com"
