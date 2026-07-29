# Module 90: Watch the Workflow

Inject the fault after the VMs and Azure Monitor agent are reporting data:

```bash
./scenarios/disk-full/scripts/inject.sh \
  --resource-group rg-srelabdiskfull \
  --vm-name srelabdiskfull-vm01
```

```powershell
./scenarios/disk-full/scripts/inject.ps1 `
  -ResourceGroup rg-srelabdiskfull `
  -VmName srelabdiskfull-vm01
```

Wait for the five-minute alert evaluation. Then run the local investigation
tool with the Log Analytics workspace ID collected at deployment:

```bash
./scenarios/disk-full/tools/invoke-vm-investigation.sh \
  --workspace-id <LOG_ANALYTICS_WORKSPACE_ID> \
  --resource-group rg-srelabdiskfull \
  --vm-name srelabdiskfull-vm01
```

It writes an investigation trace and postmortem to `output/`. Confirm the
trace progresses through Observe, Investigate, Correlate, Hypothesis, Propose,
AwaitApproval, Execute, Validate, and Postmortem.

The recovery remains **issue → `@copilot` → Copilot PR → human merge →
controlled deployment**. The approval gate is a direct, ticketed manual
fallback only. After recovery, validate the IIS workload through Bastion:

```bash
./scenarios/disk-full/scripts/validate.sh \
  --resource-group rg-srelabdiskfull \
  --vm-name srelabdiskfull-vm01 \
  --bastion-name srelabdiskfull-bas
```
