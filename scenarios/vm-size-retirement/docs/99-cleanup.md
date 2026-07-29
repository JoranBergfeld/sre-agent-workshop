# Module 99: Cleanup

The scenario has a high cost profile. Delete the resource group when you are
finished. All commands below run from the repository root.

Preview the exact resource group first:

```bash
./scenarios/vm-size-retirement/scripts/cleanup.sh --yes --dry-run
```

```powershell
./scenarios/vm-size-retirement/scripts/cleanup.ps1 --yes --dry-run
```

Then delete it:

```bash
./scenarios/vm-size-retirement/scripts/cleanup.sh --yes
```

```powershell
./scenarios/vm-size-retirement/scripts/cleanup.ps1 --yes
```

Use `--resource-group <name>` if you deployed a non-default resource group.
The `--yes` flag is boolean; it never consumes the resource-group value.
