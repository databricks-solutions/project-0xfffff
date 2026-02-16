import importlib
import os
import sys
from types import SimpleNamespace
import pytest

pytestmark = pytest.mark.spec("ASSISTED_FACILITATION_SPEC")


def _reload_discovery_dspy():
    # Ensure module-level autolog state is reset between tests.
    mod_name = "server.services.discovery_dspy"
    if mod_name in sys.modules:
        del sys.modules[mod_name]
    return importlib.import_module(mod_name)


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
def test_dspy_mlflow_autolog_is_noop_when_env_var_unset(monkeypatch):
    monkeypatch.delenv("MLFLOW_DSPY_DEV_EXPERIMENT_ID", raising=False)

    dspy_mod = _reload_discovery_dspy()

    # Should not raise, and should mark itself disabled.
    dspy_mod._maybe_enable_mlflow_dspy_autolog()
    assert dspy_mod._MLFLOW_DSPY_AUTOLOG_ENABLED is False


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
def test_dspy_mlflow_autolog_uses_experiment_id_from_env(monkeypatch):
    monkeypatch.setenv("MLFLOW_DSPY_DEV_EXPERIMENT_ID", "12345")

    calls = {"set_experiment": [], "autolog": []}

    class _FakeMlflowDSPy:
        @staticmethod
        def autolog(*, silent=False, **_kwargs):
            calls["autolog"].append({"silent": silent})

    class _FakeMlflow:
        dspy = _FakeMlflowDSPy

        @staticmethod
        def set_tracking_uri(_uri: str):
            # Not asserting this in the test because the module only sets it when
            # MLFLOW_TRACKING_URI is unset, but it may still be called here.
            return None

        @staticmethod
        def set_experiment(*, experiment_id=None, experiment_name=None):
            calls["set_experiment"].append({"experiment_id": experiment_id, "experiment_name": experiment_name})
            return SimpleNamespace(experiment_id=experiment_id, name=experiment_name)

    # Patch imports inside the module under test.
    monkeypatch.setitem(sys.modules, "mlflow", _FakeMlflow)
    monkeypatch.setitem(sys.modules, "mlflow.dspy", _FakeMlflowDSPy)

    dspy_mod = _reload_discovery_dspy()

    dspy_mod._maybe_enable_mlflow_dspy_autolog()
    assert dspy_mod._MLFLOW_DSPY_AUTOLOG_ENABLED is True
    assert calls["set_experiment"] == [{"experiment_id": "12345", "experiment_name": None}]
    assert calls["autolog"] == [{"silent": True}]
