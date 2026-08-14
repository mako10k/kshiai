#!/usr/bin/env python3
"""Keep Lizard complexity metrics from exceeding the checked-in baseline."""

from __future__ import annotations

import argparse
import csv
import importlib.metadata
import io
import json
from pathlib import Path
import subprocess
import sys
from typing import TypedDict


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = REPOSITORY_ROOT / "config" / "lizard-baseline.json"
EXPECTED_LIZARD_VERSION = "1.23.0"
SOURCE_PATHS = (
    "backend/src",
    "frontend/src",
    "packages/shared/src",
    "infra/cloudflare-worker/src",
    "scripts",
)
EXCLUDED_PATTERNS = (
    "**/*.test.ts",
    "**/*.test.tsx",
)
METRIC_COLUMNS = {
    "cyclomaticComplexity": 1,
    "functionLength": 4,
    "parameterCount": 3,
}
DEFAULT_THRESHOLDS = {
    "cyclomaticComplexity": 15,
    "functionLength": 100,
    "parameterCount": 6,
}


class FunctionMetric(TypedDict):
    file: str
    name: str
    value: int


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write-baseline",
        action="store_true",
        help="replace the baseline with the current aggregate metrics",
    )
    return parser.parse_args()


def require_expected_lizard() -> None:
    try:
        installed = importlib.metadata.version("lizard")
    except importlib.metadata.PackageNotFoundError:
        print(
            "lizard is not installed; run "
            "`python3 -m pip install -r requirements-static.txt`",
            file=sys.stderr,
        )
        raise SystemExit(2)
    if installed != EXPECTED_LIZARD_VERSION:
        print(
            f"lizard {installed} is installed, but {EXPECTED_LIZARD_VERSION} is required",
            file=sys.stderr,
        )
        raise SystemExit(2)


def analyze_functions() -> tuple[list[list[str]], int]:
    command = [
        sys.executable,
        "-m",
        "lizard",
        "--csv",
        "-l",
        "typescript",
        "-l",
        "tsx",
    ]
    for pattern in EXCLUDED_PATTERNS:
        command.extend(("-x", pattern))
    command.extend(SOURCE_PATHS)
    result = subprocess.run(
        command,
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stderr or result.stdout, file=sys.stderr)
        raise SystemExit(result.returncode)
    rows = [row for row in csv.reader(io.StringIO(result.stdout)) if row]
    return rows, len({row[6] for row in rows})


def aggregate_metric(
    rows: list[list[str]],
    metric: str,
    threshold: int,
) -> tuple[dict[str, int], list[FunctionMetric]]:
    column = METRIC_COLUMNS[metric]
    violations: list[FunctionMetric] = []
    for row in rows:
        value = int(row[column])
        if value > threshold:
            violations.append({"file": row[6], "name": row[7], "value": value})
    values = [violation["value"] for violation in violations]
    aggregate = {
        "threshold": threshold,
        "allowedCount": len(violations),
        "allowedMaximum": max(values, default=threshold),
        "allowedTotalExcess": sum(value - threshold for value in values),
    }
    violations.sort(key=lambda violation: violation["value"], reverse=True)
    return aggregate, violations


def current_baseline(rows: list[list[str]]) -> tuple[dict[str, object], dict[str, list[FunctionMetric]]]:
    metrics: dict[str, dict[str, int]] = {}
    violations: dict[str, list[FunctionMetric]] = {}
    for metric, threshold in DEFAULT_THRESHOLDS.items():
        metrics[metric], violations[metric] = aggregate_metric(rows, metric, threshold)
    return {
        "schemaVersion": 1,
        "lizardVersion": EXPECTED_LIZARD_VERSION,
        "sourcePaths": list(SOURCE_PATHS),
        "excludedPatterns": list(EXCLUDED_PATTERNS),
        "metrics": metrics,
    }, violations


def load_baseline() -> dict[str, object]:
    try:
        return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"missing Lizard baseline: {BASELINE_PATH}", file=sys.stderr)
        raise SystemExit(2)


def verify_configuration(baseline: dict[str, object]) -> None:
    expected = {
        "schemaVersion": 1,
        "lizardVersion": EXPECTED_LIZARD_VERSION,
        "sourcePaths": list(SOURCE_PATHS),
        "excludedPatterns": list(EXCLUDED_PATTERNS),
    }
    for key, value in expected.items():
        if baseline.get(key) != value:
            print(f"Lizard baseline {key} does not match the checker", file=sys.stderr)
            raise SystemExit(2)


def verify_metrics(
    baseline: dict[str, object],
    rows: list[list[str]],
    file_count: int,
) -> None:
    baseline_metrics = baseline.get("metrics")
    if not isinstance(baseline_metrics, dict):
        print("Lizard baseline metrics are invalid", file=sys.stderr)
        raise SystemExit(2)

    failures: list[str] = []
    print(
        f"Lizard {EXPECTED_LIZARD_VERSION}: "
        f"{file_count} files, {len(rows)} functions"
    )
    for metric in METRIC_COLUMNS:
        allowed = baseline_metrics.get(metric)
        if not isinstance(allowed, dict):
            failures.append(f"missing baseline metric {metric}")
            continue
        threshold = allowed.get("threshold")
        if not isinstance(threshold, int):
            failures.append(f"invalid threshold for {metric}")
            continue
        current, violations = aggregate_metric(rows, metric, threshold)
        print(
            f"  {metric} > {threshold}: "
            f"count {current['allowedCount']}/{allowed.get('allowedCount')}, "
            f"max {current['allowedMaximum']}/{allowed.get('allowedMaximum')}, "
            f"excess {current['allowedTotalExcess']}/{allowed.get('allowedTotalExcess')}"
        )
        for field in ("allowedCount", "allowedMaximum", "allowedTotalExcess"):
            limit = allowed.get(field)
            if not isinstance(limit, int):
                failures.append(f"invalid {field} for {metric}")
            elif current[field] > limit:
                failures.append(
                    f"{metric} {field} increased from {limit} to {current[field]}"
                )
        if any(current[field] > allowed.get(field, -1) for field in current if field != "threshold"):
            for violation in violations[:5]:
                print(
                    f"    {violation['value']:>4} "
                    f"{violation['file']}::{violation['name']}",
                    file=sys.stderr,
                )

    if failures:
        print("Lizard baseline regression:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    arguments = parse_arguments()
    require_expected_lizard()
    rows, file_count = analyze_functions()
    if arguments.write_baseline:
        baseline, _ = current_baseline(rows)
        BASELINE_PATH.write_text(
            json.dumps(baseline, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {BASELINE_PATH.relative_to(REPOSITORY_ROOT)}")
        return
    baseline = load_baseline()
    verify_configuration(baseline)
    verify_metrics(baseline, rows, file_count)


if __name__ == "__main__":
    main()
