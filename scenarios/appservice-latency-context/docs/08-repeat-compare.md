# Repeat and compare

Follow the [baseline](04-baseline.md), [SRE context](05-sre-context.md),
[handover/coding context](06-handover-context.md) and
[separate review/security practice](07-review-security.md), in that order.
The second pass is another investigation-to-fix-PR journey, not a demonstration
that customization must win. Keep the baseline fix **unmerged**, including into
its faulty base. Preserve both passes' evidence before reset or cleanup.

**Safety and costs:** synthetic data only; bounded reads and workload. Neither
agent changes Azure resources, merges or deploys. Approve before one unassigned
issue, then review and assign it yourself. Both incident fixes remain unmerged
during comparison; the inert security PR stays separate and is never deployed.
App Service, telemetry, SRE/model usage and GitHub sessions remain metered,
including failed attempts. Stop unnecessary retries; there is no savings target,
assessment, worksheet or required submission.

## Checkpoint 1 — Re-establish equivalent starting conditions

**Objective:** repeat the incident without silently starting from repaired code.

**Starting assets:** the baseline's saved faulty branch/SHA, runtime revision,
prompt, request/deployment evidence, role scopes and test versions; your
published context branch from [handover authoring](06-handover-context.md);
the same owned environment and SRE Agent. Preserve separate security artifacts.

**Explanation:** runtime injection does not edit tracked Git code. The second
task needs equivalent faulty tracked source and tests plus your intentional
context changes, not the baseline repaired head or the security fixture branch.
Freeze the initiating prompt, workload, permissions and code/test conditions.
Record intended customization differences; do not make a new prompt a hidden
experimental variable. Reset/reinjection is preparation outside measurement.

<details>
<summary>Show exact steps</summary>

1. Save baseline thread/tool exports, issue/PR/session URLs, query/usage exports
   and validation reports under ignored capsule `.azure/` or private notes.
   Do not add repair diffs, answers or baseline PR links to the second task's
   starting assets. Keep them privately for comparison.
2. In your clean context checkout, compare against the **recorded faulty
   baseline SHA**, not a PR head. Native Git commands work in both shells:

   ```bash
   git status --short
   git branch --show-current
   git rev-parse HEAD
   git diff RECORDED_FAULTY_BASE_SHA HEAD -- scenarios/appservice-latency-context/src scenarios/appservice-latency-context/tests
   git diff --stat RECORDED_FAULTY_BASE_SHA HEAD
   ```

   Replace the placeholder. Stop on failure or unexpected source/test changes:
   the first diff should be empty; the second should contain only your intended
   context changes, not fixture/repair changes. Do not reset or overwrite edits.
   If preparation is missing, resume the dedicated context-branch steps in
   [handover authoring](06-handover-context.md). Publish that branch deliberately
   and verify its SHA is accessible to both agents.
3. Keep the original application configuration, tier, workload and permissions.
   Record unavoidable changes in host conditions, versions, model/provider,
   agent identity, tools and repository/review instructions. Never grant write
   access merely to improve a result. Inspect the saved runtime state before
   deciding whether reinjection is necessary. If restoring the runtime is
   needed, export evidence first, then inject the same prepared faulty revision:

   ```bash
   scenarios/appservice-latency-context/scripts/evidence.sh
   scenarios/appservice-latency-context/scripts/inject.sh
   scenarios/appservice-latency-context/scripts/validate.sh --expect faulty
   ```

   ```powershell
   ./scenarios/appservice-latency-context/scripts/evidence.ps1
   ./scenarios/appservice-latency-context/scripts/inject.ps1
   ./scenarios/appservice-latency-context/scripts/validate.ps1 --expect faulty
   ```

   Use the same state directory/options as setup. Stop on any nonzero exit.
   If the saved runtime is still faulty, omit injection and run just one
   validation. Validation is the same bounded one-order/three-health workload;
   never loop it for load. Retain the new observation IDs and deployment UTC.
4. Reuse the saved initiating prompt verbatim except unavoidable run identifiers:
   new UTC window, request IDs, deployment time and explicit context branch/SHA
   links. Preserve both versions and identify those substitutions. Do not add
   the root cause or the baseline repair as a hint.

</details>

**Observe:** comparable faulty runtime and tracked code, valid slow response,
independent health, unchanged tests/permissions and an explicit customization
diff. Hosting variation is not the application stage duration.

**Experiment:** inspect whether a supposedly context-only commit also changes
tests or application code. Resolve that confound before measuring, not by
weakening regression assertions.

**Troubleshooting:** if the first repair was merged into the starting branch,
do not treat that branch as equivalent. Preserve work and resume from a clean
branch at the recorded faulty SHA using the linked preparation steps. Missing
baseline conditions make a numerical comparison inconclusive; a local/reference
walkthrough can continue, but it does not recreate a live baseline.

## Checkpoint 2 — Run the customized investigation through a second fix PR

**Objective:** inspect actual context use and a behavior-preserving repair,
not merely a shorter chat.

**Starting assets:** the frozen conditions, authored instructions/skill/tool,
chosen operations reference and issue/coding starters; repository and telemetry
read access, coding entitlement/policy and permitted Node/PHP test compute.
Use a fresh thread on the same SRE Agent and a fresh coding-agent task.

**Explanation:** the measured boundary is the first investigation prompt through
inspection of the fix PR, including root-cause evidence, approved issue handover
and attributable coding retries/follow-ups. Setup, customization and separate
review/security practice remain outside it. Fresh threads/tasks reduce carryover;
they do not guarantee isolation from memory, cache or earlier answers.

<details>
<summary>Show exact steps</summary>

1. Open the same agent → **New chat**. Record thread URL/ID, model/provider and
   UTC start immediately before submitting the preserved prompt. Do not reopen
   the baseline thread. Let the configured instructions and skill guide the run;
   record any follow-up nudges, including requests to use a missing skill.
2. Expand tool/result cards and any visible skill/context references. Inspect
   actual skill/tool use, retrieved knowledge/source citations and the revision
   read, rather than assuming saved configuration was invoked. Retain query
   text/parameters, resource/workspace scope, UTC bounds, row/sample limits,
   errors and returned latency/error summaries. Match request IDs, stage timing
   and deployment evidence; distinguish retrieved facts from inferred claims.
3. Respect the [custom-tool availability limitation](05-sre-context.md):
   **identity audience** matters. The documented Python Identity presets
   **ARM**, Key Vault and Storage do not establish a **Log Analytics** token.
   If the required LA audience is unavailable, stop that tool route; never
   request credentials, broaden permissions or claim creation/syntax success
   proves query execution. Use the bounded manual query/available built-in
   read route described there; label its evidence as manual/built-in, not custom
   tool use. Record the changed conditions and resume the custom-tool test when
   supported. Missing retrieval/tool evidence remains missing.
4. Inspect the proposed issue using your authored
   [handover criteria](06-handover-context.md): symptoms, facts, hypotheses,
   reproduction, source/result links, constraints and verification. Ask for
   missing evidence rather than supply the repair. When content/target are right,
   explicitly send:

   ```text
   I approve creating exactly one unassigned incident issue in [OWNER/REPO]
   with the reviewed content. Do not assign anyone, change Azure, merge or deploy.
   ```

   Verify exactly one issue exists and is unassigned. Review it yourself before
   **Assignees → Copilot**, selecting your published faulty **context branch**
   as starting branch. If that picker is unavailable, use the baseline's
   documented `gh agent-task create --base` route instead, not in addition.
   Do not assign and separately create a duplicate task. Start a new task,
   never resume the baseline session; retain the new session URL/ID.
5. Inspect received issue content, base/head SHAs, logs and instruction uptake
   where exposed. A starter file existing is not uptake evidence. Compare the
   PR diff and validation against unchanged payload, independent health and
   the intentional **20 ms** pause. Reject a removed pause, disabled injection,
   reset/revert or unrelated changes as repair evidence.
6. Follow the [baseline PR inspection](04-baseline.md) in an isolated candidate
   checkout. From repository root, in Bash or PowerShell:

   ```bash
   node --test --test-name-pattern "^repair preserves" scenarios/appservice-latency-context/tests/http.test.mjs
   ```

   This tests tracked source, not a prepared healthy fixture. Retain actual
   commands, SHA, versions, exit status, skipped/unavailable tests and relevant
   HTTP regression evidence, including the no-pause negative case from the
   existing suite. Distinguish agent-reported and independently reproduced
   validation. Do not change tests to accept faulty behavior.
7. Record UTC end when the fix PR and evidence are inspected, or when the pass
   stalls. Keep **both** fixes unmerged and undeployed. Include necessary
   PR/session follow-ups in the boundary; later issue comments are not
   automatically new coding-task input.

</details>

**Observe:** a supported causal explanation, bounded evidence, actionable issue
and focused repair with honest test results—or explicit gaps. Less consumption
cannot compensate for omitted evidence or a behavior regression.

**Experiment:** compare a cited knowledge fact with its source and a claimed
tool result with its card. Note absent or unexpected retrieval instead of
inferring success from a polished final answer.

**Troubleshooting:** unavailable SRE/coding access, wrong branch reads, empty
telemetry or failed tests make the pass partial/stalled, not successful.
Preserve the exact resume point and follow the relevant earlier checkpoint's
access guidance. Continue reviewing labelled references locally if useful;
resume live work when supported. Security remains part of the journey even
when its live review/scan is unavailable; preserve that limitation separately.

## Checkpoint 3 — Compare evidence first, native consumption second

**Objective:** explain what changed without presenting a before/after exercise
as causal proof or replacing quality with a usage score.

**Starting assets:** both passes' prompt/condition records, start/end UTC,
thread/session IDs, tool/retrieval exports, approved issues, unmerged fix PRs,
diffs and test reports. You need read access to the SRE Agent's own Application
Insights and GitHub session details, not just the application's logs.

**Explanation:** SRE input/output tokens and GitHub per-session AI credits are
separate native observations. Compare each product with itself. No combined
score, conversion or product ranking is valid. Missing direct counters mean
**unmeasured/inconclusive**, not zero, quota substitution or estimated spend.

<details>
<summary>Show exact steps</summary>

1. Read the two investigations, issues and diffs side by side. Ask:
   - Did each explanation cite scope-correct request/stage/deployment and code
     evidence, or merely guess the answer?
   - Which instructions, skill, custom/built-in tools and knowledge were actually
     observed? Were errors, missing retrieval and manual hints disclosed?
   - Did issue content separate facts/hypotheses and give reproducible
     verification? Did each focused repair retain payload, health and pause?
   - Which tests actually ran at which SHAs? Were any weakened, skipped or only
     claimed? A smaller context that omits necessary evidence is not improvement.
2. For **each** thread, open SRE **Build + setup → Monitor → Logs** and use the
   [baseline's thread-bounded native-token query](04-baseline.md), replacing
   its pass UTC window, thread ID and agent resource ID. Query the agent's own
   Application Insights `customEvents`, not the PHP workspace's request table.
   Export observed input and output tokens separately by thread/model/agent.
   Preserve the query and missing-counter/attribution counts. Inspect linked
   `TraceId`/`ParentSpanId` handoffs for attributable delegated/background work.
   Missing end events, unlinked child threads, sampling or inaccessible calls
   are coverage gaps; no rows is missing evidence, not zero consumption.
3. Open GitHub **Agents / View all sessions**, or each PR's linked session,
   then its overview/details. Capture directly displayed **Session spend**
   in **AI credits** where exposed, with URL/ID, model/environment, status and
   capture UTC. A monthly allowance or token-usage quota is not session spend.
   Include attributable failed attempts, delegated tasks, retries and follow-ups.
4. Build each pass total only from nonoverlapping coverage. If a parent total
   already includes delegated work, **do not add** child subtotals again.
   Use one final cumulative spend per unique session, not a sum of earlier
   snapshots. Likewise, do not add SRE per-agent subtotals to an overall total
   covering the same calls. Deduplicate by documented event/session identity,
   not equal token values: retries are real consumption. If parent/child
   inclusion is undocumented, retain the separate observations and mark total
   coverage unknown rather than guess. Still-running sessions are provisional.
5. Keep the comparison here or in private notes; this is not a form to submit.
   For each row, retain baseline and customized values or “unmeasured — reason”:

   | Boundary | Native observation | Retain alongside each pass |
   | --- | --- | --- |
   | SRE incident pass | Input tokens; output tokens | Thread, agent/model, UTC window, query/export, delegated coverage and gaps |
   | GitHub incident pass | Per-session AI credits | Unique session URLs/IDs, model, status, final capture, retries/follow-ups and inclusion scope |
   | Setup/customization | Available native usage, separately | Onboarding, preparation, authoring and tool probes; not incident savings |
   | Review/security | Available native usage, separately | Isolated fixture review, scan, repair and re-review/rescan; not either incident pass |

   Do not silently charge overhead to only one incident pass or hide it.
   Distinguish units even in the overhead rows; do not sum them into a
   cross-product total. Do not invent an overhead estimate when counters
   are unavailable.
6. Describe absolute observations and direction within each native unit
   (lower, unchanged, higher or inconclusive), with evidence completeness beside
   them. Do not report a reduction from partial/mismatched scopes. If both
   observations are complete and comparable, a within-unit difference is
   descriptive, not a guarantee of savings or the effect of one customization.

</details>

**Observe:** context-window occupancy, cumulative input/output tokens,
cached tokens, AAUs, AI credits and monetary cost are distinct quantities.
The SRE **Agent consumption** AAU grid is not input/output token telemetry.
Do not reconstruct GitHub tokens from credits/quotas, infer exact occupancy
or cache breakdowns from billing units, or treat a smaller parent window as
lower total consumption. Prices/credits are not a cash-cost measurement.

**Experiment:** audit one retry or delegated session's inclusion before adding
it. Then describe whether less evidence—not better selection—could explain a
lower observed number. Higher usage, an already successful baseline and a
stalled pass are learning cases, not attendee failure.

**Troubleshooting:** absent counters, unknown model/agent attribution or
inaccessible session details remain unmeasured/inconclusive. Preserve partial
exports and the missing coverage; retry capture after ingestion/access is
available, without replaying the investigation just to get a desirable total.
Record **prior exposure**, run order, **memory**, **cache**, **model**/provider
differences, inherited instructions, changed review instructions, human hints,
follow-ups and retries. The learner already knows more on pass two; fresh
threads cannot erase that. A quiet reviewer/scan is not proof of safety.
References and local tests cannot establish actual connected behavior.

## Checkpoint 4 — Preserve conclusions and choose the next step

**Objective:** retain an honest comparison and leave only owned resources
running deliberately.

**Starting assets:** both sets of evidence, separate review/security records,
native-usage exports and ownership state. Return to the
[cleanup guide](99-cleanup.md) with the same state directory.

**Explanation:** the measured journey ends at inspected fix PRs. Any optional
learner-controlled merge/deployment is outside that boundary, not a completion
gate. A tested repair, known healthy reset and deployed recovery are different
claims: neither tests nor reset prove deployed recovery.

<details>
<summary>Show exact steps</summary>

1. Preserve private copies of observations/exports, prompts, UTC boundaries,
   SHAs, thread/issue/PR/session links, actual validation reports and overhead
   before any reset/cleanup. Do not export credentials. The lifecycle helper's
   bounded recent export is not a complete historical backup.
2. If a capability was unavailable, retain its specific resume point: missing
   tool audience/uptake, repository access, fix PR, review/scan/repair evidence
   or native counter. Continue the labelled reference route in the relevant
   checkpoint and resume live verification when supported. Do not relabel an
   example as a finding, repair, Autofix or measured comparison.
3. Optional follow-through only: after comparison, a learner may review/merge
   a valid incident repair and manually deploy reviewed tracked code through
   their approved operator route. The capsule inject/reset helpers deploy
   prepared fixtures; they are **not** candidate-fix deployers. Never deploy
   the security fixture. Any runtime recovery claim requires **independent
   deployed-runtime verification**: confirm the deployed commit/package and
   measure valid payload, intended application pause, independent health and
   correlated telemetry under recorded hosting/workload conditions. No hosting
   latency SLO is promised. If not performed, record “tested PR; deployed
   recovery not verified.”
4. Otherwise proceed directly to [evidence preservation and cleanup](99-cleanup.md).
   Remove only workshop-owned resources/customizations, not shared agents or
   unrelated learner edits. Keep the security fixture unmerged; stop unused
   agent sessions and avoid unnecessary always-on compute/retention charges.

</details>

**Observe:** evidence survives cleanup, separate accounting remains traceable
and live gaps are explicit. This page is guidance, not a report of completed
Sandbox/browser tests. Connected end-to-end outcomes belong in the separate
implementation-validation record (#91), only after execution; an in-progress
baseline establishes no final outcome.

**Experiment:** explain the difference between “regression passed,” “known
healthy revision restored” and “reviewed fix independently measured in Azure”
using your own artifacts. There need not be a deployed-recovery observation.

**Troubleshooting:** if evidence is missing, preserve what remains and mark the
claim pending. Do not reset first and reconstruct observations afterward.
Ownership mismatches block cleanup: follow the scoped cleanup instructions,
never retag or delete unknown/shared resources to bypass a guard.

## First-party references

Checked 2026-11-03; documentation describes capabilities, not your run:

- [Audit SRE actions and model generations](https://learn.microsoft.com/azure/sre-agent/audit-agent-actions):
  Application Insights `customEvents`, tool calls and native model telemetry.
- [Manage GitHub agent sessions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents):
  session logs/overview and follow-ups; capture only counters actually exposed.
- [Python tool execution and identity](https://learn.microsoft.com/azure/sre-agent/python-code-execution):
  supported identity presets do not establish Log Analytics audience support.
- [Handover/coding context references](06-handover-context.md) and
  [review/security eligibility and references](07-review-security.md) retain
  supported instructions, current eligibility and missing-feature resume routes.

## Separate answer reveal

<details>
<summary>Spoiler: repair acceptance reference — not observed results</summary>

The prepared fault sends `20` to PHP's seconds-based `sleep`. The intended
pause is 20 milliseconds. A repair restores correct unit conversion without
removing that pause or changing order-status content and independent health.
[PHP sleep](https://www.php.net/manual/en/function.sleep.php) and
[usleep](https://www.php.net/manual/en/function.usleep.php) document the units.
Keep this reference answer out of the second task's starting context.

This explains the fixture, not what either agent found. Thread/tool artifacts,
issue content, candidate diff and identified test runs establish your observed
result. The separate security page's reference finding/suggestion is neither
live detection nor verified named Copilot Autofix in your repository.

</details>

Next: [Preserve evidence and clean up](99-cleanup.md).
