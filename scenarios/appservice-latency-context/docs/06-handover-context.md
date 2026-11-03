# Author handover and coding context

Complete the [baseline](04-baseline.md) first, leaving its fix PR **unmerged**,
then author [SRE context](05-sre-context.md) and this handover/coding context.
The starters below are inactive templates, not automatically loaded instructions
or issue forms. Do not activate them for the baseline.

**Safety and costs:** synthetic evidence only; keep secrets out of issues and
session logs. Obtain learner approval before the SRE Agent creates **one
unassigned issue**. The learner reviews it and assigns the coding agent.
Neither agent merges or deploys. Coding sessions, retries and follow-ups are
metered; preserve baseline artifacts and identify customization work separately.
This is not a request to start another incident pass yet.

## Checkpoint 1 — Author an actionable issue draft

**Objective:** make an investigation usable by a coding task without turning
an inference into a fact.

**Explanation:** a useful handover links a bounded symptom to retrievable
evidence and a verifiable behavior contract. It need not contain a confident
root-cause claim. Missing evidence is a result, not permission to invent it.

**Starting assets:** the baseline issue/session links, request IDs, deployment
revision/time and [editable issue starter](../context/handover/incident-issue.md.template).
Use the [operations reference](../knowledge/operations.md) for application facts,
not as evidence that your own incident was observed.

**Experiment:** rewrite one unsupported assertion as a hypothesis with a
falsifying check. Compare the draft with the baseline issue: could another
person reproduce the symptom and determine whether a candidate preserves
behavior without opening the baseline fix?

**Observations:** inspect separate symptoms, established facts, hypotheses,
reproduction, evidence, constraints and verification fields. Check every
evidence link with the coding agent's access in mind; local `.azure/` paths
alone are not retrievable from its sandbox. Share only short redacted excerpts.
The response payload and intended **20 ms** pause must remain, with independent
health and unrelated route/method behavior preserved. Removing the pause,
disabling injection or reverting a deployment is not the repair.

<details>
<summary>Show exact steps</summary>

1. Open the issue starter and copy its contents into your editor as a **draft**,
   not GitHub's issue submission form. Leave the baseline issue untouched.
2. Replace each `[Fill: ...]` with your own observation, an accessible link,
   or “unavailable” and a next check. Record UTC bounds, the correlated request,
   measured duration, status/content and the small health comparison.
3. Give the repository URL, faulty coding base branch and immutable SHA
   separately from the deployed revision. Record the one-order/three-health
   workload used in the baseline; no extra traffic is needed to write context.
4. Keep alternative hypotheses separate from established facts. State which
   observation supports or contradicts each, and where evidence stops.
5. Complete scope and HTTP verification expectations. Require actual test
   output, not merely “tests pass”. Save your edited draft for the repeat pass;
   do not create an issue or assign Copilot during this authoring checkpoint.

</details>

**Troubleshooting / continuation:** if evidence is missing, label the draft
incomplete and identify the reader/telemetry access needed. If issue creation or
coding-agent access is unavailable, keep the local draft and continue authoring;
resume live handover only after access is restored. A draft/reference is not
observed issue creation or a coding-agent repair.

## Checkpoint 2 — Author and make coding instructions available

**Objective:** give a fresh coding task useful navigation, bounded scope,
regression-test expectations and honest validation reporting.

**Explanation:** an issue describes this incident; repository instructions
describe how to work here. On GitHub, `.github/copilot-instructions.md` supplies
repository-wide guidance. Matching `.github/instructions/NAME.instructions.md`
files use `applyTo` globs relative to the repository root; matching path and
repository guidance are combined. These are supported by the cloud coding agent.
The PHP starter scopes only this capsule's application PHP and uses
`excludeAgent: "code-review"` to keep that path guidance out of built-in review.
Repository-wide guidance can also affect review; record that change when
continuing to the separate review checkpoint.

**Starting assets:**
[repository-wide starter](../context/coding/repository-instructions.md.template),
[PHP-path starter](../context/coding/php.instructions.md.template), your issue
draft, and the saved **faulty coding base SHA** from the baseline.
The `.template` suffix and location under `context/` make these inert as
automatic instructions. Explicitly attaching a template can still disclose it;
do not attach it or the baseline fix to a baseline task.

**Visible scope boundary:** a bad package deployed by injection is not enough:
GitHub must contain the corresponding **tracked faulty source**, with a
selectable branch and immutable SHA. Healthy `main` is not that code task.
Keep the baseline repair PR unmerged and preserve runtime evidence before reset.
For the repeat, branch from the same saved faulty commit, add only authored
context, and confirm source/tests remain equivalent. Publishing instructions on
some other branch or saving local files does not put them into a task's checkout.
Do not overwrite unrelated learner instructions, force-push, or merge the first fix.

**Experiment:** add one navigation pointer and one evidence/reporting rule,
rather than a lengthy solution recipe. Which existing instruction already
expresses a rule? Avoid duplicating or contradicting it. Compare the resulting
context-only diff with the baseline source/test conditions.

**Observations:** the selected remote branch should contain both completed
instruction files, no unresolved fill fields, and unchanged faulty source/tests.
Saving a file demonstrates configuration, not actual agent uptake. Coding-agent
instructions load from its working repository context; a reviewer's instruction
enablement setting does not enable them for coding tasks. Recheck supported
surfaces in the first-party sources below if your UI differs.

<details>
<summary>Show exact steps</summary>

1. In a clean learner checkout, record `git status --short`. If it shows work,
   preserve it separately; do not stash, reset or overwrite it as part of this
   exercise. Set the SHA below to your **recorded faulty coding base commit**,
   not the baseline PR's repaired head. Use a new branch name if this one exists.

   Bash, from repository root:

   ```bash
   FAULTY_BASE_SHA='<recorded-faulty-coding-base-SHA>'
   git show --no-patch --oneline "$FAULTY_BASE_SHA"
   git switch -c workshop/alctx-context "$FAULTY_BASE_SHA"
   git diff "$FAULTY_BASE_SHA" -- scenarios/appservice-latency-context/src scenarios/appservice-latency-context/tests
   ```

   PowerShell:

   ```powershell
   $faultyBaseSha = '<recorded-faulty-coding-base-SHA>'
   git show --no-patch --oneline $faultyBaseSha
   git switch -c workshop/alctx-context $faultyBaseSha
   git diff $faultyBaseSha -- scenarios/appservice-latency-context/src scenarios/appservice-latency-context/tests
   ```

   Stop on any command failure. The diff should be empty. Confirm in GitHub
   **Code** > branch selector that the saved baseline faulty branch/SHA exists.
   If only injection's bad runtime package exists, return to the
   [baseline's coding-base preparation](04-baseline.md) before proceeding.
   Its `scripts/prepare-code.sh --confirm faulty` /
   `scripts/prepare-code.ps1 --confirm faulty` helper, under this capsule,
   prepares tracked source only on a dedicated branch; review, commit and
   publish that faulty base deliberately. It does not publish or deploy it.
   Re-establish the baseline conditions if it was run against healthy code;
   do not pretend that run is comparable.
2. Read existing `.github/copilot-instructions.md`, matching instruction files
   under `.github/instructions/`, and applicable `AGENTS.md` guidance, if present.
   In your editor, complete the two starters. Merge only the relevant authored
   paragraphs into `.github/copilot-instructions.md`; create it if absent.
   Leave existing learner guidance intact. For PHP, save the completed starter
   to `.github/instructions/alctx-php.instructions.md` only after checking that
   path; merge if it exists. Keep the starter's `applyTo` and `excludeAgent`
   frontmatter. Do not copy blank fill fields into active instructions.
3. Use source entry points and HTTP tests as navigation. State allowed change
   scope, public regression checks, preserved behavior and required reporting.
   Do not name a repair expression or link the baseline answer. Review
   `git diff -- .github/copilot-instructions.md .github/instructions/alctx-php.instructions.md`
   and `git status --short`; ensure only intended context changes are staged.
4. Commit those selected context changes and publish **your dedicated branch**
   to your learner repository using your normal workflow; no application merge
   or deployment is needed. In GitHub **Code**, select that branch and open
   both active instruction paths to verify their committed contents. Record
   this new context SHA and the original faulty SHA separately.
5. At assignment during the repeat pass, explicitly choose this published
   context branch as the coding base. Verify the session's checkout and eventual
   PR base; a branch name written in the issue is not itself a selector.

</details>

**Troubleshooting / continuation:** if you cannot publish or select the branch,
keep the authored templates locally and label coding uptake **unobserved**.
Do not fall back silently to healthy `main`. Restore repository write access,
coding-agent entitlement and organization policy, then resume at branch
publication/selection. Do not enable paid repository-wide features to bypass
policy. If the tool cannot expose its chosen base, stop the measured coding
handover and record that gap. Instructions are guidance, not a security sandbox.

## Checkpoint 3 — Inspect approved handover and actual coding uptake

**Objective:** during the repeat pass, inspect whether the task received usable
context and delivered a behavior-preserving code repair, not just a plausible
summary.

**Explanation:** use this checklist **later**, after
[isolated review and security](07-review-security.md), during the
[repeat incident pass](08-repeat-compare.md). Use a fresh investigation thread
on the same SRE Agent and a fresh coding task. Configuration existence or the
agent saying “I followed the instructions” does not prove uptake. Preserve
issue, checkout, session/tool, diff and validation evidence where exposed;
record unavailable evidence without claiming hidden reads.

**Starting assets:** your completed issue draft, published faulty/context base
branch and SHAs, repeat-pass evidence and [prerequisites](00-prerequisites.md).
The SRE connection needs access to the chosen repository and evidence; issue
creation needs the permitted GitHub write action. Azure resource/telemetry
investigation remains read-only. The learner needs repository write access and
an eligible, policy-enabled coding-agent account to assign work. Check current
entitlement, organization policy and metered AI-credit availability; no paid
feature is enabled by these templates.

**Experiment:** compare the baseline and repeat issues for evidence quality,
not length. Trace one authored testing rule from committed instructions through
an observable session command to its actual output. If only the diff reflects
the rule, record consistency rather than claiming proven file retrieval.
Avoid extra paid retries solely to obtain a desired outcome.

**Observations:** inspect the issue before assignment, the coding task's chosen
repository/base SHA, any exposed instruction references or read/tool events,
fix scope, regression-test output and missing checks. Preserve the valid payload,
intentional 20 ms pause and independent health contract. Keep both incident
fix PRs **unmerged**; a test result is not runtime recovery. Record coding-agent
per-session AI credits separately from SRE input/output tokens where exposed;
missing counters remain unmeasured, not inferred from quotas. Separate
customization, security activity, retries and follow-ups, with coverage gaps
and no double counting. A fresh task does not guarantee isolation from history,
memory, caching or prior exposure.

<details>
<summary>Show exact steps</summary>

1. In the repeat investigation thread, supply the completed draft structure,
   actual branch/commit URL and new bounded incident evidence. Ask:

   > Draft one incident issue using these fields and evidence. Distinguish facts
   > from hypotheses and mark missing evidence. Show the proposed repository,
   > title and body, then wait for my approval. Do not create or assign an issue,
   > merge or deploy. Confirm which code revision you could actually inspect.

   A repository connection alone does not establish access to a non-default
   branch. If the SRE Agent cannot retrieve the supplied commit, record that
   gap rather than claim code-level investigation.
2. Inspect the proposal and correct unsupported facts before approval. Only
   when ready, explicitly approve:

   > I approve creation of one unassigned issue in OWNER/REPO using this reviewed
   > draft. Return its URL; do not assign an agent, create duplicates, merge or deploy.

   Replace `OWNER/REPO` with your learner repository. Open the returned URL,
   confirm **Assignees: No one**, and review evidence, uncertainty, source SHA,
   constraints and verification. If creation times out, inspect **Issues** for
   the intended issue before retrying; do not create a duplicate blindly.
3. Finish editing the issue **before assignment**. GitHub's documented assignment
   flow supplies the issue title/body and existing comments to Copilot; later
   issue comments are not automatically new task instructions.
   Open **Assignees** > **Copilot**. In the assignment dialog select the learner
   repository and the published **faulty/context starting branch**, not default
   `main` or the baseline fix branch. Review any optional prompt for answer
   leakage, then confirm assignment yourself. Do not trigger a second task
   from the Agents tab for the same issue. If the dialog cannot select the
   required branch, stop and use the continuation route below.
4. Open the resulting session from GitHub's **Agents** tab/panel, or the linked
   PR/session entry. Inspect the recorded checkout/base and the committed active
   instructions in that revision. Where exposed, capture references/read
   events showing the instruction paths, and subsequent navigation/testing
   actions and outputs. A Chat References list is not proof of coding-task
   uptake. Do not claim a read event exists when the session does not expose it.
5. In the PR's **Files changed**, compare scope with the approved issue.
   Check regression tests preserve assertions and reject the unchanged faulty
   code as well as a removed-pause shortcut. Require candidate-specific
   commands/results in the session or PR report. For an independent local
   check, use a separate clean checkout of the candidate SHA and run the
   following from repository root (Node.js 22+, PHP 8.3+; Linux/macOS/WSL):

   Bash:

   ```bash
   git rev-parse HEAD
   APP_DIR="$PWD/scenarios/appservice-latency-context/src" \
     node --test --test-name-pattern '^repair preserves' \
     scenarios/appservice-latency-context/tests/http.test.mjs
   ```

   PowerShell:

   ```powershell
   git rev-parse HEAD
   $previousAppDir = $env:APP_DIR
   try {
     $env:APP_DIR = (Resolve-Path ./scenarios/appservice-latency-context/src).Path
     node --test --test-name-pattern '^repair preserves' ./scenarios/appservice-latency-context/tests/http.test.mjs
   } finally {
     $env:APP_DIR = $previousAppDir
   }
   ```

   Use the same command in the separate faulty-base checkout to retain the
   failing starting result (one roughly 20-second request before failure).
   Candidate checks cover payload and a controlled nonzero pause; they must
   fail on a candidate that removes that pause. Also inspect the broader
   [HTTP behavior checks](local-reproduction.md) for independent health and
   unchanged workload. Record which checks actually ran; this command alone
   does not verify every route or prove App Service recovery. Do not weaken
   timing bounds to hide a failure; hosting/contended-machine differences
   may instead make a measurement inconclusive.
6. Preserve issue/PR/session URLs, observed checkout SHA, relevant diff and test
   outputs, instruction-use evidence or its absence, and native usage before
   any reset/cleanup. Request follow-up through the existing PR/session if
   needed, recording the extra work; do not silently relabel it a fresh run.
   Leave merge/deployment to a later deliberate human action, outside the
   measured boundary. Neither agent should perform either action.

</details>

**Troubleshooting / continuation:** if the SRE connector cannot create issues,
keep its reviewed proposal locally and record **live handover unavailable**.
You may practice drafting or manually create a clearly labelled manual example
with approval, but it is not observed SRE issue creation. Resume at the approval
step when the connector is restored, checking for an existing issue first.
If Copilot is absent from Assignees, check write access, current entitlement
and repository/organization policy with its owner; do not assign another agent
silently. Continue the separate review/security guidance and local repair
inspection as labelled reference practice; resume this live coding handover
when the supported assignment/base selector is available. If session logs omit
instruction reads or validation output, mark uptake/results **unobserved** and
retain the actual diff; never manufacture compliance evidence or guaranteed
savings. A stalled or already-successful baseline is a valid learning case.

## First-party sources and references

Documentation checked **2026-11-03**; this date records a documentation check,
not a connected coding-agent test. Product labels and availability can differ.

- [GitHub: repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions):
  supported filenames, `applyTo`, combined scope and `excludeAgent`. The
  personal custom-instruction switch described for **code review** is not a
  coding-agent enablement switch.
- [GitHub: using Copilot in the cloud on GitHub](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github):
  **Assigning an issue to Copilot**, repository/write-access requirements,
  starting-branch selection and the issue-context snapshot at assignment.
- [GitHub: managing agent sessions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents):
  session logs and tool/validation activity. A summary is not a substitute
  for observed commands and results.
- [GitHub: Copilot on GitHub.com and Mobile](https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-on-github):
  changing cloud experiences, paid-plan availability and policy constraints.

<details>
<summary>Spoiler: root cause and reference repair</summary>

**Reference only — not evidence from your run.** The faulty helper passes 20
to PHP's seconds-based `sleep`. The intended pause is 20 milliseconds.
A reference repair uses `usleep($milliseconds * 1000)` so that the millisecond
input becomes microseconds, preserving the pause and valid order payload.
Deleting the wait or returning a different payload is not equivalent.

[PHP `sleep`](https://www.php.net/manual/en/function.sleep.php) takes seconds;
[PHP `usleep`](https://www.php.net/manual/en/function.usleep.php) takes
microseconds (checked **2026-11-03**). Scheduling can lengthen the elapsed time.
Do not copy this answer into the context starters or expose the baseline repair
to the repeat coding task. Tests validate candidate code, a reset restores a
prepared state, and runtime recovery needs independent deployed measurements.

</details>

Next: [isolated review and security](07-review-security.md), then
[repeat and compare](08-repeat-compare.md). Keep this inspection checklist
available for that repeat; do not skip the intervening security activity.
