# Module 04: Onboard the SRE Agent and GitHub Context

Run the Azure and GitHub setup from the repository root. This module connects
the deployed IIS alert to an SRE Agent and provides optional repository context
for the investigation.

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
3. Confirm the connected identity has read access to the repository. This
   connection provides code and runbook context; it does not execute recovery.

## Approve remediation

After the agent records the evidence, an authorized operator runs the
capsule-local approval gate with the only allowed action:

```bash
./scenarios/iis-app-pool/tools/invoke-approved-remediation.sh \
  --action start-iis-app-pool \
  --change-ticket CHG-12345
```

The ticket must match `CHG-<number>` or `INC-<number>`. At the prompt, type
`APPROVE` exactly. The gate writes the ticket, action, resource group, VM,
timestamp, and execution status to `output/actions-audit.log`. GitHub context
does not replace this approval and audit process.

Next: inject the fault from the [scenario README](../README.md), then follow
[90 Watch the SRE Agent](./90-watch-agent-workflow.md).
