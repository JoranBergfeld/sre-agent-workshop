#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VM_MODULE="$ROOT/infra/bicep/modules/vm.bicep"
MONITORING_MODULE="$ROOT/infra/bicep/modules/monitoring.bicep"

default_workload="srelabiisapppool"
short_vm_name="${default_workload:0:10}-01"
if [[ ${#short_vm_name} -gt 15 ]]; then
  echo "default VM computer name exceeds the Windows 15-character limit" >&2
  exit 1
fi

grep -Fq "var vmNamePrefix = take(replace(workloadName, '-', ''), 10)" "$VM_MODULE"
grep -Fq "computerName: vmName" "$VM_MODULE"
grep -Fq "Microsoft.Insights/dataCollectionRules" "$MONITORING_MODULE"
grep -Fq "windowsEventLogs" "$MONITORING_MODULE"
grep -Fq "Microsoft-Event" "$MONITORING_MODULE"
grep -Fq "Microsoft.Insights/dataCollectionRuleAssociations" "$VM_MODULE"
grep -Fq "scope: vm[i]" "$VM_MODULE"

echo "infrastructure safety regression checks passed"
