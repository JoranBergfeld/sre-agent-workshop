# Module 4: Configure incident response

The App Service handover needs both GitHub integrations: the Code connection
from Module 3 and a GitHub connector configured with a PAT for issue access.

## Connect GitHub issue access

In the SRE Agent connector settings, add the **GitHub OAuth connector** for the
generated repository. Follow [Set up the GitHub
connector](../../../docs/connect-github-to-sre-agent.md#set-up-the-github-connector-with-a-pat).

Verify access with a read-only request in an agent chat:

```text
List recent issues from <owner>/<repository> and summarize the top 3.
```

The agent should either list issues or safely report that none exist.

## Create the review plan

Create one response plan for this alert. Azure Monitor is the incident
platform for this scenario.

1. In **Builder** → **Incident response plans**, select **New incident
   response plan**.
2. Enter `cloud-agent-handover-review` as the plan name, then select the
   SRE Agent configured for this scenario as the response custom agent.
3. Set the incident filter to match only this scenario:
   - **Severity:** **Sev2** (Severity 2).
   - **Title contains:** `Unfinished feature returns HTTP 500`.
4. Set **Agent autonomy level** to **Review**. Do not select **Autonomous**.
5. Preview the matching incidents, then select **Create**.
6. In the incident response plans list, confirm that
   `cloud-agent-handover-review` is **On** and shows the **Sev2** and title
   filters.

In **Review** mode, the agent investigates and presents its evidence before
the learner explicitly approves creation of one unassigned GitHub issue. The
learner reviews the created issue and assigns Copilot. Do not enable a plan
that permits issue creation without review. The operational-guidelines
knowledge file remains the handover contract.

## Confirm Copilot assignment

Setup already performs this read-only check. To repeat it:

```bash
OWNER="<owner>"
NAME="<repository>"
gh api graphql \
  -f query='query($owner:String!,$name:String!){repository(owner:$owner,name:$name){suggestedActors(capabilities:[CAN_BE_ASSIGNED],first:100){nodes{login}}}}' \
  -f owner="$OWNER" \
  -f name="$NAME" \
  --jq '.data.repository.suggestedActors.nodes[].login'
```

Confirm that the output includes `copilot-swe-agent`.

GitHub displays this assignee as **Copilot** in the web interface. The API and
operational-guidelines login is `copilot-swe-agent`; it identifies the GitHub
Copilot coding agent, not the Azure SRE Agent.

Next: [Watch the handover](./90-watch-sre-agent.md).
