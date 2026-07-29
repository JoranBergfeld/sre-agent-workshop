#!/usr/bin/env bash
set -uo pipefail

RESOURCE_GROUP="rg-srelabcpurunaway"
YES=false

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
    -h|--help) echo "Usage: $0 [--resource-group <rg>] [--yes]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

echo "========================================"
echo "  CPU Runaway Scenario — Cleanup"
echo "========================================"
echo "Resource group: $RESOURCE_GROUP"

if ! az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "Resource group not found. Nothing to delete."
  exit 0
fi

if [ "$YES" = false ]; then
  read -r -p "Delete resource group '$RESOURCE_GROUP'? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

az group delete --name "$RESOURCE_GROUP" --yes --no-wait
echo "Deletion started."
