"""Regression tests for dialect-specific migration defaults."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace


def _load_migration(filename: str):
    path = Path(__file__).resolve().parents[2] / "migrations" / "versions" / filename
    spec = importlib.util.spec_from_file_location(filename.replace(".py", ""), path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_participant_notes_boolean_default_is_postgres_boolean(monkeypatch):
    migration = _load_migration("0010_add_participant_notes.py")
    bind = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))
    monkeypatch.setattr(migration.op, "get_bind", lambda: bind)

    assert str(migration._boolean_false_default()) == "FALSE"


def test_participant_notes_boolean_default_is_sqlite_integer(monkeypatch):
    migration = _load_migration("0010_add_participant_notes.py")
    bind = SimpleNamespace(dialect=SimpleNamespace(name="sqlite"))
    monkeypatch.setattr(migration.op, "get_bind", lambda: bind)

    assert str(migration._boolean_false_default()) == "0"
