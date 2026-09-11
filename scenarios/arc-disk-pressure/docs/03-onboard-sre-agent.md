# Module 03: Onboard the SRE Agent

The Arc onboarding in the deployment module connects the evaluation server to
Azure. This module separately connects an SRE Agent to the scenario resources.

1. Open [sre.azure.com](https://sre.azure.com) and create or select an SRE
   Agent for the subscription.
2. Map `rg-srelabarcdisk`, its Arc-enabled server, and its Log Analytics
   workspace in the agent's Azure resources.
3. Give the agent read-only access needed to inspect the resources and
   telemetry. Use **Reader** and **Monitoring Reader**; do not grant write
   access or permission to run remediation.
4. Confirm the agent can see the Arc machine and the
   `Arc Disk Free Space Critical` scheduled-query alert.

Continue to [02 Configure incident response](./02-configure-incident-response.md).
