# Author and exercise SRE investigation context

Start **after [the baseline](04-baseline.md)**, with its issue, unmerged fix PR
and evidence preserved. Keep using the same SRE Agent. This is customization
overhead, not the second measured incident pass.

**Visible boundaries:** synthetic data only; no agent Azure mutations, extra
load, merge or deployment. Queries and chats can incur metered usage. Use one
short completed UTC window, not workspace-wide exploration. Preserve evidence
before reset; a reset is not code repair. The starters are intentionally
incomplete and inactive. Nothing installs them automatically.

| Context kind | Put here | Observe separately |
| --- | --- | --- |
| Instructions | Behavior, evidence requirements, stopping rules | Saved guidance versus behavior followed |
| Skill | Reusable investigation procedure | Activation and procedure actually used |
| Knowledge | Architecture/operations facts | Indexed document versus retrieved content |
| Tool | Validated inputs and bounded read-only execution | Attached tool versus invocation/results |

No separate specialist is required. Neither a fresh thread nor a specialist
proves an isolated context window. Do not assume every core capability can be
disabled; preserve the baseline's actual capability/permission record.

## 1. Author investigation behavior

**Objective:** express hypotheses, evidence standards and stopping conditions
without writing a repair answer.

**Starting assets:** [instruction starter](../context/sre/instructions.starter.md),
the baseline initiating prompt and recorded scope. You need SRE Agent
Author/Administrator access to edit the agent; this does not grant telemetry
access. Save existing custom instructions before changing them.

**Explanation:** always-on instructions shape behavior across investigations.
Keep architecture facts in retrievable knowledge and ordered procedures in the
skill rather than pasting everything into the instruction textbox.

**Experiment:** fill every TODO yourself. Try two plausible hypotheses and name
one observation that could overturn each. Choose a finite call budget (for
example two calls, no blind retries) and a missing-evidence stopping condition.
Compare this draft with your baseline: what could it change, and what cannot it
establish?

**Observe:** a saved version and scope are configuration evidence only. Later
inspect whether claims cite data and the agent stops at its stated boundary.

**Troubleshoot:** if editing is unavailable, check your role on this agent, not
Owner rights across a subscription. If guidance conflicts, preserve unrelated
rules and resolve the conflict before a chat. If access remains unavailable,
keep the completed local draft, label it **not installed**, continue to the
handover checkpoint and resume here when Author access is available.

<details>
<summary>Show exact steps</summary>

1. Open the same agent at `https://sre.azure.com`.
2. Under **Build + setup > Extensions > Custom instructions**, copy existing
   text somewhere learner-owned before editing.
3. Open `context/sre/instructions.starter.md` relative to the capsule. Complete
   hypotheses, discriminating evidence, stopping rule and output format. Remove
   the draft wrapper/TODOs; keep its approval/mutation boundaries.
4. Append or deliberately reconcile your completed guidance in the
   **Instructions** textbox. Keep within the displayed limit (observed:
   16,384 bytes). Select **Save changes**. Record the changed version and time.
5. Do not rerun the measured incident yet. Continue to tool configuration.

</details>

<details>
<summary>Reference: configuration is not uptake</summary>

A saved hypothesis/evidence rule proves only that it is configured. A later
answer that names a hypothesis but has no matching tool result still lacks
evidence. Compare the trace with the rule, not exact AI wording.

</details>

## 2. Configure bounded KQL execution against this capsule

**Objective:** return concise latency/error summaries plus limited correlated
request/stage samples from the **actual Log Analytics-backed Application
Insights resource**, not a new database.

**Starting assets:** [guarded Python KQL tool](../investigation/query-latency.py),
[manual bounded query](../investigation/latency-window.kql), setup outputs and
[operations facts](../knowledge/operations.md). Obtain `workspaceId` (GUID),
`insightsResourceId` and `appName` from the capsule's
`alctx-infrastructure` deployment outputs. Use the same subscription and
`alctx-*` resource group as setup. Never paste connection strings or tokens.

**Permissions and availability:** the query identity needs read access to the
workspace and the `AppRequests`/`AppTraces` tables, for example Log Analytics
Reader on this workshop workspace. Your own Logs access is not the agent
identity's access. An authorized role administrator grants only the required
scope; Author on the agent alone is insufficient. Verify the Log Analytics
connection targets this workspace, not the agent's own diagnostic workspace.

**Important current product constraint:** the **Kusto tool** form is for an
**Azure Data Explorer connector**, not a Log Analytics connector. Do not select
an imaginary LA connector or provision ADX for this exercise. The Python tool
Identity tab supports a **custom token scope URL**, observed in the live UI
on 2026-11-03, in addition to the documented ARM, Key Vault and Storage presets.
Configure the Log Analytics scope below; remove the unnecessary default ARM
scope. An ARM token is not a Log Analytics audience token. The legacy ARM LA
`/api/query?api-version=2017-01-01-preview` route is deprecated; current
Microsoft guidance says migrate to the direct `v1` API.

The supplied wrapper therefore uses the current endpoint:

```text
POST https://api.loganalytics.azure.com/v1/workspaces/{workspaceId}/query
Token scope: https://api.loganalytics.io/.default
```

It requests that scope with `DefaultAzureCredential`, using the configured
identity environment, never a secret. **Verified control; unverified execution:**
the custom scope entry and removal controls were observed, but accepted scope
configuration, token acquisition, live KQL execution and chat invocation still
require an actual test. A successful tool creation or syntax test alone is not
accepted Log Analytics execution. If your tenant lacks the custom scope control
or execution fails, preserve the specific gap and follow the fallback below.

**Explanation of executable bounds:** resource inputs must match the capsule
prefix, Insights component and app name; workspace must be a GUID. There is no
query/URL argument. KQL filters the exact Insights `_ResourceId`, app role and
two fixed routes. A completed window must be within the last 24 hours and at
most 15 minutes. `sample_limit` is an integer 1–10: at most two summaries,
10 request samples and 10 correlated completed-stage samples (22 rows total).
It projects structured fields, not free-text logs. The API has a 20-second
server wait, 5/25-second connect/read timeouts, a 30-second streaming deadline
and 64 KiB response ceiling. No redirects or automatic query retries. Partial,
oversized or malformed results are unavailable, never complete evidence.
These guards bound this tool, not all other agent tools.

**Experiment:** first try an excessive sample count or a 16-minute window.
Expect `invalid_input` before identity/network access. Then use an explicit
completed five-minute UTC window and three samples. Check scope, units
(`DurationMs`), errors and correlation, not only whether the tool returns green.
Small-sample percentiles are descriptive, not a service-level objective.

**Observe:** preserve parameter values, result status, HTTP status if supplied,
returned summary/sample rows and gaps. `no_data` means no evidence, not healthy.
Even `ok` can report a missing route or stage sample. A limited sample cannot
prove every request behaved the same, and proximity to a deployment is not
causation. Deployment completion must come from separate deployment/Activity
Log evidence, not package preparation time.

**Troubleshoot and continue:**

- `invalid_input`: correct resource names or UTC bounds; do not loosen guards.
- `log_analytics_identity_unavailable`: check **Enable Azure Identity** and
  confirm the exact custom LA scope is present under **Configured Scopes**.
  Inspect whether the form accepted it and the authentication snippet uses that
  scope. Default ARM alone is insufficient. Distinguish configuration/token
  failure from workspace RBAC; never add a client secret or change the endpoint
  to bypass the failure.
- HTTP 401/403: distinguish wrong audience from workspace/table RBAC. Confirm
  the caller identity and exact workspace. Do not grant Contributor to query logs.
- Empty results: check resource/role filters, telemetry export, ingestion delay,
  daily caps and a completed observation window. Query availability is not
  evidence that ingestion occurred.
- HTTP 429/5xx/timeout or partial output: preserve the failure. Wait or resume
  once service/permissions are corrected; do not loop or widen to all resources.

**Fallback/resume:** use the manual query in **Azure portal > this Log Analytics
workspace > Logs > KQL mode**, or an already supported connected Log Analytics
query capability. It returns at most two summaries and three request samples.
Record manual/alternate execution and its caller separately from custom-tool
use; stage/deployment evidence remains a gap until separately obtained. Continue
authoring the skill and handover; resume the same bounded tool test after the
identified configuration, permission or execution issue is resolved. Reference
output never counts as an observed invocation.

<details>
<summary>Show exact steps</summary>

1. Read the three nonsensitive deployment outputs. Either shell:

   ```bash
   az deployment group show --resource-group <your-alctx-group> \
     --name alctx-infrastructure --query properties.outputs --output json
   ```

   ```powershell
   az deployment group show --resource-group <your-alctx-group> `
     --name alctx-infrastructure --query properties.outputs --output json
   ```

   Replace angle-bracket arguments before running. Confirm the selected
   subscription with `az account show --query id --output tsv`.
2. In **Build + setup > Context > Managed resources** and the agent's
   **Connectors**, inspect the scope/Log Analytics workspace and identity.
   Ask the authorized administrator to verify read access on this exact
   workspace and tables. Do not change unrelated connections.
3. Open **Build + setup > Workflows > Agent Canvas > Create > Tool >
   Python tool**, not Kusto tool. Description:
   “Read bounded order/health latency and error summaries with correlated stage
   samples from the learner-supplied capsule scope; no mutations.”
4. Paste the complete `investigation/query-latency.py` into **Code**. Keep the
   guards; do not replace them with generated free-form execution. `requests`
   and `azure-identity` are documented as preinstalled.
5. Select **Identity > Enable Azure Identity**. Under **Token Scopes**, inspect
   **Configured Scopes**. Use **Remove scope** on the default ARM entry; this
   read-only wrapper needs only the LA audience. In **Enter scope URL
   (e.g., https://example.com/.default)**, enter
   `https://api.loganalytics.io/.default`, then select the **adjacent add button**
   (observed without an accessible name). Confirm the exact LA URL appears in
   **Configured Scopes**. Enabling identity injects a `DefaultAzureCredential`
   and `credential.get_token(scope)` example: keep the wrapper's LA-scoped
   credential call, not duplicate sample code or token-printing statements.
   Record whether the form accepts the scope; entry controls alone do not prove
   acceptance or token acquisition. If these controls are absent in your tenant,
   record the UI difference and use the fallback. No new resource or secret is
   needed.
6. Use **Test playground** with `workspace_id`, `insights_resource_id`, `app_name`,
   `start_utc`, `end_utc`, `sample_limit`. Times look like
   `2026-11-03T08:30:00Z`, but use your actual recent observation window, not
   this example date. First test `sample_limit=11`; then test `3` with valid
   scope. Save only after inspecting returned data/status and bounds.
7. Select **Create tool**. Record the tool's actual saved name. A playground
   result is a direct tool test; later chat use must be observed separately.
8. Fallback: open `investigation/latency-window.kql`; replace only its two scope
   literals with setup outputs, keep its five-minute window/output caps, and
   run in this workspace's Logs. Unedited literals intentionally match nothing.
   Preserve the query, UTC execution time, caller and result as **manual
   evidence**, not custom-tool uptake.

</details>

<details>
<summary>Reference: first-party contracts and evidence limits</summary>

Checked 2026-11-03:

- [Create Python tool](https://learn.microsoft.com/azure/sre-agent/create-python-tool)
  documents Code, Test playground and Identity.
- [Python execution](https://learn.microsoft.com/azure/sre-agent/python-code-execution)
  documents packages, outbound networking and ARM/Key Vault/Storage scopes;
  live UI additionally exposes custom scope entry, so the preset list is not
  an exhaustive list of configurable audiences.
- [Create Kusto tool](https://learn.microsoft.com/azure/sre-agent/create-kusto-tool)
  requires ADX and a Kusto connector.
- [Log API authentication](https://learn.microsoft.com/azure/azure-monitor/logs/api/access-api),
  [request format](https://learn.microsoft.com/azure/azure-monitor/logs/api/request-format)
  and [timeouts](https://learn.microsoft.com/azure/azure-monitor/logs/api/timeouts)
  establish the direct API, audience and wait header.
- [Migration guidance](https://learn.microsoft.com/azure/azure-monitor/logs/api/migrate-batch-and-beta)
  explicitly moves ARM LA queries to direct `v1`; beta support ended
  2026-03-31.

Live UI observation confirmed the Create > Tool choices, the ADX-only Kusto
form (its connector dropdown omitted an existing LA connector), and Python
**Identity > Enable Azure Identity > Token Scopes**, including custom scope URL
entry and removal of configured scopes. This is verified control evidence, not
accepted scope configuration, token acquisition, saved-tool acceptance or query
execution; those remain unverified execution until tested.
Local guard/response tests use controlled external boundaries; they do not prove
tenant access, KQL compilation or connected invocation. Preserve your own live
acceptance/error evidence, including unavailable capabilities.

</details>

## 3. Adapt the skill, choose facts and inspect actual use

**Objective:** distinguish installed context from context actually used in a
bounded investigation.

**Starting assets:** [latency skill starter](../context/sre/latency-investigation/SKILL.starter.md),
your completed instructions, the tested tool (or explicit availability gap),
and [operations reference](../knowledge/operations.md). Author/Administrator
permissions are required for tools/skills. Knowledge upload requires write
access and available Knowledge sources on this agent.

**Explanation:** the skill defines the procedure; select only the short
operations facts you need as retrievable knowledge. Uploading the entire
baseline conversation or its fix PR can leak the answer into the later run.
This procedure is not a prewritten diagnosis. An indexed document, selected tool
or skill node does not prove retrieval or activation.

**Experiment:** finish the TODOs and select a small initial query budget. Ask
one architecture question that requires the chosen facts, then one bounded
latency investigation question. Use an existing observation window; do not
inject new traffic or start an issue/PR during this rehearsal. Inspect whether
the skill selects evidence that could distinguish your hypotheses. Optional
alternative: narrow the time/sample selection without changing guards; retain
what evidence disappeared, not just output length.

**Observe:** separately record (1) saved instruction/skill versions and selected
tool, (2) indexed reference, (3) visible skill activation, (4) actual tool name,
arguments and rows/status, (5) retrieved document/source excerpt where exposed,
and (6) facts, rejected hypotheses and remaining gaps. If a trace does not expose
retrieval or activation, label **not observable**, not “used.” An answer citing a
document is weaker evidence than a visible retrieval trace. Keep rehearsal
usage separate from both incident passes.

**Troubleshoot:** if a skill is not used, check its description, completed
SKILL.md and saved tool attachment before adding more context. If the tool is
absent from Choose tools, confirm it was actually saved and refresh the canvas.
If Knowledge sources is unavailable, keep the short reference local; any pasted
excerpt is explicitly **manually supplied**, not retrieval. If identity blocks
the tool, preserve manual evidence and the gap. Continue to handover, then
review/security, before the second incident pass; resume live uptake checks
when the capability is available, without fabricating a completed comparison.

<details>
<summary>Show exact steps</summary>

1. Open **Build + setup > Workflows > Agent Canvas > Create > Skill**.
   Use name `latency-investigation`. In **SKILL.md**, paste and complete the
   starter. Match its description to the investigation trigger and finish all
   TODOs. Keep procedure, facts and behavior rules in their separate homes.
2. Select **Choose tools**, search for your actual tested tool name, select it
   and close the panel. Inspect the selected pill/frontmatter. Select **Create**.
   If the tool failed its availability gate, keep a local skill draft instead
   and record **not attached / not exercised**.
3. Choose the relevant parts of `knowledge/operations.md`; retain resource
   scope, request/telemetry semantics and operational boundaries. In
   **Build + setup > Context > Knowledge sources > Add file**, upload that
   short learner-owned document. Wait for **Indexed**. Do not upload repair
   answers or overwrite unrelated documents.
4. Select **New chat** on the same main agent. Ask:

   ```text
   From the selected operations reference, explain how the independent health
   route and request correlation are represented. Name the source used and any
   retrieval visibility gap. No Azure changes or issue creation.
   ```

5. In another **New chat**, use your actual identifiers/window:

   ```text
   Exercise my latency-investigation procedure for app <appName>, workspace
   <workspaceId>, Insights <insightsResourceId>, UTC <start> to <end>.
   Use at most two calls, sample_limit 3, with no workload generation or writes.
   Compare the affected route and independent health route. Separate facts,
   hypotheses and missing evidence; stop if scope, permissions or evidence
   are insufficient. Do not create an issue or propose a completed repair.
   ```

6. Expand available tool/activity details in the thread. Capture the six
   observations above. A successful answer without visible calls does not
   establish tool uptake. Do not substitute a sample result.
7. Preserve results and mark this chat **customization/rehearsal**, outside the
   measured runs. Save remaining gaps for the second-pass comparison. Continue
   to handover and coding context; review/security still precedes that pass.

</details>

<details>
<summary>Reference: supported skill and knowledge controls</summary>

[Create a skill](https://learn.microsoft.com/azure/sre-agent/create-skill)
documents the SKILL.md editor, Choose tools and direct main-agent New chat test;
a specialist is optional, not context-isolation evidence.
[Upload knowledge](https://learn.microsoft.com/azure/sre-agent/tutorial-upload-knowledge-document)
documents Add file, Indexed status and fresh-chat retrieval checks.
These first-party instructions establish configuration paths, not observations
from your tenant. The root-cause/repair reference is not part of these starters.

</details>

Previous: [Baseline incident pass](04-baseline.md) ·
Next: [Handover and coding context](06-handover-context.md)
