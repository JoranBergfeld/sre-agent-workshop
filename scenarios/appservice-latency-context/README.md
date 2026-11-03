# App Service Latency Context

Investigate a synthetic PHP order-status service on Linux App Service. Observe
a baseline incident-to-fix-PR pass before customizing SRE instructions, skills,
tools, knowledge and coding handover. Practice built-in PR review and security
separately, then repeat and compare evidence and native consumption.

**Advanced, self-guided; no assessment or promised savings.** Catalog duration
is planning metadata, not a workshop timetable. Context/comparison pages are
schema-optional but are required parts of this supported learning route:
baseline → SRE/handover/coding customization → separate review/security →
second incident/fix PR and native comparison → cleanup. Only local reproduction
and post-comparison deployed recovery are optional. Missing live capabilities
have labelled continuation/resume routes; references never count as observations.

## Journey

1. [Prerequisites, permissions and costs](docs/00-prerequisites.md)
2. [Optional local reproduction](docs/local-reproduction.md)
3. [Deploy and inspect the environment](docs/01-deploy-infrastructure.md)
4. [Onboard SRE Agent](docs/02-onboard-sre-agent.md)
5. [Configure the incident boundary](docs/03-configure-incident-response.md)
6. [Baseline investigation through a fix PR](docs/04-baseline.md)
7. [Author SRE investigation context](docs/05-sre-context.md)
8. [Author handover and coding context](docs/06-handover-context.md)
9. [Isolated built-in review and security practice](docs/07-review-security.md)
10. [Repeat and compare](docs/08-repeat-compare.md)
11. [Preserve evidence and clean up](docs/99-cleanup.md)

## Operational boundaries

- Synthetic data only. One injection deploys a prepared revision; no load race.
- The affected route remains valid; `/health` is independently healthy.
- SRE Agent investigates; **approval precedes one unassigned issue**. The learner
  reviews and assigns the coding agent. Neither agent merges or deploys.
- Keep both incident fix PRs unmerged during comparison. A tested fix is not
  demonstrated runtime recovery. Reset is not code repair.
- Review/security fixtures are inert, separate, unmerged and never deployed.
  Packaging includes only three named runtime PHP files, the Nginx config and
  generated deployment metadata; context assets and fixture files are excluded.
- App Service compute, telemetry retention/ingestion, SRE Agent and GitHub agent
  usage can incur charges. Stop unused runs and clean up promptly.
- Lifecycle tests use controlled external commands, **not live Azure proof**.
  Connected provisioning, telemetry ingestion and product behavior require an
  eligible learner-owned environment.

See the non-spoiling [operations reference](knowledge/operations.md). All lifecycle commands run
from the repository root; state/evidence stay in this capsule's ignored
`.azure/` directory. Do not lose or share the ownership state.

Setup uses an **operator-created, designated resource group**; tooling never
creates one. The workload prefers West Europe, then eligible PHP 8.3/Linux
App Service B1 alternatives in Sweden Central, East US 2 and Australia East.
SRE Agent placement remains separate. Setup, injection, reset and ordinary
deploy use verified healthy/faulty artifacts for the exact checkout commit
and origin repository. Missing builds fail closed, before provider registration
or deployment. See [deployment](docs/01-deploy-infrastructure.md) for build
dispatch, explicit `--local-build`, and the reviewed-source recovery path.

## Contributor checks

```bash
node --test scenarios/appservice-latency-context/tests/*.test.mjs
az bicep build --file scenarios/appservice-latency-context/infra/bicep/main.bicep --stdout >/dev/null
npm --prefix scripts/scenario-tools test
scripts/validate-scenarios.sh --write
scripts/validate-scenarios.sh
```

Set `PHP_BIN` to your own PHP executable if `php` is not on `PATH`.
The controlled HTTP tests need Linux/macOS/WSL PHP workers; Codespaces supports
both lifecycle shells. PowerShell 7, Azure CLI, Node 22+, curl, OpenSSL, Git and `unzip`
(archive verification in tests) are required.

## Cost profile

**Medium** is a qualitative cost estimate, not a quoted price. The
dominant cost drivers are always-on App Service compute, telemetry ingestion/retention,
SRE/model usage, GitHub AI credits and Codespaces. Review your current pricing
and usage surfaces, preserve evidence and delete unused owned resources.
