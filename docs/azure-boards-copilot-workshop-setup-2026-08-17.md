# Azure Boards and GitHub Copilot Workshop Setup

Date: 2026-08-17

## Decision

The workshop can use the generally available Azure Boards integration with
GitHub Copilot cloud agent, provided that Azure Boards is the work tracker and
the code remains in a GitHub repository. Azure Repos is not supported.

The learner should invoke Copilot manually from the Azure Boards work item.
This preserves the scenario's human handoff gate and avoids relying on the
public-preview cloud-agent API.

## Facilitator prerequisites

- An Azure DevOps Services organization and project using an Agile, Scrum,
  CMMI, or custom process.
- The Azure Boards GitHub App installed by a GitHub organization owner and
  scoped to the workshop repository.
- Any updated Azure Boards App permissions accepted for an existing
  installation.
- The Azure DevOps project connected to the GitHub repository through GitHub
  App authentication. PAT-backed connections do not support this Copilot
  integration.
- GitHub Copilot cloud agent enabled by organization policy when using
  Copilot Business or Enterprise.
- A supported Azure Boards work-item type. Requirement and Task categories
  include User Story, Product Backlog Item, Requirement, Task, Bug, Issue, and
  custom types mapped to those categories.

## Participant prerequisites

- An active paid GitHub Copilot plan.
- GitHub Write access to the workshop repository.
- Azure DevOps Contributor access to the project.
- Visibility of the Copilot icon on an eligible Azure Boards work item.

## Handoff behavior

From the work item, the learner selects **Create a pull request with GitHub
Copilot**, chooses the connected GitHub repository and base branch, optionally
adds instructions, and starts the operation.

Azure Boards passes the work-item title, large text fields such as description
and acceptance criteria, the latest 50 comments, and a work-item link to the
cloud agent. Copilot creates a branch and draft GitHub pull request. Azure
Boards displays the linked development artifacts and reports **In Progress**,
**Ready for Review**, or **Error**.

An `AB#<id>` reference in the pull request provides traceability. Merging to
the default branch can transition the linked work item according to the
Azure Boards process configuration, but the workshop should explicitly verify
the resulting state rather than assume the work item is closed.

## Human and automated boundaries

| Action | Owner |
| --- | --- |
| Install the Azure Boards GitHub App | GitHub organization owner |
| Connect the Azure DevOps project and repository | Azure DevOps administrator |
| Create the work item | SRE Agent after human approval, or a learner fallback |
| Invoke Copilot from the work item | Learner |
| Create the branch and draft pull request | GitHub Copilot cloud agent |
| Review and merge the pull request | Human reviewer |
| Deploy and validate recovery | Operator |

The work-item Copilot operation cannot be cancelled after it starts. Unwanted
results must be handled by closing or discarding the generated pull request.
The GitHub cloud-agent REST API is a separate public-preview entry point using
user-to-server authentication; it is not a server-to-server automation for the
Azure Boards button and is not the recommended workshop route.

## Public repository considerations

The manual Azure Boards-to-Copilot flow works with public repositories.
However, work-item content passed into the pull request can become publicly
visible, so scenario data must contain no secrets, personal information, or
real incident details.

Copilot Automations cannot replace the manual step for this repository because
automations require a private or internal repository.

## Cleanup boundary

Participant cleanup is limited to the artifacts created for their run:

- Close or discard the draft pull request.
- Delete the agent-created branch when appropriate.
- Close the Azure Boards work item.

Participants must not remove the shared Azure Boards GitHub connection or
revoke the organization-level GitHub App installation. Those are
facilitator-managed resources.

## Primary sources

- [Integrating Copilot cloud agent with Azure Boards](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/integrate-cloud-agent-with-azure-boards)
- [Use GitHub Copilot with Azure Boards](https://learn.microsoft.com/en-us/azure/devops/boards/github/work-item-integration-github-copilot)
- [Managing access to GitHub Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/access-management)
- [Adding GitHub Copilot cloud agent to your organization](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-organization/add-copilot-cloud-agent)
- [Connect an Azure Boards project to a GitHub repository](https://learn.microsoft.com/en-us/azure/devops/boards/github/connect-to-github)
- [Link GitHub commits and pull requests to Azure Boards work items](https://learn.microsoft.com/en-us/azure/devops/boards/github/link-to-from-github)
- [About GitHub Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)
- [About Copilot automations](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-automations)
