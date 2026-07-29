# 90 Watch the Agent Workflow

Run commands from the repository root. Use the local query and tooling to
capture the CPU signal and write an investigation trace:

```bash
./scenarios/cpu-runaway/tools/invoke-vm-investigation.sh \
  --workspace-id <log-analytics-workspace-id> \
  --resource-group rg-srelabcpurunaway \
  --vm-name srelabcpurunaway-vm01 \
  --computer-name srecpu01
```

The tooling records these stages in `scenarios/cpu-runaway/output/`:

1. Observe
2. Investigate
3. Correlate
4. Form a hypothesis
5. Propose the approved `stop-cpu-runaway` action
6. Await human approval
7. Execute through the approval gate after `APPROVE`
8. Validate recovery
9. Generate a postmortem

The approval gate is the normal remediation path: an authorized human supplies
a valid ticket and exact `APPROVE` confirmation. The SRE Agent never directly
remediates the VM.

GitHub issues and Copilot may assist with the investigation record or
documentation, but cannot replace the gate or run remediation directly.
