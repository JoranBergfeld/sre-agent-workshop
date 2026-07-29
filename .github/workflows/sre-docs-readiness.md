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

You keep this repository's **top-level scenario docs** and the **shared GitHub how-to** ready for
learners. You check two things — internal integrity and upstream
accuracy — and you never change docs silently: you open a single draft PR for human review.

## Scope

**In scope — internal integrity** (read and, if needed, fix):

- `docs/*.md` (the shared layer), **excluding** `docs/superpowers/**`
- `scenarios/cloud-agent-handover/README.md`
- `scenarios/cloud-agent-handover/docs/**.md`
- `scenarios/cloud-agent-handover/knowledge/**.md`
- `scenarios/*/README.md`
- `scenarios/*/docs/**.md`
- `scenarios/*/knowledge/**.md`

**In scope — upstream accuracy** (compare against upstream, fix drift):

- `scenarios/cloud-agent-handover/README.md`
- `scenarios/cloud-agent-handover/docs/**.md`
- `scenarios/cloud-agent-handover/knowledge/**.md`
- `docs/connect-github-to-sre-agent.md`

**Out of scope:**

- **Upstream accuracy** for `docs/00-what-is-sre-agent.md`, `docs/01-why-sre-agent.md`,
  `docs/02-how-it-works.md` — the **SRE Agent Docs Freshness** workflow owns that. You may still
  check these files for **internal
  integrity** (links, placeholders), but do not re-verify their product claims against upstream.
- **Do not touch at all** — the generated root README
  `<!-- BEGIN SCENARIO CATALOG -->`…`<!-- END SCENARIO CATALOG -->` block; the scenario tooling and
  the `validate-scenarios.yml` workflow own it — and anything under `docs/superpowers/**`.

## Checks

### 1. Internal integrity

For the in-scope integrity files:

1. **Links resolve.** Every relative Markdown link `](...)` points to a file that exists; if the
   link includes a `#anchor`, a matching heading exists in the target file.
2. **Shared-doc links resolve.** Every scenario link to `docs/connect-github-to-sre-agent.md`
   (including its `#anchors`) is valid.
3. **No leftover placeholders.** Flag `TODO`, `TBD`, `FIXME`, or obvious placeholder text.
4. **No stale section references.** Flag references to renamed or removed UI/sections — for example
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
