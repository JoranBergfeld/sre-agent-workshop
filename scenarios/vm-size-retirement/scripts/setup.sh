#!/usr/bin/env bash
set -uo pipefail

LOCATION="eastus2"
SRE_AGENT_PRINCIPAL_ID="${SRE_AGENT_PRINCIPAL_ID:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -l|--location)
      LOCATION="$2"
      shift 2
      ;;
    -p|--sre-agent-principal-id)
      SRE_AGENT_PRINCIPAL_ID="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--location <azure-region>] [--sre-agent-principal-id <object-id>]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

errors=0
ok() { echo "  PASS: $1"; }
fail() { errors=$((errors + 1)); echo "  FAIL: $1"; }

echo "VM Size Retirement — Setup Check"

if command -v az >/dev/null 2>&1; then
  ok "Azure CLI installed"
else
  fail "Azure CLI not found"
fi

if az account show >/dev/null 2>&1; then
  ok "Azure login detected"
else
  fail "Not logged in to Azure"
fi

if az vm list-sizes --location "$LOCATION" --query "[?name=='Standard_B2s'].name" -o tsv 2>/dev/null | grep -qx 'Standard_B2s'; then
  ok "Standard_B2s available in $LOCATION"
else
  fail "Standard_B2s unavailable in $LOCATION"
fi

if [ -z "$SRE_AGENT_PRINCIPAL_ID" ]; then
  echo "  INFO: no SRE Agent principal ID supplied; deployment will not assign SRE Agent roles."
elif [[ "$SRE_AGENT_PRINCIPAL_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  ok "SRE Agent principal ID format is valid"
else
  fail "SRE Agent principal ID must be an object ID GUID"
fi

exit "$errors"
