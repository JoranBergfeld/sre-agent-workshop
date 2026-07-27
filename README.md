# Azure SRE Agent Workshop 🔧

**Deploy infrastructure, break it on purpose, and watch AI fix it.**

A hands-on workshop that teaches operations teams how the Azure SRE Agent detects, diagnoses, and remediates infrastructure faults across **Kubernetes and VM-based enterprise workloads**. You'll provision real infrastructure, deploy an application, introduce realistic failures, and observe the SRE Agent investigate and propose fixes via GitHub.

---

## Start here

New to the Azure SRE Agent? Read the shared concept layer first:

1. [What is the SRE Agent?](docs/00-what-is-sre-agent.md)
2. [Why use it?](docs/01-why-sre-agent.md)
3. [How it works](docs/02-how-it-works.md)

## Choose a track

| Track | Focus | Start |
| --- | --- | --- |
| **AKS / Cloud-Native** | Kubernetes workload identity, CosmosDB RBAC fault injection | [workshops/aks/](workshops/aks/README.md) |
| **VM / Enterprise Migration** | Windows Server + IIS, Bastion access, approval-gated remediation | [workshops/vm/](workshops/vm/README.md) |
| **App Service / PaaS** | .NET 10 shop on App Service (Linux) + Azure SQL, passwordless managed identity | [workshops/appservice/](workshops/appservice/README.md) |

Each track follows the same loop: **deploy from code → inject a realistic fault →
watch the agent investigate → apply controlled remediation → capture a postmortem.**

## Open in Codespaces

You can run any track in a preconfigured [GitHub Codespace](https://docs.github.com/codespaces)
— no local tool installation required. Each track has its own dev container under
`.devcontainer/<track>/` bundling that track's toolchain (Azure CLI + Bicep, PowerShell,
GitHub CLI, Node, jq, plus kubectl for AKS or .NET 10 for App Service).

1. Click **Code → Codespaces → New with options…**
2. Under **Dev container configuration**, pick your track: **SRE Workshop — AKS**,
   **SRE Workshop — VM**, or **SRE Workshop — App Service**.
3. Create the Codespace and wait for setup to finish.

When it opens, authenticate the CLIs interactively with `az login` and `gh auth login`.

## Scenarios at a glance

- AKS scenarios: [workshops/aks/scenarios/INDEX.md](workshops/aks/scenarios/INDEX.md)
- VM scenarios: [workshops/vm/scenarios/INDEX.md](workshops/vm/scenarios/INDEX.md)

## Contributing a scenario

This repo is built to grow. See [CONTRIBUTING.md](CONTRIBUTING.md) to add a new scenario
(one self-contained folder) or a whole new track.

---

## 💰 Cost Estimate

This workshop runs on Azure resources that incur real costs. The following estimate assumes the full ~3–4 hour workshop:

| Resource | Cost/Hour | Notes |
|----------|-----------|-------|
| AKS (2× Standard_DS2_v2 nodes) | ~$0.25 | Largest cost; note: nodes run during entire workshop |
| CosmosDB (serverless) | ~$0.05 | Minimal RUs for a workshop scenario |
| Log Analytics + App Insights | ~$0.10 | Standard monitoring pricing |
| SRE Agent | ~$0.50 | Depends on model provider and investigation volume |
| **Total** | **~$1.00/hr** | ~$4–6 for full workshop |

**Budget recommendation: Set aside $10 to be safe.** Remember to run the **Cleanup** module when done—resources still incur costs when left running.

---

## 🚀 Quick Start

### Prerequisites
- Azure subscription with **Contributor** access
- Azure CLI and `kubectl` installed
- GitHub account (you'll fork this repo)
- Supported region: **East US 2**, **Sweden Central**, or **Australia East**
- Outbound network access to `*.azuresre.ai` (SRE Agent access)

### Clone & Begin

```bash
# 1. Fork this repository on GitHub
#    (Go to https://github.com/Azure/sre-agent-workshop and click "Fork")

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/sre-agent-workshop.git
cd sre-agent-workshop

# 3. Read the shared concept layer, then pick a track
cat docs/00-what-is-sre-agent.md

# 4. Follow your track's walkthrough
cat workshops/aks/README.md   # or: cat workshops/vm/README.md
```

Then follow each module in order. Each one builds on the previous.

---

## 📁 Repository Structure

```
sre-agent-workshop/
├── README.md                     # This portfolio landing
├── CONTRIBUTING.md               # How to add scenarios and tracks
├── docs/                         # Shared, track-agnostic concept layer
│   ├── 00-what-is-sre-agent.md
│   ├── 01-why-sre-agent.md
│   └── 02-how-it-works.md
├── workshops/
│   ├── aks/                      # AKS / Cloud-Native track
│   │   ├── README.md
│   │   ├── docs/                 # Module walkthroughs (00-04, 90, 99)
│   │   ├── knowledge/            # SRE Agent knowledge files (operational guidelines)
│   │   ├── infra/bicep/          # Bicep modules + generated scenario-alerts
│   │   ├── k8s/                  # Kubernetes manifests
│   │   ├── src/app/              # Node.js web app
│   │   ├── scripts/              # setup / cleanup helpers
│   │   └── scenarios/            # Self-contained fault scenarios (+ INDEX.md)
│   └── vm/                       # VM / Enterprise Migration track (same shape)
├── schemas/
│   └── scenario.schema.json      # The scenario manifest contract
├── scripts/
│   ├── new-scenario.sh           # Scaffold a new scenario
│   ├── validate-scenarios.sh     # Validate + regenerate indexes/aggregators
│   └── scenario-tools/           # Node tooling behind the wrappers
└── .github/workflows/            # Per-track deploy/validate + scenario CI
```

---

## ⚠️ Important Notes

### Regions
The Azure SRE Agent is available in **East US 2**, **Sweden Central**, and **Australia East**. Choose one of these when provisioning your workshop environment.

### Network Requirements
- Your network must allow outbound HTTPS to `*.azuresre.ai`
- If behind a corporate proxy, ensure it doesn't block this domain

### AKS Accessibility
The AKS cluster must be public (not private). The SRE Agent needs network access to query cluster logs and metrics.

### Cleanup is Critical
Resources like AKS and CosmosDB incur hourly costs even if idle. **Always run the Cleanup module** to delete resources when done. A forgotten cluster can cost $20–30 overnight.

### Production Use
This workshop is designed for learning. Do not use these patterns (especially Autonomous autonomy level) in production without additional controls, approval gates, and testing.

---

## 📚 Resources & References

- **[Azure SRE Agent Docs](https://sre.azure.com/docs/overview)** — Full SRE Agent documentation
- **[Azure SRE Agent Portal](https://sre.azure.com)** — Where you create and monitor agents
- **[AKS Workload Identity](https://learn.microsoft.com/azure/aks/workload-identity-overview)** — Deep dive into workload identity in Kubernetes
- **[Bicep Documentation](https://learn.microsoft.com/azure/azure-resource-manager/bicep/)** — Learn Infrastructure-as-Code with Bicep
- **[Azure Monitor Alerts](https://learn.microsoft.com/azure/azure-monitor/alerts/alerts-overview)** — Alert rules and incident response

---

## 🤝 Contributing

Found an issue or want to improve the workshop? Contributions welcome!

- **Report issues:** Open a GitHub issue with details (module, error, screenshots)
- **Suggest improvements:** Fork, make changes, and open a pull request
- **Ask questions:** Discussion welcome in issue threads

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.

---

**Ready to begin?** Start with [What is the SRE Agent?](docs/00-what-is-sre-agent.md) →
