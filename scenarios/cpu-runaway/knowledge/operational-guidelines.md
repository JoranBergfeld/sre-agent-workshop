# CPU Runaway Operational Guidelines

## Recovery policy

The SRE Agent investigates the `vm-cpu-runaway` alert and proposes a
repository change. It must not directly remediate the VM.

1. A human creates or explicitly approves exactly one GitHub issue with the
   diagnosis and assigns it to `@copilot`.
2. Copilot authors the pull request.
3. A human reviews and merges the pull request.
4. A human performs the controlled deployment and validates recovery.

This preserves traceability from incident through deployment. Do not make
unreviewed Azure portal or CLI changes during normal incident response.

## Approved manual fallback

When the issue → Copilot pull request → human merge → controlled deploy path
cannot be used, an authorized human may invoke the scenario-owned
`stop-cpu-runaway` remediation through its approval gate. The gate requires a
valid `CHG-` or `INC-` ticket, the exact `APPROVE` confirmation, and records
the action in `scenarios/cpu-runaway/output/actions-audit.log`.

The fallback stops only the CPU workload started by this scenario. It does not
authorize broad process termination or any direct action by the SRE Agent.
