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
ui-dev:
  npm -C {{client-dir}} run dev

[group('dev')]
ui-build:
  npm -C {{client-dir}} run build

[group('dev')]
ui-test:
  npm -C {{client-dir}} run test

[group('dev')]
ui-lint:
  npm -C {{client-dir}} run lint

[group('dev')]
ui-format:
  npm -C {{client-dir}} run format

[group('dev')]
py-install-dev:
  uv pip install -e ".[dev]"

[group('dev')]
api-dev port="8000":
  uv run uvicorn {{server-dir}}.app:app --reload --port {{port}}

[group('dev')]
api port="8000":
  uv run uvicorn {{server-dir}}.app:app --port {{port}}

[group('dev')]
dev api_port="8000" ui_port="5173":
  #!/usr/bin/env bash
  set -euo pipefail

  API_PORT="{{api_port}}"
  UI_PORT="{{ui_port}}"

  prefix() {
    local label="$1"
    local color="$2"
    # Line-prefix output for readability when running multiple processes
    while IFS= read -r line; do
      printf "%b[%s]%b %s\n" "$color" "$label" $'\033[0m' "$line"
    done
  }

  echo "🚀 Starting dev environment"
  echo "  API: http://localhost:${API_PORT}"
  echo "  UI : http://localhost:${UI_PORT}"
  echo ""

  # Start API
  (uv run uvicorn {{server-dir}}.app:app --reload --port "$API_PORT" 2>&1 | prefix api $'\033[34m') &
  api_pid=$!

  # Start UI
  # Note: Vite's port is controlled in client config; `UI_PORT` is informational unless wired into Vite args.
  (npm -C {{client-dir}} run dev 2>&1 | prefix ui $'\033[32m') &
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