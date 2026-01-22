"""
Test Summary Extractor for LLM Agents

Extracts token-efficient summaries from test runner JSON reports.
Groups results by spec for focused debugging.

Usage:
    # Summarize all test results
    uv run test-summary

    # Summarize specific runner
    uv run test-summary --runner pytest
    uv run test-summary --runner playwright
    uv run test-summary --runner vitest

    # Filter by spec
    uv run test-summary --spec AUTHENTICATION_SPEC

    # JSON output (for programmatic use)
    uv run test-summary --json

Output Format (default):
    PASS: 45 passed, 0 failed (1.2s)

Output Format (on failure):
    FAIL: 43 passed, 2 failed (1.2s)

    AUTHENTICATION_SPEC (1 failure):
      - test_login_invalid_password (tests/test_auth.py:25)
        AssertionError: Expected 200, got 401

    RUBRIC_SPEC (1 failure):
      - test_rubric_validation (tests/test_rubric.py:45)
        ValidationError: Missing required field
"""

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import click

# Test result directory
RESULTS_DIR = Path(".test-results")

# Spec extraction patterns (same as spec_coverage_analyzer.py)
PYTEST_SPEC_PATTERN = re.compile(r"spec\[([A-Z_]+)\]")
PLAYWRIGHT_SPEC_PATTERN = re.compile(r"@spec:([A-Z_]+)")
VITEST_SPEC_PATTERN = re.compile(r"@spec[:\s]+([A-Z_]+)")


@dataclass
class TestFailure:
    """A single test failure."""

    name: str
    file_path: str
    line_number: int | None
    error_message: str
    spec: str | None = None


@dataclass
class TestSummary:
    """Summary of test results."""

    runner: str
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    duration_ms: float = 0
    failures: list[TestFailure] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.passed + self.failed + self.skipped

    @property
    def status(self) -> Literal["pass", "fail", "no_tests"]:
        if self.total == 0:
            return "no_tests"
        return "fail" if self.failed > 0 else "pass"

    def failures_by_spec(self) -> dict[str, list[TestFailure]]:
        """Group failures by spec name."""
        by_spec: dict[str, list[TestFailure]] = {}
        for f in self.failures:
            spec = f.spec or "UNTAGGED"
            if spec not in by_spec:
                by_spec[spec] = []
            by_spec[spec].append(f)
        return by_spec


def extract_spec_from_pytest(
    node_id: str, markers: list | None = None, file_path: str | None = None
) -> str | None:
    """Extract spec name from pytest node ID, markers, or source file.

    For class-level @pytest.mark.spec decorators, pytest-json-report doesn't
    include the marker args in the test output. We fall back to reading the
    source file to find the spec marker.
    """
    # Check markers first (most reliable for method-level markers)
    if markers:
        for marker in markers:
            if isinstance(marker, dict) and marker.get("name") == "spec":
                args = marker.get("args", [])
                if args:
                    return args[0]

    # Fallback: look in node_id for spec[SPEC_NAME] pattern
    match = PYTEST_SPEC_PATTERN.search(node_id)
    if match:
        return match.group(1)

    # Final fallback: read the source file and look for @pytest.mark.spec on class
    if file_path:
        spec = _extract_spec_from_source_file(file_path, node_id)
        if spec:
            return spec

    return None


# Cache for source file spec extraction to avoid repeated file reads
_source_file_spec_cache: dict[str, str | None] = {}


def _extract_spec_from_source_file(file_path: str, node_id: str) -> str | None:
    """Extract spec from source file for class-level markers.

    When a test class has @pytest.mark.spec("SPEC_NAME"), pytest-json-report
    doesn't include the marker args. We parse the source to find it.
    """
    # Check if this is a class method (has :: twice, e.g., file.py::Class::method)
    parts = node_id.split("::")
    if len(parts) < 2:
        return None

    # Cache key is file_path + class_name (if present)
    class_name = parts[1] if len(parts) >= 2 else None
    cache_key = f"{file_path}::{class_name}" if class_name else file_path

    if cache_key in _source_file_spec_cache:
        return _source_file_spec_cache[cache_key]

    try:
        source_path = Path(file_path)
        if not source_path.exists():
            _source_file_spec_cache[cache_key] = None
            return None

        content = source_path.read_text()

        # Pattern to find @pytest.mark.spec("SPEC_NAME") before a class definition
        # This handles both class-level and module-level markers
        if class_name:
            # Look for marker right before the class definition
            pattern = re.compile(
                rf'@pytest\.mark\.spec\(["\']([A-Z_]+)["\']\)\s*\n(?:@[^\n]+\n)*class\s+{re.escape(class_name)}\b',
                re.MULTILINE,
            )
            match = pattern.search(content)
            if match:
                _source_file_spec_cache[cache_key] = match.group(1)
                return match.group(1)

        # Also check for module-level docstring with @spec comment
        module_pattern = re.compile(r'@spec\s+([A-Z_]+)')
        match = module_pattern.search(content[:500])  # Only check first 500 chars
        if match:
            _source_file_spec_cache[cache_key] = match.group(1)
            return match.group(1)

        _source_file_spec_cache[cache_key] = None
        return None

    except Exception:
        _source_file_spec_cache[cache_key] = None
        return None


def extract_spec_from_playwright(title: str, tags: list | None = None) -> str | None:
    """Extract spec name from Playwright test title or tags."""
    # Check tags first
    if tags:
        for tag in tags:
            match = PLAYWRIGHT_SPEC_PATTERN.search(tag)
            if match:
                return match.group(1)

    # Fallback: look in title
    match = PLAYWRIGHT_SPEC_PATTERN.search(title)
    if match:
        return match.group(1)

    return None


def parse_pytest_report(report_path: Path) -> TestSummary:
    """Parse pytest JSON report."""
    summary = TestSummary(runner="pytest")

    if not report_path.exists():
        return summary

    data = json.loads(report_path.read_text())

    # Extract summary counts
    summary_data = data.get("summary", {})
    summary.passed = summary_data.get("passed", 0)
    summary.failed = summary_data.get("failed", 0)
    summary.skipped = summary_data.get("skipped", 0)
    summary.duration_ms = data.get("duration", 0) * 1000

    # Extract failures
    for test in data.get("tests", []):
        if test.get("outcome") != "failed":
            continue

        node_id = test.get("nodeid", "")
        markers = test.get("markers", [])

        # Parse file path and line number from node_id
        # Format: tests/test_auth.py::test_login
        file_path = node_id.split("::")[0] if "::" in node_id else node_id
        test_name = node_id.split("::")[-1] if "::" in node_id else node_id

        # Get error message from call phase
        call_data = test.get("call", {})
        crash = call_data.get("crash", {})
        error_message = crash.get("message", "")

        # If no crash message, try longrepr
        if not error_message:
            longrepr = call_data.get("longrepr", "")
            if isinstance(longrepr, str):
                # Take first line of traceback
                error_message = longrepr.split("\n")[-1] if longrepr else "Unknown error"

        line_number = crash.get("lineno")

        summary.failures.append(
            TestFailure(
                name=test_name,
                file_path=file_path,
                line_number=line_number,
                error_message=error_message[:200],  # Truncate for token efficiency
                spec=extract_spec_from_pytest(node_id, markers, file_path),
            )
        )

    return summary


def parse_playwright_report(report_path: Path) -> TestSummary:
    """Parse Playwright JSON report."""
    summary = TestSummary(runner="playwright")

    if not report_path.exists():
        return summary

    data = json.loads(report_path.read_text())

    # Playwright JSON format has suites with specs
    stats = data.get("stats", {})
    summary.passed = stats.get("expected", 0)
    summary.failed = stats.get("unexpected", 0)
    summary.skipped = stats.get("skipped", 0)
    summary.duration_ms = stats.get("duration", 0)

    # Walk through suites to find failures
    def walk_suites(suites: list):
        for suite in suites:
            # Process specs (test cases)
            for spec in suite.get("specs", []):
                for test in spec.get("tests", []):
                    if test.get("status") != "unexpected":
                        continue

                    # Get test info
                    title = spec.get("title", "")
                    file_path = spec.get("file", suite.get("file", ""))
                    line_number = spec.get("line")
                    tags = spec.get("tags", [])

                    # Get error from results
                    error_message = ""
                    for result in test.get("results", []):
                        if result.get("status") == "failed":
                            error = result.get("error", {})
                            error_message = error.get("message", "")[:200]
                            break

                    summary.failures.append(
                        TestFailure(
                            name=title,
                            file_path=file_path,
                            line_number=line_number,
                            error_message=error_message,
                            spec=extract_spec_from_playwright(title, tags),
                        )
                    )

            # Recurse into nested suites
            walk_suites(suite.get("suites", []))

    walk_suites(data.get("suites", []))

    return summary


def parse_vitest_report(report_path: Path) -> TestSummary:
    """Parse Vitest JSON report."""
    summary = TestSummary(runner="vitest")

    if not report_path.exists():
        return summary

    data = json.loads(report_path.read_text())

    # Vitest JSON format
    summary.passed = data.get("numPassedTests", 0)
    summary.failed = data.get("numFailedTests", 0)
    summary.skipped = data.get("numPendingTests", 0)

    # Duration from test results
    for result in data.get("testResults", []):
        summary.duration_ms += result.get("endTime", 0) - result.get("startTime", 0)

        # Check for failures
        for assertion in result.get("assertionResults", []):
            if assertion.get("status") != "failed":
                continue

            title = assertion.get("title", "")
            ancestor_titles = assertion.get("ancestorTitles", [])
            full_title = " > ".join(ancestor_titles + [title])

            # Get error message
            failure_messages = assertion.get("failureMessages", [])
            error_message = failure_messages[0][:200] if failure_messages else ""

            # Extract spec from ancestor titles (describe block names)
            spec = None
            for ancestor in ancestor_titles:
                match = VITEST_SPEC_PATTERN.search(ancestor)
                if match:
                    spec = match.group(1)
                    break

            summary.failures.append(
                TestFailure(
                    name=full_title,
                    file_path=result.get("name", ""),
                    line_number=None,
                    error_message=error_message,
                    spec=spec,
                )
            )

    return summary


def format_human_output(summaries: list[TestSummary], spec_filter: str | None = None) -> str:
    """Format summaries for human-readable output (still token-efficient)."""
    lines = []

    total_passed = sum(s.passed for s in summaries)
    total_failed = sum(s.failed for s in summaries)
    total_duration = sum(s.duration_ms for s in summaries)

    # Overall status line
    status = "PASS" if total_failed == 0 else "FAIL"
    duration_str = f"{total_duration / 1000:.1f}s" if total_duration > 0 else "N/A"
    lines.append(f"{status}: {total_passed} passed, {total_failed} failed ({duration_str})")

    if total_failed == 0:
        return "\n".join(lines)

    lines.append("")

    # Collect all failures
    all_failures: list[tuple[str, TestFailure]] = []
    for summary in summaries:
        for failure in summary.failures:
            all_failures.append((summary.runner, failure))

    # Filter by spec if requested
    if spec_filter:
        all_failures = [(r, f) for r, f in all_failures if f.spec == spec_filter]
        if not all_failures:
            lines.append(f"No failures in {spec_filter}")
            return "\n".join(lines)

    # Group by spec
    by_spec: dict[str, list[tuple[str, TestFailure]]] = {}
    for runner, failure in all_failures:
        spec = failure.spec or "UNTAGGED"
        if spec not in by_spec:
            by_spec[spec] = []
        by_spec[spec].append((runner, failure))

    # Output grouped by spec
    for spec, failures in sorted(by_spec.items()):
        lines.append(f"{spec} ({len(failures)} failure{'s' if len(failures) > 1 else ''}):")
        for runner, failure in failures:
            loc = f"{failure.file_path}"
            if failure.line_number:
                loc += f":{failure.line_number}"
            lines.append(f"  - {failure.name} ({loc}) [{runner}]")
            if failure.error_message:
                # Indent and truncate error message
                err = failure.error_message.replace("\n", " ").strip()
                lines.append(f"    {err[:150]}")
        lines.append("")

    return "\n".join(lines)


def format_json_output(summaries: list[TestSummary], spec_filter: str | None = None) -> str:
    """Format summaries as JSON for programmatic use."""
    total_passed = sum(s.passed for s in summaries)
    total_failed = sum(s.failed for s in summaries)
    total_duration = sum(s.duration_ms for s in summaries)

    result = {
        "status": "pass" if total_failed == 0 else "fail",
        "passed": total_passed,
        "failed": total_failed,
        "duration_ms": total_duration,
    }

    if total_failed > 0:
        # Collect and group failures by spec
        by_spec: dict[str, list[dict]] = {}
        for summary in summaries:
            for failure in summary.failures:
                if spec_filter and failure.spec != spec_filter:
                    continue

                spec = failure.spec or "UNTAGGED"
                if spec not in by_spec:
                    by_spec[spec] = []
                by_spec[spec].append(
                    {
                        "name": failure.name,
                        "file": failure.file_path,
                        "line": failure.line_number,
                        "error": failure.error_message,
                        "runner": summary.runner,
                    }
                )

        result["failures_by_spec"] = by_spec

    return json.dumps(result, indent=2)


@click.command()
@click.option(
    "--runner",
    type=click.Choice(["all", "pytest", "playwright", "vitest"]),
    default="all",
    help="Which test runner to summarize",
)
@click.option("--spec", default=None, help="Filter results to a specific spec")
@click.option("--json", "use_json", is_flag=True, help="Output as JSON")
def main(runner: str, spec: str | None, use_json: bool):
    """Extract token-efficient test summaries from JSON reports."""
    summaries: list[TestSummary] = []

    if runner in ("all", "pytest"):
        summaries.append(parse_pytest_report(RESULTS_DIR / "pytest.json"))

    if runner in ("all", "playwright"):
        summaries.append(parse_playwright_report(RESULTS_DIR / "playwright.json"))

    if runner in ("all", "vitest"):
        summaries.append(parse_vitest_report(RESULTS_DIR / "vitest.json"))

    if use_json:
        print(format_json_output(summaries, spec))
    else:
        print(format_human_output(summaries, spec))

    # Exit with appropriate code
    total_failed = sum(s.failed for s in summaries)
    sys.exit(1 if total_failed > 0 else 0)


if __name__ == "__main__":
    main()
