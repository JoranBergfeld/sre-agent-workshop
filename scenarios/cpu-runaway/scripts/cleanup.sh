#!/usr/bin/env bash
set -uo pipefail

RESOURCE_GROUP="rg-srelabcpurunaway"
YES=false
DRY_RUN=false

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group)
      if [ "$#" -lt 2 ] || [[ "$2" == -* ]]; then
        echo "Missing value for $1." >&2
        exit 2
      fi
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    -y|--yes) YES=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) echo "Usage: $0 [--resource-group <rg>] [--yes] [--dry-run]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

echo "========================================"
echo "  CPU Runaway Scenario — Cleanup"
echo "========================================"
echo "Resource group: $RESOURCE_GROUP"

if [ "$DRY_RUN" = true ]; then
  echo "Dry run: would delete resource group '$RESOURCE_GROUP'."
  exit 0
fi

if GROUP_SHOW_OUTPUT=$(az group show --name "$RESOURCE_GROUP" 2>&1); then
  :
else
  status=$?
  if printf '%s' "$GROUP_SHOW_OUTPUT" | grep -qiE 'ResourceGroupNotFound|could not be found'; then
    echo "Resource group not found. Nothing to delete."
    exit 0
  fi
  printf '%s\n' "$GROUP_SHOW_OUTPUT" >&2
  exit "$status"
fi

if [ "$YES" = false ]; then
  read -r -p "Delete resource group '$RESOURCE_GROUP'? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

if DELETE_OUTPUT=$(az group delete --name "$RESOURCE_GROUP" --yes --no-wait 2>&1); then
  echo "Deletion started."
else
  status=$?
  printf '%s\n' "$DELETE_OUTPUT" >&2
  exit "$status"
fi
