# Module 3: Onboard the SRE Agent

Setup deploys the Azure resources and the application, but it does **not**
deploy an SRE Agent. Create an SRE Agent manually in
[sre.azure.com](https://sre.azure.com) before continuing:

1. Select the subscription that contains `rg-<workload>`.
2. Create an agent for this scenario, then select `rg-<workload>` when the
   portal asks which resources the agent can access.
3. Continue with the current portal setup experience to connect Azure,
   monitoring, and the generated repository.

Portal labels can change, so use the current setup experience rather than
relying on an exact screen layout. You can select an existing agent only when
it is scoped to this scenario resource group.

## Connect Azure

Give the agent read access to `rg-<workload>` and connect the monitoring
resources created by setup:

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

Add this repository file as a knowledge source:

[`scenarios/cloud-agent-handover/knowledge/operational-guidelines.md`](../knowledge/operational-guidelines.md)

It tells the SRE Agent to investigate first, request explicit approval before
creating an issue, assign the approved issue to `copilot-swe-agent`, and leave
coding, pull-request creation, merge, and deployment to the correct actors.

Next: [Configure incident response](./04-configure-incident-response.md).
