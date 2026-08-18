# Module 1: Deploy the starting application

Setup provisions the scenario-owned Azure resources, deploys the intentionally
v1-only Function application from the current checkout, configures alerts, and
submits three deterministic v1 control events.

## Deploy

Use one shell path.

**Bash**

```bash
./scenarios/azure-boards-copilot-handover/scripts/setup.sh
```

**PowerShell 7**

```powershell
./scenarios/azure-boards-copilot-handover/scripts/setup.ps1
```

To use a different subscription, region, or workload name, inspect the paired
help first:

```bash
./scenarios/azure-boards-copilot-handover/scripts/setup.sh --help
```

```powershell
./scenarios/azure-boards-copilot-handover/scripts/setup.ps1 -Help
```

Keep the printed resource group, Function app, status URL, and submit-v2 URL.
The URLs contain a placeholder rather than the Function key. Retrieve the key
only when needed; do not save it in documentation, source control, or an Azure
Boards work item.

## Confirm the deployed resources

The resource group contains:

- A Linux Python Function app on a Consumption plan.
- A Service Bus namespace and `order-events` queue.
- Table Storage for normalized receipts and scenario state.
- Application Insights and Log Analytics.
- An active-message backlog alert and a separate dead-letter safety alert.

The Function managed identity has the data-plane access needed for Service Bus
and the two scenario tables. The deployment shares no runtime resources with
another workshop capsule.

Next: [Verify the healthy v1 path](./02-verify-starting-state.md).
