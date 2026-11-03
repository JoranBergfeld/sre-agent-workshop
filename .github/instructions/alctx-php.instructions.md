---
applyTo: "scenarios/appservice-latency-context/src/**/*.php"
excludeAgent: "code-review"
---

# PHP order-status coding context

## Navigation

Start from this capsule's PHP HTTP entry point and the approved issue's bounded
evidence. Follow the affected request path and correlate request/stage signals
before selecting a cause. Use the public HTTP tests to verify behavior rather
than asserting a private function's source shape.

## Change boundary

Make the smallest complete PHP repair justified by the observed defect.
Keep telemetry, independent health and unrelated routes/methods intact.
Leave prepared fixtures unchanged and ask before expanding into infrastructure,
lifecycle or deployment. Preserve unrelated learner changes.

## Regression tests

Use the candidate-specific commands in the repository-wide instructions.
Retain a failing check on faulty tracked source, then a passing repaired
candidate and the four existing HTTP tests. Validate status, exact payload,
controlled nonzero timing behavior and independent health with bounded traffic.
Reject a removed-pause candidate. Preserve assertions and report missing
prerequisites or environmental timing uncertainty rather than weakening checks.

## Behavior preservation

Keep the intended 20 ms request-path pause and valid order-status payload.
Reason explicitly about units and boundaries when evidence warrants it,
without choosing a fix from a separate task or prepared revision. Resetting
the runtime or disabling injection is not a code repair.

## Validation report

Report the actual candidate SHA, changed scope, commands executed and outcomes,
including failed/skipped checks and reasons. Connect conclusions to the diff
and observed behavior. Keep the fix PR unmerged and undeployed for human review;
do not claim runtime recovery from local tests.
