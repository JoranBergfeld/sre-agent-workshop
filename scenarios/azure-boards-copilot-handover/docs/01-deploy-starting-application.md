# Module 1: Deploy the starting application

Setup provisions the scenario-owned Azure resources, deploys the intentionally
v1-only Function application from the current checkout, configures alerts, and
submits three deterministic v1 control events.

Application deployment defaults to the successful, trusted Actions artifact for
the exact local `HEAD` in your repository. It requires a clean application
checkout, Node.js 20+, `gh`, Azure CLI, `curl`, and `jq`, but not a local Python
toolchain. The build workflow preserves the intentionally unsupported v2
starting state and its expected-red repair suite.

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

## Private package deployment

The storage module creates a nonpublic `application-packages` blob container;
the Function's system-assigned identity has **Storage Blob Data Reader** only
on that container. Your signed-in deployment identity needs **Storage Blob
Data Contributor** there to upload packages with `--auth-mode login`. An
authorized administrator can assign that role at:

```text
/subscriptions/<subscription>/resourceGroups/<resource-group>/providers/Microsoft.Storage/storageAccounts/<storage-account>/blobServices/default/containers/application-packages
```

The deploy helper uploads `<source-SHA>/<package-SHA256>.zip` without overwrite,
or verifies byte-identical contents before reusing an existing blob. It configures
a private HTTPS `WEBSITE_RUN_FROM_PACKAGE` URL plus
`WEBSITE_RUN_FROM_PACKAGE_BLOB_MI_RESOURCE_ID=SystemAssigned`, disables both
remote-build switches, restarts the Function, and explicitly synchronizes
triggers with bounded retries. There is no SAS in the URL. This is the external
package route required for prebuilt Python ZIPs on Linux Consumption Y1, not a
`config-zip` deployment with Oryx disabled.

If upgrading existing infrastructure, provision the updated modules before
deploying. The infrastructure settings resource merges existing settings after
the site exists, retaining the package URL, identity selector, source stamp,
and cutover time on reruns. It never outputs the merged settings or host keys.
First-creation and redeployment behavior is covered by compiled-template
contracts; an actual Azure deployment remains an operator verification step.

To redeploy the app directly, or explicitly choose a source build:

```bash
./scenarios/azure-boards-copilot-handover/scripts/deploy.sh
./scenarios/azure-boards-copilot-handover/scripts/deploy.sh --build-mode source
```

```powershell
./scenarios/azure-boards-copilot-handover/scripts/deploy.ps1
./scenarios/azure-boards-copilot-handover/scripts/deploy.ps1 --build-mode source
```

Source mode removes the external-package and blob-identity settings before
enabling both Oryx build switches and using `config-zip --build-remote true`.
Returning to artifact mode replaces those settings and disables both build
switches. Both routes require the running worker's embedded package SHA to
match `HEAD` before stamping the cutover timestamp.

Next: [Verify the healthy v1 path](./02-verify-starting-state.md).
