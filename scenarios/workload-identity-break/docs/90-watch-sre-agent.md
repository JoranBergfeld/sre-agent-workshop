# Module 6: Watch the SRE Agent Work

The missing federated identity credential is now a controlled authentication
failure. Azure Monitor fires **Workload Identity Auth Errors** after the app
logs `AADSTS70021` / `No matching federated identity`; `/items` returns HTTP
500 while `/health` remains green.

## Watch the investigation

1. Open [sre.azure.com](https://sre.azure.com), select your agent, and open the
   active incident.
2. Confirm the alert is scoped to the workshop AKS cluster and refers to
   `workload-identity-auth-errors`.
3. Watch the agent correlate the alert with `ContainerLog` entries showing
   failed Azure AD token acquisition.
4. Confirm it distinguishes this authentication failure from CosmosDB RBAC:
   the pod cannot exchange its ServiceAccount token for a UAMI token, so
   CosmosDB authorization is never reached.
5. Watch it inspect
   `scenarios/workload-identity-break/infra/bicep/modules/identity.bicep` and
   identify the missing `federatedCredential` resource.

The evidence should establish this sequence:

```text
federated credential deleted
  → projected ServiceAccount token cannot be exchanged
  → AADSTS70021 / no matching federated identity
  → GET /items returns 500
  → GET /health remains 200
```

## Remediate through the required GitOps flow

Do **not** recreate the federated credential directly in Azure during normal
incident response. After the SRE Agent investigates and proposes remediation:

1. A human creates or explicitly approves exactly **one** GitHub issue
   containing the diagnosis, relevant log evidence, and the required
   restoration of `federatedCredential` in `identity.bicep`, then assigns it
   to `@copilot` (the Copilot coding agent).
2. Copilot authors the pull request.
3. A human reviews and merges the pull request when it correctly restores the
   credential.
4. That human manually runs **Deploy Workload Identity Break Infrastructure** to apply the
   merged Bicep change when deployment is required.
5. Verify `/health` and `/items`, then confirm the alert resolves.

This preserves the operational contract: no direct Azure mutation for routine
remediation, with a traceable incident → issue → PR → deployment history.

## Constrained manual fallback

Only when the issue-to-Copilot flow cannot be used, an authorized operator may
run the capsule fallback:

```bash
./scenarios/workload-identity-break/scripts/remediate.sh \
  --resource-group rg-srelabidentity --workload srelabidentity
```

```powershell
./scenarios/workload-identity-break/scripts/remediate.ps1 `
  -ResourceGroup rg-srelabidentity -Workload srelabidentity
```

The fallback recreates the federated credential and restarts the workload. It
does not replace the required GitOps fix; reconcile the Bicep source through
the issue and Copilot PR afterward.

## Verify recovery

```bash
./scenarios/workload-identity-break/scripts/validate.sh
```

```powershell
./scenarios/workload-identity-break/scripts/validate.ps1
```

Continue to [99 Cleanup](./99-cleanup.md) once the incident is resolved.
