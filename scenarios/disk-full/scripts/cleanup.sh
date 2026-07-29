#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="rg-srelabdiskfull"
AUTO_YES=false
DRY_RUN=false

usage() {
  cat <<EOF
Usage: $0 [--resource-group <name>] [--yes] [--dry-run]

Options:
  -g, --resource-group <name>  Resource group to delete (default: rg-srelabdiskfull)
  -y, --yes                    Skip the confirmation prompt
      --dry-run                Show the selected resource group without deleting it
  -h, --help                   Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -g|--resource-group)
      if [ "$#" -lt 2 ] || [[ "$2" == -* ]]; then
        echo "Missing value for $1." >&2
        exit 2
      fi
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    -y|--yes)
      AUTO_YES=true
      shift
      ;;
    --yes=*)
      echo "--yes is a boolean flag and does not accept a value." >&2
      exit 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

echo "========================================"
echo "  Disk Full Scenario — Cleanup"
echo "========================================"
echo "Resource group: $RESOURCE_GROUP"

if [ "$DRY_RUN" = true ]; then
  echo "Dry run: would delete resource group '$RESOURCE_GROUP'."
  exit 0
fi

if ! az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "Resource group not found. Nothing to delete."
  exit 0
fi

if [ "$AUTO_YES" = false ]; then
  read -r -p "Delete resource group '$RESOURCE_GROUP'? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

az group delete --name "$RESOURCE_GROUP" --yes --no-wait
echo "Deletion started."
