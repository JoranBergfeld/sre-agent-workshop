# Module 4: Configure incident response

The App Service handover needs both GitHub integrations: the Code connection
from Module 3 and a GitHub OAuth connector for issue access.

## Connect GitHub issue access

In the SRE Agent connector settings, add the **GitHub OAuth connector** for the
generated repository. Follow [Set up the GitHub
connector](../../../docs/connect-github-to-sre-agent.md#set-up-the-github-connector).

Verify access with a read-only request in an agent chat:

```text
List recent issues from <owner>/<repository> and summarize the top 3.
```

The agent should either list issues or safely report that none exist.

## Require approval

Configure the incident source or response plan to use Azure Monitor and match
the workshop's `Unfinished feature returns HTTP 500` alert. Set the response
policy so the agent:

1. Investigates and presents evidence.
2. Waits for explicit learner approval.
3. Creates one GitHub issue only after that approval.

Do not enable a policy that permits issue creation without review. The
operational-guidelines knowledge file is the handover contract.

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
