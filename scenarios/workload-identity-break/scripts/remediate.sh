#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Manual fallback fix: recreate the federated identity credential that binds the
# workload-identity-break-app ServiceAccount to the UAMI via the AKS OIDC issuer, then restart
# pods. The primary remediation in the workshop is the @copilot PR restoring the
# federatedCredential block in identity.bicep + a Deploy Workload Identity Break
# Infrastructure run.
RESOURCE_GROUP="rg-srelabidentity"
RESOURCE_GROUP_SET=false
WORKLOAD="srelabidentity"
NAMESPACE="workload-identity-break"
DEPLOYMENT="workload-identity-break-app"
SA_SUBJECT="system:serviceaccount:workload-identity-break:workload-identity-break-app"
AUDIENCE="api://AzureADTokenExchange"

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

CLUSTER=$(az aks list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv)
if [ -z "$CLUSTER" ]; then echo "No AKS cluster found in $RESOURCE_GROUP" >&2; exit 1; fi

OIDC_ISSUER=$(az aks show --resource-group "$RESOURCE_GROUP" --name "$CLUSTER" \
  --query oidcIssuerProfile.issuerUrl -o tsv)
if [ -z "$OIDC_ISSUER" ]; then echo "Could not resolve OIDC issuer for $CLUSTER" >&2; exit 1; fi

az identity federated-credential create \
  --name "$FED_CRED" --identity-name "$IDENTITY" --resource-group "$RESOURCE_GROUP" \
  --issuer "$OIDC_ISSUER" \
  --subject "$SA_SUBJECT" \
  --audiences "$AUDIENCE"
echo "Recreated federated credential ${FED_CRED} on ${IDENTITY} (issuer ${OIDC_ISSUER})"

kubectl rollout restart "deployment/$DEPLOYMENT" -n "$NAMESPACE"
kubectl rollout status "deployment/$DEPLOYMENT" -n "$NAMESPACE" --timeout=90s
echo "Remediation complete: federated credential restored and pods restarted."
