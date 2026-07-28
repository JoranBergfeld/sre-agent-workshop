# App Service Handover Operational Guidelines

## Purpose

Use an approval-gated handoff from the Azure SRE Agent to the GitHub Copilot
coding agent. The SRE Agent investigates and proposes the handoff. Explicit
operator approval gates issue creation, and the operator retains control of
review, merge, and recovery.

## Incident policy

1. Investigate the alert and gather evidence before proposing a fix.
2. Correlate failed `POST /api/feature` requests with
   `NotImplementedException` telemetry and the connected repository.
3. Do not make direct Azure changes or edit code during incident response.
4. Present the diagnosis and ask for explicit operator approval before creating
   a GitHub issue.
5. After approval, create exactly one issue and assign it to
   `copilot-swe-agent`.
6. The SRE Agent must not create a branch or pull request, merge changes, or
   deploy the application. Those steps belong to the Copilot coding agent and
   operator.

## Required issue content

The issue must state:

- Route: `POST /api/feature`.
- Current behavior: HTTP 500.
- Expected behavior: HTTP 200 with exactly
  `{"status":"completed","message":"The unfinished feature is now implemented."}`.
- Preserve the existing `/health` behavior.
- Replace the test that documents the broken behavior with a test for the
  implemented success contract.
- Make code-only changes. Do not modify Bicep or GitHub Actions workflows.

## Recovery and closure

1. The operator reviews and merges the Copilot pull request.
2. The merge triggers the OIDC-based **Deploy Cloud Agent Handover Application**
   workflow.
3. Validate the endpoint and health check after deployment. Close the issue and
   incident only after recovery is confirmed.
