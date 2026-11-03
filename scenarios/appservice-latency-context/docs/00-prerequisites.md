# Prerequisites, permissions and costs

## Objective

Establish a safe sandbox and identify unavailable capabilities before starting.
You are the operator and reviewer; no separate approver or change-ticket
ceremony is needed. Use synthetic data, not production resources.

Starting assets: the [capsule guide](../README.md), paired lifecycle helpers,
and an authorized sandbox/repository. Deployment and connection checks happen
before the measured [baseline incident pass](04-baseline.md).

## Starting conditions

- A writable repository where you may create issues/branches/PRs, run Actions
  and delegate coding tasks. Check your paid Copilot entitlement, organization
  policies, task environment access and per-session AI-credit visibility.
  The current GitHub cloud experience requires a paid Copilot plan and is
  subject to repository, organization and enterprise policy. Without write
  access the session is read-only. Complete organization SSO where required.
  Issue assignment to **Copilot** (`copilot-swe-agent`) and starting-branch
  selection must be available before claiming a live coding handover.
  Cloud sandboxes and Actions-based sessions have different tooling/setup
  support; permitted compute allowance is separate from AI credits.
- For later review/security practice, verify built-in Copilot review and AI Scan
  eligibility/settings for your repository and PR. Fork/Dependabot restrictions
  and private-repository security entitlements can differ. Do not silently
  enable repository-wide paid products. PHP is not validated by CodeQL.
- An explicitly selected Azure subscription. Deployment requires permission to
  pre-create and designate a **dedicated** `alctx-*` resource group (tooling
  never creates groups), App Service Linux Basic B1
  plan/site, Log Analytics workspace and Application Insights component.
  Contributor over the sandbox is sufficient for these resources, but **not**
  for assigning roles. An authorized role administrator handles SRE access.
- The operator needs telemetry query access (Log Analytics Reader / Monitoring
  Reader at the appropriate workspace/resource scope). Register `Microsoft.Web`,
  `Microsoft.OperationalInsights` and `Microsoft.Insights` if not already
  registered; provider registration can require subscription permissions.
  Workspace/resource access mode and table restrictions can limit queries even
  with resource reads. Also obtain query access to the **agent's own Application
  Insights** for SRE input/output token audit events; the app workspace alone
  cannot establish model consumption. These are separate resource scopes.
- SRE Agent availability, model/provider access and Azure/GitHub connections.
  Provision/reuse the agent separately: setup deliberately does not create one,
  grant RBAC, enable paid features or alter shared connectors.
  Creating an agent requires Owner, or Contributor plus User Access
  Administrator, on its creation scope. Adding Azure scopes requires active
  Owner/User Access Administrator on each scope (activate PIM first).
  The browser must reach `*.azuresre.ai`.
- SRE user roles are separate from Azure control-plane roles. Chat/diagnostics
  require **SRE Agent Standard User** or **SRE Agent Administrator**; Reader
  cannot chat. Administrator manages general connectors and approves actions.
  Later authoring needs Standard User + Author or Administrator; Author alone
  cannot chat or add repositories through the portal. Owner/Contributor does
  not replace these SRE data-action roles.
- A GitHub connection authorized for code reads and, at the approved handover
  checkpoint only, creation of one issue in the learner repository. Review
  OAuth/app access and organization consent. Do not equate code access with
  issue-write capability or grant merge/deployment credentials to agents.
- Node.js 22+, Git, PHP 8.3+ CLI, Azure CLI + Bicep, GitHub CLI (`gh`), curl, Bash, PowerShell 7+,
  and `unzip` for tests. The `log-analytics` Azure CLI extension is required for
  bounded evidence export. The scenario Codespaces definition supplies tooling.
  `gh agent-task create --help` must expose `--base` if using the CLI branch
  fallback (verified with gh 2.97); no CLI task is needed when issue assignment
  provides the starting-branch picker.
- A successful, unexpired **Validate App Service Latency Context Application**
  build for the exact checkout commit in the origin repository. Default
  deployment verifies provenance and checksums for the healthy/faulty package.
  The checkout's deployable source must be clean. The resolver prints the
  exact workflow dispatch command when no matching artifact exists; publish
  the commit, dispatch that build on its branch/tag, wait for success and retry.
  `--local-build` is an explicit offline/source alternative, not an automatic
  fallback after verification fails.

**Costs remain visible:** an always-on B1 plan bills while idle; telemetry
ingestion/retention, agent/model usage, GitHub AI credits and Codespaces can
also be metered. The workspace has a small daily cap, not a cost guarantee;
reaching it can create missing evidence. There is no promised price, duration
or savings target. Preserve useful evidence, then clean up promptly.

<details>
<summary>Show exact steps</summary>

From the repository root, open the dedicated Codespaces configuration or verify:

```bash
node --version
php --version
git --version
gh --version
gh auth status
gh agent-task create --help
pwsh --version
curl --version
az version
az bicep version
az extension show --name log-analytics
az login
az account list --output table
```

The same native commands work in PowerShell (`curl.exe` on Windows). If the
extension is missing, explicitly install it with
`az extension add --name log-analytics`. Do not change tenant policies or
subscriptions to work around an authorization error.

Open the repository **Issues** and confirm you may review/assign issues. Inspect
your Copilot plan/policies and the available coding environment without
starting a task. On the SRE resource's Azure IAM page, check your SRE user role;
review the agent UAMI's actual Azure grants with the authorized administrator.
Reader scope setup can add monitoring/operator roles; it is not a universal
read-only guarantee. Confirm scoped log reads in the app workspace and the
agent's Application Insights. Do not request OBO elevation for investigation.
Record access gaps and the consumption source you can actually see.

For the authorized connected workshop test environment, the only permitted
subscription is **Sandbox** `fa68ebb3-c4c4-4b3f-8c91-cbef4c119d77`.
Setup still requires you to pass `--subscription` explicitly; it never relies
on the active CLI account or changes its default subscription.

</details>

## Observe and experiment

Confirm the selected tenant/subscription and repository are yours to use.
Record missing permissions/features separately from incident results. Try
local reproduction first if Azure or AI features are unavailable; resume the
live checkpoint later. References are examples, never observed live evidence.

**Troubleshooting:** quota/region/runtime restrictions require an authorized
sandbox administrator or another permitted region, not broader agent rights.
If you cannot query logs, fix resource/workspace scope before investigating.
If credits/counters are hidden, record them as unmeasured rather than estimate.
An allowance, quota, AAU allocation or "token usage" dialog showing a monthly
limit is not direct per-session spend. Keep SRE input/output tokens and GitHub
per-session AI credits separate, with delegated/retry coverage disclosed.
Setup/customization and review/security usage stay separate from incident
measurement. Do not enable paid features as an implicit continuation step:
retain the gap, use labelled references/local work and resume live checks later.

## First-party references

Checked 2026-11-03; product surfaces and tenant availability can change:

- [PHP on App Service Linux](https://learn.microsoft.com/en-us/azure/app-service/configure-language-php)
- [SRE Agent creation and setup](https://learn.microsoft.com/azure/sre-agent/create-and-set-up)
- [SRE Agent permissions](https://learn.microsoft.com/en-us/azure/sre-agent/permissions)
- [SRE user roles](https://learn.microsoft.com/en-us/azure/sre-agent/user-roles)
- [Workspace query access](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access)
- [SRE connections](https://learn.microsoft.com/en-us/azure/sre-agent/connectors)
- [Copilot on GitHub and cloud tasks](https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-on-github)
- [Issue assignment and branch selection](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github#assigning-an-issue-to-copilot)
- [SRE token audit fields](https://learn.microsoft.com/en-us/azure/sre-agent/audit-agent-actions)
- [GitHub AI credits](https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing)

The newer setup guide is the onboarding reference where older permission-page
wording differs; inspect actual grants rather than resolving discrepancies by
granting subscription-wide rights. Documentation establishes product support,
not observed access or live results in your environment.

Next: [Deploy](01-deploy-infrastructure.md).
