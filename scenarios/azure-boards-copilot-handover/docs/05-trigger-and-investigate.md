# Module 5: Trigger and investigate schema drift

The learner now submits one deterministic batch of 20 valid v2 order events.
The operation is idempotent: repeating it does not create another batch.

## Trigger the incident

Use one shell path.

**Bash**

```bash
./scenarios/azure-boards-copilot-handover/scripts/inject.sh
```

**PowerShell 7**

```powershell
./scenarios/azure-boards-copilot-handover/scripts/inject.ps1
```

The response reports 20 events enqueued for a fresh batch or that the batch
was already injected. The status still shows three v1 receipts and no v2
receipts while the intentionally flawed normalizer retries the unsupported
events.

## Watch the automatic investigation

Wait for Azure Monitor to evaluate the active backlog and for the
`<workload>-active-message-backlog` Sev2 incident to appear in Azure SRE Agent.
Open the review-mode investigation.

The diagnosis must correlate:

- A sustained `ActiveMessages` backlog for the 20 v2 events.
- Zero `DeadletteredMessages`.
- `UnsupportedReceiptSchemaError` exceptions.
- Successful `Normalized receipt persisted` traces for the v1 controls.
- Three v1 rows and no v2 rows in `NormalizedReceipts`.

Use [`investigation/query.kql`](../investigation/query.kql) when you need to
inspect the evidence directly.

The conclusion should identify **Service Bus schema drift**: the deployed
consumer remains healthy for supported v1 events, while valid v2 events are
recoverable but unsupported. Stop if the dead-letter alert fires; that is not
the intended scenario path.

## Require a proposed handoff before approval

Ask the SRE Agent to prepare, but not create, the handoff:

```text
Prepare the exact Azure Boards Bug proposed for this Service Bus schema-drift
incident. Show the title, diagnosis, evidence, permitted source scope, and
acceptance criteria before taking any write action. Do not create the work
item until I explicitly approve this displayed draft.
```

Compare its proposal with
[`azure-boards-bug.md`](../azure-boards-bug.md). Material differences in the
diagnosis, scope, or acceptance criteria require correction before approval.

Next: [Approve the Azure Boards handoff](./06-approve-azure-boards-handoff.md).
