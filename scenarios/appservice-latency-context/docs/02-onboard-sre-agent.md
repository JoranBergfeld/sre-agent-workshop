# Onboard SRE Agent

## Objective and starting assets

Connect one SRE Agent to this capsule's Azure resources, telemetry and learner
repository without activating later context starters before the baseline.
Use `.azure/state.json`, the deployment's resource outputs and the
[operations reference](../knowledge/operations.md). Reuse this same agent with
a fresh thread for the later repeat.

**Visible boundary:** select **Reader** when adding the resource-group scope,
not privileged operational access. Scope setup can assign additional monitoring
roles even at Reader level;
review the current [permission model](https://learn.microsoft.com/en-us/azure/sre-agent/permissions)
with your authorized role administrator. Do not equate the product's Reader
label with a guarantee that every enabled connector is read-only. Do not
approve temporary elevation, merge or deployment in this scenario.
Setup creates no SRE Agent and grants no roles.

<details>
<summary>Show exact steps</summary>

1. Follow the current [creation/setup walkthrough](https://learn.microsoft.com/azure/sre-agent/create-and-set-up)
   at `sre.azure.com`: **Create agent** → **Basics** → **Review** → **Deploy**,
   or open your existing sandbox agent. Select the Sandbox subscription, an
   available provider and an agent resource group separate from capsule cleanup.
   The ARM agent resource is `Microsoft.App/agents`.
2. New agents offer **Set up your agent** → **Quickstart** with **Code**, **Logs**
   and **Azure resources** cards. Connect only the learner repository; for Logs
   select this capsule's **Log Analytics Workspace** or **Application Insights**.
   Save/review connector permissions. The creation guide documents the controls;
   tenant authentication choices can vary.
3. In the current new-navigation UI on an existing agent, use **Build + setup**
   → **Context** → **Code access** for repository access and **Managed resources**
   for this capsule's dedicated resource group. In **Extensions** → **Connectors**,
   verify the telemetry connection. Choose resource-group **Reader**, review
   actual role grants with an authorized administrator and avoid broad
   subscription scope. The investigation needs resource/metric reads and
   workspace query access, not App Service writes.
4. Review OAuth/app repository scope and organization policy. Do not expose
   tokens in prompts or evidence files. Open **New chat**. Ask it to list the App Service and workspace
   IDs in the selected group and retrieve a small recent request sample.
   Compare the IDs with deployment outputs and correlation IDs from validation.
5. Record what worked and which permissions/connectors were actually used.
   Do not add learner-authored instructions, skills or tool starters yet;
   built-in capabilities remain the honest baseline.

Navigation labels above were browser-observed on 2026-11-03 on an existing
healthy Sandbox agent; no capsule connection/configuration was changed during
that observation. **Context → Knowledge sources** is for later reference
selection; **Extensions → Custom instructions**, **Skills/Skill builder** and
**Tools** are later customization surfaces. **Monitor → Session insights**,
**Agent consumption** and **Logs** expose monitoring surfaces. Seeing them is
not proof that this capsule's telemetry or usage attribution is connected.

</details>

## Observe and experiment

Check that healthy requests are visible in connected telemetry before fault
injection. Inspect `AppRequests` duration/operation IDs and `AppTraces`
correlated stage records. Facts, permissions and retrieved evidence should be
observable, not inferred from a green connector badge.

Try a smaller resource/time scope rather than granting broader rights.
If GitHub/SRE features are unavailable, continue local investigation and read
the later reference guidance; label it **reference, not observed** and resume
this live connection check when enabled. Configuration alone proves neither
agent behavior nor consumption reduction.

**Troubleshooting:** empty logs can reflect ingestion delay, a daily cap, wrong
workspace/time/role or missing permissions. A 403 requires the administrator's
scope review; do not approve mutation rights as a query workaround. Do not add
a shared agent's resources to the group merely to make cleanup convenient.

Next: [Configure the incident boundary](03-configure-incident-response.md).
