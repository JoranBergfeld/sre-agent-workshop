# Module 2: Verify the application

Setup already tested, published, and deployed the starting application.

## Open the app

Open the `Application:` URL printed by setup. The page contains a **Run
unfinished feature** button.

Set the same URL in your shell:

```bash
APP_URL="https://<app-name>.azurewebsites.net"
curl --fail --show-error "$APP_URL/health"
```

PowerShell 7:

```powershell
$AppUrl = "https://<app-name>.azurewebsites.net"
Invoke-WebRequest -Uri "$AppUrl/health" |
  Select-Object StatusCode, Content
```

`GET /health` should return HTTP 200. The application exposes:

- `GET /` — the handover page.
- `GET /health` — the health check.
- `POST /api/feature` — the intentionally unfinished feature.

The initial `POST /api/feature` response is intentionally HTTP 500. Do not
select the button yet; first connect and configure the SRE Agent.

## How the recovery deploys

The initial deployment came from your local setup script. Later, when you merge
the Copilot pull request to `main`, **Deploy Cloud Agent Handover Application** runs
automatically for App Service source or test changes. It tests and publishes
the app, signs in to Azure through OIDC, and deploys the merged code.

Next: [Onboard the SRE Agent](./03-onboard-sre-agent.md).
