# Scenario: Red Button 500 🔴💥

> Track: `appservice` · Scenario id: `red-button-500`

## What breaks

A deliberately minimalistic page at **`/demo`** shows two buttons:

- **Green** → `GET /api/green` → always **HTTP 200**.
- **Red** → `GET /api/red` → **HTTP 500**. `/api/red` ships a broken feature; every press logs
  `Red button pressed — /api/red is broken` and returns 500.

`/health` stays **green** throughout (it never touches the red feature), so a naive uptime check
misses the outage — that's the point. The red button is gated by the **`RED_BUTTON_MODE`** app
setting (unset ⇒ `broken`), which doubles as the operational kill-switch.

## Prerequisites

- The App Service track infrastructure and application deployed (run **Deploy App Service
  Infrastructure**, then **Deploy App Service Application**).
- Local tools for inject/validate/remediate: `az` (logged in) and `curl`.

## Inject the fault

```bash
./inject.sh                      # bash / Linux
# ./inject.ps1                   # PowerShell / Windows
# options: -g <resource-group>  -w <workload>  -n <attempts>
```

Re-asserts `RED_BUTTON_MODE=broken`, waits for the app to restart, then issues ~20 `GET /api/red`
presses to trip the alert. You can also just open `https://<host>/demo` and click **Red** a few times.

## Validate impact

```bash
./validate.sh
```

Issues ~12 `GET /api/red`. While broken, **any** non-200 ⇒ exit non-zero (degraded). After
remediation, all `200` ⇒ exit 0.

## Let the SRE Agent remediate

The `redbutton-5xx` alert (`alert.bicep`) fires when more than three `/api/red` requests fail in a
5-minute window (App Insights `AppRequests`, scoped to the Log Analytics workspace). The agent is
expected to:

1. **Detect** the outage from the alert.
2. **Investigate** with `query.kql` — count the failing `/api/red` requests and (commented follow-up)
   drill `AppTraces` for the `/api/red is broken` log line.
3. **Mitigate operationally** — flip the kill-switch (`disable-red-button`): set `RED_BUTTON_MODE=ok`
   so `/api/red` returns 200 immediately.
4. **Fix durably** — file a GitHub issue; `@copilot` opens a PR that removes the broken branch in
   `/api/red` so it returns 200 unconditionally. Merging it and re-running **Deploy App Service
   Application** ships the corrected build.

## Manual remediation (facilitator fallback)

```bash
./remediate.sh
```

Sets `RED_BUTTON_MODE=ok` so `/api/red` returns 200. Idempotent.

## Cleanup / re-arm

Re-run `./inject.sh` (which re-asserts `RED_BUTTON_MODE=broken`) to re-arm for another run, or run the
track's **Cleanup** module to delete the resource group.
