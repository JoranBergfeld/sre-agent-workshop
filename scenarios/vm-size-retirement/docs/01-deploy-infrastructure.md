# Module 1: Deploy Infrastructure

Create and designate an unused resource group once (the tooling never creates
or deletes groups; its region is only metadata):

```bash
az group exists --name rg-srelabretirement   # must print false
az group create --name rg-srelabretirement --location eastus2 --tags sre-workshop-scenario=vm-size-retirement
```

Deploy through the **Deploy VM Size Retirement Infrastructure** workflow, or
manually with the placement engine. Run from the repository root; the password
is read from the environment and never printed:

```bash
read -rsp "Windows VM administrator password: " VM_ADMIN_PASSWORD; echo; export VM_ADMIN_PASSWORD
node scripts/placement/provision.mjs deploy vm-size-retirement \
  --location eastus2 --workload srelabretirement \
  --secure-param-env adminPassword=VM_ADMIN_PASSWORD \
  --outputs-file vm-size-retirement-outputs.json
```

```powershell
$env:VM_ADMIN_PASSWORD = ConvertFrom-SecureString `
  (Read-Host 'Windows VM administrator password' -AsSecureString) -AsPlainText
node scripts/placement/provision.mjs deploy vm-size-retirement `
  --location eastus2 --workload srelabretirement `
  --secure-param-env adminPassword=VM_ADMIN_PASSWORD `
  --outputs-file vm-size-retirement-outputs.json
```

Before deploying, the engine preflights the whole scenario fleet in one region:
the two baseline VMs, the three real legacy `Standard_DS1_v2`/`Standard_DS2_v2`
VMs that injection adds later, and at least one modern remediation target
(`Standard_D2s_v5`, `Standard_D2as_v5` or `Standard_D2s_v4`). Injection reruns
that preflight in the workload's actual region and creates nothing when it
fails; remediation never relocates VMs.

The engine checks SKU restrictions, capabilities and vCPU quota for the whole
fleet, then tries the VM sizes in `infra/placement.json` (B2s, then compatible two-vCPU D-series) in a region
before falling back to Sweden Central and Australia East. It records the
region and size it used on the resource group; reruns stay pinned to them and
never resize, relocate or delete anything. See
[Region and VM-size fallback](../../../docs/region-and-sku-fallback.md).
Requires Node.js 20+.

The deployment creates two IIS VMs (`Standard_B2s` when available), a Bastion-first network,
and monitoring resources. The resources are tagged exactly with
`scenario: vm-size-retirement` and `environment: demo`.
The next module assigns the SRE Agent through the `sreAgentPrincipalId`
deployment parameter.

`main.bicep` deliberately has no scenario-alerts module. The standalone
`service-health-alert.bicep` is a production reference for a real
subscription-scoped Service Health route; it is not part of the workshop
deployment.

## Access

Use Bastion rather than public VM addresses:

```bash
./scenarios/vm-size-retirement/scripts/access/start-http-tunnel.sh
```

```powershell
./scenarios/vm-size-retirement/scripts/access/start-rdp-tunnel.ps1
```

Continue to [03 Onboard the SRE Agent](./03-onboard-sre-agent.md).
