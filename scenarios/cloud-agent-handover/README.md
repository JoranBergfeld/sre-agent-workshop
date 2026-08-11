# Scenario: SRE Agent to Copilot Handover

> Scenario: `cloud-agent-handover` · App Service

Run every command below from the repository root.

## Cost profile

This scenario has a **low** cost profile. The dominant cost drivers are the App
Service plan, Application Insights and Log Analytics ingestion, and Azure SRE
Agent usage. Confirm current pricing for your deployment region before
provisioning, and run cleanup immediately after completing the scenario.

## Follow the workshop modules

1. [00 Prerequisites](./docs/00-prerequisites.md)
2. [01 Deploy infrastructure and the starting app](./docs/01-deploy-infrastructure.md)
3. [02 Verify the application](./docs/02-deploy-application.md)
4. [03 Onboard the SRE Agent](./docs/03-onboard-sre-agent.md)
5. [04 Configure incident response](./docs/04-configure-incident-response.md)

## What breaks

The otherwise healthy Blazor app ships with `POST /api/feature` throwing a
`NotImplementedException`. Selecting **Run unfinished feature** once sends six
failed requests and triggers the route-specific alert.

## Trigger the incident

In the deployed app, select **Run unfinished feature**.

A facilitator can inject the same request burst from this scenario capsule.

**Bash**

```bash
./scenarios/cloud-agent-handover/scripts/inject.sh
```

**PowerShell 7**

```powershell
./scenarios/cloud-agent-handover/scripts/inject.ps1
```

## Run without Azure infrastructure

If Azure infrastructure or SRE Agent is unavailable, start at the GitHub
handoff:

1. Open [`sample-issue.md`](./sample-issue.md).
2. Review the proposed issue as the explicit approval gate.
3. Open a blank GitHub issue and use the sample heading as its title.
4. Copy the remaining sample Markdown into the issue body and submit it
   without an assignee.
5. Review the created issue, then manually assign it to Copilot
   (`copilot-swe-agent`).

This fallback represents the possible output of an SRE Agent investigation; it
does not claim that Azure telemetry was collected. Continue with the Copilot
pull request and CI steps below. Without deployed infrastructure, stop after the GitHub review and merge; do not claim Azure recovery.

## Watch the handoff

The Azure and GitHub-only paths converge when Copilot is assigned:

1. The Copilot coding agent creates the fix pull request.
2. **Validate Cloud Agent Handover Application** runs the endpoint tests and enforces
   100% coverage for changed executable application lines.
3. The operator reviews the source, tests, and CI result.
4. The operator merges the pull request.
5. If infrastructure exists, the OIDC-based **Deploy Cloud Agent Handover
   Application** workflow deploys the merged code.

There is no manual kill switch or remediation script. The pull request is the
intended recovery path. When using Azure, the SRE Agent must still investigate,
request approval, and create the issue without an assignee. The learner reviews
the issue and assigns Copilot before this common flow begins.

Continue with [90 Watch the handover](./docs/90-watch-sre-agent.md).

## Validate recovery

Run the validator after deployment.

**Bash**

```bash
./scenarios/cloud-agent-handover/scripts/validate.sh
```

**PowerShell 7**

```powershell
./scenarios/cloud-agent-handover/scripts/validate.ps1
```

The endpoint must return HTTP 200 with:

```json
{"status":"completed","message":"The unfinished feature is now implemented."}
```

Both validators print this exact healthy message:

```text
Healthy: POST /api/feature returned the implemented HTTP 200 contract.
```

Finish with [99 Cleanup](./docs/99-cleanup.md).
