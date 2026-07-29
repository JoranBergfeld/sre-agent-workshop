# Module 04: Onboard the SRE Agent and GitHub

Run the Azure and GitHub setup from the repository root. This module connects
the deployed IIS alert to an SRE Agent and defines the human-controlled GitHub
handoff.

## Connect Azure Monitor

1. Open [sre.azure.com](https://sre.azure.com) and create or select your SRE
   Agent.
2. In **Builder** → **Incident platform**, select **Azure Monitor**. Disable
   the Quickstart response plan and save the connection.
3. Grant the agent identity **Reader** and **Monitoring Reader** on
   `rg-srelabiisapppool`. The agent needs those roles to read the scheduled
   query rule and its `Event` telemetry.
4. In **Builder** → **Incident response plans**, create a plan named
   `iis-app-pool-review`. Include the **IIS App Pool Failure** alert and set
   autonomy to **Review**. Do not select autonomous remediation.

Verify the agent can read the alert and collected events:

```bash
az resource list \
  --resource-group rg-srelabiisapppool \
  --resource-type Microsoft.Insights/scheduledQueryRules \
  --query "[].{name:name,displayName:properties.displayName}" -o table
```

## Connect GitHub

1. In the SRE Agent **Builder**, open **GitHub** and complete the GitHub App
   authorization for the repository that contains this capsule.
2. Select that repository as the code context so the agent can inspect
   `scenarios/iis-app-pool/infra/bicep/` and the operational guidance.
3. Confirm the connected GitHub identity can create issues and that Copilot is
   enabled for the repository.
4. When the agent finishes its investigation, a human creates or explicitly
   approves exactly one issue containing the alert, evidence, affected VM, and
   proposed change. Assign the issue to `@copilot`.

Copilot authors the pull request. A human reviews and merges it, then deploys
the merged change. This is the normal incident → issue → Copilot PR → human
merge → deployment path. Use
`tools/invoke-approved-remediation.{sh,ps1}` only as the documented,
ticketed, audited fallback when that path is unavailable.

Next: inject the fault from the [scenario README](../README.md), then follow
[90 Watch the SRE Agent](./90-watch-agent-workflow.md).
