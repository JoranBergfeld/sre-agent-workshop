# Azure Boards Copilot Handover code quality

The Function application's receipt normalizer is intentionally v1-only: it
processes v1 order events correctly and raises
`UnsupportedReceiptSchemaError` for valid v2 events, producing the Service Bus
schema-drift incident the scenario teaches. Separately, the keyed
`submit-v2-orders`/`status` workshop surface must remain deterministic and
idempotent: failed sends release their claims, failed completion writes leave
the batch pending (and therefore reported as not yet injected) for a later
retry, and completed batches never re-send duplicates. The quality suite pins
both constraints.

## Gates

| Gate | Command | Scope |
| --- | --- | --- |
| Formatting | `ruff format --check .` | Whole `app/` tree |
| Lint | `ruff check .` | Whole `app/` tree |
| Static types | `mypy` | `function_app.py` and every `order_events` module under global `strict = true` |
| Baseline tests | `pytest` | Every test except the `repair`-marked acceptance suite, including the incident-batch claim/retry/idempotency regressions |
| Repair acceptance criteria | `pytest -m repair` | Only the `repair`-marked v2 acceptance suite |
| Branch coverage | `pytest --cov=order_events --cov-report=term-missing` | `order_events`; the repair-scoped normalizer (`order_events/normalizer`) must stay at 100% |

Run all commands from `scenarios/azure-boards-copilot-handover/app` with the
project virtual environment active (`pip install -r requirements-dev.txt`).

## The `repair` marker

`tests/test_repair_v2_normalizer.py` is the acceptance criteria for the
Copilot repair: it asserts that valid v2 order events normalize to the same
`NormalizedReceipt` shape v1 events already produce. Against the
intentionally flawed, v1-only normalizer these tests fail for exactly one
reason — `normalize_receipt` raises `UnsupportedReceiptSchemaError` for a
valid v2 payload — proving the starting state matches the diagnosed incident
instead of some unrelated bug.

`pyproject.toml` excludes the `repair` marker from the default `pytest`
invocation (`addopts` includes `-m "not repair"`), so the baseline gate stays
green. Run the acceptance suite separately:

```bash
pytest -m repair
```

Before this scenario's repair, that command must fail only with
`UnsupportedReceiptSchemaError: schemaVersion 'v2' is not supported`. After a
correct repair, both `pytest` and `pytest -m repair` must pass, and
`order_events/normalizer` must retain 100% branch coverage.

## Normalizer repair scope

The follow-up Copilot normalizer repair is intentionally narrow: it may change
only `order_events/normalizer/**` and its directly related tests
(`tests/test_receipt_normalizer.py` and `tests/test_repair_v2_normalizer.py`,
including removing the `repair` marker from acceptance tests once they pass).
Infrastructure, lifecycle scripts, workflows, and learner documentation are
outside that repair scope. The repair must keep dead-lettering genuinely
invalid payloads through `InvalidReceiptEventError`; it must not weaken that
validation to make v2 events pass.

That narrow restriction applies only to the v2 normalizer repair. Core
Function-app implementation and maintenance work may update their directly
tested files, including the keyed workshop surface in `function_app.py`,
`order_events/workshop.py`, `order_events/adapters/storage.py`, and the
corresponding regression tests.

## Run the tests

```bash
cd scenarios/azure-boards-copilot-handover/app
ruff format --check .
ruff check .
mypy
pytest --cov=order_events --cov-report=term-missing
pytest -m repair
```
