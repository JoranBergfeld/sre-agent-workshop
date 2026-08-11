#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-srelabapp}"
WEB_APP="${AZURE_WEBAPP_NAME:-}"
ATTEMPTS=6

while [ "$#" -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -a|--app-name) WEB_APP="$2"; shift 2 ;;
    -n|--attempts) ATTEMPTS="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [ -n "$requested_subscription_id" ] && ! az account set --subscription "$requested_subscription_id"; then echo "Unable to select Azure subscription '$requested_subscription_id'. Run 'az login', then run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
active_subscription_id=$(az account show --query id --output tsv) || { echo "Azure CLI is not authenticated. Run 'az login' and try again." >&2; exit 1; }
active_subscription_name=$(az account show --query name --output tsv) || { echo "Unable to read the active Azure subscription name." >&2; exit 1; }
if [ -z "$active_subscription_id" ] || [ -z "$active_subscription_name" ]; then echo "Unable to read the active Azure subscription. Run 'az login' and try again." >&2; exit 1; fi
if [ -n "$requested_subscription_id" ] && [ "$active_subscription_id" != "$requested_subscription_id" ]; then echo "Azure subscription mismatch: requested '$requested_subscription_id', but active subscription is '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

if [ -z "$WEB_APP" ]; then
  WEB_APP=$(az webapp list --resource-group "$RESOURCE_GROUP" --query '[0].name' -o tsv)
fi

if [ -z "$WEB_APP" ]; then
  echo "No web app found in $RESOURCE_GROUP" >&2
  exit 1
fi

HOST=$(az webapp show --resource-group "$RESOURCE_GROUP" --name "$WEB_APP" --query defaultHostName -o tsv)

for attempt in $(seq 1 "$ATTEMPTS"); do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "https://$HOST/api/feature" || true)
  echo "Attempt $attempt: POST https://$HOST/api/feature -> $CODE"
done

echo "Generated $ATTEMPTS unfinished-feature requests. The initial application should return HTTP 500."
