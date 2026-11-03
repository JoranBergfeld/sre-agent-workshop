#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-srelabapp}"
WEB_APP="${AZURE_WEBAPP_NAME:-}"
PUBLISH_DIR=""
LOCAL_BUILD=false
REPOSITORY=""

usage() {
  cat <<'EOF'
Usage: deploy.sh [-g|--resource-group <name>] [-a|--app-name <name>] [-s|--subscription-id <id>] [--repo <owner/name>] [--local-build]

Deploys the Cloud Agent Handover application for the current commit. By
default it deploys the exact-commit build artifact from this repository's
successful 'Validate Cloud Agent Handover Application' run after verifying its
provenance and checksums; the checkout must have no uncommitted app changes.

Options:
  -g, --resource-group   Azure resource group (default: AZURE_RESOURCE_GROUP or rg-srelabapp)
  -a, --app-name        App Service name (default: AZURE_WEBAPP_NAME or the first app in the resource group)
  -s, --subscription-id Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
      --repo            GitHub repository that built the artifact (default: the checkout's repository)
      --local-build     Test and publish locally instead (needs dotnet and zip)
  -h, --help            Show this help
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

cleanup_temp() {
  if [ -n "$PUBLISH_DIR" ] && [ -d "$PUBLISH_DIR" ]; then
    rm -rf -- "$PUBLISH_DIR"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -g|--resource-group)
      require_option_value "$1" "${2:-}"
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    -a|--app-name)
      require_option_value "$1" "${2:-}"
      WEB_APP="$2"
      shift 2
      ;;
    -s|--subscription-id)
      require_option_value "$1" "${2:-}"
      export AZURE_SUBSCRIPTION_ID="$2"
      shift 2
      ;;
    --repo)
      require_option_value "$1" "${2:-}"
      REPOSITORY="$2"
      shift 2
      ;;
    --local-build)
      LOCAL_BUILD=true
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

if [ "$LOCAL_BUILD" = true ]; then REQUIRED_COMMANDS=(az dotnet zip); else REQUIRED_COMMANDS=(az gh node); fi
for required_command in "${REQUIRED_COMMANDS[@]}"; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../../.." && pwd)
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"

if [ -n "$requested_subscription_id" ] &&
  ! az account set --subscription "$requested_subscription_id"; then
  echo "Unable to select Azure subscription '$requested_subscription_id'. Run 'az login', then run: az account set --subscription \"$requested_subscription_id\"" >&2
  exit 1
fi

active_subscription_id=$(az account show --query id --output tsv) || {
  echo "Azure CLI is not authenticated. Run 'az login' and try again." >&2
  exit 1
}
active_subscription_name=$(az account show --query name --output tsv) || {
  echo "Unable to read the active Azure subscription name." >&2
  exit 1
}

if [ -z "$active_subscription_id" ] || [ -z "$active_subscription_name" ]; then
  echo "Unable to read the active Azure subscription. Run 'az login' and try again." >&2
  exit 1
fi

if [ -n "$requested_subscription_id" ] &&
  [ "$active_subscription_id" != "$requested_subscription_id" ]; then
  echo "Azure subscription mismatch: requested '$requested_subscription_id', but active subscription is '$active_subscription_id'." >&2
  exit 1
fi

echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

resource_group_exists=$(az group exists --name "$RESOURCE_GROUP" --output tsv) || {
  echo "Unable to check resource group: $RESOURCE_GROUP" >&2
  exit 1
}
if [ "$resource_group_exists" != "true" ]; then
  echo "Resource group not found: $RESOURCE_GROUP" >&2
  exit 1
fi

if [ -z "$WEB_APP" ]; then
  WEB_APP=$(az webapp list \
    --resource-group "$RESOURCE_GROUP" \
    --query '[0].name' \
    --output tsv)
fi

if [ -z "$WEB_APP" ]; then
  echo "No web app found in $RESOURCE_GROUP." >&2
  exit 1
fi

cd "$REPO_ROOT"
PUBLISH_DIR=$(mktemp -d)
trap cleanup_temp EXIT

if [ "$LOCAL_BUILD" = true ]; then
  dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
  dotnet publish scenarios/cloud-agent-handover/src/HandoverApp.csproj \
    --configuration Release \
    --output "$PUBLISH_DIR/publish"
  (cd "$PUBLISH_DIR/publish" && zip -qr "$PUBLISH_DIR/app.zip" .)
  PACKAGE="$PUBLISH_DIR/app.zip"
  PACKAGE_SOURCE="a local build of the current checkout"
else
  RESOLVE_ARGS=(--scenario cloud-agent-handover --variant application --output-dir "$PUBLISH_DIR")
  if [ -n "$REPOSITORY" ]; then RESOLVE_ARGS+=(--repo "$REPOSITORY"); fi
  if ! ARTIFACT=$(node scripts/build-artifacts/resolve.mjs "${RESOLVE_ARGS[@]}"); then
    echo "Nothing was deployed. Dispatch the build shown above and rerun, or rerun with --local-build." >&2
    exit 1
  fi
  PACKAGE=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).deploymentZip))' <<<"$ARTIFACT")
  PACKAGE_SOURCE="the verified build artifact for commit $(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).sourceSha))' <<<"$ARTIFACT")"
fi

az webapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP" \
  --src-path "$PACKAGE" \
  --type zip \
  --output none

HOST=$(az webapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP" \
  --query defaultHostName \
  --output tsv)

echo "Application deployed from $PACKAGE_SOURCE."
echo "Application: https://$HOST"
echo "Health:      https://$HOST/health"
