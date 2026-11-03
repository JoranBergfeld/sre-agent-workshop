# Region and VM-size fallback

Capacity, SKU restrictions and quota differ by subscription and region. Every
scenario therefore deploys through a shared placement engine,
`scripts/placement/provision.mjs`. It is driven by the scenario's own policy
file, `scenarios/<id>/infra/placement.json`, so you no longer have to guess a
region or VM size that works for your subscription.

Requirements: Azure CLI (signed in) and **Node.js 20 or later**. The engine
has no npm dependencies.

With **native Windows Node.js**, **PowerShell 7 (`pwsh.exe` on PATH)** is also
required, including when you invoke Bash scripts from Git Bash. The Azure CLI
Windows shim runs through an argument-preserving PowerShell bridge. Verify
`pwsh.exe --version` before setup; if it is missing, the engine stops before
running any Azure command with installation guidance. Windows PowerShell 5.1
(`powershell.exe`) is not a supported substitute. WSL uses its own Linux Node.js
and Azure CLI and does not need this Windows bridge.

Windows script execution policy must permit the repository's bridge script.
If an organization blocks unsigned scripts or treats a WSL UNC checkout as
remote, use Linux Node.js and Azure CLI inside WSL rather than weakening that
policy.

## What the engine does

1. **Preflight.** For each candidate region in policy order, it checks:
   - the region is visible to your subscription;
   - the policy's resource providers are available;
   - service checks pass (App Service Linux plan, runtime stack, Functions
     Consumption, a supported AKS minor version, serverless Cosmos DB);
   - the compute SKUs are not restricted for your subscription and have the
     required capabilities (vCPUs, memory, x64, Premium disks, Gen2, SCSI);
   - regional and family vCPU quota covers the complete planned fleet. For
     AKS that includes the upgrade surge node.
2. **Order of fallback.** It tries compatible VM families in a region before
   it moves on to the next region. The candidate lists are bounded and
   explicit; nothing outside them is ever tried.
3. **Retries only on availability failures.** It retries the next candidate
   only for classified regional, SKU, quota and allocation availability
   failures, and only after it has verified that the failed attempt changed
   nothing.
   - Authentication, discovery, API, template and validation errors stop
     immediately. A failed lookup is never treated as "no capacity".
   - The engine never deletes resources. If it cannot prove that a failed
     attempt left nothing behind, it stops and reports what it found.
4. **Reports exhaustion.** When every candidate fails, it lists the reason for
   each region and SKU.
5. **Records the placement it actually used.** It writes the region, SKU and
   deployment name to the resource group as `sre-workshop-*` tags and to the
   deployment outputs. Connection strings and other secrets are never printed.

## Reruns stay pinned

An existing deployment is never relocated, resized or upgraded:

- It keeps its actual region. With `--no-region-fallback`, a deployment in a
  different region from the one you asked for is an error.
- **VMs.** Baseline VMs keep their size. Mixed or ambiguous baseline sizes,
  or malformed or empty discovery results, fail closed.
- **AKS.** The template's `system` pool keeps its node size. The cluster keeps
  its exact running patch version, not just the minor version, because a
  minor-only version could pick up a newer patch. A cluster that was
  requested with only a major.minor version is accepted when its running patch
  has that minor and the cluster is `Succeeded`.
- **AKS reruns are refused** while an upgrade is in progress, when the group
  holds several clusters, when there is no pool named `system`, and when the
  pool versions or node counts are unknown.
- **Partial reruns.** If a baseline VM or pool node has to be recreated, the
  pinned size gets the same quota preflight first.
- **Template-managed names only.** Reruns reuse only the resources that belong
  to the requested workload and follow the template's naming contract:

  | Resources | Naming contract |
  | --- | --- |
  | Most VM scenarios | `<workload>-vm01`, `<workload>-vm02` |
  | IIS App Pool | `take(replace(workload, '-', ''), 10)` followed by `-01`/`-02` |
  | VM Size Retirement fleet | `<workload>-legacy-01..03` |
  | AKS | `<workload>-aks` |

  The engine refuses to deploy if the group contains:
  - a resource of another workload;
  - a VM or cluster whose name it doesn't recognize;
  - resources from more than one workload.
- **Pinned deployment names** are bounded to Azure's 64-character limit with a
  deterministic hash suffix.

## Resource groups are designated by you

The tooling never creates, relocates or deletes resource groups. Azure's
`az group create` is a create-or-update, so the tooling could otherwise take
over a group that someone else creates at the same moment.

Create the group yourself:

1. Pick a name nobody else uses.
2. Confirm `az group exists --name <rg>` prints `false`.
3. Create and designate the group:

   ```bash
   az group create --name <rg> --location <region> --tags sre-workshop-scenario=<scenario-id>
   ```

The group's own region is only metadata. The workload's resources may still
fall back to another supported region. A group that already contains resources
is adopted only if the engine can verify that the scenario's earlier
deployments own every resource in it.

## Candidate regions and sizes

| Scenario | Regions, in order | Compute sizes, in order |
| --- | --- | --- |
| CPU Runaway | East US 2, Sweden Central, Australia East | B2s, D2s v5, D2as v5, D2s v6, D2s v4 (2 Windows VMs) |
| IIS App Pool | East US 2, Sweden Central, Australia East | B2s, D2s v5, D2as v5, D2s v6, D2s v4 (2 Windows VMs) |
| Arc Disk Pressure | East US 2, Sweden Central, Australia East | D2s v7, D2s v6, D2as v6, D2s v5, D2as v5 (1 Windows VM) |
| VM Size Retirement | East US 2, Sweden Central, Australia East | Baseline: B2s, D2s v5, D2as v5, D2s v6, D2s v4. Legacy fleet: 2 × DS1 v2 and 1 × DS2 v2 (fixed). Remediation targets: D2s v5, D2as v5, D2s v4 |
| Cosmos RBAC Removal | East US 2, Sweden Central, Australia East | AKS system pool: D4ads v6, D4ads v5, D4s v5, D4as v5 (2 nodes + 1 surge) |
| Workload Identity Break | East US 2, Sweden Central, Australia East | AKS system pool: D4ads v6, D4ads v5, D4s v5, D4as v5 (2 nodes + 1 surge) |
| Cloud Agent Handover | East US 2, Sweden Central, Australia East | App Service Linux B1, .NET 10 |
| Azure Boards Copilot Handover | East US 2, Sweden Central, Australia East | Functions Consumption, Python 3.12 |
| App Service Latency Context | West Europe, Sweden Central, East US 2, Australia East | App Service Linux B1, PHP 8.3 |

The first size in each list is the cheapest that preserves the scenario's
behaviour. Fallback sizes can cost more: a D-series VM typically costs more
per hour than a B2s, and Premium SSD support is kept for every VM size.

VM Size Retirement uses real retiring DS1 v2 and DS2 v2 VMs. The baseline
fleet, the legacy fleet and at least one remediation target must all be
eligible in the same region. Remediation never relocates VMs.

The SRE Agent's own placement is independent of the workload's placement.

## Options

| Option | Effect |
| --- | --- |
| `--location <region>` | Preferred region. It must be in the policy; the rest of the policy order follows. |
| `--no-region-fallback` | Only the given region. A deployment elsewhere is an error. |
| `--sku <size>` | Preferred size. It must be in the policy. |
| `--workload <name>` | Workload name. Determines the resource names and the default group. |
| `--resource-group <name>` | Explicit, designated resource group. |
| `check --json` | Preflight only; no Azure changes. |

Run `node scripts/placement/provision.mjs --help` for the full list. The
scenario `setup.sh`/`setup.ps1` scripts and the **Deploy … Infrastructure**
workflows pass these options through. The workflows expose them as the
`location` and `regionFallback` inputs.

## If no candidate works

The error lists each region and size with the reason it was rejected, such as
`quota`, `restricted` or `capacity`. To resolve it, do one of the following:

- request quota for the named VM family in one of the listed regions;
- choose a different subscription;
- wait and retry.

Do not edit the template to force an unlisted size. The policies only list
sizes that preserve each scenario's incident behaviour.
