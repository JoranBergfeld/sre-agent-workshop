#!/usr/bin/env bash
set -euo pipefail
RESOURCE_GROUP="rg-srelabapp"
WORKLOAD="srelabapp"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -w|--workload) WORKLOAD="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--resource-group <rg>] [--workload <name>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

WEB=$(az webapp list -g "$RESOURCE_GROUP" --query "[?starts_with(name,'${WORKLOAD}-web-')].name | [0]" -o tsv)
if [ -z "$WEB" ]; then echo "No web app found in $RESOURCE_GROUP" >&2; exit 1; fi

az webapp config appsettings set -g "$RESOURCE_GROUP" --name "$WEB" --settings RED_BUTTON_MODE=ok -o none
echo "Operational mitigation applied: RED_BUTTON_MODE=ok on $WEB — /api/red now returns 200."
