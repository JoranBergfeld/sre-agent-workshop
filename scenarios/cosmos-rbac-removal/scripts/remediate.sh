#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RESOURCE_GROUP="rg-srelabcosmos"
RESOURCE_GROUP_SET=false
WORKLOAD="srelabcosmos"
SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-}"
NAMESPACE="cosmos-rbac-removal"
DEPLOYMENT="cosmos-rbac-removal-app"
ROLE_DEF_ID="00000000-0000-0000-0000-000000000002"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; RESOURCE_GROUP_SET=true; shift 2 ;;
    -w|--workload) WORKLOAD="$2"; shift 2 ;;
    --subscription-id) SUBSCRIPTION_ID="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--resource-group <rg>] [--workload <name>] [--subscription-id <id>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$RESOURCE_GROUP_SET" = false ]; then RESOURCE_GROUP="rg-${WORKLOAD}"; fi
export AZURE_SUBSCRIPTION_ID="$SUBSCRIPTION_ID"
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [ -n "$requested_subscription_id" ] && ! az account set --subscription "$requested_subscription_id"; then echo "Unable to select Azure subscription '$requested_subscription_id'. Run 'az login', then run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
active_subscription_id=$(az account show --query id --output tsv) || { echo "Azure CLI is not authenticated. Run 'az login' and try again." >&2; exit 1; }
active_subscription_name=$(az account show --query name --output tsv) || { echo "Unable to read the active Azure subscription name." >&2; exit 1; }
if [ -z "$active_subscription_id" ] || [ -z "$active_subscription_name" ]; then echo "Unable to read the active Azure subscription. Run 'az login' and try again." >&2; exit 1; fi
if [ -n "$requested_subscription_id" ] && [ "$active_subscription_id" != "$requested_subscription_id" ]; then echo "Azure subscription mismatch: requested '$requested_subscription_id', but active subscription is '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

COSMOS_ACCOUNT=$(az cosmosdb list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv)
PRINCIPAL_ID=$(az identity show --name "${WORKLOAD}-id" --resource-group "$RESOURCE_GROUP" --query principalId -o tsv)

EXISTING_ASSIGNMENT=$(az cosmosdb sql role assignment list \
  --account-name "$COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" \
  --query "[?principalId=='${PRINCIPAL_ID}' && contains(roleDefinitionId, '${ROLE_DEF_ID}') && scope=='/'].name | [0]" \
  -o tsv)

if [ -n "$EXISTING_ASSIGNMENT" ]; then
  echo "CosmosDB role assignment '${EXISTING_ASSIGNMENT}' already exists for ${WORKLOAD}-id on $COSMOS_ACCOUNT. No changes made."
  exit 0
fi

az cosmosdb sql role assignment create \
  --account-name "$COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" \
  --role-definition-id "$ROLE_DEF_ID" \
  --principal-id "$PRINCIPAL_ID" \
  --scope "/"
echo "Recreated CosmosDB role assignment for ${WORKLOAD}-id on $COSMOS_ACCOUNT"

kubectl rollout restart "deployment/$DEPLOYMENT" -n "$NAMESPACE"
kubectl rollout status "deployment/$DEPLOYMENT" -n "$NAMESPACE" --timeout=90s
echo "Remediation complete: RBAC restored and pods restarted."
