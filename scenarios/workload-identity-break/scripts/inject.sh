#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Break: delete the workload's federated identity credential so pods can no
# longer exchange their ServiceAccount token for an Azure AD token.
RESOURCE_GROUP="rg-srelabidentity"
RESOURCE_GROUP_SET=false
WORKLOAD="srelabidentity"
NAMESPACE="workload-identity-break"
DEPLOYMENT="workload-identity-break-app"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; RESOURCE_GROUP_SET=true; shift 2 ;;
    -w|--workload) WORKLOAD="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [-g|--resource-group <rg>] [-w|--workload <name>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$RESOURCE_GROUP_SET" = false ]; then RESOURCE_GROUP="rg-${WORKLOAD}"; fi
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [ -n "$requested_subscription_id" ] && ! az account set --subscription "$requested_subscription_id"; then echo "Unable to select Azure subscription '$requested_subscription_id'. Run 'az login', then run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
active_subscription_id=$(az account show --query id --output tsv) || { echo "Azure CLI is not authenticated. Run 'az login' and try again." >&2; exit 1; }
active_subscription_name=$(az account show --query name --output tsv) || { echo "Unable to read the active Azure subscription name." >&2; exit 1; }
if [ -z "$active_subscription_id" ] || [ -z "$active_subscription_name" ]; then echo "Unable to read the active Azure subscription. Run 'az login' and try again." >&2; exit 1; fi
if [ -n "$requested_subscription_id" ] && [ "$active_subscription_id" != "$requested_subscription_id" ]; then echo "Azure subscription mismatch: requested '$requested_subscription_id', but active subscription is '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

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
