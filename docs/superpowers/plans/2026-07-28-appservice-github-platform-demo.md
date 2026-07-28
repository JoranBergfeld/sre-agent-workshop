# App Service GitHub Platform Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub-only fallback for the App Service handover and demonstrate scoped Copilot instructions, pull-request validation, and 100% changed-line application coverage.

**Architecture:** A checked-in sample issue provides the manual fallback entry point while preserving explicit approval before Copilot assignment. Repository guidance is split between path-specific agent instructions and a learner-facing quality guide. The existing App Service validation workflow remains the single CI check and combines endpoint tests, Coverlet Cobertura output, and pinned `diff-cover` enforcement against the pull-request base.

**Tech Stack:** GitHub Issues, GitHub Copilot coding agent instructions, GitHub Actions, .NET 10, xUnit, Coverlet collector, Python 3.13, diff-cover 10.4.1, uv, Markdown

---

## File structure

- Create `workshops/appservice/scenarios/cloud-agent-handover/sample-issue.md`
  as the copy-ready issue that represents a possible SRE Agent handoff.
- Create `.github/instructions/appservice.instructions.md` as path-specific
  instructions for changes under `workshops/appservice/**`.
- Create `workshops/appservice/CODE_QUALITY.md` as the learner-facing
  explanation of issue quality, tests, CI, and changed-line coverage.
- Modify `.gitignore` so local App Service coverage results are not committed.
- Modify `.github/workflows/validate-appservice-app.yml` so its existing test
  job also generates coverage and enforces 100% changed-line coverage on pull
  requests.
- Modify
  `workshops/appservice/scenarios/cloud-agent-handover/README.md` to expose the
  GitHub-only fallback from the scenario.
- Modify `workshops/appservice/docs/90-watch-sre-agent.md` to document the
  Azure and fallback entry paths, their common pull-request flow, and their
  different stopping points.

No application source, endpoint test, deployment workflow, infrastructure, or
scenario manifest changes belong in this implementation. The intentionally
broken endpoint must remain broken so the learner or Copilot coding agent can
fix it during the workshop.

### Task 1: Add the copy-ready SRE Agent issue

**Files:**
- Create:
  `workshops/appservice/scenarios/cloud-agent-handover/sample-issue.md`

- [ ] **Step 1: Verify that the fallback artifact does not exist**

Run:

```bash
test ! -e workshops/appservice/scenarios/cloud-agent-handover/sample-issue.md
```

Expected: exit status 0.

- [ ] **Step 2: Create the sample issue**

Create
`workshops/appservice/scenarios/cloud-agent-handover/sample-issue.md` with:

````markdown
# Implement the unfinished App Service feature endpoint

## Incident summary

`POST /api/feature` returns HTTP 500 while the rest of the application remains
healthy. The failure is consistent with the endpoint's
`NotImplementedException` and should be corrected in application code.

## Expected behavior

- `POST /api/feature` returns HTTP 200.
- The response body is exactly:

  ```json
  {"status":"completed","message":"The unfinished feature is now implemented."}
  ```

- `GET /health` continues to return HTTP 200 with a healthy status.

## Required changes

- Implement the endpoint in `workshops/appservice/src/**`.
- Replace the test that documents the initial HTTP 500 response with a test
  for the exact HTTP 200 success contract.
- Preserve the existing health and home-page behavior.
- Keep changes limited to `workshops/appservice/src/**` and
  `workshops/appservice/tests/**`.
- Do not modify Bicep or GitHub Actions workflows.

## Acceptance criteria

- All App Service endpoint tests pass.
- Pull-request CI reports 100% coverage for changed executable application
  lines.
- The pull request contains no unrelated infrastructure, workflow, or
  repository-wide changes.
````

- [ ] **Step 3: Check the issue contract**

Run:

```bash
grep -F 'POST /api/feature' workshops/appservice/scenarios/cloud-agent-handover/sample-issue.md
grep -F '{"status":"completed","message":"The unfinished feature is now implemented."}' workshops/appservice/scenarios/cloud-agent-handover/sample-issue.md
grep -F 'GET /health' workshops/appservice/scenarios/cloud-agent-handover/sample-issue.md
grep -F 'Do not modify Bicep or GitHub Actions workflows.' workshops/appservice/scenarios/cloud-agent-handover/sample-issue.md
```

Expected: all four commands print their matching line and exit 0.

- [ ] **Step 4: Commit the sample issue**

```bash
git add workshops/appservice/scenarios/cloud-agent-handover/sample-issue.md
git commit -m "docs(appservice): add fallback SRE issue"
```

### Task 2: Add scoped Copilot and human quality guidance

**Files:**
- Create: `.github/instructions/appservice.instructions.md`
- Create: `workshops/appservice/CODE_QUALITY.md`
- Modify: `.gitignore:12-15`

- [ ] **Step 1: Verify that the guidance files do not exist**

Run:

```bash
test ! -e .github/instructions/appservice.instructions.md
test ! -e workshops/appservice/CODE_QUALITY.md
```

Expected: both commands exit 0.

- [ ] **Step 2: Create the path-specific Copilot instructions**

Create `.github/instructions/appservice.instructions.md` with:

```markdown
---
applyTo: "workshops/appservice/**"
---

# App Service coding instructions

- Keep changes focused on the assigned issue and inside its stated file scope.
- Preserve the exact documented API response contracts and the existing
  `GET /health` behavior.
- Use nullable, type-safe C#; do not suppress warnings or add unnecessary type
  assertions.
- Add or update endpoint tests for every behavior change.
- Assert status codes and response payloads rather than implementation details.
- Do not weaken, delete, skip, or bypass assertions merely to make CI pass.
- Do not change App Service Bicep or GitHub Actions unless the issue explicitly
  requires it.
- Run the commands in `workshops/appservice/CODE_QUALITY.md` before completing
  the pull request.
```

- [ ] **Step 3: Create the learner-facing quality guide**

Create `workshops/appservice/CODE_QUALITY.md` with:

````markdown
# App Service code quality

The handover demonstrates how GitHub turns an incident diagnosis into a
reviewable, testable code change.

## Platform safeguards

| Safeguard | Benefit |
| --- | --- |
| Focused issue | Gives Copilot an explicit scope and acceptance criteria. |
| Path-specific Copilot instructions | Applies App Service conventions automatically when Copilot edits this track. |
| Endpoint tests | Protects the public HTTP contracts learners review. |
| Pull-request CI | Blocks merging when the application tests or quality gate fail. |
| Changed-line coverage | Requires every changed executable application line to be exercised without demanding 100% legacy coverage. |

The coverage gate applies to changed C# application lines under
`workshops/appservice/src`. Generated Razor code, test code, documentation, and
unchanged application lines are not part of the 100% threshold.

## Run the tests

From the repository root:

```bash
dotnet test workshops/appservice/tests/HandoverApp.Tests.csproj
```

The starting workshop intentionally expects `POST /api/feature` to fail.
The Copilot pull request must replace that broken-state assertion with the
exact successful endpoint contract while preserving the health and home-page
tests.

## Check changed-line coverage

The local coverage command uses `uvx` to run the same pinned tool as CI without
installing it globally. Fetch the comparison branch, generate Cobertura
coverage, and run the gate:

```bash
git fetch origin main
dotnet test workshops/appservice/tests/HandoverApp.Tests.csproj \
  --collect:"XPlat Code Coverage" \
  --results-directory workshops/appservice/TestResults \
  -- \
  DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=cobertura \
  DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.ExcludeByFile=**/*.razor

coverage_file="$(
  find workshops/appservice/TestResults \
    -name coverage.cobertura.xml \
    -print -quit
)"

if [[ -z "$coverage_file" ]]; then
  echo "Coverlet did not produce coverage.cobertura.xml." >&2
  exit 1
fi

uvx --from diff-cover==10.4.1 diff-cover "$coverage_file" \
  --compare-branch=origin/main \
  --fail-under=100 \
  --show-uncovered
```

`diff-cover` prints uncovered changed lines and exits nonzero when the result
is below 100%. Add behavior-focused tests instead of excluding application
code or weakening assertions.
````

- [ ] **Step 4: Ignore local coverage results**

Append this directly after the existing App Service `bin/` and `obj/` entries
in `.gitignore`:

```gitignore
workshops/appservice/TestResults/
```

- [ ] **Step 5: Validate the instruction scope and quality commands**

Run:

```bash
grep -F 'applyTo: "workshops/appservice/**"' .github/instructions/appservice.instructions.md
grep -F 'diff-cover==10.4.1' workshops/appservice/CODE_QUALITY.md
grep -F -- '--fail-under=100' workshops/appservice/CODE_QUALITY.md
grep -F 'workshops/appservice/TestResults/' .gitignore
git diff --check
```

Expected: each `grep` prints one match, and `git diff --check` exits 0 without
output.

- [ ] **Step 6: Run the documented application test**

Run:

```bash
dotnet test workshops/appservice/tests/HandoverApp.Tests.csproj
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit the quality guidance**

```bash
git add .github/instructions/appservice.instructions.md \
  workshops/appservice/CODE_QUALITY.md \
  .gitignore
git commit -m "docs(appservice): add code quality guidance"
```

### Task 3: Enforce changed-line coverage in App Service CI

**Files:**
- Modify: `.github/workflows/validate-appservice-app.yml:22-31`

- [ ] **Step 1: Establish the current test baseline**

Run:

```bash
dotnet test workshops/appservice/tests/HandoverApp.Tests.csproj
```

Expected: 3 tests pass, including the test that documents the intentionally
unfinished endpoint.

- [ ] **Step 2: Replace the validation job steps**

Keep the workflow name, triggers, path filters, permissions, job name, and
runner unchanged. Replace `jobs.validate.steps` with:

```yaml
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup .NET 10
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'

      - name: Setup Python
        if: github.event_name == 'pull_request'
        uses: actions/setup-python@v5
        with:
          python-version: '3.13'

      - name: Fetch pull request base
        if: github.event_name == 'pull_request'
        run: >-
          git fetch --no-tags origin
          "+refs/heads/${{ github.base_ref }}:refs/remotes/origin/${{ github.base_ref }}"

      - name: Test application with coverage
        shell: bash
        run: |
          dotnet test workshops/appservice/tests/HandoverApp.Tests.csproj \
            --collect:"XPlat Code Coverage" \
            --results-directory workshops/appservice/TestResults \
            -- \
            DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=cobertura \
            DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.ExcludeByFile=**/*.razor

          coverage_file="$(
            find workshops/appservice/TestResults \
              -name coverage.cobertura.xml \
              -print -quit
          )"

          if [[ -z "$coverage_file" ]]; then
            echo "Coverlet did not produce coverage.cobertura.xml." >&2
            exit 1
          fi

          echo "COVERAGE_FILE=$coverage_file" >> "$GITHUB_ENV"

      - name: Install changed-line coverage tool
        if: github.event_name == 'pull_request'
        run: python -m pip install diff-cover==10.4.1

      - name: Enforce 100% changed-line coverage
        if: github.event_name == 'pull_request'
        run: >-
          diff-cover "$COVERAGE_FILE"
          --compare-branch="origin/${{ github.base_ref }}"
          --fail-under=100
          --show-uncovered
```

The pull-request-only conditions are required because `github.base_ref` is
empty for the workflow's `push` event. Tests and coverage generation continue
to run for both events; only comparison against a pull-request base is
conditional.

- [ ] **Step 3: Generate the same coverage report locally**

Run:

```bash
dotnet test workshops/appservice/tests/HandoverApp.Tests.csproj \
  --collect:"XPlat Code Coverage" \
  --results-directory workshops/appservice/TestResults \
  -- \
  DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=cobertura \
  DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.ExcludeByFile=**/*.razor
```

Expected: 3 tests pass and the output includes an attachment named
`coverage.cobertura.xml`.

- [ ] **Step 4: Verify that coverage contains application C# only**

Run:

```bash
coverage_file="$(
  find workshops/appservice/TestResults \
    -name coverage.cobertura.xml \
    -print -quit
)"
test -n "$coverage_file"
grep -F 'Program.cs' "$coverage_file"
if grep -Fq '.razor' "$coverage_file"; then
  echo "Razor sources must not be included in the changed-line gate." >&2
  exit 1
fi
```

Expected: `Program.cs` coverage is printed and the command exits 0 without the
Razor error.

- [ ] **Step 5: Exercise the pinned diff-cover command**

Run:

```bash
coverage_file="$(
  find workshops/appservice/TestResults \
    -name coverage.cobertura.xml \
    -print -quit
)"
uvx --from diff-cover==10.4.1 diff-cover "$coverage_file" \
  --compare-branch=HEAD \
  --fail-under=100 \
  --show-uncovered
```

Expected: `diff-cover` exits 0. The comparison intentionally has no
application diff; this step verifies report-path compatibility and command
syntax. Pull-request CI supplies the real base-branch diff.

- [ ] **Step 6: Review workflow safety**

Run:

```bash
grep -F 'fetch-depth: 0' .github/workflows/validate-appservice-app.yml
grep -F "if: github.event_name == 'pull_request'" .github/workflows/validate-appservice-app.yml
grep -F 'diff-cover==10.4.1' .github/workflows/validate-appservice-app.yml
grep -F -- '--fail-under=100' .github/workflows/validate-appservice-app.yml
git diff --check
```

Expected: all required settings are printed and `git diff --check` exits 0
without output.

- [ ] **Step 7: Commit the workflow enhancement**

```bash
git add .github/workflows/validate-appservice-app.yml
git commit -m "ci(appservice): enforce changed-line coverage"
```

### Task 4: Document the fallback and converged handoff

**Files:**
- Modify:
  `workshops/appservice/scenarios/cloud-agent-handover/README.md:11-46`
- Modify: `workshops/appservice/docs/90-watch-sre-agent.md:1-80`

- [ ] **Step 1: Verify that neither walkthrough exposes the fallback**

Run:

```bash
if grep -Fq 'sample-issue.md' workshops/appservice/scenarios/cloud-agent-handover/README.md; then
  exit 1
fi
if grep -Fq 'sample-issue.md' workshops/appservice/docs/90-watch-sre-agent.md; then
  exit 1
fi
```

Expected: exit status 0.

- [ ] **Step 2: Add the fallback to the scenario README**

Insert this section after **Trigger the incident** and before **Watch the
handoff**:

```markdown
## Run without Azure infrastructure

If Azure infrastructure or SRE Agent is unavailable, start at the GitHub
handoff:

1. Open [`sample-issue.md`](./sample-issue.md).
2. Review the proposed issue as the explicit approval gate.
3. Open a blank GitHub issue and use the sample heading as its title.
4. Copy the remaining sample Markdown into the issue body and submit it
   without an assignee.
5. Review the created issue, then manually assign it to Copilot
   (`copilot-swe-agent`).

This fallback represents the possible output of an SRE Agent investigation; it
does not claim that Azure telemetry was collected. Continue with the Copilot
pull request and CI steps below. Without deployed infrastructure, stop after
the GitHub review and merge; do not claim Azure recovery.
```

Replace the existing **Watch the handoff** numbered list with:

```markdown
## Watch the handoff

The Azure and GitHub-only paths converge when Copilot is assigned:

1. The Copilot coding agent creates the fix pull request.
2. **Validate App Service Application** runs the endpoint tests and enforces
   100% coverage for changed executable application lines.
3. The operator reviews the source, tests, and CI result.
4. The operator merges the pull request.
5. If infrastructure exists, the OIDC-based **Deploy App Service
   Application** workflow deploys the merged code.

There is no manual kill switch or remediation script. The pull request is the
intended recovery path. When using Azure, the SRE Agent must still investigate,
request approval, and create the issue before this common flow begins.
```

- [ ] **Step 3: Restructure Module 90 around the two entry paths**

Replace `workshops/appservice/docs/90-watch-sre-agent.md` with:

````markdown
# Module 90: Watch the handover

Use the Azure path when infrastructure and SRE Agent are available. Otherwise,
use the GitHub-only fallback to demonstrate the same issue, Copilot pull
request, and CI controls without claiming that an Azure investigation ran.

Both paths require an explicit review before Copilot is assigned. There is no
kill switch or direct remediation command.

## Path A: Run the Azure scenario

Keep the application, SRE Agent portal, and generated GitHub repository open.
The services evaluate telemetry asynchronously, so follow state changes rather
than expecting a fixed timeline.

1. Open the application URL printed by setup.
2. Select **Run unfinished feature** once. The page sends six
   `POST /api/feature` requests; the starting app returns HTTP 500.
3. Wait for Azure Monitor to evaluate the failures and for an incident to
   appear in SRE Agent.
4. Open the investigation and look for correlated evidence:
   - Failed `POST /api/feature` requests.
   - `NotImplementedException` telemetry.
   - The unfinished handler and its test in the connected repository.
5. Review the diagnosis. When the agent asks, explicitly approve creation of
   the handover issue.
6. Open `https://github.com/<owner>/<repository>/issues`. Confirm that one
   issue contains the expected HTTP 200 contract and is assigned to **Copilot**
   (`copilot-swe-agent`).

Continue at [Review the Copilot pull request](#review-the-copilot-pull-request).

## Path B: Run the GitHub-only fallback

Use this path only when Azure infrastructure or SRE Agent is unavailable.

1. Open the scenario's
   [`sample-issue.md`](../scenarios/cloud-agent-handover/sample-issue.md).
2. Review the sample as the explicit approval gate. It represents possible SRE
   Agent output; it is not evidence that Azure telemetry was collected.
3. Open `https://github.com/<owner>/<repository>/issues/new`.
4. Use the sample heading as the issue title and copy the remaining Markdown
   into the issue body.
5. Submit the issue without an assignee.
6. Review the created issue, then manually assign it to **Copilot**
   (`copilot-swe-agent`).

If blank issues are unavailable, verify that repository issues are enabled and
that you have permission to create one. If Copilot cannot be assigned, verify
Copilot coding agent availability and repository policy; do not silently skip
the handoff or substitute a human assignee.

## Review the Copilot pull request

1. Wait for the GitHub Copilot coding agent to open a pull request.
2. Confirm that changes stay within App Service source and tests.
3. Open **Validate App Service Application** and confirm that endpoint tests
   pass and changed-line coverage is 100%.
4. If coverage fails, review the uncovered lines printed by `diff-cover` and
   request behavior-focused tests. Do not weaken assertions or exclude
   application code.
5. Review and merge the pull request to `main`.

The SRE Agent or learner creates the approved issue; neither writes the fix nor
opens the pull request. Repository and App Service Copilot instructions guide
the coding agent, while CI provides an independent merge gate.

## Observe deployment

Complete this section only for Path A.

Open
`https://github.com/<owner>/<repository>/actions/workflows/deploy-appservice-app.yml`.
Confirm that **Deploy App Service Application** started automatically for the
merge and completed successfully.

You can also inspect the latest run from the repository root:

```bash
gh run list --workflow deploy-appservice-app.yml --limit 1
```

For Path B without infrastructure, stop after GitHub review and merge. Do not
run the endpoint validator or claim that the incident recovered in Azure.

## Validate Azure recovery

After the Path A deployment completes, run the scenario validator.

Bash:

```bash
workshops/appservice/scenarios/cloud-agent-handover/validate.sh
```

PowerShell 7:

```powershell
./workshops/appservice/scenarios/cloud-agent-handover/validate.ps1
```

If you chose a custom workload, pass its resource group:

```bash
workshops/appservice/scenarios/cloud-agent-handover/validate.sh \
  --resource-group "rg-<workload>"
```

```powershell
./workshops/appservice/scenarios/cloud-agent-handover/validate.ps1 `
  -ResourceGroup "rg-<workload>"
```

Success prints:

```text
Healthy: POST /api/feature returned the implemented HTTP 200 contract.
```

Refresh the application and run the button again to observe HTTP 200. Confirm
`GET /health` still succeeds. Azure Monitor clears the alert after its query
window no longer contains matching failures; then close the issue or incident
if your configured process requires it.

Next: [Clean up](./99-cleanup.md).
````

- [ ] **Step 4: Verify both paths and their stopping points**

Run:

```bash
grep -F 'sample-issue.md' workshops/appservice/scenarios/cloud-agent-handover/README.md
grep -F 'Path A: Run the Azure scenario' workshops/appservice/docs/90-watch-sre-agent.md
grep -F 'Path B: Run the GitHub-only fallback' workshops/appservice/docs/90-watch-sre-agent.md
grep -F 'Do not run the endpoint validator or claim that the incident recovered in Azure.' workshops/appservice/docs/90-watch-sre-agent.md
git diff --check
```

Expected: all required text is printed and `git diff --check` exits 0 without
output.

- [ ] **Step 5: Commit the workshop flow**

```bash
git add workshops/appservice/scenarios/cloud-agent-handover/README.md \
  workshops/appservice/docs/90-watch-sre-agent.md
git commit -m "docs(appservice): add GitHub-only handoff path"
```

### Task 5: Validate the complete platform demo

**Files:**
- Verify all files changed in Tasks 1-4.

- [ ] **Step 1: Run the App Service tests with the final coverage settings**

Run:

```bash
dotnet test workshops/appservice/tests/HandoverApp.Tests.csproj \
  --collect:"XPlat Code Coverage" \
  --results-directory workshops/appservice/TestResults \
  -- \
  DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=cobertura \
  DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.ExcludeByFile=**/*.razor
```

Expected: 3 tests pass and Coverlet attaches `coverage.cobertura.xml`.

- [ ] **Step 2: Run changed-line coverage against the base branch**

Run:

```bash
git fetch origin main
coverage_file="$(
  find workshops/appservice/TestResults \
    -name coverage.cobertura.xml \
    -print -quit
)"
test -n "$coverage_file"
uvx --from diff-cover==10.4.1 diff-cover "$coverage_file" \
  --compare-branch=origin/main \
  --fail-under=100 \
  --show-uncovered
```

Expected: exit status 0. This implementation changes no application source, so
the report contains no uncovered changed executable application lines.

- [ ] **Step 3: Validate scenario consistency**

Run:

```bash
scripts/validate-scenarios.sh
```

Expected: output ends with `Scenario validation passed`.

- [ ] **Step 4: Check exact contracts and repository cleanliness**

Run:

```bash
grep -F '{"status":"completed","message":"The unfinished feature is now implemented."}' \
  workshops/appservice/scenarios/cloud-agent-handover/sample-issue.md
grep -F 'applyTo: "workshops/appservice/**"' \
  .github/instructions/appservice.instructions.md
grep -F 'diff-cover==10.4.1' \
  .github/workflows/validate-appservice-app.yml
git diff --check
git status --short
```

Expected:

- The exact endpoint contract is printed.
- The App Service instruction scope is printed.
- The pinned coverage version is printed.
- `git diff --check` has no output.
- `git status --short` has no output because each task was committed.

- [ ] **Step 5: Inspect the commit sequence**

Run:

```bash
git --no-pager log -4 --oneline
```

Expected: the four task subjects appear in reverse chronological order:
`docs(appservice): add GitHub-only handoff path`,
`ci(appservice): enforce changed-line coverage`,
`docs(appservice): add code quality guidance`, and
`docs(appservice): add fallback SRE issue`.
