# Deploy and inspect the environment

## Objective and starting assets

Use the paired setup helper and `infra/bicep/main.bicep` to provision one owned
environment. App Service Linux runs PHP behind Nginx/PHP-FPM; workspace-backed
Application Insights receives bounded synthetic request/stage events.
Read the [operations reference](../knowledge/operations.md) without opening
fault/reference source if you want to avoid spoilers.

**Visible safety:** use only the authorized sandbox. Setup requires an explicit
subscription UUID. Its default group `alctx-rg` must already exist, be empty
and designated for this scenario, or be owned by this local state.
Tooling never creates a resource group. Unknown groups, changed scope and ownership mismatch
are refused. Keep `.azure/state.json`: its random owner tag protects cleanup.
It is not a credential, but losing it prevents automated adoption/deletion.

<details>
<summary>Show exact steps</summary>

Bash, from repository root:

```bash
# Operator action, once: use only your authorized, dedicated sandbox group.
az group create --subscription fa68ebb3-c4c4-4b3f-8c91-cbef4c119d77 \
  --name alctx-rg --location westeurope \
  --tags sre-workshop-scenario=appservice-latency-context --output none
scenarios/appservice-latency-context/scripts/setup.sh \
  --subscription fa68ebb3-c4c4-4b3f-8c91-cbef4c119d77 \
  --resource-group alctx-rg --location westeurope
scenarios/appservice-latency-context/scripts/validate.sh --expect healthy
```

PowerShell:

```powershell
# Operator action, once; do not retag an unknown or shared group.
az group create --subscription fa68ebb3-c4c4-4b3f-8c91-cbef4c119d77 `
  --name alctx-rg --location westeurope `
  --tags sre-workshop-scenario=appservice-latency-context --output none
./scenarios/appservice-latency-context/scripts/setup.ps1 `
  --subscription fa68ebb3-c4c4-4b3f-8c91-cbef4c119d77 `
  --resource-group alctx-rg --location westeurope
./scenarios/appservice-latency-context/scripts/validate.ps1 --expect healthy
```

Use `--state-dir PATH` consistently on **every** command if keeping a second
environment. `--subscription` and `--resource-group` are optional on later
commands; supplied scope must match saved state. `--workload alctx` is the
default workload label. `--location` selects a workload preference, not the
SRE Agent region. Do not copy another
run's owner token. Never share a resource group between learners.

Before any Azure mutation, setup/deploy run the read-only, ownership-gated shared
placement check with `--require-group`, then resolve the exact-commit
artifact (healthy by default). The resolver discovers repository identity
from Git origin, not bare `gh` defaults. Only after both succeed do the helpers
register providers and run shared placement deployment with an outputs file.
They never silently build
locally when artifact verification fails.

West Europe is preferred, followed by Sweden Central, East US 2 and Australia
East, subject to live PHP 8.3/Linux B1 and provider eligibility. Existing
deployments stay pinned to their actual workload region; resource-group
metadata location does not select SRE Agent placement.

If the resolver reports no exact-source build, follow its workflow dispatch
command in the origin repository for the current branch/tag (not a raw SHA),
wait for success and retry. A dirty deployable checkout, expired artifact,
wrong commit, provenance mismatch or checksum mismatch fails closed.
To deliberately package the current local sources instead, add `--local-build`
to either shell's setup, inject, reset or deploy command. Known healthy/faulty
local packages still select their corresponding timing fixture.

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
and safe commit/variant provenance are retained in `.azure/`; raw deployment
responses are not retained because they can contain credential-bearing URLs.
Deployment metadata
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
The operator must first recreate and designate that group; setup itself
never recreates it. Infrastructure reruns merge existing App Service settings
so dynamically set run-from-package settings survive.

Ordinary `deploy.sh` / `deploy.ps1` defaults to the verified healthy artifact;
`--variant faulty` selects the exact-commit faulty artifact. Injection selects
faulty and reset selects healthy. Reset/deploy export evidence before uploading;
if evidence export fails, no package is uploaded. Repeated setup reconciles
infrastructure without replacing an already deployed incident.
Deploy also reconciles infrastructure through shared placement, after its
evidence export; inject/reset change only the application package.

Optional post-PR deployment is **outside** measured comparison. Only after
human review/merge, update your checkout to the exact commit on `main` and
explicitly confirm that review:

```bash
scenarios/appservice-latency-context/scripts/deploy.sh --reviewed yes
```

PowerShell uses the same `--reviewed yes` option. This resolves the
`reviewed-source` artifact only when its successful build is bound to the exact
current HEAD and the resolver verifies its build ref is `refs/heads/main`.
The artifact's name or contents do **not** constitute human review; the
operator's explicit confirmation is still required. If no trusted artifact
exists for that exact main commit, deployment fails closed.

To keep the explicit local packaging route, pass both `--reviewed yes` and
`--source-dir scenarios/appservice-latency-context/src`. This packages the
provided reviewed source locally instead of resolving the artifact; it still
passes the ownership/placement check before preparing its package. A
`--source-dir` without `--reviewed yes` is rejected. Independently validate
runtime afterward; a tested PR alone is not recovery.

Next: [Onboard SRE Agent](02-onboard-sre-agent.md).
