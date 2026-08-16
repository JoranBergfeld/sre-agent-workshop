# Cloud Agent Handover Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Cloud Agent Handover prerequisites, region recommendation, SRE Agent onboarding, and incident-response-plan instructions while excluding Azure DevOps Boards guidance.

**Architecture:** Keep the change inside the existing scenario capsule and enforce the key workshop contracts with focused Node documentation tests. Update prerequisites and deployment guidance first, then make onboarding and incident response prescriptive using the current Microsoft portal flow.

**Tech Stack:** Markdown, Node.js built-in test runner, repository scenario validation tooling

---

## File Structure

- `scripts/scenario-tools/test/cloud-agent-handover-setup.test.js`: adds
  regression assertions for the requested documentation outcomes.
- `scenarios/cloud-agent-handover/docs/00-prerequisites.md`: documents provider
  registration, CodeQL licensing, and the recommended region.
- `scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md`: leads setup
  commands and troubleshooting with Sweden Central.
- `scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md`: provides exact
  agent-creation inputs and setup-card outcomes.
- `scenarios/cloud-agent-handover/docs/04-configure-incident-response.md`:
  documents the Azure Monitor connection, scenario custom agent, and current
  response-plan creation path.

### Task 1: Add Failing Documentation Contracts

**Files:**
- Modify: `scripts/scenario-tools/test/cloud-agent-handover-setup.test.js`

- [ ] **Step 1: Add prerequisite and region contract tests**

Append:

```javascript
test('Cloud Agent Handover documents providers, CodeQL licensing, and recommended region', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  const prerequisites = readFileSync(
    resolve(scenarioRoot, 'docs/00-prerequisites.md'),
    'utf8'
  );
  const deploymentGuide = readFileSync(
    resolve(scenarioRoot, 'docs/01-deploy-infrastructure.md'),
    'utf8'
  );

  for (const provider of [
    'Microsoft.Web',
    'Microsoft.Insights',
    'Microsoft.OperationalInsights',
  ]) {
    assert.match(prerequisites, new RegExp(provider.replace('.', '\\.')));
  }
  assert.match(prerequisites, /public repositories[\s\S]*CodeQL[\s\S]*free/i);
  assert.match(
    prerequisites,
    /private or internal[\s\S]*GitHub Code Security[\s\S]*GitHub Advanced Security/i
  );
  assert.match(prerequisites, /recommend[\s\S]*`swedencentral`/i);
  assert.match(deploymentGuide, /recommended[\s\S]*`swedencentral`/i);
});
```

- [ ] **Step 2: Add onboarding and response-plan contract tests**

Append:

```javascript
test('Cloud Agent Handover documents prescriptive SRE Agent setup', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  const onboardingGuide = readFileSync(
    resolve(scenarioRoot, 'docs/03-onboard-sre-agent.md'),
    'utf8'
  );

  for (const panel of ['Code', 'Logs', 'Azure Resources', 'Incidents']) {
    assert.match(onboardingGuide, new RegExp(`\\*\\*${panel}\\*\\*`));
  }
  assert.match(onboardingGuide, /Complete setup/i);
  assert.match(onboardingGuide, /Azure Monitor/i);
  assert.match(onboardingGuide, /`<workload>-ai`/i);
  assert.match(onboardingGuide, /Logs[\s\S]*skip/i);
  assert.match(onboardingGuide, /Code[\s\S]*green check/i);
  assert.match(onboardingGuide, /Azure Resources[\s\S]*permissions complete/i);
});

test('Cloud Agent Handover documents current governed response-plan flow', () => {
  const responsePlan = readFileSync(
    resolve(
      repositoryRoot,
      'scenarios/cloud-agent-handover/docs/04-configure-incident-response.md'
    ),
    'utf8'
  );

  assert.match(responsePlan, /Azure Monitor[\s\S]*connected/i);
  assert.match(responsePlan, /cloud-agent-handover-investigator/);
  assert.match(responsePlan, /Builder[\s\S]*Agent Canvas/i);
  assert.match(
    responsePlan,
    /Create[\s\S]*Trigger[\s\S]*Incident response plan/i
  );
  assert.match(responsePlan, /Agent autonomy level[\s\S]*Review/i);
  assert.match(responsePlan, /one unassigned GitHub issue/i);
});
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```bash
npm --prefix scripts/scenario-tools test -- \
  --test-name-pattern="Cloud Agent Handover documents"
```

Expected: the new tests fail because the existing documentation does not yet
contain all provider, licensing, setup-panel, custom-agent, and navigation
contracts.

- [ ] **Step 4: Commit the failing tests**

```bash
git add scripts/scenario-tools/test/cloud-agent-handover-setup.test.js
git commit -m "test: cover handover workshop guidance" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 1b3476c7-b401-4c19-82f9-7d1361f60f02"
```

### Task 2: Update Prerequisites and Region Guidance

**Files:**
- Modify: `scenarios/cloud-agent-handover/docs/00-prerequisites.md`
- Modify: `scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md`
- Test: `scripts/scenario-tools/test/cloud-agent-handover-setup.test.js`

- [ ] **Step 1: Add Azure provider and CodeQL prerequisites**

In the Access section of `00-prerequisites.md`, add:

```markdown
- Permission to register Azure resource providers in the workshop subscription
  when they are not already registered. Setup requires:
  `Microsoft.Web`, `Microsoft.Insights`, and
  `Microsoft.OperationalInsights`.
- CodeQL is available for public repositories without a GitHub Code Security
  license. For a private or internal participant-owned repository, the
  organization must enable GitHub Code Security, historically part of GitHub
  Advanced Security, so the CodeQL workflow can upload results.
```

Add a provider preflight section with:

```bash
for provider in Microsoft.Web Microsoft.Insights Microsoft.OperationalInsights; do
  az provider show --namespace "$provider" --query registrationState -o tsv
done
```

State that `Registered` is ready and that setup registers missing providers,
but the signed-in identity must be allowed to register them.

- [ ] **Step 2: Make Sweden Central the explicit recommendation**

Replace the supported-region introduction with:

```markdown
## Supported regions

Use `swedencentral` for workshop deployments. It is the recommended region
after participants encountered quota constraints in other supported regions.
If Sweden Central is unavailable for your subscription, use one of the
supported alternatives:

- `eastus2`
- `australiaeast`
```

Add readiness checklist entries for the CodeQL licensing rule, provider
registration, and Sweden Central selection.

- [ ] **Step 3: Lead deployment with Sweden Central**

In `01-deploy-infrastructure.md`, make the first Bash and PowerShell examples:

```bash
scenarios/cloud-agent-handover/scripts/setup.sh --location swedencentral
```

```powershell
scenarios/cloud-agent-handover/scripts/setup.ps1 -Location swedencentral
```

Retain examples for custom workload names and explicitly state that the scripts
still support East US 2 and Australia East when Sweden Central is unavailable.

- [ ] **Step 4: Run the prerequisite contract**

Run:

```bash
npm --prefix scripts/scenario-tools test -- \
  --test-name-pattern="providers, CodeQL licensing, and recommended region"
```

Expected: PASS.

- [ ] **Step 5: Commit prerequisite and region guidance**

```bash
git add \
  scenarios/cloud-agent-handover/docs/00-prerequisites.md \
  scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md
git commit -m "docs: clarify handover prerequisites and region" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 1b3476c7-b401-4c19-82f9-7d1361f60f02"
```

### Task 3: Make SRE Agent Onboarding Prescriptive

**Files:**
- Modify: `scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md`
- Test: `scripts/scenario-tools/test/cloud-agent-handover-setup.test.js`

- [ ] **Step 1: Document exact agent-resource inputs**

Replace the short creation list with a section that instructs learners to use:

```markdown
| Input | Workshop value |
| --- | --- |
| Subscription | The subscription used by setup |
| Resource group | `rg-<workload>` |
| Region | The same supported region as the scenario resources; use Sweden Central for the recommended deployment |
| Application Insights | `<workload>-ai` |
| Model provider and model | A supported option available to the tenant in that region |
```

Explain that creating the agent resource does not grant its managed identity
access to workload data.

- [ ] **Step 2: Document Complete setup panels**

Add a setup table:

```markdown
| Panel | Required action | Expected result |
| --- | --- | --- |
| **Code** | Connect the generated GitHub repository. | The card shows a green check and begins indexing. |
| **Logs** | Skip additional connectors for this workshop. | Log Analytics and Application Insights remain available through the Azure Resources grant. |
| **Azure Resources** | Add `rg-<workload>` with Reader-level access. | The card lists the resource group with permissions complete. |
| **Incidents** | Connect Azure Monitor. | Azure Monitor is shown as the connected incident platform. |
```

State that **Quickstart** contains Code, Logs, Deployments, and Incidents;
**Full setup** adds Azure Resources and knowledge files; and **Complete setup**
in the status bar returns to the page.

- [ ] **Step 3: Preserve operational guidance and onboarding verification**

Keep the Knowledge base upload instructions, then add a final checklist:

```markdown
- [ ] **Code** shows a green check for the generated repository.
- [ ] **Logs** has no extra connector because none is required.
- [ ] **Azure Resources** lists `rg-<workload>` with permissions complete.
- [ ] **Incidents** shows Azure Monitor connected.
- [ ] `operational-guidelines.md` is Indexed.
```

Retain **Done and go to agent** and explain that Team Onboarding appears in
Favorites.

- [ ] **Step 4: Run the onboarding contract**

Run:

```bash
npm --prefix scripts/scenario-tools test -- \
  --test-name-pattern="prescriptive SRE Agent setup"
```

Expected: PASS.

- [ ] **Step 5: Commit onboarding guidance**

```bash
git add scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md
git commit -m "docs: prescribe handover agent onboarding" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 1b3476c7-b401-4c19-82f9-7d1361f60f02"
```

### Task 4: Correct the Incident Response Plan Flow

**Files:**
- Modify: `scenarios/cloud-agent-handover/docs/04-configure-incident-response.md`
- Test: `scripts/scenario-tools/test/cloud-agent-handover-setup.test.js`

- [ ] **Step 1: Add incident-platform verification**

Before custom-agent and plan creation, add:

```markdown
## Verify the incident platform

Open **Builder → Incident Platform** and confirm that **Azure Monitor** is
connected. If it is not connected, return to **Complete setup → Quickstart →
Incidents**, connect Azure Monitor, and then return here.
```

- [ ] **Step 2: Add the scenario custom agent**

Document creation through **Builder → Agent Canvas → Create → Custom Agent**
with:

- name `cloud-agent-handover-investigator`
- handoff description `Investigate the unfinished Cloud Agent Handover feature`
- the indexed operational-guidelines file enabled
- read/investigation tools for Azure resources, logs, repository source, and
  GitHub history
- only the GitHub issue-creation write operation required by the handoff

Use these instructions:

```text
Investigate the Cloud Agent Handover incident. Correlate the alert named
"Unfinished feature returns HTTP 500" with Application Insights and Log
Analytics evidence, the connected Azure resources, repository source, tests,
and GitHub history. Identify the unfinished POST /api/feature implementation.
Never change Azure resources or repository code directly. Present the evidence
and request explicit operator approval before creating one unassigned GitHub
issue. The learner assigns Copilot, reviews and merges its pull request, then
an operator deploys the reviewed main branch with the scenario-local deploy
helper.
```

- [ ] **Step 3: Make the response-plan route explicit**

Use this sequence:

```markdown
1. Open **Builder → Agent Canvas**.
2. Select **Create**, then **Trigger → Incident response plan**.
3. Enter `cloud-agent-handover-review`.
4. Select `cloud-agent-handover-investigator`.
5. Set **Severity** to **Sev2**.
6. Set **Title contains** to `Unfinished feature returns HTTP 500`.
7. Set **Agent autonomy level** to **Review**.
8. Keep the default three-hour reinvestigation cooldown.
9. Select **Next**, review the incident preview, then select **Create**.
10. Verify the plan is **On** in the response-plan grid.
```

Retain the `quickstart` plan deletion warning and the governed issue-creation
explanation.

- [ ] **Step 4: Run the response-plan contract**

Run:

```bash
npm --prefix scripts/scenario-tools test -- \
  --test-name-pattern="current governed response-plan flow"
```

Expected: PASS.

- [ ] **Step 5: Commit the incident-response guidance**

```bash
git add scenarios/cloud-agent-handover/docs/04-configure-incident-response.md
git commit -m "docs: correct handover response plan setup" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 1b3476c7-b401-4c19-82f9-7d1361f60f02"
```

### Task 5: Validate the Complete Change

**Files:**
- Modify if generated: `README.md`

- [ ] **Step 1: Run all scenario-tool tests**

Run:

```bash
npm --prefix scripts/scenario-tools test
```

Expected: all tests pass.

- [ ] **Step 2: Regenerate derived scenario artifacts**

Run:

```bash
scripts/validate-scenarios.sh --write
```

Expected: validation succeeds and generated content is updated only when
manifest-derived output changed.

- [ ] **Step 3: Run clean validation**

Run:

```bash
scripts/validate-scenarios.sh
```

Expected: validation succeeds with no catalog drift.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git --no-pager diff HEAD~4 -- \
  scripts/scenario-tools/test/cloud-agent-handover-setup.test.js \
  scenarios/cloud-agent-handover/docs/00-prerequisites.md \
  scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md \
  scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md \
  scenarios/cloud-agent-handover/docs/04-configure-incident-response.md \
  README.md
```

Expected: the diff implements all requested feedback except Azure DevOps
Boards, contains no changes under `docs/superpowers/**`, and preserves the
governed Cloud Agent Handover recovery model.

- [ ] **Step 5: Commit generated artifacts if needed**

If `README.md` changed:

```bash
git add README.md
git commit -m "docs: refresh scenario catalog" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 1b3476c7-b401-4c19-82f9-7d1361f60f02"
```

If it did not change, do not create an empty commit.
