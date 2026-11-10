# 02 Onboard the SRE Agent

Connect an SRE Agent to the deployed CPU Runaway resources before configuring
the response plan.

1. Open [sre.azure.com](https://sre.azure.com) and create or select an SRE
   Agent for the subscription.
2. In the agent's managed resources, add `rg-srelabcpurunaway`. Confirm the
   deployed VMs and Log Analytics workspace are included. If you used custom
   names, select your actual resource group.
3. Give the agent read-only access required to inspect the VMs, alert, and
   `Perf` telemetry. Use **Reader** and **Monitoring Reader**; do not grant
   permission to stop processes or perform remediation.
4. Confirm the agent can see the scheduled-query rule
   `srelabcpurunaway-vm-cpu-runaway` (display name **VM CPU Runaway**), and can
   query CPU samples for Windows computer `srecpu01`.

## Connect Azure Monitor as the incident platform

Resource access and incident ingestion are separate configuration steps.
Being able to query the workspace does not mean the agent receives alerts.

1. In the SRE Agent, open **Builder > Incident platform**.
2. Connect **Azure Monitor** if it is not already connected, following the
   connection prompts for the subscription hosting this lab.
3. Confirm Azure Monitor is shown as connected and
   `rg-srelabcpurunaway` is still included in the agent's managed resources.

Do not inject the fault yet. The next page creates the response plan that
decides which incoming alerts start an investigation.

## Verify investigation access

The template's operations identity is not automatically proof that the SRE
Agent has access. Verify permissions for the identity actually used by your
agent. Do not continue until it can read the resource group and telemetry.

Try this prompt in the agent:

> Check the CPU baseline for VM srelabcpurunaway-vm01 in resource group
> rg-srelabcpurunaway. Its Windows computer name in Perf is srecpu01. Show the
> recent CPU samples and their timestamps. Do not make any changes.

Expected result: the agent identifies the correct VM and provides recent
telemetry rather than guessing that the VM is healthy.

**Previous:** [01 Deploy infrastructure and check the baseline](./01-deploy-infrastructure.md) |
**Next:** [03 Configure incident response](./03-configure-incident-response.md).
