# Cloud Agent Handover Feedback Design

## Scope

Implement the August 2026 workshop feedback for the Cloud Agent Handover
capsule, excluding Azure DevOps Boards integration and guidance.

The changes remain focused on:

- `scenarios/cloud-agent-handover/docs/00-prerequisites.md`
- `scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md`
- `scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md`
- `scenarios/cloud-agent-handover/docs/04-configure-incident-response.md`
- focused scenario-tool documentation contract tests

Shared GitHub connector guidance and other scenario capsules remain unchanged
unless a link must be corrected for the handover flow.

## Prerequisites and Region Guidance

The prerequisites module will explicitly list the Azure resource providers
registered by setup:

- `Microsoft.Web`
- `Microsoft.Insights`
- `Microsoft.OperationalInsights`

It will explain that the operator needs subscription permission to register
providers when they are not already registered. The readiness checklist will
include provider registration or permission to register them.

The GitHub prerequisite will state the precise CodeQL availability rule:
CodeQL is available for public repositories without a GitHub Code Security
license, while private or internal participant-owned repositories require
GitHub Code Security, historically part of GitHub Advanced Security, to run
the workshop's CodeQL workflow.

Sweden Central will be the recommended deployment region because workshop
participants encountered quota constraints elsewhere. East US 2 and Australia
East remain supported alternatives. Deployment examples and default guidance
will lead with `swedencentral` without changing the setup scripts' existing
compatibility unless implementation reveals a safe, directly related default
change is required.

## Prescriptive SRE Agent Onboarding

The onboarding module will separate agent creation from data-source setup and
provide expected values for the scenario:

- subscription: the workshop subscription
- resource group: `rg-<workload>`
- region: Sweden Central when the infrastructure uses the recommended region,
  otherwise the same supported deployment region
- Application Insights: `<workload>-ai`
- model provider and model: an available tenant-supported choice

The setup guidance will describe each relevant panel and its expected outcome:

| Panel | Workshop configuration |
| --- | --- |
| Code | Connect the generated GitHub repository and wait for a green check. |
| Logs | Skip additional log connectors because the scenario uses the Log Analytics and Application Insights resources covered through Azure resource access. |
| Azure Resources | Add `rg-<workload>` with Reader-level access and wait for permissions to complete. |
| Incidents | Connect Azure Monitor so the scenario alert can create incidents. |

The guide will distinguish Quickstart and Full setup where current portal
navigation does so, explain how to return through **Complete setup**, and add a
verification checklist for the required completed states. It will retain the
persistent operational-guidelines upload and Team Onboarding handoff.

## Incident Response Plan Flow

The incident-response module will make the prerequisites explicit before plan
creation:

1. Azure Monitor is connected as the incident platform.
2. A scenario-specific custom agent exists in Agent Canvas.
3. The custom agent has the indexed operational guidance and only the tools
   needed for investigation and approved GitHub issue creation.

The custom-agent instructions will preserve the governance contract: diagnose
the unfinished endpoint, do not change Azure or repository code directly,
request approval before creating one unassigned issue, and leave Copilot
assignment, pull-request review, merge, and deployment to the documented
actors.

The plan navigation will follow the current Microsoft flow:

1. Open **Builder → Agent Canvas**.
2. Select **Create → Trigger → Incident response plan**.
3. Configure `cloud-agent-handover-review`, the scenario custom agent, Sev2,
   the exact alert-title filter, Review autonomy, and the default three-hour
   cooldown.
4. Select **Next**, preview matches, create the plan, and verify it in the
   response-plan grid.

The guide will retain the instruction to remove the default `quickstart` plan
to avoid duplicate routing.

## Validation

Focused Node tests will assert that the handover documentation retains:

- all three provider namespaces
- the public versus private/internal CodeQL licensing rule
- Sweden Central as the recommended region
- prescriptive coverage of Code, Logs, Azure Resources, and Incidents
- Azure Monitor and scenario custom-agent prerequisites
- the current Agent Canvas response-plan navigation
- Review autonomy and the governed unassigned-issue handoff

After implementation, run:

```bash
npm --prefix scripts/scenario-tools test
scripts/validate-scenarios.sh --write
scripts/validate-scenarios.sh
```

The generated root scenario catalog will only change if manifest-derived
content requires regeneration.
