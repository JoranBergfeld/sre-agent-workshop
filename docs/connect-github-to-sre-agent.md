# Connect GitHub to the SRE Agent

This guide connects the repository for a selected
[scenario capsule](../README.md#choose-a-scenario) to Azure SRE Agent.

There are two separate GitHub integrations:

| Integration | Where you set it up | Purpose |
| --- | --- | --- |
| **Code repository** | The **Code** card on the agent setup page | Lets the agent read code for root-cause analysis, file references, and deployment correlation |
| **GitHub connector** | **Builder → Connectors** | Lets the agent read GitHub issues, pull requests, and workflow runs and, when policy permits, create issues |

Connecting the code repository creates an OAuth connection for indexing; it
does not replace the GitHub connector used for issue handoff.

> **Reference:** [Connect source code](https://learn.microsoft.com/azure/sre-agent/connect-source-code)
> and [Set up the GitHub connector](https://learn.microsoft.com/azure/sre-agent/setup-github-connector)
> (Azure SRE Agent documentation).

## Connect your code repository

On the agent setup page, select **Set up your agent**, then:

1. On the **Code** card, select **+**.
2. Select **GitHub**.
3. Sign in with **Auth** (OAuth), or connect with a PAT that has the required
   repository access.
4. Select **Next**.
5. Select the repository created from this template that contains the chosen
   `scenarios/<id>/` capsule.
6. Select **Add repository**.
7. Wait for the **Code** card to show a green checkmark.

The agent starts indexing the selected repository.

## Set up the GitHub connector

Use the connector for the Cloud Agent Handover and AKS scenario issue flows.

1. Open the agent and go to **Builder → Connectors**.
2. Select **Add connector**, then **GitHub OAuth connector**.
3. Sign in with GitHub OAuth, or use a PAT with the required repository access.
4. Confirm that the connector status is **Connected**.

> **Popup blocked?** Allow popups for `sre.azure.com`, then retry.

## Copilot assignment identity

GitHub's UI labels the coding agent **Copilot**. Its API/login value is
`copilot-swe-agent`; use that login when assigning an issue through an API or
when writing operational instructions. References to `@copilot` in AKS
scenario guidance mean this same coding agent, not the Azure SRE Agent.

For Cloud Agent Handover, the SRE Agent must investigate, present its
diagnosis, and receive explicit operator approval before it creates one issue
assigned to `copilot-swe-agent`. The SRE Agent does not create the branch or
pull request; the Copilot coding agent does that work from the approved issue.

The Cloud Agent Handover setup scripts perform a read-only GraphQL readiness
check and stop if `copilot-swe-agent` is not assignable. To run the equivalent
check manually:

```bash
OWNER=<owner>
NAME=<repository>
gh api graphql \
  -f query='query($owner:String!,$name:String!){repository(owner:$owner,name:$name){suggestedActors(capabilities:[CAN_BE_ASSIGNED],first:100){nodes{login}}}}' \
  -f owner="$OWNER" \
  -f name="$NAME" \
  --jq '.data.repository.suggestedActors.nodes[].login'
```

Confirm that the output includes `copilot-swe-agent`.

## Verify the connector

Open a chat thread with the agent and make a read-only request:

```text
List recent issues from <owner>/<repo> and summarize the top 3.
```

If the connector is working, the agent returns issues from the selected
repository.

## Scenario-specific behavior

- **Cloud Agent Handover:** requires the code repository and GitHub connector.
  After explicit approval, the SRE Agent creates one issue assigned to
  `copilot-swe-agent`. Copilot creates the fix pull request; the operator
  reviews and merges it; the OIDC-based **Deploy Cloud Agent Handover
  Application** workflow deploys the merged code.
- **CosmosDB RBAC Removal** and **Workload Identity Break:** require the code
  repository and GitHub connector. The SRE Agent creates a remediation issue
  assigned to `@copilot`; Copilot opens a pull request; a human reviews,
  merges, and manually runs the selected capsule's deployment workflow.
- **VM scenarios:** use scenario-local approval-gated scripts with a
  `CHG-`/`INC-` ticket and explicit `APPROVE`. They do not use GitHub issues or
  pull requests for remediation, so the code repository connection is
  sufficient and the GitHub connector can be skipped.
