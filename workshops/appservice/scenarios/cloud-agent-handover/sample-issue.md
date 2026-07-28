# Implement the unfinished App Service feature endpoint

## Incident summary

`POST /api/feature` returns HTTP 500 while the rest of the application remains
healthy. The failure is consistent with the endpoint's
`NotImplementedException` and should be corrected in application code.

## Expected behavior

- `POST /api/feature` returns HTTP 200.
- The response body is exactly:

  ```json
  {"status":"completed","message":"The unfinished feature is now implemented."}
  ```

- `GET /health` continues to return HTTP 200 with a healthy status.

## Required changes

- Implement the endpoint in `workshops/appservice/src/**`.
- Replace the test that documents the initial HTTP 500 response with a test
  for the exact HTTP 200 success contract.
- Preserve the existing health and home-page behavior.
- Keep changes limited to `workshops/appservice/src/**` and
  `workshops/appservice/tests/**`.
- Do not modify Bicep or GitHub Actions workflows.

## Acceptance criteria

- All App Service endpoint tests pass.
- Pull-request CI reports 100% coverage for changed executable application
  lines.
- The pull request contains no unrelated infrastructure, workflow, or
  repository-wide changes.
