# Module 99: Cleanup

Run commands from the repository root when you are finished. This scenario has
a high cost profile because it creates two VMs and a Standard Azure Bastion.

Preview the default resource group:

```bash
./scenarios/iis-app-pool/scripts/cleanup.sh --dry-run
```

Delete it after confirming the target:

```bash
./scenarios/iis-app-pool/scripts/cleanup.sh --yes
```

```powershell
./scenarios/iis-app-pool/scripts/cleanup.ps1 -Yes
```

The Bash `--yes` flag is a boolean: it never takes a value and only bypasses
the confirmation prompt. Verify deletion with:

```bash
az group show --name rg-srelabiisapppool
```
