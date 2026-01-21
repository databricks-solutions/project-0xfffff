"""
Spec Coverage Analyzer

Scans test files for spec coverage markers/tags and generates a coverage report.

Supported conventions:
- pytest:     @pytest.mark.spec("SPEC_NAME")
- Playwright: { tag: ['@spec:SPEC_NAME'] } or test title containing @spec:SPEC_NAME
- Vitest:     // @spec SPEC_NAME comment or describe('@spec:SPEC_NAME', ...)

Usage:
    uv run spec-coverage-analyzer
    # or
    python -m tools.spec_coverage_analyzer

Output:
    - Console summary
    - specs/SPEC_COVERAGE_MAP.md with detailed report
"""

import re
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime

# All known specs (without .md extension)
KNOWN_SPECS = [
    "ANNOTATION_SPEC",
    "AUTHENTICATION_SPEC",
    "BUILD_AND_DEPLOY_SPEC",
    "CUSTOM_LLM_PROVIDER_SPEC",
    "DATASETS_SPEC",
    "DESIGN_SYSTEM_SPEC",
    "DISCOVERY_TRACE_ASSIGNMENT_SPEC",
    "JUDGE_EVALUATION_SPEC",
    "RUBRIC_SPEC",
    "TRACE_DISPLAY_SPEC",
    "UI_COMPONENTS_SPEC",
]


@dataclass
class TestCoverage:
    """A test file/function that covers a spec."""

    file_path: str
    test_name: str | None  # None for file-level coverage
    spec_name: str
    test_type: str  # 'pytest', 'playwright', 'vitest'
    line_number: int | None = None


@dataclass
class SpecCoverage:
    """Coverage information for a single spec."""

    spec_name: str
    pytest_tests: list[TestCoverage] = field(default_factory=list)
    playwright_tests: list[TestCoverage] = field(default_factory=list)
    vitest_tests: list[TestCoverage] = field(default_factory=list)

    @property
    def total_tests(self) -> int:
        return len(self.pytest_tests) + len(self.playwright_tests) + len(self.vitest_tests)

    @property
    def is_covered(self) -> bool:
        return self.total_tests > 0


class SpecCoverageScanner:
    """Scans test files for spec coverage markers."""

    # Directories to scan
    PYTEST_DIR = Path("tests")
    PLAYWRIGHT_DIR = Path("client/tests/e2e")
    VITEST_DIR = Path("client/src")

    # Regex patterns for detecting spec markers
    # pytest: @pytest.mark.spec("SPEC_NAME") or @pytest.mark.spec('SPEC_NAME')
    PYTEST_PATTERN = re.compile(
        r'@pytest\.mark\.spec\(["\']([A-Z_]+)["\']\)',
        re.MULTILINE,
    )

    # Playwright: { tag: ['@spec:SPEC_NAME'] } or { tag: "@spec:SPEC_NAME" }
    # Also matches test('@spec:SPEC_NAME ...', ...)
    PLAYWRIGHT_TAG_PATTERN = re.compile(
        r'tag:\s*\[?\s*["\']@spec:([A-Z_]+)["\']',
        re.MULTILINE,
    )
    PLAYWRIGHT_TITLE_PATTERN = re.compile(
        r'test\(\s*["\']@spec:([A-Z_]+)',
        re.MULTILINE,
    )

    # Vitest: // @spec SPEC_NAME or /* @spec SPEC_NAME */
    # Also matches describe('@spec:SPEC_NAME', ...)
    VITEST_COMMENT_PATTERN = re.compile(
        r'(?://|/\*)\s*@spec[:\s]+([A-Z_]+)',
        re.MULTILINE,
    )
    VITEST_DESCRIBE_PATTERN = re.compile(
        r'describe\(\s*["\']@spec:([A-Z_]+)',
        re.MULTILINE,
    )

    def __init__(self):
        self.coverage: dict[str, SpecCoverage] = {
            spec: SpecCoverage(spec_name=spec) for spec in KNOWN_SPECS
        }
        self.unknown_specs: set[str] = set()

    def scan_all(self) -> dict[str, SpecCoverage]:
        """Scan all test directories and return coverage map."""
        print("Scanning for spec coverage markers...\n")

        self._scan_pytest()
        self._scan_playwright()
        self._scan_vitest()

        return self.coverage

    def _scan_pytest(self):
        """Scan pytest files for @pytest.mark.spec markers."""
        if not self.PYTEST_DIR.exists():
            print(f"  ⚠️  pytest directory not found: {self.PYTEST_DIR}")
            return

        print(f"  Scanning pytest tests in {self.PYTEST_DIR}...")
        count = 0

        for test_file in self.PYTEST_DIR.rglob("test_*.py"):
            content = test_file.read_text()

            for match in self.PYTEST_PATTERN.finditer(content):
                spec_name = match.group(1)
                line_number = content[: match.start()].count("\n") + 1

                # Find the test function name (next def test_* after the marker)
                after_marker = content[match.end() :]
                func_match = re.search(r"def (test_\w+)", after_marker)
                test_name = func_match.group(1) if func_match else None

                self._add_coverage(
                    spec_name=spec_name,
                    test_type="pytest",
                    file_path=str(test_file),
                    test_name=test_name,
                    line_number=line_number,
                )
                count += 1

        print(f"    Found {count} pytest spec markers")

    def _scan_playwright(self):
        """Scan Playwright files for spec tags."""
        if not self.PLAYWRIGHT_DIR.exists():
            print(f"  ⚠️  Playwright directory not found: {self.PLAYWRIGHT_DIR}")
            return

        print(f"  Scanning Playwright tests in {self.PLAYWRIGHT_DIR}...")
        count = 0

        for test_file in self.PLAYWRIGHT_DIR.glob("*.spec.ts"):
            content = test_file.read_text()

            # Check for tag-based markers
            for match in self.PLAYWRIGHT_TAG_PATTERN.finditer(content):
                spec_name = match.group(1)
                line_number = content[: match.start()].count("\n") + 1

                self._add_coverage(
                    spec_name=spec_name,
                    test_type="playwright",
                    file_path=str(test_file),
                    test_name=None,
                    line_number=line_number,
                )
                count += 1

            # Check for title-based markers
            for match in self.PLAYWRIGHT_TITLE_PATTERN.finditer(content):
                spec_name = match.group(1)
                line_number = content[: match.start()].count("\n") + 1

                self._add_coverage(
                    spec_name=spec_name,
                    test_type="playwright",
                    file_path=str(test_file),
                    test_name=None,
                    line_number=line_number,
                )
                count += 1

        print(f"    Found {count} Playwright spec tags")

    def _scan_vitest(self):
        """Scan Vitest files for spec comments/tags."""
        if not self.VITEST_DIR.exists():
            print(f"  ⚠️  Vitest directory not found: {self.VITEST_DIR}")
            return

        print(f"  Scanning Vitest tests in {self.VITEST_DIR}...")
        count = 0

        for test_file in self.VITEST_DIR.rglob("*.test.ts"):
            content = test_file.read_text()

            # Check for comment-based markers
            for match in self.VITEST_COMMENT_PATTERN.finditer(content):
                spec_name = match.group(1)
                line_number = content[: match.start()].count("\n") + 1

                self._add_coverage(
                    spec_name=spec_name,
                    test_type="vitest",
                    file_path=str(test_file),
                    test_name=None,
                    line_number=line_number,
                )
                count += 1

            # Check for describe-based markers
            for match in self.VITEST_DESCRIBE_PATTERN.finditer(content):
                spec_name = match.group(1)
                line_number = content[: match.start()].count("\n") + 1

                self._add_coverage(
                    spec_name=spec_name,
                    test_type="vitest",
                    file_path=str(test_file),
                    test_name=None,
                    line_number=line_number,
                )
                count += 1

        print(f"    Found {count} Vitest spec markers")

    def _add_coverage(
        self,
        spec_name: str,
        test_type: str,
        file_path: str,
        test_name: str | None,
        line_number: int | None,
    ):
        """Add a coverage entry."""
        if spec_name not in self.coverage:
            self.unknown_specs.add(spec_name)
            print(f"    ⚠️  Unknown spec referenced: {spec_name} in {file_path}")
            return

        test_coverage = TestCoverage(
            file_path=file_path,
            test_name=test_name,
            spec_name=spec_name,
            test_type=test_type,
            line_number=line_number,
        )

        spec_cov = self.coverage[spec_name]
        if test_type == "pytest":
            spec_cov.pytest_tests.append(test_coverage)
        elif test_type == "playwright":
            spec_cov.playwright_tests.append(test_coverage)
        elif test_type == "vitest":
            spec_cov.vitest_tests.append(test_coverage)


def generate_report(coverage: dict[str, SpecCoverage]) -> str:
    """Generate a markdown report of spec coverage."""
    lines = [
        "# Spec Test Coverage Map",
        "",
        f"**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "This report shows which tests cover each specification.",
        "Tests are tagged using framework-specific conventions:",
        "",
        "- **pytest**: `@pytest.mark.spec(\"SPEC_NAME\")`",
        "- **Playwright**: `{ tag: ['@spec:SPEC_NAME'] }` or `@spec:SPEC_NAME` in test title",
        "- **Vitest**: `// @spec SPEC_NAME` comment or `describe('@spec:SPEC_NAME', ...)`",
        "",
        "---",
        "",
        "## Coverage Summary",
        "",
        "| Spec | pytest | Playwright | Vitest | Total | Status |",
        "|------|--------|------------|--------|-------|--------|",
    ]

    covered_count = 0
    for spec_name in KNOWN_SPECS:
        cov = coverage[spec_name]
        pytest_count = len(cov.pytest_tests)
        playwright_count = len(cov.playwright_tests)
        vitest_count = len(cov.vitest_tests)
        total = cov.total_tests

        if cov.is_covered:
            covered_count += 1
            status = "Covered" if total >= 3 else "Partial"
            status_icon = "✅" if total >= 3 else "🟡"
        else:
            status = "Uncovered"
            status_icon = "❌"

        lines.append(
            f"| [{spec_name}](#{spec_name.lower().replace('_', '-')}) | "
            f"{pytest_count} | {playwright_count} | {vitest_count} | "
            f"{total} | {status_icon} {status} |"
        )

    lines.extend(
        [
            "",
            f"**Coverage**: {covered_count}/{len(KNOWN_SPECS)} specs "
            f"({100 * covered_count // len(KNOWN_SPECS)}%)",
            "",
            "---",
            "",
        ]
    )

    # Detailed per-spec sections
    for spec_name in KNOWN_SPECS:
        cov = coverage[spec_name]
        anchor = spec_name.lower().replace("_", "-")

        lines.append(f"## {spec_name}")
        lines.append("")

        if not cov.is_covered:
            lines.append("❌ **No tests tagged for this spec**")
            lines.append("")
            lines.append("To add coverage, tag tests with:")
            lines.append(f'- pytest: `@pytest.mark.spec("{spec_name}")`')
            lines.append(f"- Playwright: `{{ tag: ['@spec:{spec_name}'] }}`")
            lines.append(f"- Vitest: `// @spec {spec_name}`")
            lines.append("")
            continue

        if cov.pytest_tests:
            lines.append("### pytest")
            lines.append("")
            for test in cov.pytest_tests:
                test_desc = test.test_name or "file-level"
                lines.append(f"- `{test.file_path}` ({test_desc})")
            lines.append("")

        if cov.playwright_tests:
            lines.append("### Playwright (E2E)")
            lines.append("")
            for test in cov.playwright_tests:
                lines.append(f"- `{test.file_path}`")
            lines.append("")

        if cov.vitest_tests:
            lines.append("### Vitest (Unit)")
            lines.append("")
            for test in cov.vitest_tests:
                lines.append(f"- `{test.file_path}`")
            lines.append("")

    return "\n".join(lines)


def print_summary(coverage: dict[str, SpecCoverage]):
    """Print a console summary."""
    print("\n" + "=" * 60)
    print("SPEC COVERAGE SUMMARY")
    print("=" * 60 + "\n")

    covered = []
    uncovered = []

    for spec_name in KNOWN_SPECS:
        cov = coverage[spec_name]
        if cov.is_covered:
            covered.append((spec_name, cov))
        else:
            uncovered.append(spec_name)

    # Print covered specs
    for spec_name, cov in covered:
        parts = []
        if cov.pytest_tests:
            parts.append(f"pytest:{len(cov.pytest_tests)}")
        if cov.playwright_tests:
            parts.append(f"pw:{len(cov.playwright_tests)}")
        if cov.vitest_tests:
            parts.append(f"vitest:{len(cov.vitest_tests)}")
        print(f"  ✅ {spec_name}: {', '.join(parts)}")

    # Print uncovered specs
    for spec_name in uncovered:
        print(f"  ❌ {spec_name}: no tests tagged")

    print("")
    print(f"Coverage: {len(covered)}/{len(KNOWN_SPECS)} specs")
    print("")


def main():
    """Main entry point."""
    scanner = SpecCoverageScanner()
    coverage = scanner.scan_all()

    # Print console summary
    print_summary(coverage)

    # Generate and write markdown report
    report = generate_report(coverage)
    output_path = Path("specs/SPEC_COVERAGE_MAP.md")
    output_path.write_text(report)
    print(f"📋 Report written to: {output_path}")

    # Warn about unknown specs
    if scanner.unknown_specs:
        print(f"\n⚠️  Unknown specs referenced: {', '.join(sorted(scanner.unknown_specs))}")
        print("   Add them to KNOWN_SPECS in spec_coverage_analyzer.py if they are valid.")


if __name__ == "__main__":
    main()
