# Module 99: Cleanup

The scenario has a high cost profile. Delete the resource group when the
exercise is complete. Run commands from the repository root.

```bash
./scenarios/disk-full/scripts/cleanup.sh \
  --resource-group rg-srelabdiskfull \
  --yes
```

```powershell
./scenarios/disk-full/scripts/cleanup.ps1 `
  -ResourceGroup rg-srelabdiskfull `
  -Yes
```

`--yes` is a boolean Bash flag: use `--yes`, not `--yes=true` or
`--yes=false`. To inspect the selected group without deleting it, use:

```bash
./scenarios/disk-full/scripts/cleanup.sh --resource-group rg-srelabdiskfull --dry-run
```
