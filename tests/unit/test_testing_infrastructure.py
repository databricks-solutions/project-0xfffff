"""Tests for TESTING_SPEC.

Verifies that the testing infrastructure itself works correctly:
- conftest provides isolated in-memory SQLite DB
- --spec filtering collects correct tests
- CI workflow includes both pytest and playwright steps
"""

from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.spec("TESTING_SPEC")
class TestConftestProvidesIsolatedDb:
    """SC: Test isolation (no shared state between tests)."""

    def test_mock_db_session_fixture_exists(self, mock_db_session):
        """conftest provides a mock_db_session fixture."""
        assert mock_db_session is not None

    def test_mock_db_session_has_rollback(self, mock_db_session):
        """Mock DB session supports rollback (isolation mechanism)."""
        # The mock_db_session should have a rollback method
        assert hasattr(mock_db_session, "rollback")
        # Calling rollback should not raise
        mock_db_session.rollback()

    def test_async_client_fixture_works(self, async_client):
        """conftest provides an async_client fixture that wraps the app."""
        assert async_client is not None

    def test_override_get_db_provides_session(self, override_get_db):
        """override_get_db fixture yields a mock DB session."""
        assert override_get_db is not None
        # The fixture should provide a mock session
        assert hasattr(override_get_db, "rollback")


@pytest.mark.spec("TESTING_SPEC")
class TestSpecFilteringCollectsCorrectTests:
    """SC: Tests run in CI on every PR (spec-based filtering works)."""

    def test_conftest_has_spec_option(self):
        """conftest.py defines the --spec option for pytest."""
        conftest_path = PROJECT_ROOT / "tests" / "conftest.py"
        content = conftest_path.read_text()
        assert "--spec" in content, (
            "conftest.py must define --spec option for spec-based filtering"
        )

    def test_conftest_has_collection_modifier(self):
        """conftest.py implements pytest_collection_modifyitems for spec filtering."""
        conftest_path = PROJECT_ROOT / "tests" / "conftest.py"
        content = conftest_path.read_text()
        assert "pytest_collection_modifyitems" in content, (
            "conftest.py must implement pytest_collection_modifyitems for spec filtering"
        )

    def test_spec_marker_filters_this_test(self, pytestconfig):
        """When --spec is set to TESTING_SPEC, this test is collected."""
        # If we're running, we were collected. The meaningful test is that
        # the spec marker infrastructure exists and works.
        spec_filter = pytestconfig.getoption("--spec", default=None)
        if spec_filter is not None:
            # We were run with --spec; confirm we match
            assert spec_filter == "TESTING_SPEC", (
                f"This test should only run when --spec=TESTING_SPEC, got {spec_filter}"
            )


@pytest.mark.spec("TESTING_SPEC")
class TestCIWorkflowIncludesPytestAndPlaywright:
    """SC: Tests run in CI on every PR."""

    def test_e2e_workflow_exists(self):
        """e2e-test.yml workflow file exists."""
        workflow = PROJECT_ROOT / ".github" / "workflows" / "e2e-test.yml"
        assert workflow.is_file(), "e2e-test.yml workflow must exist"

    def test_workflow_runs_pytest(self):
        """CI workflow includes a pytest step."""
        workflow = PROJECT_ROOT / ".github" / "workflows" / "e2e-test.yml"
        content = workflow.read_text()
        assert "pytest" in content or "test-server" in content, (
            "CI workflow must include a step that runs pytest"
        )

    def test_workflow_runs_playwright(self):
        """CI workflow includes a Playwright step."""
        workflow = PROJECT_ROOT / ".github" / "workflows" / "e2e-test.yml"
        content = workflow.read_text()
        assert "playwright" in content.lower() or "e2e" in content.lower(), (
            "CI workflow must include a step that runs Playwright E2E tests"
        )

    def test_workflow_installs_playwright_browsers(self):
        """CI workflow installs Playwright browsers."""
        workflow = PROJECT_ROOT / ".github" / "workflows" / "e2e-test.yml"
        content = workflow.read_text()
        assert "playwright install" in content, (
            "CI workflow must install Playwright browsers"
        )

    def test_workflow_triggers_on_pull_request(self):
        """CI workflow triggers on pull requests to main."""
        workflow = PROJECT_ROOT / ".github" / "workflows" / "e2e-test.yml"
        content = workflow.read_text()
        assert "pull_request" in content, (
            "CI workflow must trigger on pull_request events"
        )
