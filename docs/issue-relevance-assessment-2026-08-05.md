# Issue relevance assessment

Assessment date: 2026-08-05

## Scope

This assessment covers every GitHub issue filed in this repository by
`bram-boer` and `verboompj`. Each issue is evaluated against the current
`scenarios/cloud-agent-handover` documentation because that capsule reflects
the latest workshop flow.

Decisions use the following meanings:

- **Relevant**: the reported problem is still present in the current handover
  documentation.
- **Partially relevant**: the original scenario or terminology is obsolete,
  but the current handover documentation still has the same underlying gap.
- **Not relevant**: the current handover documentation addresses or avoids the
  reported problem.

## Summary

| Decision | Count |
| --- | ---: |
| Relevant | 0 |
| Partially relevant | 0 |
| Not relevant | 15 |

## Issue assessments

| Issue | Author | Decision | Reason |
| --- | --- | --- | --- |
| [#23 GitHub Repo prereqs for PR's to work?](https://github.com/JoranBergfeld/sre-agent-workshop/issues/23) | `bram-boer` | **Not relevant** | The current handover scenario requires a repository created with **Use this template**, not a fork. Its prerequisites require Copilot cloud agent to be enabled and assignable, setup stops when `copilot-swe-agent` is unavailable, and the GitHub-only path explains how to diagnose disabled issues or unavailable assignment. GitHub Docs confirms that availability depends on the user's plan and repository or organization policy. |
| [#22 AKS Track - Environment Variable WORKLOAD_NAME not applied consistently as variable](https://github.com/JoranBergfeld/sre-agent-workshop/issues/22) | `verboompj` | **Not relevant** | The current handover scripts derive the resource group as `rg-<workload>`, pass the selected workload through deployment and repository variables, and document how to pass a custom resource group to validation. The old hard-coded AKS path is not used by this scenario. |
| [#21 AKS Track - Module 3 - Order of deploying + granting SRE Agent access has changed](https://github.com/JoranBergfeld/sre-agent-workshop/issues/21) | `verboompj` | **Not relevant** | The original AKS instructions are obsolete. The handover onboarding module now distinguishes permission to deploy the SRE Agent resource from granting its managed identity Reader access to the scenario resource group through the Azure Resources card. |
| [#20 Deploy the fault (module 5)](https://github.com/JoranBergfeld/sre-agent-workshop/issues/20) | `bram-boer` | **Not relevant** | The handover README explains the fault in functional terms, names the failing route and exception, provides both a UI trigger and Bash/PowerShell injectors, and states the expected alert and recovery contract. Learners do not need to infer the fault from Bicep. |
| [#19 Verify Current State](https://github.com/JoranBergfeld/sre-agent-workshop/issues/19) | `bram-boer` | **Not relevant** | The prerequisites explicitly require Azure CLI authentication and checking the active account. Setup checks `az account show`, while application verification uses the public application URL and does not require Azure credentials. |
| [#18 scripts in all documents - set context to correct subscription and credentials](https://github.com/JoranBergfeld/sre-agent-workshop/issues/18) | `bram-boer` | **Not relevant** | The prerequisites and scenario guides now show `az account set`, setup accepts an explicit subscription ID, and Azure-touching lifecycle scripts select and verify the active subscription before operating. |
| [#17 create incident response plan - gui update?](https://github.com/JoranBergfeld/sre-agent-workshop/issues/17) | `bram-boer` | **Not relevant** | The handover module uses the current **Builder → Agent Canvas → Create → Trigger → Incident response plan** flow and instructs learners to keep the default three-hour Azure Monitor reinvestigation cooldown enabled. |
| [#16 Set up the GitHub connector](https://github.com/JoranBergfeld/sre-agent-workshop/issues/16) | `bram-boer` | **Not relevant** | The shared GitHub connection guide separates the code repository connection from the GitHub operations connector, documents OAuth and PAT as supported authentication methods, provides the workshop PAT flow, and includes least-privilege permissions, token security, and a read-only verification prompt. |
| [#15 Knowledge Sources](https://github.com/JoranBergfeld/sre-agent-workshop/issues/15) | `bram-boer` | **Not relevant** | The handover module directs learners to **Builder → Knowledge base**, identifies the operational-guidelines file, and requires its status to reach **Indexed** as a persistent file source. |
| [#14 in module 4 we verify the alertrules, this states 2 but it returns 3](https://github.com/JoranBergfeld/sre-agent-workshop/issues/14) | `bram-boer` | **Not relevant** | The handover capsule defines and documents one scenario-specific alert, `<workload>-unfinished-feature-5xx`. It does not claim that a broader resource group contains exactly two alert rules. |
| [#13 in module 4 - monitoring setup fields changed](https://github.com/JoranBergfeld/sre-agent-workshop/issues/13) | `bram-boer` | **Not relevant** | The handover onboarding module deliberately avoids depending on an exact setup screen layout, and its response-plan module uses the current **New incident response plan**, preview, create, and status-verification flow documented by Microsoft Learn. |
| [#12 Module 4: Configure Incident Response (~20 min) prereq check](https://github.com/JoranBergfeld/sre-agent-workshop/issues/12) | `bram-boer` | **Not relevant** | The handover prerequisites distinguish Bash and PowerShell 7, list required tools and Azure roles, state that commands run from the repository root, and explain the expected setup output and role-assignment failure mode. |
| [#10 Few knowledge gaps that can be filled to enhance the workshop cases](https://github.com/JoranBergfeld/sre-agent-workshop/issues/10) | `bram-boer` | **Not relevant** | The current handover capsule documents its application architecture, telemetry signal, source and test locations, deployment workflow, operator responsibilities, exact API contract, and resource-group scope. The older AKS-specific ambiguity about Container Insights, image publication, and resource mapping does not apply to this App Service scenario. |
| [#9 Module 3 Team Onboarding, unclear in which window this should be](https://github.com/JoranBergfeld/sre-agent-workshop/issues/9) | `bram-boer` | **Not relevant** | The handover onboarding module now tells the learner to select **Done and go to agent** and continue on the **Team Onboarding** page, where the Azure Resources permission status is verified. |
| [#8 Knowledge Files are renamed in the gui](https://github.com/JoranBergfeld/sre-agent-workshop/issues/8) | `bram-boer` | **Not relevant** | The handover module no longer instructs learners to find a **Knowledge Files** control. It uses the generic term “knowledge source.” Current Microsoft Learn terminology is **Knowledge base**, with files as one source type. |

## Current documentation actions indicated by the assessment

The current handover documentation addresses all five gaps identified during
the assessment: team-onboarding navigation, Azure resource access, Knowledge
base navigation, reinvestigation cooldown guidance, and explicit subscription
selection.

## Sources

### Repository documentation

- [`scenarios/cloud-agent-handover/README.md`](../scenarios/cloud-agent-handover/README.md)
- [`scenarios/cloud-agent-handover/docs/00-prerequisites.md`](../scenarios/cloud-agent-handover/docs/00-prerequisites.md)
- [`scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md`](../scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md)
- [`scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md`](../scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md)
- [`scenarios/cloud-agent-handover/docs/04-configure-incident-response.md`](../scenarios/cloud-agent-handover/docs/04-configure-incident-response.md)
- [`scenarios/cloud-agent-handover/docs/90-watch-sre-agent.md`](../scenarios/cloud-agent-handover/docs/90-watch-sre-agent.md)
- [`docs/connect-github-to-sre-agent.md`](./connect-github-to-sre-agent.md)

### Microsoft Learn

- [Create and Set Up Azure SRE Agent](https://learn.microsoft.com/en-us/azure/sre-agent/create-and-set-up)
- [Team onboarding for Azure SRE Agent](https://learn.microsoft.com/en-us/azure/sre-agent/team-onboard)
- [Connect knowledge in Azure SRE Agent](https://learn.microsoft.com/en-us/azure/sre-agent/connect-knowledge)
- [Connect source code to Azure SRE Agent](https://learn.microsoft.com/en-us/azure/sre-agent/connect-source-code)
- [Set up GitHub connector in Azure SRE Agent](https://learn.microsoft.com/en-us/azure/sre-agent/setup-github-connector)
- [Incident Response Plans in Azure SRE Agent](https://learn.microsoft.com/en-us/azure/sre-agent/incident-response-plans)
- [Create an incident response plan](https://learn.microsoft.com/en-us/azure/sre-agent/response-plan)

### GitHub Docs

- [GitHub Copilot cloud agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent)
- [Starting GitHub Copilot sessions](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/start-copilot-sessions)
- [Troubleshooting GitHub Copilot cloud agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/troubleshoot-cloud-agent)
- [Configuring settings for GitHub Copilot cloud agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/configuring-agent-settings)
