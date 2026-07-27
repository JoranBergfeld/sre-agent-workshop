# Module 90: Watch the handover

Keep the application, SRE Agent portal, and generated GitHub repository open.
The services evaluate telemetry asynchronously, so follow the state changes
rather than expecting a fixed timeline.

There is no kill switch or direct remediation command. Recovery happens only
through the approved issue, Copilot pull request, merge, and deployment.

## Run the scenario

1. Open the application URL printed by setup.
2. Select **Run unfinished feature** once. The page sends six
   `POST /api/feature` requests; the starting app returns HTTP 500.
3. Wait for Azure Monitor to evaluate the failures and for an incident to
   appear in the SRE Agent.
4. Open the investigation and look for correlated evidence:
   - Failed `POST /api/feature` requests.
   - `NotImplementedException` telemetry.
   - The unfinished handler and its test in the connected repository.
5. Review the diagnosis. When the agent asks, explicitly approve creation of
   the handover issue.
6. Open `https://github.com/<owner>/<repository>/issues`. Confirm that one
   issue contains the expected HTTP 200 contract and is assigned to **Copilot**
   (`copilot-swe-agent`).
7. Wait for the GitHub Copilot coding agent to open a pull request. The SRE
   Agent investigates and creates the approved issue; it does not write the
   fix or open the pull request.
8. Review the pull request's source and test changes, then merge it to `main`.
9. Open
   `https://github.com/<owner>/<repository>/actions/workflows/deploy-appservice-app.yml`.
   Confirm that **Deploy App Service Application** started automatically for
   the merge and completed successfully.

You can also inspect the latest run from the repository root:

```bash
gh run list --workflow deploy-appservice-app.yml --limit 1
```

## Validate recovery

After the deployment completes, run the scenario validator.

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
