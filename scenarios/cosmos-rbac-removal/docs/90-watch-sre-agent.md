# Module 6: Watch the SRE Agent Work

The CosmosDB role assignment is now a controlled authorization failure. Azure
Monitor fires **HTTP 500 Errors Detected** after the app cannot access CosmosDB;
`/items` returns HTTP 500 while `/health` remains green.

## Watch the investigation

1. Open [sre.azure.com](https://sre.azure.com), select your agent, and open the
   active incident.
2. Confirm the alert is scoped to the workshop AKS cluster and refers to
   `http-500-errors`.
3. Watch the agent correlate the `ContainerLog` failures with requests to
   `/items`.
4. Confirm it distinguishes this authorization failure from workload identity
   federation: the pod has a UAMI token, but CosmosDB rejects the request
   because its data-plane role assignment is missing.
5. Watch it inspect
   `scenarios/cosmos-rbac-removal/infra/bicep/modules/identity.bicep` and
   identify the missing `cosmosRoleAssignment` resource.

The evidence should establish this sequence:

```text
CosmosDB role assignment deleted
  → workload identity acquires a token successfully
  → CosmosDB rejects the data request
  → GET /items returns 500
  → GET /health remains 200
```

## Remediate through the required GitOps flow

Do **not** restore the CosmosDB role assignment directly in Azure during normal
incident response. After the SRE Agent investigates and proposes remediation:

1. A human creates or explicitly approves exactly **one** GitHub issue
   containing the diagnosis, relevant log evidence, and the required
   restoration of `cosmosRoleAssignment` in `identity.bicep`, then assigns it
   to `@copilot` (the Copilot coding agent).
2. Copilot authors the pull request.
3. A human reviews and merges the pull request when it correctly restores the
   role assignment.
4. That human manually runs **Deploy Cosmos RBAC Removal Infrastructure** to apply the
   merged Bicep change when deployment is required.
5. Verify `/health` and `/items`, then confirm the alert resolves.

This preserves the operational contract: no direct Azure mutation for routine
remediation, with a traceable incident → issue → PR → deployment history.

## Constrained manual fallback

Only when the issue-to-Copilot flow cannot be used, an authorized operator may
run the capsule fallback:

```bash
./scenarios/cosmos-rbac-removal/scripts/remediate.sh \
  --resource-group rg-srelabcosmos --workload srelabcosmos
```

```powershell
./scenarios/cosmos-rbac-removal/scripts/remediate.ps1 `
  -ResourceGroup rg-srelabcosmos -Workload srelabcosmos
```

The fallback safely exits without creating another assignment if the matching
CosmosDB role assignment already exists. It does not replace the required
GitOps fix; reconcile the Bicep source through the issue and Copilot PR
afterward.

## Verify recovery

```bash
./scenarios/cosmos-rbac-removal/scripts/validate.sh
```

```powershell
./scenarios/cosmos-rbac-removal/scripts/validate.ps1
```

Continue to [99 Cleanup](./99-cleanup.md) once the incident is resolved.
