# Incident-Response Docs Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the three incident-response ("Break It") module docs so every real scenario is discoverable via the generated catalog, and fix verified factual drift (alert names, a nonexistent App Service SQL fault), using a catalog-defer pattern with one illustrative example per track.

**Architecture:** Docs-only edits to three Markdown files. Each edit replaces stale/single-scenario prose with (a) an accurate, drift-resistant description of the alert model and (b) a pointer to the generated `## Scenarios` catalog plus one short illustrative example. No code, Bicep, tooling, or generated-artifact changes.

**Tech Stack:** Markdown docs; `scripts/validate-scenarios.sh` as a drift guard; `git` with required commit trailers.

**Spec:** `docs/superpowers/specs/2026-07-14-incident-response-docs-reconciliation-design.md`

---

## Conventions for every commit

Every `git commit` in this plan MUST include these two trailers (use `--trailer`):

```
--trailer "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
--trailer "Copilot-Session: efa82c06-a2b1-4dd5-9849-e3e1adc38238"
```

Work on branch `docs/incident-response-catalog-reconciliation` (already checked out).

## Verified facts (do not re-derive)

- Each track README has a `## Scenarios` heading → anchor `#scenarios`. From any doc under
  `workshops/<track>/docs/`, the catalog link is `../README.md#scenarios`.
- Scenario READMEs (relative to the docs dir): aks `../scenarios/cosmos-rbac-removal/README.md`,
  `../scenarios/workload-identity-break/README.md`; appservice `../scenarios/red-button-500/README.md`,
  `../scenarios/canary-bad-release/README.md`; vm `../scenarios/disk-full/README.md`.
- **AKS** `main.bicep` defines exactly ONE base alert: `srelab-container-restarts` (queries
  `KubePodInventory`). Scenario alerts (via aggregator): `srelab-http-500-errors` (cosmos-rbac-removal)
  and `srelab-workload-identity-auth-errors` (workload-identity-break), both query `ContainerLog`.
- **App Service** `main.bicep` defines NO base alerts. All alerts come from scenarios and query
  Application Insights `AppRequests`. Default `workloadName=srelabapp` → `srelabapp-canary-5xx`
  (canary-bad-release) and `srelabapp-redbutton-5xx` (red-button-500).
- **File structure** (all edits are in-place; no files created/deleted):
  - Modify: `workshops/aks/docs/04-configure-incident-response.md`
  - Modify: `workshops/appservice/docs/04-configure-incident-response.md`
  - Modify: `workshops/vm/docs/02-configure-incident-response.md`

---

### Task 1: AKS incident-response doc

**Files:**
- Modify: `workshops/aks/docs/04-configure-incident-response.md`

- [ ] **Step 1: Fix the "Verify Alert Rules Exist" list + callout**

Replace this exact block:

```markdown
You should see two alert rules:
- **`srelab-container-restarts`** — fires when any container restarts more than 3 times in 5 minutes (queries `KubePodInventory`)
- **`srelab-http-500-errors`** — fires when the app returns repeated HTTP 500 errors (queries `ContainerLog`)

> **Why log-based alerts?** AKS doesn't expose a native `restart_count` metric for `az monitor metrics alert`. Instead, our Bicep uses `Microsoft.Insights/scheduledQueryRules` to query the `KubePodInventory` and `ContainerLog` tables in Log Analytics — this is the standard approach for container-level alerting in AKS.
```

with:

```markdown
What you see is the **base** alert plus **one alert per scenario** (each scenario wires its own alert through the generated aggregator):

- **`srelab-container-restarts`** (base, always deployed) — fires when any container restarts more than 3 times in 5 minutes (queries `KubePodInventory`).
- **One alert per scenario.** For example, `cosmos-rbac-removal` adds `srelab-http-500-errors` and `workload-identity-break` adds `srelab-workload-identity-auth-errors` (both query `ContainerLog`).

The always-current list of scenarios and their alerts lives in the [Scenarios catalog](../README.md#scenarios).

> **Why log-based alerts?** AKS doesn't expose a native `restart_count` metric for `az monitor metrics alert`. Instead, our Bicep uses `Microsoft.Insights/scheduledQueryRules` to query the `KubePodInventory` and `ContainerLog` tables in Log Analytics — this is the standard approach for container-level alerting in AKS.
```

- [ ] **Step 2: Reframe "What Happens Next" to catalog-defer (keep cosmos as the example)**

Replace this exact block:

```markdown
In **Module 5: Break It**, we'll intentionally introduce a fault by editing the Bicep template to remove the CosmosDB role assignment. When the change deploys:

1. The app will start failing to authenticate to CosmosDB
2. Azure Monitor will detect the error spike
3. The SRE Agent will pick up the alert and begin investigating
4. In **Module 6: Watch SRE Agent**, you'll observe the agent's investigation in real time

Now that incident response is configured, you're ready to introduce the fault.
```

with:

```markdown
In **Module 5: Break It**, you'll intentionally inject a fault, then watch the SRE Agent detect and diagnose it. Each Break It scenario is self-contained — pick one from the [Scenarios catalog](../README.md#scenarios) and follow its README (inject → validate → let the agent remediate → clean up).

As an example, the [`cosmos-rbac-removal`](../scenarios/cosmos-rbac-removal/README.md) scenario edits the Bicep template to remove the CosmosDB role assignment. When the change deploys:

1. The app will start failing to authenticate to CosmosDB
2. Azure Monitor will detect the error spike
3. The SRE Agent will pick up the alert and begin investigating
4. In **Module 6: Watch SRE Agent**, you'll observe the agent's investigation in real time

Now that incident response is configured, you're ready to introduce the fault.
```

- [ ] **Step 3: Reframe the "Next Step" pointer to the catalog**

Replace this exact block:

```markdown
## Next Step

→ [Module 5: Break It](../scenarios/cosmos-rbac-removal/README.md)
```

with:

```markdown
## Next Step

→ **Module 5: Break It** — choose a scenario from the [Scenarios catalog](../README.md#scenarios). New to the workshop? Start with [`cosmos-rbac-removal`](../scenarios/cosmos-rbac-removal/README.md).
```

- [ ] **Step 4: Verify no stale claims remain and links resolve**

Run:

```bash
cd /home/jbergfeld/vcs/sre-agent-workshop
grep -nE "two alert rules|srelab-http-500-errors" workshops/aks/docs/04-configure-incident-response.md || echo "OK: no stale count/label"
for p in README.md scenarios/cosmos-rbac-removal/README.md scenarios/workload-identity-break/README.md; do
  test -f "workshops/aks/$p" && echo "OK: $p" || echo "MISSING: $p"
done
```

Expected: `OK: no stale count/label`, then three `OK:` lines (all link targets exist). `workload-identity-break` is now reachable through the catalog link even though it is not named in the example prose.

- [ ] **Step 5: Commit**

```bash
git add workshops/aks/docs/04-configure-incident-response.md
git commit \
  --trailer "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  --trailer "Copilot-Session: efa82c06-a2b1-4dd5-9849-e3e1adc38238" \
  -m "docs(aks): reconcile incident-response module with scenario catalog"
```

---

### Task 2: App Service incident-response doc

**Files:**
- Modify: `workshops/appservice/docs/04-configure-incident-response.md`

- [ ] **Step 1: Fix the "Verify Alert Rules Exist" intro sentence**

Replace this exact line:

```markdown
Your App Service should already have alert rules from the Bicep deployment in Module 1. These are **log-based (scheduled query) alerts** that query the Log Analytics workspace — not metric-based alerts.
```

with:

```markdown
On this track there are **no base alerts** — every alert is contributed by a Break It scenario and wired automatically through the generated aggregator when you deploy the infrastructure. These are **log-based (scheduled query) alerts** that query Application Insights — not metric-based alerts.
```

- [ ] **Step 2: Fix the alert-list line + the "Why log-based alerts?" callout**

Replace this exact block:

```markdown
You should see alert rules for HTTP 500 errors and App Service restarts, wired to query `AppServiceConsoleLogs` and `AppServiceHTTPLogs` in Log Analytics.

> **Why log-based alerts?** App Service doesn't expose a native `restart_count` metric suitable for `az monitor metrics alert`. Instead, Bicep uses `Microsoft.Insights/scheduledQueryRules` to query the `AppServiceConsoleLogs` and `AppServiceHTTPLogs` tables in Log Analytics — this is the standard approach for application-level alerting in App Service.
```

with:

```markdown
You'll see **one alert per scenario**, each querying the Application Insights `AppRequests` table. For example, `canary-bad-release` adds `srelabapp-canary-5xx` and `red-button-500` adds `srelabapp-redbutton-5xx`. The always-current list of scenarios lives in the [Scenarios catalog](../README.md#scenarios) — each scenario contributes its own alert.

> **Why log-based alerts?** These alerts query the Application Insights `AppRequests` table via `Microsoft.Insights/scheduledQueryRules`, so they fire on real HTTP 5xx responses regardless of how the app logs internally — the standard approach for request-level alerting on App Service.
```

- [ ] **Step 3: Fix the "If the list is empty" note**

Replace this exact line:

```markdown
If the list is empty, re-run the **Deploy App Service Infrastructure** workflow from Module 1 — the alerts are defined in `workshops/appservice/infra/bicep/main.bicep`.
```

with:

```markdown
If the list is empty, re-run the **Deploy App Service Infrastructure** workflow from Module 1 — scenario alerts are generated into `workshops/appservice/infra/bicep/modules/scenario-alerts.bicep` and deployed with the infrastructure.
```

- [ ] **Step 4: Replace the stale SQL narrative in "How It All Connects"**

Replace this exact paragraph:

```markdown
In your case, when the app starts failing in Module 5, Azure Monitor will detect the spike in errors. The SRE Agent will pick up the alert, query the app's logs, see authentication failures, check the Bicep deployment history, find the removed SQL grant, and either propose or automatically open a PR to restore it.
```

with:

```markdown
For example, when you run the `red-button-500` scenario in Module 5, clicking the red button makes the app return HTTP 500s and Azure Monitor detects the spike. The SRE Agent picks up the alert, queries the app's logs and request telemetry to pinpoint the failing endpoint, and drives the fix through this track's GitHub flow (issue → PR → deploy).
```

- [ ] **Step 5: Replace the stale SQL narrative in "What Happens Next"**

Replace this exact block:

```markdown
In **Module 5: Break It**, we'll intentionally introduce a fault by editing the Bicep template to remove the managed-identity SQL grant. When the change deploys:

1. The app will start failing to authenticate to Azure SQL
2. Azure Monitor will detect the error spike
3. The SRE Agent will pick up the alert and begin investigating
4. In **Module 6: Watch SRE Agent**, you'll observe the agent's investigation in real time

Now that incident response is configured, you're ready to introduce the fault.
```

with:

```markdown
In **Module 5: Break It**, you'll intentionally inject a fault, then watch the SRE Agent detect and diagnose it. Each Break It scenario is self-contained — pick one from the [Scenarios catalog](../README.md#scenarios) and follow its README (inject → validate → let the agent remediate → clean up).

As an example, the [`red-button-500`](../scenarios/red-button-500/README.md) scenario serves a minimal two-button page whose red button triggers an HTTP 500. When you inject it:

1. Clicking the red button makes the app return HTTP 500 errors
2. Azure Monitor will detect the error spike
3. The SRE Agent will pick up the alert and begin investigating
4. In **Module 6: Watch SRE Agent**, you'll observe the agent's investigation in real time

Now that incident response is configured, you're ready to introduce the fault.
```

- [ ] **Step 6: Replace the "Next Step" placeholder**

Replace this exact block:

```markdown
## Next Step

→ **Module 5: Break It** — the break scenario for this track is published separately under
`workshops/appservice/scenarios/`. Once a scenario is available, follow its README to inject the
fault, then return here. In the meantime, preview what the agent does in
[Module 6: Watch the SRE Agent](./90-watch-sre-agent.md).
```

with:

```markdown
## Next Step

→ **Module 5: Break It** — choose a scenario from the [Scenarios catalog](../README.md#scenarios) and follow its README to inject the fault, then return here. New to the workshop? Start with [`red-button-500`](../scenarios/red-button-500/README.md) — a minimal two-button page whose red button triggers an HTTP 500, the fastest way to see the agent work end-to-end.
```

> Note: dropping the inline `90-watch-sre-agent.md` link here is intentional — it mirrors the AKS "Next Step" (which points only to Break It), and Module 6 remains reachable from each scenario README and normal doc navigation.

- [ ] **Step 7: Verify no stale claims remain and links resolve**

Run:

```bash
cd /home/jbergfeld/vcs/sre-agent-workshop
grep -niE "SQL|AppServiceConsoleLogs|AppServiceHTTPLogs|App Service restarts|published separately|once a scenario is available" workshops/appservice/docs/04-configure-incident-response.md || echo "OK: no stale narrative"
for p in README.md scenarios/red-button-500/README.md scenarios/canary-bad-release/README.md; do
  test -f "workshops/appservice/$p" && echo "OK: $p" || echo "MISSING: $p"
done
```

Expected: `OK: no stale narrative`, then three `OK:` lines.

- [ ] **Step 8: Commit**

```bash
git add workshops/appservice/docs/04-configure-incident-response.md
git commit \
  --trailer "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  --trailer "Copilot-Session: efa82c06-a2b1-4dd5-9849-e3e1adc38238" \
  -m "docs(appservice): fix alert model + replace nonexistent SQL fault narrative"
```

---

### Task 3: VM incident-response doc

**Files:**
- Modify: `workshops/vm/docs/02-configure-incident-response.md`

- [ ] **Step 1: Append a catalog on-ramp at the end of the file**

The file currently ends with this exact line:

```markdown
No remediation action runs without an approval prompt and valid ticket format.
```

Append the following section immediately after that line (leave one blank line between them):

```markdown
## Next Step

Choose a scenario from the [Scenarios catalog](../README.md#scenarios) and follow its README to inject the fault, then remediate with the approval-gated action above. New to the VM track? Start with [`disk-full`](../scenarios/disk-full/README.md), which fills the `C:` drive until the disk-pressure alert fires.
```

Do NOT change anything else in this file — the approval-gated execution section, the remediation-actions table, the `Invoke-ApprovedRemediation` example, and the "No GitHub issue logging on this track" callout must remain exactly as they are.

- [ ] **Step 2: Verify links resolve and nothing else changed**

Run:

```bash
cd /home/jbergfeld/vcs/sre-agent-workshop
for p in README.md scenarios/disk-full/README.md; do
  test -f "workshops/vm/$p" && echo "OK: $p" || echo "MISSING: $p"
done
git --no-pager diff --stat workshops/vm/docs/02-configure-incident-response.md
```

Expected: two `OK:` lines; the diffstat shows only additions (the appended section), no deletions.

- [ ] **Step 3: Commit**

```bash
git add workshops/vm/docs/02-configure-incident-response.md
git commit \
  --trailer "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  --trailer "Copilot-Session: efa82c06-a2b1-4dd5-9849-e3e1adc38238" \
  -m "docs(vm): add scenario-catalog on-ramp to incident-response module"
```

---

### Task 4: Repository-wide validation guard

**Files:** none (verification only).

- [ ] **Step 1: Confirm the scenario tooling still passes with zero drift**

Run:

```bash
cd /home/jbergfeld/vcs/sre-agent-workshop
scripts/validate-scenarios.sh
```

Expected: prints `Scenario validation passed`. Because this change is docs-only, it must NOT report any stale generated artifact (INDEX.md, aggregator, or README table). If it reports drift, a non-docs file was touched by mistake — investigate before proceeding.

- [ ] **Step 2: Confirm only the three doc files changed on this branch**

Run:

```bash
cd /home/jbergfeld/vcs/sre-agent-workshop
git --no-pager diff --stat main -- workshops/
```

Expected: exactly three files, all under `workshops/*/docs/`:
- `workshops/aks/docs/04-configure-incident-response.md`
- `workshops/appservice/docs/04-configure-incident-response.md`
- `workshops/vm/docs/02-configure-incident-response.md`

No Bicep, scenario.yaml, INDEX.md, README, or tooling files may appear.

- [ ] **Step 3: Final cross-doc drift scan**

Run:

```bash
cd /home/jbergfeld/vcs/sre-agent-workshop
echo "== hardcoded counts / stale labels =="
grep -rniE "two alert rules|AppServiceConsoleLogs|AppServiceHTTPLogs|removed SQL grant|Azure SQL|published separately" \
  workshops/aks/docs/04-configure-incident-response.md \
  workshops/appservice/docs/04-configure-incident-response.md \
  workshops/vm/docs/02-configure-incident-response.md || echo "OK: none found"
echo "== each edited doc links the catalog =="
grep -lE "\.\./README\.md#scenarios" \
  workshops/aks/docs/04-configure-incident-response.md \
  workshops/appservice/docs/04-configure-incident-response.md \
  workshops/vm/docs/02-configure-incident-response.md
```

Expected: `OK: none found`, then all three doc paths listed (each links the catalog).

---

## Self-Review (completed by plan author)

- **Spec coverage:** Task 1 covers the AKS "Verify Alert Rules" + "What Happens Next" + "Next Step"
  changes. Task 2 covers the App Service "Verify Alert Rules" + "How It All Connects" + "What Happens
  Next" + "Next Step" changes (including the folded-in SQL-narrative fix). Task 3 covers the VM catalog
  on-ramp with the `disk-full` example. Task 4 covers the spec's Validation section (validate-scenarios,
  no-count/no-SQL scan, link resolution, docs-only guard). All illustrative examples match the spec's
  table (aks→cosmos-rbac-removal, appservice→red-button-500, vm→disk-full).
- **Placeholder scan:** No TBD/TODO; every step contains the exact replacement text and exact commands.
- **Consistency:** Alert names match the manifests/Bicep (`srelab-container-restarts`,
  `srelab-http-500-errors`, `srelab-workload-identity-auth-errors`, `srelabapp-canary-5xx`,
  `srelabapp-redbutton-5xx`). Catalog link `../README.md#scenarios` and all scenario README paths are
  verified to exist. No SQL/Azure SQL references remain in any replacement text.
