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

**Permissions here:** SRE Agent Administrator is the supported role for general
connector management/approvals; Standard User can chat and connect repositories,
but Author alone cannot do those portal actions. Creation/scope RBAC prerequisites
are [upfront](00-prerequisites.md). The agent UAMI needs app-resource reads and
workspace queries; the operator separately needs query access to the agent's
own Application Insights for later token accounting. Repository access needs
authorized OAuth/app consent and organization SSO/policy where applicable.

<details>
<summary>Show exact steps</summary>

1. Follow the current [creation/setup walkthrough](https://learn.microsoft.com/azure/sre-agent/create-and-set-up)
   at `sre.azure.com`: **Create agent** → **Basics** → **Review** → **Deploy**,
   or open your existing sandbox agent. Select the Sandbox subscription, an
   available provider and an agent resource group separate from capsule cleanup.
   The ARM agent resource is `Microsoft.App/agents`.
2. New agents show **More context. Better investigations** →
   **Quickstart / Full setup**. On **Code → Connect repositories**, the observed
   **Add repositories** dialog first asks for **GitHub** and **Repository URL**;
   entering the URL then reveals OAuth, PAT or own App methods. Authenticate
   directly in the browser, never in chat. Select only your learner repository
   in the list and save. The observed expanded row offered display name and
   description, with **no branch selector**. Confirm the Code card shows the
   connected repository; this does not prove access to unmerged incident code.
3. On **Logs → Connect logs**, choose **Log Analytics Workspace → Next**.
   The observed **Set up Log Analytics connector** form has Name, Subscription,
   Resource group, workspace/resource ID and Managed identity. Select this
   capsule's workspace and the agent UAMI. If the picker cannot find it, choose
   **Can't find your resource? Enter a resource ID**, enter its full ARM ID
   and **Resolve**; confirm the resolved workspace and selected UAMI.
   Then **Next → Review + add → Add connector**, reviewing actual permissions
   before saving. Confirm **1 log provider** (or the expected count if reusing
   an agent). Application Insights is another
   provider in the first-party guide. The guide says saving Azure log connectors
   assigns Log Analytics Reader and Monitoring Reader to the agent identity;
   verify grants and a query result, not only the badge. Built-in Azure query
   tools can also work with suitable RBAC without a persistent connector.
4. In the current new-navigation UI on an existing agent, use **Build + setup**
   → **Context** → **Code access** for repository access and **Managed resources**
   for this capsule's dedicated resource group. In **Extensions** → **Connectors**,
   verify the telemetry connection. Choose resource-group **Reader**, review
   actual role grants with an authorized administrator and avoid broad
   subscription scope. The investigation needs resource/metric reads and
   workspace query access, not App Service writes.
5. Review OAuth/app repository scope and organization policy. Do not expose
   tokens in prompts or evidence files. Open **New chat**. Ask it to list the App Service and workspace
   IDs in the selected group and retrieve a small recent request sample.
   Compare the IDs with deployment outputs and correlation IDs from validation.
6. Supply the actual published branch/commit and branch-specific file links when
   checking code access. Ask the agent which revision it read. Default-branch
   search is not proof it can read an unmerged integration/faulty branch.
   Before baseline handover, separately inspect the GitHub OAuth/MCP connector's
   available issue-creation capability and repository authorization without
   writing a probe issue. No issue creation until the learner's explicit
   approval of one draft in the baseline.
7. Record what worked and which permissions/connectors were actually used.
   Do not add learner-authored instructions, skills or tool starters yet;
   built-in capabilities remain the honest baseline.

Navigation labels were browser-observed on 2026-11-03 on a healthy existing
Sandbox agent and a separately provisioned session-owned agent. On the latter,
repository OAuth/save and **1 repository** were verified; the capsule workspace
connector was resolved by ARM ID, saved with only the agent's own UAMI and
verified as **1 log provider**. Its UI reported Log Analytics Reader granted on
the capsule resource group. Resource onboarding reached **Add resources →
Resource group App or workload → exact resource-group row → Next**, with Reader
selected by default; completing that scope addition was still pending in the
record. Neither a saved connector nor those observations prove telemetry
ingestion/query success or your own connection. **Context → Knowledge sources** is for later reference
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
