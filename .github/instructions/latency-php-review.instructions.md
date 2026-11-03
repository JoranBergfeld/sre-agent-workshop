---
applyTo: "scenarios/appservice-latency-context/security/pr/order-status.php"
excludeAgent: "cloud-agent"
---

# Inert PHP lookup review

- Follow the supplied order ID into the PDO operation. Determine whether
  ordinary, apostrophe-bearing and SQL-shaped IDs retain exact lookup
  semantics, and explain any code/data boundary violation in the changed
  lines without executing SQL against a real database.
- Preserve the nullable string result: an existing synthetic ID returns its
  status; an absent ID or non-string result returns null. A fix must retain
  lookup behavior rather than remove the operation or hard-code a result.
- Evaluate meaningful regression evidence for ordinary, missing, quoted and
  SQL-shaped IDs. The connection-free verifier checks a narrow PDO boundary;
  passing it does not prove real-driver behavior, live scan detection or
  general security. Report validation actually observed and remaining gaps.
- Preserve inertness: no application route, connection, credentials or
  deployment configuration. Treat review suggestions as proposals, not
  applied repairs or verified named Copilot Autofix.
