# Module 01: Deploy Infrastructure

Run commands from the repository root. The direct entry point
`scenarios/iis-app-pool/infra/bicep/main.bicep` deploys only this capsule:

- two Windows Server IIS VMs and daily auto-shutdown
- VNet, NSG, and Azure Bastion access
- Log Analytics, Application Insights, and an investigation identity
- the `vm-iis-app-pool-failure` alert, scoped directly to this capsule's Log
  Analytics workspace

Create and designate an unused resource group once (the tooling never creates
or deletes groups; its region is only metadata):

```bash
az group exists --name rg-srelabiisapppool   # must print false
az group create --name rg-srelabiisapppool --location eastus2 --tags sre-workshop-scenario=iis-app-pool
```

Deploy with the capsule defaults through the **Deploy IIS App Pool
Infrastructure** workflow, or manually with the placement engine:

```bash
read -rsp "Windows VM administrator password: " ADMIN_PASSWORD; echo; export ADMIN_PASSWORD
node scripts/placement/provision.mjs deploy iis-app-pool \
  --location eastus2 --workload srelabiisapppool \
  --secure-param-env adminPassword=ADMIN_PASSWORD \
  --outputs-file iis-app-pool-outputs.json
```

The outputs file holds the values later modules need. The VM names follow the
template contract `take(replace(workload, '-', ''), 10)` plus `-01`/`-02`
(`srelabiisa-01` and `srelabiisa-02` for the default workload).

The engine checks SKU restrictions, capabilities and vCPU quota for the whole
fleet, then tries the VM sizes in `infra/placement.json` (B2s, then compatible two-vCPU D-series) in a region
before falling back to Sweden Central and Australia East. It records the
region and size it used on the resource group; reruns stay pinned to them and
never resize, relocate or delete anything. See
[Region and VM-size fallback](../../../docs/region-and-sku-fallback.md).
Requires Node.js 20+.

Open an HTTP tunnel when you need to inspect IIS locally:

```bash
./scenarios/iis-app-pool/scripts/access/start-http-tunnel.sh
```

Next: [02 Configure incident response](./02-configure-incident-response.md).
