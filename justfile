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
  @echo "Next step: run './deploy.sh' when ready to deploy"

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
ui-build: openapi
  npm -C {{client-dir}} run build

# Generate OpenAPI spec from FastAPI and TypeScript client
[group('dev')]
openapi:
  @echo "📜 Generating OpenAPI spec from FastAPI..."
  @uv run python -m server.make_openapi --output /tmp/openapi.json
  @echo "🔧 Generating TypeScript client..."
  @npx openapi-typescript-codegen --input /tmp/openapi.json --output {{client-dir}}/src/client --client fetch
  @echo "✅ TypeScript client generated at {{client-dir}}/src/client"

# Run pytest (writes JSON report to .test-results/ for token-efficient summaries)
[group('dev')]
test-server *args:
  #!/usr/bin/env bash
  set -euo pipefail
  mkdir -p .test-results
  uv run pytest -q --json-report --json-report-file=.test-results/pytest.json {{args}}

[group('dev')]
ui-test: openapi
  npm -C {{client-dir}} run test

# Run vitest (writes JSON report to .test-results/ for token-efficient summaries)
[group('dev')]
ui-test-unit *args: openapi
  #!/usr/bin/env bash
  set -euo pipefail
  mkdir -p .test-results
  VITEST_JSON_REPORT=1 npm -C {{client-dir}} run test:unit -- {{args}}

[group('dev')]
ui-lint: openapi
  npm -C {{client-dir}} run lint

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

[group('dev')]
spec-validate:
  @echo "🏷️  Validating spec tags on all tests..."
  uv run spec-tagging-validator

[group('dev')]
test-server-spec spec *args:
  @echo "Running Python tests for {{spec}}..."
  just test-server --spec {{spec}} -v {{args}}

[group('dev')]
ui-test-unit-spec spec *args:
  @echo "Running unit tests for {{spec}}..."
  just ui-test-unit --grep "@spec:{{spec}}" {{args}}

# Run E2E tests for a specific spec (writes JSON report to .test-results/)
[group('e2e')]
e2e-spec spec mode="headless" workers="1":
  @echo "Running E2E tests for {{spec}} in {{mode}} mode..."
  just e2e {{mode}} {{workers}} "@spec:{{spec}}"

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

[group('dev')]
api-dev port="8000":
  just db-bootstrap
  uv run uvicorn {{server-dir}}.app:app --reload --port {{port}}

[group('dev')]
api port="8000":
  just db-bootstrap
  uv run uvicorn {{server-dir}}.app:app --port {{port}}

[group('app')]
deploy:
  just ui-build
  just db-bootstrap
  SKIP_UI_BUILD=1 ./deploy.sh

[group('dev')]
dev api_port="8000" ui_port="5173": openapi
  #!/usr/bin/env bash
  set -euo pipefail

  API_PORT="{{api_port}}"
  UI_PORT="{{ui_port}}"

  echo "🚀 Starting dev environment"
  echo "  API: http://localhost:${API_PORT}"
  echo "  UI : http://localhost:${UI_PORT}"
  echo ""

  just db-bootstrap

  # Start API
  (uv run uvicorn {{server-dir}}.app:app --reload --port "$API_PORT") &
  api_pid=$!

  # Start UI
  # Note: Vite's port is controlled in client config; `UI_PORT` is informational unless wired into Vite args.
  (npm -C {{client-dir}} run dev) &
  ui_pid=$!

  cleanup() {
    kill "$api_pid" "$ui_pid" 2>/dev/null || true
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

  # Start UI (force port for determinism)
  (npm -C {{client-dir}} run dev -- --host 127.0.0.1 --port "$UI_PORT" --strictPort > "$UI_LOG" 2>&1) &
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