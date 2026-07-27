# Scenario: SRE Agent to Copilot Handover

> Track: `appservice` · Scenario id: `cloud-agent-handover`

## What breaks

The Blazor app deliberately ships `POST /api/feature` with a
`NotImplementedException`. The rest of the app remains healthy, but a burst of
feature requests returns HTTP 500 and triggers the route-specific SRE alert.
This scenario has no operational remediation script: recovery requires a code
change through the approved GitHub handoff.

## Trigger the incident

Open the deployed app and select **Run unfinished feature**. One click sends six
sequential requests, enough to cross the alert threshold. A facilitator can
generate the same burst from this directory:

```bash
./inject.sh
# PowerShell 7: ./inject.ps1
```

Use `--resource-group`, `--app-name`, and `--attempts` when the defaults do not
match the deployment.

## Watch the handoff

1. The SRE Agent receives the `unfinished-feature-5xx` alert and uses
   `query.kql` to isolate failed `/api/feature` requests and correlate the
   `NotImplementedException`.
2. Review and approve the agent's proposed structured GitHub issue.
3. Confirm the issue is assigned to Copilot and contains the endpoint contract
   and investigation evidence.
4. Review the Cloud Agent pull request, merge it, and watch the OIDC deployment
   publish the corrected application.

## Validate recovery

After deployment completes, verify the endpoint returns HTTP 200 and the exact
success payload:

```bash
./validate.sh
# PowerShell 7: ./validate.ps1
```
