#!/usr/bin/env bash
# Proves the Azure Boards Copilot Handover incident has been fully recovered:
# the deployed commit matches local HEAD, the incident batch is completed,
# receipts split exactly 3 v1 / 20 v2 (23 total), the Service Bus queue has
# zero active and zero dead-lettered messages, and no
# UnsupportedReceiptSchemaError exceptions occurred after the deployment
# timestamp. Query failures fail validation; nothing here repairs the app.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

WORKLOAD="srelabboardshandover"
RESOURCE_GROUP=""
RESOURCE_GROUP_SET=false
FUNCTION_APP=""

usage() {
  cat <<'EOF'
Usage: validate.sh [-w|--workload <name>] [-g|--resource-group <name>] [-a|--app-name <name>] [-s|--subscription-id <id>] [-h|--help]

Proves the incident is fully recovered: deployed SHA matches local HEAD, the
incident is completed, receipts split exactly 3 v1 / 20 v2, the Service Bus
queue is empty (zero active, zero dead-lettered), and no
UnsupportedReceiptSchemaError exceptions occurred after deployment.

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
echo "  Azure Boards Copilot Handover — Validate"
echo "========================================"
echo "Resource group: $RESOURCE_GROUP"

for required_command in az curl jq git; do
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

LOCAL_HEAD_SHA="$(cd "$REPO_ROOT" && git rev-parse HEAD)"

FUNCTION_HOSTNAME=$(az functionapp show --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query defaultHostName --output tsv)
FUNCTION_KEY=$(az functionapp keys list --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query "functionKeys.default" --output tsv)

STATUS_FILE="$(mktemp)"
trap 'rm -f "$STATUS_FILE"' EXIT
curl -sS -o "$STATUS_FILE" -w '%{http_code}' "https://$FUNCTION_HOSTNAME/api/status?code=$FUNCTION_KEY" >/dev/null

DEPLOYED_COMMIT_SHA=$(jq -er '.deployedCommitSha // empty' "$STATUS_FILE")
DEPLOYED_AT_UTC=$(jq -er '.deployedAtUtc // empty' "$STATUS_FILE")
INCIDENT_BATCH_INJECTED=$(jq -er '.incidentBatchInjected' "$STATUS_FILE")
NORMALIZED_RECEIPT_COUNT=$(jq -er '.normalizedReceiptCount' "$STATUS_FILE")
V1_RECEIPT_COUNT=$(jq -er '.v1ReceiptCount' "$STATUS_FILE")
V2_RECEIPT_COUNT=$(jq -er '.v2ReceiptCount' "$STATUS_FILE")

echo ""
echo "Deployed commit SHA: $DEPLOYED_COMMIT_SHA"
echo "Local HEAD SHA:      $LOCAL_HEAD_SHA"

failures=0

if [ "$DEPLOYED_COMMIT_SHA" != "$LOCAL_HEAD_SHA" ]; then
  echo "FAIL: deployed sha '$DEPLOYED_COMMIT_SHA' does not match local HEAD sha '$LOCAL_HEAD_SHA'." >&2
  failures=$((failures + 1))
fi

if [ "$INCIDENT_BATCH_INJECTED" != "true" ]; then
  echo "FAIL: the incident batch has not completed (incidentBatchInjected=$INCIDENT_BATCH_INJECTED)." >&2
  failures=$((failures + 1))
fi

if [ "$NORMALIZED_RECEIPT_COUNT" != "23" ] || [ "$V1_RECEIPT_COUNT" != "3" ] || [ "$V2_RECEIPT_COUNT" != "20" ]; then
  echo "FAIL: receipt split is not exactly 3 v1 / 20 v2 (23 total); got v1=$V1_RECEIPT_COUNT v2=$V2_RECEIPT_COUNT total=$NORMALIZED_RECEIPT_COUNT." >&2
  failures=$((failures + 1))
fi

if [ "$failures" -ne 0 ]; then
  echo "" >&2
  echo "Validation failed ($failures issue(s)) before querying Azure telemetry." >&2
  exit 1
fi

echo "Receipts: $NORMALIZED_RECEIPT_COUNT total ($V1_RECEIPT_COUNT v1 / $V2_RECEIPT_COUNT v2)"

echo "Querying the Service Bus queue for backlog and dead-letter counts..."
SERVICE_BUS_NAMESPACE=$(az servicebus namespace list --resource-group "$RESOURCE_GROUP" --query "[0].name" --output tsv)
QUEUE_JSON=$(az servicebus queue show \
  --resource-group "$RESOURCE_GROUP" \
  --namespace-name "$SERVICE_BUS_NAMESPACE" \
  --name order-events \
  --query "{active:countDetails.activeMessageCount, dlq:countDetails.deadLetterMessageCount}" \
  --output json)
QUEUE_ACTIVE=$(jq -er '.active' <<<"$QUEUE_JSON")
QUEUE_DLQ=$(jq -er '.dlq' <<<"$QUEUE_JSON")
echo "Service Bus queue: active=$QUEUE_ACTIVE dlq=$QUEUE_DLQ"

if [ "$QUEUE_ACTIVE" != "0" ]; then
  echo "FAIL: Service Bus queue has $QUEUE_ACTIVE active message(s); expected zero." >&2
  failures=$((failures + 1))
fi

if [ "$QUEUE_DLQ" != "0" ]; then
  echo "FAIL: Service Bus queue has $QUEUE_DLQ dead-letter (DLQ) message(s); expected zero." >&2
  failures=$((failures + 1))
fi

echo "Querying Application Insights for UnsupportedReceiptSchemaError exceptions since deployment..."
APP_INSIGHTS_NAME=$(az resource list --resource-group "$RESOURCE_GROUP" --resource-type "Microsoft.Insights/components" --query "[0].name" --output tsv)
EXCEPTION_QUERY="exceptions | where type == 'UnsupportedReceiptSchemaError' | where timestamp > datetime($DEPLOYED_AT_UTC) | summarize count()"
EXCEPTIONS_JSON=$(az monitor app-insights query \
  --app "$APP_INSIGHTS_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --analytics-query "$EXCEPTION_QUERY" \
  --output json)
EXCEPTION_COUNT=$(jq -er '.tables[0].rows[0][0]' <<<"$EXCEPTIONS_JSON")
echo "UnsupportedReceiptSchemaError exceptions since deployment: $EXCEPTION_COUNT"

if [ "$EXCEPTION_COUNT" != "0" ]; then
  echo "FAIL: $EXCEPTION_COUNT UnsupportedReceiptSchemaError exception(s) occurred after DEPLOYED_AT_UTC ($DEPLOYED_AT_UTC)." >&2
  failures=$((failures + 1))
fi

if [ "$failures" -ne 0 ]; then
  echo "" >&2
  echo "Validation failed ($failures issue(s))." >&2
  exit 1
fi

echo ""
echo "========================================"
echo "  Validation passed: incident fully recovered"
echo "========================================"
