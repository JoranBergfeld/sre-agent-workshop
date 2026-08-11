# Module 3: Onboard the SRE Agent

Setup deploys the Azure resources and the application, but it does **not**
deploy an SRE Agent. Create an SRE Agent manually in
[sre.azure.com](https://sre.azure.com) before continuing:

1. Select the subscription in which you will create the SRE Agent resource.
   This permission lets you deploy the agent; it does not grant the agent's
   managed identity access to the scenario resources.
2. Create an agent for this scenario and select **Set up your agent**.
3. On the **Azure Resources** card, add `rg-<workload>`, review the Reader
   permissions granted to the agent's managed identity, and finish the grant.
4. Connect monitoring and the generated repository, then select **Done and go
   to agent**.

Portal labels can change, so use the current setup experience rather than
relying on an exact screen layout. You can select an existing agent only when
it is scoped to this scenario resource group.

## Check Azure access

On the **Team Onboarding** page, confirm that `rg-<workload>` appears on the
**Azure Resources** card with its permission status complete. The single grant
made during setup gives the agent read access to these resources:

- The App Service.
- The Log Analytics workspace.
- The workspace-based Application Insights resource.
- The Azure Monitor alert named `<workload>-unfinished-feature-5xx`.

Use the portal's current resource and monitoring connection steps. Keep the
agent scoped to the scenario resource group.

## Connect the generated repository

On the agent setup page, use the **Code** card to connect the repository you
created with **Use this template**. This read connection lets the agent
correlate telemetry with the application source, tests, and deployment
workflow.

Follow [Connect GitHub to the SRE Agent: Connect your code
repository](../../../docs/connect-github-to-sre-agent.md#connect-your-code-repository)
for the current details.

## Upload operational guidance

Open **Builder → Knowledge base** and add this repository file as a persistent
file source:

[`scenarios/cloud-agent-handover/knowledge/operational-guidelines.md`](../knowledge/operational-guidelines.md)

It tells the SRE Agent to investigate first and request explicit approval
before creating an unassigned issue. The learner reviews that issue and assigns
`copilot-swe-agent`; coding, pull-request creation, merge, and deployment
remain with the correct actors.

Wait until the file status is **Indexed**, then confirm that the entry shows
`operational-guidelines.md` as a file source. A temporary chat attachment does
not persist as agent knowledge, and the Code repository connection indexes
source code for investigation; neither replaces this Knowledge base file.

Next: [Configure incident response](./04-configure-incident-response.md).
