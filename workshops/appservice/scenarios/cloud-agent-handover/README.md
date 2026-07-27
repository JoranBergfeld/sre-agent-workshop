# Scenario: SRE Agent to Copilot Handover

> Track: `appservice` · Scenario id: `cloud-agent-handover`

## What breaks

The otherwise healthy Blazor app ships with `POST /api/feature` throwing a
`NotImplementedException`. Selecting **Run unfinished feature** once sends six
failed requests and triggers the route-specific alert.

## Trigger the incident

In the deployed app, select **Run unfinished feature**.

A facilitator can inject the same request burst from this scenario directory.

**Bash**

```bash
./inject.sh
```

**PowerShell 7**

```powershell
./inject.ps1
```

## Watch the handoff

Watch for this sequence without relying on exact agent or alert timing:

1. An incident appears for the route-specific alert.
2. The SRE Agent correlates failed `POST /api/feature` requests,
   `NotImplementedException` telemetry, and the connected repository.
3. The SRE Agent presents its diagnosis and requests explicit operator
   approval.
4. After approval, it creates one issue assigned to Copilot
   (`copilot-swe-agent`).
5. The Copilot coding agent creates the fix pull request.
6. The operator reviews and merges the pull request.
7. The OIDC-based **Deploy App Service Application** workflow deploys the
   merged code.

There is no manual kill switch or remediation script. The pull request is the
intended recovery path.

## Validate recovery

Run the validator after deployment.

**Bash**

```bash
./validate.sh
```

**PowerShell 7**

```powershell
./validate.ps1
```

The endpoint must return HTTP 200 with:

```json
{"status":"completed","message":"The unfinished feature is now implemented."}
```

Both validators print this exact healthy message:

```text
Healthy: POST /api/feature returned the implemented HTTP 200 contract.
```
