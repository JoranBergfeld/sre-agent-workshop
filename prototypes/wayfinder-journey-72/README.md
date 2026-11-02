# PROTOTYPE: solo investigation and secure handover journey

Disposable author-review outline, not a learner guide or implementation spec.
No application, infrastructure, commands, or live validation are provided.
Accepted through live author feedback on 2026-11-02, including placement of
review-agent work outside the measured passes. The canonical decision is the
resolution comment on the linked ticket; this remains a throwaway asset.

Question: can one experienced attendee complete the context comparison,
customize both review surfaces, and follow a mandatory security repair loop
without a coach or a deployment-focused teaching module?

Decision ticket: [Validate the self-guided investigation and secure handover journey](https://github.com/JoranBergfeld/sre-agent-workshop/issues/72).

## Fixed inputs

- PHP on Linux App Service; one action deploys the prepared timing regression.
  The order-status request incorrectly pauses for about 20 seconds instead of
  20 milliseconds; a fast health route stays healthy.
- Two measured passes: default-capability baseline, then guided customization.
  Each covers SRE investigation through issue handover and coding-agent fix PR.
  Merge and deployment are outside measurement.
- One SRE Agent, fresh investigation threads, equivalent faulty application
  code, workload, permissions, and initiating prompt. This is a learning
  comparison, not a controlled causal experiment.
- Azure SRE Agent input/output tokens and GitHub per-session AI credits are
  separate ledgers. Never convert credits to tokens or combine native units.
- The inert PHP SQL fixture lives in a separate, non-deployable security PR.
  Prior observation established an AI Scan finding and suggested changeset,
  not named Copilot Autofix or guaranteed future detection.
- The attendee retains issue approval, coding-agent invocation, review, merge,
  deployment, and recovery verification. No autonomous SRE remediation.
- Security is a required learning module, not an optional extension.
- Teach both a custom review-agent profile and built-in Copilot PR review
  instructions, without treating them as the same mechanism.
- Application deployment is operational follow-through, not the teaching
  focus or the main journey's finish line.

## Progressive guidance

Each checkpoint initially shows its objective, expected evidence, and essential
safety/cost boundaries. Exact instructions are hidden until the learner selects
"Show exact steps".

The revealed path is fully prescriptive: which page to open, what to click,
which file to edit, what content to add, which Bash/PowerShell script to run,
what result to expect, and how to resume if that result is missing. Reveal
support per checkpoint so a setup hint does not spoil a later investigation.

Both exploratory and prescriptive paths reach the same checkpoints; revealing
instructions is not a failure. References and root-cause explanations have
their own explicit spoiler reveal. Required safety warnings are never hidden.

This outline defines the guide's behavior, not invented current UI labels or
commands. The eventual guide must validate its exact steps in the target
environment.

## Proposed walkthrough

| Phase | Attendee action | Visible evidence / exit |
|---|---|---|
| 1. Orient and preflight | Read a short route map; use minimal setup automation for the app. Check telemetry access, GitHub agent session spend, custom-agent availability, built-in PR review, AI Scan eligibility, and cleanup ownership. | Known healthy revision, frozen faulty revision, measurement worksheet, capability status. Setup enables the exercise; deployment mechanics are not a lesson. |
| 2. Inject and observe | Use one inject action. Compare the affected request with the healthy route under bounded low load. | Elevated request duration, deployment timing, timing-helper logs, bounded healthy-route noise. No answer printed in the learner's starting material. |
| 3. Baseline end to end | Start the default-capability investigation. Inspect its evidence. Approve an actionable issue, inspect it, and invoke the GitHub coding agent. Stop this pass at its fix PR. | Thread and session identifiers; root-cause evidence; issue and PR links; tests; SRE token totals and per-session coding-agent credits. Baseline success is welcome. |
| 4. Guided customization | Customize evidence scope, knowledge retrieval, a supported custom skill, handover structure, and coding-agent repository context. An opt-in recipe supplies exact edits and explains each choice. Keep the root-cause answer out of the samples. | Small before/after configuration diff and rationale: what is retained, omitted, and at risk. Setup/tuning consumption is identifiable separately. Tool scoping and compaction can be additional experiments rather than mandatory steps. |
| 5. Restore and repeat | Preserve the first pass, leave its repair unmerged, and restore the same faulty application revision. Use the same SRE Agent in a fresh thread and a fresh coding-agent task from equivalent faulty code. | A second complete trace, handover, fix PR, and native-unit ledger. Record changed instructions, model/version differences, hints, retries, and contamination risks. |
| 6. Compare | Inspect both fixes and their test evidence. Compare correctness and retained handover evidence before usage. | Two side-by-side results through fix PR. Explain missing evidence, unchanged/increased usage, or inconclusive counters. Removing the intended pause does not satisfy the repair contract. |
| 7. Define the reviewers | Create/configure a focused custom review agent and built-in Copilot PR review instructions. Use repository context deliberately: shared conventions, path-specific review rules, and a bounded review-agent brief. Opt-in instructions supply exact files and steps. | Visible configuration diffs and separately attributable invocations. The learner can explain which context applies to which reviewer. A custom agent profile does not automatically configure the built-in PR reviewer. |
| 8. Required security review and repair loop | Open the inert same-repository security fixture PR. Invoke the custom reviewer, request built-in Copilot review, and inspect AI Scan separately. Evaluate findings; apply an accurately labelled suggested/agent/manual repair; request re-review and rerun the supported scan path. | Required participation in both review surfaces, AI Scan, repair, and validation. Preserve before/after evidence and actual source of each finding. A generic suggestion is not named Autofix; absence of comments is not proof of security. Never merge or deploy the fixture. |
| 9. Synthesize | Explain the context choices, compare consumption in native units, inspect operational repair tests, and explain the security finding and its repair evidence. | Main learning finish: reviewed/tested operational PRs plus the required security exercise and its honestly recorded result. Final acceptance policy for missing live evidence belongs to the next decision. |
| 10. Operational follow-through and cleanup | Use a short existing-style helper path if deploying the reviewed operational repair. Save evidence, close unused experiment issues/PRs, and remove participant-owned Azure resources. | Deployment is not a teaching module or comparison metric. If performed, preserve learner approval and verify actual recovery separately. Cleanup remains available even when a required exercise is blocked. |

These are teaching phases, not a final manifest page list. The eventual capsule
must preserve the repository's required semantic stages and paired shell
lifecycle operations.

### Accepted placement

Put review-agent definition and the security review loop after both measured
passes, on the separate security fixture PR. This makes security central without
introducing it into only one side of the SRE-to-fix-PR comparison or requiring
another measured run. Record additional review/repair sessions separately; do
not silently add them to the two coding-agent fix-session totals.

The learner authors the reviewer brief and repository instructions from a small
skeleton, or follows the opt-in recipe. It is not just enabling a preconfigured
reviewer. The brief covers review scope, relevant context, supported findings,
and expected evidence; it does not contain the fixture's answer.

### Review mechanisms: verified distinction, not a live workshop test

- [Custom agent profiles](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents)
  are defined in `.github/agents/*.agent.md`, with identity, description, tool
  scope, and behavior. They are explicitly selected for cloud-agent tasks.
- [Repository and path-specific instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)
  configure supported built-in Copilot PR review behavior. The documented
  `excludeAgent` setting can distinguish review-only from cloud-agent guidance.
- Verify the exact supported instruction scope, branch selection, enabled
  settings, and invocation in the eventual learner environment. Do not promise
  that adding a custom agent file replaces GitHub's built-in reviewer.
- AI Scan is a separate security-detection mechanism. Review output, scan
  output, and a repair mechanism must retain separate provenance.

These are documentation-backed capabilities, not a claim that the combined
learner journey has been run live.

## Minimum handover, not a transcript dump

Proposed template for both passes: observed symptom and impact; environment and
faulty revision; bounded reproduction; relevant evidence with query/time range
and source links; supported hypothesis and uncertainty; repair constraints;
required tests and recovery checks; read-only/approval boundaries.

Both passes must be actionable. The baseline uses normal available behavior,
not deliberately broken instructions or synthetic context junk. The customized
pass improves packaging rather than being handed the answer.

## Measurement worksheet sketch

One row per attempt, with baseline/customized and retry identifiers:

- SRE thread, attributable call/agent identifiers, input tokens, output tokens,
  and coverage gaps; include attributable specialist/background work once.
- GitHub task/session links and directly observed session AI-credit spend;
  include extra attributable sessions without double counting.
- Issue/PR, evidence retained, tests, human interventions, and outcome.
- Setup/tuning overhead separately from each measured end-to-end pass.
- No invented occupancy, cache breakdown, token estimates, or savings claims.
  Missing counters mean unmeasured/inconclusive, not zero consumption.

## Failure and resume cards to test in discussion

| Case | Proposed learner route |
|---|---|
| Telemetry or session spend missing | Diagnose access/attribution before comparing. If still unavailable, retain the learning trace as unmeasured; never substitute quota or estimates. Whether that completes the eventual scenario belongs to the acceptance decision. |
| No alert yet / telemetry delayed | Use the bounded request observation to distinguish propagation delay from a missing injection. Resume from a named checkpoint; do not inject repeatedly without checking current revision. |
| Agent stalls or produces a wrong hypothesis | Opt into exact checkpoint instructions, then reveal a reference explanation separately if needed. Record hints and all attempts. A reference is teaching material, not successful live agent evidence. |
| First repair is visible to the second run | Keep separate task branches from the same faulty revision; avoid feeding the first fix into the second. Repository metadata, SRE memories, run order, and cache still prevent perfect isolation; disclose them. |
| Customized run consumes more | Compare correctness, evidence, and where work moved downstream. No mandatory savings target and no cherry-picking. |
| Code review or AI Scan absent | Follow the revealed eligibility/settings checks. Mark the required module blocked or incomplete; a reference can explain it but cannot count as a live review or detection. The module is not silently optional. |
| Finding has no named Autofix | Review the actual suggestion or use an explicitly labelled agent/manual repair. Do not rename it Autofix. |
| Customized repair unusable | Inspect and repair with recorded assistance. Keep the original result and extra sessions attributable; producing a later repair does not rewrite the first attempt's outcome. |
| Security lab cannot finish | Preserve its partial result, mark the required exercise incomplete, and allow cleanup independently. Never imply that restored latency proves security correctness. The acceptance decision must specify what is needed to resume/complete it. |

## Author feedback incorporated

- Do not focus the workshop on application deployment.
- Security is mandatory, including review-agent definition and repository
  context.
- Include both the custom review agent and built-in PR review instructions.
- Make click/file/script-level prescriptive guidance available only on opt-in.
- Finish the main journey at PR/security learning outcomes; retain deployment
  only as short operational follow-through.

## Verdict

The author accepted this journey, including locating the reviewer-configuration
exercise and mandatory security loop after the two measured passes, with their
additional agent consumption recorded separately. This validates the outline
for planning, not the live operability of the combined workshop.

Detailed timing, access/licensing gates, resource limits, acceptance thresholds,
and exact lifecycle contracts remain with
[Set acceptance criteria prerequisites and lifecycle boundaries](https://github.com/JoranBergfeld/sre-agent-workshop/issues/74).
