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
   issue contains the expected HTTP 200 contract and is assigned to **Copilot**
   (`copilot-swe-agent`).

Continue at [Review the Copilot pull request](#review-the-copilot-pull-request).

## Path B: Run the GitHub-only fallback

Use this path only when Azure infrastructure or SRE Agent is unavailable.

1. Open the scenario's
   [`sample-issue.md`](../scenarios/cloud-agent-handover/sample-issue.md).
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
3. Open **Validate App Service Application** and confirm that endpoint tests
   pass and changed-line coverage is 100%.
4. If coverage fails, review the uncovered lines printed by `diff-cover` and
   request behavior-focused tests. Do not weaken assertions or exclude
   application code.
5. Review and merge the pull request to `main`.

The SRE Agent or learner creates the approved issue; neither writes the fix nor
opens the pull request. Repository and App Service Copilot instructions guide
the coding agent, while CI provides an independent merge gate.

## Observe deployment

Complete this section only for Path A.

Open
`https://github.com/<owner>/<repository>/actions/workflows/deploy-appservice-app.yml`.
Confirm that **Deploy App Service Application** started automatically for the
merge and completed successfully.

You can also inspect the latest run from the repository root:

```bash
gh run list --workflow deploy-appservice-app.yml --limit 1
```

For Path B without infrastructure, stop after GitHub review and merge. Do not
run the endpoint validator or claim that the incident recovered in Azure.

## Validate Azure recovery

After the Path A deployment completes, run the scenario validator.

Bash:

```bash
workshops/appservice/scenarios/cloud-agent-handover/validate.sh
```

PowerShell 7:

```powershell
./workshops/appservice/scenarios/cloud-agent-handover/validate.ps1
```

If you chose a custom workload, pass its resource group:

```bash
workshops/appservice/scenarios/cloud-agent-handover/validate.sh \
  --resource-group "rg-<workload>"
```

```powershell
./workshops/appservice/scenarios/cloud-agent-handover/validate.ps1 `
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
