# How the Azure SRE Agent works

> Shared concept layer. Watched by the docs-freshness workflow.

## The incident loop

1. Azure Monitor or another scenario signal identifies a potential incident.
2. The SRE Agent investigates telemetry, repository context, and the
   scenario's operational guidance.
3. It presents the diagnosis, evidence, and proposed recovery.
4. A human follows the scenario's approval and recovery route.
5. The scenario validator confirms the expected healthy state.

The agent does not apply remediation directly.

## Approval and recovery routes

The route belongs to the scenario, not to a platform directory:

- **VM scenarios:** the SRE Agent investigates and proposes the action. An
  authorized operator uses the scenario-local approval gate with a `CHG-` or
  `INC-` ticket and explicit `APPROVE`; the gate records an audit entry.
- **AKS scenarios:** recovery follows GitOps: the SRE Agent creates an issue
  assigned to `@copilot`, Copilot prepares a pull request, and a human reviews,
  merges, and manually deploys the approved change.
- **Cloud Agent Handover:** the SRE Agent first asks for approval to create one
  unassigned issue. The learner reviews it and assigns
  `copilot-swe-agent`; Copilot opens the pull request; a human reviews and
  merges it; an operator updates the local `main` checkout and deploys the
  reviewed application through the scenario helper.

## Guardrails

- Do not make silent, direct Azure changes.
- Use the capsule's Bash and PowerShell lifecycle scripts for setup, fault
  injection, validation, and cleanup.
- Read the capsule's `knowledge/operational-guidelines.md` before configuring
  incident response.
- Treat a successful validator as the recovery evidence, not merely a
  completed deployment.

## Find the scenario-specific flow

Start in the generated [scenario catalog](../README.md#choose-a-scenario), then
follow the selected `scenarios/<id>/README.md` and its linked modules. The
`platform` field in `scenario.yaml` describes the Azure service; it does not
determine a directory hierarchy.

## Upstream references

- [Azure SRE Agent overview](https://learn.microsoft.com/azure/sre-agent/overview)
