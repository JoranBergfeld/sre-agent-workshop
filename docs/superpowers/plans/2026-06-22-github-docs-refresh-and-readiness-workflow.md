# GitHub Issue-Logging Docs Refresh + Docs-Readiness Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the outdated "Enable the GitHub Tool" onboarding instructions with a single shared "Connect GitHub" doc reused by all tracks, add the VM approval-gated clarification, and add a complementary `sre-docs-readiness` agentic workflow that guards internal integrity + upstream accuracy.

**Architecture:** One canonical track-agnostic doc (`docs/connect-github-to-sre-agent.md`) holds the GitHub connection steps; AKS and App Service Module 3 link to it (GitHub has no Markdown transclusion, so link = single source of truth); VM gets a "no issue logging here" callout. A new gh-aw workflow complements the existing freshness workflow without overlapping it.

**Tech Stack:** Markdown docs rendered on GitHub; GitHub Agentic Workflows (gh-aw, compiler v0.77.5, `engine: copilot`); `gh aw` CLI; bash/git for verification.

---

## Reference: spec

`docs/superpowers/specs/2026-06-22-github-docs-refresh-and-readiness-workflow-design.md`

## File map

- **Create** `docs/connect-github-to-sre-agent.md` — shared "Connect GitHub" how-to (code + connector).
- **Modify** `workshops/aks/docs/03-onboard-sre-agent.md` — link to shared doc; remove dead Tools steps.
- **Modify** `workshops/appservice/docs/03-onboard-sre-agent.md` — identical changes to AKS.
- **Modify** `workshops/vm/docs/02-configure-incident-response.md` — add approval-gated callout.
- **Create** `.github/workflows/sre-docs-readiness.md` — new gh-aw workflow source.
- **Modify** `.github/workflows/sre-docs-freshness.md` — add one-line scope boundary note.
- **Generated (via `gh aw compile`, do not hand-edit)** `.github/workflows/sre-docs-readiness.lock.yml`, `.github/workflows/sre-docs-freshness.lock.yml`, `.github/aw/actions-lock.json`.

---

## Task 1: Create the shared "Connect GitHub" doc

**Files:**
- Create: `docs/connect-github-to-sre-agent.md`

- [ ] **Step 1: Create the file with this exact content**

````markdown
# Connect GitHub to the SRE Agent

This guide connects a GitHub repository to your Azure SRE Agent. It is shared by every workshop
track — follow the parts your track's module points you to.

There are **two separate GitHub integrations**, and they do different jobs:

| Integration | Where you set it up | What it gives the agent |
| --- | --- | --- |
| **Code repository** | The **Code** card on the agent setup page | Reads your code for root-cause analysis (file/line references, deployment correlation) |
| **GitHub connector** | **Builder → Connectors** | Creates and reads **issues**, **pull requests**, and **workflow** runs |

Connecting the code repository automatically creates a GitHub OAuth connector for sign-in, but you
still add and verify the **GitHub connector** below before the agent can file issues.

> **Reference:** [Connect source code](https://learn.microsoft.com/azure/sre-agent/connect-source-code)
> and [Set up the GitHub connector](https://learn.microsoft.com/azure/sre-agent/setup-github-connector)
> (Azure SRE Agent documentation).

## Connect your code repository

On the agent setup page (click **Set up your agent** after deployment finishes):

1. On the **Code** card, click the **+** button.
2. Choose a platform: select **GitHub** (Azure DevOps is also supported).
3. Choose a sign-in method:
   - **Auth** (OAuth) — click **Sign in** and approve access in the browser popup.
   - **PAT** — paste a Personal Access Token with `repo` scope and click **Connect**.
4. Click **Next**.
5. Pick your repository from the dropdown (repos are listed as `owner/repo`, alphabetically).
   Select the **forked workshop repository** you created in Module 0.
6. Click **Add repository**.
7. Wait for the **Code** card to show a green checkmark.

The agent immediately starts indexing the repo to learn your architecture, deployment
configuration, and code patterns.

## Set up the GitHub connector

The connector is what lets the agent **create GitHub issues** (and open/read pull requests and read
workflow runs) during incident response.

1. Open your agent and go to **Builder → Connectors**.
2. Click **Add connector**.
3. Select **GitHub OAuth connector**.
4. Choose an authentication method:
   - **OAuth** — click **Sign in to GitHub** and complete the popup authorization.
   - **PAT** — paste a GitHub token with `repo` scope (needed for private repos) and click **Connect**.
5. Confirm the connector status shows **Connected**.

> **Popup blocked?** If the sign-in window doesn't appear, allow popups for `sre.azure.com` and retry.

## Verify the connection

Open a chat thread with the agent and run a prompt against your repo:

```text
List recent issues from <owner>/<repo> and summarize the top 3.
```

If the connector is working, the agent returns issues from your repository. You can also ask it to
create a test issue to confirm write access.

## Which tracks use the connector?

- **Issue-based remediation tracks** (AKS, App Service): the agent files a GitHub issue describing
  the root cause and assigns it to **`@copilot`**, which opens a fix PR. These tracks **require** the
  GitHub connector.
- **Approval-gated tracks** (VM): remediation runs through an approved script, not GitHub issues.
  These tracks only need the **code repository** connection — you can **skip the GitHub connector**.
````

- [ ] **Step 2: Verify the file exists and headings (anchors) are present**

Run: `grep -n '^## ' docs/connect-github-to-sre-agent.md`
Expected output includes:
```
## Connect your code repository
## Set up the GitHub connector
## Verify the connection
## Which tracks use the connector?
```

- [ ] **Step 3: Commit**

```bash
git add docs/connect-github-to-sre-agent.md
git commit -m "docs: add shared Connect GitHub to the SRE Agent guide

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Point AKS Module 3 at the shared doc

**Files:**
- Modify: `workshops/aks/docs/03-onboard-sre-agent.md`

- [ ] **Step 1: Replace the code-repository step list with a shared-doc link**

Find this exact block (under `### Add Your GitHub Repository`):

```
### Add Your GitHub Repository

1. Look for the **Code** card on the setup page
2. Click the **+** button to add a code source
3. Choose **GitHub**
4. Click **Authenticate** and sign in with your GitHub account
5. After authentication, you'll see a list of your repositories
6. **Select your forked workshop repository** (the one you created in Module 0)
7. Click **Add repository**
8. Wait for the connection to verify — you should see a **green checkmark** on the Code card
```

Replace it with:

```
### Add Your GitHub Repository

Follow **[Connect GitHub to the SRE Agent → Connect your code repository](../../../docs/connect-github-to-sre-agent.md#connect-your-code-repository)** to connect your **forked workshop repository** (the one you created in Module 0) via the **Code** card. Come back here once the Code card shows a green checkmark.
```

- [ ] **Step 2: Replace the dead "Enable the GitHub Tool" section**

Find this exact block:

```
## Enable the GitHub Tool

For the SRE Agent to create GitHub issues and assign them to `@copilot`, it needs the GitHub tool enabled.

1. In the SRE Agent portal, go to **Capabilities** → **Tools** in the left sidebar
2. Find the **DevOps** category in the Built-in Tools section
3. Locate the tools related to GitHub (CreateGitHubIssue, CreateGitHubIssueComment, FetchGitHubIssue, FetchGitHubIssueComments, FetchGitHubIssues) and **enable** them
4. The agent may ask you to authenticate with GitHub — follow the prompts to connect your GitHub account. This won't happen if you've provided the right authorization previously while adding code.

> **Why this matters:** Without the GitHub tool, the agent can investigate and diagnose issues but cannot create issues or PRs on your repository. With it enabled, the full remediation loop works: SRE Agent detects fault → creates issue → `@copilot` fixes code → CI/CD deploys.
```

Replace it with:

```
## Set up the GitHub Connector

For the SRE Agent to **create GitHub issues and assign them to `@copilot`**, connect the GitHub **connector**.

Follow **[Connect GitHub to the SRE Agent → Set up the GitHub connector](../../../docs/connect-github-to-sre-agent.md#set-up-the-github-connector)**, then verify the connection per that guide.

> **Why this matters:** Without the GitHub connector, the agent can investigate and diagnose issues but cannot create issues or PRs on your repository. With it connected, the full remediation loop works: SRE Agent detects fault → files an issue → assigns `@copilot` → `@copilot` fixes the code and opens a PR → an operator runs the deploy workflow.
```

- [ ] **Step 3: Verify the dead terminology is gone and the link target is valid**

Run: `grep -nE 'Capabilities|GitHub tool|CreateGitHubIssue|DevOps category' workshops/aks/docs/03-onboard-sre-agent.md`
Expected: no output (exit code 1).

Run: `test -f docs/connect-github-to-sre-agent.md && grep -q '^## Set up the GitHub connector' docs/connect-github-to-sre-agent.md && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add workshops/aks/docs/03-onboard-sre-agent.md
git commit -m "docs(aks): link Module 3 to shared Connect GitHub guide

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Point App Service Module 3 at the shared doc

**Files:**
- Modify: `workshops/appservice/docs/03-onboard-sre-agent.md`

- [ ] **Step 1: Replace the code-repository step list with a shared-doc link**

Find this exact block (under `### Add Your GitHub Repository`):

```
### Add Your GitHub Repository

1. Look for the **Code** card on the setup page
2. Click the **+** button to add a code source
3. Choose **GitHub**
4. Click **Authenticate** and sign in with your GitHub account
5. After authentication, you'll see a list of your repositories
6. **Select your forked workshop repository** (the one you created in Module 0)
7. Click **Add repository**
8. Wait for the connection to verify — you should see a **green checkmark** on the Code card
```

Replace it with:

```
### Add Your GitHub Repository

Follow **[Connect GitHub to the SRE Agent → Connect your code repository](../../../docs/connect-github-to-sre-agent.md#connect-your-code-repository)** to connect your **forked workshop repository** (the one you created in Module 0) via the **Code** card. Come back here once the Code card shows a green checkmark.
```

- [ ] **Step 2: Replace the dead "Enable the GitHub Tool" section**

Find this exact block:

```
## Enable the GitHub Tool

For the SRE Agent to create GitHub issues and assign them to `@copilot`, it needs the GitHub tool enabled.

1. In the SRE Agent portal, go to **Capabilities** → **Tools** in the left sidebar
2. Find the **DevOps** category in the Built-in Tools section
3. Locate the tools related to GitHub (CreateGitHubIssue, CreateGitHubIssueComment, FetchGitHubIssue, FetchGitHubIssueComments, FetchGitHubIssues) and **enable** them
4. The agent may ask you to authenticate with GitHub — follow the prompts to connect your GitHub account. This won't happen if you've provided the right authorization previously while adding code.

> **Why this matters:** Without the GitHub tool, the agent can investigate and diagnose issues but cannot create issues or PRs on your repository. With it enabled, the full remediation loop works: SRE Agent detects fault → creates issue → `@copilot` fixes code → CI/CD deploys.
```

Replace it with:

```
## Set up the GitHub Connector

For the SRE Agent to **create GitHub issues and assign them to `@copilot`**, connect the GitHub **connector**.

Follow **[Connect GitHub to the SRE Agent → Set up the GitHub connector](../../../docs/connect-github-to-sre-agent.md#set-up-the-github-connector)**, then verify the connection per that guide.

> **Why this matters:** Without the GitHub connector, the agent can investigate and diagnose issues but cannot create issues or PRs on your repository. With it connected, the full remediation loop works: SRE Agent detects fault → files an issue → assigns `@copilot` → `@copilot` fixes the code and opens a PR → an operator runs the deploy workflow.
```

- [ ] **Step 3: Verify the dead terminology is gone and the link target is valid**

Run: `grep -nE 'Capabilities|GitHub tool|CreateGitHubIssue|DevOps category' workshops/appservice/docs/03-onboard-sre-agent.md`
Expected: no output (exit code 1).

- [ ] **Step 4: Commit**

```bash
git add workshops/appservice/docs/03-onboard-sre-agent.md
git commit -m "docs(appservice): link Module 3 to shared Connect GitHub guide

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Add the VM approval-gated callout

**Files:**
- Modify: `workshops/vm/docs/02-configure-incident-response.md`

- [ ] **Step 1: Insert the callout before the "Approval-gated execution" heading**

Find this exact block:

```
1. Connect the SRE Agent to **Azure Monitor**.
2. Create an incident response plan scoped to VM workshop alerts.
3. Use **Review-style approvals** for remediation in this VM track.

## Approval-gated execution
```

Replace it with:

```
1. Connect the SRE Agent to **Azure Monitor**.
2. Create an incident response plan scoped to VM workshop alerts.
3. Use **Review-style approvals** for remediation in this VM track.

> **No GitHub issue logging on this track.** Unlike the AKS and App Service tracks, the VM track's
> remediation is **approval-gated** and runs through `Invoke-ApprovedRemediation` — the SRE Agent
> never files GitHub issues or opens PRs here. If you onboard the agent using
> [Connect GitHub to the SRE Agent](../../../docs/connect-github-to-sre-agent.md), connecting the
> **code repository** is enough; **skip the GitHub connector / issue-logging step**.

## Approval-gated execution
```

- [ ] **Step 2: Verify the link target exists**

Run: `test -f docs/connect-github-to-sre-agent.md && grep -q 'No GitHub issue logging on this track' workshops/vm/docs/02-configure-incident-response.md && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add workshops/vm/docs/02-configure-incident-response.md
git commit -m "docs(vm): clarify remediation is approval-gated with no GitHub issue logging

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Create the `sre-docs-readiness` workflow source

**Files:**
- Create: `.github/workflows/sre-docs-readiness.md`

- [ ] **Step 1: Create the file with this exact content**

````markdown
---
name: SRE Agent Docs Readiness
on:
  schedule:
    - cron: "0 7 * * 4"   # Thursdays 07:00 UTC (offset from docs-freshness on Mondays)
  workflow_dispatch:
engine: copilot
permissions:
  contents: read
network:
  allowed:
    - defaults
    - learn.microsoft.com
    - "*.azure.com"
tools:
  web-fetch:
  bash: ["git", "grep", "find", "ls", "cat", "test"]
safe-outputs:
  create-pull-request:
    title-prefix: "[docs-readiness] "
    labels: [documentation, automated]
    reviewers: [JoranBergfeld]
    draft: true
    max: 1
---

# SRE Agent Docs Readiness

You keep this repository's **workshop track docs** and the **shared GitHub how-to** ready for
learners. You check two things — internal integrity and upstream accuracy — and you never change
docs silently: you open a single draft PR for human review.

## Scope

**In scope — internal integrity** (read and, if needed, fix):

- `docs/*.md` (the shared layer), **excluding** `docs/superpowers/**`
- `workshops/*/README.md`
- `workshops/*/docs/**.md`
- `workshops/*/scenarios/*/README.md`

**In scope — upstream accuracy** (compare against upstream, fix drift):

- `workshops/*/docs/03-onboard-sre-agent.md`
- `workshops/*/docs/0?-configure-incident-response.md`
- `workshops/*/docs/90-watch*.md`
- `docs/connect-github-to-sre-agent.md`

**Out of scope — do NOT touch:**

- `docs/00-what-is-sre-agent.md`, `docs/01-why-sre-agent.md`, `docs/02-how-it-works.md`, and
  `workshops/aks/knowledge/operational-guidelines.md` — the **SRE Agent Docs Freshness** workflow
  owns upstream accuracy for those.
- Generated artifacts — `workshops/*/scenarios/INDEX.md`,
  `workshops/*/infra/bicep/modules/scenario-alerts.bicep`, and the README
  `<!-- BEGIN SCENARIOS -->`…`<!-- END SCENARIOS -->` tables — the scenario tooling and the
  `validate-scenarios.yml` workflow own those.
- Anything under `docs/superpowers/**`.

## Checks

### 1. Internal integrity

For the in-scope integrity files:

1. **Links resolve.** Every relative Markdown link `](...)` points to a file that exists; if the
   link includes a `#anchor`, a matching heading exists in the target file.
2. **Track module lists match files.** Each `workshops/<track>/README.md` module list links to every
   `*.md` in `workshops/<track>/docs/` and links to no file that is missing.
3. **Shared-doc links resolve.** Every per-track link to `docs/connect-github-to-sre-agent.md`
   (including its `#anchors`) is valid.
4. **No leftover placeholders.** Flag `TODO`, `TBD`, `FIXME`, or obvious placeholder text.
5. **No stale section references.** Flag references to renamed or removed UI/sections — for example
   a lingering "Enable the GitHub Tool" or "Capabilities → Tools" instruction.

### 2. Upstream accuracy

Fetch the current Azure SRE Agent documentation under `learn.microsoft.com` (the GitHub connector,
connect-source-code, incident-response/autonomy, and overview pages) and `sre.azure.com/docs`. For
each in-scope upstream file, compare its product claims (portal navigation, connector/tool names,
setup steps) against the upstream sources. If something is outdated, renamed, or removed upstream,
make the **minimal** edits needed to correct the affected file(s).

## Output

1. If you made any edits, open **one** draft PR. Group the description under **Internal integrity**
   and **Upstream accuracy** headings, list each file changed and why, and cite source URLs for the
   upstream changes.
2. If everything is already consistent and current, do nothing (no PR).
````

- [ ] **Step 2: Verify the frontmatter is well-formed YAML**

Run: `sed -n '/^---$/,/^---$/p' .github/workflows/sre-docs-readiness.md | head -1`
Expected: `---`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sre-docs-readiness.md
git commit -m "ci: add SRE Agent Docs Readiness agentic workflow source

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Add the scope-boundary note to the freshness workflow

**Files:**
- Modify: `.github/workflows/sre-docs-freshness.md`

- [ ] **Step 1: Append a boundary note to the Scope section**

Find this exact block:

```
Do **not** touch track setup docs or scenario walkthroughs — those describe this repo's own
code, not upstream behavior.
```

Replace it with:

```
Do **not** touch track setup docs or scenario walkthroughs — those describe this repo's own
code, not upstream behavior.

> **Boundary:** The **SRE Agent Docs Readiness** workflow owns internal integrity for all docs and
> upstream accuracy for the track setup docs and `docs/connect-github-to-sre-agent.md`. Do not add
> those files to this workflow's scope.
```

- [ ] **Step 2: Verify the note is present**

Run: `grep -c 'SRE Agent Docs Readiness' .github/workflows/sre-docs-freshness.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sre-docs-freshness.md
git commit -m "ci: note readiness/freshness scope boundary in docs-freshness workflow

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Compile the gh-aw workflows (generate lock files)

**Files:**
- Generated: `.github/workflows/sre-docs-readiness.lock.yml`
- Generated: `.github/workflows/sre-docs-freshness.lock.yml`
- Generated: `.github/aw/actions-lock.json`

> **Dependency:** `gh aw compile` resolves and pins GitHub Action SHAs, so it needs network/GitHub
> API access and an authenticated `gh`. The dev box installs CLI tools user-local (no sudo).

- [ ] **Step 1: Ensure the `gh aw` CLI extension is installed**

Run: `gh aw version 2>/dev/null || gh extension install github/gh-aw`
Expected: a version string, or successful installation output.

- [ ] **Step 2: Compile all workflows**

Run: `gh aw compile`
Expected: completes without error; reports compiling `sre-docs-readiness` and `sre-docs-freshness`.

- [ ] **Step 3: Verify the lock files were generated/updated**

Run: `git status --porcelain .github/workflows/sre-docs-readiness.lock.yml .github/workflows/sre-docs-freshness.lock.yml .github/aw/actions-lock.json`
Expected: `sre-docs-readiness.lock.yml` shows as added (`??` or `A`); the freshness lock and `actions-lock.json` may show as modified (`M`) or be unchanged.

Run: `head -1 .github/workflows/sre-docs-readiness.lock.yml`
Expected: a line starting with `# gh-aw-metadata:` containing `"agent_id":"copilot"`.

- [ ] **Step 4: Commit the generated artifacts**

```bash
git add .github/workflows/sre-docs-readiness.lock.yml .github/workflows/sre-docs-freshness.lock.yml .github/aw/actions-lock.json
git commit -m "ci: compile docs-readiness workflow and refresh lock files

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Final cross-doc validation

**Files:** none (verification only)

- [ ] **Step 1: Confirm no track doc still uses the obsolete GitHub Tools terminology**

Run: `grep -rnE 'Capabilities → Tools|GitHub tool|CreateGitHubIssue|FetchGitHubIssue' workshops/ docs/ --include='*.md' | grep -v 'docs/superpowers/'`
Expected: no output (exit code 1). (Matches inside `docs/superpowers/` specs/plans are allowed and filtered out.)

- [ ] **Step 2: Confirm every new shared-doc link resolves to the file**

Run: `grep -rln 'connect-github-to-sre-agent.md' workshops/*/docs/*.md`
Expected: lists `workshops/aks/docs/03-onboard-sre-agent.md`, `workshops/appservice/docs/03-onboard-sre-agent.md`, and `workshops/vm/docs/02-configure-incident-response.md`.

Run: `test -f docs/connect-github-to-sre-agent.md && echo OK`
Expected: `OK`

- [ ] **Step 3: Confirm the shared-doc anchors referenced by the tracks exist**

Run: `grep -nE '^## (Connect your code repository|Set up the GitHub connector)$' docs/connect-github-to-sre-agent.md`
Expected: both headings are listed (these back the `#connect-your-code-repository` and `#set-up-the-github-connector` anchors).

- [ ] **Step 4: Confirm scenario tooling is unaffected**

Run: `bash scripts/validate-scenarios.sh`
Expected: ends with `Scenario validation passed`.

- [ ] **Step 5: No commit needed** (verification only). If any check fails, return to the relevant task and fix before proceeding.

---

## Self-review notes

- **Spec coverage:** Deliverable 1a → Task 1; 1b (AKS/App Service) → Tasks 2–3; 1c (VM) → Task 4. Deliverable 2 workflow → Task 5; freshness boundary note → Task 6; `gh aw compile` locks → Task 7. Validation → Task 8.
- **No placeholders:** every edit shows exact find/replace text and exact verify commands.
- **Consistency:** all three track docs link to `docs/connect-github-to-sre-agent.md` with anchors `#connect-your-code-repository` and `#set-up-the-github-connector`, which match the `##` headings created in Task 1.
