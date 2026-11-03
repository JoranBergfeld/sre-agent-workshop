# Prerequisites, permissions and costs

## Objective

Establish a safe sandbox and identify unavailable capabilities before starting.
You are the operator and reviewer; no separate approver or change-ticket
ceremony is needed. Use synthetic data, not production resources.

## Starting conditions

- A writable repository where you may create issues/branches/PRs, run Actions
  and delegate coding tasks. Check your paid Copilot entitlement, organization
  policies, task environment access and per-session AI-credit visibility.
- For later review/security practice, verify built-in Copilot review and AI Scan
  eligibility/settings for your repository and PR. Fork/Dependabot restrictions
  and private-repository security entitlements can differ. Do not silently
  enable repository-wide paid products. PHP is not validated by CodeQL.
- An explicitly selected Azure subscription. Deployment requires permission to
  create a **dedicated** `alctx-*` resource group, App Service Linux Basic B1
  plan/site, Log Analytics workspace and Application Insights component.
  Contributor over the sandbox is sufficient for these resources, but **not**
  for assigning roles. An authorized role administrator handles SRE access.
- The operator needs telemetry query access (Log Analytics Reader / Monitoring
  Reader at the appropriate workspace/resource scope). Register `Microsoft.Web`,
  `Microsoft.OperationalInsights` and `Microsoft.Insights` if not already
  registered; provider registration can require subscription permissions.
- SRE Agent availability, model/provider access and Azure/GitHub connections.
  Provision/reuse the agent separately: setup deliberately does not create one,
  grant RBAC, enable paid features or alter shared connectors.
  Creating an agent requires Owner, or Contributor plus User Access
  Administrator, on its creation scope. Adding Azure scopes requires active
  Owner/User Access Administrator on each scope (activate PIM first).
  The browser must reach `*.azuresre.ai`.
- Node.js 22+, Git, PHP 8.3+ CLI, Azure CLI + Bicep, curl, Bash, PowerShell 7+,
  and `unzip` for tests. The `log-analytics` Azure CLI extension is required for
  bounded evidence export. The scenario Codespaces definition supplies tooling.

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

## First-party references

Checked 2026-11-03; product surfaces and tenant availability can change:

- [PHP on App Service Linux](https://learn.microsoft.com/en-us/azure/app-service/configure-language-php)
- [SRE Agent creation and setup](https://learn.microsoft.com/azure/sre-agent/create-and-set-up)
- [SRE Agent permissions](https://learn.microsoft.com/en-us/azure/sre-agent/permissions)
- [SRE connections](https://learn.microsoft.com/en-us/azure/sre-agent/connectors)
- [Copilot on GitHub and cloud tasks](https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-on-github)

Next: [Deploy](01-deploy-infrastructure.md).
