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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"
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
