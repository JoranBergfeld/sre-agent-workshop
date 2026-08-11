# GitHub Issue Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve GitHub issues #7, #9, #10, #12, #13, #16, #17, #22, and #23 by making cost, repository setup, workload naming, AKS onboarding, and incident-response guidance consistent and current.

**Architecture:** Keep repository-wide rules in the root and shared GitHub connection guide, while each scenario capsule owns its resource names and lifecycle details. Add documentation contract tests to the existing Node test suite so future scenario changes cannot silently reintroduce fork instructions, broken connector anchors, missing cost guidance, or obsolete response-plan steps.

**Tech Stack:** Markdown, Node.js ESM, Node test runner, YAML scenario manifests, Bash validation wrappers, GitHub CLI.

---

## File Map

**New test file**

- `scripts/scenario-tools/test/documentation-contract.test.js`: checks cost
  guidance and current AKS documentation contracts across real scenario files.

**Scenario template and cost guides**

- `scripts/scenario-tools/template/README.md`: gives newly scaffolded scenarios
  a required cost-profile section.
- `scenarios/*/README.md`: exposes each manifest cost profile and dominant Azure
  cost drivers at the learner entry point.

**AKS repository and workload guidance**

- `scenarios/cosmos-rbac-removal/README.md`
- `scenarios/cosmos-rbac-removal/docs/00-prerequisites.md`
- `scenarios/cosmos-rbac-removal/docs/01-deploy-infrastructure.md`
- `scenarios/cosmos-rbac-removal/docs/02-deploy-application.md`
- `scenarios/cosmos-rbac-removal/docs/03-onboard-sre-agent.md`
- `scenarios/cosmos-rbac-removal/docs/04-configure-incident-response.md`
- `scenarios/cosmos-rbac-removal/docs/99-cleanup.md`
- `scenarios/workload-identity-break/README.md`
- `scenarios/workload-identity-break/docs/00-prerequisites.md`
- `scenarios/workload-identity-break/docs/01-deploy-infrastructure.md`
- `scenarios/workload-identity-break/docs/02-deploy-application.md`
- `scenarios/workload-identity-break/docs/03-onboard-sre-agent.md`
- `scenarios/workload-identity-break/docs/04-configure-incident-response.md`
- `scenarios/workload-identity-break/docs/99-cleanup.md`

**Audit record**

- `docs/issue-relevance-assessment-2026-08-05.md`: replace the handover-only
  assessment with the final repository-wide disposition and implementation
  evidence.

### Task 1: Enforce and document scenario cost guidance

**Files:**

- Create: `scripts/scenario-tools/test/documentation-contract.test.js`
- Modify: `scripts/scenario-tools/template/README.md`
- Modify: `scenarios/cloud-agent-handover/README.md`
- Modify: `scenarios/cosmos-rbac-removal/README.md`
- Modify: `scenarios/cpu-runaway/README.md`
- Modify: `scenarios/disk-full/README.md`
- Modify: `scenarios/iis-app-pool/README.md`
- Modify: `scenarios/vm-size-retirement/README.md`
- Modify: `scenarios/workload-identity-break/README.md`

- [ ] **Step 1: Write the failing cost-guidance contract test**

Create `scripts/scenario-tools/test/documentation-contract.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { REPO_ROOT } from '../lib/paths.js';

const scenariosRoot = resolve(REPO_ROOT, 'scenarios');

function scenarioDirectories() {
  return readdirSync(scenariosRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readScenario(id) {
  const dir = resolve(scenariosRoot, id);
  const manifest = yaml.load(readFileSync(resolve(dir, 'scenario.yaml'), 'utf8'));
  const guide = readFileSync(resolve(dir, manifest.guide), 'utf8');
  return { manifest, guide };
}

test('every scenario guide exposes its manifest cost profile and cost drivers', () => {
  for (const id of scenarioDirectories()) {
    const { manifest, guide } = readScenario(id);
    assert.match(guide, /^## Cost profile$/m, `${id} guide needs a Cost profile section`);
    assert.match(
      guide,
      new RegExp(`\\\\*\\\\*${manifest.costProfile}\\\\*\\\\*`, 'i'),
      `${id} guide must show its ${manifest.costProfile} cost profile`
    );
    assert.match(guide, /dominant cost drivers/i, `${id} guide must identify dominant cost drivers`);
  }
});
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run:

```bash
npm --prefix scripts/scenario-tools test -- --test-name-pattern="cost profile"
```

Expected: FAIL because the current scenario entry guides do not all contain a
`## Cost profile` section and dominant cost drivers.

- [ ] **Step 3: Add cost guidance to the scenario template**

Add this section after `## Overview` in
`scripts/scenario-tools/template/README.md`:

```markdown
## Cost profile

This scenario's catalog cost profile is **low**. Replace this sentence with the
manifest's actual profile and list the dominant cost drivers created by the
scenario. Confirm current Azure pricing before deployment and run cleanup as
soon as the exercise is complete.
```

Keep `costProfile: low` in the scaffold manifest as the default. The template
text must tell contributors to replace the profile when they choose a
different manifest value.

- [ ] **Step 4: Add a cost-profile section to every scenario guide**

Add `## Cost profile` near the top of each scenario `README.md`, before the
module index or fault description. Use these exact profiles and drivers:

```markdown
## Cost profile

The catalog cost profile is **low**. The dominant cost drivers are the App
Service plan, Application Insights and Log Analytics ingestion, and Azure SRE
Agent usage. Confirm current regional pricing before deployment and run the
scenario cleanup immediately after the exercise.
```

Use that text for `cloud-agent-handover`.

```markdown
## Cost profile

The catalog cost profile is **high**. The dominant cost drivers are the
two-node AKS cluster, Cosmos DB, Log Analytics and Application Insights
ingestion, and Azure SRE Agent usage. Confirm current regional pricing before
deployment and run the scenario cleanup immediately after the exercise.
```

Use that text for `cosmos-rbac-removal` and `workload-identity-break`.

```markdown
## Cost profile

The catalog cost profile is **high**. The dominant cost drivers are the two
Windows virtual machines, Standard Azure Bastion, Log Analytics and
Application Insights ingestion, and Azure SRE Agent usage. Confirm current
regional pricing before deployment and run the scenario cleanup immediately
after the exercise.
```

Use that text for `cpu-runaway`, `disk-full`, and `iis-app-pool`.

```markdown
## Cost profile

The catalog cost profile is **high**. The dominant cost drivers are the three
Windows virtual machines used for the retirement inventory, Log Analytics and
Application Insights ingestion, and Azure SRE Agent usage. Confirm current
regional pricing before deployment and run the scenario cleanup immediately
after the exercise.
```

Use that text for `vm-size-retirement`.

- [ ] **Step 5: Run the targeted cost test**

Run:

```bash
npm --prefix scripts/scenario-tools test -- --test-name-pattern="cost profile"
```

Expected: PASS.

- [ ] **Step 6: Commit the cost work**

```bash
git add scripts/scenario-tools/template/README.md \
  scripts/scenario-tools/test/documentation-contract.test.js \
  scenarios/*/README.md
git commit -m "docs: complete scenario cost guidance (#7)" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 86903a56-6281-4590-85b9-32e917af39d3"
```

### Task 2: Standardize generated repositories and custom workload names

**Files:**

- Modify: `scripts/scenario-tools/test/documentation-contract.test.js`
- Modify: both AKS capsule `README.md` files
- Modify: both AKS capsule `docs/00-prerequisites.md` files
- Modify: both AKS capsule `docs/01-deploy-infrastructure.md` files
- Modify: both AKS capsule `docs/02-deploy-application.md` files
- Modify: both AKS capsule `docs/99-cleanup.md` files

- [ ] **Step 1: Add failing AKS repository-contract tests**

Append these helpers and tests to
`scripts/scenario-tools/test/documentation-contract.test.js`:

```js
const aksScenarios = ['cosmos-rbac-removal', 'workload-identity-break'];

function readMarkdownTree(id) {
  const dir = resolve(scenariosRoot, id);
  const docsDir = resolve(dir, 'docs');
  const files = [
    resolve(dir, 'README.md'),
    ...readdirSync(docsDir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => resolve(docsDir, name)),
  ];
  return files.map((file) => ({
    file,
    content: readFileSync(file, 'utf8'),
  }));
}

test('AKS guides use generated repositories instead of forks', () => {
  for (const id of aksScenarios) {
    for (const { file, content } of readMarkdownTree(id)) {
      assert.doesNotMatch(content, /\byour fork\b|fork the repository|delete your fork/i, file);
    }
  }
});

test('AKS prerequisites define workload and derived resource group variables', () => {
  for (const id of aksScenarios) {
    const prerequisites = readFileSync(
      resolve(scenariosRoot, id, 'docs/00-prerequisites.md'),
      'utf8'
    );
    assert.match(prerequisites, /export WORKLOAD_NAME=/);
    assert.match(prerequisites, /export RESOURCE_GROUP="rg-\$\{WORKLOAD_NAME\}"/);
    assert.match(prerequisites, /\$WorkloadName =/);
    assert.match(prerequisites, /\$ResourceGroup = "rg-\$\{WorkloadName\}"/);
  }
});
```

- [ ] **Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
npm --prefix scripts/scenario-tools test -- --test-name-pattern="AKS guides|AKS prerequisites"
```

Expected: FAIL on current fork terminology and missing shared variable blocks.

- [ ] **Step 3: Replace fork setup with the template flow**

In both `docs/00-prerequisites.md` files, replace the GitHub account and
`Fork the Repository` sections with:

```markdown
### 5. GitHub repository

- You need a GitHub account that can create a repository from this template.
- Create the workshop repository under an owner where Issues, Actions, and
  Copilot coding agent are available.
- You need administrator access to configure repository secrets and variables.

## Step 1: Create your repository from the template

1. Open the source repository on GitHub.
2. Select **Use this template**, then create a repository you control.
3. Clone the generated repository:

   ```bash
   git clone https://github.com/<owner>/<repository>.git
   cd <repository>
   ```

All scenario branches, issues, Copilot pull requests, secrets, variables, and
workflow runs belong in this generated repository.
```

Replace later phrases such as `your fork`, `fork URL`, and `delete your fork`
with `your generated repository`, `generated repository URL`, and `delete your
generated repository`. Do not change references to Git forks as a general Git
concept unless they refer to the learner setup.

- [ ] **Step 4: Add one canonical workload variable block per AKS prerequisite**

After subscription selection in each `docs/00-prerequisites.md`, add:

```markdown
Choose the workload name once and reuse it throughout the capsule. The resource
group is always derived as `rg-<workload>`.

```bash
export WORKLOAD_NAME="srelabcosmos"
export RESOURCE_GROUP="rg-${WORKLOAD_NAME}"
```

```powershell
$WorkloadName = "srelabcosmos"
$ResourceGroup = "rg-${WorkloadName}"
```
```

Use `srelabidentity` in the workload-identity capsule. Update later commands to
reuse these variables rather than redefining fixed names.

- [ ] **Step 5: Make hard-coded portal names explicit defaults**

Across both AKS capsules:

- Change instructions such as `Choose rg-srelabcosmos` to `Choose
  $RESOURCE_GROUP (default: rg-srelabcosmos)`.
- Change fixed resource examples such as `srelabcosmos-ai` to
  `<workload>-ai (default: srelabcosmos-ai)`.
- Use `<workload>-aks`, `<workload>-law`, and `<workload>-id` when explaining
  derived resources.
- Keep exact Kubernetes namespaces and deployment names when they are not
  derived from `WORKLOAD_NAME`.
- Replace GitHub navigation text `your fork` with `your generated repository`
  in the README, deployment, application, and cleanup guides.

- [ ] **Step 6: Run the AKS repository-contract tests**

Run:

```bash
npm --prefix scripts/scenario-tools test -- --test-name-pattern="AKS guides|AKS prerequisites"
```

Expected: PASS.

- [ ] **Step 7: Commit repository and workload consistency**

```bash
git add scripts/scenario-tools/test/documentation-contract.test.js \
  scenarios/cosmos-rbac-removal \
  scenarios/workload-identity-break
git commit -m "docs: align AKS repository and workload setup (#22 #23)" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 86903a56-6281-4590-85b9-32e917af39d3"
```

### Task 3: Refresh AKS setup, onboarding, and verification guidance

**Files:**

- Modify: `scripts/scenario-tools/test/documentation-contract.test.js`
- Modify: `scenarios/cosmos-rbac-removal/docs/03-onboard-sre-agent.md`
- Modify: `scenarios/cosmos-rbac-removal/docs/04-configure-incident-response.md`
- Modify: `scenarios/workload-identity-break/docs/03-onboard-sre-agent.md`
- Modify: `scenarios/workload-identity-break/docs/04-configure-incident-response.md`
- Verify: `docs/connect-github-to-sre-agent.md`

- [ ] **Step 1: Add failing onboarding-contract tests**

Append:

```js
test('AKS onboarding uses current setup and connector guidance', () => {
  for (const id of aksScenarios) {
    const onboarding = readFileSync(
      resolve(scenariosRoot, id, 'docs/03-onboard-sre-agent.md'),
      'utf8'
    );
    assert.match(onboarding, /Quickstart/);
    assert.match(onboarding, /Full setup/);
    assert.match(onboarding, /Favorites sidebar/);
    assert.match(onboarding, /#set-up-the-github-mcp-connector-with-a-pat/);
    assert.doesNotMatch(onboarding, /#set-up-the-github-connector-with-a-pat/);
    assert.doesNotMatch(onboarding, /If all three checks pass/);
  }
});
```

- [ ] **Step 2: Run the onboarding test and confirm it fails**

Run:

```bash
npm --prefix scripts/scenario-tools test -- --test-name-pattern="current setup and connector"
```

Expected: FAIL because both AKS guides use the broken connector anchor and omit
the current tab and Favorites navigation.

- [ ] **Step 3: Replace the AKS setup sequence**

In each `docs/03-onboard-sre-agent.md`, retain the scenario-specific overview
but replace the portal sequence with:

```markdown
## Create and set up the agent

1. Create the SRE Agent resource in the intended subscription and region. The
   permission to deploy the agent is separate from the data access granted to
   its managed identity.
2. After deployment succeeds, select **Set up your agent**.
3. On **Quickstart**, connect the generated GitHub repository through the
   **Code** card.
4. Switch to **Full setup**. On the **Azure Resources** card, add
   `$RESOURCE_GROUP`, review the Reader permission for the agent managed
   identity, and finish the grant.
5. Select **Done and go to agent**.

The portal opens the pinned **Team onboarding** thread in the Favorites
sidebar. If it is not in the main pane, select it from Favorites.
```

Keep the existing scenario-specific architecture and debugging prompts after
this shared sequence.

- [ ] **Step 4: Repair and clarify GitHub connector guidance**

Change both links to:

```markdown
[Connect GitHub to the SRE Agent -> Set up the GitHub connector](../../../docs/connect-github-to-sre-agent.md#set-up-the-github-mcp-connector-with-a-pat)
```

State directly before the link:

```markdown
The Code connection is read-only investigation context. The GitHub MCP
connector is the separate integration used to read issues and pull requests
and to create the approved remediation issue.
```

- [ ] **Step 5: Correct onboarding verification**

Replace each four-item verification list and `all three checks` sentence with
a four-check checklist:

```markdown
- [ ] The Code card lists the generated repository with a green checkmark.
- [ ] The Azure Resources card lists `$RESOURCE_GROUP` with permissions
      complete.
- [ ] `operational-guidelines.md` is a File source with status **Indexed**.
- [ ] A read-only GitHub connector prompt can list recent repository issues.
```

Remove the stale **Monitor -> Resource Mapping** checkpoint because the current
setup source of truth is the Azure Resources card.

- [ ] **Step 6: Replace the fragile RBAC prerequisite command**

At the start of each `docs/04-configure-incident-response.md`, replace the
managed-identity discovery script with:

```markdown
## Prerequisites

Complete these checks in the shell whose syntax you use below:

```bash
az login
az account set --subscription "$SUBSCRIPTION_ID"
az account show --query '{name:name,id:id}' --output table
```

```powershell
az login
az account set --subscription $SubscriptionId
az account show --query '{name:name,id:id}' --output table
```

In the SRE Agent setup page, open **Full setup** and confirm the **Azure
Resources** card lists the scenario resource group with permission status
complete. This is the supported checkpoint that the agent managed identity has
Reader access. If the grant is incomplete, finish it from that card before
connecting Azure Monitor.
```

Do not try to discover an identity by searching the scenario resource group;
the agent resource and its identity can be deployed to a different resource
group.

- [ ] **Step 7: Run the onboarding-contract test**

Run:

```bash
npm --prefix scripts/scenario-tools test -- --test-name-pattern="current setup and connector"
```

Expected: PASS.

- [ ] **Step 8: Commit the onboarding refresh**

```bash
git add scripts/scenario-tools/test/documentation-contract.test.js \
  scenarios/cosmos-rbac-removal/docs/03-onboard-sre-agent.md \
  scenarios/cosmos-rbac-removal/docs/04-configure-incident-response.md \
  scenarios/workload-identity-break/docs/03-onboard-sre-agent.md \
  scenarios/workload-identity-break/docs/04-configure-incident-response.md
git commit -m "docs: refresh AKS agent onboarding (#9 #10 #12 #16)" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 86903a56-6281-4590-85b9-32e917af39d3"
```

### Task 4: Replace stale AKS incident-response plan instructions

**Files:**

- Modify: `scripts/scenario-tools/test/documentation-contract.test.js`
- Modify: `scenarios/cosmos-rbac-removal/docs/04-configure-incident-response.md`
- Modify: `scenarios/workload-identity-break/docs/04-configure-incident-response.md`

- [ ] **Step 1: Add failing incident-response contract tests**

Append:

```js
test('AKS response plans use the current Agent Canvas flow', () => {
  for (const id of aksScenarios) {
    const responsePlan = readFileSync(
      resolve(scenariosRoot, id, 'docs/04-configure-incident-response.md'),
      'utf8'
    );
    assert.match(responsePlan, /Builder.*Agent Canvas/s);
    assert.match(responsePlan, /Trigger.*Incident response plan/s);
    assert.match(responsePlan, /quickstart.*Table view.*delete/is);
    assert.match(responsePlan, /Reinvestigation cooldown/);
    assert.match(responsePlan, /three hours/i);
    assert.match(responsePlan, /Title contains/);
    assert.doesNotMatch(responsePlan, /Click \*\*New incident response plan\*\*/);
    assert.doesNotMatch(responsePlan, /workshop-all-incidents/);
  }
});
```

- [ ] **Step 2: Run the response-plan test and confirm it fails**

Run:

```bash
npm --prefix scripts/scenario-tools test -- --test-name-pattern="current Agent Canvas flow"
```

Expected: FAIL on the current `New incident response plan`, broad
`workshop-all-incidents`, and missing cooldown instructions.

- [ ] **Step 3: Rewrite the Cosmos RBAC response-plan section**

Replace the current response-plan wizard with:

```markdown
## Create the scenario response plan

If a default `quickstart` response plan exists, open **Builder -> Incident
response plans**, switch to **Table view**, and delete it so the same alert is
not routed twice.

1. Open **Builder -> Agent Canvas**.
2. Select **Create**, then **Trigger -> Incident response plan**.
3. Name the plan `cosmos-rbac-removal-review`.
4. Select the custom agent configured for this scenario.
5. Set **Severity** to **Sev3**.
6. Set **Title contains** to `HTTP 500 Errors Detected`.
7. Set **Agent autonomy level** to **Review**.
8. Keep **Reinvestigation cooldown** enabled at the default three hours.
9. Select **Next**, review the incident preview, then select **Create**.
10. Confirm the plan is **On** and shows the expected custom agent, severity,
    title filter, Review autonomy, and cooldown.
```

Use the manifest severity and deployed alert display name as the source of
truth.

- [ ] **Step 4: Rewrite the workload identity response-plan section**

Use the same sequence with:

```markdown
- Plan name: `workload-identity-break-review`
- Severity: **Sev3**
- Title contains: `Workload Identity Auth Errors`
```

Keep **Review** autonomy and the three-hour cooldown.

- [ ] **Step 5: Narrow the explanatory flow**

In both files, state that the response plan targets only the capsule's alert.
Remove language that says the plan catches all severity levels or all
incidents. Retain the human-approved issue -> Copilot pull request -> human
merge -> manual deployment recovery route.

- [ ] **Step 6: Run the response-plan contract test**

Run:

```bash
npm --prefix scripts/scenario-tools test -- --test-name-pattern="current Agent Canvas flow"
```

Expected: PASS.

- [ ] **Step 7: Commit the response-plan refresh**

```bash
git add scripts/scenario-tools/test/documentation-contract.test.js \
  scenarios/cosmos-rbac-removal/docs/04-configure-incident-response.md \
  scenarios/workload-identity-break/docs/04-configure-incident-response.md
git commit -m "docs: update AKS response plan flow (#13 #17)" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 86903a56-6281-4590-85b9-32e917af39d3"
```

### Task 5: Update the audit record and validate the repository

**Files:**

- Modify: `docs/issue-relevance-assessment-2026-08-05.md`
- Possibly modify: `README.md` only if `scripts/validate-scenarios.sh --write`
  regenerates the catalog.

- [ ] **Step 1: Rewrite the assessment scope and summary**

Change the document title to `# GitHub issue disposition` and state that the
final audit covers all repository issues as of 2026-08-11, not only issues
filed by two authors or only the handover capsule.

Add this final disposition table:

```markdown
| Issues | Final disposition |
| --- | --- |
| #1, #8, #19 | Already closed before this audit |
| #14, #15, #18, #20, #21, #25 | Closed after confirming current repository behavior |
| #7 | Resolved by scenario cost guidance and documentation contract coverage |
| #9, #10, #12, #16 | Resolved by the AKS setup and onboarding refresh |
| #13, #17 | Resolved by the current Agent Canvas response-plan flow |
| #22, #23 | Resolved by template-repository and workload-name consistency |
```

Replace the old `15 Not relevant` summary and handover-only issue reasons with
the implemented evidence and exact affected files.

- [ ] **Step 2: Run the complete scenario-tool test suite**

Run:

```bash
npm --prefix scripts/scenario-tools test
```

Expected: all tests pass, including
`documentation-contract.test.js`.

- [ ] **Step 3: Regenerate and validate scenario artifacts**

Run:

```bash
scripts/validate-scenarios.sh --write
scripts/validate-scenarios.sh
```

Expected: both commands exit successfully; the second reports no generated
catalog drift.

- [ ] **Step 4: Run targeted stale-content searches**

Run:

```bash
rg -n -i '\byour fork\b|fork the repository|delete your fork' \
  scenarios/cosmos-rbac-removal scenarios/workload-identity-break

rg -n '#set-up-the-github-connector-with-a-pat|New incident response plan|workshop-all-incidents|If all three checks pass' \
  scenarios/cosmos-rbac-removal scenarios/workload-identity-break

rg -n '## Cost profile|dominant cost drivers' scenarios/*/README.md
```

Expected:

- the first two commands return no matches;
- the cost search returns two matches for each of the seven scenario guides.

- [ ] **Step 5: Review the complete diff**

Run:

```bash
git status --short
git --no-pager diff --check
git --no-pager diff --stat
git --no-pager diff
```

Expected: only the audit record and any generated root catalog change remain
uncommitted; no whitespace errors are reported.

- [ ] **Step 6: Commit the audit record**

```bash
git add docs/issue-relevance-assessment-2026-08-05.md README.md
git commit -m "docs: record final issue dispositions" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 86903a56-6281-4590-85b9-32e917af39d3"
```

If `README.md` did not change, omit it from `git add`.

### Task 6: Close the resolved GitHub issues

**Files:** None.

- [ ] **Step 1: Confirm each issue remains open before closing**

Run:

```bash
gh issue list --repo JoranBergfeld/sre-agent-workshop --state open --limit 100 \
  --json number,title \
  --jq '.[] | .number as $number | select([7,9,10,12,13,16,17,22,23] | index($number))'
```

Expected: all nine issue numbers are listed.

- [ ] **Step 2: Close each issue with implementation evidence**

Use `gh issue close` once per issue. Each comment must identify its commit and
the principal files changed. For example:

```bash
gh issue close 7 --repo JoranBergfeld/sre-agent-workshop \
  --reason completed \
  --comment "Resolved by the scenario cost-guidance update. Every scenario entry guide now exposes its manifest cost profile and dominant Azure cost drivers, and the scenario-tool test suite enforces that contract."
```

Apply equivalent evidence-based comments for:

- #9, #10, #12, and #16: current AKS setup/onboarding commit.
- #13 and #17: current Agent Canvas response-plan commit.
- #22 and #23: generated-repository and workload-consistency commit.

- [ ] **Step 3: Confirm no reviewed issue remains open**

Run:

```bash
gh issue list --repo JoranBergfeld/sre-agent-workshop --state open --limit 100 \
  --json number,title \
  --jq '.[] | .number as $number | select([7,9,10,12,13,16,17,22,23] | index($number))'
```

Expected: no output.

- [ ] **Step 4: Confirm the worktree is clean**

Run:

```bash
git status --short
```

Expected: no output.
