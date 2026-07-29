#!/usr/bin/env bash
set -uo pipefail

LOCATION="eastus2"
while [ $# -gt 0 ]; do
  case "$1" in
    -l|--location)
      LOCATION="$2"
      shift 2
      ;;
    --location=*)
      LOCATION="${1#*=}"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [-l|--location <azure-region>]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

errors=0
write_ok()   { echo "  ✅ $1"; }
write_fail() { errors=$((errors + 1)); echo "  ❌ $1"; }

echo "========================================"
echo "  IIS App Pool Failure — Setup Check"
echo "========================================"

if command -v az >/dev/null 2>&1; then
  write_ok "Azure CLI installed"
else
  write_fail "Azure CLI not found"
fi

if command -v gh >/dev/null 2>&1; then
  write_ok "GitHub CLI installed"
else
  write_ok "GitHub CLI optional and not installed"
fi

if az account show >/dev/null 2>&1; then
  write_ok "Azure login detected"
else
  write_fail "Not logged in to Azure"
fi

SIZE=$(az vm list-sizes --location "$LOCATION" --query "[?name=='Standard_B2s'].name" -o tsv 2>/dev/null || true)
if [ -n "$SIZE" ]; then
  write_ok "Standard_B2s available in $LOCATION"
else
  write_fail "Standard_B2s unavailable in $LOCATION; update vmSize in scenarios/iis-app-pool/infra/bicep/modules/vm.bicep"
fi

echo "========================================"
if [ "$errors" -eq 0 ]; then
  echo "  All checks passed."
else
  echo "  $errors issue(s) detected."
fi
echo "========================================"
exit "$errors"
