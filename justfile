# Repo command runner
#
# Usage:
#   just --list
#   just setup
#   just setup-python
#   just setup-client
#   just configure
#
# Notes:
# - This is a migration of `setup.sh` into `just` recipes.
# - Recipes use bash with strict flags.

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set dotenv-filename := ".env.local"
set dotenv-load
set script-interpreter := ['uv', 'run', 'python']
export PATH := "./{{client-dir}}/node_modules/.bin:" + env_var('PATH')
client-dir := "client"
server-dir := "server"
lakebase-local-env := ".env.lakebase.local"

# Default target: show available recipes
_default:
  @just --list

# Setup all
[group('setup')]
setup: setup-uv setup-prereqs setup-python setup-client configure test-connection
  @echo "✅ Setup complete!"
  @echo ""
  @echo "🎯 Virtual environment created at: .venv/"
  @echo ""
  @echo "Next step: run 'just deploy' when ready to deploy"

# Install uv
[group('setup')]
setup-uv:
  @echo "🚀 Human Evaluation Workshop Setup"
  @echo "==================================="
  @if ! command -v uv &> /dev/null; then \
    echo "📦 Installing uv package manager..."; \
    curl -LsSf https://astral.sh/uv/install.sh | sh; \
    export PATH="$$HOME/.local/bin:$$PATH"; \
  fi
  @echo "✅ uv found: $$(uv --version)"

# Check for Node.js and Databricks CLI
[group('setup')]
setup-prereqs:
  @# Check for Node.js
  @if ! command -v node &> /dev/null; then \
    echo "❌ Node.js is required. Please install Node.js 18+ and try again."; \
    exit 1; \
  fi
  @# Check for Databricks CLI
  @if ! command -v databricks &> /dev/null; then \
    echo "❌ Databricks CLI is required. Please install it and try again."; \
    exit 1; \
  fi

# Create Python virtual environment and install dependencies
[group('setup')]
setup-python:
  @echo "🐍 Creating Python virtual environment..."
  @uv venv --python 3.11
  @echo "📦 Installing Python dependencies..."
  @uv pip install -r requirements.txt
  @echo "🧰 Installing dev tooling (includes alembic for migrations)..."
  @uv pip install -e ".[dev]"

setup-client:
  @echo "📦 Installing frontend dependencies..."
  @npm -C client install

# Interactive Databricks configuration + .env.local management
configure:
  #!/usr/bin/env bash
  set -euo pipefail

  echo ""
  echo "🔐 Databricks Configuration"
  echo "============================"

  UPDATE_CONFIG=false
  IS_TTY=false
  if [ -t 0 ]; then
    IS_TTY=true
  fi

  if [ -f ".env.local" ]; then
    echo "✅ Found existing .env.local"
    # shellcheck disable=SC1091
    source .env.local
    echo ""
    echo "Current configuration:"
    echo "  Profile: ${DATABRICKS_CONFIG_PROFILE:-default}"
    echo "  App Name: ${DATABRICKS_APP_NAME:-human-eval-workshop}"
    echo ""
    if [ "$IS_TTY" = true ]; then
      read -r -p "Do you want to update these values? (y/N): " update_choice
      if [[ "$update_choice" =~ ^[Yy]$ ]]; then
        UPDATE_CONFIG=true
      fi
    else
      # Non-interactive run: keep existing values
      UPDATE_CONFIG=false
    fi
  else
    echo "Creating .env.local file..."
    echo "# Databricks Configuration" > .env.local
    # Non-interactive run: seed defaults; interactive run will prompt below.
    if [ "$IS_TTY" = false ]; then
      : "${DATABRICKS_CONFIG_PROFILE:=DEFAULT}"
      : "${DATABRICKS_APP_NAME:=human-eval-workshop}"
      echo "DATABRICKS_CONFIG_PROFILE=$DATABRICKS_CONFIG_PROFILE" >> .env.local
      echo "DATABRICKS_APP_NAME=$DATABRICKS_APP_NAME" >> .env.local
      UPDATE_CONFIG=false
    else
      UPDATE_CONFIG=true
    fi
  fi

  if [ "$UPDATE_CONFIG" = true ]; then
    echo ""
    echo "🔧 Databricks CLI Profile Setup"
    echo "================================"

    PROFILES="$(databricks auth profiles 2>/dev/null || true)"
    if [ -z "$PROFILES" ]; then
      echo "❌ No Databricks profiles found."
      echo ""
      echo "Please set up a profile first using:"
      echo "  databricks configure"
      echo ""
      echo "For more info: https://docs.databricks.com/aws/en/dev-tools/cli/profiles"
      exit 1
    fi

    echo "Available profiles:"
    echo "$PROFILES" | nl -w2 -s'. '
    echo ""

    if [ -n "${DATABRICKS_CONFIG_PROFILE:-}" ]; then
      read -r -p "Profile name (current: $DATABRICKS_CONFIG_PROFILE): " profile
      profile="${profile:-$DATABRICKS_CONFIG_PROFILE}"
    else
      read -r -p "Profile name (default: DEFAULT): " profile
      profile="${profile:-DEFAULT}"
    fi

    if [ "$profile" != "${DATABRICKS_CONFIG_PROFILE:-}" ]; then
      if [ -f .env.local ]; then
        sed -i.bak '/^DATABRICKS_CONFIG_PROFILE=/d' .env.local && rm .env.local.bak
      fi
      echo "DATABRICKS_CONFIG_PROFILE=$profile" >> .env.local
      export DATABRICKS_CONFIG_PROFILE="$profile"
    fi

    echo ""
    echo "🚀 App Configuration"
    echo "===================="

    if [ -n "${DATABRICKS_APP_NAME:-}" ]; then
      read -r -p "App Name (current: $DATABRICKS_APP_NAME): " app_name
      app_name="${app_name:-$DATABRICKS_APP_NAME}"
    else
      read -r -p "App Name (default: human-eval-workshop): " app_name
      app_name="${app_name:-human-eval-workshop}"
    fi

    if [ "$app_name" != "${DATABRICKS_APP_NAME:-}" ]; then
      if [ -f .env.local ]; then
        sed -i.bak '/^DATABRICKS_APP_NAME=/d' .env.local && rm .env.local.bak
      fi
      echo "DATABRICKS_APP_NAME=$app_name" >> .env.local
      export DATABRICKS_APP_NAME="$app_name"
    fi
  fi

# Configure Lakebase branch development env vars.
[group('setup')]
configure-lakebase-local:
  #!/usr/bin/env bash
  set -euo pipefail

  ENV_FILE="{{lakebase-local-env}}"
  PROFILE="${DATABRICKS_CONFIG_PROFILE:-DEFAULT}"

  if [ ! -t 0 ]; then
    echo "❌ configure-lakebase-local must be run interactively." >&2
    echo "   Or create $ENV_FILE with DATABASE_URL, or PGHOST, PGDATABASE, and PGUSER." >&2
    exit 2
  fi

  echo ""
  echo "🐘 Lakebase Branch Development Configuration"
  echo "============================================"
  echo "Using Databricks profile: $PROFILE"

  current_user_json="$(databricks --profile "$PROFILE" current-user me --output json)" || {
    echo "❌ Could not get Databricks current user." >&2
    echo "   Run: databricks auth login --profile $PROFILE" >&2
    exit 1
  }
  current_user="$(printf '%s' "$current_user_json" | uv run python -c 'import json,sys; print(json.load(sys.stdin).get("userName",""))')"
  if [ -z "$current_user" ]; then
    echo "❌ Could not determine Databricks userName from current-user response." >&2
    exit 1
  fi

  default_db="${PGDATABASE:-databricks_postgres}"
  default_appname="${PGAPPNAME:-${DATABRICKS_APP_NAME:-human-eval-workshop}}"

  echo ""
  echo "Paste the Postgres database URL for your Lakebase branch."
  echo "The branch endpoint provides isolation; PGAPPNAME defaults to the app schema."
  echo "PGUSER will be your Databricks user: $current_user"
  echo ""

  read -r -p "DATABASE_URL: " database_url
  if [ -z "$database_url" ]; then
    echo "❌ DATABASE_URL is required." >&2
    exit 2
  fi

  eval "$(DATABASE_URL="$database_url" just _lakebase-url-env)"

  read -r -p "PGDATABASE [$default_db]: " pgdatabase
  read -r -p "PGAPPNAME/schema [$default_appname]: " pgappname

  pgdatabase="${pgdatabase:-${PGDATABASE:-$default_db}}"
  pgappname="${pgappname:-$default_appname}"

  if [ -z "${PGHOST:-}" ]; then
    echo "❌ Could not parse PGHOST from DATABASE_URL." >&2
    exit 2
  fi

  {
    echo "# Lakebase local development"
    echo "# Generated by: just configure-lakebase-local"
    echo "# DATABASE_URL should point at the selected Lakebase branch endpoint."
    echo "# PGUSER is your Databricks user for branch OAuth testing."
    printf 'DATABASE_URL=%q\n' "$database_url"
    echo "DATABASE_ENV=postgres"
    printf 'PGHOST=%q\n' "$PGHOST"
    printf 'PGDATABASE=%q\n' "$pgdatabase"
    printf 'PGUSER=%q\n' "$current_user"
    printf 'PGPORT=%q\n' "${PGPORT:-5432}"
    printf 'PGSSLMODE=%q\n' "${PGSSLMODE:-require}"
    printf 'PGAPPNAME=%q\n' "$pgappname"
  } > "$ENV_FILE"

  echo ""
  echo "✅ Wrote $ENV_FILE"
  echo "Run: just dev postgres"

[script]
_lakebase-url-env:
  import os
  import shlex
  from urllib.parse import parse_qs, unquote, urlparse

  raw = os.environ.get("DATABASE_URL", "").strip().strip("'\"")
  if raw.startswith("jdbc:"):
    raw = raw.removeprefix("jdbc:")

  parsed = urlparse(raw)
  query = parse_qs(parsed.query)

  def emit(name: str, value: str | None) -> None:
    if value:
      print(f"export {name}={shlex.quote(value)}")

  emit("PGHOST", parsed.hostname)
  if parsed.path and parsed.path != "/":
    emit("PGDATABASE", unquote(parsed.path.lstrip("/")))
  if parsed.port:
    emit("PGPORT", str(parsed.port))
  emit("PGSSLMODE", query.get("sslmode", ["require"])[0])
  emit("PGAPPNAME", query.get("application_name", [""])[0])

[group('app')]
app-deployments:
  #!/usr/bin/env bash
  set -euo pipefail

  PROFILE="${DATABRICKS_CONFIG_PROFILE:-DEFAULT}"
  APP="${DATABRICKS_APP_NAME:?DATABRICKS_APP_NAME is not set (run `just configure`)}"

  databricks --profile "$PROFILE" apps list-deployments "$APP" --output json | uv run python -c $'import json,sys\nfrom datetime import datetime,timezone\nfrom rich import print_json\n\ndata=json.load(sys.stdin)\n\ndef _parse_ts(v):\n  if v is None:\n    return None\n  if isinstance(v,(int,float)):\n    return float(v)/1000.0 if v>10_000_000_000 else float(v)\n  if isinstance(v,str):\n    s=v.strip()\n    if not s:\n      return None\n    try:\n      dt=datetime.fromisoformat(s.replace(\"Z\", \"+00:00\"))\n      if dt.tzinfo is None:\n        dt=dt.replace(tzinfo=timezone.utc)\n      return dt.timestamp()\n    except Exception:\n      return None\n  return None\n\ndef _ts(d):\n  for k in (\"create_time\",\"created_time\",\"creation_time\",\"start_time\",\"update_time\",\"updated_time\",\"end_time\"):\n    if isinstance(d,dict) and k in d:\n      ts=_parse_ts(d.get(k))\n      if ts is not None:\n        return ts\n  return 0.0\n\ndef _sort(xs):\n  return sorted(xs, key=_ts, reverse=True)\n\nif isinstance(data,list):\n  data=_sort(data)\nelif isinstance(data,dict):\n  if isinstance(data.get(\"deployments\"), list):\n    data[\"deployments\"]=_sort(data[\"deployments\"])\n  elif isinstance(data.get(\"items\"), list):\n    data[\"items\"]=_sort(data[\"items\"])\n\nprint_json(data=data)\n'

[group('app')]
app-info app_name=env_var_or_default('DATABRICKS_APP_NAME', ''):
  #!/usr/bin/env bash
  set -euo pipefail

  PROFILE="${DATABRICKS_CONFIG_PROFILE:-DEFAULT}"
  APP="{{app_name}}"
  if [ -z "$APP" ]; then
    APP="${DATABRICKS_APP_NAME:-}"
  fi
  if [ -z "$APP" ]; then
    echo "❌ App name not provided and DATABRICKS_APP_NAME is not set (run \`just configure\` or pass an app name)" >&2
    exit 2
  fi

  echo "📦 Deployments for app: $APP"
  echo "================================"
  DEPLOYMENTS_JSON="$(databricks --profile "$PROFILE" apps list-deployments "$APP" --output json)"
  printf '%s\n' "$DEPLOYMENTS_JSON" | uv run python -c $'import json,sys\nfrom datetime import datetime,timezone\nfrom rich import print_json\n\ndata=json.load(sys.stdin)\n\ndef _parse_ts(v):\n  if v is None:\n    return None\n  if isinstance(v,(int,float)):\n    return float(v)/1000.0 if v>10_000_000_000 else float(v)\n  if isinstance(v,str):\n    s=v.strip()\n    if not s:\n      return None\n    try:\n      dt=datetime.fromisoformat(s.replace(\"Z\", \"+00:00\"))\n      if dt.tzinfo is None:\n        dt=dt.replace(tzinfo=timezone.utc)\n      return dt.timestamp()\n    except Exception:\n      return None\n  return None\n\ndef _ts(d):\n  for k in (\"create_time\",\"created_time\",\"creation_time\",\"start_time\",\"update_time\",\"updated_time\",\"end_time\"):\n    if isinstance(d,dict) and k in d:\n      ts=_parse_ts(d.get(k))\n      if ts is not None:\n        return ts\n  return 0.0\n\ndef _sort(xs):\n  return sorted(xs, key=_ts, reverse=True)\n\nif isinstance(data,list):\n  data=_sort(data)\nelif isinstance(data,dict):\n  if isinstance(data.get(\"deployments\"), list):\n    data[\"deployments\"]=_sort(data[\"deployments\"])\n  elif isinstance(data.get(\"items\"), list):\n    data[\"items\"]=_sort(data[\"items\"])\n\nprint_json(data=data)\n'

  DEPLOYMENT_ID="$(printf '%s' "$DEPLOYMENTS_JSON" | uv run python -c $'import json,sys\nfrom datetime import datetime,timezone\nfrom rich.console import Console\n\nconsole=Console()\n\ndata=json.load(sys.stdin)\nif isinstance(data,dict):\n  deployments=data.get(\"deployments\", data.get(\"items\", data))\nelse:\n  deployments=data\nif isinstance(deployments,dict):\n  deployments=deployments.get(\"items\", [])\nif not isinstance(deployments,list) or not deployments:\n  raise SystemExit(\"No deployments found in list-deployments output\")\n\ndef _parse_ts(v):\n  if v is None:\n    return None\n  if isinstance(v,(int,float)):\n    return float(v)/1000.0 if v>10_000_000_000 else float(v)\n  if isinstance(v,str):\n    s=v.strip()\n    if not s:\n      return None\n    try:\n      dt=datetime.fromisoformat(s.replace(\"Z\", \"+00:00\"))\n      if dt.tzinfo is None:\n        dt=dt.replace(tzinfo=timezone.utc)\n      return dt.timestamp()\n    except Exception:\n      return None\n  return None\n\ndef _ts(d):\n  for k in (\"create_time\",\"created_time\",\"creation_time\",\"start_time\",\"update_time\",\"updated_time\",\"end_time\"):\n    if isinstance(d,dict) and k in d:\n      ts=_parse_ts(d.get(k))\n      if ts is not None:\n        return ts\n  return 0.0\n\ndeployments_sorted=sorted(deployments, key=_ts, reverse=True)\nbest=deployments_sorted[0]\nfor k in (\"deployment_id\",\"id\",\"deploymentId\",\"deploymentID\"):\n  if isinstance(best,dict) and best.get(k):\n    console.print(str(best[k]), end=\"\")\n    break\nelse:\n  raise SystemExit(\"Couldn\\x27t find deployment id in most recent deployment object\")\n')"

  echo ""
  echo "🧾 Most recent deployment id: $DEPLOYMENT_ID"
  echo "================================"
  databricks --profile "$PROFILE" apps get-deployment "$APP" "$DEPLOYMENT_ID" --output json | uv run python -c 'import json,sys; from rich import print_json; print_json(data=json.load(sys.stdin))'


[script]
test-connection:
  import os
  from rich import print
  from dotenv import load_dotenv
  from databricks.sdk import WorkspaceClient
  load_dotenv(".env.local")
  profile = os.environ.get("DATABRICKS_CONFIG_PROFILE", "DEFAULT")
  try:
    w = WorkspaceClient(profile=profile)
    user = w.current_user.me()
    print(f"✅ Connected as {user.user_name}")
  except Exception as e:
    print(f"❌ Connection failed: {e}")
    exit(1)


ui:
  @just ui-install

[group('dev')]
ui-install:
  npm -C {{client-dir}} install

[group('dev')]
ui-dev: openapi
  npm -C {{client-dir}} run dev

[group('dev')]
ui-build:
  #!/usr/bin/env bash
  set -euo pipefail

  # Run npm install if node_modules is missing or package.json is newer
  if [ ! -d "{{client-dir}}/node_modules" ] || [ "{{client-dir}}/package.json" -nt "{{client-dir}}/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm -C {{client-dir}} install
  fi

  npm -C {{client-dir}} run build

# Generate OpenAPI spec from FastAPI and TypeScript client
[group('dev')]
openapi:
  @echo "📜 Generating OpenAPI spec from FastAPI..."
  @uv run python -m server.make_openapi --output /tmp/openapi.json
  @echo "🔧 Generating TypeScript client..."
  @npx --yes openapi-typescript-codegen@0.30.0 --input /tmp/openapi.json --output {{client-dir}}/src/client --client fetch
  @echo "✅ TypeScript client generated at {{client-dir}}/src/client"

# Generate OpenAPI for local dev without syncing or rewriting uv.lock.
[group('dev')]
openapi-dev:
  #!/usr/bin/env bash
  set -euo pipefail
  echo "📜 Generating OpenAPI spec from FastAPI..."
  uv run --no-sync python -m server.make_openapi --output /tmp/openapi.json
  echo "🔧 Generating TypeScript client..."
  npx --yes openapi-typescript-codegen@0.30.0 --input /tmp/openapi.json --output {{client-dir}}/src/client --client fetch
  echo "✅ TypeScript client generated at {{client-dir}}/src/client"

# Run pytest (writes JSON report to .test-results/ for token-efficient summaries)
[group('dev')]
test-server *args:
  #!/usr/bin/env bash
  set -euo pipefail
  mkdir -p .test-results
  uv run pytest -q --json-report --json-report-file=.test-results/pytest.json {{args}}

# Run integration tests (real DB, transaction-rollback isolation)
[group('dev')]
test-integration *args:
  #!/usr/bin/env bash
  set -euo pipefail
  mkdir -p .test-results
  uv run pytest tests/integration/ -q --json-report --json-report-file=.test-results/pytest-integration.json {{args}}

# Run MLflow contract tests (mock shape & call-site verification)
[group('dev')]
test-contract *args:
  #!/usr/bin/env bash
  set -euo pipefail
  mkdir -p .test-results
  uv run pytest tests/contract/ -q --json-report --json-report-file=.test-results/pytest-contract.json {{args}}

[group('dev')]
ui-test: openapi
  npm -C {{client-dir}} run test

# Run vitest (writes JSON report to .test-results/ for token-efficient summaries)
[group('dev')]
ui-test-unit *args:
  #!/usr/bin/env bash
  set -euo pipefail
  mkdir -p .test-results
  VITEST_JSON_REPORT=1 npm -C {{client-dir}} run test:unit -- {{args}}

[group('dev')]
ui-lint: openapi
  npm -C {{client-dir}} run lint

# Detect dead Python code with vulture
[group('dev')]
lint-vulture:
  uv run vulture {{server-dir}}/ vulture_whitelist.py --min-confidence 80

# Run full ruff lint (uses pyproject.toml config)
[group('dev')]
lint-ruff *args:
  uv run ruff check {{server-dir}}/ {{args}}

# Detect dead Python code with ruff F4xx rules
[group('dev')]
lint-ruff-deadcode:
  uv run ruff check --select F {{server-dir}}/

# Detect dead TypeScript/JS code with knip
[group('dev')]
lint-knip:
  npm -C {{client-dir}} run knip

# Run all dead-code linters (vulture + ruff F4xx + knip)
[group('dev')]
lint-deadcode: lint-vulture lint-ruff-deadcode lint-knip

[group('dev')]
ui-typecheck: openapi
  npm -C {{client-dir}} run typecheck

[group('dev')]
ui-format:
  npm -C {{client-dir}} run format

# Analyze spec test coverage (writes to SPEC_COVERAGE_MAP.md)
# Use --json for JSON output, --affected [REF] for changes since REF (default HEAD~1)
# Example: just spec-coverage --affected          # specs affected since last commit
# Example: just spec-coverage --affected main     # specs affected since main branch
# Example: just spec-coverage --specs AUTHENTICATION_SPEC ANNOTATION_SPEC
[group('dev')]
spec-coverage *args:
  #!/usr/bin/env bash
  if [[ "{{args}}" == *"--json"* ]]; then
    uv run spec-coverage-analyzer {{args}}
  else
    echo "📊 Analyzing spec test coverage..."
    uv run spec-coverage-analyzer {{args}}
    if [[ "{{args}}" != *"--affected"* ]]; then
      echo ""
      echo "📋 Coverage report: SPEC_COVERAGE_MAP.md"
    fi
  fi

# Show specs affected by recent changes and run their tests
[group('dev')]
test-affected base="HEAD~1":
  #!/usr/bin/env bash
  echo "🔍 Detecting affected specs since {{base}}..."
  AFFECTED=$(uv run spec-coverage-analyzer --affected {{base}} --json 2>/dev/null | jq -r '.affected_mode.affected_specs[]' 2>/dev/null)
  if [ -z "$AFFECTED" ]; then
    echo "No specs affected by changes since {{base}}"
    exit 0
  fi
  echo "Affected specs:"
  echo "$AFFECTED" | while read spec; do echo "  - $spec"; done
  echo ""
  echo "Running tests for affected specs..."
  for spec in $AFFECTED; do
    echo "=== Testing $spec ==="
    just test-server-spec "$spec" || true
  done

# Check for spec coverage regressions against baseline
# Use --update-baseline to snapshot current coverage as the new baseline
[group('dev')]
spec-coverage-gate *args:
  uv run spec-coverage-gate {{args}}

[group('dev')]
spec-validate:
  @echo "✅ Validating that all tests are tagged with specs..."
  uv run spec-tagging-validator

[group('dev')]
test-server-spec spec *args:
  @echo "Running Python tests for {{spec}}..."
  just test-server --spec {{spec}} -v {{args}}

[group('dev')]
ui-test-unit-spec spec *args:
  @echo "Running unit tests for {{spec}}..."
  just ui-test-unit -t "@spec:{{spec}}" {{args}}

# Run E2E tests for a specific spec (writes JSON report to .test-results/)
[group('e2e')]
e2e-spec spec mode="headless" workers="1":
  @echo "Running E2E tests for {{spec}} in {{mode}} mode..."
  just e2e {{mode}} {{workers}} "@spec:{{spec}}"

# Run all tests (unit, integration, E2E) for a specific spec
[group('dev')]
test-spec spec mode="headless" workers="1":
  #!/usr/bin/env bash
  set -euo pipefail
  echo "🧪 Running all tests for {{spec}}"
  echo "=================================="
  FAILED=0
  echo ""
  echo "── Python tests ──"
  just test-server-spec {{spec}} || FAILED=1
  echo ""
  echo "── Frontend unit tests ──"
  just ui-test-unit-spec {{spec}} || FAILED=1
  echo ""
  echo "── E2E tests ──"
  just e2e-spec {{spec}} {{mode}} {{workers}} || FAILED=1
  echo ""
  echo "=================================="
  if [ "$FAILED" -eq 0 ]; then
    echo "✅ All tests passed for {{spec}}"
  else
    echo "❌ Some tests failed for {{spec}}"
    exit 1
  fi

# Get token-efficient test summary from JSON reports
[group('dev')]
test-summary *args:
  uv run test-summary {{args}}

# Check status of a specific spec (test results + coverage info)
[group('dev')]
spec-status spec:
  #!/usr/bin/env bash
  set -euo pipefail
  echo "Spec: {{spec}}"
  echo "=============="
  echo ""
  # Check if reports exist and filter by spec
  if [ -f .test-results/pytest.json ] || [ -f .test-results/playwright.json ] || [ -f .test-results/vitest.json ]; then
    uv run test-summary --spec {{spec}} || true
  else
    echo "No test reports found. Run tests first."
  fi
  echo ""
  # Show spec coverage info
  echo "Coverage from SPEC_COVERAGE_MAP.md:"
  grep -A 10 "## {{spec}}" specs/SPEC_COVERAGE_MAP.md 2>/dev/null || echo "  (Run 'just spec-coverage' to generate)"

[group('db')]
db-upgrade:
  uv run alembic upgrade head

[group('db')]
db-stamp:
  uv run alembic stamp head

[group('db')]
db-revision message:
  uv run alembic revision --autogenerate -m "{{message}}"

[group('db')]
db-bootstrap:
  uv run python -m server.db_bootstrap bootstrap

[group('db')]
db-bootstrap-dev:
  uv run --no-sync python -m server.db_bootstrap bootstrap

[group('db')]
setup-queue-schema:
  uv run procrastinate --app=server.workers.procrastinate_app.app schema --apply

[group('dev')]
setup-queue-healthcheck:
  uv run procrastinate --app=server.workers.procrastinate_app.app healthchecks

[group('dev')]
setup-worker:
  uv run procrastinate --app=server.workers.procrastinate_app.app worker --queues project_setup

[script]
e2e-wait-ready api_port="8000" ui_port="3000" timeout_s="60":
  import time
  import urllib.request

  api_port = int("{{api_port}}")
  ui_port = int("{{ui_port}}")
  timeout_s = float("{{timeout_s}}")

  urls = [
    f"http://127.0.0.1:{api_port}/health",
    f"http://127.0.0.1:{ui_port}/",
  ]

  deadline = time.time() + timeout_s
  last_error = [None]

  def wait_for(url: str) -> None:
    while time.time() < deadline:
      try:
        with urllib.request.urlopen(url, timeout=2) as r:
          getattr(r, "status", 200)
          return
      except Exception as e:
        last_error[0] = e
        time.sleep(0.5)
    raise TimeoutError(f"Timed out waiting for {url}. Last error: {last_error[0]}")

  for url in urls:
    wait_for(url)

[group('dev')]
py-install-dev:
  uv pip install -e ".[dev]"

# Stop dev servers for this worktree (or all worktrees with --all)
[group('dev')]
dev-stop *args:
  #!/usr/bin/env bash
  set -euo pipefail
  if [[ "{{args}}" == *"--all"* ]]; then
    echo "🧹 Stopping ALL dev servers across all worktrees..."
    just _dev-pidfile cleanup-all
  else
    echo "🧹 Stopping dev servers for this worktree..."
    just _dev-pidfile cleanup
  fi
  echo "✅ Done"

# Show running dev servers across all worktrees
[group('dev')]
dev-status:
  @echo "📋 Dev servers:"
  @just _dev-pidfile list

[group('dev')]
api-dev port="8000":
  #!/usr/bin/env bash
  set -euo pipefail
  PORT=$(just _find-port "{{port}}")
  echo "🔌 API dev server on port $PORT"
  just db-bootstrap
  uv run uvicorn {{server-dir}}.app:app --reload --port "$PORT" --log-level "${UVICORN_LOG_LEVEL:-info}"

[group('dev')]
api port="8000":
  #!/usr/bin/env bash
  set -euo pipefail
  PORT=$(just _find-port "{{port}}")
  echo "🔌 API server on port $PORT"
  just db-bootstrap
  uv run uvicorn {{server-dir}}.app:app --port "$PORT" --log-level "${UVICORN_LOG_LEVEL:-info}"

[group('app')]
deploy:
  #!/usr/bin/env bash
  set -euo pipefail

  PROFILE="${DATABRICKS_CONFIG_PROFILE:-DEFAULT}"
  APP="${DATABRICKS_APP_NAME:?DATABRICKS_APP_NAME is not set (run \`just configure\`)}"

  echo "📦 Syncing files to workspace..."
  DATABRICKS_USERNAME=$(databricks --profile "$PROFILE" current-user me | jq -r .userName)
  WORKSPACE_PATH="/Workspace/Users/$DATABRICKS_USERNAME/$APP"

  databricks --profile "$PROFILE" sync . "$WORKSPACE_PATH" \
    --exclude ".git" \
    --exclude ".claude" \
    --exclude "node_modules" \
    --exclude "__pycache__" \
    --exclude "*.db" \
    --exclude ".venv" \
    --exclude ".e2e-*" \
    --exclude "htmlcov"

  # Create app if it doesn't exist
  if ! databricks --profile "$PROFILE" apps get "$APP" &>/dev/null; then
    echo "📱 Creating app: $APP"
    databricks --profile "$PROFILE" apps create "$APP"
  fi

  echo "🚀 Deploying app: $APP"
  echo "   Databricks will run: npm install → pip install → npm run build → app.yaml command"
  databricks --profile "$PROFILE" apps deploy "$APP" --source-code-path "$WORKSPACE_PATH"

  echo ""
  echo "✅ Deployment initiated for $APP"
  echo "   Run 'just app-info' to check deployment status"

[group('dev')]
dev api_port_or_db_mode="8000" ui_port="5173" db_mode="sqlite": openapi-dev
  #!/usr/bin/env bash
  set -euo pipefail

  API_PORT_START="{{api_port_or_db_mode}}"
  DB_MODE="{{db_mode}}"
  case "$API_PORT_START" in
    sqlite|postgres|lakebase)
      DB_MODE="$API_PORT_START"
      API_PORT_START="8000"
      ;;
  esac

  case "$DB_MODE" in
    sqlite)
      export DATABASE_ENV=sqlite
      ;;
    postgres|lakebase)
      export DATABASE_ENV=postgres
      if [ -f "{{lakebase-local-env}}" ]; then
        set -a
        # shellcheck disable=SC1091
        source "{{lakebase-local-env}}"
        set +a
      fi
      if [ -n "${DATABASE_URL:-}" ]; then
        eval "$(DATABASE_URL="$DATABASE_URL" just _lakebase-url-env)"
      fi

      PROFILE="${DATABRICKS_CONFIG_PROFILE:-DEFAULT}"
      if [ -z "${PGUSER:-}" ]; then
        current_user_json="$(databricks --profile "$PROFILE" current-user me --output json)" || {
          echo "❌ Could not derive PGUSER from Databricks profile '$PROFILE'." >&2
          echo "   Run: databricks auth login --profile $PROFILE" >&2
          echo "   Or set PGUSER in {{lakebase-local-env}}." >&2
          exit 1
        }
        PGUSER="$(printf '%s' "$current_user_json" | uv run --no-sync python -c 'import json,sys; print(json.load(sys.stdin).get("userName",""))')"
        export PGUSER
      fi

      export PGDATABASE="${PGDATABASE:-databricks_postgres}"
      export PGPORT="${PGPORT:-5432}"
      export PGSSLMODE="${PGSSLMODE:-require}"
      export PGAPPNAME="${PGAPPNAME:-${DATABRICKS_APP_NAME:-human-eval-workshop}}"

      missing=()
      for name in PGHOST PGDATABASE PGUSER; do
        if [ -z "${!name:-}" ]; then
          missing+=("$name")
        fi
      done
      if [ "${#missing[@]}" -gt 0 ]; then
        echo "❌ Missing Lakebase local env vars: ${missing[*]}" >&2
        echo "   Run: just configure-lakebase-local" >&2
        echo "   Or create {{lakebase-local-env}} with DATABASE_URL, or PGHOST, PGDATABASE, and PGUSER." >&2
        exit 2
      fi
      ;;
    *)
      echo "❌ Unknown db_mode '$DB_MODE' (expected sqlite|postgres|lakebase)" >&2
      exit 2
      ;;
  esac

  # Kill any leftover servers from a previous run of this worktree
  just _dev-pidfile cleanup

  API_PORT=$(just _find-port "$API_PORT_START")
  UI_PORT=$(just _find-port "{{ui_port}}")

  echo "🚀 Starting dev environment"
  echo "  DB : ${DATABASE_ENV}"
  if [ "${DATABASE_ENV}" = "postgres" ]; then
    echo "       ${PGUSER}@${PGHOST}/${PGDATABASE} (schema/app: ${PGAPPNAME})"
  fi
  echo "  API: http://localhost:${API_PORT}"
  echo "  UI : http://localhost:${UI_PORT}"
  echo ""

  just db-bootstrap-dev

  # Start API
  (uv run --no-sync uvicorn {{server-dir}}.app:app --reload --port "$API_PORT" --log-level "${UVICORN_LOG_LEVEL:-info}") &
  api_pid=$!

  # Start UI and proxy to the selected API port.
  # Vite reads E2E_API_URL in client/vite.config.ts for backend proxy target.
  (E2E_API_URL="http://127.0.0.1:${API_PORT}" npm -C {{client-dir}} run dev -- --port "$UI_PORT") &
  ui_pid=$!

  # Record PIDs so a future `just dev` or `just dev-cleanup` can kill them
  just _dev-pidfile write "$api_pid $ui_pid"

  cleanup() {
    kill "$api_pid" "$ui_pid" 2>/dev/null || true
    just _dev-pidfile remove
  }
  trap cleanup INT TERM EXIT

  # macOS ships an older bash which doesn't support `wait -n`,
  # so we poll until either process exits.
  while kill -0 "$api_pid" 2>/dev/null && kill -0 "$ui_pid" 2>/dev/null; do
    sleep 1
  done

  # Reap exits (ignore non-zero since dev servers exit on CTRL+C etc.)
  wait "$api_pid" 2>/dev/null || true
  wait "$ui_pid" 2>/dev/null || true
  cleanup


# =========================
# End-to-end (E2E) testing
# =========================

[group('e2e')]
e2e-servers db_path=".e2e-workshop.db" api_port="8000" ui_port="3000":
  #!/usr/bin/env bash
  set -euo pipefail

  # Support both keyword and positional arguments
  DB_PATH="${1:-{{db_path}}}"
  API_PORT="${2:-{{api_port}}}"
  UI_PORT="${3:-{{ui_port}}}"

  # Log suppression: set E2E_QUIET=1 to redirect server logs to files
  LOG_DIR=".test-results"
  mkdir -p "$LOG_DIR"
  if [ "${E2E_QUIET:-0}" = "1" ]; then
    API_LOG="$LOG_DIR/api-server.log"
    UI_LOG="$LOG_DIR/ui-server.log"
  else
    API_LOG="/dev/stdout"
    UI_LOG="/dev/stdout"
  fi

  # Ensure schema exists before starting the API (migrations are part of the workflow, not app startup)
  ENVIRONMENT=development DATABASE_URL="sqlite:///./${DB_PATH}" just db-bootstrap

  echo "🚀 Starting E2E servers"
  echo "  DB : ${DB_PATH}"
  echo "  API: http://localhost:${API_PORT}"
  echo "  UI : http://localhost:${UI_PORT}"
  if [ "${E2E_QUIET:-0}" = "1" ]; then
    echo "  Logs: $LOG_DIR/{api,ui}-server.log"
  fi

  # Start API (no reload for E2E)
  (ENVIRONMENT=development DATABASE_URL="sqlite:///./${DB_PATH}" uv run uvicorn {{server-dir}}.app:app --host 127.0.0.1 --port "$API_PORT" > "$API_LOG" 2>&1) &
  api_pid=$!

  # Start UI (force port for determinism, proxy to correct API port)
  (E2E_API_URL="http://127.0.0.1:${API_PORT}" npm -C {{client-dir}} run dev -- --host 127.0.0.1 --port "$UI_PORT" --strictPort > "$UI_LOG" 2>&1) &
  ui_pid=$!

  cleanup() {
    kill "$api_pid" "$ui_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
    wait "$ui_pid" 2>/dev/null || true
  }
  trap cleanup INT TERM EXIT

  # Keep running until one process exits
  while kill -0 "$api_pid" 2>/dev/null && kill -0 "$ui_pid" 2>/dev/null; do
    sleep 1
  done

  wait "$api_pid" 2>/dev/null || true
  wait "$ui_pid" 2>/dev/null || true
  cleanup


[group('e2e')]
e2e-test mode="headless" workers="1" *args="":
  #!/usr/bin/env bash
  set -euo pipefail

  # If Playwright is configured with webServer, avoid double-starting when we already started servers via `just e2e`.
  export PW_NO_WEBSERVER=1

  # Default test path
  TEST_PATH="tests/e2e"
  GREP_ARGS=""

  # Check if args is a tag filter (starts with @) or a path
  if [ -n "{{args}}" ]; then
    if [[ "{{args}}" == @* ]]; then
      # It's a tag filter - use --grep
      GREP_ARGS="--grep \"{{args}}\""
    else
      # It's a path or other argument
      TEST_PATH="{{args}}"
    fi
  fi

  echo "Running tests in {{mode}} mode with {{workers}} workers: $TEST_PATH $GREP_ARGS"

  case "{{mode}}" in
    ui)
      eval "npm -C {{client-dir}} run test -- $TEST_PATH --ui --workers={{workers}} $GREP_ARGS"
      ;;
    headed)
      eval "npm -C {{client-dir}} run test -- $TEST_PATH --headed --workers={{workers}} $GREP_ARGS"
      ;;
    headless)
      eval "npm -C {{client-dir}} run test -- $TEST_PATH --workers={{workers}} $GREP_ARGS"
      ;;
    *)
      echo "Unknown mode: {{mode}} (expected: headless|headed|ui)" >&2
      exit 2
      ;;
  esac


# Check if a port is available
[script]
_port-available port:
  import socket
  port = int("{{port}}")
  with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    result = s.connect_ex(('127.0.0.1', port))
    # connect_ex returns 0 if connection succeeded (port in use)
    exit(0 if result != 0 else 1)

# Find an available port starting from the given port
[script]
_find-port start_port:
  import socket
  port = int("{{start_port}}")
  for p in range(port, port + 100):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
      if s.connect_ex(('127.0.0.1', p)) != 0:
        print(p)
        exit(0)
  exit(1)

# Write a PID file for the current worktree's dev servers so they can be
# cleaned up later (even after terminal close / IDE crash).
# Keyed by a hash of the repo root path so multiple worktrees don't collide.
[script]
_dev-pidfile action *pids:
  import hashlib, json, os, signal, sys, time

  repo_root = os.path.realpath(os.getcwd())
  key = hashlib.sha256(repo_root.encode()).hexdigest()[:12]
  pid_dir = os.path.expanduser("~/.cache/project-dev-servers")
  os.makedirs(pid_dir, exist_ok=True)
  pidfile = os.path.join(pid_dir, f"{key}.json")

  action = "{{action}}"

  if action == "write":
      pids = [int(p) for p in "{{pids}}".split() if p.strip()]
      data = {"root": repo_root, "pids": pids, "ts": time.time()}
      with open(pidfile, "w") as f:
          json.dump(data, f)

  elif action == "cleanup":
      # Kill any stale servers from a previous run of THIS worktree
      if os.path.exists(pidfile):
          try:
              with open(pidfile) as f:
                  data = json.load(f)
              for pid in data.get("pids", []):
                  try:
                      os.kill(pid, signal.SIGTERM)
                  except ProcessLookupError:
                      pass
              os.remove(pidfile)
          except Exception:
              pass

  elif action == "cleanup-all":
      # Kill dev servers from ALL worktrees (nuclear option)
      killed = 0
      for fname in os.listdir(pid_dir):
          fpath = os.path.join(pid_dir, fname)
          if not fname.endswith(".json"):
              continue
          try:
              with open(fpath) as f:
                  data = json.load(f)
              root = data.get("root", "?")
              for pid in data.get("pids", []):
                  try:
                      os.kill(pid, signal.SIGTERM)
                      killed += 1
                      print(f"  killed pid {pid} ({root})")
                  except ProcessLookupError:
                      pass
              os.remove(fpath)
          except Exception:
              pass
      if killed == 0:
          print("  no stale dev servers found")

  elif action == "list":
      if not os.path.isdir(pid_dir):
          print("  no dev servers tracked")
          sys.exit(0)
      for fname in sorted(os.listdir(pid_dir)):
          fpath = os.path.join(pid_dir, fname)
          if not fname.endswith(".json"):
              continue
          try:
              with open(fpath) as f:
                  data = json.load(f)
              root = data.get("root", "?")
              pids = data.get("pids", [])
              alive = []
              for pid in pids:
                  try:
                      os.kill(pid, 0)
                      alive.append(str(pid))
                  except ProcessLookupError:
                      pass
              status = f"alive: {', '.join(alive)}" if alive else "stale (all dead)"
              print(f"  {root}  [{status}]")
          except Exception:
              pass

  elif action == "remove":
      if os.path.exists(pidfile):
          os.remove(pidfile)

  else:
      print(f"Unknown action: {action}", file=sys.stderr)
      sys.exit(1)

# Run E2E tests (writes JSON report to .test-results/ for token-efficient summaries)
# Loads environment variables from .env file (not .env.local) for CI secrets
#
# Browser Error Capture:
#   Tests using TestScenario automatically capture browser console errors and
#   JavaScript exceptions (pageerror). Errors are logged to stdout and cause
#   test failure via scenario.cleanup(). This helps catch React errors, undefined
#   function calls, and other client-side bugs.
#
# Example: just e2e headless 1 "my-test.spec.ts"
[group('e2e')]
e2e mode="headless" workers="1" *args:
  #!/usr/bin/env bash
  set -euo pipefail

  # Load environment variables from .env file if it exists (for CI secrets like E2E_DATABRICKS_*)
  if [ -f ".env" ]; then
    set -a
    source .env
    set +a
  fi

  # Enable JSON reporting for token-efficient output
  export PW_JSON_REPORT=1
  # Fail fast on type errors before redirecting logs
  just ui-typecheck
  # Suppress server logs (redirect to files in .test-results/)
  export E2E_QUIET=1
  mkdir -p .test-results

  DB_PATH=".e2e-workshop.db"

  # Find available ports (try defaults first, then increment)
  API_PORT=$(just _find-port 8000)
  UI_PORT=$(just _find-port 3000)

  echo "Using ports: API=$API_PORT, UI=$UI_PORT"

  # Always start from a clean DB for isolation
  rm -f "$DB_PATH"

  # Create a wrapper recipe call that properly interpolates the ports
  # We use eval to dynamically call just with the correct keyword arguments
  just e2e-servers "$DB_PATH" "$API_PORT" "$UI_PORT" &
  servers_pid=$!

  cleanup() {
    kill "$servers_pid" 2>/dev/null || true
    wait "$servers_pid" 2>/dev/null || true
  }
  trap cleanup INT TERM EXIT

  # Wait for API + UI to be ready
  just e2e-wait-ready "$API_PORT" "$UI_PORT"

  # Run tests with the correct URLs
  E2E_API_URL="http://127.0.0.1:$API_PORT" PLAYWRIGHT_BASE_URL="http://127.0.0.1:$UI_PORT" just e2e-test "{{mode}}" "{{workers}}" {{args}}

  cleanup
