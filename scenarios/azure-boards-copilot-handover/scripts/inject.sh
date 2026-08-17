#!/usr/bin/env bash
# Injects the v2 incident batch by calling the keyed submit-v2-orders
# endpoint. A fresh submission returns 202 (accepted); a repeat submission
# against an already-completed incident returns 200 (idempotent, recoverable).
# Both are success. Any other response fails loudly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

WORKLOAD="srelabboardshandover"
RESOURCE_GROUP=""
RESOURCE_GROUP_SET=false
FUNCTION_APP=""

usage() {
  cat <<'EOF'
Usage: inject.sh [-w|--workload <name>] [-g|--resource-group <name>] [-a|--app-name <name>] [-s|--subscription-id <id>] [-h|--help]

Submits the v2 incident order batch to the deployed Function app.

Options:
  -w, --workload         Workload name used to derive <workload>-rg (default: srelabboardshandover)
  -g, --resource-group   Resource group containing the Function app (default: <workload>-rg)
  -a, --app-name         Function app name (default: discovered via az functionapp list)
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
echo "  Azure Boards Copilot Handover — Inject"
echo "========================================"
echo "Resource group: $RESOURCE_GROUP"

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

if [ -z "$FUNCTION_APP" ]; then
  FUNCTION_APP=$(az functionapp list --resource-group "$RESOURCE_GROUP" --query "[0].name" --output tsv)
  if [ -z "$FUNCTION_APP" ]; then
    echo "Unable to discover a Function app in resource group '$RESOURCE_GROUP'. Pass --app-name explicitly." >&2
    exit 1
  fi
fi
echo "Function app: $FUNCTION_APP"

FUNCTION_HOSTNAME=$(az functionapp show --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query defaultHostName --output tsv)
FUNCTION_KEY=$(az functionapp keys list --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query "functionKeys.default" --output tsv)

RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

echo "Submitting the v2 incident order batch..."
submit_http_code=$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' -X POST "https://$FUNCTION_HOSTNAME/api/submit-v2-orders?code=$FUNCTION_KEY")

if [ "$submit_http_code" != "202" ] && [ "$submit_http_code" != "200" ]; then
  echo "Unexpected submit-v2-orders response: HTTP $submit_http_code: $(cat "$RESPONSE_FILE")" >&2
  exit 1
fi

echo "Submit response (HTTP $submit_http_code): $(cat "$RESPONSE_FILE")"

STATUS_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE" "$STATUS_FILE"' EXIT
curl -sS -o "$STATUS_FILE" -w '%{http_code}' "https://$FUNCTION_HOSTNAME/api/status?code=$FUNCTION_KEY" >/dev/null

echo ""
echo "========================================"
echo "  Current workshop status"
echo "========================================"
cat "$STATUS_FILE"
echo ""
