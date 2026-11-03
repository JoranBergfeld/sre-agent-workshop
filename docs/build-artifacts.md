# Exact-commit build artifacts

Scenarios that deploy application code build that code in GitHub Actions in
**your own repository**. Setup then downloads the artifact that was built from
the exact commit you have checked out. Attendees don't need the .NET SDK,
Python packaging tools or Docker installed locally.

| Scenario | Build workflow | Artifact |
| --- | --- | --- |
| Cloud Agent Handover | **Validate Cloud Agent Handover Application** (`validate-appservice-app.yml`) | .NET 10 Release publish ZIP, tested |
| Azure Boards Copilot Handover | **Validate Azure Boards Copilot Handover Application** (`validate-azure-boards-copilot-handover-app.yml`) | Linux Python 3.12 Functions ZIP, tested |
| App Service Latency Context | **Build App Service Latency Context Artifacts** (`build-appservice-latency-context.yml`) | Healthy and faulty PHP fixtures, plus the reviewed source from `main` |
| Cosmos RBAC Removal | **Publish Cosmos RBAC Removal Image** (`publish-cosmos-rbac-removal-image.yml`) | Container image in GHCR, tagged with the commit SHA |
| Workload Identity Break | **Publish Workload Identity Break Image** (`publish-workload-identity-break-image.yml`) | Container image in GHCR, tagged with the commit SHA |

The VM scenarios deploy no application package, so they have no build
workflow.

## How the build workflows run

- Each workflow covers one scenario. It triggers on:
  - that scenario's application sources;
  - its packaging scripts;
  - the shared `scripts/build-artifacts/**`;
  - the scenario's `infra/placement.json` and the shared
    `scripts/placement/**`.
- You can run any of them manually with `workflow_dispatch` against an exact
  branch or tag.
- They need no Azure credentials.
- Pull requests from forks are built and tested, but they never publish
  trusted artifacts or images.
- Before an image gets the `latest` tag or its build metadata is uploaded, the
  publish workflows start the built image and check `/health` against its
  immutable digest.

## How setup consumes artifacts

`scripts/build-artifacts/resolve.mjs` accepts an artifact only when all of the
following hold:

- it comes from the repository that your `origin` remote points to;
- it was built from that exact commit, for the expected scenario and variant;
- the run that built it succeeded;
- every file matches the recorded SHA-256 checksum.

Setup also refuses to use an artifact when the deployable source has
uncommitted changes. Commit and push them, or use the local-build mode.

If no matching build exists, the error message prints the exact command to
start one. For example:

```bash
gh workflow run validate-appservice-app.yml --repo <owner>/<repo> --ref <branch>
```

A detached HEAD needs a branch or tag that points at the commit, because
`--ref` cannot be a raw SHA. An artifact built from any other commit is never
used.

## Building locally instead

| Scenario | Local alternative | Local tools needed |
| --- | --- | --- |
| Cloud Agent Handover | `setup.sh --local-build` / `setup.ps1 -LocalBuild` | .NET 10 SDK, `zip` |
| Azure Boards Copilot Handover | `deploy.sh --build-mode source` / `deploy.ps1 --build-mode source` | Python 3.12 test gates; Oryx remote build |

## AKS application images

The **Deploy … Application** workflows take an `imageTag` input: the full
40-character commit SHA. Each workflow:

1. checks out that commit;
2. resolves the image's verified `sha256` digest from the publish run's
   metadata;
3. confirms the digest with `docker manifest inspect`;
4. deploys `ghcr.io/<owner>/<repo>/<scenario>/app@sha256:<digest>`.

The workflows need the `actions: read` permission. The GHCR package stays
private: keep the `GHCR_READ_TOKEN` pull-secret setup that the scenario guide
describes, and do not make the package public.

## Human-reviewed fixes

The Copilot handover scenarios keep their review flow. A human reviews and
merges Copilot's pull request. The merge commit on `main` then gets its own
build, and that is the artifact that is deployed.
