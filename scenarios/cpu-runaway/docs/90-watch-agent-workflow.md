# 90 Watch the Agent Workflow

Run commands from the repository root. Use the local query and tooling to
capture the CPU signal and write an investigation trace:

```bash
./scenarios/cpu-runaway/tools/invoke-vm-investigation.sh \
  --workspace-id <log-analytics-workspace-id> \
  --resource-group rg-srelabcpurunaway \
  --vm-name srelabcpurunaway-vm01
```

The tooling records these stages in `scenarios/cpu-runaway/output/`:

1. Observe
2. Investigate
3. Correlate
4. Form a hypothesis
5. Propose the GitOps change
6. Await human approval
7. Validate recovery after the controlled deployment
8. Generate a postmortem

The intended handoff is human-approved: one issue assigned to `@copilot`,
Copilot authors a pull request, a human merges it, and a human performs the
controlled deployment. The SRE Agent never directly remediates the VM.

The approval-gated `stop-cpu-runaway` command remains a manual fallback for an
authorized human when the normal handoff cannot be completed.
