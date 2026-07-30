## Incident summary
`POST /api/feature` on App Service `web-olwf` returns HTTP 500 while the rest of the application remains healthy. Application Insights telemetry confirms 10+ consecutive failures, all returning HTTP 500. The failure is caused by a `NotImplementedException` thrown in the `HandleFeature` method in `Program.cs`.

**Alert**: `unfinished-feature-5xx` (Sev2) — fires when `POST /api/feature` records more than three failures in five minutes.

## Expected behavior
POST /api/feature returns HTTP 200.

- The response body is exactly:
```{"status":"completed","message":"The unfinished feature is now implemented."}```
- `GET /health` continues to return HTTP 200 with a healthy status.

## Required changes
- Implement the endpoint in `scenarios/cloud-agent-handover/src/**` — replace the `NotImplementedException` in the `HandleFeature` method with the documented success response.
- Replace the test that documents the initial HTTP 500 response (`Feature_documents_the_initial_unfinished_state` in `scenarios/cloud-agent-handover/tests/EndpointTests.cs`) with a test for the exact HTTP 200 success contract.
- Preserve the existing health and home-page behavior.
- Keep changes limited to `scenarios/cloud-agent-handover/src/**` and `scenarios/cloud-agent-handover/tests/**`.
- Do not modify Bicep or GitHub Actions workflows.

## Acceptance criteria
- All App Service endpoint tests pass.
- Pull-request CI reports 100% coverage for changed executable application lines.
- CodeQL reports no new alerts for the pull request.
- The pull request contains no unrelated infrastructure, workflow, or repository-wide changes.
