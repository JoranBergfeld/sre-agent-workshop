# Deploy and inspect the environment

## Objective and starting assets

Use the paired setup helper and `infra/bicep/main.bicep` to create one owned
environment. App Service Linux runs PHP behind Nginx/PHP-FPM; workspace-backed
Application Insights receives bounded synthetic request/stage events.
Read the [operations reference](../knowledge/operations.md) without opening
fault/reference source if you want to avoid spoilers.

**Visible safety:** use only the authorized sandbox. Setup requires an explicit
subscription UUID. Its default group `alctx-rg` must be dedicated and absent or
owned by this local state. Unknown groups, changed scope and ownership mismatch
are refused. Keep `.azure/state.json`: its random owner tag protects cleanup.
It is not a credential, but losing it prevents automated adoption/deletion.

<details>
<summary>Show exact steps</summary>

Bash, from repository root:

```bash
scenarios/appservice-latency-context/scripts/setup.sh \
  --subscription fa68ebb3-c4c4-4b3f-8c91-cbef4c119d77 \
  --resource-group alctx-rg --location westeurope
scenarios/appservice-latency-context/scripts/validate.sh --expect healthy
```

PowerShell:

```powershell
./scenarios/appservice-latency-context/scripts/setup.ps1 `
  --subscription fa68ebb3-c4c4-4b3f-8c91-cbef4c119d77 `
  --resource-group alctx-rg --location westeurope
./scenarios/appservice-latency-context/scripts/validate.ps1 --expect healthy
```

Use `--state-dir PATH` consistently on **every** command if keeping a second
environment. `--subscription` and `--resource-group` are optional on later
commands; supplied scope must match saved state. `--location` is setup-only. Do not copy another
run's owner token. Never share a resource group between learners.

Setup prints the HTTPS URL. In Azure Portal, open the `alctx-*` App Service,
its Application Insights resource and Log Analytics workspace. Run a bounded
validation once; allow time for startup and ingestion before opening
Application Insights **Logs** / workspace **Logs**. Check `AppRequests` and
`AppTraces` for the printed app role, request IDs, duration and revision.
No telemetry rows means missing evidence, not proof of health.

</details>

## Observe and experiment

Validation makes one order request and three health requests, retaining JSON
observations and correlation IDs in `.azure/observation-*.json`. It checks
runtime state, not learner performance. Healthy low-load requests should be
short relative to the injected state; broad hosting bounds are provisional,
not latency SLOs or proof that a code repair preserved the intended pause.

Repeat setup once: infrastructure reconciles but an existing incident is not
silently reset. Setup never changes tracked `src/` files. Deployment packages
and deployment command results are retained in `.azure/`; deployment metadata
appears on correlated telemetry as `revision` and `prepared_at`. Compare those
with Azure Activity Log, deployment history and local `deployedAt`, not just a
package preparation timestamp.

**Troubleshooting:** failed native commands terminate the helper nonzero.
After a partial setup, keep state and retry the same scope. An existing
unowned group is never adopted. Check `az webapp list-runtimes --os linux`
if the configured `PHP|8.3` is unavailable; do not silently substitute a
language. For startup failures inspect App Service Log stream and deployment
logs; routing uses the packaged Nginx config. For telemetry check the connection,
outbound HTTPS, ingestion delay/cap and reader permissions. No Azure resource
is provisioned by local tests.

Lifecycle operations serialize through `.azure/.operation-lock`. If a process
was interrupted, verify no operation remains running before manually removing
that empty lock directory; never bypass a live operation's lock. A failed
partial setup remains cleanable using the same ownership state. Recreating an
absent group with setup deploys a fresh known baseline, not an old incident.

Optional post-PR deployment is **outside** measured comparison. Only after
human review/merge, update your checkout and use `deploy.sh` / `deploy.ps1`
with `--reviewed yes --source-dir scenarios/appservice-latency-context/src`.
This exports evidence first and deploys reviewed tracked source, not a fixture.
Independently validate runtime afterward; a tested PR alone is not recovery.

Next: [Onboard SRE Agent](02-onboard-sre-agent.md).
