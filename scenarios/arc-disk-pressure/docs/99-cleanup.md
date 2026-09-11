# Module 99: Cleanup

The scenario has a high cost profile. Delete the resource group when the
exercise is complete. Run commands from the repository root.

```bash
./scenarios/arc-disk-pressure/scripts/cleanup.sh \
  --resource-group rg-srelabarcdisk \
  --yes
```

```powershell
./scenarios/arc-disk-pressure/scripts/cleanup.ps1 `
  -ResourceGroup rg-srelabarcdisk `
  -Yes
```

`--yes` is a boolean Bash flag: use `--yes`, not `--yes=true` or
`--yes=false`. To inspect the selected group without deleting it, use:

```bash
./scenarios/arc-disk-pressure/scripts/cleanup.sh --resource-group rg-srelabarcdisk --dry-run
```
