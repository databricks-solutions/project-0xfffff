"""
Spec Tagging Validator

Scans test files and enforces that tests are tagged with spec markers.
Fails with exit code 1 if untagged tests are found.

Supported conventions:
- pytest:     @pytest.mark.spec("SPEC_NAME")
- Playwright: { tag: ['@spec:SPEC_NAME'] } or test title containing @spec:SPEC_NAME
- Vitest:     // @spec SPEC_NAME comment or describe('@spec:SPEC_NAME', ...)

Usage:
    uv run spec-tagging-validator
    # or
    python -m tools.spec_tagging_validator

Exit codes:
    0 - All tests are tagged
    1 - Some tests are missing spec tags
    2 - Error scanning files
"""

import re
import sys
from pathlib import Path
from typing import Optional

# Test file patterns
PYTEST_PATTERN = re.compile(r"@pytest\.mark\.spec\(['\"]([A-Z_]+)['\"]\)")
VITEST_COMMENT_PATTERN = re.compile(r"(?://|/\*)\s*@spec[:\s]+([A-Z_]+)")
VITEST_DESCRIBE_PATTERN = re.compile(r"describe\(\s*['\"]@spec:([A-Z_]+)")
PLAYWRIGHT_TAG_PATTERN = re.compile(r"tag:\s*\[?\s*['\"]@spec:([A-Z_]+)['\"]")
PLAYWRIGHT_TEST_PATTERN = re.compile(r"test\.use\(\s*\{\s*tag:\s*\[")

# Test function/suite patterns
PYTEST_FUNC_PATTERN = re.compile(r"def\s+(test_\w+)\s*\(")
VITEST_TEST_PATTERN = re.compile(r"(?:it|test)\s*\(\s*['\"]([^'\"]+)['\"]")
PLAYWRIGHT_TEST_TITLE_PATTERN = re.compile(r"test\s*\(\s*['\"]([^'\"]+)['\"]")


class SpecTaggingValidator:
    """Validates that tests are tagged with spec markers."""

    def __init__(self):
        self.pytest_dir = Path("tests")
        self.playwright_dir = Path("client/tests/e2e")
        self.vitest_dir = Path("client/src")
        self.untagged_tests = []

    def validate_all(self) -> bool:
        """Validate all test files. Returns True if all tests are tagged."""
        print("Validating spec tagging in test files...\n")

        self._validate_pytest()
        self._validate_playwright()
        self._validate_vitest()

        return self._report_results()

    def _validate_pytest(self):
        """Check pytest files for untagged tests."""
        if not self.pytest_dir.exists():
            return

        print(f"  Checking pytest tests in {self.pytest_dir}...")
        count = 0

        for test_file in self.pytest_dir.rglob("test_*.py"):
            content = test_file.read_text()

            # Find all test functions
            for match in PYTEST_FUNC_PATTERN.finditer(content):
                test_name = match.group(1)
                test_start = match.start()

                # Check if this test has a spec marker before it
                # Look backwards for the nearest @pytest.mark.spec
                before_test = content[:test_start]
                has_spec = bool(PYTEST_PATTERN.search(before_test[-1000:]))  # Check last 1000 chars

                if not has_spec:
                    line_num = content[:test_start].count("\n") + 1
                    try:
                        rel_path = test_file.relative_to(Path.cwd())
                    except ValueError:
                        rel_path = test_file
                    self.untagged_tests.append(
                        f"  ❌ {rel_path}:{line_num} - {test_name}"
                    )
                    count += 1

        if count > 0:
            print(f"    Found {count} untagged pytest tests")
        else:
            print(f"    ✅ All pytest tests are tagged")

    def _validate_playwright(self):
        """Check Playwright E2E files for untagged tests."""
        if not self.playwright_dir.exists():
            return

        print(f"  Checking Playwright tests in {self.playwright_dir}...")
        count = 0

        for test_file in self.playwright_dir.glob("*.spec.ts"):
            content = test_file.read_text()

            # Check if file has test.use({ tag: ['@spec:...'] })
            # This should be used for all tests in a describe block
            has_file_level_tag = bool(PLAYWRIGHT_TAG_PATTERN.search(content))

            if not has_file_level_tag:
                # Check if at least one test has a tag
                test_blocks = re.findall(
                    r"test\.describe\(['\"]([^'\"]+)['\"].*?\n(.*?)(?=test\.describe|$)",
                    content,
                    re.DOTALL,
                )

                if test_blocks and not bool(PLAYWRIGHT_TAG_PATTERN.search(content)):
                    try:
                        rel_path = test_file.relative_to(Path.cwd())
                    except ValueError:
                        rel_path = test_file
                    self.untagged_tests.append(
                        f"  ❌ {rel_path} - Missing @spec:* tag in test.use() or test describe block"
                    )
                    count += 1

        if count > 0:
            print(f"    Found {count} untagged Playwright test files")
        else:
            print(f"    ✅ All Playwright tests are tagged")

    def _validate_vitest(self):
        """Check Vitest files for untagged tests."""
        if not self.vitest_dir.exists():
            return

        print(f"  Checking Vitest tests in {self.vitest_dir}...")
        count = 0

        for test_file in self.vitest_dir.rglob("*.test.ts"):
            content = test_file.read_text()

            # Check if file has spec comment at top
            has_spec_comment = bool(VITEST_COMMENT_PATTERN.search(content))

            # Check if describe block has spec in title
            has_spec_describe = bool(VITEST_DESCRIBE_PATTERN.search(content))

            if not has_spec_comment and not has_spec_describe:
                # Extract first test/it block
                first_test = re.search(r"(?:it|test)\s*\(\s*['\"]([^'\"]+)['\"]", content)
                if first_test:
                    line_num = content[: first_test.start()].count("\n") + 1
                    try:
                        rel_path = test_file.relative_to(Path.cwd())
                    except ValueError:
                        rel_path = test_file
                    self.untagged_tests.append(
                        f"  ❌ {rel_path}:{line_num} - Missing // @spec or @spec:* in describe"
                    )
                    count += 1

        if count > 0:
            print(f"    Found {count} untagged Vitest test files")
        else:
            print(f"    ✅ All Vitest tests are tagged")

    def _report_results(self) -> bool:
        """Report validation results. Returns True if all tests are tagged."""
        print("\n" + "=" * 60)

        if self.untagged_tests:
            print("SPEC TAGGING VALIDATION FAILED")
            print("=" * 60 + "\n")
            print("Untagged tests found:\n")
            for test in self.untagged_tests:
                print(test)
            print(
                "\n⚠️  All tests must be tagged with spec markers to track coverage."
            )
            print("\nTag new tests with:")
            print("  pytest:    @pytest.mark.spec(\"SPEC_NAME\")")
            print("  Playwright: test.use({ tag: ['@spec:SPEC_NAME'] })")
            print("  Vitest:    // @spec SPEC_NAME at top of file")
            print("\nAfter tagging, regenerate coverage map with:")
            print("  uv run spec-coverage-analyzer")
            print("\n" + "=" * 60)
            return False
        else:
            print("SPEC TAGGING VALIDATION PASSED")
            print("=" * 60)
            print("\n✅ All tests are properly tagged with spec markers")
            print("\n" + "=" * 60)
            return True


def main():
    """Main entry point."""
    try:
        validator = SpecTaggingValidator()
        success = validator.validate_all()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Error validating spec tagging: {e}")
        sys.exit(2)


if __name__ == "__main__":
    main()
