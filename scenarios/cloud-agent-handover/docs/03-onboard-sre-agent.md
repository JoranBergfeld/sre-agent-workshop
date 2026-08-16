# Module 3: Onboard the SRE Agent

Setup deploys the Azure resources and the application, but it does **not**
deploy an SRE Agent. Create an SRE Agent manually in
[sre.azure.com](https://sre.azure.com) before continuing.

## Create the agent resource

1. Select **Create agent** and use these values:

   | Input | Workshop value |
   | --- | --- |
   | Subscription | The subscription used by setup |
   | Resource group | `rg-<workload>` |
   | Region | The same supported region as the scenario resources; use Sweden Central for the recommended deployment |
   | Application Insights | `<workload>-ai` |
   | Model provider and model | A supported option available to your tenant in that region |

2. Review the deployment, select **Create**, then open the agent and select
   **Set up your agent**.

Creating the agent resource does not grant its managed identity access to the
scenario resources. Configure that access during setup. You can reuse an
existing agent only when it is scoped to this scenario resource group and uses
the scenario's monitoring resources.

## Complete setup

The setup page separates fast connections from the complete configuration:

- **Quickstart** contains Code, Logs, Deployments, and Incidents.
- **Full setup** adds Azure Resources and knowledge files.

If you leave this page, select **Complete setup** in the status bar to return.
Configure the scenario as follows:

| Panel | Required action | Expected result |
| --- | --- | --- |
| **Code** | Connect the generated GitHub repository created with **Use this template**. Follow [Connect GitHub to the SRE Agent](../../../docs/connect-github-to-sre-agent.md#connect-your-code-repository). | The card shows a green check and repository indexing starts. |
| **Logs** | Skip additional log connectors for this workshop. | Log Analytics and Application Insights remain available through the Azure Resources grant. |
| **Azure Resources** | Add `rg-<workload>` with Reader-level access and review the requested role assignments. | The card lists the resource group with **permissions complete**. |
| **Incidents** | Connect **Azure Monitor** as the incident platform. | Azure Monitor is shown as connected so the scenario alert can create incidents. |

No separate deployment-pipeline connection is required. The repository
connection gives the agent the workflow context used by this scenario.

The Azure Resources grant gives the agent read access to:

- The App Service.
- The Log Analytics workspace.
- The workspace-based Application Insights resource.
- The Azure Monitor alert named `<workload>-unfinished-feature-5xx`.

Keep the agent scoped to `rg-<workload>`. Reader-level setup supplies the
resource, monitoring, and Log Analytics read permissions needed for
investigation without granting workload modification access.

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

## Finish and verify onboarding

Select **Done and go to agent**. The portal opens **Team Onboarding** as a
pinned thread in the **Favorites** sidebar. Tell the agent that this is a .NET
App Service workshop workload, that Application Insights and Log Analytics
contain its telemetry, and that remediation must follow the approved GitHub
issue and Copilot pull-request handoff.

Before continuing, confirm:

- [ ] **Code** shows a green check for the generated repository.
- [ ] **Logs** has no extra connector because none is required.
- [ ] **Azure Resources** lists `rg-<workload>` with **permissions complete**.
- [ ] **Incidents** shows Azure Monitor connected.
- [ ] `operational-guidelines.md` is **Indexed**.

Next: [Configure incident response](./04-configure-incident-response.md).
