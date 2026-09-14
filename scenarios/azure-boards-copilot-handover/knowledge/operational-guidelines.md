# Azure Boards Copilot Handover Operational Guidelines

## Purpose

Investigate Service Bus schema drift and preserve the governed handoff. The
Azure SRE Agent gathers evidence and proposes the next step. It must not edit
code, create a branch or pull request, deploy an application, or change Azure
resources during diagnosis or recovery confirmation.

## Incident diagnosis

Treat an order event as **unsupported** when it is valid v2 data that the
deployed normalizer does not yet understand. Do not describe it as invalid or
malformed.

Correlate these signals before concluding schema drift:

1. The queue's `ActiveMessages` metric remains above the alert threshold after
   the 20-event v2 incident batch is submitted.
2. `DeadletteredMessages` remains zero. The dead-letter alert is a safety
   signal, not the intended incident trigger.
3. Application Insights records `UnsupportedReceiptSchemaError` for v2
   messages.
4. `AppTraces` contains `Normalized receipt persisted` telemetry for supported
   v1 controls, including `order_id` and `source_schema_version`.
5. The `NormalizedReceipts` table has the three v1 control rows but is missing
   v2 rows.

The combination shows that the Function, queue, and receipt path are operating
for the supported contract while valid v2 messages remain recoverable in the
active backlog.

## Safety and handoff boundary

- The active-message backlog alert is the primary automatic SRE Agent trigger.
- The dead-letter alert requires investigation because the intended path keeps
  unsupported events active.
- The SRE Agent must not modify Azure resources or application code.
- The SRE Agent must ask for explicit learner approval before creating one
  unassigned Azure Boards Bug. Creating or invoking the Copilot repair is not
  part of diagnosis.
- A human invokes Copilot, reviews and merges its pull request, and explicitly
  deploys the reviewed revision.

## Recovery evidence

The operator-run validator is authoritative for deployment provenance and data
recovery. It must show the deployed commit matches local `HEAD`, all 23
receipts exist (3 v1 and 20 v2), and the queue has zero active messages and
zero dead-letter messages.

After that validator succeeds, perform a separate **read-only recovery
confirmation** with the SRE Agent. Instruct it not to change Azure resources,
edit code, deploy, or create another work item. It should confirm:

1. `ActiveMessages` returned to zero after the reviewed deployment.
2. `DeadletteredMessages` stayed at zero.
3. New `UnsupportedReceiptSchemaError` exceptions stopped after the deployment
   cutover.
4. Receipt telemetry now includes v2 events.

Close the Azure Boards Bug and incident only after both the deterministic
validator and this read-only confirmation succeed.
