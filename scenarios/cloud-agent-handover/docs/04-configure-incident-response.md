# Module 4: Configure incident response

The App Service handover needs both GitHub integrations: the Code connection
from Module 3 and a GitHub connector configured with a PAT for issue access.

## Connect GitHub issue access

In the SRE Agent connector settings, add the **GitHub OAuth connector** for the
generated repository. Follow [Set up the GitHub
connector](../../../docs/connect-github-to-sre-agent.md#configure-the-github-oauth-connector-for-issue-handoff).

Verify access with a read-only request in an agent chat:

```text
List recent issues from <owner>/<repository> and summarize the top 3.
```

The agent should either list issues or safely report that none exist.

## Verify the incident platform

Open **Builder** → **Incident Platform** and confirm that **Azure Monitor** is
connected. If it is not connected, return to **Complete setup** →
**Quickstart** → **Incidents**, connect Azure Monitor, and then return here.

## Create the scenario custom agent

Response plans route incidents to a custom agent. Create one for this capsule:

1. Open **Builder** → **Agent Canvas**.
2. Select **Create** → **Custom Agent**.
3. Set **Name** to `cloud-agent-handover-investigator`.
4. Set **Handoff Description** to
   `Investigate the unfinished Cloud Agent Handover feature`.
5. In **Instructions**, enter:

   > Investigate the Cloud Agent Handover incident. Correlate the alert named
   > "Unfinished feature returns HTTP 500" with Application Insights and Log
   > Analytics evidence, the connected Azure resources, repository source,
   > tests, and GitHub history. Identify the unfinished `POST /api/feature`
   > implementation. Never change Azure resources or repository code directly.
   > Present the evidence and request explicit operator approval before
   > creating one unassigned GitHub issue. The learner assigns Copilot, reviews
   > and merges its pull request, then an operator deploys the reviewed `main`
   > branch with the scenario-local deploy helper.

6. Under **Knowledge**, enable the indexed
   `scenarios/cloud-agent-handover/knowledge/operational-guidelines.md` file.
7. Under **Tools**, enable the read and investigation operations needed for
   Azure resources, logs, repository source, and GitHub history. Enable only
   the GitHub issue-creation write operation required for the approved handoff.
   Do not enable Azure modification, pull-request creation, merge, workflow
   dispatch, or deployment operations.
8. Save the custom agent. Return to **Builder** → **Agent Canvas**, switch to
   **Table view**, and confirm that `cloud-agent-handover-investigator`
   appears.

## Create the review plan

Create one response plan for this alert after Azure Monitor is connected and
`cloud-agent-handover-investigator` exists.

If a default `quickstart` response plan exists, open **Builder** → **Incident
response plans**, switch to **Table view**, and delete it. Leaving that plan
enabled can route the same alert twice or to the wrong custom agent.

1. Open **Builder** → **Agent Canvas**.
2. Select **Create**, then **Trigger** → **Incident response plan**.
3. Enter `cloud-agent-handover-review` as the plan name.
4. Select `cloud-agent-handover-investigator` as the response custom agent.
5. Set **Severity** to **Sev2** (Severity 2).
6. Set **Title contains** to `Unfinished feature returns HTTP 500`.
7. Set **Agent autonomy level** to **Review**. Do not select **Autonomous**,
   which is the default for a new plan.
8. Keep **Reinvestigation cooldown** enabled at its default duration of three
   hours. During this window, another firing of the same Azure Monitor alert
   is merged into or reopens the existing investigation thread. Workshop
   scenarios do not require a separate investigation for every firing.
9. Select **Next**, review the matching-incidents preview, then select
   **Create**. No historical matches is normal before the scenario alert fires.
10. In the incident response plans grid, confirm that
   `cloud-agent-handover-review` is **On** and shows the **Sev2** and title
    filters, `cloud-agent-handover-investigator`, **Review** autonomy, and a
    three-hour reinvestigation cooldown.

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
