# Module 90: Review, deploy, and validate recovery

Copilot produces the repair, but the learner retains merge, deployment,
validation, and closure authority.

## Review the linked draft pull request

In Azure Boards, watch the Development section move through the Copilot status
and open the linked GitHub draft pull request.

Confirm that the change is limited to:

- `scenarios/azure-boards-copilot-handover/app/order_events/normalizer/**`
- `scenarios/azure-boards-copilot-handover/app/tests/test_receipt_normalizer.py`
- `scenarios/azure-boards-copilot-handover/app/tests/test_repair_v2_normalizer.py`

Reject changes to infrastructure, adapters, lifecycle scripts, workflows,
learner documentation, or unrelated application code.

The repair must:

- Preserve v1 normalization.
- Normalize valid v2 `id`, `customer.id`, `amount.value`, and
  `amount.currency` fields into the existing receipt model.
- Continue rejecting genuinely invalid events.
- Make both baseline and repair acceptance tests pass without weakening
  assertions.
- Keep the repair-scoped normalizer at 100% branch coverage.

Confirm the pull request contains Azure Boards traceability, including the
linked work item or its `AB#<id>` reference. Review the diff and required
checks.

Before merging, check out the pull-request branch and run every repair gate:

```bash
cd scenarios/azure-boards-copilot-handover/app
source .venv/bin/activate
ruff format --check .
ruff check .
mypy
pytest
pytest -m repair
pytest --cov=order_events --cov-report=term-missing
cd ../../..
```

```powershell
Set-Location scenarios/azure-boards-copilot-handover/app
& ./.venv/bin/Activate.ps1
ruff format --check .
ruff check .
mypy
pytest
pytest -m repair
pytest --cov=order_events --cov-report=term-missing
Set-Location ../../..
```

The coverage report must show 100% branch coverage for
`order_events/normalizer`. Merge explicitly only after the pull request is
ready for review and all checks pass. Merge does not deploy the Function.

## Deploy the reviewed revision

Protect any unrelated local work before changing branches. Then update the
local default branch:

```bash
git switch main
git pull --ff-only
```

Deploy exactly that checkout.

**Bash**

```bash
./scenarios/azure-boards-copilot-handover/scripts/deploy.sh
```

**PowerShell 7**

```powershell
./scenarios/azure-boards-copilot-handover/scripts/deploy.ps1
```

The helper reruns the baseline application gates, publishes the current
checkout, and stamps its Git commit SHA and deployment cutover time. The
repair acceptance and coverage gates were required separately before merge.
The helper does not fetch or change branches.

## Deterministic recovery validation

Run one validator path:

**Bash**

```bash
./scenarios/azure-boards-copilot-handover/scripts/validate.sh
```

**PowerShell 7**

```powershell
./scenarios/azure-boards-copilot-handover/scripts/validate.ps1
```

Success requires:

- The deployed commit SHA equals local `HEAD`.
- Exactly 23 receipts exist: 3 v1 and 20 v2.
- Service Bus has zero active and zero dead-lettered messages.
- No `UnsupportedReceiptSchemaError` occurred after the deployment cutover.

## Read-only SRE Agent confirmation

After the validator succeeds, ask:

```text
Perform a read-only recovery confirmation for the Azure Boards Copilot
Handover incident. Do not modify Azure resources or code, deploy anything, or
create or update a work item. Confirm that ActiveMessages returned to zero,
DeadletteredMessages stayed at zero, UnsupportedReceiptSchemaError exceptions
stopped after the deployment cutover, and v2 receipt telemetry is present.
```

Do not close the Bug or incident unless both validation paths succeed.

Next: [Close and clean up](./99-cleanup.md).
