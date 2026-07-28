#!/usr/bin/env bash
set -euo pipefail

# Manual fallback fix: recreate the federated identity credential that binds the
# workshop-app ServiceAccount to the UAMI via the AKS OIDC issuer, then restart
# pods. The primary remediation in the workshop is the @copilot PR restoring the
# federatedCredential block in identity.bicep + a Deploy AKS Infrastructure run.
RESOURCE_GROUP="rg-srelab"
WORKLOAD="srelab"
NAMESPACE="workshop"
DEPLOYMENT="web-app"
SA_SUBJECT="system:serviceaccount:workshop:workshop-app"
AUDIENCE="api://AzureADTokenExchange"

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
