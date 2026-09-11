# 03 Onboard the SRE Agent

Connect an SRE Agent to the deployed CPU Runaway resources before configuring
the response plan.

1. Open [sre.azure.com](https://sre.azure.com) and create or select an SRE
   Agent for the subscription.
2. Map `rg-srelabcpurunaway` and its Log Analytics workspace in the agent's
   Azure resources.
3. Give the agent read-only access required to inspect the VMs, alert, and
   `Perf` telemetry. Use **Reader** and **Monitoring Reader**; do not grant
   permission to stop processes or perform remediation.
4. Confirm the agent can see the `vm-cpu-runaway` scheduled-query alert.

Continue to [02 Configure incident response](./02-configure-incident-response.md).
