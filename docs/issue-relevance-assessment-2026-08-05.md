# GitHub issue disposition

Disposition date: 2026-08-11

## Scope

This is the final repository-wide disposition of the reviewed GitHub issues.
It assesses the current scenario capsules, shared documentation, lifecycle
scripts, generated catalog, and contract tests. It supersedes the 2026-08-05
handover-only, author-limited assessment and corrects its false conclusion
that all 15 issues it reviewed were irrelevant. Several reports identified
real gaps that were subsequently fixed.

## Validation evidence

Validation was rerun in the issue-remediation worktree on 2026-08-11:

- The full scenario-tools suite passed 108/108 tests.
- `scripts/validate-scenarios.sh --write` passed.
- `scripts/validate-scenarios.sh` passed with no catalog drift.
- Both AKS scenario entry points and alert modules compiled with
  `az bicep build`, providing Bicep compile/static validation for the
  managed-identity Container Insights DCR and `ContainerLogV2` alert changes.
  Live Azure deployment and ingestion verification remain operator
  checkpoints.
- Stale-content searches found no learner fork phrases in either AKS tree and
  no old connector anchor, `New incident response plan`,
  `workshop-all-incidents`, or `If all three checks pass` wording.
- All seven scenario READMEs identify their `low` or `high` profile as a
  **qualitative cost estimate** and list scenario-specific **dominant cost
  drivers**.

## Final disposition

| Issues | Final disposition |
| --- | --- |
| #1, #8, #19 | Already closed before this audit |
| #14, #15, #18, #20, #21, #25 | Closed after confirming current repository behavior |
| #7 | Resolved by scenario cost guidance and documentation contract coverage |
| #9, #10, #12, #16 | Resolved by the AKS setup and onboarding refresh |
| #13, #17 | Resolved by the current Agent Canvas response-plan flow |
| #22, #23 | Resolved by template-repository and workload-name consistency |

## Issue-specific evidence

| Issue | Current evidence |
| --- | --- |
| [#1](https://github.com/JoranBergfeld/sre-agent-workshop/issues/1) | Closed before the audit. The required Cosmos DB data-plane assignment exists as `cosmosRoleAssignment` in [`scenarios/cosmos-rbac-removal/infra/bicep/modules/identity.bicep`](../scenarios/cosmos-rbac-removal/infra/bicep/modules/identity.bicep), and the governed restoration is documented in that capsule's [`knowledge/operational-guidelines.md`](../scenarios/cosmos-rbac-removal/knowledge/operational-guidelines.md). |
| [#8](https://github.com/JoranBergfeld/sre-agent-workshop/issues/8) | Closed before the audit. Both AKS onboarding guides use **Builder → Knowledge base**, add the scenario-local `operational-guidelines.md` file, and wait for **Indexed**: [`cosmos-rbac-removal/docs/03-onboard-sre-agent.md`](../scenarios/cosmos-rbac-removal/docs/03-onboard-sre-agent.md) and [`workload-identity-break/docs/03-onboard-sre-agent.md`](../scenarios/workload-identity-break/docs/03-onboard-sre-agent.md). |
| [#19](https://github.com/JoranBergfeld/sre-agent-workshop/issues/19) | Closed before the audit. AKS setup now fails clearly without Azure CLI authentication and reports the active account in both [`cosmos-rbac-removal/scripts/setup.sh`](../scenarios/cosmos-rbac-removal/scripts/setup.sh) and [`workload-identity-break/scripts/setup.sh`](../scenarios/workload-identity-break/scripts/setup.sh); the matching prerequisites explain account selection and validation. |
| [#14](https://github.com/JoranBergfeld/sre-agent-workshop/issues/14) | Each AKS capsule owns one scenario-specific alert instead of asserting a shared alert-rule count: [`cosmos-rbac-removal/infra/bicep/modules/alert.bicep`](../scenarios/cosmos-rbac-removal/infra/bicep/modules/alert.bicep) and [`workload-identity-break/infra/bicep/modules/alert.bicep`](../scenarios/workload-identity-break/infra/bicep/modules/alert.bicep). |
| [#15](https://github.com/JoranBergfeld/sre-agent-workshop/issues/15) | The same two current onboarding guides cited for #8 give the persistent Knowledge base path, exact scenario-local file, source type, and **Indexed** checkpoint. The `onboarding follows the current agent setup flow` cases in [`documentation-contract.test.js`](../scripts/scenario-tools/test/documentation-contract.test.js) enforce this. |
| [#18](https://github.com/JoranBergfeld/sre-agent-workshop/issues/18) | Azure lifecycle scripts select and display an explicit subscription. [`azure-subscription-context.test.js`](../scripts/scenario-tools/test/azure-subscription-context.test.js) checks every Azure-touching Bash and PowerShell lifecycle path for `az account set` and `az account show`. |
| [#20](https://github.com/JoranBergfeld/sre-agent-workshop/issues/20) | The AKS capsule READMEs explain each fault, visible impact, alert, inject/validate commands, and recovery route: [`cosmos-rbac-removal/README.md`](../scenarios/cosmos-rbac-removal/README.md) and [`workload-identity-break/README.md`](../scenarios/workload-identity-break/README.md). Their scenario-local `scripts/inject.sh`, `scripts/inject.ps1`, `scripts/validate.sh`, and `scripts/validate.ps1` paths provide repeat-safe injection and direct workload checks. |
| [#21](https://github.com/JoranBergfeld/sre-agent-workshop/issues/21) | Current onboarding separates resource creation permissions from managed-identity access through **Full setup → Azure Resources**, then continues with **Done and go to agent**. This is documented in both AKS `docs/03-onboard-sre-agent.md` files and enforced by the onboarding contract test. |
| [#25](https://github.com/JoranBergfeld/sre-agent-workshop/issues/25) | Tool and access prerequisites are scenario-specific rather than duplicated at repository root. [`cosmos-rbac-removal/docs/00-prerequisites.md`](../scenarios/cosmos-rbac-removal/docs/00-prerequisites.md), [`workload-identity-break/docs/00-prerequisites.md`](../scenarios/workload-identity-break/docs/00-prerequisites.md), [`.devcontainer/cosmos-rbac-removal/devcontainer.json`](../.devcontainer/cosmos-rbac-removal/devcontainer.json), and [`.devcontainer/workload-identity-break/devcontainer.json`](../.devcontainer/workload-identity-break/devcontainer.json) provide the applicable setup. |
| [#7](https://github.com/JoranBergfeld/sre-agent-workshop/issues/7) | Every scenario entry guide now identifies the profile sourced from `scenario.yaml` as a **qualitative cost estimate** and lists its scenario-specific **dominant cost drivers**. Fixed AKS hourly-price and total-cost figures were removed because they become stale across regions and pricing changes; the guides instead tell learners to confirm current regional pricing and clean up promptly. [`documentation-contract.test.js`](../scripts/scenario-tools/test/documentation-contract.test.js) enforces each scenario's cost profile and rejects fixed dollar estimates across the full AKS README/docs trees while allowing shell variables. |
| [#9](https://github.com/JoranBergfeld/sre-agent-workshop/issues/9) | Both AKS onboarding guides explicitly say that **Done and go to agent** opens Team Onboarding as a pinned favorite and identify the next navigation point; the onboarding contract test covers the current flow. |
| [#10](https://github.com/JoranBergfeld/sre-agent-workshop/issues/10) | In addition to clearer AKS prerequisites, resource mapping, onboarding, repository indexing, alert evidence, and governed recovery guidance, both capsules now close the concrete logging gap: their Bicep provisions and associates an explicit managed-identity-authenticated Container Insights data collection rule with `Microsoft-ContainerLogV2` and `enableContainerLogV2: true`; alert and investigation KQL use `ContainerLogV2` with native V2 fields; and [`aks-container-insights-v2.test.js`](../scripts/scenario-tools/test/aks-container-insights-v2.test.js) provides contract coverage for the DCR wiring, managed identity, queries, metadata, and learner documentation. The learner modules are under [`scenarios/cosmos-rbac-removal/docs`](../scenarios/cosmos-rbac-removal/docs) and [`scenarios/workload-identity-break/docs`](../scenarios/workload-identity-break/docs). |
| [#12](https://github.com/JoranBergfeld/sre-agent-workshop/issues/12) | The [`cosmos-rbac-removal`](../scenarios/cosmos-rbac-removal/docs/00-prerequisites.md) and [`workload-identity-break`](../scenarios/workload-identity-break/docs/00-prerequisites.md) prerequisite guides define tools, account checks, canonical variables, and deployment/access-management roles; their `docs/04-configure-incident-response.md` guides repeat the shell and portal checks. The prerequisite and incident-prerequisite contract tests enforce them. |
| [#16](https://github.com/JoranBergfeld/sre-agent-workshop/issues/16) | [`docs/connect-github-to-sre-agent.md`](./connect-github-to-sre-agent.md) and both AKS onboarding guides use the current GitHub OAuth connector path and distinguish code indexing from issue operations. `GitHub integration guide uses current OAuth connector terminology and policy` prevents regression. |
| [#13](https://github.com/JoranBergfeld/sre-agent-workshop/issues/13) | The [`cosmos-rbac-removal`](../scenarios/cosmos-rbac-removal/docs/04-configure-incident-response.md) and [`workload-identity-break`](../scenarios/workload-identity-break/docs/04-configure-incident-response.md) response-plan guides use **Builder → Agent Canvas**, create a custom agent, and configure the capsule-specific trigger in table view. `AKS response plans use the current Agent Canvas flow` verifies the fields and rejects the obsolete flow. |
| [#17](https://github.com/JoranBergfeld/sre-agent-workshop/issues/17) | The same current response-plan guides retain **Review** autonomy, a three-hour reinvestigation cooldown, capsule-specific Sev3/title filters, and reopen/edit guidance; the Agent Canvas contract test enforces each item. |
| [#22](https://github.com/JoranBergfeld/sre-agent-workshop/issues/22) | Both AKS `docs/00-prerequisites.md` files define `WORKLOAD_NAME` and derive `RESOURCE_GROUP`, while their lifecycle commands preserve those values. Their uploaded operational guidance now derives Azure names from the connected `rg-<workload>` resource group instead of embedding either capsule's default prefix, while retaining the exact Kubernetes workload names. The workload-variable and knowledge-resource cases in [`documentation-contract.test.js`](../scripts/scenario-tools/test/documentation-contract.test.js) enforce the contract without rejecting default examples elsewhere. |
| [#23](https://github.com/JoranBergfeld/sre-agent-workshop/issues/23) | Both AKS prerequisite guides link directly to the canonical **Use this template** generator and learner documentation consistently says generated repository, not fork. The template-link and generated-repository terminology tests enforce this, while [`docs/connect-github-to-sre-agent.md`](./connect-github-to-sre-agent.md) defines the required connector permissions. |

## Authoritative AKS handoff policy

The final AKS policy is: the SRE Agent investigates and requests explicit human
approval; after approval it creates exactly one GitHub issue and assigns it to
`copilot-swe-agent` (`@copilot`). Copilot creates a pull request, a human
reviews and merges it, and an operator manually deploys the approved change.
The SRE Agent does not create a branch or pull request, modify repository code
or Azure directly, merge, or deploy. The policy is stated in the Cosmos
[`operational guidelines`](../scenarios/cosmos-rbac-removal/knowledge/operational-guidelines.md)
and [`response guide`](../scenarios/cosmos-rbac-removal/docs/90-watch-sre-agent.md),
the workload-identity
[`operational guidelines`](../scenarios/workload-identity-break/knowledge/operational-guidelines.md)
and [`response guide`](../scenarios/workload-identity-break/docs/90-watch-sre-agent.md),
and is enforced by the approved-handoff cases in
[`documentation-contract.test.js`](../scripts/scenario-tools/test/documentation-contract.test.js).
