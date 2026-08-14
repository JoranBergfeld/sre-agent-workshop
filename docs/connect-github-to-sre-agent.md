# Connect GitHub to the SRE Agent

This guide connects the repository for a selected
[scenario capsule](../README.md#choose-a-scenario) to Azure SRE Agent.

There are two separate GitHub integrations:

| Integration | Where you set it up | Purpose |
| --- | --- | --- |
| **Code/Knowledge Base repository connection** | The **Code** card during setup, or **Builder → Knowledge base** | Indexes source for root-cause analysis, file references, and deployment correlation |
| **GitHub OAuth connector** | **Builder → Connectors** | Provides explicit issue, pull-request, and workflow operations; this workshop requires issue creation |

Connecting a GitHub repository for source indexing automatically creates the
appropriate GitHub OAuth connector if one does not exist, or reuses the
existing connector. The repository connection also supports some pull-request
actions. The workshop nevertheless verifies the connector separately because
its governed handoff requires explicit issue operations and repository
permissions. The SRE Agent creates the issue; the Copilot coding agent creates
the pull request.

> **Reference:** [Connect source code](https://learn.microsoft.com/azure/sre-agent/connect-source-code)
> and [Set up the GitHub connector](https://learn.microsoft.com/azure/sre-agent/setup-github-connector)
> (Azure SRE Agent documentation).

## Connect your code repository

During setup, use the **Code** card. For an existing agent, open **Builder →
Knowledge base** and select **Add repository**. Then:

1. On the **Code** card, select **+**.
2. Select **GitHub**.
3. Sign in with **Auth** (OAuth), or connect with a PAT that has the required
   repository access.
4. Select **Next**.
5. Select the repository created from this template that contains the chosen
   `scenarios/<id>/` capsule.
6. Select **Add repository**.
7. Wait for the **Code** card to show a green checkmark.

The agent starts indexing the selected repository. Authentication
automatically creates or reuses the appropriate GitHub OAuth connector.

## Configure the GitHub OAuth connector for issue handoff

Use the explicit connector setup for the Cloud Agent Handover and AKS issue
flows. The GitHub OAuth connector supports OAuth and personal access token
(PAT) authentication for issue, pull-request, and workflow operations. This
workshop uses a PAT so repository permissions are explicit and repeatable. Use
OAuth instead when your organization requires interactive user
authentication.

1. Open the agent and go to **Builder → Connectors**.
2. Select **Add connector**, then select **GitHub OAuth connector**.
3. Select **PAT**.
4. Paste the token created in the next section and select **Connect**.
5. Confirm that the connector status is **Connected**.
6. Enable only the connector operations required by the scenario and save it.
   The workshop needs repository reads and issue creation, not direct
   pull-request creation or workflow execution by the SRE Agent.

### Create a fine-grained PAT

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
for the GitHub account that the SRE Agent will use. Do not use a token from an
unrelated personal account.

1. Set the **Resource owner** to the user or organization that owns the
   workshop repository.
2. Under **Repository access**, select **Only select repositories** and select
   the repository created from this template.
3. Set an expiration that follows your organization's policy. Use the shortest
   practical lifetime and rotate the token before it expires.
4. Grant only the repository permissions required for the connector operations
   you intend to use:

   | Repository permission | Access | Needed for |
   | --- | --- | --- |
   | Metadata | Read-only | Discovering the selected repository |
   | Contents | Read-only | Reading repository metadata and content during investigation |
   | Issues | Read and write | Listing issues and creating the approved remediation issue |
   | Pull requests | Read-only | Reading pull-request status and details |
   | Actions | Read-only | Reading workflow runs |

   The **Issues: read and write** permission is required for the Cloud Agent
   Handover and AKS issue flows. Do not grant write access to pull requests or
   Actions: the SRE Agent does not create pull requests or run workflows.
5. Generate the token and copy it immediately. GitHub shows a token value only
   once. If the repository belongs to an organization that requires approval
   for fine-grained tokens, wait for an organization owner to approve it before
   connecting the agent.
6. Return to **Builder → Connectors**, select **PAT**, paste the token, and
   select **Connect**.

> **Classic PAT fallback:** Use a classic PAT only if your organization does
> not support fine-grained tokens for this repository or the connector cannot
> perform a required operation with the fine-grained token. Grant `repo` for a
> private repository, or `public_repo` for public repositories only, and give
> the token a short expiration. A classic PAT can access more repositories than
> this workshop requires, so prefer a fine-grained PAT whenever possible.

### Keep the token secure

- Treat the PAT as a password. Paste it only into the connector setup form;
  never add it to the repository, an issue, a pull request, chat, shell
  history, or a GitHub Actions secret for this setup.
- Use a dedicated token for this agent and repository. Revoke it immediately
  if it is exposed, the operator leaves the team, or the workshop is retired.
- When rotating a token, create and connect the replacement first, verify the
  connector, then revoke the old token to avoid an interruption.

## Copilot assignment identity

GitHub's UI labels the coding agent **Copilot**. Its API/login value is
`copilot-swe-agent`; use that login when assigning an issue through an API or
when writing operational instructions. References to `@copilot` in AKS
scenario guidance mean this same coding agent, not the Azure SRE Agent.

For Cloud Agent Handover, the SRE Agent must investigate, present its
diagnosis, and receive explicit operator approval before it creates one issue
without an assignee. The learner reviews that issue and assigns
`copilot-swe-agent`. The SRE Agent does not create the branch or pull request;
the Copilot coding agent does that work after the learner assigns the issue.

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

## Verify the GitHub OAuth connector

Open a chat thread with the agent and make a read-only request:

```text
List recent issues from <owner>/<repo> and summarize the top 3.
```

If the connector is working, the agent returns issues from the selected
repository.

If verification fails, check the token before retrying:

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| The connector is disconnected | The token expired, was revoked, or was pasted incorrectly | Create a replacement PAT, reconnect it, verify the connector, then revoke the old token |
| The repository is unavailable | The token does not include the repository or organization approval is pending | Select the repository when creating the token and have an organization owner approve it |
| Issues work but pull requests or workflows cannot be read | The corresponding repository permission is missing | Add read access for **Pull requests** or **Actions**, generate a replacement token, and reconnect |
| The agent cannot create the approved issue | **Issues** is not set to read and write | Generate a replacement token with **Issues: read and write** and reconnect |

## Scenario-specific behavior

- **Cloud Agent Handover:** requires the code repository and GitHub OAuth
  connector. After explicit approval, the SRE Agent creates one unassigned
  issue. The learner reviews it and assigns `copilot-swe-agent`; Copilot
  creates the fix pull request; the operator reviews and merges it, updates the
  local `main` checkout, and deploys it with the scenario's `deploy.sh` or
  `deploy.ps1` helper.
- **CosmosDB RBAC Removal** and **Workload Identity Break:** require the code
  repository and GitHub OAuth connector. The SRE Agent creates a remediation
  issue assigned to `@copilot`; Copilot opens a pull request; a human reviews,
  merges, and manually runs the selected capsule's deployment workflow.
- **VM scenarios:** use scenario-local approval-gated scripts with a
  `CHG-`/`INC-` ticket and explicit `APPROVE`. They do not use GitHub issues or
  pull requests for remediation, so the code repository connection is
  sufficient, and the explicit GitHub OAuth connector verification can be
  skipped.
