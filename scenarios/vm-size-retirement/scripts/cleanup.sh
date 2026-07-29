#!/usr/bin/env bash
set -euo pipefail

WORKLOAD="srelabretirement"
RESOURCE_GROUP="rg-${WORKLOAD}"
RESOURCE_GROUP_SET=false
AUTO_YES=false
DRY_RUN=false

usage() {
  cat <<EOF
Usage: $0 [--workload <name>] [--resource-group <name>] [--yes] [--dry-run]
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -w|--workload)
      if [ "$#" -lt 2 ] || [[ "$2" == -* ]]; then
        echo "Missing value for $1." >&2
        exit 2
      fi
      WORKLOAD="$2"
      if [ "$RESOURCE_GROUP_SET" = false ]; then
        RESOURCE_GROUP="rg-${WORKLOAD}"
      fi
      shift 2
      ;;
    -g|--resource-group)
      if [ "$#" -lt 2 ] || [[ "$2" == -* ]]; then
        echo "Missing value for $1." >&2
        exit 2
      fi
      RESOURCE_GROUP="$2"
      RESOURCE_GROUP_SET=true
      shift 2
      ;;
    -y|--yes) AUTO_YES=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

echo "Resource group: ${RESOURCE_GROUP}"

if [ "$DRY_RUN" = true ]; then
  echo "Dry run: would delete resource group '${RESOURCE_GROUP}'."
  exit 0
fi

if ! az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "Resource group '${RESOURCE_GROUP}' not found. Nothing to delete."
  exit 0
fi

if [ "$AUTO_YES" = false ]; then
  read -r -p "Delete resource group '${RESOURCE_GROUP}' and ALL resources inside? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

az group delete --name "$RESOURCE_GROUP" --yes --no-wait
echo "Deletion started."
