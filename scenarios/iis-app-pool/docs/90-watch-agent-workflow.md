# Module 90: Watch the SRE Agent

After injection, Azure Monitor observes the IIS/System event and fires **IIS
App Pool Failure**. The SRE Agent should:

1. receive and investigate the scheduled-query alert;
2. correlate the event with `DefaultAppPool` on the affected VM;
3. query this capsule's `investigation/query.kql`;
4. identify the stopped app pool as the cause of HTTP 503 responses; and
5. propose recovery with evidence.

The required remediation flow is:

1. An authorized operator records a `CHG-<number>` or `INC-<number>` ticket.
2. The operator runs the capsule-local approval gate with
   `start-iis-app-pool`.
3. At the prompt, the operator types `APPROVE` exactly.
4. The gate executes the constrained action and appends an audit entry to
   `output/actions-audit.log`.

The approval gate is the remediation control; repository context or an
external workflow must not replace its ticket, exact confirmation, and audit
record.

Validate recovery, then continue to [99 Cleanup](./99-cleanup.md).
