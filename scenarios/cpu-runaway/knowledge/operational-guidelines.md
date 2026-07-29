# CPU Runaway Operational Guidelines

## Recovery policy

The SRE Agent investigates the `vm-cpu-runaway` alert and proposes the
approved action. It must not directly remediate the VM.

1. The agent presents evidence and the `stop-cpu-runaway` recommendation.
2. An authorized human supplies a `CHG-` or `INC-` ticket and types exact
   `APPROVE` at the approval gate.
3. The gate runs only the scenario-owned action and records the execution.
4. The operator validates recovery before closing the incident.

The approval gate is the normal remediation path. Do not allow the SRE Agent
to run the action directly.

## Optional collaboration

GitHub issues and Copilot may assist with diagnosis or documentation, but they
do not replace the approval gate and cannot directly run remediation. The gate
requires a valid `CHG-` or `INC-` ticket, exact `APPROVE` confirmation, and
records the action in `scenarios/cpu-runaway/output/actions-audit.log`.

The action stops only the CPU workers started by this scenario. It does not
authorize broad process termination or any direct action by the SRE Agent.
