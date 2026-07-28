#!/usr/bin/env bash
set -euo pipefail
RESOURCE_GROUP="rg-srelab"
NAMESPACE="workshop"
DEPLOYMENT="web-app"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--resource-group <rg>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

COSMOS_ACCOUNT=$(az cosmosdb list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv)
if [ -z "$COSMOS_ACCOUNT" ]; then echo "No CosmosDB account found in $RESOURCE_GROUP" >&2; exit 1; fi

ASSIGNMENT_NAME=$(az cosmosdb sql role assignment list \
  --account-name "$COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" \
  --query "[0].name" -o tsv)
if [ -z "$ASSIGNMENT_NAME" ]; then echo "No role assignment to delete (already broken?)"; else
  az cosmosdb sql role assignment delete \
    --account-name "$COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" \
    --role-assignment-id "$ASSIGNMENT_NAME" --yes
  echo "Deleted role assignment $ASSIGNMENT_NAME on $COSMOS_ACCOUNT"
fi

kubectl rollout restart "deployment/$DEPLOYMENT" -n "$NAMESPACE"
kubectl rollout status "deployment/$DEPLOYMENT" -n "$NAMESPACE" --timeout=90s
echo "Fault injected: CosmosDB RBAC removed and pods restarted."
