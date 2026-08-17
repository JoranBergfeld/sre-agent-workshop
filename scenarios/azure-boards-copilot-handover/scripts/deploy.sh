#!/usr/bin/env bash
# Deploys the current checkout of the Azure Boards Copilot Handover Function
# app to an already-provisioned scenario resource group. Runs the app's
# baseline quality gates first, ships a clean runtime-only zip (no venv, no
# tests), stamps the exact deployed git commit and UTC timestamp as Function
# app settings, and waits (bounded) for the keyed status endpoint to confirm
# the new commit is live.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SCENARIO_RELATIVE="scenarios/azure-boards-copilot-handover"
APP_DIR="$REPO_ROOT/$SCENARIO_RELATIVE/app"

WORKLOAD="srelabboardshandover"
RESOURCE_GROUP=""
RESOURCE_GROUP_SET=false
FUNCTION_APP=""
KEEP_TEMP=false

STATUS_POLL_ATTEMPTS="${STATUS_POLL_ATTEMPTS:-20}"
STATUS_POLL_DELAY_SECONDS="${STATUS_POLL_DELAY_SECONDS:-10}"

usage() {
  cat <<'EOF'
Usage: deploy.sh [-w|--workload <name>] [-g|--resource-group <name>] [-a|--app-name <name>] [-s|--subscription-id <id>] [--keep-temp] [-h|--help]

Deploys the current checkout to an already-provisioned Function app.

Options:
  -w, --workload         Workload name used to derive <workload>-rg (default: srelabboardshandover)
  -g, --resource-group   Resource group containing the Function app (default: <workload>-rg)
  -a, --app-name         Function app name (default: discovered via az functionapp list)
  -s, --subscription-id  Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
      --keep-temp        Keep the staged zip/temp directory instead of deleting it (debugging)
  -h, --help             Show this help
EOF
}

require_option_value() {
  local option="$1"
  local value="${2:-}"

  if [ -z "$value" ] || [[ "$value" == -* ]]; then
    echo "Missing value for $option." >&2
    usage >&2
    exit 2
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -w|--workload)
      require_option_value "$1" "${2:-}"
      WORKLOAD="$2"
      shift 2
      ;;
    -g|--resource-group)
      require_option_value "$1" "${2:-}"
      RESOURCE_GROUP="$2"
      RESOURCE_GROUP_SET=true
      shift 2
      ;;
    -a|--app-name)
      require_option_value "$1" "${2:-}"
      FUNCTION_APP="$2"
      shift 2
      ;;
    -s|--subscription-id)
      require_option_value "$1" "${2:-}"
      export AZURE_SUBSCRIPTION_ID="$2"
      shift 2
      ;;
    --keep-temp)
      KEEP_TEMP=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ "$RESOURCE_GROUP_SET" = false ]; then
  RESOURCE_GROUP="${WORKLOAD}-rg"
fi

echo "========================================"
echo "  Azure Boards Copilot Handover — Deploy"
echo "========================================"
echo "Resource group: $RESOURCE_GROUP"

for required_command in az git zip curl jq; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [ -n "$requested_subscription_id" ] && ! az account set --subscription "$requested_subscription_id"; then echo "Unable to select Azure subscription '$requested_subscription_id'. Run 'az login', then run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
active_subscription_id=$(az account show --query id --output tsv) || { echo "Azure CLI is not authenticated. Run 'az login' and try again." >&2; exit 1; }
active_subscription_name=$(az account show --query name --output tsv) || { echo "Unable to read the active Azure subscription name." >&2; exit 1; }
if [ -z "$active_subscription_id" ] || [ -z "$active_subscription_name" ]; then echo "Unable to read the active Azure subscription. Run 'az login' and try again." >&2; exit 1; fi
if [ -n "$requested_subscription_id" ] && [ "$active_subscription_id" != "$requested_subscription_id" ]; then echo "Azure subscription mismatch: requested '$requested_subscription_id', but active subscription is '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

if [ -z "$FUNCTION_APP" ]; then
  FUNCTION_APP=$(az functionapp list --resource-group "$RESOURCE_GROUP" --query "[0].name" --output tsv)
  if [ -z "$FUNCTION_APP" ]; then
    echo "Unable to discover a Function app in resource group '$RESOURCE_GROUP'. Pass --app-name explicitly." >&2
    exit 1
  fi
fi
echo "Function app: $FUNCTION_APP"

# --- Baseline quality gates (run against the current checkout) ------------
if [ -d "$APP_DIR/.venv/bin" ]; then
  export PATH="$APP_DIR/.venv/bin:$PATH"
fi

for required_tool in ruff mypy pytest; do
  if ! command -v "$required_tool" >/dev/null 2>&1; then
    echo "Required Python tool not found: $required_tool (expected in $APP_DIR/.venv or on PATH)" >&2
    exit 1
  fi
done

echo "Running baseline quality gates from $APP_DIR ..."
(cd "$APP_DIR" && ruff format --check .)
(cd "$APP_DIR" && ruff check .)
(cd "$APP_DIR" && mypy)
(cd "$APP_DIR" && pytest)

# --- Stage a clean runtime-only zip (no venv, no tests, no caches) ---------
WORK_DIR="$(mktemp -d)"

cleanup_temp() {
  if [ "$KEEP_TEMP" = false ]; then
    rm -rf -- "$WORK_DIR"
  fi
}
trap cleanup_temp EXIT

STAGE_DIR="$WORK_DIR/stage"
mkdir -p "$STAGE_DIR"
cp "$APP_DIR/function_app.py" "$STAGE_DIR/"
cp "$APP_DIR/host.json" "$STAGE_DIR/"
cp "$APP_DIR/requirements.txt" "$STAGE_DIR/"
while IFS= read -r -d '' relative_path; do
  destination="$STAGE_DIR/$relative_path"
  mkdir -p "$(dirname "$destination")"
  cp "$APP_DIR/$relative_path" "$destination"
done < <(cd "$APP_DIR" && git ls-files -z -- order_events)

(cd "$STAGE_DIR" && zip -qr "$WORK_DIR/app.zip" .)

if [ "$KEEP_TEMP" = true ] && [ -n "${DEPLOY_KEEP_TEMP_DIR_LOG:-}" ]; then
  printf '%s\n' "$WORK_DIR" > "$DEPLOY_KEEP_TEMP_DIR_LOG"
fi

# --- Ensure remote build is enabled (idempotent) ---------------------------
current_build_setting=$(az functionapp config appsettings list \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP" \
  --query "[?name=='SCM_DO_BUILD_DURING_DEPLOYMENT'].value | [0]" \
  --output tsv)
if [ "$current_build_setting" != "true" ]; then
  echo "Enabling remote build (SCM_DO_BUILD_DURING_DEPLOYMENT)..."
  az functionapp config appsettings set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_APP" \
    --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    --output none
fi

# --- Stamp the exact deployed commit and UTC timestamp ---------------------
DEPLOYED_COMMIT_SHA="$(cd "$REPO_ROOT" && git rev-parse HEAD)"
DEPLOYED_AT_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Stamping DEPLOYED_COMMIT_SHA=$DEPLOYED_COMMIT_SHA DEPLOYED_AT_UTC=$DEPLOYED_AT_UTC"
az functionapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP" \
  --settings "DEPLOYED_COMMIT_SHA=$DEPLOYED_COMMIT_SHA" "DEPLOYED_AT_UTC=$DEPLOYED_AT_UTC" \
  --output none

# --- Deploy the zip ---------------------------------------------------------
echo "Deploying zip package to Function app '$FUNCTION_APP' ..."
az functionapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP" \
  --src-path "$WORK_DIR/app.zip" \
  --type zip \
  --output none

# --- Wait (bounded) for the keyed status endpoint to report the new SHA ----
FUNCTION_HOSTNAME=$(az functionapp show --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query defaultHostName --output tsv)
FUNCTION_KEY=$(az functionapp keys list --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query "functionKeys.default" --output tsv)
STATUS_URL="https://$FUNCTION_HOSTNAME/api/status?code=$FUNCTION_KEY"

echo "Waiting for deployment to report DEPLOYED_COMMIT_SHA=$DEPLOYED_COMMIT_SHA ..."
attempt=0
deployed_sha_confirmed=false
while [ "$attempt" -lt "$STATUS_POLL_ATTEMPTS" ]; do
  attempt=$((attempt + 1))
  status_body_file="$WORK_DIR/status-$attempt.json"
  curl -sS -o "$status_body_file" -w '%{http_code}' "$STATUS_URL" >/dev/null 2>&1 || true
  reported_sha=$(jq -er '.deployedCommitSha // empty' "$status_body_file" 2>/dev/null || true)
  if [ "$reported_sha" = "$DEPLOYED_COMMIT_SHA" ]; then
    deployed_sha_confirmed=true
    break
  fi
  if [ "$attempt" -lt "$STATUS_POLL_ATTEMPTS" ]; then
    sleep "$STATUS_POLL_DELAY_SECONDS"
  fi
done

if [ "$deployed_sha_confirmed" != true ]; then
  echo "Timed out after $STATUS_POLL_ATTEMPTS attempts: status endpoint did not report DEPLOYED_COMMIT_SHA=$DEPLOYED_COMMIT_SHA." >&2
  exit 1
fi

echo ""
echo "========================================"
echo "  Deploy complete: $DEPLOYED_COMMIT_SHA"
echo "========================================"
