# Isolated built-in review and security practice

After [SRE context](05-sre-context.md) and [handover/coding context](06-handover-context.md),
pause before the second incident pass. Explore review and security on a
**separate same-repository PHP fixture PR**, not either incident fix PR.

**Never merge or deploy this fixture or reference PR #80.** The deliberately
unsafe starter has no application route, database, credentials or deployment
configuration. Keep it under `security/`, outside `src/`; do not serve this
directory, connect it to a database, or add it to application packaging.
The deployment packager allowlists application files; the focused test below
checks all three deployment states. No Azure operations are needed here.

**Costs remain visible:** each built-in review/re-review consumes Copilot AI
credits and can consume GitHub Actions minutes. AI Scan PR scans consume
**Code Security AI credits**, potentially on a different billing account.
Agent-written repairs can add coding-agent usage. Record these as
**review/security overhead**, separate from both incident passes, along with
settings changes, attempts and unavailable counters. Do not infer tokens from
credits or combine unlike units. No finding, suggestion, Autofix or savings is
guaranteed. Do not enable paid repository-/organization-wide features silently.

## 1. Observe baseline built-in review

**Objective / explanation:** compare the actual changed PHP lines with the
built-in review before adding this checkpoint's review customization. Existing
repository instructions still apply: this is not an instruction-free baseline.
Do not activate the starters or remove existing policy to manufacture one.

**Starting assets / prerequisites:** the inert
[starter lookup](../security/starter/order-status.php), a clean checkout of the
capsule's healthy base branch, Git, GitHub access to create a same-repository
branch/PR, Node.js 22+, PHP CLI with PDO (no driver/database required), and
`unzip` for the focused package check. Use synthetic values only.

Before attempting live work, verify the current
[first-party contracts below](#sources-and-eligibility-checked-2026-11-03).
Built-in review needs an eligible Copilot plan/organization entitlement and
policy; an organization can explicitly allow unlicensed members, but this
requires paid-usage policy and is not an instruction to enable it. Repository
authorized-user restrictions may also hide Copilot. AI Scan is a separate
entitlement, not implied by Copilot availability.

**Observe:** save the PR URL, base/head SHAs, inherited instruction paths and
enablement state, time, reviewer status and review permalink (or unavailable
reason). For each comment inspect its actual line/diff, claimed consequence,
testability, omissions and noise. A quiet review is inconclusive, not safety
evidence or a failed learner.

**Experiment:** compare which boundary the reviewer discusses with which
boundary you expected it to inspect. Do not repair yet.

**Troubleshooting:** no Copilot reviewer means check entitlement, organization
policy, repository authorized-user policy and requester permissions. Do not
assign the coding agent instead: that is a different capability. If blocked,
retain the blocker and use the labelled reference route below; resume this
checkpoint at the baseline head SHA when eligible.

<details>
<summary>Show exact steps</summary>

1. In a clean checkout, inspect `git status --short`. Preserve unrelated work
   elsewhere first. Select the healthy base containing this capsule (normally
   `main`), **not** an incident repair branch or reference PR #80. Choose a new
   unused branch name; never overwrite an existing exercise.
2. From repository root, prepare only the changed inert PHP file:

   Bash:
   ```bash
   git switch main
   git switch -c workshop/security-php-01
   mkdir -p scenarios/appservice-latency-context/security/pr
   cp -n scenarios/appservice-latency-context/security/starter/order-status.php \
     scenarios/appservice-latency-context/security/pr/order-status.php
   git diff --stat
   git add scenarios/appservice-latency-context/security/pr/order-status.php
   git diff --cached
   git commit -m "test: add inert security review exercise"
   ```

   PowerShell:
   ```powershell
   git switch main
   git switch -c workshop/security-php-01
   if (Test-Path scenarios/appservice-latency-context/security/pr) { throw 'Choose a clean exercise branch' }
   New-Item -ItemType Directory scenarios/appservice-latency-context/security/pr | Out-Null
   Copy-Item scenarios/appservice-latency-context/security/starter/order-status.php scenarios/appservice-latency-context/security/pr/order-status.php
   git diff --stat
   git add scenarios/appservice-latency-context/security/pr/order-status.php
   git diff --cached
   git commit -m "test: add inert security review exercise"
   ```

   Stop if any command fails or staged files include unrelated changes.
   The new `security/pr/order-status.php` must appear as changed PHP in the PR:
   unchanged starter code on the base is not a PR-scan experiment.
3. Only when ready for metered live activity, push this branch to the **same
   repository**, then GitHub **Pull requests → New pull request**: base `main`,
   compare `workshop/security-php-01`. Title it “Inert PHP security practice —
   never merge/deploy”. In the description record isolation, SHAs and that
   review/scan results are not guaranteed. Leave auto-merge off.
4. On the PR, **Reviewers → Copilot → Request**. This is GitHub's built-in
   reviewer, not a custom review-agent profile. Wait for the review completion
   or record the unavailable/failed state. Inspect **Conversation** and
   **Files changed**, saving review links before any customization or repair.
   Replies to review comments are not instructions to the reviewer.
5. If AI Scan is already enabled, it may automatically run on PR creation.
   Save that result without treating it as baseline code-review output.
   **Inspect it in checkpoint 3**, after custom review. Do not turn a shared
   setting off to impose an artificial trigger order.

</details>

## 2. Author review priorities, then explicitly re-review

**Objective / explanation:** tell the built-in reviewer which units,
boundaries, preserved behavior, tests and input handling matter. Repository
guidance and PHP-path guidance compose; they are not a custom review agent.
The reviewer reads instructions from the **head branch**, so no merge is
needed. Configuration existence alone does not demonstrate reviewer uptake.

**Starting assets:** inactive
[repository priorities](../context/review/repository.md.template) and
[PHP-path priorities](../context/review/php.instructions.md.template).
Complete the brackets yourself. These files are deliberately outside `.github`
and have `.template` suffixes; nothing automatically installs them.

**Observe:** preserve baseline and customized review permalinks at their
respective head SHAs, the instruction diff and setting state. Compare comments
to the same PHP diff, including missed findings, repeated comments and noise.
Inspect review/session references where exposed; lack of attribution means
uptake is unknown, not proven by a matching phrase.

**Experiment:** add one evidence requirement at a time; try another boundary
or test expectation. Record each extra review as overhead. Do not demand a
fixed comment or infer causality from one variable AI result.

**Troubleshooting:** if nothing changes, check head-branch paths, `applyTo`
glob, enablement and explicit re-review. Check conflicting inherited guidance.
Do not replace unrelated instructions. Without write/settings permission,
draft edits locally, label re-review unavailable, continue with reference
analysis and resume at this step when authorized.

<details>
<summary>Show exact steps</summary>

1. Stay on the fixture branch. Open both starter links and write concise
   priorities in your own words. For example, decide which input/operation
   boundary needs evidence and what behavior a repair must preserve; do not
   copy a finished root-cause answer into every context file.
2. Append your adapted repository review section to the **existing**
   `.github/copilot-instructions.md`, preserving its other content. Place
   concise high-priority review guidance where it is readily visible.
   Save the completed PHP starter at
   `.github/instructions/latency-php-review.instructions.md`; preserve its
   frontmatter. `applyTo` includes this capsule's runtime PHP and
   `security/pr/**/*.php`; `excludeAgent: "cloud-agent"` limits this
   path-specific file to review. The repository-wide file also affects other
   Copilot surfaces, so its branch scope matters for the later comparison.
3. In repository **Settings → Copilot → Code review**, inspect **Use custom
   instructions when reviewing pull requests** (enabled by default). Only an
   authorized operator should change it with explicit consent: it affects
   repository reviews, not just this PR. No setting access? Record it as unknown
   and continue locally. Do not change automatic-review rulesets for this lab.
4. Inspect the instruction diff, then stage just those two instruction paths,
   commit and push. Leave the PHP lookup unchanged.
5. In PR **Reviewers**, click **Re-request review** (circular arrows) beside
   Copilot. New pushes do **not** automatically re-review unless automatic
   reviews with **Review new pushes** are already configured. Even resolved
   comments may repeat. Save the new review and compare it with baseline.
   A default “Comment” review is advisory, not a human approval or security
   certification.

</details>

## 3. Inspect AI Scan independently

**Objective / explanation:** distinguish a review comment from a security
scan finding and a suggested changeset. AI Scan uses specialized prompts,
**not** these custom instruction files. PHP remains outside CodeQL support;
CodeQL success or silence does not validate this fixture.

**Starting assets / eligibility:** the still-unrepaired changed PHP PR and
[current AI Scan documentation](https://docs.github.com/en/code-security/concepts/code-scanning/ai-powered-security-detections).
Confirm:

- Code scanning and **AI Scan for pull requests** are enabled; CodeQL default
  setup is **not** required and its analysis state does not gate AI Scan.
- The PR originates in the same repository, **not a fork** and **not
  Dependabot-created**, and contains supported changed PHP.
- Public organization repositories and public personal repositories are
  eligible. Organization private/internal repositories require **GitHub Code
  Security or GitHub Advanced Security**. Private personal repositories and
  managed-user personal namespaces are not eligible. No Copilot license is
  required for AI Scan.
- Enterprise policy can prevent enablement. Organization owners/security
  managers control organization enablement; organization-repository admins
  may opt out but cannot opt in against a disabled organization setting.
  Organization enablement immediately covers eligible code-scanning
  repositories, potentially consuming credits beyond this exercise.

**Observe:** save finding URL/AI indicator, severity, file/line, head SHA,
status and explanatory text **separately** from any review comments.
Save a proposed patch separately from an applied commit. Record a completed
scan with no finding differently from not run, blocked, failed or unknown.
Silence is inconclusive; detection varies. Findings are advisory and do not
fail the code-scanning check or enforce a merge block.

**Experiment:** explain whether a suggested change preserves exact lookup
semantics; do not apply it until you have saved the pre-repair evidence.

**Troubleshooting:** missing findings may mean absent eligibility, settings,
changed supported lines, available Code Security AI credits, or simply no
detection. A waiting/failed CodeQL check alone does not explain an AI Scan
failure. Use the reference/continuation route rather than repeatedly pushing
changes in search of a guaranteed finding.

<details>
<summary>Show exact steps</summary>

1. Ask the authorized repository operator to **inspect**, not blindly enable,
   **Settings → Advanced Security → Code scanning → AI Scan for pull requests**.
   Confirm policy, eligibility, billing account and metered usage before any
   deliberate change. This is PR scanning, **not** repository-backlog scanning
   or the separate **Scan for AI applications** feature.
2. If disabled/unavailable, record the blocker. An authorized operator may
   explicitly consent to an eligible setting change after considering scope
   and cost; the exercise does not require enabling paid organization-wide
   features. For public personal repositories admins control the repository
   toggle directly. On organization repositories follow the organization
   policy route above.
3. AI Scan runs automatically on PR creation and each new commit when
   eligible. After enablement, if no scan has run, the operator can arrange
   the next meaningful fixture-branch commit; do not claim a historical
   unscanned SHA was scanned. Record which SHA actually produced results.
4. Open PR **Conversation** and **Files changed**, locate findings marked
   **AI**, and expand their risk explanations/suggestions. Save the
   pre-repair finding and suggestion links or sanitized screenshots.
   A generic **Commit suggestions** button is **not** evidence that the
   capability was named Copilot Autofix. Record that name only if the product
   explicitly identifies the offered capability as **Copilot Autofix**.
5. If no finding appears, record scan completion if observable, otherwise
   “run status unknown”; do not fabricate one. Continue to manual inspection
   and local repair, then return to this SHA/step when live scanning is
   available.

</details>

## 4. Repair, re-review/rescan and validate without deployment

**Objective / explanation:** connect the actual repair diff with independently
observable behavior. A review, finding or suggestion is not an applied repair;
passing local tests is not live detection or runtime recovery.

**Starting assets:** your separate fixture PR and the connection-free
[behavior verifier](../security/verify.php). Its PDO boundary double checks
ordinary, absent, quote-bearing, SQL-shaped IDs and non-string results without
a real database. It supports a simple single-placeholder PDO `execute()`
lookup, not every valid SQL dialect/driver/binding style; it is not a general
SQL engine or security audit. Only run it on **trusted, inspected local PHP**:
it loads the supplied file as code, not as sandboxed data.

**Observe:** keep four distinct artifact groups, linked to SHAs:

| Artifact | What it establishes |
| --- | --- |
| Built-in review comments | What that review actually commented on, including omissions/noise |
| AI Scan finding | What that scan actually detected; reference findings are not live evidence |
| Suggested changeset | A proposal, not proof it was applied or verified |
| Repair commit and test output | Actual changed code and checked behavior; label author/mechanism |

Label the repair **manual repair**, **agent-written repair**, **applied suggested
changeset**, or **verified named Copilot Autofix** only as observed. If a
suggestion was further edited by a human, say so. Preserve tests, re-review
and rescan status separately; no new finding is not proof of safety.

**Experiment:** see whether your regression check would reject direct SQL
interpolation and removal of the lookup behavior, not just accept the chosen
fix. Keep expected starter failure distinct from the repaired candidate.

**Troubleshooting:** missing PHP/PDO/Node/unzip is a local prerequisite failure,
not an AI result. A repaired-candidate failure needs diff/test inspection,
not weaker assertions. If a valid repair uses a different binding style,
extend independent boundary validation explicitly rather than claiming this
narrow verifier proves it. If re-review/rescan is unavailable, preserve the
tested repair and mark those live checks pending for resume.

<details>
<summary>Show exact steps</summary>

1. From repository root, in Bash or PowerShell, check the unchanged starter:
   ```text
   php scenarios/appservice-latency-context/security/verify.php scenarios/appservice-latency-context/security/pr/order-status.php
   ```
   Expected before repair: exit 1 with an unsafe-direct-query message.
   The verifier never opens a database. Stop on any unexpected error.
2. Inspect the diff and repair **only**
   `scenarios/appservice-latency-context/security/pr/order-status.php`, manually
   or using an explicitly selected agent/suggestion. An optional agent prompt:
   “Repair only this inert lookup. Preserve exact synthetic order-status and
   absent-ID behavior, keep input as data, and validate with the supplied
   verifier. No route, database connection, credentials, packaging, merge or
   deployment changes. Report the diff and tests actually run.”
3. Re-run the command from step 1 on the **actual repaired candidate**. Expect
   exit 0 and the five-case PASS line. Run the independent reference/packaging
   tests, in either shell:
   ```text
   node --test scenarios/appservice-latency-context/tests/security-fixture.test.mjs
   ```
   Those tests intentionally retain an unsafe starter (expected rejection);
   passing them alone does **not** test your new `security/pr` candidate.
4. Save failing-before/passing-after output, inspect and commit only the
   repaired candidate, then push. Save the repair SHA and accurate mechanism
   label. Request Copilot **Re-request review** explicitly again. AI Scan
   automatically scans the new commit when eligible; inspect the new SHA's
   results, recording completed/no finding versus unknown or unavailable.
   Do not treat an old thread marked resolved as proof the new scan ran.
5. Preserve evidence and metered usage before closing your disposable PR
   **without merging**, if finished. Restore only explicitly agreed temporary
   settings you changed; coordinate shared settings with their owner. Keep
   any resume branch/SHAs while live steps are pending. Do not delete unrelated
   learner work or reference PR #80. Carry relevant authored review priorities
   to later incident work only deliberately; record the instruction difference.

</details>

## Reference, continuation and resume

Unavailable features do not remove security from the journey. Read the
reference separately, compare the inert starter with the repaired example
locally, run behavioral checks, and retain your proposed review instructions.
Label each item **observed live**, **local validation**, **reference**, or
**unavailable/pending**. Never substitute reference findings for your own
review/scan evidence, or local tests for named Autofix.

Resume later with the saved repository/PR URL, baseline and customized head
SHAs, settings/blocker, pending step and pre-repair evidence. If already
repaired, preserve it and create a fresh eligible, separate fixture PR from
the clean base to observe an unrepaired diff; do not erase history or reopen
the incident repair PR. Keep new attempts/usage separate. Continue the
incident journey while clearly disclosing these live gaps.

<details>
<summary>Spoiler: repair and reference evidence</summary>

The starter interpolates an order ID into SQL. A quote-bearing ID crosses the
code/data boundary. The [manual repaired reference](../security/reference/order-status.php)
uses a prepared PDO statement with the ID supplied separately to `execute()`;
ordinary status lookup and missing-ID behavior remain unchanged. No database
is provisioned or contacted by the verifier.

Run this **reference**, not your candidate, from repository root in either shell:
```text
php scenarios/appservice-latency-context/security/verify.php scenarios/appservice-latency-context/security/reference/order-status.php
```

Historical evidence, not this learner's result:
[issue #78 resolution](https://github.com/JoranBergfeld/sre-agent-workshop/issues/78#issuecomment-6574935606)
and [draft reference PR #80](https://github.com/JoranBergfeld/sre-agent-workshop/pull/80)
record an actual high-severity AI Scan finding and suggested prepared-statement
changeset on the inert same-repository PHP fixture. Owner UI review observed
**Commit suggestions**, but **no verified control named Copilot Autofix**.
Temporary AI Scan enablement was reversed after that test. This does not
establish today's setting state, a finding on your PR, or guaranteed
repeatability. Inspect only; **never merge or deploy PR #80**.

</details>

## Sources and eligibility checked 2026-11-03

First-party documentation rechecked for this implementation; UI labels,
entitlements, billing and supported languages can change. Recheck these links
when resuming. No connected review/scan was executed by this page's local
validation.

- [Built-in review availability, policy, authorized users and billing](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/code-review):
  paid-plan entitlement or explicitly enabled organization access; review
  AI credits and possible Actions minutes are separate cost drivers.
- [Request review and explicit re-review; head-branch scope](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review).
- [Repository/path instructions and enablement](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions):
  `.github/copilot-instructions.md`, `applyTo`, `excludeAgent` and settings.
- [AI Scan eligibility, settings, language support, billing and limitations](https://docs.github.com/en/code-security/concepts/code-scanning/ai-powered-security-detections):
  PHP supported, fork/Dependabot PRs excluded; separate from CodeQL,
  repository-backlog scanning and custom review instructions.
- [CodeQL language support](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning):
  PHP is explicitly unsupported.

Continue with [repeat and comparison](08-repeat-compare.md), keeping this PR
unmerged, its usage outside both incident passes, and live gaps disclosed.
