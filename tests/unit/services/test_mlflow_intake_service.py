from types import SimpleNamespace

from server.models import MLflowIntakeConfig, MLflowTraceInfo
from server.services.mlflow_intake_service import MLflowIntakeService


class _DummyDbService:
    def __init__(self):
        self.added_workshop_id = None
        self.added_traces = None

    def add_traces(self, workshop_id, traces):
        self.added_workshop_id = workshop_id
        self.added_traces = traces


def test_ingest_traces_sets_normalized_experiment_id(monkeypatch):
    db_service = _DummyDbService()
    service = MLflowIntakeService(db_service)
    config = MLflowIntakeConfig(experiment_id=' "12345" ', max_traces=1, filter_string=None)

    monkeypatch.setattr(
        service,
        "search_traces",
        lambda _config: [
            MLflowTraceInfo(
                trace_id="tr-1",
                request_preview="request",
                response_preview="response",
                status="OK",
                timestamp_ms=1,
            )
        ],
    )

    span = SimpleNamespace(
        name="span-1",
        span_type="LLM",
        inputs={"a": 1},
        outputs={"b": 2},
        start_time_ns=1,
        end_time_ns=2,
    )
    full_trace = SimpleNamespace(
        data=SimpleNamespace(spans=[span], request='{"messages": []}', response='{"messages": []}'),
        info=SimpleNamespace(execution_time_ms=10, status="OK", tags={"x": "y"}),
    )

    import server.services.mlflow_intake_service as intake_module

    monkeypatch.setattr(intake_module.mlflow, "get_trace", lambda trace_id: full_trace)
    monkeypatch.setattr(intake_module, "get_databricks_host", lambda: "https://dbc.example.com")

    ingested = service.ingest_traces("ws-1", config)

    assert ingested == 1
    assert db_service.added_workshop_id == "ws-1"
    assert len(db_service.added_traces) == 1
    assert db_service.added_traces[0].mlflow_experiment_id == "12345"
    assert db_service.added_traces[0].trace_metadata["mlflow_experiment_id"] == "12345"


def test_search_traces_uses_locations_argument(monkeypatch):
    db_service = _DummyDbService()
    service = MLflowIntakeService(db_service)
    config = MLflowIntakeConfig(experiment_id="exp-1", max_traces=5, filter_string=None)
    captured = {}

    def _fake_search_traces(**kwargs):
        captured.update(kwargs)
        return []

    import server.services.mlflow_intake_service as intake_module

    monkeypatch.setattr(intake_module.mlflow, "search_traces", _fake_search_traces)

    service.search_traces(config)

    assert captured["locations"] == ["exp-1"]
    assert "experiment_ids" not in captured
