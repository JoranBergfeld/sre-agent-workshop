#!/usr/bin/env bash
set -euo pipefail

# Break: delete the workload's federated identity credential so pods can no
# longer exchange their ServiceAccount token for an Azure AD token.
RESOURCE_GROUP="rg-srelab"
WORKLOAD="srelab"
NAMESPACE="workshop"
DEPLOYMENT="web-app"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -w|--workload) WORKLOAD="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [-g|--resource-group <rg>] [-w|--workload <name>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

FED_CRED="${WORKLOAD}-fed-cred"
IDENTITY="${WORKLOAD}-id"

EXISTING=$(az identity federated-credential list \
  --identity-name "$IDENTITY" --resource-group "$RESOURCE_GROUP" \
  --query "[?name=='${FED_CRED}'].name" -o tsv 2>/dev/null || true)

if [ -z "$EXISTING" ]; then
  echo "No federated credential '${FED_CRED}' to delete (already broken?)"
else
  az identity federated-credential delete \
    --name "$FED_CRED" --identity-name "$IDENTITY" --resource-group "$RESOURCE_GROUP" --yes
  echo "Deleted federated credential ${FED_CRED} on ${IDENTITY}"
fi

kubectl rollout restart "deployment/$DEPLOYMENT" -n "$NAMESPACE"
kubectl rollout status "deployment/$DEPLOYMENT" -n "$NAMESPACE" --timeout=90s
echo "Fault injected: workload identity federated credential removed and pods restarted."
