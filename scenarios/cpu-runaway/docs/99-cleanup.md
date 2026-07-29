# 99 Cleanup

Run commands from the repository root. The default resource group is
`rg-srelabcpurunaway`. If you used a custom workload name, pass its matching
resource group explicitly.

```bash
./scenarios/cpu-runaway/scripts/cleanup.sh \
  --resource-group rg-srelabcpurunaway
```

```powershell
.\scenarios\cpu-runaway\scripts\cleanup.ps1 `
  -ResourceGroup rg-srelabcpurunaway
```

Use `--yes` (Bash) or `-Yes` (PowerShell) only to skip the confirmation
prompt. It is a Boolean flag, never a resource-group value:

```bash
./scenarios/cpu-runaway/scripts/cleanup.sh \
  --resource-group rg-srelabcpurunaway --yes
```

```powershell
.\scenarios\cpu-runaway\scripts\cleanup.ps1 `
  -ResourceGroup rg-srelabcpurunaway -Yes
```

The cleanup script deletes only the named resource group after it verifies
that it exists; it does not run broad destructive commands.
