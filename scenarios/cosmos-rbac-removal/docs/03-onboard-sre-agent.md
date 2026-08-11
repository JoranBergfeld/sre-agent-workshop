# Module 3: Onboard the Azure SRE Agent (~30 min)

## Overview

Create and configure an Azure SRE Agent that will monitor your AKS cluster and respond to incidents.

## What is Azure SRE Agent?

The Azure SRE Agent is an AI-powered operations teammate designed to help you manage and troubleshoot your Azure infrastructure. It's always monitoring, learning, and ready to jump on problems the moment they arise.

**How it works:** The agent connects to your Azure resources, observability tools (like Azure Monitor and Log Analytics), and code repositories. It continuously monitors for anomalies, spikes in errors, and resource health issues. When something goes wrong, it doesn't just alert you — it automatically diagnoses the root cause by correlating logs, metrics, deployment changes, and code commits.

**What makes it special:** Unlike traditional alerting, the SRE Agent learns from every interaction. It builds persistent knowledge about your environment, your architecture, your team's debugging patterns, and common failure modes. Over time, it gets smarter and faster at finding root causes. For your workshop app, it will understand the relationship between the Bicep deployment, the Kubernetes configuration, and the app's dependency on CosmosDB — allowing it to trace a connection failure back to a missing role assignment in minutes.

> **Reference:** For more details, see [Azure SRE Agent overview](https://sre.azure.com/docs/overview)

## Create the agent resource

1. Open [sre.azure.com](https://sre.azure.com) and sign in with the Azure
   account used for the workshop subscription.
2. Select **Create agent**, choose the workshop subscription, and enter the
   requested agent-resource details.
3. Review the deployment and select **Create**.
4. When deployment completes, open the agent and select **Set up your agent**.

Your signed-in account's permission to deploy the agent resource is separate
from the agent managed identity's data access. Creating the agent does not
automatically let that identity inspect the AKS, Cosmos DB, or monitoring
resources in `$RESOURCE_GROUP`; grant that read access during **Full setup**.

## Quickstart

### Connect the generated repository

On the **Quickstart** page, use the **Code** card and follow
**[Connect GitHub to the SRE Agent → Connect your code repository](../../../docs/connect-github-to-sre-agent.md#connect-your-code-repository)**.
Select the generated repository created with **Use this template** in Module 0,
then wait for the Code card to show a green check.

The Code connection (also available from **Builder → Knowledge base**) indexes
the repository as source context. Authentication automatically creates the
appropriate GitHub OAuth connector if one is missing, or reuses the existing
connector. The repository connection supports source investigation and some
pull-request actions, but this workshop does not let the SRE Agent create the
remediation pull request.

The workshop separately verifies or configures the **GitHub OAuth connector**
and its issue operations and repository permissions for the governed issue
handoff. The SRE Agent creates the approved issue; the Copilot coding agent
creates the pull request.

### Why This Matters

The SRE Agent reads your codebase to understand your architecture, deployment patterns, and configuration-as-code. When it investigates an incident, it doesn't just look at logs — it traces failures back to specific files and commits.

For this workshop, the agent will read:
- Your **Bicep templates** to understand your infrastructure design
- Your **Kubernetes manifests** to understand how the app is deployed
- Your **application code** to understand dependencies and error patterns
- Your **GitHub Actions workflows** to trace deployments and changes

When we intentionally break the app in Module 5 by removing a role assignment from the Bicep code, the agent will identify that specific commit as the culprit.

## Full setup

Select **Full setup** to configure workload data access and persistent
knowledge.

### Add Azure resource access

1. On the **Azure Resources** card, select **+**.
2. Choose **Resource groups**, select the workshop subscription, and add
   **`$RESOURCE_GROUP`**.
3. Select the **Reader** permission level and review all requested role
   assignments before confirming. Reader level automatically includes
   **Reader**, **Log Analytics Reader**, and **Monitoring Reader** at
   resource-group scope, plus **Monitoring Contributor** at subscription scope.
4. Confirm the grant and wait until the Azure Resources card reports
   **permissions complete**.

With this access, the agent can query Azure Monitor, read Log Analytics,
inspect AKS state and resource configuration, and correlate deployment changes
without modifying the workload.

### Logs (optional — skip for this workshop)

The **Logs** card on the setup page supports connecting additional log sources
like Azure Data Explorer or Azure DevOps AI Search. We didn't provision either,
so skip this card. The **Azure Resources** grant already covers the workshop
monitoring resources in `$RESOURCE_GROUP`, including:

- **Log Analytics**, where Container Insights collects the current Node.js
  apps' stdout/stderr, pod events, and Kubernetes errors. The application
  output is queryable in `ContainerLogV2`.
- **Application Insights**, which is provisioned and selected for SRE Agent
  diagnostics and agent monitoring. The sample apps do not use an Application
  Insights SDK, so it does not provide app-level tracing for them.

No additional Logs-card connection is needed for this workshop.

## Upload operational guidance

The SRE Agent can ingest runbooks and operational guidelines that shape how it responds to incidents. Add the operational guidelines file included in this repository as persistent knowledge:

1. Open **Builder → Knowledge base**.
2. Add a file source and upload `scenarios/cosmos-rbac-removal/knowledge/operational-guidelines.md` from your repository.
3. Wait until `operational-guidelines.md` shows type **File** and status **Indexed** before continuing.

A temporary chat attachment does not persist as agent knowledge. The Code
repository connection is also separate: it indexes source for investigation,
but does not replace this operational-guidance file.

### What This Does

The operational guidelines tell the agent to **always fix through code** —
never make direct Azure changes. When it identifies a root cause, it proposes
remediation. After a human approves issue creation, the SRE Agent creates
exactly one GitHub issue assigned to **`@copilot`** (the Copilot coding agent).
A human then reviews and merges the PR Copilot authors before an operator
manually deploys the fix.

This creates a full audit trail: incident → investigation → issue → PR → deployment.

## Configure the GitHub OAuth connector

The workshop separately checks the GitHub OAuth connector's issue operations
and permissions. It does not replace the Code/Knowledge Base repository
connection used to index source for investigations.

Follow **[Connect GitHub to the SRE Agent → Configure the GitHub OAuth connector for issue handoff](../../../docs/connect-github-to-sre-agent.md#configure-the-github-oauth-connector-for-issue-handoff)**,
then use the read-only verification prompt in that guide to confirm that the
agent can list repository issues.

The governed remediation loop remains: the SRE Agent investigates and proposes
remediation → a human approves issue creation → the SRE Agent creates one issue
assigned to `@copilot` → Copilot authors the PR → a human reviews and merges →
an operator manually deploys the fix.

## Finish setup

Select **Done and go to agent**. The portal opens Team Onboarding as a pinned
thread in the **Favorites sidebar**.

## Team Onboarding

Use the pinned Team Onboarding conversation to share knowledge about your
environment.

### What the Agent Does First

The agent will automatically explore your connected codebase and Azure resources. It reads your Bicep templates, Kubernetes manifests, and GitHub workflows to build an initial picture of your setup. You'll see it ask clarifying questions like "What does this deployment do?" or "What's the relationship between these services?"

### Share Your Knowledge

When the agent asks, tell it about your workshop setup. For example:

> "We're running a demo AKS cluster with a simple Node.js web app that connects to a CosmosDB database using workload identity. The app is deployed in the 'cosmos-rbac-removal' namespace. We care most about the health of the 'cosmos-rbac-removal-app' deployment and whether the app can successfully connect to CosmosDB for read/write operations."

Then share a debugging hint that will be invaluable later:

> "If the app can't connect to CosmosDB, the first thing to check is the managed identity role assignments. The app authenticates using DefaultAzureCredential with workload identity, which means it relies on a federated identity credential and a role assignment on the CosmosDB account. If either of those is missing or misconfigured, auth will fail."

### The Agent's Memory

The agent saves everything you tell it during onboarding to persistent knowledge files:
- **architecture.md** — Your system design and component relationships
- **team.md** — Your team's priorities and operational concerns
- **debugging.md** — Common failure modes and how to fix them

> **⚠️ Note:** The Team Onboarding conversation is the trigger to move the status of the Agent from `BuildingKnowledgeGraph` to `Running`. You can check the agent's state in the portal, it should transition to `Running` once onboarding is complete. This may take a while, so we are not going to wait for this in the workshop. In real-life scenarios it should be taken care of.

**Tip:** The more specific and actionable your onboarding information, the faster the agent will diagnose issues in Module 6. Your debugging hint about role assignments will directly help when the agent investigates the fault we introduce in Module 5.

## Verify Setup

Before moving on, confirm exactly these four outcomes:

- [ ] The **Code** card has a green check.
- [ ] **Azure Resources** lists `$RESOURCE_GROUP` with **permissions complete**.
- [ ] The `operational-guidelines.md` **File** source is **Indexed**.
- [ ] The **GitHub OAuth connector** verification prompt lists repository issues.

## Next Step

→ [Module 4: Configure Incident Response](./04-configure-incident-response.md)
