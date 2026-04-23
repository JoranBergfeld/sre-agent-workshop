# Module 3: Onboard the Azure SRE Agent (~30 min)

## Overview

Create and configure an Azure SRE Agent that will monitor your AKS cluster and respond to incidents.

## What is Azure SRE Agent?

The Azure SRE Agent is an AI-powered operations teammate designed to help you manage and troubleshoot your Azure infrastructure. It's always monitoring, learning, and ready to jump on problems the moment they arise.

**How it works:** The agent connects to your Azure resources, observability tools (like Azure Monitor and Log Analytics), and code repositories. It continuously monitors for anomalies, spikes in errors, and resource health issues. When something goes wrong, it doesn't just alert you — it automatically diagnoses the root cause by correlating logs, metrics, deployment changes, and code commits.

**What makes it special:** Unlike traditional alerting, the SRE Agent learns from every interaction. It builds persistent knowledge about your environment, your architecture, your team's debugging patterns, and common failure modes. Over time, it gets smarter and faster at finding root causes. For your workshop app, it will understand the relationship between the Bicep deployment, the Kubernetes configuration, and the app's dependency on CosmosDB — allowing it to trace a connection failure back to a missing role assignment in minutes.

> **Reference:** For more details, see [Azure SRE Agent overview](https://sre.azure.com/docs/overview)

## Create the Agent

Navigate to the Azure SRE Agent portal and step through the creation wizard:

### Step 1: Sign In and Create

1. Open [sre.azure.com](https://sre.azure.com) in your browser
2. Sign in with your Azure account
3. Click **Create agent** (or **New agent** if you're on the dashboard)

### Step 2: Fill in Basics

The wizard will ask for the following:

- **Subscription:** Select the Azure subscription where you deployed the workshop infrastructure (from Module 1)
- **Resource group:** Choose `rg-srelab` (the same resource group you created for your AKS, CosmosDB, and monitoring)
- **Agent name:** Enter something memorable, like `srelab-agent` or `workshop-agent` — this name appears in the portal and in incident conversations
- **Region:** Select the same region as your infrastructure (East US 2, Sweden Central, or Australia East)
- **Model provider:** Choose **Anthropic** (recommended for this workshop) or Azure OpenAI if you prefer
- **Application Insights:** Select **Use existing**, then:
  - **Subscription:** Your workshop subscription (`base_subscription`)
  - **Application Insights name:** `srelab-ai` (the instance deployed by Module 1)
  
  This connects the SRE Agent to the same Application Insights instance that monitors your AKS cluster and web app, giving it direct access to application telemetry, error traces, and performance data.

### Step 3: Review and Deploy

1. Click **Next** to proceed to the review screen
2. Verify your settings
3. Click **Create**

The agent deployment takes 2-5 minutes. In the background, Azure is:
- Creating a managed identity for the agent (used to authenticate to your resources)
- Setting up Log Analytics and Application Insights for the agent's own diagnostics
- Configuring role assignments so the agent can read your Azure resources
- Initializing the agent resource with your specified model provider

**You'll see a "Deployment in progress" screen. This is a good time to grab coffee.** ☕

## Connect Your Code Repository

Once deployment completes, you'll land on the agent overview page. Click **Set up your agent** to begin configuration.

### Add Your GitHub Repository

1. Look for the **Code** card on the setup page
2. Click the **+** button to add a code source
3. Choose **GitHub**
4. Click **Authenticate** and sign in with your GitHub account
5. After authentication, you'll see a list of your repositories
6. **Select your forked workshop repository** (the one you created in Module 0)
7. Click **Add repository**
8. Wait for the connection to verify — you should see a **green checkmark** on the Code card

### Why This Matters

The SRE Agent reads your codebase to understand your architecture, deployment patterns, and configuration-as-code. When it investigates an incident, it doesn't just look at logs — it traces failures back to specific files and commits.

For this workshop, the agent will read:
- Your **Bicep templates** to understand your infrastructure design
- Your **Kubernetes manifests** to understand how the app is deployed
- Your **application code** to understand dependencies and error patterns
- Your **GitHub Actions workflows** to trace deployments and changes

When we intentionally break the app in Module 5 by removing a role assignment from the Bicep code, the agent will identify that specific commit as the culprit.

## Logs (Optional — Skip for This Workshop)

The **Logs** card on the setup page supports connecting additional log sources like Azure Data Explorer or Azure DevOps AI Search. We didn't provision either of these, so **skip this card** — the agent already has log access through two other channels:

- **Application Insights** (`srelab-ai`) — configured during agent creation, provides application telemetry
- **Azure Resources** (`rg-srelab`) — configured in the next step, gives the agent Reader access to the Log Analytics workspace (`srelab-law`) where AKS container logs, pod events, and Kubernetes errors are stored

Between these two, the agent has full visibility into both application-level and infrastructure-level logs. No additional configuration needed.

## Grant Azure Resource Access

Now the agent needs permission to read your Azure resources.

1. Still on the setup page, find the **Azure Resources** card
2. Click the **+** button
3. Choose **Resource groups**
4. Filter by your subscription and select **`rg-srelab`** (your workshop resource group)
5. Click **Next** to review permissions
6. The agent will request **Reader** role on the resource group — this is sufficient for the workshop (the agent can query logs and metrics, but cannot modify resources)
7. Click **Add resource group**
8. Wait for the green checkmark to appear

### What This Enables

With access to your resource group, the agent can:
- Query **Azure Monitor metrics** (CPU, memory, pod restarts, error rates)
- Read **Log Analytics logs** (app errors, authentication failures, deployment events)
- Check **AKS pod status** (running, pending, failed states)
- Inspect **resource configurations** (Bicep deployment history, role assignments, secrets)
- Correlate **deployment changes** with performance degradation

## Upload Knowledge Files

The SRE Agent can ingest runbooks and operational guidelines that shape how it responds to incidents. Upload the operational guidelines file included in this repository:

1. On the setup page, find the **Knowledge files** card
2. Click the **+** button to add a knowledge document
3. Upload the file `docs/knowledge/operational-guidelines.md` from your repository
4. Wait for the green checkmark

### What This Does

The operational guidelines tell the agent to **always fix through code** — never make direct Azure changes. When it identifies a root cause, it will:
- Create a **GitHub issue** describing the root cause and required fix
- Assign the issue to **`@copilot`** (the Copilot coding agent)
- Copilot picks up the issue, creates a branch, makes the Bicep fix, and opens a PR

This creates a full audit trail: incident → investigation → issue → PR → deployment.

## Enable the GitHub Tool

For the SRE Agent to create GitHub issues and assign them to `@copilot`, it needs the GitHub tool enabled.

1. In the SRE Agent portal, go to **Capabilities** → **Tools** in the left sidebar
2. Find the **DevOps** category in the Built-in Tools section
3. Locate the tools related to GitHub (CreateGitHubIssue, CreateGitHubIssueComment, FetchGitHubIssue, FetchGitHubIssueComments, FetchGitHubIssues) and **enable** them
4. The agent may ask you to authenticate with GitHub — follow the prompts to connect your GitHub account. This won't happen if you've provided the right authorization previously while adding code.

> **Why this matters:** Without the GitHub tool, the agent can investigate and diagnose issues but cannot create issues or PRs on your repository. With it enabled, the full remediation loop works: SRE Agent detects fault → creates issue → `@copilot` fixes code → CI/CD deploys.

## Team Onboarding

After you click **Done and go to agent**, the agent opens a Team Onboarding conversation. This is where you share knowledge about your environment.

### What the Agent Does First

The agent will automatically explore your connected codebase and Azure resources. It reads your Bicep templates, Kubernetes manifests, and GitHub workflows to build an initial picture of your setup. You'll see it ask clarifying questions like "What does this deployment do?" or "What's the relationship between these services?"

### Share Your Knowledge

When the agent asks, tell it about your workshop setup. For example:

> "We're running a demo AKS cluster with a simple Node.js web app that connects to a CosmosDB database using workload identity. The app is deployed in the 'workshop' namespace. We care most about the health of the 'web-app' deployment and whether the app can successfully connect to CosmosDB for read/write operations."

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

Before moving on, confirm that everything is connected:

1. **Check the GitHub connection:** In Connectors (**Builder** → **Connectors**), you should see your GitHub repository listed with the status "Connected".
2. **Check the AKS Resources:** You should see the AKS resources in the **Monitor** → **Resource Mapping**
3. **Ask the agent:** In the onboarding conversation, ask "What Azure resources do you see in my resource group?" — it should list your AKS cluster, CosmosDB account, Log Analytics workspace, and other resources you created in Module 1
4. **Ask the agent:** "Can you tell me about the app's architecture from the code?" — it should reference your Kubernetes manifests and application server code

If all three checks pass, you're ready to move to Module 4.

## Next Step

→ [Module 4: Configure Incident Response](./04-configure-incident-response.md)
