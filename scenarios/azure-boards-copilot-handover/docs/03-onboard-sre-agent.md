# Module 3: Onboard the SRE Agent

Setup deploys the workload but does not create an Azure SRE Agent. Create or
select an agent scoped to this scenario before continuing.

## Connect the Azure resources

In [sre.azure.com](https://sre.azure.com):

1. Create an agent for this scenario and select **Set up your agent**.
2. Add the scenario resource group on the **Azure Resources** card.
3. Review and finish the portal-managed Reader grant.
4. Confirm the resource group permission status is complete.

Keep investigation access read-only. Do not grant the agent Azure modification
tools, deployment actions, or repository write access.

## Connect the GitHub repository

Use the **Code** card to connect this GitHub repository for source
investigation. The connection lets the agent correlate telemetry with the
Function normalizer and tests; it does not authorize the agent to edit code or
open a pull request.

Follow [Connect GitHub to the SRE Agent: Connect your code
repository](../../../docs/connect-github-to-sre-agent.md#connect-your-code-repository)
for the current portal flow.

## Add the Azure DevOps connector

Open **Builder → Connectors** and add an **Azure DevOps OAuth connector** for
the facilitator-provided organization:

1. Choose a connector name such as `ado-workshop`.
2. Enter the organization name from `https://dev.azure.com/<organization>`.
3. Use **User account** authentication and sign in with the learner identity.
4. Review the requested access and add the connector.
5. Confirm it shows **Connected**.

The connector gives the SRE Agent live work-item access. For this scenario,
use its write capability only after the learner approves the exact Bug draft.
The agent must create one unassigned Bug and perform no later tracker write
without fresh approval.

## Upload operational guidance

Open **Builder → Knowledge base** and add:

[`scenarios/azure-boards-copilot-handover/knowledge/operational-guidelines.md`](../knowledge/operational-guidelines.md)

Wait until `operational-guidelines.md` is indexed. A temporary chat attachment
does not replace this persistent knowledge source.

Next: [Configure incident response](./04-configure-incident-response.md).
