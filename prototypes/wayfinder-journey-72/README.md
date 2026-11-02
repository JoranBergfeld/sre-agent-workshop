# PROTOTYPE: solo investigation and secure handover journey

Disposable author-review outline, not a learner guide or implementation spec.
No application, infrastructure, commands, or live validation are provided.
All sequencing below is proposed until the author accepts it.

Question: can one experienced attendee understand and complete both context
comparison and the distinct security exercise without a coach?

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

## Proposed walkthrough

| Phase | Attendee action | Visible evidence / exit |
|---|---|---|
| 1. Orient and preflight | Read a short route map; check Azure deployment, telemetry access, GitHub agent session spend, review/scan availability, and cleanup ownership. Identify which controls change in pass two. | Known healthy revision, frozen faulty revision, measurement worksheet, capability status. Unavailable capabilities are explicit, not discovered silently halfway through. |
| 2. Inject and observe | Use one inject action. Compare the affected request with the healthy route under bounded low load. | Elevated request duration, deployment timing, timing-helper logs, bounded healthy-route noise. No answer printed in the learner's starting material. |
| 3. Baseline end to end | Start the default-capability investigation. Inspect its evidence. Approve an actionable issue, inspect it, and invoke the GitHub coding agent. Stop this pass at its fix PR. | Thread and session identifiers; root-cause evidence; issue and PR links; tests; SRE token totals and per-session coding-agent credits. Baseline success is welcome. |
| 4. Guided customization | Follow supplied, explained edits to evidence scope, knowledge retrieval, a supported custom skill, handover structure, and coding-agent repository instructions. Keep the root-cause answer out of the samples. | Small before/after configuration diff and rationale: what is retained, omitted, and at risk. Setup/tuning consumption is identifiable separately. |
| 5. Restore and repeat | Preserve the first pass, leave its repair unmerged, and restore the same faulty application revision. Use the same SRE Agent in a fresh thread and a fresh coding-agent task from equivalent faulty code. | A second complete trace, handover, fix PR, and native-unit ledger. Record changed instructions, model/version differences, hints, retries, and contamination risks. |
| 6. Compare and inspect review | Inspect both fixes and their test evidence; request/inspect code review separately from security scanning. Compare correctness and retained handover evidence before usage. | Two side-by-side results. Explain any missing evidence, unchanged/increased usage, or inconclusive counters. Review comments are not proof of AI Scan or named Autofix. |
| 7. Separate security lab | Open the inert same-repository fixture PR under the verified eligibility conditions. Inspect AI Scan independently of code review. Review a suggested repair, or explicitly invoke a coding agent/manual repair when needed. | Live finding and remediation evidence when available. Record the actual mechanism: suggestion, agent-written repair, manual repair, or explicitly verified named Autofix. Never merge or deploy the fixture. |
| 8. Deploy and prove recovery | Review and merge only the acceptable operational repair, normally the customized pass. Explicitly deploy the reviewed revision. | Correct response plus intended 20 ms pause; provisional controlled response below one second, subject to tier validation. Healthy route remains healthy. Removing the pause or reverting is not code-repair proof. Security evidence remains a separate result. |
| 9. Finish and clean up | Save the worksheet and relevant links; close unused experiment issues/PRs; remove participant-owned Azure resources. | Retained evidence, explicit live/recorded/unmeasured status, and cleanup confirmation. |

These are teaching phases, not a final manifest page list. The eventual capsule
must preserve the repository's required semantic stages and paired shell
lifecycle operations.

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
| Agent stalls or produces a wrong hypothesis | Use a labelled hint ladder: locate evidence, narrow query, then inspect a reference explanation. Record hints and all attempts. A reference is teaching material, not successful live agent evidence. |
| First repair is visible to the second run | Keep separate task branches from the same faulty revision; avoid feeding the first fix into the second. Repository metadata, SRE memories, run order, and cache still prevent perfect isolation; disclose them. |
| Customized run consumes more | Compare correctness, evidence, and where work moved downstream. No mandatory savings target and no cherry-picking. |
| Code review or AI Scan absent | Check eligibility and enabled settings. Record the absent capability; a reference can explain it but cannot count as a live review or detection. |
| Finding has no named Autofix | Review the actual suggestion or use an explicitly labelled agent/manual repair. Do not rename it Autofix. |
| Customized repair unusable | Inspect and repair with recorded assistance, or use a reviewed baseline repair for recovery. Keep the customized outcome honestly incomplete; deploying baseline is not customized-pass success. |
| Security lab cannot finish | Preserve its partial result and allow operational recovery/cleanup independently. Never imply that restored latency proves security correctness. |

## Open author choices

1. Keep baseline unmerged and deploy one reviewed operational repair only after
   both measured passes and the separate security lab?
2. Keep a short prescriptive customization core (bounded evidence, retrieval,
   one custom skill, handover, repository instructions), with tool scoping and
   compaction as optional experiments rather than mandatory steps?
3. Use a short diagnostic/hint path and honest partial outcomes so a missing
   live review/scan or stalled agent cannot trap a solo attendee or prevent
   cleanup, without awarding live capability success?

Detailed timing, access/licensing gates, resource limits, acceptance thresholds,
and exact lifecycle contracts remain with
[Set acceptance criteria prerequisites and lifecycle boundaries](https://github.com/JoranBergfeld/sre-agent-workshop/issues/74).
