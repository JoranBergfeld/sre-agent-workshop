# Module 6: Watch the SRE Agent Work (~30 min)

> **The Payoff.** The role assignment was removed in Module 5, the app is failing silently with 500 errors, and Azure Monitor fired an alert. Now watch the SRE Agent detect, diagnose, and fix the issue — end to end. This is where AI-powered incident response meets real infrastructure.

---

## Navigate to the SRE Agent Portal

1. Go to **[sre.azure.com](https://sre.azure.com)**
2. Log in with your Azure credentials (same account you used to set up the agent)
3. Select your agent from the dashboard
4. Look for the **Incidents** section — you should see an active incident labeled something like:
   - `High error rate detected on /items endpoint`
   - `AKS pod restart spike in workshop namespace`
   - Or a similar alert from your Azure Monitor configuration

> **🎯 Tip:** If you don't see an incident yet, wait 1–2 minutes and refresh. Azure Monitor alerts can take time to fire, especially in early integration phases.

5. Click on the incident to open the **investigation thread** — this is where the agent's thinking happens

---

## What to Watch For

The agent follows a structured investigation pattern. Here's what you'll observe:

### Phase 1: Alert Acknowledgment ⏱️

**Timeline:** Seconds after the incident appears

The agent will:
- **Parse the alert** — reads the Azure Monitor alert details
- **Understand the scope** — identifies:
  - Affected resource(s): your AKS cluster, the workshop namespace
  - Severity: typically HIGH or CRITICAL for sustained 500 errors
  - Time window: when the errors started
- **Begin investigation** — logs its first diagnostic action: *"Starting investigation of alert on workshop namespace..."*

Look for language like:
```
Received alert: High error rate detected
Resource: AKS Cluster / workshop namespace
Severity: HIGH
Status: ACTIVE
Next: Querying recent logs and metrics for the affected endpoint
```

---

### Phase 2: Log and Metric Analysis 📊

**Timeline:** 30 seconds after acknowledgment

The agent queries **Azure Monitor** and **Log Analytics** looking for evidence:

**Container Logs** — The agent reads logs from the `workshop` namespace:
```
ERROR: Authentication failed with Azure Identity
Status: 403 Forbidden
Error: The user, app, or service principal does not have permission to access CosmosDB
```

Watch for log excerpts showing authentication errors. These are the smoking gun.

**Pod Status & Restarts** — The agent checks:
- How many pods are in the `workshop` namespace
- Are any restarting due to health probe failures?
- What's the resource utilization?

**HTTP Error Patterns** — In **Application Insights**, the agent looks for:
- Spike in 500 errors
- Which endpoint(s) are failing: `/items` should be the primary culprit
- What's the error rate: probably 100% (all requests fail)
- When did it start: correlate with Module 5 (your Bicep deployment)

**Key Insight:** The agent is building a pattern:
- App → CosmosDB failures happen consistently after the infrastructure change
- This is **not** a transient glitch or overload
- This is a **permissions issue**

---

### Phase 3: Deployment Correlation 🔍

**Timeline:** 1–2 minutes into investigation

This is where it gets interesting — the agent asks: *"What changed?"*

The agent will:
- **Check deployment history** — queries GitHub Actions for recent workflow runs
- **Find the Bicep deployment** — identifies `deploy-aks-infra.yml` and the exact run that deployed the change
- **Trace to the commit** — connects the workflow run to the specific commit (the one that removed the role assignment)
- **Read the commit diff** — examines what changed in `workshops/aks/infra/bicep/modules/identity.bicep`

The agent's reasoning will surface:
```
Timeline correlation:
- 14:32:15 → Commit hash abc123 merged to main
- 14:32:47 → GitHub Actions workflow triggered
- 14:33:22 → Bicep deployed to Azure
- 14:34:00 → App starts returning 500 errors
- 14:35:30 → Azure Monitor alert fired

Conclusion: Deployment is the likely root cause
Next: Examine what changed in the Bicep code
```

---

### Phase 4: Code Analysis 🧬

**Timeline:** 2–3 minutes into investigation

The agent reads your **Bicep repository** and examines:

**Current Version:**
```bicep
// in workshops/aks/infra/bicep/modules/identity.bicep
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

// NOTE: Role assignment for CosmosDB is MISSING
```

**Previous Version** (from Git history):
```bicep
resource roleAssignmentCosmosDB 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(cosmosdbId, managedIdentityPrincipalId, 'reader')
  scope: cosmosdb
  properties: {
    roleDefinitionId: cosmosDbReaderRoleId
    principalId: managedIdentityPrincipalId
  }
}
```

The agent compares the two and identifies:
```
Analysis:
- Role assignment for CosmosDB data reader was present
- Current version: role assignment is ABSENT
- CosmosDB data reader role ID (1bfdeec6-6641-41a6-86db-f1d1406016d8) is no longer assigned
- Result: The managed identity srelab-identity cannot authenticate to CosmosDB

This is the root cause.
```

---

### Phase 5: Root Cause Identification ✅

**Timeline:** 3–4 minutes into investigation

The agent presents a **structured diagnosis**:

```
ROOT CAUSE ANALYSIS
═══════════════════════════════════════════

Problem:
  HTTP 500 errors on GET /items endpoint

Root Cause:
  Managed identity "srelab-identity" lost permission to CosmosDB

Why:
  • Commit abc123 removed the role assignment for CosmosDB data reader
  • Bicep deployed without the roleAssignment block
  • App's DefaultAzureCredential cannot authenticate to CosmosDB

Evidence:
  1. Pod logs: "403 Forbidden - User does not have permission"
  2. Deployment timeline: Role removal → Bicep deploy → App failures
  3. Git history: Role assignment was present in previous version
  4. Application Insights: 100% error rate on /items after deployment

Impact:
  • All requests to /items return HTTP 500
  • App cannot read or write data
  • Workload identity authentication is failing
  • Users cannot access the application

Confidence: HIGH (multiple correlating signals)
```

Watch how the agent synthesizes multiple data sources into a confident, evidence-backed conclusion.

---

### Phase 6: Remediation & PR Opening 🔧

**Timeline:** 4–5 minutes into investigation

Now the agent **takes action**:

1. **Proposes a fix** — restore the role assignment in Bicep
2. **Creates a fix branch** — typically `fix/cosmosdb-role-assignment` or similar
3. **Edits the Bicep code** — adds back the role assignment block:
   ```bicep
   resource roleAssignmentCosmosDB 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
     name: guid(cosmosdbId, managedIdentityPrincipalId, 'reader')
     scope: cosmosdb
     properties: {
       roleDefinitionId: cosmosDbReaderRoleId
       principalId: managedIdentityPrincipalId
     }
   }
   ```
4. **Commits the change** with a message like:
   ```
   fix(infra): restore CosmosDB role assignment for managed identity

   Root cause analysis identified that the managed identity
   srelab-identity was missing the CosmosDB data reader role,
   causing app authentication failures.

   This commit restores the role assignment that was inadvertently
   removed in the previous deployment.

   Closes incident [INCIDENT_ID]
   ```
5. **Pushes the branch** to your GitHub repository
6. **Opens a Pull Request** against `main`

---

## Review the Pull Request

1. Go to **your forked repository on GitHub**
2. Look for a new **Pull Request** from the SRE Agent
   - PR title: Something like `[SRE Agent] Restore CosmosDB role assignment`
   - Author: SRE Agent (or the service principal configured in Module 3)
3. Click into the PR to see:

### PR Description (Narrative)
The PR description includes a summary:

```markdown
## Root Cause Analysis

### What was wrong?
The managed identity "srelab-identity" was missing the CosmosDB data reader 
role assignment, preventing the application from authenticating to CosmosDB.

### Why did it happen?
Deployment commit abc123 removed the role assignment from 
workshops/aks/infra/bicep/modules/identity.bicep.

### What's the impact?
All requests to the /items endpoint return HTTP 500 (Internal Server Error).
The application cannot read from or write to CosmosDB.

### Evidence gathered
- Container logs show 403 Forbidden authentication errors
- Azure Monitor detected 100% error rate on /items
- Timeline correlates infrastructure deployment with app failures
- Code review shows role assignment was removed in the latest Bicep changes

### What does this fix do?
This PR restores the CosmosDB data reader role assignment to the managed 
identity, allowing the application to authenticate successfully.
```

### Files Changed
Click on the **"Files changed"** tab:
- You'll see changes to `workshops/aks/infra/bicep/modules/identity.bicep`
- The diff shows the role assignment block being restored (green lines)
- Look for exactly the code block that was commented out in Module 5

> **💡 Discussion Point:** Notice how the agent didn't just blindly restore the code — it gathered evidence first. If the issue had been something else (e.g., a resource quota, a network issue), the PR would have proposed a different fix. This is why diagnosis matters.

---

## Merge and Verify Recovery

### Step 1: Merge the PR
1. On the PR page, click **"Merge pull request"**
2. Confirm the merge
3. Optionally delete the branch after merging

### Step 2: Deploy the fix
1. Go to your repository's **Actions** tab
2. Select **"Deploy AKS Infrastructure"** in the left sidebar
3. Click **"Run workflow"** → choose your region and workload name → **Run workflow**
   - This deploys the Bicep changes (with the restored role assignment) to Azure
4. Wait for the workflow to complete (~3–5 minutes)
   - You should see a ✅ green checkmark when done

### Step 3: Verify the app is working again

Open a terminal and test the app:

```bash
# Get the external IP of the app (from Module 2)
kubectl get service -n workshop

# Test the health endpoint
curl http://<EXTERNAL-IP>/health
# Should return: 200 OK with {"status": "healthy"}

# Test the items endpoint (the one that was failing)
curl http://<EXTERNAL-IP>/items
# Should return: 200 OK with either:
#   [] (empty array, if no data was inserted)
#   [{"id": "...", "name": "...", ...}] (list of items)
```

**If successful:** 🎉
```
HTTP 200 OK
Content-Type: application/json

[]
```

**Why it works now:**
- The role assignment is restored
- The managed identity can authenticate to CosmosDB
- The app's `DefaultAzureCredential` succeeds
- Requests flow: browser → app → CosmosDB → browser ✓

### Step 4: Monitor incident resolution

1. Go back to the **SRE Agent portal** at [sre.azure.com](https://sre.azure.com)
2. Look at the incident status
   - It should show as **RESOLVED** or **RECOVERED**
   - The agent has recognized that the fix worked
3. Look at the investigation thread
   - The agent will have logged the recovery:
   ```
   Detected successful recovery after PR merge and redeployment
   Error rate returned to 0%
   Application responding normally on /items endpoint
   Incident resolved
   ```

---

## Discussion Points

**Take 10 minutes as a group to discuss:**

### 1. 🏃 Speed of Detection
> **How fast was the SRE Agent from alert to diagnosis?**
- In the workshop: 4–5 minutes end to end
- Manually: 30–60 minutes (finding logs, checking deployments, reading code)
- In your production environment: How would this change your MTTR?

### 2. 🔗 Deployment Tracing
> **The agent connected a user-visible failure to a specific git commit.**
- This is **correlation power**: alert → logs → deployments → commits
- Without tooling, teams manually ask: "What changed?"
- With the SRE Agent: "Here's what changed, and here's the proof"
- How would this help in a real production incident?

### 3. 🧠 Institutional Knowledge
> **The agent now remembers this incident.**
- It has seen: authentication failures → Azure Identity errors → role assignment issues
- Next time a similar issue occurs, it will recognize the pattern immediately
- It might even propose the fix without you merging and redeploying (it will know CosmosDB role assignments)
- How does this "learning" change your team's incident response?

### 4. 🎛️ Review vs Autonomous Mode
> **In this workshop, the agent ran in Autonomous mode (it opened the PR directly).**
- In production, you'd likely start with **Review mode**:
  - Agent proposes a fix
  - Sends a message to your Slack channel
  - Waits for human approval before committing/merging
- What guardrails would you put in place?
- Would you approve different fix types differently? (e.g., diagnostic-only vs. breaking changes)

### 5. 🚀 Beyond This Workshop

**As a team, brainstorm:**
- What other failure scenarios would you want the SRE Agent to handle?
  - Certificate expiration?
  - Quota limits (CPU, storage)?
  - Failed database backups?
  - Canary deployment failures?

- How would you integrate it with your existing incident management?
  - PagerDuty escalation?
  - ServiceNow ticket creation?
  - Slack bot commands to manually trigger investigations?

- What **runbooks** would you upload to give the agent context?
  - Architecture diagrams
  - Known issues and resolutions
  - Escalation procedures
  - Team contact info

---

## What Just Happened — The Full Flow

Let's trace the complete story from start to finish:

```
TIMELINE
════════════════════════════════════════════════════════════════

Module 5 — 14:32:15
  └─ You commit: Remove CosmosDB role assignment from Bicep
  └─ Push to main

Module 5 — 14:32:47
  └─ Validate AKS Infrastructure workflow runs (syntax + what-if)
  └─ You: Manually trigger Deploy AKS Infrastructure workflow
  └─ Bicep deploys infrastructure WITHOUT role assignment
  └─ CosmosDB still exists, but managed identity has no permission

Module 5 — 14:33:22
  └─ Application restarts (new Bicep config applied)
  └─ First request to GET /items arrives
  └─ App: DefaultAzureCredential attempts to auth to CosmosDB
  └─ Result: 403 Forbidden — no permission
  └─ App: Returns HTTP 500 to client

Module 5–6 — 14:34:00 to 14:35:30
  └─ Requests continue to fail (100% error rate)
  └─ Log Analytics collects error messages
  └─ Application Insights tracks the spike
  └─ Azure Monitor alert threshold exceeded
  └─ Alert fires: "High error rate detected"

Module 6 — 14:35:35 (SRE Agent Investigation Begins)
  └─ SRE Agent: Alert received and parsed
  └─ SRE Agent: Acknowledges incident, starts investigation thread
  └─ SRE Agent: Queries logs → finds 403 auth errors
  └─ SRE Agent: Checks metrics → finds 100% error rate on /items
  └─ SRE Agent: Checks deployments → finds infra deployment at 14:32:47
  └─ SRE Agent: Traces to commit hash abc123
  └─ SRE Agent: Reads the diff → sees role assignment removed
  └─ SRE Agent: Conclusion: Missing role assignment is root cause

Module 6 — 14:38:22 (Remediation)
  └─ SRE Agent: Creates fix branch
  └─ SRE Agent: Restores role assignment in Bicep
  └─ SRE Agent: Commits and pushes
  └─ SRE Agent: Opens PR with root cause analysis
  └─ PR goes to GitHub awaiting your review

Module 6 — 14:39:15 (Your Action)
  └─ You: Review the PR description and code changes
  └─ You: Click "Merge pull request"
  └─ You: Confirm merge

Module 6 — 14:39:22 (Redeployment)
  └─ You: Manually trigger Deploy AKS Infrastructure workflow
  └─ Bicep deploys infrastructure WITH role assignment restored
  └─ CosmosDB role assignment is recreated
  └─ Managed identity regains permission

Module 6 — 14:42:00 (Recovery)
  └─ Application restarts with new config
  └─ First request to GET /items arrives
  └─ App: DefaultAzureCredential attempts to auth to CosmosDB
  └─ Result: 200 OK — permission granted
  └─ App: Returns 200 with items [] (or populated data)

Module 6 — 14:42:30 (Resolution)
  └─ Error rate drops to 0%
  └─ Azure Monitor: Alert threshold cleared
  └─ SRE Agent: Detects recovery
  └─ SRE Agent: Marks incident as RESOLVED
  └─ Incident thread concludes
```

---

## The Big Picture

What you just experienced is the **full incident lifecycle**, compressed into 10 minutes:

| Phase | Traditional Ops | SRE Agent |
|-------|---|---|
| **Alert to first look** | On-call engineer gets paged, context-switch, review alert | Immediate acknowledgment |
| **Log analysis** | Run queries manually, grep through logs | Automated log querying, pattern matching |
| **Deployment correlation** | Ask team: "What changed?" → dig through git history | Automated deployment history search |
| **Code review** | Read diffs, understand context | Automated code analysis against repo |
| **Diagnosis** | Synthesize findings into incident post-mortem (next day) | Synthesized during incident response (minutes) |
| **Fix proposal** | Senior engineer codes a fix during incident (error-prone) | Automated code fix based on diagnosis |
| **Code review** | Peer review process (standard PR flow) | You review SRE Agent PR |
| **Deployment** | CI/CD runs automatically post-merge | You trigger Deploy AKS Infrastructure after merging |
| **Verification** | Manual spot-checking, "Is it fixed?" | Automated health check validation |
| **Incident closure** | Manual investigation report written next day | Incident marked resolved with full analysis attached |
| **MTTR** | 30–60+ minutes | 5–10 minutes |

---

## Key Takeaways

✅ **The SRE Agent is a force multiplier for incident response.**
- It doesn't replace humans; it augments human decision-making
- You made the final merge decision
- The agent did the heavy lifting: investigation, diagnosis, fix proposal

✅ **Automation shines in the middle of the incident lifecycle.**
- The "gathering facts" phase (logs, metrics, deployments, code) is what takes humans longest
- The agent excels here

✅ **The agent learns from every incident.**
- It has seen this pattern (CosmosDB role → auth failure) once
- Next time, it will recognize it faster and propose fixes with more confidence

✅ **Your team's incident response maturity increases.**
- Instead of fighting fires, you're now orchestrating automated response
- More time for prevention, capacity planning, and architecture improvements

---

## Next Step

→ **[Module 7: Cleanup](./99-cleanup.md)** — Tear down resources, discuss lessons learned, and wrap up the workshop.

---

**Time checkpoint:** You're 2–3 hours into the workshop. Cleanup and discussion should take 10–15 minutes. You're almost done!

🎯 **What's left:** Shut down your Azure resources, avoid ongoing costs, and discuss how to bring this back home to your team.
