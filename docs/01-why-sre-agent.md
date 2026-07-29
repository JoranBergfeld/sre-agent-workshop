# Why use the Azure SRE Agent?

> Shared concept layer. Watched by the docs-freshness workflow.

## The problem it addresses

An alert alone does not establish impact, root cause, a safe recovery, or an
audit trail. Responders can lose time finding the relevant logs, code change,
owner, and approval path while an incident is active.

## The value

- Faster signal-to-diagnosis by correlating Azure telemetry and repository
  context.
- Consistent, reviewable recovery rather than ad-hoc changes.
- Incident knowledge captured in guidance, issues, pull requests, and
  validation steps.

## When it shines (and when it does not)

It is most useful for instrumented workloads with clear ownership and an
explicit recovery path. It cannot safely replace a missing runbook, incomplete
telemetry, or the human approval required for a production change.

## How the scenarios demonstrate the value

The [scenario catalog](../README.md#choose-a-scenario) lets a learner choose a
specific incident rather than a platform hierarchy:

- [CosmosDB RBAC Removal](../scenarios/cosmos-rbac-removal/README.md) and
  [Workload Identity Break](../scenarios/workload-identity-break/README.md)
  show evidence-led GitOps recovery for AKS workloads.
- [CPU Runaway](../scenarios/cpu-runaway/README.md),
  [Disk Full](../scenarios/disk-full/README.md), and
  [IIS App Pool Failure](../scenarios/iis-app-pool/README.md), and
  [VM Size Retirement](../scenarios/vm-size-retirement/README.md) demonstrate
  approval-gated VM remediation.
- [SRE Agent to Copilot Handover](../scenarios/cloud-agent-handover/README.md)
  shows an approved issue-to-Copilot-pull-request flow with automatic
  application deployment after human merge.

Platform remains manifest metadata; every scenario is a self-contained capsule
with its own setup and cleanup.

## Upstream references

- [Azure SRE Agent overview](https://learn.microsoft.com/azure/sre-agent/overview)
