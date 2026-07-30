# App Service code quality

The handover demonstrates how GitHub turns an incident diagnosis into a
reviewable, testable code change.

## Platform safeguards

| Safeguard | Benefit |
| --- | --- |
| Focused issue | Gives Copilot an explicit scope and acceptance criteria. |
| Path-specific Copilot instructions | Applies App Service conventions automatically when Copilot edits this scenario. |
| Endpoint tests | Protects the public HTTP contracts learners review. |
| Pull-request CI | Blocks merging when the application tests or quality gate fail. |
| Changed-line coverage | Requires every changed executable application line to be exercised without demanding 100% legacy coverage. |
| CodeQL code scanning | Detects security vulnerabilities in the C# application and its deployment workflows. |

The coverage gate applies to changed C# application lines under
`scenarios/cloud-agent-handover/src`. Generated Razor code, test code, documentation, and
unchanged application lines are not part of the 100% threshold.

**CodeQL Cloud Agent Handover** analyzes only
`scenarios/cloud-agent-handover/src` and the CodeQL, validation, and deployment
workflows for this scenario. It runs C# and GitHub Actions scans in parallel
with the application validation workflow for relevant pull requests and `main`
pushes. It also scans weekly so new CodeQL checks apply even when the
application does not change. Review a clean CodeQL result with the endpoint
tests and changed-line coverage before merging.

## Run the tests

From the repository root:

```bash
dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
```

The starting scenario intentionally expects `POST /api/feature` to fail.
The Copilot pull request must replace that broken-state assertion with the
exact successful endpoint contract while preserving the health and home-page
tests.

## Check changed-line coverage

The local coverage command uses `uvx` to run the same pinned tool as CI without
installing it globally. Fetch the comparison branch, generate Cobertura
coverage, and run the gate:

```bash
git fetch origin main
rm -rf scenarios/cloud-agent-handover/TestResults
dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj \
  --collect:"XPlat Code Coverage" \
  --results-directory scenarios/cloud-agent-handover/TestResults \
  -- \
  DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=cobertura \
  DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.ExcludeByFile=**/*.razor

coverage_file="$(
  find scenarios/cloud-agent-handover/TestResults \
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
