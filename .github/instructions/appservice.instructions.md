---
applyTo: "scenarios/cloud-agent-handover/**"
---

# App Service coding instructions

- Keep changes focused on the assigned issue and inside its stated file scope.
- Preserve the exact documented API response contracts and the existing
  `GET /health` behavior.
- Use nullable, type-safe C#; do not suppress warnings or add unnecessary type
  assertions.
- Add or update endpoint tests for every behavior change.
- Assert status codes and response payloads rather than implementation details.
- Do not weaken, delete, skip, or bypass assertions merely to make CI pass.
- Do not change App Service Bicep or GitHub Actions unless the issue explicitly
  requires it.
- Run the commands in `scenarios/cloud-agent-handover/CODE_QUALITY.md` before completing
  the pull request.
