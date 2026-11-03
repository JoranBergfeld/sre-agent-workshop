# Preserve evidence and clean up

## Objective

Retain useful observations before removing only this run's dedicated Azure
resources. Cleanup is safe to repeat and never edits source, branches, issues,
PRs, repository settings, connectors or shared agents.

**Safety and costs:** save issues/PR links, validation results, query results,
usage/attribution and review/security evidence outside resources being deleted.
The helper's automatic export is bounded to the last day, 100 Activity Log
events and 500 request/trace rows: it is **not a complete evidence backup**.
Export older/longer evidence yourself before continuing. Telemetry ingestion
delay/caps can leave gaps; an empty export does not prove complete preservation.

<details>
<summary>Show exact steps</summary>

From the repository root, using the same state directory as setup:

```bash
scenarios/appservice-latency-context/scripts/evidence.sh
scenarios/appservice-latency-context/scripts/cleanup.sh
scenarios/appservice-latency-context/scripts/cleanup.sh
```

```powershell
./scenarios/appservice-latency-context/scripts/evidence.ps1
./scenarios/appservice-latency-context/scripts/cleanup.ps1
./scenarios/appservice-latency-context/scripts/cleanup.ps1
```

The helper verifies subscription/group scope, group ownership and **every**
resource's run/scenario tags. Any foreign resource prevents whole-group deletion.
It exports bounded connected evidence again before deleting and waits for Azure
completion; failed export/deletion returns nonzero. An absent group is a
successful no-op. Local `.azure/` state, observations, packages and exports
remain intact on repeated cleanup.

Check Azure Portal that the dedicated group is absent. Separately stop/delete
your own unshared SRE Agent and remove only connectors, role grants and
repository customizations you created for this exercise. Review changes first;
do not remove shared resources, unrelated instructions or other learners'
artifacts. Close your own temporary PRs only when their evidence is preserved;
never merge the security fixture.

</details>

## Observe, experiment and troubleshoot

Try cleanup twice: the second run should report an absent group, with local
evidence unchanged. If permissions or export fail, fix the query/read/delete
access and retry with the **same** state. If ownership mismatches, inspect the
saved scope and Azure tags; do not retag an unknown group to bypass the guard.
If a foreign resource is present, stop and have its owner relocate it; do not
delete it as a shortcut. Losing state requires an authorized operator's manual
ownership review, not automatic adoption.

Missing live AI/telemetry evidence stays explicitly unavailable. Preserve the
resume point and distinguish reference examples from observations. A reset
or tested fix PR never substitutes for independently verified runtime recovery.

Return to the [scenario guide](../README.md).
