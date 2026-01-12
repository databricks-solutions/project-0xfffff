# Notebooks

This directory contains Jupyter notebooks for data generation, exploration, and testing workflows that are **not** part of the core server application.

## Notebooks

### `generate_discovery_traces.ipynb`

Generates synthetic **Code Assistant** traces designed to stress test all 6 discovery question categories:

| Category | Description | Code Assistant Examples |
|----------|-------------|------------------------|
| `themes` | General quality patterns | Code readability, best practices, documentation |
| `edge_cases` | Unusual inputs/scenarios | Empty arrays, unicode strings, deeply nested structures |
| `boundary_conditions` | Limits and thresholds | Off-by-one errors, array bounds, integer overflow |
| `failure_modes` | Ways the system can fail | Missing error handling, security flaws, incorrect logic |
| `missing_info` | Ambiguous or incomplete context | Unclear requirements, missing type info, vague intent |
| `disagreements` | Multiple valid approaches | Style preferences, performance vs readability trade-offs |

**Use cases:**
- User testing of the assisted facilitation flow
- Generating E2E test fixtures for the discovery phase
- Future DSPy optimization using coverage metrics

## Setup

1. Install notebook dependencies:
   ```bash
   uv pip install jupyter ipykernel
   ```

2. Configure Databricks/MLflow credentials (if exporting to MLflow):
   ```bash
   export DATABRICKS_HOST="https://your-workspace.cloud.databricks.com"
   export DATABRICKS_TOKEN="your-token"
   ```

3. Run the notebook:
   ```bash
   uv run jupyter notebook notebooks/generate_discovery_traces.ipynb
   ```

## Output Formats

The notebook can export traces in two formats:

1. **MLflow Traces**: Direct upload to an MLflow experiment for workshop ingestion
2. **JSON Fixtures**: Static files for E2E tests in `client/tests/fixtures/`

## DSPy Signatures

The `synthetic_trace_dspy.py` module defines DSPy signatures for:

- `GenerateSyntheticTrace`: Generates traces targeting specific discovery categories
- `ScoreTraceCoverage`: Evaluates how well a trace elicits target categories (for optimization)

These signatures can be used with DSPy optimizers (e.g., `BootstrapFewShot`) to self-improve trace generation based on actual workshop outcomes.
