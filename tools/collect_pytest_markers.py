"""Collect pytest spec/req markers without running tests.

Uses pytest's collection API with a custom plugin to extract
@pytest.mark.spec and @pytest.mark.req marker values.

Usage:
    uv run python tools/collect_pytest_markers.py

Outputs a single JSON line to stdout with all spec-tagged test items.
"""

import json
import sys

import pytest


class MarkerCollector:
    """pytest plugin that collects spec/req markers during test collection."""

    def __init__(self):
        self.items: list[dict] = []

    def pytest_collection_modifyitems(self, items):
        for item in items:
            spec = req = None
            is_integration = False
            for marker in item.iter_markers():
                if marker.name == "spec" and marker.args:
                    spec = marker.args[0]
                elif marker.name == "req" and marker.args:
                    req = marker.args[0]
                elif marker.name == "integration":
                    is_integration = True
            if spec:
                self.items.append(
                    {
                        "nodeid": item.nodeid,
                        "spec": spec,
                        "req": req,
                        "integration": is_integration,
                        "lineno": item.reportinfo()[1],
                    }
                )

    def pytest_collection_finish(self, session):
        # Print JSON to stdout on a single tagged line for easy parsing
        print("MARKER_JSON:" + json.dumps(self.items), file=sys.stdout)


if __name__ == "__main__":
    collector = MarkerCollector()
    sys.exit(
        pytest.main(
            [
                "--collect-only",
                "-q",
                "--no-header",
                "--override-ini=addopts=",
                "-p",
                "no:cacheprovider",
                "tests/",
            ],
            plugins=[collector],
        )
    )
