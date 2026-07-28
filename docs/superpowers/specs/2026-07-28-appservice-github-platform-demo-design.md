# App Service GitHub Platform Demo Design

## Goal

Extend the App Service handover workshop so learners can demonstrate the
GitHub issue-to-Copilot workflow even when Azure infrastructure or Azure SRE
Agent is unavailable. The extension also demonstrates repository instructions,
human-readable code-quality guidance, pull-request CI, and a 100% changed-line
coverage gate.

The fallback must preserve the workshop's approval-gated operating model. It
must not pretend that Azure telemetry or an SRE Agent investigation occurred.

## Learner experience

The existing Azure path remains the primary experience:

1. The learner triggers the unfinished endpoint.
2. Azure SRE Agent investigates the incident.
3. The learner approves issue creation.
4. SRE Agent creates the issue and assigns Copilot.
5. Copilot opens a pull request.
6. CI validates the pull request.
7. The learner reviews and merges it.
8. The deployment workflow deploys the fix.
9. The learner validates recovery in Azure.

When the infrastructure or SRE Agent is unavailable, the learner uses a
documented fallback:

1. Open the checked-in sample issue at
   `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/sample-issue.md`.
2. Review the proposed issue as the explicit approval gate.
3. Open a blank issue in the workshop repository and copy the sample Markdown.
4. Submit the issue without an assignee.
5. Review the created issue, then manually assign it to Copilot.
6. Review the resulting Copilot pull request and its CI result.
7. Merge the pull request if the changes and checks are correct.
8. Skip deployment and Azure recovery validation when infrastructure was not
   provisioned.

Both paths converge at the Copilot pull request and use the same code-review
and CI experience. The fallback is an alternate entry point into the existing
scenario, not a separate scenario.

## Components

### Sample SRE Agent issue

Add
`scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/sample-issue.md`.
It represents the issue content an SRE Agent could produce after an
investigation, without claiming that an investigation actually ran.

The sample must contain:

- A concise incident summary.
- The observed route and HTTP 500 behavior.
- The expected HTTP 200 response with exactly
  `{"status":"completed","message":"The unfinished feature is now implemented."}`.
- A requirement to preserve `GET /health`.
- A requirement to replace the test documenting the broken state with tests
  for the successful contract.
- Scope limited to `scenarios/cloud-agent-handover/src/**` and
  `scenarios/cloud-agent-handover/tests/**`.
- An explicit prohibition on Bicep and GitHub Actions changes.
- Acceptance criteria that a learner can use during pull-request review.

The sample is ordinary Markdown rather than an issue template or automation.
This keeps the approval and issue-creation steps visible to the learner.

### App Service Copilot instructions

Add `.github/instructions/appservice.instructions.md` with path targeting for
`scenarios/cloud-agent-handover/**`. The instructions must complement, not duplicate or
contradict, the repository-wide `.github/copilot-instructions.md`.

They will direct Copilot to:

- Keep changes focused on the issue and respect its file scope.
- Preserve the exact endpoint contract and existing health behavior.
- Follow nullable, type-safe C# conventions.
- Add or update meaningful endpoint tests for behavior changes.
- Avoid weakening, deleting, or bypassing assertions merely to pass CI.
- Avoid unrelated infrastructure and workflow changes.
- Run the App Service quality commands documented in `CODE_QUALITY.md`.

### Human-readable code-quality guide

Add `scenarios/cloud-agent-handover/CODE_QUALITY.md`. It will explain the same quality
expectations to learners and connect each expectation to a GitHub platform
benefit:

- Path-specific Copilot instructions provide repository context.
- Focused issues give the coding agent a testable contract.
- Pull-request CI protects the main branch.
- Functional endpoint tests protect user-visible behavior.
- Changed-line coverage ensures newly introduced executable code is exercised.

The guide will include commands for running the App Service tests and producing
the coverage input used by CI. It will clarify that 100% applies to changed,
executable application lines, not generated Razor output or the entire
repository.

### Existing App Service validation workflow

Enhance `.github/workflows/validate-appservice-app.yml`; do not add a second
code-quality workflow. Learners should see one authoritative App Service pull
request check.

The workflow will:

1. Check out the pull request with enough history to compare against its base.
2. Set up .NET 10.
3. Restore and test `scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj`.
4. Use the existing Coverlet collector to emit Cobertura coverage.
5. Install a pinned `diff-cover` version.
6. Compare coverage against the pull request base branch.
7. Require 100% coverage for changed executable C# lines in
   `scenarios/cloud-agent-handover/src`.

The workflow's current path filters remain the boundary for app CI. App source,
tests, and the validation workflow itself trigger the check; unrelated
documentation does not.

## Data and control flow

The fallback issue is copied manually from the repository into GitHub. It is
created unassigned so issue submission and Copilot assignment remain two
distinct approval moments. After assignment, GitHub Copilot reads the issue,
repository-wide instructions, and App Service path-specific instructions before
producing a pull request.

The pull request triggers **Validate Cloud Agent Handover Application**. Functional
tests first establish the endpoint behavior. Coverlet then produces coverage
data, and `diff-cover` intersects that data with executable C# lines changed
relative to the pull request base. The check succeeds only when tests pass and
every changed executable application line is covered.

Merging retains the existing behavior: qualifying App Service source or test
changes on `main` trigger **Deploy Cloud Agent Handover Application**. A learner using
the no-infrastructure fallback observes the GitHub workflow but does not
perform Azure deployment or recovery validation.

## Error handling and troubleshooting

The workshop documentation will make these failure modes explicit:

- **Blank issues are unavailable:** verify repository issue settings and the
  learner's permission to create issues.
- **Copilot cannot be assigned:** verify Copilot coding agent availability and
  repository policy; do not assign a human or silently skip the handoff.
- **Tests fail:** inspect the exact endpoint, health, or home-page assertion
  reported by the test runner.
- **Changed-line coverage fails:** use the `diff-cover` output to identify
  uncovered changed lines, add behavior-focused tests, and rerun the same
  commands locally.
- **No Azure infrastructure exists:** stop after GitHub pull-request and merge
  validation; do not run the deployed endpoint validator or claim incident
  recovery.

The workflow must fail visibly when test execution, coverage generation,
base-branch comparison, or coverage enforcement fails. It must not use
success-shaped fallbacks that conceal missing coverage data.

## Testing and acceptance criteria

The implementation is complete when:

- Module 90 describes the Azure and fallback entry paths and their convergence.
- The scenario README links to the fallback sample without changing the
  generated scenario manifest or adding a second scenario.
- The sample issue can be copied directly into a blank GitHub issue and
  contains the exact endpoint contract and file scope.
- App Service path-specific instructions apply only to
  `scenarios/cloud-agent-handover/**`.
- `CODE_QUALITY.md` explains the local test and coverage workflow.
- The existing App Service validation workflow runs functional tests on pull
  requests.
- The workflow rejects a pull request when a changed executable application
  line lacks coverage.
- The workflow accepts the intended endpoint fix when its changed executable
  lines have 100% coverage and all endpoint tests pass.
- The existing deployment workflow and scenario tooling remain unchanged.

## Out of scope

- Automating issue creation with GitHub Actions or a local script.
- Creating a GitHub issue form or issue template.
- Automatically assigning Copilot when the issue is submitted.
- Adding an external coverage service such as Codecov.
- Requiring 100% total-project or branch coverage.
- Changing Azure infrastructure, SRE Agent configuration, deployment behavior,
  or scenario manifests.
