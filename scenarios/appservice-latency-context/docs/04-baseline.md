# Baseline investigation through a fix PR

Observe what the default capabilities can do before authoring investigation,
handover or coding customizations. A successful baseline is useful evidence,
not something to sabotage. Keep built-in skills/tools available; do not claim
they can all be disabled. Record inherited instructions and integrations rather
than removing unrelated repository or shared-agent configuration.

**Safety and cost boundary:** synthetic data, bounded queries/workload, no Azure
changes by either agent. Learner approval precedes **one unassigned incident
issue**; the learner reviews it and assigns the coding agent. Neither agent
merges or deploys. Keep the baseline fix unmerged, including into its faulty
base. This pass ends at an inspected fix PR, not runtime recovery. App Service,
telemetry, SRE/model usage and GitHub sessions can incur charges, including
retries and follow-ups. No separate approver or change-ticket ceremony is needed.

## Checkpoint 1 — Freeze the starting conditions

**Objective:** make this incident pass repeatable without feeding it a solution.

**Starting assets:** [prerequisites](00-prerequisites.md), the
[onboarded agent](02-onboard-sre-agent.md), the
[injected runtime and published faulty coding base](03-configure-incident-response.md),
the [operations reference](../knowledge/operations.md), and capsule-local
`.azure/state.json`, `observation-*.json` and exported evidence.

**Explanation:** runtime injection packages a prepared revision; it does not
change Git source. Both SRE code inspection and the coding task need the actual
published faulty branch and commit, not an assumption that connected `main`
contains this capsule. Complete setup/access probes outside the measured pass.

<details>
<summary>Show exact steps</summary>

1. Recheck resource/workspace query access and repository write access. Verify
   coding-agent entitlement/policy, and that your task environment has Node 22+
   and PHP 8.3+ or can install them under your policy. GitHub Actions-based
   tasks also need permitted Actions/runner capacity; cloud sandboxes differ.
   Record the actual environment; do not assume Codespaces tools exist there.
2. Confirm one bounded faulty validation already ran: one order request and
   three independent health requests, with retained payloads/request IDs.
   Do not inject or generate load again merely to start a chat. If missing,
   return to [incident preparation](03-configure-incident-response.md).
3. In your chosen shell, capture code/test conditions:

   ```bash
   git branch --show-current
   git rev-parse HEAD
   git status --short
   git log -1 --format=%cI
   node --version
   php --version
   ```

   These native commands also work in PowerShell. Record the published faulty
   base name/SHA, runtime revision/deployment UTC, app/resource/workspace IDs,
   one-order/three-health workload, test command/versions, role scopes, agent
   identity/model/provider and inherited instructions/tools. Keep resource IDs
   where authorized; never copy credentials or tokens into chat or Git.
4. Keep notes/evidence locally under the capsule's ignored `.azure/` directory
   or your private notes. Record the exact initiating prompt from checkpoint 2,
   UTC start/end boundaries, SRE thread URL/ID, later issue/PR/session URLs,
   hints, failed attempts, retries and follow-ups. No worksheet or submission
   is required. Keep setup, customization and later review/security activity
   separately identifiable, not charged silently to this pass.
5. On **Build + setup → Context → Code access**, verify the connected repository.
   Repository connection alone does not select a branch: the observed repository
   dialog had no branch selector. Supply explicit branch/commit file links in
   the prompt and require the agent to report the revision it actually read.

</details>

**Observe:** a slow valid order response, fast health responses, matched
correlation IDs and an accessible faulty Git revision. Transport/startup
overhead is not the application stage duration. No live evidence means the
connected checkpoint is still pending.

**Experiment:** compare the resource IDs and revision returned by a preflight
read with saved deployment outputs. A green connector badge alone proves
neither telemetry access nor branch-specific code access.

**Troubleshooting:** if the capsule is only on an integration branch, create
the faulty base from that branch after fetching it, not from default `main`.
If code retrieval still reads only the default branch, provide authorized
branch-specific file links/content and record this human hint/limitation.
Do not present default-branch semantic search as inspection of unmerged code.
Without access, continue [local reproduction](local-reproduction.md), label
the live pass stalled and resume after access is available.

## Checkpoint 2 — Investigate with default capabilities

**Objective:** observe hypotheses and root-cause evidence, without manufacturing
failure or prescribing the repair.

**Starting assets:** frozen conditions, UTC incident window, saved request IDs,
resource IDs, faulty code URL/SHA and one fresh **New chat** on the connected
SRE Agent. The same agent will later use another fresh thread.

**Explanation:** compare the affected path with independent healthy evidence
and deployment timing. Let the agent choose its built-in procedure; context
authoring comes later. An answer without retrieved evidence is a hypothesis.

<details>
<summary>Show exact steps</summary>

Record UTC immediately before submitting this prompt. Replace bracketed
values with facts, then retain the exact submitted text for the repeat:

```text
Investigate elevated latency in the synthetic order-status application.
App Service/resource group: [resource IDs]. Telemetry workspace: [ID].
UTC observation window: [start, end]. Deployment UTC: [time].
GET /api/orders/DEMO-1001 is slow but returns valid content; /health
remains healthy. Observed request IDs: [IDs].
Repository: [URL]; actual incident code branch: [branch], commit: [SHA],
branch-specific source link: [URL]. Report which revision you can read;
do not assume default-branch search contains this code.
Use bounded read-only investigation in this resource/time scope.
Separate observed facts, hypotheses and missing evidence; cite query results,
correlated request/stage logs, deployment evidence and code where available.
Stop with a root-cause explanation or an explicit missing-evidence outcome,
and propose an issue handover. Do not create any issue until I explicitly
approve its content and target. Do not assign anyone, change Azure resources,
edit repository code, merge or deploy.
```

Expand relevant tool/result cards in the thread. Check resource/time filters,
query output bounds, request/operation IDs, stage duration, revision, errors
and deployment timing. Preserve result references, not just the final prose.
Ask for a missing citation or one narrower hypothesis check if needed; retain
the follow-up and its usage. Do not keep retrying to force a desired outcome.
Record when investigation stops and whether root cause is supported or pending.

</details>

**Observe:** actual queries/code reads and a causal explanation supported by
correlation, or a specific account of unavailable evidence. A valid HTTP
response does not rule out latency. The agent may solve the baseline well.

**Experiment:** distinguish evidence that rules out a dependency failure from
evidence that merely shows health. Try one bounded time-window refinement;
record the intervention rather than comparing it as an untouched initial run.

**Troubleshooting:** empty logs can mean ingestion delay, wrong scope, daily
cap or RBAC; 403 means review permissions, not grant write/elevation. If the
agent cannot inspect the right code/telemetry, stop with the gap. You may
continue reading later checkpoints as references and resume live investigation
when connected; reference answers never become observed results.

## Checkpoint 3 — Approve one issue, then assign the coding agent

**Objective:** make the operational-to-code boundary deliberate and inspectable.

**Starting assets:** the SRE thread's evidence and proposed issue draft,
authorized learner repository and published faulty base/SHA. The learner needs
issue/assignment/write access; the SRE GitHub connection needs issue creation
permission on this repository. Read-only code connection is not proof of that.

**Explanation:** SRE proposes; learner approves; SRE creates one unassigned
issue; learner reviews and assigns **Copilot** (`copilot-swe-agent`). Assignment
starts work, so choose the correct starting branch before confirming. Issue
creation is the only approved SRE write, not blanket permission to act.

<details>
<summary>Show exact steps</summary>

1. Ask SRE to show the proposed title/body and target repository without saving
   it. Check symptoms, UTC/resource scope, correlation/query/code evidence,
   facts versus hypotheses, reproduction, faulty branch/SHA, constraints and
   verification. Redact secrets. Do not paste the baseline repair diff or later
   context starters. If evidence is insufficient, keep the draft pending.
2. After reviewing it, explicitly approve in the same thread, for example:

   ```text
   I approve creating exactly one unassigned incident issue in [owner/repo]
   using the draft above. Do not assign Copilot or anyone else, create a PR,
   change Azure resources, merge or deploy. Return the issue URL, then stop.
   ```

3. Open the returned issue. Verify the target, body and empty **Assignees**.
   Check for an existing issue before any retry; if creation timed out, do
   not authorize a duplicate. Retain issue URL, creation/approval UTC and the
   thread's approval record.
4. Review/correct the issue yourself **before** assignment, retaining any edits
   as human hints. In **Assignees → Copilot**, select the learner repository
   and the **starting branch** `incident-baseline` (or your published faulty
   base). Keep the standard coding agent, not a custom profile. Supply only
   necessary task constraints/evidence. Confirm assignment; inspect that the
   assignee is `copilot-swe-agent` and the session starts from the intended SHA.
   GitHub's current guide documents a starting-branch picker in this dialog;
   this is first-party guidance, not a claim that we browser-validated it here.
5. Track the linked session/PR. If the task ends without a PR, ask it to open
   a fix PR against that same faulty base and retain that follow-up. Neither
   agent should merge, enable auto-merge/Agent Merge, or deploy.

**If your issue assignment surface cannot select a starting branch:** do not
launch a default-main task and hope a branch name in prose changes its base.
Use the repository **Agents → New agent task** branch picker, or the documented
GitHub CLI fallback below, **instead of** starting a second task by assignment:

```bash
gh agent-task create \
  --repo OWNER/REPO --base incident-baseline \
  "Implement the reviewed incident issue ISSUE_URL from this faulty base. Preserve response content, independent health and the intended small pause. Add regression evidence and report actual validation. Open a fix PR against this base. Do not merge or deploy."
```

```powershell
gh agent-task create `
  --repo OWNER/REPO --base incident-baseline `
  "Implement the reviewed incident issue ISSUE_URL from this faulty base. Preserve response content, independent health and the intended small pause. Add regression evidence and report actual validation. Open a fix PR against this base. Do not merge or deploy."
```

Replace placeholders; `gh agent-task create --help` confirms `--base` support
(verified with gh 2.97). Omitting it uses the default branch. The fallback is a
learner-initiated coding task linked to the reviewed issue, not proof of the
issue-assignment path. Record that distinction and any absent assignee; resume
the normal assignment checkpoint later rather than claim it happened. Do not
both assign and run `create`, which would launch duplicate work.

</details>

**Observe:** one issue created only after approval, initially unassigned;
learner assignment and the actual coding session's starting revision. Retain
session ID/model/environment and PR base/head SHAs, not just a branch label.

**Experiment:** compare the issue's evidence with what the coding session
actually cites. Does it investigate the deployed fault, or a different checkout?
Keep suggestions for better handover until after this baseline.

**Troubleshooting:** unavailable SRE issue creation means retain the approved
draft locally as **reference, not observed handover**; do not silently replace
it with a learner-created issue. Missing Copilot in Assignees may reflect plan,
repository policy, write access or organization SSO. Preserve artifacts,
continue later authoring/reference work, and resume the live checkpoint after
the owner enables access. Never silently enable paid repository-wide features.

## Checkpoint 4 — Inspect the fix PR without merging

**Objective:** distinguish a plausible patch, a validated code repair and runtime
recovery; preserve the first starting point for the repeat.

**Starting assets:** issue, session log, fix PR diff/base/head and test/check
reports. Node/PHP and permitted task compute are needed for validation, not
Azure deployment credentials.

**Explanation:** a faster response is insufficient if the patch removes intended
behavior or alters content. A passing check badge alone is not regression
evidence. This capsule intentionally retains a small request-path pause.

<details>
<summary>Show exact steps</summary>

1. Open **Files changed**, the session log and checks. Confirm a focused source
   repair with relevant regression tests, not unrelated instructions, broad
   infrastructure changes, reset/revert or disabled injection. Confirm the PR
   targets the published faulty base and includes the expected initial fault.
2. Inspect evidence for unchanged order status/payload, independent `/health`,
   and preservation of the intentional **20 ms** pause. The regression should
   fail on the faulty code and reject simply removing the pause. Review any
   added test against the HTTP boundary; do not weaken timing gates to make the
   faulty state pass.
3. Read actual command output, versions, exit status and skipped/missing tests.
   Existing focused regression, from the repository root in either shell:

   ```bash
   node --test --test-name-pattern "^repair preserves" scenarios/appservice-latency-context/tests/http.test.mjs
   ```

   This checks **tracked `src/`** by default. On an isolated faulty-base
   checkout it should fail (one bounded slow request); on the candidate fix
   it should pass. Preserve those reports with their SHAs. Do not treat
   `scripts/local.mjs`'s prepared healthy fixture as testing a candidate patch.
   The full `http.test.mjs` also checks the no-pause negative case and independent
   health; it includes one real slow fixture, so do not loop it for load.
   Run candidate tests only in an isolated checkout after inspecting scripts;
   do not switch/overwrite an edited working tree or supply Azure secrets.
4. If checks require human workflow approval, inspect the workflow before
   approving only permitted validation. Do not approve deployment. Separate
   agent-reported, independently reproduced, failed and unavailable validation.
   A necessary follow-up belongs on the PR/session, not only the issue:
   issue comments after assignment are not automatically new task context.
5. Record the end UTC when the fix PR is ready and you finish inspecting its
   evidence, or when you stop a stalled pass. Keep the PR **unmerged** and the
   faulty base unchanged; do not deploy/reset as part of claimed code repair.

</details>

**Observe:** diff, regression failures/passes at identified commits and an
honest validation report. A tested PR is not deployed recovery; the running
app may still be faulty. No latency SLO is promised for App Service hosting.

**Experiment:** ask whether a zero-delay patch would satisfy the visible
contract. Inspect the existing negative regression evidence without editing
the deployed app or leaking a finished solution into later task context.

**Troubleshooting:** missing PHP/Node, networking or runner restrictions are
validation gaps, not passing tests. Preserve failures and report any manual
rerun separately. If the PR is missing or incorrect, label the pass stalled or
incomplete; keep its actual spend and artifacts. Do not merge just to unlock
later checkpoints or mistake reset for repair.

## Checkpoint 5 — Preserve evidence and native usage

**Objective:** retain a comparable baseline without mixing products or inventing
measurements.

**Starting assets:** start/end UTC, prompt, code/workload/permission record,
SRE thread/tool evidence, approved issue, coding sessions and inspected PR.
The operator needs query access to the **SRE Agent's own Application Insights**
for token telemetry, separate from the application's workspace; session
visibility on GitHub is also required.

**Explanation:** measure the whole incident pass from the first investigation
prompt through inspected fix PR. Record SRE investigation/approval/handover
and coding-task timing separately within that boundary, including failed
attempts, retries and follow-ups. Exclude preflight/setup and later
customization/review-security work, but retain their separate consumption
where exposed. Lower usage is not a completion threshold.

<details>
<summary>Show exact steps</summary>

1. On SRE **Build + setup → Monitor → Logs**, open the agent's Application
   Insights, not the PHP app's telemetry. Follow the documented
   [model-generation audit query](https://learn.microsoft.com/en-us/azure/sre-agent/audit-agent-actions#model-generation-modelgeneration).
   Filter to the pass UTC window and thread ID. Retain input and output tokens
   separately by model/agent/thread and the query/export used. Include
   attributable delegated/background calls; disclose absent attribution.

   Replace all four placeholders with your recorded values before running:

   ```kql
   let passStart = todatetime("<PASS_START_UTC>");
   let passEnd = todatetime("<PASS_END_UTC>");
   let thread = "<SRE_THREAD_ID>";
   let agentResource = "<SRE_AGENT_RESOURCE_ID>";
   customEvents
   | where timestamp between (passStart .. passEnd)
   | where name == "ModelGeneration"
   | where tostring(customDimensions.EventType) == "ModelGenerationEnd"
   | where tostring(customDimensions.ThreadId) == thread
   | where tostring(customDimensions["gen_ai.agent.id"]) =~ agentResource
   | extend Thread = tostring(customDimensions.ThreadId),
       Agent = tostring(customDimensions.AgentName),
       Model = tostring(customDimensions.ModelId),
       Input = tolong(customDimensions.InputTokens),
       Output = tolong(customDimensions.OutputTokens)
   | summarize Calls = count(),
       MissingCounters = countif(isnull(Input) or isnull(Output)),
       MissingAttribution = countif(isempty(Agent) or isempty(Model)),
       ObservedInputTokens = sum(Input), ObservedOutputTokens = sum(Output)
       by Thread, Agent, Model
   ```

   Run in the agent's Application Insights **Logs** context (`customEvents`).
   Workspace-only context can expose `AppEvents` with different column names;
   switch to the Application Insights context or explicitly verify the schema,
   do not assume the app's `AppRequests` contains model usage.
   Export the result and retain the query/scope. `MissingCounters > 0` makes
   sums partial; KQL sums ignore nulls. **No rows is missing evidence, not zero
   usage.** Missing attribution also means incomplete accounting, even if a
   numeric subtotal appears. Check ingestion delay and the saved thread/agent
   IDs before drawing conclusions. A completed error/retry may lack a
   `ModelGenerationEnd`: inspect corresponding error/start audit events and
   disclose that coverage gap rather than inventing tokens.
   Follow recorded `TraceId`/`ParentSpanId` handoff relationships for delegated
   threads where exposed. Include only attributable calls inside the pass;
   note unlinked/background work as a gap. Do not add a per-agent subtotal
   to an overall total that already includes those same calls, or deduplicate
   repeated calls just because their token counts happen to match.
2. On GitHub, open the linked session from the PR/timeline or
   **Agents / View all sessions**, and inspect the session overview/details.
   Record the directly displayed **Session spend** in **AI credits** when
   available, with session URL/ID, model/environment, capture UTC and status.
   The label was observed in prior research, not guaranteed in every account.
   A "View token usage" dialog showing a monthly allowance is not session spend.
3. Retain each retry/follow-up session ID once. If a parent/session total already
   includes delegated work, do not add the child subtotal again. If coverage is
   undocumented, record the scope as unknown instead of guessing. Same-session
   follow-ups use that session's final cumulative spend, not a sum of successive
   snapshots. Unfinished usage can change; mark it provisional.
4. Keep the following alongside the artifacts, with actual values or
   **unmeasured — reason**; these are notes, not required submission:

   | Ledger | Native observation | Attribution/coverage |
   | --- | --- | --- |
   | SRE incident pass | Input tokens; output tokens | Agent resource, thread, UTC window, model/agent, source query, missing calls |
   | GitHub incident pass | Per-session AI credits | Unique session IDs, retries/follow-ups, included delegated work or gaps |
   | Setup/customization | Available native usage, separately | Preflight, connection checks, later authoring; not incident savings |
   | Review/security | Available native usage, separately | Separate inert-fixture activity; not this incident pass |

5. Preserve the prompt, snapshots/exports and evidence before any reset/cleanup.
   Keep the baseline issue/PR identifiers in private notes; do not put its
   repair diff or answer into later starting prompts/context assets. Fresh
   threads/tasks reduce carryover but cannot erase memories, caching or prior
   exposure; record those limitations, model differences and human hints.

</details>

**Observe:** separate SRE input/output token observations and GitHub per-session
AI credits, with explicit missing coverage. **Agent consumption** shows AAUs,
not a token counter. Context-window occupancy, cumulative input/output tokens,
cached tokens, AAUs, AI credits and monetary cost are different quantities.
Do not infer exact occupancy/cache breakdowns, convert credits/quotas into
tokens, sum unlike units or rank products using unlike units. A smaller parent
window does not prove lower total consumption.

**Experiment:** check whether a delegated call or retry is already included
before adding it. Compare completeness of evidence before comparing usage:
successful, unchanged-usage, higher-usage and stalled baselines are all useful.

**Troubleshooting:** hidden counters, missing thread/model fields, ingestion
delay/sampling or inaccessible sessions mean **unmeasured/inconclusive**, not
zero and not estimated spend. Preserve partial evidence and the exact missing
scope; resume capture later if it becomes available. Do not count this page's
queries, examples or research observations as measurements from your run.

## Separate reference reveal

<details>
<summary>Spoiler: root cause and repair acceptance reference — not live evidence</summary>

The prepared faulty tracked timing helper passes `20` to PHP's seconds-based
`sleep`. The intended pause is 20 milliseconds. A repair restores conversion
to the correct unit while preserving the pause, valid order-status payload and
independent health. Deleting the pause, disabling injection or resetting to a
known healthy package is not the code repair.

This is the fixture's reference answer, not evidence that your agents found or
tested it. Only your thread, issue, diff and validation establish what occurred.
Avoid carrying this reveal into later task prompts; record unavoidable exposure.

</details>

## Sources and continuation

Rechecked 2026-11-03: [SRE setup and permissions](https://learn.microsoft.com/azure/sre-agent/create-and-set-up),
[audit/token fields](https://learn.microsoft.com/en-us/azure/sre-agent/audit-agent-actions),
[AAU consumption](https://learn.microsoft.com/en-us/azure/sre-agent/monitor-agent-usage),
[GitHub issue assignment and starting branch](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github#assigning-an-issue-to-copilot),
[CLI base branch](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-from-cli),
[session logs](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents)
and [AI-credit billing](https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing).
Current documentation establishes supported surfaces, not your tenant's live
outcome. SRE navigation was browser-observed on 2026-11-03; branch selection,
handover, PR results and counters require your own connected observations.

Continue with [SRE context](05-sre-context.md), then
[handover/coding context](06-handover-context.md), then
[separate review/security practice](07-review-security.md), before
[repeat/comparison](08-repeat-compare.md). Missing live features allow labelled
reference/authoring continuation, not a fabricated completed baseline. Resume
the pending live checkpoint when eligible. Preserve artifacts before
[cleanup](99-cleanup.md); unneeded owned compute still bills while idle.
