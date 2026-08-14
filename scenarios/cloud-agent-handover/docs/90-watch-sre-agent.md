# Module 90: Watch the handover

Use the Azure path when infrastructure and SRE Agent are available. Otherwise,
use the GitHub-only fallback to demonstrate the same issue, Copilot pull
request, and CI controls without claiming that an Azure investigation ran.

Both paths require an explicit review before Copilot is assigned. There is no
kill switch or direct remediation command.

## Path A: Run the Azure scenario

Keep the application, SRE Agent portal, and generated GitHub repository open.
The services evaluate telemetry asynchronously, so follow state changes rather
than expecting a fixed timeline.

1. Open the application URL printed by setup.
2. Select **Run unfinished feature** once. The page sends six
   `POST /api/feature` requests; the starting app returns HTTP 500.
3. Wait for Azure Monitor to evaluate the failures and for an incident to
   appear in SRE Agent.
4. Open the investigation and look for correlated evidence:
   - Failed `POST /api/feature` requests.
   - `NotImplementedException` telemetry.
   - The unfinished handler and its test in the connected repository.
5. Review the diagnosis. When the agent asks, explicitly approve creation of
   the handover issue.
6. Open `https://github.com/<owner>/<repository>/issues`. Confirm that one
   unassigned issue contains the expected HTTP 200 contract.
7. Review the issue, then manually assign it to **Copilot**
   (`copilot-swe-agent`).

Continue at [Review the Copilot pull request](#review-the-copilot-pull-request).

## Path B: Run the GitHub-only fallback

Use this path only when Azure infrastructure or SRE Agent is unavailable.

1. Open the scenario's
   [`sample-issue.md`](../sample-issue.md).
2. Review the sample as the explicit approval gate. It represents possible SRE
   Agent output; it is not evidence that Azure telemetry was collected.
3. Open `https://github.com/<owner>/<repository>/issues/new`.
4. Use the sample heading as the issue title and copy the remaining Markdown
   into the issue body.
5. Submit the issue without an assignee.
6. Review the created issue, then manually assign it to **Copilot**
   (`copilot-swe-agent`).

If blank issues are unavailable, verify that repository issues are enabled and
that you have permission to create one. If Copilot cannot be assigned, verify
Copilot coding agent availability and repository policy; do not silently skip
the handoff or substitute a human assignee.

## Review the Copilot pull request

1. Wait for the GitHub Copilot coding agent to open a pull request.
2. Confirm that changes stay within App Service source and tests.
3. Open **Validate Cloud Agent Handover Application** and **CodeQL Cloud Agent
   Handover**. Confirm that endpoint tests pass, changed-line coverage is 100%,
   and CodeQL reports no new alerts.
4. If coverage fails, review the uncovered lines printed by `diff-cover` and
   request behavior-focused tests. If CodeQL reports an alert, resolve it or
   document why it is a false positive before merging. Do not weaken
   assertions, exclude application code, or dismiss a CodeQL alert without
   evidence.
5. Review and merge the pull request to `main`.

The SRE Agent creates the approved issue without an assignee; the learner
reviews it and assigns Copilot. Neither writes the fix nor opens the pull
request. Repository and App Service Copilot instructions guide the coding
agent, while CI provides an independent merge gate.

## Update and deploy the merged code

Complete this section only for Path A.

Before changing branches, commit or stash any local work that you intend to
keep. Then update the local checkout:

```bash
git switch main
git pull --ff-only
```

Deploy the current checkout with the signed-in Azure CLI user.

Bash:

```bash
scenarios/cloud-agent-handover/scripts/deploy.sh
```

PowerShell 7:

```powershell
scenarios/cloud-agent-handover/scripts/deploy.ps1
```

If you chose a custom workload, pass its resource group:

```bash
scenarios/cloud-agent-handover/scripts/deploy.sh \
  --resource-group "rg-<workload>"
```

```powershell
scenarios/cloud-agent-handover/scripts/deploy.ps1 `
  -ResourceGroup "rg-<workload>"
```

The deployment helpers run the endpoint tests, publish the application, create
a zip bundle, and call `az webapp deploy`. They deploy exactly the current
checkout and do not fetch, pull, or change branches.

For Path B without infrastructure, stop after GitHub review and merge. Do not
run the endpoint validator or claim that the incident recovered in Azure.

## Validate Azure recovery

After the local Path A deployment completes, run the scenario validator.

Bash:

```bash
scenarios/cloud-agent-handover/scripts/validate.sh
```

PowerShell 7:

```powershell
scenarios/cloud-agent-handover/scripts/validate.ps1
```

If you chose a custom workload, pass its resource group:

```bash
scenarios/cloud-agent-handover/scripts/validate.sh \
  --resource-group "rg-<workload>"
```

```powershell
scenarios/cloud-agent-handover/scripts/validate.ps1 `
  -ResourceGroup "rg-<workload>"
```

Success prints:

```text
Healthy: POST /api/feature returned the implemented HTTP 200 contract.
```

Refresh the application and run the button again to observe HTTP 200. Confirm
`GET /health` still succeeds. Azure Monitor clears the alert after its query
window no longer contains matching failures; then close the issue or incident
if your configured process requires it.

Next: [Clean up](./99-cleanup.md).
