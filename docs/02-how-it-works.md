# How the Azure SRE Agent works

> Shared concept (track-agnostic). Watched by the docs-freshness workflow.

## The incident loop

<!-- Signal (Azure Monitor alert) → Investigate (telemetry/KQL) → Hypothesize →
     Propose → (autonomy gate) → Remediate (approved GitHub issue / Copilot PR) → Validate. -->

## Autonomy levels

<!-- Read-only / suggest / act-with-approval; how to configure per environment. -->

## The GitHub loop

<!-- Agent creates an approved issue and assigns the track's Copilot coding actor.
     A human reviews and merges the PR; the track's manual or automatic deployment applies it. -->

## Guardrails

- The agent never makes silent direct changes → see the AKS track's [`operational-guidelines.md`](../workshops/aks/knowledge/operational-guidelines.md)
- Per-track approval gates (e.g. VM `invoke-approved-remediation`)
- App Service issue approval and handover → [`operational-guidelines.md`](../workshops/appservice/knowledge/operational-guidelines.md)

## Where each track plugs in

<!-- Point to workshops/<track>/docs/04-configure-incident-response for AKS, VM, and App Service. -->

## Upstream references

<!-- Link learn.microsoft.com pages describing the agent workflow + autonomy. -->
