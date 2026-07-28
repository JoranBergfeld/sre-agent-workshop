#!/usr/bin/env bash
# Tears down all Azure resources created by the workshop.
set -euo pipefail

RG_NAME="${1:-rg-srelab}"
AUTO_YES=false

for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=true ;;
  esac
done

echo "========================================"
echo "  SRE Agent Workshop — Cleanup"
echo "========================================"
echo "Resource group: ${RG_NAME}"
echo ""

# Verify the resource group exists
if ! az group show --name "$RG_NAME" &>/dev/null; then
  echo "Resource group '${RG_NAME}' not found. Nothing to delete."
  exit 0
fi

# Confirm unless --yes
if [ "$AUTO_YES" = false ]; then
  read -rp "Delete resource group '${RG_NAME}' and ALL resources inside? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

echo "Deleting resource group '${RG_NAME}' (async)..."
az group delete --name "$RG_NAME" --yes --no-wait

echo ""
echo "========================================"
echo "  Deletion started (runs in background)."
echo "  Monitor: az group show -n ${RG_NAME}"
echo "========================================"
