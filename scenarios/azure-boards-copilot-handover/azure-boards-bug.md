# Azure Boards Bug draft

## Title

Support v2 order events in the receipt normalizer

## Description

The Azure Functions order consumer supports v1 order events but does not
support valid v2 events. The v2 batch remains recoverable in the Service Bus
active backlog because the receipt normalizer raises
`UnsupportedReceiptSchemaError`.

Implement backward-compatible v2 normalization in the existing receipt
normalizer. Do not change infrastructure, Service Bus or Storage adapters,
lifecycle scripts, workflows, deployment behavior, or learner documentation.

## Evidence

- `ActiveMessages` remains elevated after the fixed 20-event v2 batch.
- `DeadletteredMessages` remains zero.
- Application Insights records `UnsupportedReceiptSchemaError` for v2 events.
- The three v1 controls continue producing `Normalized receipt persisted`
  telemetry and Table Storage rows.
- `NormalizedReceipts` contains no v2 rows before the repair.

## Permitted source scope

- `scenarios/azure-boards-copilot-handover/app/order_events/normalizer/**`
- `scenarios/azure-boards-copilot-handover/app/tests/test_receipt_normalizer.py`
- `scenarios/azure-boards-copilot-handover/app/tests/test_repair_v2_normalizer.py`

## Acceptance criteria

- Existing valid v1 events still normalize to the current receipt model.
- Valid v2 events map `id` to the order id, `customer.id` to the customer id,
  and `amount.value` / `amount.currency` to the existing amount and currency
  fields.
- Both versions persist the correct `sourceSchemaVersion`.
- Genuinely invalid payloads still raise `InvalidReceiptEventError`; validation
  is not weakened to accept malformed events.
- Baseline tests and the v2 repair acceptance tests pass.
- The repair-scoped normalizer retains 100% branch coverage.
- The pull request changes only the permitted source scope and remains linked
  to this Azure Boards Bug.
