#!/usr/bin/env bash
# Tears down the Azure Boards Copilot Handover scenario resource group. Never
# touches GitHub or Azure Boards state: the scenario's Copilot handover work
# item/issue lifecycle is entirely out of scope for this script.
set -euo pipefail

WORKLOAD="srelabboardshandover"
RESOURCE_GROUP=""
AUTO_YES=false
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: cleanup.sh [-w|--workload <name>] [-g|--resource-group <name>] [-s|--subscription-id <id>] [-y|--yes] [--dry-run]

Deletes the Azure Boards Copilot Handover scenario resource group. Does not
touch GitHub or Azure Boards.

Options:
  -w, --workload         Workload name used to derive <workload>-rg (default: srelabboardshandover)
  -g, --resource-group   Resource group to delete (default: <workload>-rg)
  -s, --subscription-id  Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
  -y, --yes              Skip the confirmation prompt
      --dry-run          Show the selected resource group without deleting it
  -h, --help             Show this help
EOF
}

require_option_value() {
  local option="$1"
  local value="${2:-}"

  if [ -z "$value" ] || [[ "$value" == -* ]]; then
    echo "Missing value for $option." >&2
    usage >&2
    exit 2
  fi
}

RESOURCE_GROUP_SET=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    -w|--workload)
      require_option_value "$1" "${2:-}"
      WORKLOAD="$2"
      shift 2
      ;;
    -g|--resource-group)
      require_option_value "$1" "${2:-}"
      RESOURCE_GROUP="$2"
      RESOURCE_GROUP_SET=true
      shift 2
      ;;
    -s|--subscription-id)
      require_option_value "$1" "${2:-}"
      export AZURE_SUBSCRIPTION_ID="$2"
      shift 2
      ;;
    -y|--yes)
      AUTO_YES=true
      shift
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

if [ "$RESOURCE_GROUP_SET" = false ]; then
  RESOURCE_GROUP="${WORKLOAD}-rg"
fi

echo "========================================"
echo "  Azure Boards Copilot Handover — Cleanup"
echo "========================================"
echo "Resource group: $RESOURCE_GROUP"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "Dry run: would delete resource group '$RESOURCE_GROUP'."
  exit 0
fi

for required_command in az; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [ -n "$requested_subscription_id" ] && ! az account set --subscription "$requested_subscription_id"; then echo "Unable to select Azure subscription '$requested_subscription_id'. Run 'az login', then run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
active_subscription_id=$(az account show --query id --output tsv) || { echo "Azure CLI is not authenticated. Run 'az login' and try again." >&2; exit 1; }
active_subscription_name=$(az account show --query name --output tsv) || { echo "Unable to read the active Azure subscription name." >&2; exit 1; }
if [ -z "$active_subscription_id" ] || [ -z "$active_subscription_name" ]; then echo "Unable to read the active Azure subscription. Run 'az login' and try again." >&2; exit 1; fi
if [ -n "$requested_subscription_id" ] && [ "$active_subscription_id" != "$requested_subscription_id" ]; then echo "Azure subscription mismatch: requested '$requested_subscription_id', but active subscription is '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

if ! az group show --name "$RESOURCE_GROUP" &>/dev/null; then
  echo "Resource group '$RESOURCE_GROUP' not found. Nothing to delete."
  exit 0
fi

if [ "$AUTO_YES" = false ]; then
  read -rp "Delete resource group '$RESOURCE_GROUP' and ALL resources inside? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

echo "Deleting resource group '$RESOURCE_GROUP' (async)..."
az group delete --name "$RESOURCE_GROUP" --yes --no-wait

echo ""
echo "========================================"
echo "  Deletion started (runs in background)."
echo "  Monitor: az group show -n $RESOURCE_GROUP"
echo "========================================"
