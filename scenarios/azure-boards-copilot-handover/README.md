# Scenario: Azure Boards Copilot Handover

> Platform: `Azure Functions + Service Bus` · Scenario id: `azure-boards-copilot-handover`

## Overview

This capsule provides the Azure foundation for a Service Bus schema drift
incident. A Linux Python Function will eventually normalize supported order
events into receipts. Valid but unsupported v2 order events remain active in
the queue and create the primary backlog signal. Invalid order events are a
separate domain concept and are not treated as synonyms for unsupported events.

This capsule's Function application and `setup`/`deploy`/`inject`/`validate`/
`cleanup` lifecycle scripts are implemented. Investigation assets, the Azure
Boards learner journey, and connected (live-Azure) validation are delivered
separately.

## Cost profile

The cost profile is **low** and is a qualitative cost estimate. The dominant cost drivers
are the Linux Functions Consumption executions, Service Bus Basic operations,
Storage transactions, and Log Analytics/Application Insights ingestion and
retention. Confirm current pricing for the deployment region before
provisioning, and run cleanup immediately after completing the scenario.

## Flow

`scripts/setup.sh`/`.ps1` provision infrastructure, deploy the starting
application, and seed deterministic v1 control events. `scripts/deploy.sh`/
`.ps1` ship the current checkout. `scripts/inject.sh`/`.ps1` submits the v2
incident batch. `scripts/validate.sh`/`.ps1` proves recovery. `scripts/
cleanup.sh`/`.ps1` deletes only the scenario resource group. The
infrastructure entry point is `infra/bicep/main.bicep`.

## Notes

The deployment owns a resource group, Function host storage, two dedicated
tables, one Service Bus namespace and queue, monitoring resources, and both the
active-backlog and dead-letter safety alerts. It shares no runtime resources
with `cloud-agent-handover`.
