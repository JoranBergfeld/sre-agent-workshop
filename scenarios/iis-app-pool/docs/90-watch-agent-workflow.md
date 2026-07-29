# Module 90: Watch the SRE Agent

After injection, Azure Monitor observes the IIS/System event and fires **IIS
App Pool Failure**. The SRE Agent should:

1. receive and investigate the scheduled-query alert;
2. correlate the event with `DefaultAppPool` on the affected VM;
3. query this capsule's `investigation/query.kql`;
4. identify the stopped app pool as the cause of HTTP 503 responses; and
5. propose recovery with evidence.

The normal remediation flow is:

1. A human creates or explicitly approves exactly one GitHub issue and assigns
   it to `@copilot`.
2. Copilot authors the pull request.
3. A human reviews and merges the PR.
4. That human deploys the merged change.

When that flow is unavailable, an authorized operator may use
`./scenarios/iis-app-pool/tools/invoke-approved-remediation.sh` with the
`start-iis-app-pool` action, a valid `CHG-` or `INC-` ticket, and exact
`APPROVE`. The gate records the execution in `output/actions-audit.log`.

Validate recovery, then continue to [99 Cleanup](./99-cleanup.md).
