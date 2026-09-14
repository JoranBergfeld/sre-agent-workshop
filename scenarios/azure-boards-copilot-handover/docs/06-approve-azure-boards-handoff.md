# Module 6: Approve the Azure Boards handoff

This module contains two independent human gates. Approval to create the Bug
does not authorize Copilot to change code.

## Gate 1: Approve one Bug

Review the SRE Agent's displayed draft against
[`azure-boards-bug.md`](../azure-boards-bug.md). Confirm that it:

- Names Service Bus schema drift rather than invalid or malformed messages.
- Includes the active backlog, zero DLQ, v1 success, schema exception, and
  missing-v2-receipt evidence.
- Restricts code changes to the receipt normalizer and its directly related
  tests.
- Contains no Function key, token, personal information, or real incident
  data.
- Leaves **Assigned To** empty.

Only after the draft matches, approve the single write:

```text
APPROVE CREATE BUG. Create exactly one unassigned Bug in the connected Azure
DevOps project using the displayed title and fields. Do not invoke Copilot,
assign the work item, change its state, add comments, or perform any other
write after creation.
```

Open the created Bug and verify the fields. If the SRE Agent proposes a
materially changed draft or a second work item, do not approve it.

## Gate 2: Start Copilot from Azure Boards

The learner, not the SRE Agent, starts the code modification:

1. In the Bug, select **Create a pull request with GitHub Copilot**.
2. Choose this connected GitHub repository.
3. Choose `main` as the base branch.
4. Keep the work-item content as the task context. Do not broaden the source
   scope in optional instructions.
5. Start Copilot only when ready. This operation cannot be cancelled.

Azure Boards passes the Bug title, large text fields, recent comments, and
work-item link. Copilot creates a linked branch and draft pull request in
GitHub. The SRE Agent remains read-only after Bug creation.

Next: [Review, deploy, and validate recovery](./90-review-deploy-validate.md).
