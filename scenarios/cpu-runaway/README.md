# Scenario: CPU Runaway

> Scenario: `cpu-runaway` · Azure Virtual Machines · Compute saturation

Investigate a controlled CPU saturation incident on a Windows VM, then recover
through a human-approved action. Start with step 00 and follow the walkthrough
in order; deployment alone does **not** inject the fault.

## What you will do

1. [00 Prerequisites](./docs/00-prerequisites.md)
2. [01 Deploy infrastructure and check the baseline](./docs/01-deploy-infrastructure.md)
3. [02 Onboard the SRE Agent](./docs/02-onboard-sre-agent.md)
4. [03 Configure incident response](./docs/03-configure-incident-response.md)
5. [04 Inject the CPU fault](./docs/04-inject-fault.md)
6. [05 Investigate, approve recovery, and verify](./docs/05-investigate-and-recover.md)
7. [99 Cleanup](./docs/99-cleanup.md)

Each step contains its own commands and expected results. Run commands from
the repository root and choose either Bash or PowerShell 7, not both.

## What breaks and who fixes it

The injector starts one controlled PowerShell worker per logical processor
(at least two) on the first Windows VM. The workers are designed to sustain
CPU above 85 percent, competing with IIS for compute.

The SRE Agent investigates and proposes recovery; it does not change the VM.
The normal remediation path is for **you, the authorized operator**, to run
the scenario's local approval script, provide a ticket reference, and confirm
the action in your terminal. The script stops only the lab's marked CPU
workers. Step 05 explains exactly what the approval does and does not do.

## Cost and naming

The **high** profile is a qualitative cost estimate. The dominant cost drivers
are two Windows VMs, Standard Azure Bastion, Application Insights and Log
Analytics ingestion, and Azure SRE Agent usage. Confirm current pricing for
your deployment region before provisioning, and run cleanup immediately after
completing the scenario.

The default workload name is `srelabcpurunaway`. Custom workload names must be
unique; replace the resource group, VM, Bastion, and workspace values throughout
the walkthrough with your deployment's values.
