#!/usr/bin/env bash
# Provisions the Azure Boards Copilot Handover scenario end-to-end: creates the
# subscription-scope infrastructure, deploys the current (intentionally
# flawed, v1-only) checkout, seeds the deterministic v1 control events, and
# prints the keyed workshop URLs a learner needs next.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SCENARIO_RELATIVE="scenarios/azure-boards-copilot-handover"
SCENARIO_DIR="$REPO_ROOT/$SCENARIO_RELATIVE"

WORKLOAD="srelabboardshandover"
RESOURCE_GROUP=""
RESOURCE_GROUP_SET=false
LOCATION="eastus2"

RETRY_ATTEMPTS="${RETRY_ATTEMPTS:-10}"
RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-15}"

usage() {
  cat <<'EOF'
Usage: setup.sh [-w|--workload <name>] [-g|--resource-group <name>] [-l|--location <region>] [-s|--subscription-id <id>] [-h|--help]

Provisions the Azure Boards Copilot Handover scenario: infrastructure,
starting application, and the deterministic v1 control-event seed.

Options:
  -w, --workload         Workload name: 6-24 lowercase letters/numbers/hyphens (default: srelabboardshandover)
  -g, --resource-group   Resource group name (default: <workload>-rg)
  -l, --location         Azure region (default: eastus2)
  -s, --subscription-id  Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
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
    -l|--location)
      require_option_value "$1" "${2:-}"
      LOCATION="$2"
      shift 2
      ;;
    -s|--subscription-id)
      require_option_value "$1" "${2:-}"
      export AZURE_SUBSCRIPTION_ID="$2"
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

echo "========================================"
echo "  Azure Boards Copilot Handover — Setup"
echo "========================================"
echo "Workload: $WORKLOAD"
echo "Location: $LOCATION"

for required_command in az curl jq; do
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

echo "Provisioning subscription-scope infrastructure (infra/bicep/main.bicep)..."
DEPLOYMENT_OUTPUTS=$(az deployment sub create \
  --location "$LOCATION" \
  --template-file "$SCENARIO_DIR/infra/bicep/main.bicep" \
  --parameters location="$LOCATION" workloadName="$WORKLOAD" \
  --query properties.outputs \
  --output json)

DISCOVERED_RESOURCE_GROUP=$(jq -er '.resourceGroupName.value' <<<"$DEPLOYMENT_OUTPUTS")
FUNCTION_APP=$(jq -er '.functionAppName.value' <<<"$DEPLOYMENT_OUTPUTS")
FUNCTION_HOSTNAME=$(jq -er '.functionAppHostName.value' <<<"$DEPLOYMENT_OUTPUTS")

if [ "$RESOURCE_GROUP_SET" = true ] && [ "$RESOURCE_GROUP" != "$DISCOVERED_RESOURCE_GROUP" ]; then
  echo "Warning: requested resource group '$RESOURCE_GROUP' differs from the provisioned resource group '$DISCOVERED_RESOURCE_GROUP'; using the provisioned one." >&2
fi
RESOURCE_GROUP="$DISCOVERED_RESOURCE_GROUP"

echo "Resource group: $RESOURCE_GROUP"
echo "Function app:   $FUNCTION_APP"

echo "Deploying the current (starting) checkout (bounded retry for Function startup/RBAC propagation)..."
attempt=0
deploy_succeeded=false
while [ "$attempt" -lt "$RETRY_ATTEMPTS" ]; do
  attempt=$((attempt + 1))
  if "$SCRIPT_DIR/deploy.sh" --resource-group "$RESOURCE_GROUP" --app-name "$FUNCTION_APP"; then
    deploy_succeeded=true
    break
  fi
  if [ "$attempt" -lt "$RETRY_ATTEMPTS" ]; then
    echo "Deploy attempt $attempt failed; retrying in ${RETRY_DELAY_SECONDS}s..." >&2
    sleep "$RETRY_DELAY_SECONDS"
  fi
done

if [ "$deploy_succeeded" != true ]; then
  echo "Failed after $RETRY_ATTEMPTS attempts: deploying the starting application (startup/RBAC propagation may still be in progress)." >&2
  exit 1
fi

echo "Retrieving the Function host key (bounded retry for startup/RBAC propagation)..."
attempt=0
FUNCTION_KEY=""
while [ "$attempt" -lt "$RETRY_ATTEMPTS" ]; do
  attempt=$((attempt + 1))
  if candidate_key=$(az functionapp keys list --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query "functionKeys.default" --output tsv 2>/dev/null) && [ -n "$candidate_key" ]; then
    FUNCTION_KEY="$candidate_key"
    break
  fi
  if [ "$attempt" -lt "$RETRY_ATTEMPTS" ]; then
    sleep "$RETRY_DELAY_SECONDS"
  fi
done

if [ -z "$FUNCTION_KEY" ]; then
  echo "Failed after $RETRY_ATTEMPTS attempts: unable to retrieve the Function host key (startup/RBAC propagation may still be in progress)." >&2
  exit 1
fi

echo "Seeding the deterministic v1 control events (idempotent)..."
SEED_RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$SEED_RESPONSE_FILE"' EXIT
seed_http_code=$(curl -sS -o "$SEED_RESPONSE_FILE" -w '%{http_code}' -X POST "https://$FUNCTION_HOSTNAME/api/seed-v1-controls?code=$FUNCTION_KEY")
if [ "$seed_http_code" != "200" ] && [ "$seed_http_code" != "202" ]; then
  echo "Seeding v1 control events failed with HTTP $seed_http_code: $(cat "$SEED_RESPONSE_FILE")" >&2
  exit 1
fi
echo "Seed response: $(cat "$SEED_RESPONSE_FILE")"

echo ""
echo "========================================"
echo "  Setup complete"
echo "========================================"
echo "Status URL:            https://$FUNCTION_HOSTNAME/api/status?code=<FUNCTION_KEY>"
echo "Submit v2 orders URL:  https://$FUNCTION_HOSTNAME/api/submit-v2-orders?code=<FUNCTION_KEY>"
echo ""
echo "Retrieve the actual key with:"
echo "  az functionapp keys list --resource-group $RESOURCE_GROUP --name $FUNCTION_APP --query functionKeys.default --output tsv"
