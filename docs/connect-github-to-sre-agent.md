# Connect GitHub to the SRE Agent

This guide connects a GitHub repository to your Azure SRE Agent. It is shared
by every workshop track; follow the parts your track's module points you to.

There are two separate GitHub integrations:

| Integration | Where you set it up | Purpose |
| --- | --- | --- |
| **Code repository** | The **Code** card on the agent setup page | Lets the agent read code for root-cause analysis, file references, and deployment correlation |
| **GitHub connector** | **Builder → Connectors** | Lets the agent read GitHub issues, pull requests, and workflow runs and, when policy permits, create issues |

Connecting the code repository creates an OAuth connection for indexing, but it
does not replace the GitHub connector used for issue handoff. The App Service
track requires both integrations.

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
5. Select the repository used by your track:
   - **App Service:** the repository you created with **Use this template**, not
     the source template repository.
   - **AKS:** the workshop fork created by the AKS prerequisites.
   - **VM:** the repository selected during VM onboarding.
6. Select **Add repository**.
7. Wait for the **Code** card to show a green checkmark.

The agent starts indexing the selected repository.

## Set up the GitHub connector

The App Service and AKS tracks require this connector for issue-based handoff.

1. Open the agent and go to **Builder → Connectors**.
2. Select **Add connector**, then **GitHub OAuth connector**.
3. Sign in with GitHub OAuth, or use a PAT with the required repository access.
4. Confirm that the connector status is **Connected**.

> **Popup blocked?** Allow popups for `sre.azure.com`, then retry.

## Copilot assignment identity

GitHub's UI labels the coding agent **Copilot**. Its API/login value is
`copilot-swe-agent`; use that login when assigning an issue through an API or
when writing operational instructions. References to `@copilot` in workshop
prose mean this same coding agent, not the Azure SRE Agent.

For App Service, the SRE Agent must investigate, present its diagnosis, and
receive explicit operator approval before it creates one issue assigned to
`copilot-swe-agent`. The SRE Agent does not create the branch or pull request;
the Copilot coding agent does that work from the approved issue.

The App Service setup scripts perform a read-only GraphQL readiness check and
stop if `copilot-swe-agent` is not assignable. To run the equivalent check
manually:

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

## Track-specific behavior

- **App Service:** requires the code repository and GitHub connector. After
  explicit approval, the SRE Agent creates one issue assigned to
  `copilot-swe-agent`. Copilot creates the fix pull request; the operator
  reviews and merges it; the OIDC-based **Deploy App Service Application**
  workflow deploys the merged code.
- **AKS:** requires the code repository and GitHub connector. The SRE Agent
  files the remediation issue and assigns the Copilot coding agent. Copilot
  opens the pull request; after merge, an operator manually runs the
  track's deployment workflow, consistent with the AKS operational model.
- **VM:** uses approval-gated scripts with a CHG/INC ticket and explicit
  approval. It does not use GitHub issues or pull requests for remediation, so
  the code repository connection is sufficient and the GitHub connector can be
  skipped.
