# Scenario: __SCENARIO_TITLE__

> Platform: `__PLATFORM__` · Scenario id: `__SCENARIO_ID__`

## Overview

Describe the user-visible failure and the outcome the learner should observe.

## Cost profile

REPLACE_THIS_COST_GUIDANCE: Replace this marked sentence with wording that
identifies the manifest's `low` or `high` profile as a
qualitative cost estimate and lists the scenario's actual dominant cost
drivers. Confirm current pricing for the deployment region before provisioning,
and run cleanup immediately after completing the scenario.

## Flow

1. [Prerequisites](./docs/00-prerequisites.md)
2. [Deploy infrastructure](./docs/01-deploy-infrastructure.md)
3. [Onboard SRE Agent](./docs/02-onboard-sre-agent.md)
4. [Configure incident response](./docs/03-configure-incident-response.md)
5. [Run and observe the scenario](./docs/90-run-observe-scenario.md)
6. [Cleanup](./docs/99-cleanup.md)

## Notes

Keep the scenario self-contained. Update the manifest, scripts, and Bicep files together.
