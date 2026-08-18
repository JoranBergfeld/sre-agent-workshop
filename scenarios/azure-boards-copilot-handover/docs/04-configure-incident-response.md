# Module 4: Configure incident response

Azure Monitor is the incident platform for this scenario. The SRE Agent polls
Azure Monitor for fired alerts; the capsule does not require an action group,
webhook, or alert processing rule.

## Connect the scenario resources

In the SRE Agent portal, complete **Full setup** for the scenario resource
group and connect **Azure Monitor** as the incident platform. Disable or delete
the default `quickstart` response plan so the same alert is not routed twice.

Confirm the agent can read the resource group, Service Bus metrics, Application
Insights, and Log Analytics. Use only the portal-managed read permissions for
investigation; do not grant Azure modification tools. The capsule exports
Service Bus `AllMetrics` to its Log Analytics workspace so the supplied KQL can
correlate queue state with Function telemetry.

## Create the investigator

Create a custom agent named `azure-boards-schema-drift-investigator`.

Use these instructions:

> Investigate the Azure Boards Copilot Handover schema-drift incident. Correlate
> Service Bus active and dead-letter metrics, UnsupportedReceiptSchemaError
> exceptions, successful normalized-receipt telemetry, and missing v2 receipts.
> Valid v2 events are unsupported, not invalid. Never edit code, deploy, or
> change Azure resources. Follow the indexed operational guidelines and require
> explicit learner approval before any handoff artifact is created.

Index
`scenarios/azure-boards-copilot-handover/knowledge/operational-guidelines.md`
as knowledge. Enable only read and investigation tools at this stage.

## Create the automatic response plan

Create one incident response plan:

1. Name: `azure-boards-copilot-handover-review`.
2. Custom agent: `azure-boards-schema-drift-investigator`.
3. Severity: **Sev2**.
4. **Title contains:** `active-message-backlog`.
5. Autonomy: **Review**.
6. Keep the default three-hour reinvestigation cooldown enabled.
7. Confirm the saved plan is **On**.

The deployed alert resource is named
`<workload>-active-message-backlog`. It monitors the queue's
`ActiveMessages` metric and is the only automatic trigger for the intended
exercise.

The separate `<workload>-dead-letter-safety` alert monitors
`DeadletteredMessages`. Retain it as a safety signal, but do not route it as the
normal schema-drift trigger. If it fires, stop the expected-path walkthrough
and investigate why messages exhausted delivery attempts.

## Verify the investigation contract

After injecting the incident, the investigation should show:

- a sustained active backlog;
- zero dead-lettered messages;
- `UnsupportedReceiptSchemaError` exceptions;
- continued `Normalized receipt persisted` traces for v1 controls; and
- missing v2 rows from `NormalizedReceipts`.

Use [`investigation/query.kql`](../investigation/query.kql) for the Azure
Monitor evidence. The agent may diagnose and propose the governed handoff, but
it must not authorize or perform direct remediation.

## Read-only recovery confirmation

After a human reviews, merges, and deploys the Copilot repair, run the capsule
validator first. Then ask the SRE Agent:

```text
Perform a read-only recovery confirmation for the Azure Boards Copilot
Handover incident. Do not modify Azure resources or code, deploy anything, or
create a work item. Confirm that ActiveMessages returned to zero,
DeadletteredMessages stayed at zero, UnsupportedReceiptSchemaError exceptions
stopped after the deployment cutover, and v2 receipt telemetry is present.
```

Do not close the handoff work item or incident until the deterministic
validator and this read-only confirmation both succeed.
