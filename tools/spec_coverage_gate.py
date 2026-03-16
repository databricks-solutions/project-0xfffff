"""
Spec Coverage Gate

Compares current spec coverage against a stored baseline and fails if coverage
has regressed. Designed to run in CI to prevent PRs from decreasing test coverage.

Usage:
    uv run spec-coverage-gate                    # Compare against baseline
    uv run spec-coverage-gate --update-baseline  # Update the baseline file

Exit codes:
    0 - Coverage has not regressed (or baseline updated)
    1 - Coverage regression detected
    2 - Baseline file missing (run with --update-baseline first)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BASELINE_PATH = Path(".spec-coverage-baseline.json")


def load_baseline() -> dict | None:
    if not BASELINE_PATH.exists():
        return None
    return json.loads(BASELINE_PATH.read_text())


def get_current_coverage() -> dict:
    from tools.spec_coverage_analyzer import (
        SpecParser,
        SpecCoverageScanner,
        build_coverage,
        generate_json_report,
    )

    spec_parser = SpecParser()
    requirements = spec_parser.parse_all()
    scanner = SpecCoverageScanner()
    tests = scanner.scan_all()
    coverage = build_coverage(requirements, tests)
    return generate_json_report(coverage)


def compare(baseline: dict, current: dict) -> list[str]:
    """Return a list of regression messages. Empty list means no regressions."""
    regressions: list[str] = []

    # Overall coverage
    base_pct = baseline["summary"]["coverage_percent"]
    curr_pct = current["summary"]["coverage_percent"]
    if curr_pct < base_pct:
        regressions.append(
            f"Overall coverage decreased: {base_pct}% -> {curr_pct}%"
        )

    # Per-spec coverage
    for spec_name, base_spec in baseline["specs"].items():
        curr_spec = current["specs"].get(spec_name)
        if curr_spec is None:
            continue

        b_pct = base_spec["coverage_percent"]
        c_pct = curr_spec["coverage_percent"]
        if c_pct < b_pct:
            regressions.append(
                f"  {spec_name}: {b_pct}% -> {c_pct}%"
            )

        # Check per-requirement regressions (a covered req became uncovered)
        base_covered = {
            r["text"] for r in base_spec.get("requirements", []) if r["covered"]
        }
        curr_covered = {
            r["text"] for r in curr_spec.get("requirements", []) if r["covered"]
        }
        lost = base_covered - curr_covered
        for req in sorted(lost):
            regressions.append(
                f"  {spec_name}: requirement lost coverage: {req!r}"
            )

    return regressions


def update_baseline(report: dict) -> None:
    """Write a minimal baseline (no test details, just coverage numbers)."""
    minimal: dict = {
        "generated": report["generated"],
        "summary": report["summary"],
        "pyramid": report["pyramid"],
        "specs": {},
    }
    for spec_name, spec_data in report["specs"].items():
        minimal["specs"][spec_name] = {
            "total_requirements": spec_data["total_requirements"],
            "covered_requirements": spec_data["covered_requirements"],
            "coverage_percent": spec_data["coverage_percent"],
            "by_type": spec_data["by_type"],
            "requirements": [
                {"text": r["text"], "covered": r["covered"]}
                for r in spec_data["requirements"]
            ],
        }
    BASELINE_PATH.write_text(json.dumps(minimal, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Spec coverage regression gate")
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="Update the baseline file with current coverage",
    )
    args = parser.parse_args()

    current = get_current_coverage()

    if args.update_baseline:
        update_baseline(current)
        pct = current["summary"]["coverage_percent"]
        print(f"Baseline updated: {BASELINE_PATH} ({pct}% overall coverage)")
        return

    baseline = load_baseline()
    if baseline is None:
        print(f"No baseline found at {BASELINE_PATH}", file=sys.stderr)
        print("Run with --update-baseline to create one.", file=sys.stderr)
        sys.exit(2)

    regressions = compare(baseline, current)

    if regressions:
        print("Spec coverage regression detected!")
        print()
        for msg in regressions:
            print(msg)
        print()
        print(
            "To fix: add tests for the lost coverage, or update the baseline "
            "with `just spec-coverage-gate --update-baseline` if the regression "
            "is intentional."
        )
        sys.exit(1)
    else:
        base_pct = baseline["summary"]["coverage_percent"]
        curr_pct = current["summary"]["coverage_percent"]
        if curr_pct > base_pct:
            print(f"Coverage improved: {base_pct}% -> {curr_pct}%")
        else:
            print(f"Coverage stable at {curr_pct}%")


if __name__ == "__main__":
    main()
