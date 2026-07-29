---
name: SRE Agent Docs Freshness
on:
  schedule:
    - cron: "0 7 * * 1"   # Mondays 07:00 UTC
  workflow_dispatch:
engine: copilot
permissions:
  contents: read
network:
  allowed:
    - defaults
    - learn.microsoft.com
    - "*.azure.com"
tools:
  web-fetch:
  bash: ["git"]
safe-outputs:
  create-pull-request:
    title-prefix: "[docs-freshness] "
    labels: [documentation, automated]
    draft: true
---

# SRE Agent Docs Freshness

You keep this repository's **shared concept layer** aligned with upstream Azure SRE Agent
documentation. You never change docs silently — you open a single draft PR for human review.

## Scope (read these, and only edit these)

- `docs/00-what-is-sre-agent.md`
- `docs/01-why-sre-agent.md`
- `docs/02-how-it-works.md`

Do **not** touch scenario walkthroughs — those describe this repo's own
code, not upstream behavior.

> **Boundary:** The **SRE Agent Docs Readiness** workflow owns internal integrity for all docs and
> upstream accuracy for the track setup docs and `docs/connect-github-to-sre-agent.md`. Do not add
> those files to this workflow's scope.

## Upstream sources

Fetch the current Azure SRE Agent documentation under `learn.microsoft.com` (the SRE Agent
overview, how-it-works, and autonomy/configuration pages).

## Task

1. For each in-scope file, compare its claims against the upstream sources.
2. If something is outdated, renamed, or removed upstream — or a notable new capability now
   exists — make the **minimal** edits needed to correct the affected file(s).
3. Open **one** draft PR summarizing what changed upstream, with cited source URLs.
4. If everything is already current, do nothing (no PR).
