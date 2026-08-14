# Cloud Agent Handover Local Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Cloud Agent Handover scenario's failing automatic Azure deployment with an explicit local Bash or PowerShell deployment after merge.

**Architecture:** Pull-request workflows continue to validate the Copilot change, while the learner deploys the reviewed `main` checkout through Azure CLI. The scenario infrastructure no longer creates a GitHub OIDC identity or role assignment, and setup retains only non-credential repository metadata.

**Tech Stack:** Bash, PowerShell 7, Azure CLI, .NET 10, Node.js test runner, Bicep, GitHub Actions, Markdown.

---

## File Structure

- Create `scenarios/cloud-agent-handover/scripts/deploy.sh`: test, publish, zip, and deploy the current checkout through Azure CLI.
- Create `scenarios/cloud-agent-handover/scripts/deploy.ps1`: PowerShell equivalent of the Bash deployment helper.
- Modify `scripts/scenario-tools/test/cloud-agent-handover-setup.test.js`: enforce the local deployment contract and absence of CI deployment credentials.
- Modify `scenarios/cloud-agent-handover/scripts/setup.sh`: remove OIDC identity outputs and credential variables while preserving resource metadata.
- Modify `scenarios/cloud-agent-handover/scripts/setup.ps1`: PowerShell setup equivalent.
- Modify `scenarios/cloud-agent-handover/infra/bicep/main.bicep`: remove the GitHub deployment identity module and repository parameter.
- Modify `scenarios/cloud-agent-handover/infra/bicep/main.bicepparam`: remove the repository parameter.
- Delete `scenarios/cloud-agent-handover/infra/bicep/modules/identity.bicep`: remove unused deployment identity resources.
- Delete `.github/workflows/deploy-appservice-app.yml`: remove automatic application deployment.
- Modify `.github/workflows/preview-cloud-agent-handover-infra.yml`: stop passing the removed Bicep parameter.
- Modify `.github/workflows/codeql-cloud-agent-handover.yml`: remove the deleted workflow from path filters.
- Modify scenario and shared Markdown files: document pull, local deploy, validation, reduced permissions, and cleanup.
- Modify `scenarios/cloud-agent-handover/scenario.yaml`: change the learning objective from OIDC deployment to operator deployment.
- Regenerate `README.md`: update the generated catalog after the manifest change.

### Task 1: Add local deployment helpers

**Files:**
- Create: `scenarios/cloud-agent-handover/scripts/deploy.sh`
- Create: `scenarios/cloud-agent-handover/scripts/deploy.ps1`
- Test: `scripts/scenario-tools/test/cloud-agent-handover-setup.test.js`

- [ ] **Step 1: Write the failing deployment-helper contract test**

Update the Node imports:

```js
import { readFileSync, statSync } from 'node:fs';
```

Append:

```js
test('Cloud Agent Handover deploy helpers publish the current checkout through Azure CLI', () => {
  const bashPath = resolve(
    repositoryRoot,
    'scenarios/cloud-agent-handover/scripts/deploy.sh'
  );
  const powershellPath = resolve(
    repositoryRoot,
    'scenarios/cloud-agent-handover/scripts/deploy.ps1'
  );
  const bashDeploy = readFileSync(bashPath, 'utf8');
  const powershellDeploy = readFileSync(powershellPath, 'utf8');

  assert.notEqual(statSync(bashPath).mode & 0o111, 0);
  assert.match(bashDeploy, /dotnet test/);
  assert.match(bashDeploy, /dotnet publish/);
  assert.match(bashDeploy, /az webapp deploy/);
  assert.match(bashDeploy, /--type zip/);
  assert.match(powershellDeploy, /"dotnet"[\s\S]*"test"/);
  assert.match(powershellDeploy, /"dotnet"[\s\S]*"publish"/);
  assert.match(powershellDeploy, /"webapp", "deploy"/);
  assert.match(powershellDeploy, /"--type", "zip"/);
  for (const script of [bashDeploy, powershellDeploy]) {
    assert.doesNotMatch(script, /\bgit\s+(?:fetch|pull|checkout|switch|merge|reset)\b/i);
  }
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm --prefix scripts/scenario-tools test -- \
  test/cloud-agent-handover-setup.test.js
```

Expected: FAIL because `scripts/deploy.sh` and `scripts/deploy.ps1` do not exist.

- [ ] **Step 3: Implement the Bash deployment helper**

Create `scenarios/cloud-agent-handover/scripts/deploy.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-srelabapp}"
WEB_APP="${AZURE_WEBAPP_NAME:-}"
PUBLISH_DIR=""

usage() {
  cat <<'EOF'
Usage: deploy.sh [-g|--resource-group <name>] [-a|--app-name <name>] [-s|--subscription-id <id>]

Deploys the Cloud Agent Handover application from the current checkout.

Options:
  -g, --resource-group  Azure resource group (default: AZURE_RESOURCE_GROUP or rg-srelabapp)
  -a, --app-name       App Service name (default: AZURE_WEBAPP_NAME or the first app in the resource group)
  -s, --subscription-id Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
  -h, --help           Show this help
EOF
}

require_option_value() {
  local option="$1"
  local value="${2:-}"

  if [ -z "$value" ] || [[ "$value" == -* ]]; then
    echo "Missing value for $option." >&2
    usage >&2
    exit 2
  fi
}

cleanup_temp() {
  if [ -n "$PUBLISH_DIR" ] && [ -d "$PUBLISH_DIR" ]; then
    rm -rf -- "$PUBLISH_DIR"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -g|--resource-group)
      require_option_value "$1" "${2:-}"
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    -a|--app-name)
      require_option_value "$1" "${2:-}"
      WEB_APP="$2"
      shift 2
      ;;
    -s|--subscription-id)
      require_option_value "$1" "${2:-}"
      export AZURE_SUBSCRIPTION_ID="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

for required_command in az dotnet zip; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../../.." && pwd)
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"

if [ -n "$requested_subscription_id" ] &&
  ! az account set --subscription "$requested_subscription_id"; then
  echo "Unable to select Azure subscription '$requested_subscription_id'. Run 'az login', then run: az account set --subscription \"$requested_subscription_id\"" >&2
  exit 1
fi

active_subscription_id=$(az account show --query id --output tsv) || {
  echo "Azure CLI is not authenticated. Run 'az login' and try again." >&2
  exit 1
}
active_subscription_name=$(az account show --query name --output tsv) || {
  echo "Unable to read the active Azure subscription name." >&2
  exit 1
}

if [ -z "$active_subscription_id" ] || [ -z "$active_subscription_name" ]; then
  echo "Unable to read the active Azure subscription. Run 'az login' and try again." >&2
  exit 1
fi

if [ -n "$requested_subscription_id" ] &&
  [ "$active_subscription_id" != "$requested_subscription_id" ]; then
  echo "Azure subscription mismatch: requested '$requested_subscription_id', but active subscription is '$active_subscription_id'." >&2
  exit 1
fi

echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

if [ "$(az group exists --name "$RESOURCE_GROUP" --output tsv)" != "true" ]; then
  echo "Resource group not found: $RESOURCE_GROUP" >&2
  exit 1
fi

if [ -z "$WEB_APP" ]; then
  WEB_APP=$(az webapp list \
    --resource-group "$RESOURCE_GROUP" \
    --query '[0].name' \
    --output tsv)
fi

if [ -z "$WEB_APP" ]; then
  echo "No web app found in $RESOURCE_GROUP." >&2
  exit 1
fi

cd "$REPO_ROOT"
PUBLISH_DIR=$(mktemp -d)
trap cleanup_temp EXIT

dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
dotnet publish scenarios/cloud-agent-handover/src/HandoverApp.csproj \
  --configuration Release \
  --output "$PUBLISH_DIR/publish"
(cd "$PUBLISH_DIR/publish" && zip -qr "$PUBLISH_DIR/app.zip" .)

az webapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP" \
  --src-path "$PUBLISH_DIR/app.zip" \
  --type zip \
  --output none

HOST=$(az webapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP" \
  --query defaultHostName \
  --output tsv)

echo "Application deployed from the current checkout."
echo "Application: https://$HOST"
echo "Health:      https://$HOST/health"
```

Make it executable:

```bash
chmod +x scenarios/cloud-agent-handover/scripts/deploy.sh
```

- [ ] **Step 4: Implement the PowerShell deployment helper**

Create `scenarios/cloud-agent-handover/scripts/deploy.ps1` with:

```powershell
#!/usr/bin/env pwsh
param(
    [string]$ResourceGroup = $(if ($env:AZURE_RESOURCE_GROUP) { $env:AZURE_RESOURCE_GROUP } else { "rg-srelabapp" }),
    [string]$AppName = $env:AZURE_WEBAPP_NAME,
    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID
)

$ErrorActionPreference = "Stop"

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory)]
        [string]$Command,

        [string[]]$Arguments = @(),

        [switch]$DiscardOutput
    )

    if ($DiscardOutput) {
        & $Command @Arguments *> $null
        $output = $null
    }
    else {
        $output = & $Command @Arguments
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Command '$Command' failed with exit code $LASTEXITCODE."
    }

    return $output
}

foreach ($requiredCommand in @("az", "dotnet")) {
    if (-not (Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $requiredCommand"
    }
}

if (-not [string]::IsNullOrWhiteSpace($SubscriptionId)) {
    Invoke-NativeCommand -Command "az" -Arguments @(
        "account", "set", "--subscription", $SubscriptionId
    ) -DiscardOutput
}

$activeSubscriptionId = [string](Invoke-NativeCommand -Command "az" -Arguments @(
    "account", "show", "--query", "id", "--output", "tsv"
))
$activeSubscriptionName = [string](Invoke-NativeCommand -Command "az" -Arguments @(
    "account", "show", "--query", "name", "--output", "tsv"
))
$activeSubscriptionId = $activeSubscriptionId.Trim()
$activeSubscriptionName = $activeSubscriptionName.Trim()

if ([string]::IsNullOrWhiteSpace($activeSubscriptionId) -or
    [string]::IsNullOrWhiteSpace($activeSubscriptionName)) {
    throw "Unable to read the active Azure subscription. Run 'az login' and try again."
}

if (-not [string]::IsNullOrWhiteSpace($SubscriptionId) -and
    $activeSubscriptionId -cne $SubscriptionId) {
    throw "Azure subscription mismatch: requested '$SubscriptionId', but active subscription is '$activeSubscriptionId'."
}

Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

$resourceGroupExists = [string](Invoke-NativeCommand -Command "az" -Arguments @(
    "group", "exists", "--name", $ResourceGroup, "--output", "tsv"
))
if ($resourceGroupExists.Trim() -cne "true") {
    throw "Resource group not found: $ResourceGroup"
}

if ([string]::IsNullOrWhiteSpace($AppName)) {
    $AppName = [string](Invoke-NativeCommand -Command "az" -Arguments @(
        "webapp", "list",
        "--resource-group", $ResourceGroup,
        "--query", "[0].name",
        "--output", "tsv"
    ))
    $AppName = $AppName.Trim()
}

if ([string]::IsNullOrWhiteSpace($AppName)) {
    throw "No web app found in $ResourceGroup."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
$publishRoot = Join-Path ([System.IO.Path]::GetTempPath()) "sre-handover-$([Guid]::NewGuid())"
New-Item -ItemType Directory -Force -Path $publishRoot | Out-Null

Push-Location $repoRoot
try {
    Invoke-NativeCommand -Command "dotnet" -Arguments @(
        "test", "scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj"
    ) -DiscardOutput
    Invoke-NativeCommand -Command "dotnet" -Arguments @(
        "publish", "scenarios/cloud-agent-handover/src/HandoverApp.csproj",
        "--configuration", "Release",
        "--output", (Join-Path $publishRoot "publish")
    ) -DiscardOutput

    Compress-Archive `
        -Path (Join-Path $publishRoot "publish/*") `
        -DestinationPath (Join-Path $publishRoot "app.zip")

    Invoke-NativeCommand -Command "az" -Arguments @(
        "webapp", "deploy",
        "--resource-group", $ResourceGroup,
        "--name", $AppName,
        "--src-path", (Join-Path $publishRoot "app.zip"),
        "--type", "zip",
        "--output", "none"
    ) -DiscardOutput

    $hostName = [string](Invoke-NativeCommand -Command "az" -Arguments @(
        "webapp", "show",
        "--resource-group", $ResourceGroup,
        "--name", $AppName,
        "--query", "defaultHostName",
        "--output", "tsv"
    ))
    $hostName = $hostName.Trim()

    Write-Host "Application deployed from the current checkout."
    Write-Host "Application: https://$hostName"
    Write-Host "Health:      https://$hostName/health"
}
finally {
    Pop-Location
    if (Test-Path -LiteralPath $publishRoot) {
        Remove-Item -LiteralPath $publishRoot -Recurse -Force
    }
}
```

- [ ] **Step 5: Run the targeted test and script syntax checks**

Run:

```bash
npm --prefix scripts/scenario-tools test -- \
  test/cloud-agent-handover-setup.test.js
bash -n scenarios/cloud-agent-handover/scripts/deploy.sh
pwsh -NoProfile -Command \
  "[void][System.Management.Automation.Language.Parser]::ParseFile('scenarios/cloud-agent-handover/scripts/deploy.ps1',[ref]\$null,[ref]\$null)"
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the deployment helpers**

```bash
git add \
  scenarios/cloud-agent-handover/scripts/deploy.sh \
  scenarios/cloud-agent-handover/scripts/deploy.ps1 \
  scripts/scenario-tools/test/cloud-agent-handover-setup.test.js
git commit -m "feat: add local cloud handover deployment"
```

### Task 2: Remove automatic deployment credentials and workflow

**Files:**
- Modify: `scripts/scenario-tools/test/cloud-agent-handover-setup.test.js`
- Modify: `scenarios/cloud-agent-handover/scripts/setup.sh`
- Modify: `scenarios/cloud-agent-handover/scripts/setup.ps1`
- Modify: `scenarios/cloud-agent-handover/infra/bicep/main.bicep`
- Modify: `scenarios/cloud-agent-handover/infra/bicep/main.bicepparam`
- Delete: `scenarios/cloud-agent-handover/infra/bicep/modules/identity.bicep`
- Delete: `.github/workflows/deploy-appservice-app.yml`
- Modify: `.github/workflows/preview-cloud-agent-handover-infra.yml`
- Modify: `.github/workflows/codeql-cloud-agent-handover.yml`

- [ ] **Step 1: Write the failing automatic-deployment removal test**

Update the Node import:

```js
import { existsSync, readFileSync, statSync } from 'node:fs';
```

Replace the existing subscription persistence test with:

```js
test('Cloud Agent Handover setup verifies the requested Azure subscription', () => {
  const bashSetup = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/scripts/setup.sh'),
    'utf8'
  );

  assert.match(bashSetup, /requested_subscription_id="\$\{AZURE_SUBSCRIPTION_ID:-\}"/);
  assert.match(bashSetup, /Azure subscription mismatch/);
  assert.doesNotMatch(bashSetup, /AZURE_ACTIVE_SUBSCRIPTION_ID/);
});
```

Append:

```js
test('Cloud Agent Handover no longer provisions GitHub deployment credentials', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  const mainBicep = readFileSync(
    resolve(scenarioRoot, 'infra/bicep/main.bicep'),
    'utf8'
  );
  const bashSetup = readFileSync(resolve(scenarioRoot, 'scripts/setup.sh'), 'utf8');
  const powershellSetup = readFileSync(
    resolve(scenarioRoot, 'scripts/setup.ps1'),
    'utf8'
  );

  assert.equal(
    existsSync(resolve(repositoryRoot, '.github/workflows/deploy-appservice-app.yml')),
    false
  );
  assert.equal(
    existsSync(resolve(scenarioRoot, 'infra/bicep/modules/identity.bicep')),
    false
  );
  assert.doesNotMatch(mainBicep, /githubRepository|deploymentIdentity|deploymentClientId/);
  for (const setup of [bashSetup, powershellSetup]) {
    assert.doesNotMatch(setup, /AZURE_CLIENT_ID|AZURE_TENANT_ID/);
    assert.match(setup, /AZURE_RESOURCE_GROUP/);
    assert.match(setup, /AZURE_WEBAPP_NAME/);
  }
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm --prefix scripts/scenario-tools test -- \
  test/cloud-agent-handover-setup.test.js
```

Expected: FAIL because the workflow, identity module, Bicep references, and setup credential variables still exist.

- [ ] **Step 3: Remove the identity from Bicep**

In `scenarios/cloud-agent-handover/infra/bicep/main.bicep`:

1. Delete the `githubRepository` parameter.
2. Delete the `deploymentIdentity` module block.
3. Delete the `deploymentClientId` output.
4. Keep monitoring, App Service, and alert modules unchanged.

In `scenarios/cloud-agent-handover/infra/bicep/main.bicepparam`, delete:

```bicep
param githubRepository = 'owner/repository'
```

Delete:

```text
scenarios/cloud-agent-handover/infra/bicep/modules/identity.bicep
```

- [ ] **Step 4: Remove deployment credential handling from Bash setup**

In `scenarios/cloud-agent-handover/scripts/setup.sh`:

1. Remove `Microsoft.ManagedIdentity` from provider registration.
2. Remove `githubRepository="$REPOSITORY"` from the Bicep parameters.
3. Remove `TENANT_ID`, `SUBSCRIPTION_ID`, and `CLIENT_ID` assignments that only support the deployment workflow.
4. Remove the three repository variable writes:

```bash
gh variable set AZURE_CLIENT_ID --repo "$REPOSITORY" --body "$CLIENT_ID"
gh variable set AZURE_TENANT_ID --repo "$REPOSITORY" --body "$TENANT_ID"
gh variable set AZURE_SUBSCRIPTION_ID --repo "$REPOSITORY" --body "$SUBSCRIPTION_ID"
```

5. Preserve these metadata writes:

```bash
gh variable set AZURE_RESOURCE_GROUP --repo "$REPOSITORY" --body "$RESOURCE_GROUP"
gh variable set AZURE_WEBAPP_NAME --repo "$REPOSITORY" --body "$WEB_APP"
gh variable set AZURE_LOCATION --repo "$REPOSITORY" --body "$LOCATION"
gh variable set WORKLOAD_NAME --repo "$REPOSITORY" --body "$WORKLOAD"
```

- [ ] **Step 5: Remove deployment credential handling from PowerShell setup**

In `scenarios/cloud-agent-handover/scripts/setup.ps1`:

1. Remove the unused `az account show --output json` and `$account` conversion.
2. Remove `Microsoft.ManagedIdentity` from provider registration.
3. Remove `"githubRepository=$repository"` from Bicep arguments.
4. Remove `$subscriptionId`, `$tenantId`, `$clientId`, and the `deploymentClientId` output check.
5. Change the repository variable map to:

```powershell
foreach ($variable in ([ordered]@{
    AZURE_RESOURCE_GROUP = $resourceGroup
    AZURE_WEBAPP_NAME    = $webApp
    AZURE_LOCATION       = $Location
    WORKLOAD_NAME        = $Workload
}).GetEnumerator()) {
    Invoke-NativeCommand -Command "gh" -Arguments @(
        "variable", "set", $variable.Key,
        "--repo", $repository,
        "--body", [string]$variable.Value
    ) -DiscardOutput
}
```

- [ ] **Step 6: Remove and repair GitHub workflows**

Delete:

```text
.github/workflows/deploy-appservice-app.yml
```

In `.github/workflows/preview-cloud-agent-handover-infra.yml`, change the parameter tail from:

```yaml
              workloadName="$WORKLOAD" \
              githubRepository="${{ github.repository }}"
```

to:

```yaml
              workloadName="$WORKLOAD"
```

In both `push.paths` and `pull_request.paths` in
`.github/workflows/codeql-cloud-agent-handover.yml`, delete:

```yaml
      - '.github/workflows/deploy-appservice-app.yml'
```

- [ ] **Step 7: Run targeted tests and Bicep validation**

Run:

```bash
npm --prefix scripts/scenario-tools test -- \
  test/cloud-agent-handover-setup.test.js
bash -n scenarios/cloud-agent-handover/scripts/setup.sh
pwsh -NoProfile -Command \
  "[void][System.Management.Automation.Language.Parser]::ParseFile('scenarios/cloud-agent-handover/scripts/setup.ps1',[ref]\$null,[ref]\$null)"
az bicep build \
  --file scenarios/cloud-agent-handover/infra/bicep/main.bicep \
  --stdout >/dev/null
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit the deployment infrastructure cleanup**

```bash
git add \
  .github/workflows/codeql-cloud-agent-handover.yml \
  .github/workflows/preview-cloud-agent-handover-infra.yml \
  .github/workflows/deploy-appservice-app.yml \
  scenarios/cloud-agent-handover/infra/bicep/main.bicep \
  scenarios/cloud-agent-handover/infra/bicep/main.bicepparam \
  scenarios/cloud-agent-handover/infra/bicep/modules/identity.bicep \
  scenarios/cloud-agent-handover/scripts/setup.sh \
  scenarios/cloud-agent-handover/scripts/setup.ps1 \
  scripts/scenario-tools/test/cloud-agent-handover-setup.test.js
git commit -m "fix: remove cloud handover deployment identity"
```

### Task 3: Update the scenario contract and learner flow

**Files:**
- Modify: `scripts/scenario-tools/test/cloud-agent-handover-setup.test.js`
- Modify: `scenarios/cloud-agent-handover/scenario.yaml`
- Modify: `scenarios/cloud-agent-handover/README.md`
- Modify: `scenarios/cloud-agent-handover/docs/00-prerequisites.md`
- Modify: `scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md`
- Modify: `scenarios/cloud-agent-handover/docs/02-deploy-application.md`
- Modify: `scenarios/cloud-agent-handover/docs/90-watch-sre-agent.md`
- Modify: `scenarios/cloud-agent-handover/docs/99-cleanup.md`
- Modify: `scenarios/cloud-agent-handover/knowledge/operational-guidelines.md`
- Modify: `scenarios/cloud-agent-handover/CODE_QUALITY.md`
- Modify: `docs/02-how-it-works.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Write the failing documentation contract test**

Append:

```js
test('Cloud Agent Handover documents operator-controlled local deployment', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  const readme = readFileSync(resolve(scenarioRoot, 'README.md'), 'utf8');
  const handoverGuide = readFileSync(
    resolve(scenarioRoot, 'docs/90-watch-sre-agent.md'),
    'utf8'
  );
  const operationalGuidance = readFileSync(
    resolve(scenarioRoot, 'knowledge/operational-guidelines.md'),
    'utf8'
  );

  for (const document of [readme, handoverGuide, operationalGuidance]) {
    assert.match(document, /local/i);
    assert.match(document, /deploy\.(?:sh|ps1)/i);
    assert.doesNotMatch(document, /OIDC-based.*Deploy Cloud Agent Handover/is);
  }
  assert.match(handoverGuide, /git pull/i);
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm --prefix scripts/scenario-tools test -- \
  test/cloud-agent-handover-setup.test.js
```

Expected: FAIL because the current docs still describe automatic OIDC deployment.

- [ ] **Step 3: Update prerequisites and setup documentation**

In `scenarios/cloud-agent-handover/docs/00-prerequisites.md`:

- Replace the OIDC-specific template rationale with the need for a generated repository that Copilot can modify.
- Reduce Azure access to **Contributor** at the scenario resource-group scope or broader.
- Remove **Owner** / **User Access Administrator** and role-assignment checklist items.
- Remove `Microsoft.ManagedIdentity` provider implications.
- State that the learner's Azure CLI identity performs both initial and recovery deployments.

In `scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md`:

- Change the setup action list to App Service, monitoring, alert, initial test/publish/deploy, and four metadata variables.
- Remove managed identity, FIC, Website Contributor, and credential variable steps.
- Remove the role-assignment troubleshooting section.
- Keep the GitHub CLI variable permission troubleshooting because metadata variables are still written.

- [ ] **Step 4: Update the learner recovery instructions**

In `scenarios/cloud-agent-handover/docs/02-deploy-application.md`, replace
“How the recovery deploys” with:

```markdown
## How the recovery deploys

The initial deployment came from local setup. After the Copilot pull request is
reviewed and merged, update your local `main` checkout and run the scenario's
local deployment helper. The helper tests and publishes exactly the code
currently checked out, then deploys the zip bundle with your authenticated
Azure CLI session. It does not pull or change branches for you.
```

In `scenarios/cloud-agent-handover/docs/90-watch-sre-agent.md`:

- Replace “Observe deployment” with “Update and deploy the merged code”.
- Require a clean local checkout before branch switching.
- Show:

```bash
git switch main
git pull --ff-only
scenarios/cloud-agent-handover/scripts/deploy.sh
```

and:

```powershell
git switch main
git pull --ff-only
scenarios/cloud-agent-handover/scripts/deploy.ps1
```

- Add custom workload examples using `--resource-group` and `-ResourceGroup`.
- State that the deploy helper uses the current checkout and authenticated Azure CLI identity.
- Keep Path B stopping after merge without claiming Azure recovery.
- Run the existing validator only after local deployment succeeds.

- [ ] **Step 5: Update scenario overview, policy, and cleanup**

In `scenarios/cloud-agent-handover/README.md`:

- Change step 5 under “Watch the handoff” to local operator deployment.
- Add Bash and PowerShell deploy commands before validation.
- State that learners pull merged `main` before deploying.

In `scenarios/cloud-agent-handover/knowledge/operational-guidelines.md`:

- Preserve the rule that SRE Agent and Copilot do not deploy.
- Change recovery step 3 to the operator updating local `main` and running `deploy.sh` or `deploy.ps1`.
- Validate only after local deployment.

In `scenarios/cloud-agent-handover/docs/99-cleanup.md`:

- Remove managed identity and FIC from the resource-group contents.
- Limit optional repository variable cleanup to:

```text
AZURE_RESOURCE_GROUP
AZURE_WEBAPP_NAME
AZURE_LOCATION
WORKLOAD_NAME
```

In `scenarios/cloud-agent-handover/CODE_QUALITY.md`, change the CodeQL description
from deployment workflows to the remaining validation and CodeQL workflows.

- [ ] **Step 6: Update shared repository guidance and manifest**

In `scenarios/cloud-agent-handover/scenario.yaml`, replace:

```yaml
  - Merge the Cloud Agent pull request and use the OIDC deployment to recover.
```

with:

```yaml
  - Merge the Cloud Agent pull request and deploy the reviewed change locally.
```

In `docs/02-how-it-works.md`, change the Cloud Agent Handover recovery model to:

```markdown
- **Cloud Agent Handover:** the SRE Agent first asks for approval to create one
  unassigned issue. A learner reviews it and assigns `copilot-swe-agent`;
  GitHub Copilot creates a pull request; a human reviews and merges it; an
  operator updates the local `main` checkout and deploys the reviewed
  application through the scenario helper.
```

In `CONTRIBUTING.md`, replace both automatic-deployment statements with the
operator-controlled local deployment model and name the new helper scripts.

- [ ] **Step 7: Run the targeted documentation test**

Run:

```bash
npm --prefix scripts/scenario-tools test -- \
  test/cloud-agent-handover-setup.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit the scenario contract update**

```bash
git add \
  CONTRIBUTING.md \
  docs/02-how-it-works.md \
  scenarios/cloud-agent-handover/CODE_QUALITY.md \
  scenarios/cloud-agent-handover/README.md \
  scenarios/cloud-agent-handover/docs/00-prerequisites.md \
  scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md \
  scenarios/cloud-agent-handover/docs/02-deploy-application.md \
  scenarios/cloud-agent-handover/docs/90-watch-sre-agent.md \
  scenarios/cloud-agent-handover/docs/99-cleanup.md \
  scenarios/cloud-agent-handover/knowledge/operational-guidelines.md \
  scenarios/cloud-agent-handover/scenario.yaml \
  scripts/scenario-tools/test/cloud-agent-handover-setup.test.js
git commit -m "docs: document local cloud handover recovery"
```

### Task 4: Regenerate and verify the repository

**Files:**
- Modify: `README.md` through the scenario catalog generator.

- [ ] **Step 1: Regenerate the canonical scenario catalog**

Run:

```bash
scripts/validate-scenarios.sh --write
```

Expected: `README.md` reflects the updated Cloud Agent Handover learning objective without manual catalog edits.

- [ ] **Step 2: Run the scenario-tool test suite**

Run:

```bash
npm --prefix scripts/scenario-tools test
```

Expected: all Node tests pass.

- [ ] **Step 3: Run application tests**

Run:

```bash
dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
```

Expected: all endpoint tests pass for the repository's current application state.

- [ ] **Step 4: Run script syntax validation**

Run:

```bash
bash -n \
  scenarios/cloud-agent-handover/scripts/setup.sh \
  scenarios/cloud-agent-handover/scripts/deploy.sh
pwsh -NoProfile -Command \
  "[void][System.Management.Automation.Language.Parser]::ParseFile('scenarios/cloud-agent-handover/scripts/setup.ps1',[ref]\$null,[ref]\$null); [void][System.Management.Automation.Language.Parser]::ParseFile('scenarios/cloud-agent-handover/scripts/deploy.ps1',[ref]\$null,[ref]\$null)"
```

Expected: both commands exit 0.

- [ ] **Step 5: Run Bicep validation**

Run:

```bash
az bicep build \
  --file scenarios/cloud-agent-handover/infra/bicep/main.bicep \
  --stdout >/dev/null
```

Expected: exit 0 with no Bicep compilation errors.

- [ ] **Step 6: Run final scenario validation**

Run:

```bash
scripts/validate-scenarios.sh
```

Expected: output includes `Scenario validation passed`.

- [ ] **Step 7: Confirm obsolete deployment references are gone**

Run:

```bash
rg -n \
  'Deploy Cloud Agent Handover Application|OIDC-based|deploymentClientId|github-main|AZURE_CLIENT_ID|AZURE_TENANT_ID' \
  scenarios/cloud-agent-handover \
  .github/workflows/codeql-cloud-agent-handover.yml \
  .github/workflows/preview-cloud-agent-handover-infra.yml \
  CONTRIBUTING.md \
  docs/02-how-it-works.md
```

Expected: no matches.

- [ ] **Step 8: Review the final diff**

Run:

```bash
git --no-pager diff --check
git --no-pager status --short
git --no-pager diff --stat HEAD~3
```

Expected: no whitespace errors; only the planned scenario, workflow, test,
documentation, and generated catalog changes are present.

- [ ] **Step 9: Commit the generated catalog**

```bash
git add README.md
git commit -m "docs: regenerate scenario catalog"
```
