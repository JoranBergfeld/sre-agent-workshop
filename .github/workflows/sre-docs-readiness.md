---
name: SRE Agent Docs Readiness
on:
  schedule:
    - cron: "0 7 * * 4"   # Thursdays 07:00 UTC (offset from docs-freshness on Mondays)
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
  bash: ["git", "grep", "find", "ls", "cat", "test"]
safe-outputs:
  create-pull-request:
    title-prefix: "[docs-readiness] "
    labels: [documentation, automated]
    reviewers: [JoranBergfeld]
    draft: true
    max: 1
---

# SRE Agent Docs Readiness

You keep this repository's **workshop track docs** and the **shared GitHub how-to** ready for
learners. You check two things — internal integrity and upstream accuracy — and you never change
docs silently: you open a single draft PR for human review.

## Scope

**In scope — internal integrity** (read and, if needed, fix):

- `docs/*.md` (the shared layer), **excluding** `docs/superpowers/**`
- `workshops/*/README.md`
- `workshops/*/docs/**.md`
- `workshops/*/scenarios/*/README.md`

**In scope — upstream accuracy** (compare against upstream, fix drift):

- `workshops/*/docs/03-onboard-sre-agent.md`
- `workshops/*/docs/0?-configure-incident-response.md`
- `workshops/*/docs/90-watch*.md`
- `docs/connect-github-to-sre-agent.md`

**Out of scope:**

- **Upstream accuracy** for `docs/00-what-is-sre-agent.md`, `docs/01-why-sre-agent.md`,
  `docs/02-how-it-works.md`, and `workshops/aks/knowledge/operational-guidelines.md` — the
  **SRE Agent Docs Freshness** workflow owns that. You may still check these files for **internal
  integrity** (links, placeholders), but do not re-verify their product claims against upstream.
- **Do not touch at all** — generated artifacts (`workshops/*/scenarios/INDEX.md`,
  `workshops/*/infra/bicep/modules/scenario-alerts.bicep`, and the README
  `<!-- BEGIN SCENARIOS -->`…`<!-- END SCENARIOS -->` tables; the scenario tooling and the
  `validate-scenarios.yml` workflow own those) and anything under `docs/superpowers/**`.

## Checks

### 1. Internal integrity

For the in-scope integrity files:

1. **Links resolve.** Every relative Markdown link `](...)` points to a file that exists; if the
   link includes a `#anchor`, a matching heading exists in the target file.
2. **Track module lists match files.** Each `workshops/<track>/README.md` module list links to every
   `*.md` in `workshops/<track>/docs/` and links to no file that is missing.
3. **Shared-doc links resolve.** Every per-track link to `docs/connect-github-to-sre-agent.md`
   (including its `#anchors`) is valid.
4. **No leftover placeholders.** Flag `TODO`, `TBD`, `FIXME`, or obvious placeholder text.
5. **No stale section references.** Flag references to renamed or removed UI/sections — for example
   a lingering "Enable the GitHub Tool" or "Capabilities → Tools" instruction.

### 2. Upstream accuracy

Fetch the current Azure SRE Agent documentation under `learn.microsoft.com` (the GitHub connector,
connect-source-code, incident-response/autonomy, and overview pages) and `sre.azure.com/docs`. For
each in-scope upstream file, compare its product claims (portal navigation, connector/tool names,
setup steps) against the upstream sources. If something is outdated, renamed, or removed upstream,
make the **minimal** edits needed to correct the affected file(s).

## Output

1. If you made any edits, open **one** draft PR. Group the description under **Internal integrity**
   and **Upstream accuracy** headings, list each file changed and why, and cite source URLs for the
   upstream changes.
2. If everything is already consistent and current, do nothing (no PR).
