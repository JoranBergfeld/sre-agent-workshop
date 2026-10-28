# Arc-Enabled Server Disk Pressure Scenario Operational Guidelines

## Investigation boundary

The SRE Agent is investigation-only. It may inspect Azure Resource Graph,
Heartbeat, performance, alert, Activity Log, and IIS evidence, but it must not
execute recovery. The agent identity must not have
`Microsoft.HybridCompute/machines/runCommands/write`; only the learner/operator
identity may invoke Arc Run Command.

## Approved recovery

Recovery requires a fresh, single-use approval envelope containing the target,
incident evidence snapshot, allowed action, timestamp, and a `CHG-<number>` or
`INC-<number>` ticket. The learner must type uppercase `APPROVE`. The only
allowed action is `cleanup-arc-disk-pressure`, which stops the owned injector
and removes only its marker, owner record, PID, and `C:\Temp\diskfill` files.

If Arc connectivity or telemetry is unhealthy, do not retry remotely. Obtain a
fresh approval and execute the same narrowly scoped cleanup locally on the host.
Every outcome is written to `output/actions-audit.log`; failures fail closed.
