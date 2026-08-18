# Module 99: Close and clean up

Cleanup separates participant-created artifacts from facilitator-managed
integration.

## Close the recovery artifacts

Only after deterministic validation and read-only SRE Agent confirmation:

1. Return to the Azure Boards Bug and verify the linked pull request is merged.
2. Confirm the Bug state reflects the project process; close it manually if
   merge automation did not.
3. Close the Azure SRE Agent incident.
4. Delete the Copilot-created GitHub branch if repository policy did not
   remove it automatically.

If the pull request was discarded rather than merged, close the Bug with an
accurate explanation and delete the generated branch.

## Remove participant Azure resources

Use one cleanup path. The script deletes only the scenario resource group.

**Bash**

```bash
./scenarios/azure-boards-copilot-handover/scripts/cleanup.sh
```

**PowerShell 7**

```powershell
./scenarios/azure-boards-copilot-handover/scripts/cleanup.ps1
```

Delete the learner-created SRE Agent resource separately after confirming you
no longer need its investigation history.

## Preserve shared integration

Do not:

- Remove the Azure Boards GitHub App installation.
- Disconnect the Azure DevOps project from the GitHub repository.
- Delete facilitator-owned Azure DevOps projects or organizations.
- Revoke organization-level Copilot policy.

Those shared prerequisites belong to the facilitator and support later
learners.
