#!/usr/bin/env bash
# Tears down all Azure resources created by the workshop.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RG_NAME="rg-srelabidentity"
WORKLOAD="srelabidentity"
AUTO_YES=false
DRY_RUN=false
RESOURCE_GROUP_SET=false

usage() {
  cat <<EOF
Usage: $0 [--resource-group <name>] [--workload <name>] [--yes] [--dry-run]

Options:
  -g, --resource-group <name>  Resource group to delete (default: rg-srelabidentity)
  -w, --workload <name>        Workload used to derive rg-<workload>
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
      RG_NAME="$2"
      RESOURCE_GROUP_SET=true
      shift 2
      ;;
    -w|--workload) WORKLOAD="$2"; shift 2 ;;
    --yes|-y) AUTO_YES=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [ "$RESOURCE_GROUP_SET" = true ]; then
        echo "Resource group was already specified: $1" >&2
        exit 2
      fi
      RG_NAME="$1"
      RESOURCE_GROUP_SET=true
      shift
      ;;
  esac
done

if [ "$RESOURCE_GROUP_SET" = false ]; then RG_NAME="rg-${WORKLOAD}"; fi

echo "========================================"
echo "  SRE Agent Workshop — Cleanup"
echo "========================================"
echo "Resource group: ${RG_NAME}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "Dry run: would delete resource group '${RG_NAME}'."
  exit 0
fi

requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [ -n "$requested_subscription_id" ] && ! az account set --subscription "$requested_subscription_id"; then echo "Unable to select Azure subscription '$requested_subscription_id'. Run 'az login', then run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
active_subscription_id=$(az account show --query id --output tsv) || { echo "Azure CLI is not authenticated. Run 'az login' and try again." >&2; exit 1; }
active_subscription_name=$(az account show --query name --output tsv) || { echo "Unable to read the active Azure subscription name." >&2; exit 1; }
if [ -z "$active_subscription_id" ] || [ -z "$active_subscription_name" ]; then echo "Unable to read the active Azure subscription. Run 'az login' and try again." >&2; exit 1; fi
if [ -n "$requested_subscription_id" ] && [ "$active_subscription_id" != "$requested_subscription_id" ]; then echo "Azure subscription mismatch: requested '$requested_subscription_id', but active subscription is '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

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
