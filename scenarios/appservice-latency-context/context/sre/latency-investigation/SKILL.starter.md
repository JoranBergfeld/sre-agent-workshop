---
name: latency-investigation
description: Investigate elevated application latency with valid responses; compare the affected route with independent health evidence.
tools: []
---

# Learner draft — install only after the baseline

Complete TODOs in the product's SKILL.md editor. Attach the actual saved tool
through Choose tools; the empty list here grants nothing. This filename keeps
the unfinished draft out of automatic local skill discovery.

## Procedure

1. Establish scope. Record the learner's workspace GUID, application name,
   Insights resource ID and completed UTC window. Limit each query to 15 minutes
   within the last 24 hours, with at most 10 request and 10 stage samples.
   TODO — choose a smaller starting window/sample limit and a finite call budget.
   Continue only when the resource identifiers match the capsule setup outputs.
2. Compare signals. Use the attached read-only tool for the affected and healthy
   routes. TODO — choose which latency/error summaries and samples are necessary.
   Continue only with observed data or an explicitly named access/ingestion gap.
3. Test hypotheses. TODO — write a discriminating check and counter-evidence rule.
   Link request and stage evidence by operation ID; compare deployment timing
   from a separately identified source. Temporal proximity alone is not cause.
4. Consult facts. Retrieve the selected architecture/operations reference when
   interpreting request paths or telemetry fields. TODO — name the selected
   reference and a question that needs it. Cite what was actually retrieved;
   disclose when retrieval is not visible.
5. Stop. TODO — define sufficient evidence and the missing-evidence stopping
   condition within the chosen budget. Report facts, hypotheses, scope, sources
   and remaining gaps. A summary or small sample alone need not establish cause.

## Boundaries

This procedure investigates and proposes an approved issue handover. The learner
owns issue approval/assignment and all code merge/deployment decisions. Tool
failure is a gap to explain, not a reason to expand resource scope or retry
indefinitely.
