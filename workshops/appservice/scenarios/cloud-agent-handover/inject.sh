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
