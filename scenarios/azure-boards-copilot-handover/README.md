# Scenario: Azure Boards Copilot Handover

> Platform: `Azure Functions + Service Bus` · Scenario id: `azure-boards-copilot-handover`

## Overview

This capsule teaches an end-to-end, approval-gated recovery through Azure SRE
Agent, Azure Boards, and GitHub Copilot cloud agent. The starting Python
Function normalizes v1 order events into Table Storage receipts but does not
understand valid v2 events. The v2 events remain recoverable in Service Bus,
creating an active backlog without entering the dead-letter queue.

The SRE Agent investigates the schema drift and, after learner approval,
creates one unassigned Azure Boards Bug. The learner separately starts Copilot
from that work item, reviews and merges the linked draft pull request, deploys
the reviewed revision, and proves recovery through both deterministic
validation and read-only SRE Agent confirmation.

## Cost profile

The cost profile is **low** and is a qualitative cost estimate. The dominant cost drivers
are the Linux Functions Consumption executions, Service Bus Basic operations,
Storage transactions, and Log Analytics/Application Insights ingestion and
retention. Confirm current pricing for the deployment region before
provisioning, and run cleanup immediately after completing the scenario.

## Follow the workshop modules

Run every command from the repository root.

1. [00 Prerequisites and integration checks](./docs/00-prerequisites.md)
2. [01 Deploy the starting application](./docs/01-deploy-starting-application.md)
3. [02 Verify the healthy v1 path](./docs/02-verify-starting-state.md)
4. [03 Onboard the SRE Agent](./docs/03-onboard-sre-agent.md)
5. [04 Configure incident response](./docs/04-configure-incident-response.md)
6. [05 Trigger and investigate schema drift](./docs/05-trigger-and-investigate.md)
7. [06 Approve the Azure Boards handoff](./docs/06-approve-azure-boards-handoff.md)
8. [90 Review, deploy, and validate recovery](./docs/90-review-deploy-validate.md)
9. [99 Close and clean up](./docs/99-cleanup.md)

This scenario has no simulated, local, or GitHub-issue fallback. It requires
the real Azure Boards GitHub integration and paid Copilot access because those
surfaces are the primary learning outcome.
