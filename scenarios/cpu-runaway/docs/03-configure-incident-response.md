# 03 Configure Incident Response

Configure the SRE Agent to observe the `vm-cpu-runaway` Azure Monitor alert
and investigate the `Perf` CPU signal. The SRE Agent may diagnose and propose
the approved action, but it must not run direct remediation.

## 1. Confirm the incident connection

In the SRE Agent, open **Builder > Incident platform** and confirm **Azure
Monitor** is connected. Also confirm `rg-srelabcpurunaway` is in the agent's
managed resources, as described in step 02.

There are three separate pieces in this lab:

1. The deployed Azure Monitor rule detects sustained CPU saturation.
2. The Azure Monitor incident-platform connection lets the agent receive
   alerts for its managed resources.
3. An enabled incident response plan matches the alert and starts the chosen
   investigation custom agent.

Deploying the infrastructure creates the first piece, not the other two.
An alert can fire without an SRE Agent investigation starting.

## 2. Prepare the investigation custom agent

Use the capsule's [operational guidelines](../knowledge/operational-guidelines.md)
as scenario context. Create or select an investigation custom agent in
Builder and save the following as its investigation instructions. You will
select this custom agent in the response plan.

Use these instructions:

> Investigate the VM CPU Runaway alert in rg-srelabcpurunaway. Correlate the
> alert time with Processor / % Processor Time / _Total in Perf. The target
> VM is srelabcpurunaway-vm01; its Windows computer name is srecpu01. Report
> the evidence, likely cause, impact, and proposed stop-cpu-runaway action.
> Treat the lab's marked CPU workers as the expected fault, not as a proven
> cause without evidence. Do not run VM Run Command, stop processes, or
> execute remediation. Hand the proposed action to the human operator.

## 3. Create and enable the incident response plan

1. Open **Builder > Incident response plans**. In the canvas-based interface,
   use **Create > Trigger > Incident response plan**.
2. Create a plan with these settings:

   | Setting | Value for this lab |
   |---|---|
   | Incident response plan name | `cpu-runaway-investigation` |
   | Incident platform | Azure Monitor |
   | Severity | **Sev3** |
   | Title contains | `VM CPU Runaway` |
   | Response custom agent | The investigation custom agent saved above |
   | Agent autonomy level | **Review** |

3. Select **Next** and review the matching-incidents preview. No matches are
   expected if you have not injected the fault yet; this does not prevent
   the plan from matching future alerts.
4. Select **Create**, then confirm the saved plan's status is **On**. If it
   is **Off**, select the plan and choose **Turn on**.

**Select Sev3 explicitly.** The template sets alert severity to `3`; a plan
that selects only higher-severity incidents will not match this lab.
The default Azure Monitor quickstart plan handles **Sev0, Sev1, and Sev2**,
so connecting Azure Monitor and leaving that plan unchanged is not enough.
On a dedicated workshop agent, turn off the quickstart plan when using this
scenario-specific plan to avoid overlapping responses. On a shared agent,
have its owner review overlapping plans without disabling unrelated incident
coverage.
The title filter matches the display name **VM CPU Runaway**, not the ARM
rule name `srelabcpurunaway-vm-cpu-runaway`.

Choose **Review** explicitly rather than leaving the autonomy default.
Review mode does not replace this scenario's local approval script: the
agent still must not execute remediation, even if an agent-chat action could
be approved. The operator runs the recovery script in step 05.

See Microsoft's [response-plan setup guide](https://learn.microsoft.com/azure/sre-agent/response-plan)
for the platform's filter, preview, and enablement workflow, and
[incident-platform defaults](https://learn.microsoft.com/azure/sre-agent/incident-platforms#what-connecting-an-incident-platform-enables)
for the quickstart severity filter.

## 4. Check the expected trigger and response

Before moving on, confirm all of the following:

- Azure Monitor is connected under **Builder > Incident platform**.
- The lab resource group is in the agent's managed resources.
- The response plan is **On**, selects **Sev3**, and matches
  `VM CPU Runaway`.
- The plan selects your investigation custom agent and **Review** autonomy.

After you inject the fault in step 04, check Azure Monitor **Alerts** for a
**Fired** alert from `srelabcpurunaway-vm-cpu-runaway`. The rule averages
Log Analytics `Perf` CPU data over five minutes and evaluates every five
minutes. An instantaneous high CPU reading on the VM is not sufficient to
show that the alert has fired.

Once the fired alert matches the enabled plan, the expected agent response
is **an investigation with evidence and a proposed fix**, not automatically
stopping the CPU workers. If the Azure Monitor alert fires but no agent
investigation starts, recheck the platform connection, managed-resource
scope, plan status, severity, title filter, and selected custom agent.

If alert-triggered response is not available in your environment, you can
start the investigation manually with the prompt in step 05 after the alert
fires. Be explicit about using that manual route; do not assume automation
is configured merely because the rule exists.

## 5. Understand the human handoff

1. The SRE Agent collects alert and VM evidence, then presents its diagnosis.
2. An authorized human invokes the approval gate with a `CHG-<number>` or
   `INC-<number>` ticket and types the exact confirmation `APPROVE`.
3. The gate runs only `stop-cpu-runaway` and writes an audit entry.
4. The operator validates recovery and closes the incident.

The approval gate is the normal remediation path. Do not allow an SRE Agent
to run the action directly.

Here, **approval gate means a local script you run in your terminal**. It is
not an approval button in the Azure portal or a message you send in agent
chat. The script displays the target and action, asks for confirmation, and
only then invokes the lab's recovery script using your Azure CLI credentials.
You will run it in step 05, **after** observing the incident.

Expected result before injection: the agent can investigate the correct
alert, its response instructions forbid direct remediation, and you know
which human will review and run recovery.

## Optional collaboration

GitHub issues and Copilot can help record the diagnosis, improve
documentation, or prepare a reviewed infrastructure change. They cannot
replace the approval gate or directly run remediation.

**Previous:** [02 Onboard the SRE Agent](./02-onboard-sre-agent.md) |
**Next:** [04 Inject the CPU fault](./04-inject-fault.md).
