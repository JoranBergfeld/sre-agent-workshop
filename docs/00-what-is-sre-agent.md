# What is the Azure SRE Agent?

> Shared concept layer. Watched by the docs-freshness workflow.

## In one sentence

Azure SRE Agent is an AI-assisted incident responder that uses Azure telemetry
and repository context to investigate incidents, explain its evidence, and
drive an approved recovery workflow.

## What it is / what it is not

- It is a telemetry-aware assistant for detection, investigation, diagnosis,
  and supervised remediation.
- It is not a replacement for on-call judgment or an agent that silently
  changes Azure resources.

## Where it runs

Configure and interact with the agent in the
[Azure SRE Agent portal](https://sre.azure.com). The agent can use the Azure
resources and GitHub repository connected to it to correlate a signal with
logs, code, issues, pull requests, and deployment state.

## How this repository models it

The generated [scenario catalog](../README.md#choose-a-scenario) is the
canonical learner entry point. Each `scenarios/<id>/` capsule contains its own
guide, infrastructure, lifecycle scripts, investigation assets, and
operational guidance. `platform` identifies the Azure service represented by a
capsule; it is metadata, not a repository hierarchy.

Read a scenario's `knowledge/operational-guidelines.md` before configuring
incident response. For example, see the
[Cloud Agent Handover guidance](../scenarios/cloud-agent-handover/knowledge/operational-guidelines.md).

## Upstream references

- [Azure SRE Agent overview](https://learn.microsoft.com/azure/sre-agent/overview)
- [Connect source code](https://learn.microsoft.com/azure/sre-agent/connect-source-code)
