# Azure SRE Agent Workshop 🔧

**The fastest path is a minimal App Service handover: trigger a known application
failure, watch Azure SRE Agent diagnose it, then approve a GitHub issue for the
Copilot coding agent to fix.**

The repository remains a multi-track workshop for learning incident response on
Azure App Service, AKS, and VM-based enterprise workloads. Each track provisions
real infrastructure, injects reproducible faults, and demonstrates a controlled
path from investigation to remediation.

---

## 🚀 Start here: App Service quickstart

1. Select [**Use this template**](https://github.com/JoranBergfeld/sre-agent-workshop/generate).
2. Create a repository you control, then clone it:

   ```bash
   git clone https://github.com/<owner>/<repository>.git
   cd <repository>
   ```

3. Run the App Service setup with Bash or PowerShell:

   ```bash
   workshops/appservice/scripts/setup.sh
   ```

   ```powershell
   ./workshops/appservice/scripts/setup.ps1
   ```

4. Follow the [App Service: SRE Agent to Copilot Handover](workshops/appservice/README.md).

The App Service prerequisites include Azure and GitHub access, authenticated
`az` and `gh` CLIs, .NET 10, and permission to create role assignments. The
track guide covers these requirements and cleanup.

## Shared concepts

These track-agnostic guides explain the service and incident-response model:

1. [What is the SRE Agent?](docs/00-what-is-sre-agent.md)
2. [Why use it?](docs/01-why-sre-agent.md)
3. [How it works](docs/02-how-it-works.md)

## Choose a track

| Track | Level | Focus | Start |
| --- | --- | --- | --- |
| **App Service / PaaS** | **Beginner — recommended** | Minimal .NET 10 Blazor app, App Service telemetry, SRE Agent diagnosis, and an approval-gated handover to the Copilot coding agent | [workshops/appservice/](workshops/appservice/README.md) |
| **AKS / Cloud-Native** | Advanced alternative | Kubernetes workload identity, Cosmos DB RBAC failures, and GitOps-based remediation | [workshops/aks/](workshops/aks/README.md) |
| **VM / Enterprise Migration** | Advanced alternative | Windows Server and IIS operations, Bastion access, and approval-gated remediation scripts | [workshops/vm/](workshops/vm/README.md) |

Each track follows the same broad loop: **deploy from code → inject a realistic
fault → watch the agent investigate → apply controlled remediation → capture
what was learned.**

## Open in Codespaces

You can run a generated repository in a preconfigured
[GitHub Codespace](https://docs.github.com/codespaces) instead of installing the
toolchain locally. Each track has a dev container under `.devcontainer/<track>/`
with Azure CLI + Bicep, PowerShell, GitHub CLI, Node.js, and its track-specific
tools. The recommended App Service configuration also includes .NET 10, `jq`,
and `zip`; the AKS configuration adds Kubernetes tooling.

1. In the repository created from the template, select **Code → Codespaces →
   New with options…**
2. Under **Dev container configuration**, select **SRE Workshop — App Service**
   for the quickstart, or choose **SRE Workshop — AKS** / **SRE Workshop — VM**
   for an advanced track.
3. Create the Codespace and wait for its setup commands to finish.
4. Authenticate interactively with `az login` and `gh auth login` before running
   the selected track's setup or deployment steps.

## Scenarios at a glance

- App Service scenarios: [workshops/appservice/scenarios/INDEX.md](workshops/appservice/scenarios/INDEX.md)
- AKS scenarios: [workshops/aks/scenarios/INDEX.md](workshops/aks/scenarios/INDEX.md)
- VM scenarios: [workshops/vm/scenarios/INDEX.md](workshops/vm/scenarios/INDEX.md)

## Contributing a scenario

This repository is designed to grow. See [CONTRIBUTING.md](CONTRIBUTING.md) to
add a self-contained scenario or register another track.

---

## 💰 Cost planning

Azure resources incur costs only for the track you deploy. The recommended App
Service quickstart does **not** provision AKS or VM resources. Pricing varies by
region, currency, retention, traffic, and SRE Agent usage, so confirm current
Azure pricing before deployment.

| Track | Main cost drivers | Planning guidance |
| --- | --- | --- |
| **App Service** | B1 Linux App Service, Log Analytics, Application Insights, and SRE Agent usage | Usually the lowest-infrastructure-cost track; allow for usage-based monitoring and agent charges |
| **AKS** | Two AKS worker nodes, Cosmos DB, Log Analytics, Application Insights, and SRE Agent usage | Cluster nodes run until cleanup and are typically the largest AKS-track cost |
| **VM** | Windows VMs, Azure Bastion, Log Analytics, Application Insights, and SRE Agent usage | VM and Bastion runtime can make this track more expensive; auto-shutdown reduces but does not eliminate cost |

Set a budget and run the selected track's cleanup module as soon as you finish.
Resources left deployed continue to incur charges.

---

## 📁 Repository structure

```text
sre-agent-workshop/
├── README.md                     # Multi-track landing and recommended quickstart
├── CONTRIBUTING.md               # How to add scenarios and tracks
├── docs/                         # Shared, track-agnostic concept layer
│   ├── 00-what-is-sre-agent.md
│   ├── 01-why-sre-agent.md
│   └── 02-how-it-works.md
├── workshops/
│   ├── appservice/               # Beginner SRE Agent → Copilot handover
│   │   ├── README.md
│   │   ├── docs/                 # App Service module walkthroughs
│   │   ├── infra/bicep/          # App Service, monitoring, identity, and alerts
│   │   ├── knowledge/            # SRE Agent operational guidance
│   │   ├── scenarios/            # Handover fault scenario (+ INDEX.md)
│   │   ├── scripts/              # Bash and PowerShell setup / cleanup
│   │   ├── src/                  # .NET 10 Blazor application
│   │   └── tests/                # Application integration tests
│   ├── aks/                      # Advanced cloud-native track
│   │   ├── docs/
│   │   ├── infra/bicep/
│   │   ├── k8s/                  # Kubernetes manifests
│   │   ├── knowledge/
│   │   ├── scenarios/
│   │   ├── scripts/
│   │   └── src/app/              # Node.js application
│   └── vm/                       # Advanced enterprise-migration track
│       ├── docs/
│       ├── infra/bicep/
│       ├── scenarios/
│       └── tools/                # Approval-gated remediation tooling
├── schemas/
│   └── scenario.schema.json      # Scenario manifest contract
├── scripts/
│   ├── new-scenario.sh           # Scaffold a scenario
│   ├── validate-scenarios.sh     # Validate and regenerate derived artifacts
│   └── scenario-tools/           # Node.js tooling behind the wrappers
├── .devcontainer/                # Per-track Codespaces configurations
└── .github/workflows/            # Per-track deploy/validate and scenario CI
```

---

## ⚠️ Important notes

### Regions

Azure SRE Agent is available in **East US 2**, **Sweden Central**, and
**Australia East**. Choose a supported region when provisioning a workshop
environment.

### Network requirements

- Allow outbound HTTPS to `*.azuresre.ai`.
- If you use a corporate proxy, confirm that it does not block this domain.

### AKS accessibility

The AKS track requires a public cluster so the SRE Agent can query cluster logs
and metrics. This requirement does not apply to the App Service or VM track.

### Cleanup is critical

Every track creates billable resources. Run its **Cleanup** module when finished;
AKS nodes, Windows VMs, Bastion, App Service, and monitoring resources can
continue accruing charges while deployed.

### Production use

This workshop is designed for learning. Do not apply its autonomy settings or
remediation patterns to production without additional controls, approval gates,
and testing.

---

## 📚 Resources and references

- **[Azure SRE Agent Docs](https://sre.azure.com/docs/overview)** — SRE Agent documentation
- **[Azure SRE Agent Portal](https://sre.azure.com)** — Create and monitor agents
- **[Azure App Service Documentation](https://learn.microsoft.com/azure/app-service/)** — Recommended-track hosting platform
- **[AKS Workload Identity](https://learn.microsoft.com/azure/aks/workload-identity-overview)** — AKS identity details
- **[Bicep Documentation](https://learn.microsoft.com/azure/azure-resource-manager/bicep/)** — Infrastructure as code
- **[Azure Monitor Alerts](https://learn.microsoft.com/azure/azure-monitor/alerts/alerts-overview)** — Alerting and incident response

---

## 🤝 Contributing

Contributions are welcome:

- **Report issues:** Open a GitHub issue with the track, module, error, and useful diagnostics.
- **Suggest improvements:** Create a branch in your repository and open a pull request.
- **Ask questions:** Start a discussion in the relevant issue thread.

---

## 📄 License

MIT License.

---

**Ready to begin?** [Create a repository from the template](https://github.com/JoranBergfeld/sre-agent-workshop/generate)
and follow the [App Service handover track](workshops/appservice/README.md).
