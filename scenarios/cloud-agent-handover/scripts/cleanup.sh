#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: cleanup.sh [resource-group]"
}

if [ "$#" -gt 1 ]; then
  echo "Unknown argument: $2" >&2
  usage >&2
  exit 2
fi

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [ -n "$requested_subscription_id" ] && ! az account set --subscription "$requested_subscription_id"; then echo "Unable to select Azure subscription '$requested_subscription_id'. Run 'az login', then run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
active_subscription_id=$(az account show --query id --output tsv) || { echo "Azure CLI is not authenticated. Run 'az login' and try again." >&2; exit 1; }
active_subscription_name=$(az account show --query name --output tsv) || { echo "Unable to read the active Azure subscription name." >&2; exit 1; }
if [ -z "$active_subscription_id" ] || [ -z "$active_subscription_name" ]; then echo "Unable to read the active Azure subscription. Run 'az login' and try again." >&2; exit 1; fi
if [ -n "$requested_subscription_id" ] && [ "$active_subscription_id" != "$requested_subscription_id" ]; then echo "Azure subscription mismatch: requested '$requested_subscription_id', but active subscription is '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

RESOURCE_GROUP="${1:-${AZURE_RESOURCE_GROUP:-rg-srelabapp}}"
az group delete --name "$RESOURCE_GROUP" --yes --no-wait
echo "Deletion started for $RESOURCE_GROUP."
