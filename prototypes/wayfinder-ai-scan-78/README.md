# Wayfinder prototype: AI Scan fixture

**Throwaway, non-deployable prototype for issue 78.** It answers whether the
context/token comparison can stay cleanly separate from the PHP security
exercise.

The comparison has two runs against the same injected timing regression:

1. A baseline Azure SRE Agent investigation hands its trace and issue to
   GitHub Copilot coding agent and ends in a reviewable PR.
2. The learner adds context, repeats the same incident and workload, then
   captures a second trace and PR.

Record each product's observed usage against its own run. This prototype
contains no modeled token values. The demo at `prototype.html` illustrates the
sequence only; it does not simulate or claim actual product results.

The security exercise is separate so it cannot contaminate the comparison.
`order-status.php` is an intentionally unsafe, inert SQL lookup fixture: it
has no route, database, credentials, or deployment configuration. Never
deploy it. A disposable PR containing this changed PHP file is the AI Scan
target; scan before applying any fix. The expected safe behavior is an exact
order-status lookup with the supplied order ID bound as a parameter. Review
any AI Scan finding and any named Copilot Autofix suggestion separately;
neither is guaranteed. If either is absent, live feasibility remains
unproven.

AI Scan is triggered by eligible PR changes, not by the Azure incident
injection. It supports PHP and does not require CodeQL default setup, but
requires code scanning and the repository's AI Scan-for-PRs setting.

- [AI Scan for pull requests](https://docs.github.com/en/code-security/concepts/code-scanning/ai-powered-security-detections)
- [Copilot Autofix for code scanning](https://docs.github.com/en/code-security/concepts/code-scanning/autofix-for-code-scanning)
