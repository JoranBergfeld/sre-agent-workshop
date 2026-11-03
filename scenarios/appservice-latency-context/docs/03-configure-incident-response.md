# Configure the incident boundary

## Objective and starting assets

Prepare a repeatable, bounded incident and deliberate handover. Use the paired
`inject`, `validate`, `evidence` and `reset` helpers. A manual investigation
prompt is sufficient; this capsule does not silently install an autonomous
alert/response plan or require a traffic generator.

**Safety:** approve before SRE Agent creates **one unassigned issue**. Review
its content, then assign the coding agent yourself. Agents never merge/deploy.
Keep the first fix unmerged. Runtime injection does **not** make tracked code
faulty: prepare and publish a dedicated faulty coding-task base separately.
Removing a pause, turning off injection or resetting does not demonstrate a
behavior-preserving code repair.

<details>
<summary>Show exact steps</summary>

Capture the existing healthy validation result and UTC time. Inject once:

```bash
scenarios/appservice-latency-context/scripts/inject.sh
scenarios/appservice-latency-context/scripts/validate.sh --expect faulty
scenarios/appservice-latency-context/scripts/evidence.sh
```

```powershell
./scenarios/appservice-latency-context/scripts/inject.ps1
./scenarios/appservice-latency-context/scripts/validate.ps1 --expect faulty
./scenarios/appservice-latency-context/scripts/evidence.ps1
```

Injection deploys one fixed prepared revision, with no workload amplification
or source edits. Validation sends one order and three health requests; it
retains request IDs, response bodies and elapsed observations. Do not loop
load generation. Record the deployment time and the initiating prompt for
equivalent later runs.

**Prepare the coding-task workspace before approved handover** (same Git
commands in either shell):

```bash
git switch -c incident-baseline
scenarios/appservice-latency-context/scripts/prepare-code.sh --confirm faulty
# PowerShell alternative:
# ./scenarios/appservice-latency-context/scripts/prepare-code.ps1 --confirm faulty
git diff --stat
git add scenarios/appservice-latency-context/src/timing.php
git commit -m "chore: prepare synthetic incident starting code"
git push -u origin incident-baseline
```

Use your own branch name. The helper protects main/master, checks tracked source
and refuses learner edits; it does not commit/push for you. Explicitly select
this published faulty branch as the coding task's base in the supported task
surface. Verify its tracked `src/` is faulty: a task based on healthy `main`
cannot repair a runtime-only injected package. Preserve the faulty base for
the second task; do not merge the first fix into it.

Start the SRE thread with symptoms, resource IDs, UTC window and the affected
route, not a root-cause answer. Request evidence and a proposed handover before
authorizing issue creation. Detailed baseline guidance belongs to the next page.

To reset operational state after preserving artifacts:

```bash
scenarios/appservice-latency-context/scripts/reset.sh
scenarios/appservice-latency-context/scripts/validate.sh --expect healthy
```

```powershell
./scenarios/appservice-latency-context/scripts/reset.ps1
./scenarios/appservice-latency-context/scripts/validate.ps1 --expect healthy
```

Reset first exports bounded connected evidence and fails closed if export
fails, then deploys the known healthy fixture. It does not modify tracked
source, branch, issue, PR or local observations. To repeat an incident, inject
the same faulty revision again and retain the same workload/code conditions.

</details>

## Observe and experiment

Expect a slow but valid order response and independently healthy requests,
not a guaranteed timeout/5xx. Inspect correlation and deployment evidence;
avoid reading prepared fault files if investigating without spoilers.
Compare one healthy observation with one faulty observation, keeping hosting
overhead distinct from application duration. These operations are setup/reset,
not measured coding-agent repair evidence.

**Troubleshooting:** if source is already edited, stop and preserve it; never
use a destructive checkout/reset to force branch preparation. If the task UI
cannot target your faulty branch, pause live handover and resume in a supported
surface rather than claim a healthy-base task tested the incident. Validation
failures retain observations; inspect response/correlation and host logs before
retrying. Export failures leave the runtime untouched.

Next: [Baseline investigation](04-baseline.md).
