#!/usr/bin/env bash
set -euo pipefail
RESOURCE_GROUP="rg-srelabapp"
WORKLOAD="srelabapp"
ATTEMPTS=20

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -w|--workload) WORKLOAD="$2"; shift 2 ;;
    -n|--attempts) ATTEMPTS="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--resource-group <rg>] [--workload <name>] [--attempts <n>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

WEB=$(az webapp list -g "$RESOURCE_GROUP" --query "[?starts_with(name,'${WORKLOAD}-web-')].name | [0]" -o tsv)
if [ -z "$WEB" ]; then echo "No web app found in $RESOURCE_GROUP" >&2; exit 1; fi

# Arm the fault. The app defaults to broken, but re-assert in case a prior run mitigated it.
az webapp config appsettings set -g "$RESOURCE_GROUP" --name "$WEB" --settings RED_BUTTON_MODE=broken -o none
echo "Armed RED_BUTTON_MODE=broken on $WEB. Waiting for the app to restart…"
sleep 15

HOST=$(az webapp show -g "$RESOURCE_GROUP" --name "$WEB" --query defaultHostName -o tsv)
for i in $(seq 1 "$ATTEMPTS"); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/api/red" || true)
  echo "GET https://$HOST/api/red -> $CODE"
done

echo "Fault injected: $ATTEMPTS red-button presses against $WEB (/api/red returns HTTP 500)."
