#!/usr/bin/env bash
set -euo pipefail
RESOURCE_GROUP="rg-srelab"
WORKLOAD="srelab"
NAMESPACE="workshop"
DEPLOYMENT="web-app"
ROLE_DEF_ID="00000000-0000-0000-0000-000000000002"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -w|--workload) WORKLOAD="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--resource-group <rg>] [--workload <name>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

COSMOS_ACCOUNT=$(az cosmosdb list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv)
PRINCIPAL_ID=$(az identity show --name "${WORKLOAD}-id" --resource-group "$RESOURCE_GROUP" --query principalId -o tsv)

az cosmosdb sql role assignment create \
  --account-name "$COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" \
  --role-definition-id "$ROLE_DEF_ID" \
  --principal-id "$PRINCIPAL_ID" \
  --scope "/"
echo "Recreated CosmosDB role assignment for ${WORKLOAD}-id on $COSMOS_ACCOUNT"

kubectl rollout restart "deployment/$DEPLOYMENT" -n "$NAMESPACE"
kubectl rollout status "deployment/$DEPLOYMENT" -n "$NAMESPACE" --timeout=90s
echo "Remediation complete: RBAC restored and pods restarted."
