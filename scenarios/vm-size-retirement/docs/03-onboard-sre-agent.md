# Module 03: Onboard the SRE Agent

Create the SRE Agent, then assign its own managed identity the scenario's
read-only access.

1. Open [sre.azure.com](https://sre.azure.com) and create or select an SRE
   Agent for the subscription and `rg-srelabretirement`.
2. Copy the managed identity's **object (principal) ID**. Do not use its client
   ID.
3. Run the setup check and re-run the deployment with that principal:

```bash
export SRE_AGENT_PRINCIPAL_ID='<SRE-Agent-managed-identity-object-id>'
./scenarios/vm-size-retirement/scripts/setup.sh \
  --sre-agent-principal-id "$SRE_AGENT_PRINCIPAL_ID"
node scripts/placement/provision.mjs deploy vm-size-retirement \
  --workload srelabretirement \
  --secure-param-env adminPassword=VM_ADMIN_PASSWORD \
  --param sreAgentPrincipalId="$SRE_AGENT_PRINCIPAL_ID"
```

```powershell
$env:SRE_AGENT_PRINCIPAL_ID = '<SRE-Agent-managed-identity-object-id>'
./scenarios/vm-size-retirement/scripts/setup.ps1 `
  -SreAgentPrincipalId $env:SRE_AGENT_PRINCIPAL_ID
node scripts/placement/provision.mjs deploy vm-size-retirement `
  --workload srelabretirement `
  --secure-param-env adminPassword=VM_ADMIN_PASSWORD `
  --param sreAgentPrincipalId=$env:SRE_AGENT_PRINCIPAL_ID
```

This rerun stays pinned to the region and VM size recorded by the first
deployment; it never resizes or relocates the VMs. The deployment grants that principal **Reader** and **Monitoring Reader**.
Local tools continue to use the signed-in operator's Azure CLI identity.

Continue to [02 Configure incident response](./02-configure-incident-response.md).
