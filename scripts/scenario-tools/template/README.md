# Scenario: __SCENARIO_TITLE__

> Platform: `__PLATFORM__` · Scenario id: `__SCENARIO_ID__`

## Overview

Describe the user-visible failure and the outcome the learner should observe.

## Flow

1. Run `./scripts/inject.sh` or `./scripts/inject.ps1` to create the fault.
2. Run `./scripts/validate.sh` or `./scripts/validate.ps1` to confirm the failure.
3. Investigate the app, logs, and metrics in this folder.
4. Run `./scripts/cleanup.sh` or `./scripts/cleanup.ps1` to restore the starting state.
5. Run validation again to confirm the scenario is clean.

## Notes

Keep the scenario self-contained. Update the manifest, scripts, and Bicep files together.
