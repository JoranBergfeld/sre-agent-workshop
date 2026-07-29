#!/usr/bin/env bash
set -euo pipefail

WORKLOAD="srelabretirement"
RESOURCE_GROUP="rg-${WORKLOAD}"
RESOURCE_GROUP_SET=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    -w|--workload)
      WORKLOAD="$2"
      if [ "$RESOURCE_GROUP_SET" = false ]; then RESOURCE_GROUP="rg-${WORKLOAD}"; fi
      shift 2
      ;;
    -g|--resource-group) RESOURCE_GROUP="$2"; RESOURCE_GROUP_SET=true; shift 2 ;;
    -h|--help) echo "Usage: $0 [--workload <name>] [--resource-group <rg>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

FILTER="[?hardwareProfile.vmSize=='Standard_DS1_v2' || hardwareProfile.vmSize=='Standard_DS2_v2'].name"
REMAINING=$(az vm list --resource-group "$RESOURCE_GROUP" --query "$FILTER" -o tsv)

if [ -n "$(printf '%s' "$REMAINING" | tr -d '[:space:]')" ]; then
  echo "FAIL: VMs still on a retiring size:" >&2
  printf '%s\n' "$REMAINING" >&2
  exit 1
fi

echo "PASS: no VMs on a retiring size in $RESOURCE_GROUP."
