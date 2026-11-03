#!/usr/bin/env bash
# Deploys an exact-source Actions package through a private blob URL by default.
# --build-mode source retains the quality-gated Oryx source deployment alternative.
# Both routes preserve the SHA readiness and post-cutover coherence checks.
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
BUILD_MODE="artifact"
ARTIFACT_REPO=""

# Linux Consumption (Y1) remote builds (Oryx installing azure-identity,
# azure-servicebus, azure-data-tables, etc.) can take several minutes,
# especially on a cold plan right after provisioning; 90 attempts * 10s
# gives a 15-minute bound instead of cutting off a build still in progress.
STATUS_POLL_ATTEMPTS="${STATUS_POLL_ATTEMPTS:-90}"
STATUS_POLL_DELAY_SECONDS="${STATUS_POLL_DELAY_SECONDS:-10}"

usage() {
  cat <<'EOF'
Usage: deploy.sh [-w|--workload <name>] [-g|--resource-group <name>] [-a|--app-name <name>] [-s|--subscription-id <id>] [--build-mode artifact|source] [--repo owner/name] [--keep-temp] [-h|--help]

Deploys the current checkout to an already-provisioned Function app.

Options:
  -w, --workload         Workload name used to derive <workload>-rg (default: srelabboardshandover)
  -g, --resource-group   Resource group containing the Function app (default: <workload>-rg)
  -a, --app-name         Function app name (default: discovered via az functionapp list)
  -s, --subscription-id  Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
      --build-mode       artifact (default): trusted exact-HEAD Actions package; source: local gates + remote Oryx build
      --repo             Explicit artifact repository owner/name (default: Git origin)
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
    --build-mode)
      require_option_value "$1" "${2:-}"
      BUILD_MODE="$2"
      shift 2
      ;;
    --repo)
      require_option_value "$1" "${2:-}"
      ARTIFACT_REPO="$2"
      shift 2
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

if [[ "$BUILD_MODE" != "artifact" && "$BUILD_MODE" != "source" ]]; then
  echo "--build-mode must be artifact or source." >&2
  exit 2
fi
if [[ "$BUILD_MODE" == "source" && -n "$ARTIFACT_REPO" ]]; then
  echo "--repo applies only to artifact mode." >&2
  exit 2
fi

if [ "$RESOURCE_GROUP_SET" = false ]; then
  RESOURCE_GROUP="${WORKLOAD}-rg"
fi

echo "========================================"
echo "  Azure Boards Copilot Handover — Deploy"
echo "========================================"
echo "Resource group: $RESOURCE_GROUP"

for required_command in az git curl jq cmp; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

WORK_DIR="$(mktemp -d)"
cleanup_temp() {
  if [ "$KEEP_TEMP" = false ]; then
    rm -rf -- "$WORK_DIR"
  fi
}
trap cleanup_temp EXIT
if [ "$KEEP_TEMP" = true ] && [ -n "${DEPLOY_KEEP_TEMP_DIR_LOG:-}" ]; then
  printf '%s\n' "$WORK_DIR" > "$DEPLOY_KEEP_TEMP_DIR_LOG"
fi

if [ "$BUILD_MODE" = "artifact" ]; then
  command -v node >/dev/null 2>&1 || { echo "Node.js 20+ is required for artifact deployment." >&2; exit 1; }
  command -v gh >/dev/null 2>&1 || { echo "Authenticated GitHub CLI (gh) is required for artifact deployment." >&2; exit 1; }
  resolver_args=(--scenario azure-boards-copilot-handover --variant application --output-dir "$WORK_DIR/artifacts")
  if [ -n "$ARTIFACT_REPO" ]; then resolver_args+=(--repo "$ARTIFACT_REPO"); fi
  node "$REPO_ROOT/scripts/build-artifacts/resolve.mjs" "${resolver_args[@]}" > "$WORK_DIR/resolved.json"
  ZIP_PATH=$(jq -er '.deploymentZip' "$WORK_DIR/resolved.json")
  DEPLOYED_COMMIT_SHA=$(jq -er '.sourceSha' "$WORK_DIR/resolved.json")
  [[ -f "$ZIP_PATH" && "$DEPLOYED_COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid artifact resolver output." >&2; exit 1; }
fi

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
if [ "$BUILD_MODE" = "source" ]; then
  command -v zip >/dev/null 2>&1 || { echo "Required command not found: zip" >&2; exit 1; }
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

  if [ -n "$(cd "$REPO_ROOT" && git status --porcelain --untracked-files=all -- "$SCENARIO_RELATIVE/app")" ]; then
    echo "Refusing to deploy from a checkout with tracked or untracked application changes. Commit or discard the changes and try again." >&2
    exit 1
  fi

  # --- Stage a clean runtime-only zip (no venv, no tests, no caches) ---------
  STAGE_DIR="$WORK_DIR/stage"
  DEPLOYED_COMMIT_SHA="$(cd "$REPO_ROOT" && git rev-parse HEAD)"
  [[ "$DEPLOYED_COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Unable to read current Git commit." >&2; exit 1; }
  mkdir -p "$STAGE_DIR"
  printf '{"sourceSha":"%s"}\n' "$DEPLOYED_COMMIT_SHA" > "$STAGE_DIR/build-revision.json"
  cp "$APP_DIR/function_app.py" "$STAGE_DIR/"
  cp "$APP_DIR/host.json" "$STAGE_DIR/"
  cp "$APP_DIR/requirements.txt" "$STAGE_DIR/"
  while IFS= read -r -d '' relative_path; do
    destination="$STAGE_DIR/$relative_path"
    mkdir -p "$(dirname "$destination")"
    cp "$APP_DIR/$relative_path" "$destination"
  done < <(cd "$APP_DIR" && git ls-files -z -- order_events)

  (cd "$STAGE_DIR" && zip -qr "$WORK_DIR/app.zip" .)
  ZIP_PATH="$WORK_DIR/app.zip"

  if [ "$KEEP_TEMP" = true ] && [ -n "${DEPLOY_KEEP_TEMP_DIR_LOG:-}" ]; then
    printf '%s\n' "$WORK_DIR" > "$DEPLOY_KEEP_TEMP_DIR_LOG"
  fi

  # A previous artifact deployment must not override this explicit source build.
  az functionapp config appsettings delete --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" \
    --setting-names WEBSITE_RUN_FROM_PACKAGE WEBSITE_RUN_FROM_PACKAGE_BLOB_MI_RESOURCE_ID --output none

  # Both settings must be reset even when SCM was already true.
    echo "Enabling remote Oryx build..."
    az functionapp config appsettings set \
      --resource-group "$RESOURCE_GROUP" \
      --name "$FUNCTION_APP" \
      --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true ENABLE_ORYX_BUILD=true \
      --output none
else
  PACKAGE_STORAGE=$(az functionapp config appsettings list --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" \
    --query "[?name=='WORKSHOP_PACKAGE_STORAGE_ACCOUNT'].value | [0]" --output tsv)
  PACKAGE_CONTAINER=$(az functionapp config appsettings list --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" \
    --query "[?name=='WORKSHOP_PACKAGE_CONTAINER'].value | [0]" --output tsv)
  [[ "$PACKAGE_STORAGE" =~ ^[a-z0-9]{3,24}$ && "$PACKAGE_CONTAINER" = "application-packages" ]] || {
    echo "Missing package storage settings. Re-provision the updated scenario infrastructure." >&2; exit 1;
  }
  BLOB_ENDPOINT=$(az storage account show --resource-group "$RESOURCE_GROUP" --name "$PACKAGE_STORAGE" \
    --query primaryEndpoints.blob --output tsv)
  [[ "$BLOB_ENDPOINT" =~ ^https://[a-z0-9.-]+/$ ]] || { echo "Invalid package blob endpoint." >&2; exit 1; }
  PACKAGE_HASH=$(jq -er '.files[0].sha256' "$(dirname "$ZIP_PATH")/metadata.json")
  [[ "$PACKAGE_HASH" =~ ^[0-9a-f]{64}$ ]] || { echo "Missing package checksum." >&2; exit 1; }
  BLOB_NAME="$DEPLOYED_COMMIT_SHA/$PACKAGE_HASH.zip"
  # Never overwrite a content-addressed package. Existing blobs must match locally verified bytes.
  BLOB_EXISTS=$(az storage blob exists --account-name "$PACKAGE_STORAGE" --container-name "$PACKAGE_CONTAINER" \
    --name "$BLOB_NAME" --auth-mode login --query exists --output tsv)
  if [ "$BLOB_EXISTS" = "true" ]; then
    az storage blob download --account-name "$PACKAGE_STORAGE" --container-name "$PACKAGE_CONTAINER" \
      --name "$BLOB_NAME" --file "$WORK_DIR/existing.zip" --auth-mode login --only-show-errors --output none
    cmp -s "$ZIP_PATH" "$WORK_DIR/existing.zip" || { echo "Existing package blob checksum conflict." >&2; exit 1; }
  elif [ "$BLOB_EXISTS" = "false" ]; then
    az storage blob upload --account-name "$PACKAGE_STORAGE" --container-name "$PACKAGE_CONTAINER" \
      --name "$BLOB_NAME" --file "$ZIP_PATH" --auth-mode login --overwrite false --only-show-errors --output none || {
        echo "Package upload failed. Verify Storage Blob Data Contributor access to the private package container." >&2; exit 1;
      }
  else
    echo "Unable to determine package blob existence." >&2; exit 1
  fi
  PACKAGE_URL="${BLOB_ENDPOINT}${PACKAGE_CONTAINER}/${BLOB_NAME}"
  az functionapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" \
    --settings "WEBSITE_RUN_FROM_PACKAGE=$PACKAGE_URL" WEBSITE_RUN_FROM_PACKAGE_BLOB_MI_RESOURCE_ID=SystemAssigned \
    SCM_DO_BUILD_DURING_DEPLOYMENT=false ENABLE_ORYX_BUILD=false --output none
fi

# --- Stamp DEPLOYED_COMMIT_SHA only; this is needed for the go-live poll ---
# below and must be available before the cutover timestamp exists.
echo "Stamping DEPLOYED_COMMIT_SHA=$DEPLOYED_COMMIT_SHA"
az functionapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP" \
  --settings "DEPLOYED_COMMIT_SHA=$DEPLOYED_COMMIT_SHA" \
  --output none

# --- Deploy the zip ---------------------------------------------------------
# Uses the long-stable `deployment source config-zip` API rather than
# `functionapp deploy --type zip`: the latter's OneDeploy API has been known
# to intermittently fail with "This API isn't available in this environment
# yet!" (see Azure/azure-cli#33014), which config-zip does not hit.
#
# --build-remote true is required, not just the SCM_DO_BUILD_DURING_DEPLOYMENT
# app setting above: on a freshly-provisioned app, that setting write and this
# deploy race — the Kudu build engine can still be starting up on the old
# (false) value when the zip lands, silently skipping the Oryx dependency
# build and shipping a package with no installed packages (import errors for
# every third-party dependency, e.g. ModuleNotFoundError: No module named
# 'azure.data'). Passing --build-remote true forces the build for this
# deploy regardless of that race.
if [ "$BUILD_MODE" = "source" ]; then
echo "Deploying source zip package to Function app '$FUNCTION_APP' ..."
az functionapp deployment source config-zip \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP" \
  --src "$ZIP_PATH" \
  --build-remote true \
  --output none
fi

# On Linux Consumption, the Python worker can keep serving the previous
# package after a config-zip deploy until the app is explicitly restarted;
# without this, the go-live poll below can time out even though the new
# package deployed successfully.
echo "Restarting Function app to ensure the new package is loaded..."
az functionapp restart --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --output none
if [ "$BUILD_MODE" = "artifact" ]; then
  FUNCTION_ID=$(az functionapp show --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query id --output tsv)
  [[ "$FUNCTION_ID" == /subscriptions/*/resourceGroups/*/providers/Microsoft.Web/sites/* ]] || { echo "Invalid Function app resource ID." >&2; exit 1; }
  SYNCED=false
  for ((attempt=1; attempt<=STATUS_POLL_ATTEMPTS; attempt++)); do
    if az rest --method post --uri "https://management.azure.com${FUNCTION_ID}/syncfunctiontriggers?api-version=2023-12-01" --output none; then
      SYNCED=true; break
    fi
    if [ "$attempt" -lt "$STATUS_POLL_ATTEMPTS" ]; then sleep "$STATUS_POLL_DELAY_SECONDS"; fi
  done
  [ "$SYNCED" = true ] || { echo "Function trigger synchronization failed; verify package MI access and retry." >&2; exit 1; }
fi

FUNCTION_HOSTNAME=$(az functionapp show --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query defaultHostName --output tsv)
FUNCTION_KEY=$(az functionapp keys list --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query "functionKeys.default" --output tsv)
[[ -n "$FUNCTION_HOSTNAME" && -n "$FUNCTION_KEY" ]] || { echo "Unable to retrieve Function status endpoint/key." >&2; exit 1; }
STATUS_URL="https://$FUNCTION_HOSTNAME/api/status"

# Polls (bounded by STATUS_POLL_ATTEMPTS/STATUS_POLL_DELAY_SECONDS) the keyed
# status endpoint until it reports DEPLOYED_COMMIT_SHA, or exits loudly on
# timeout. Reused for both the initial go-live check and the post-cutover
# coherence recheck below so neither poll is unbounded or circular.
wait_for_deployed_sha() {
  local phase_label="$1"
  local attempt=0
  local confirmed=false
  local status_body_file
  local reported_sha
  local package_sha
  local last_http_code=""
  local last_body=""

  while [ "$attempt" -lt "$STATUS_POLL_ATTEMPTS" ]; do
    attempt=$((attempt + 1))
    status_body_file="$WORK_DIR/status-$phase_label-$attempt.json"
    # Guard with `|| true`: under `set -e`, a failed command substitution
    # (e.g. a transient connection failure) would otherwise abort the whole
    # deploy immediately instead of letting the poll loop retry and report
    # diagnostics on eventual timeout.
    last_http_code=$(curl -sS --connect-timeout 10 --max-time 30 -H "x-functions-key: $FUNCTION_KEY" -o "$status_body_file" -w '%{http_code}' "$STATUS_URL" 2>&1) || true
    if [ -z "$last_http_code" ]; then
      last_http_code="(no response / request failed)"
    fi
    last_body=$(cat "$status_body_file" 2>/dev/null || true)
    reported_sha=$(jq -er '.deployedCommitSha // empty' "$status_body_file" 2>/dev/null || true)
    package_sha=$(jq -er '.packageCommitSha // empty' "$status_body_file" 2>/dev/null || true)
    if [[ "$last_http_code" = "200" && "$reported_sha" = "$DEPLOYED_COMMIT_SHA" && "$package_sha" = "$DEPLOYED_COMMIT_SHA" ]]; then
      confirmed=true
      break
    fi
    if [ "$attempt" -lt "$STATUS_POLL_ATTEMPTS" ]; then
      sleep "$STATUS_POLL_DELAY_SECONDS"
    fi
  done

  if [ "$confirmed" != true ]; then
    echo "Timed out after $STATUS_POLL_ATTEMPTS attempts: status endpoint did not report matching deployment and embedded package SHA=$DEPLOYED_COMMIT_SHA during the $phase_label check." >&2
    echo "Last observed HTTP status: $last_http_code" >&2
    echo "Last observed response body: $last_body" >&2
    exit 1
  fi
}

echo "Waiting for deployment to report DEPLOYED_COMMIT_SHA=$DEPLOYED_COMMIT_SHA ..."
wait_for_deployed_sha "go-live"

# --- Stamp DEPLOYED_AT_UTC only now that the new SHA is proven live -------
# This is the cutover timestamp: exception validation must only consider
# telemetry after this point, once the new (fixed) code is actually serving
# traffic, not from when the settings/deploy calls were merely issued.
DEPLOYED_AT_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "New commit is live. Stamping DEPLOYED_AT_UTC=$DEPLOYED_AT_UTC"
az functionapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP" \
  --settings "DEPLOYED_AT_UTC=$DEPLOYED_AT_UTC" \
  --output none

# --- Re-confirm (bounded) the app is coherent after the cutover restart ----
# Changing an app setting can restart the Function app; re-poll (bounded,
# not unbounded/circular) to make sure it comes back reporting the same SHA
# before declaring the deploy complete.
echo "Confirming the Function app is coherent after the cutover restart ..."
wait_for_deployed_sha "cutover"

echo ""
echo "========================================"
echo "  Deploy complete: $DEPLOYED_COMMIT_SHA (deployed at $DEPLOYED_AT_UTC)"
echo "========================================"
