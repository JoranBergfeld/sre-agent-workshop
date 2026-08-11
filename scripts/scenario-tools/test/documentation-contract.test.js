import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

import { REPO_ROOT } from '../lib/paths.js';

const scenariosRoot = resolve(REPO_ROOT, 'scenarios');
const aksScenarios = ['cosmos-rbac-removal', 'workload-identity-break'];
const aksResponsePlanExpectations = {
  'cosmos-rbac-removal': {
    customAgentName: 'cosmos-rbac-investigator',
    handoffDescription: 'Investigate the Cosmos DB RBAC removal incident',
    planName: 'cosmos-rbac-removal-review',
    severity: 'Sev3',
    titleContains: 'HTTP 500 Errors Detected',
    autonomy: 'Review',
    failureEvidence: /Failed to read items from CosmosDB[\s\S]*Forbidden[\s\S]*HTTP 500/i,
  },
  'workload-identity-break': {
    customAgentName: 'workload-identity-investigator',
    handoffDescription: 'Investigate the workload identity authentication incident',
    planName: 'workload-identity-break-review',
    severity: 'Sev3',
    titleContains: 'Workload Identity Auth Errors',
    autonomy: 'Review',
    failureEvidence: /AADSTS70021[\s\S]*No matching federated identity[\s\S]*\/items[\s\S]*\/health/i,
  },
};
const canonicalTemplateUrl = 'https://github.com/JoranBergfeld/sre-agent-workshop/generate';
const canonicalTemplateLink = `[**Use this template**](${canonicalTemplateUrl})`;
const githubOAuthAnchor = '#configure-the-github-oauth-connector-for-issue-handoff';
const humanIssueCreator =
  /(?:a human|the human|you)\s+(?:creates?|opens?|assigns?)(?:\s+or explicitly approves)?\s+(?:(?:exactly\s+)?(?:\*\*)?one(?:\*\*)?|an?|an approved|the approved)\s+(?:GitHub\s+)?issue/i;
const scenarioDirectories = readdirSync(scenariosRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .sort();

function readMarkdownTree(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);

    if (entry.isDirectory()) {
      return readMarkdownTree(path);
    }

    return entry.isFile() && entry.name.endsWith('.md')
      ? [{ path, content: readFileSync(path, 'utf8') }]
      : [];
  });
}

function assertCostGuidance(guide, costProfile) {
  assert.match(guide, /^## Cost profile$/m);
  assert.match(guide, new RegExp(`\\*\\*${costProfile}\\*\\*`, 'i'));
  assert.match(guide, /dominant cost drivers/i);
  assert.doesNotMatch(
    guide,
    /REPLACE_THIS_COST_GUIDANCE/,
    'guide contains unresolved cost guidance marker REPLACE_THIS_COST_GUIDANCE',
  );
}

for (const scenario of aksScenarios) {
  test(`${scenario} knowledge enforces the approved AKS issue handoff`, () => {
    const knowledge = readFileSync(
      resolve(scenariosRoot, scenario, 'knowledge', 'operational-guidelines.md'),
      'utf8',
    );

    assert.match(knowledge, /investigat[\s\S]*evidence/i);
    assert.match(
      knowledge,
      /request[\s\S]*explicit human approval[\s\S]*after approval[\s\S]*SRE Agent creates exactly (?:\*\*)?one(?:\*\*)? GitHub issue/i,
    );
    assert.match(knowledge, /assign(?:ed|s)?[\s\S]*`?(?:copilot-swe-agent|@copilot)`?/i);
    assert.match(
      knowledge,
      /never[\s\S]*create (?:a )?(?:branch or )?(?:pull request|PR)[\s\S]*modify[\s\S]*(?:repository code|code)[\s\S]*Azure[\s\S]*merge[\s\S]*deploy/i,
    );
    assert.match(knowledge, /human reviews and merges[\s\S]*operator manually deploys/i);
    assert.doesNotMatch(
      knowledge,
      humanIssueCreator,
    );
  });

  test(`${scenario} learner documentation uses generated repository terminology`, () => {
    const scenarioRoot = resolve(scenariosRoot, scenario);
    const learnerDocumentation = [
      {
        path: resolve(scenarioRoot, 'README.md'),
        content: readFileSync(resolve(scenarioRoot, 'README.md'), 'utf8'),
      },
      ...readMarkdownTree(resolve(scenarioRoot, 'docs')),
    ];

    for (const document of learnerDocumentation) {
      assert.doesNotMatch(
        document.content,
        /\byour fork\b|\bfork the repository\b|\bdelete your fork\b/i,
        `${document.path} uses learner fork terminology`,
      );
      assert.doesNotMatch(
        document.content,
        humanIssueCreator,
        `${document.path} assigns AKS issue creation to the human instead of the SRE Agent`,
      );
    }
  });

  test(`${scenario} response guide preserves the approved AKS issue handoff`, () => {
    const responseGuide = readFileSync(
      resolve(scenariosRoot, scenario, 'docs', '90-watch-sre-agent.md'),
      'utf8',
    );

    assert.match(
      responseGuide,
      /human approves issue creation[\s\S]*SRE Agent creates exactly (?:\*\*)?one(?:\*\*)?[\s\S]*GitHub issue/i,
    );
    assert.match(responseGuide, /assign(?:ed|s)?[\s\S]*`?(?:copilot-swe-agent|@copilot)`?/i);
    assert.match(responseGuide, /human reviews and merges[\s\S]*manually deploy/i);
  });

  test(`${scenario} prerequisites define canonical workload variables`, () => {
    const prerequisites = readFileSync(
      resolve(scenariosRoot, scenario, 'docs', '00-prerequisites.md'),
      'utf8',
    );

    assert.match(prerequisites, /^WORKLOAD_NAME="[^"]+"$/m);
    assert.match(prerequisites, /^RESOURCE_GROUP="rg-\${WORKLOAD_NAME}"$/m);
    assert.match(prerequisites, /^\$WorkloadName = "[^"]+"$/m);
    assert.match(prerequisites, /^\$ResourceGroup = "rg-\${WorkloadName}"$/m);
  });

  test(`${scenario} prerequisites link directly to the canonical template generator`, () => {
    const prerequisites = readFileSync(
      resolve(scenariosRoot, scenario, 'docs', '00-prerequisites.md'),
      'utf8',
    );

    assert.ok(
      prerequisites.includes(canonicalTemplateLink),
      `${scenario} prerequisites must contain ${canonicalTemplateLink}`,
    );
  });

  test(`${scenario} prerequisites require deployment and role-assignment permissions`, () => {
    const prerequisites = readFileSync(
      resolve(scenariosRoot, scenario, 'docs', '00-prerequisites.md'),
      'utf8',
    );

    assert.match(prerequisites, /Contributor[\s\S]*?create[\s\S]*?resources/i);
    assert.match(
      prerequisites,
      /Required access-management role:\*\* Owner or User Access Administrator at\s+subscription scope/i,
    );
    assert.match(
      prerequisites,
      /^- \[ \] Owner or User Access Administrator access at subscription scope$/m,
    );
    assert.match(prerequisites, /managed\s+identity role assignments/i);
    assert.doesNotMatch(prerequisites, /Optional role:\*\* Owner or User Access Administrator/i);
    assert.doesNotMatch(
      prerequisites,
      /Owner or User Access Administrator(?: access)? at (?:the )?(?:selected|resource[- ]group(?:-only)?) scope/i,
    );
  });

  test(`${scenario} onboarding follows the current agent setup flow`, () => {
    const onboarding = readFileSync(
      resolve(scenariosRoot, scenario, 'docs', '03-onboard-sre-agent.md'),
      'utf8',
    );

    assert.match(onboarding, /\bQuickstart\b/);
    assert.match(onboarding, /\bFull setup\b/);
    assert.match(onboarding, /Favorites sidebar/);
    assert.ok(onboarding.includes(githubOAuthAnchor));
    assert.match(onboarding, /Code[\s\S]*?Knowledge base[\s\S]*?index/i);
    assert.match(
      onboarding,
      /automatically (?:creates|reuses)[\s\S]*?(?:GitHub )?OAuth connector/i,
    );
    assert.match(
      onboarding,
      /separately (?:verifies|configures)[\s\S]*?(?:GitHub )?OAuth connector[\s\S]*?issue/i,
    );
    assert.doesNotMatch(onboarding, /GitHub MCP connector/i);
    assert.doesNotMatch(onboarding, /custom-agent MCP|custom agent.*MCP/i);
    assert.match(
      onboarding,
      /Reader level automatically includes[\s\S]*?Reader[\s\S]*?Log\s+Analytics Reader[\s\S]*?Monitoring Reader[\s\S]*?resource-group scope[\s\S]*?Monitoring Contributor[\s\S]*?subscription scope/i,
    );
    assert.match(onboarding, /review all (?:requested )?role\s+(?:assignments|grants)/i);
    assert.doesNotMatch(onboarding, /If all three checks pass/);
    assert.doesNotMatch(onboarding, /Monitor\s*→\s*Resource Mapping/);

    const verifySetup = onboarding.match(
      /^## Verify Setup\s*$([\s\S]*?)(?=^##\s|\Z)/m,
    )?.[1];
    assert.ok(verifySetup, `${scenario} onboarding must include Verify Setup`);

    const checklist = verifySetup.match(/^- \[ \].+$/gm) ?? [];
    assert.equal(checklist.length, 4);
    assert.match(verifySetup, /Code.*green check/i);
    assert.match(verifySetup, /Azure Resources.*\$RESOURCE_GROUP.*permissions complete/i);
    assert.match(verifySetup, /operational-guidelines\.md.*File.*Indexed/i);
    assert.match(verifySetup, /GitHub OAuth connector.*issues/i);
  });

  test(`${scenario} incident prerequisites use shell account checks and portal permissions`, () => {
    const incidentResponse = readFileSync(
      resolve(scenariosRoot, scenario, 'docs', '04-configure-incident-response.md'),
      'utf8',
    );

    assert.match(incidentResponse, /\*\*Bash\*\*/);
    assert.match(incidentResponse, /\*\*PowerShell\*\*/);
    assert.match(incidentResponse, /az login/);
    assert.match(incidentResponse, /az account set --subscription "\$SUBSCRIPTION_ID"/);
    assert.match(incidentResponse, /az account set --subscription \$SubscriptionId/);
    assert.match(incidentResponse, /Full setup/);
    assert.match(incidentResponse, /Azure Resources/);
    assert.match(incidentResponse, /permissions complete/i);
    assert.match(incidentResponse, /Settings.*Azure settings.*Go to Identity/i);
    assert.match(incidentResponse, /Object \(principal\) ID/i);
    assert.match(
      incidentResponse,
      /az role assignment list --assignee "\$AGENT_PRINCIPAL_ID" --scope "\/subscriptions\/\$SUBSCRIPTION_ID"/,
    );
    assert.match(
      incidentResponse,
      /az role assignment list --assignee \$AgentPrincipalId --scope "\/subscriptions\/\$SubscriptionId"/,
    );
    assert.match(incidentResponse, /Monitoring Contributor.*subscription scope/i);
    assert.match(incidentResponse, /verification only|do not create role assignments/i);
    assert.doesNotMatch(incidentResponse, /Microsoft\.ManagedIdentity/);
    assert.doesNotMatch(incidentResponse, /az identity show/);
  });
}

test('AKS response plans use the current Agent Canvas flow', () => {
  for (const id of aksScenarios) {
    const expected = aksResponsePlanExpectations[id];
    const responsePlan = readFileSync(
      resolve(scenariosRoot, id, 'docs/04-configure-incident-response.md'),
      'utf8',
    );

    assert.match(responsePlan, /Builder.*Agent Canvas/s);
    assert.match(responsePlan, /Create.*Custom Agent/s);
    assert.match(responsePlan, /Name[\s\S]*Instructions[\s\S]*Handoff Description/i);
    assert.ok(responsePlan.includes(expected.customAgentName));
    assert.ok(responsePlan.includes(expected.handoffDescription));
    assert.match(responsePlan, expected.failureEvidence);
    assert.match(responsePlan, /connected Azure resources and logs[\s\S]*repository source[\s\S]*GitHub history/i);
    assert.match(responsePlan, /Never[\s\S]*directly change Azure[\s\S]*repository code/i);
    assert.match(responsePlan, /governed recovery route[\s\S]*issue[\s\S]*Copilot[\s\S]*pull request/i);
    assert.match(responsePlan, /operational-guidelines\.md[\s\S]*knowledge/i);
    assert.match(responsePlan, /Tools[\s\S]*only the read\/investigation tools/i);
    assert.match(responsePlan, /do not (?:select|grant|enable)[\s\S]*Azure modification/i);
    assert.match(responsePlan, /do not (?:select|grant|enable)[\s\S]*pull request creation/i);
    assert.match(responsePlan, /Agent Canvas[\s\S]*Table view[\s\S]*appears/i);
    assert.match(responsePlan, /Trigger.*Incident response plan/s);
    assert.ok(responsePlan.includes(expected.planName));
    assert.match(
      responsePlan,
      new RegExp(`custom agent[^\\n]*${expected.customAgentName}`, 'i'),
    );
    assert.match(responsePlan, new RegExp(`Severity[^\\n]*${expected.severity}`));
    assert.match(
      responsePlan,
      new RegExp(`Title contains[^\\n]*${expected.titleContains}`),
    );
    assert.match(
      responsePlan,
      new RegExp(`Agent autonomy level[^\\n]*${expected.autonomy}`),
    );
    assert.match(responsePlan, /quickstart.*Table view.*delete/is);
    assert.match(responsePlan, /Reinvestigation cooldown/);
    assert.match(responsePlan, /three hours/i);
    assert.match(responsePlan, /Title contains/);
    assert.match(
      responsePlan,
      /grid[\s\S]*On[\s\S]*custom\s+agent[\s\S]*Sev3[\s\S]*title[\s\S]*Review/i,
    );
    assert.match(responsePlan, /reopen|edit/i);
    assert.match(responsePlan, /(?:reopen|edit)[\s\S]*three hours/i);
    assert.doesNotMatch(responsePlan, /grid[^.]*cooldown/i);
    assert.doesNotMatch(responsePlan, /Click \*\*New incident response plan\*\*/);
    assert.doesNotMatch(responsePlan, /workshop-all-incidents/);
  }
});

test('GitHub integration guide uses current OAuth connector terminology and policy', () => {
  const guide = readFileSync(resolve(REPO_ROOT, 'docs', 'connect-github-to-sre-agent.md'), 'utf8');

  assert.match(guide, /^## Configure the GitHub OAuth connector for issue handoff$/m);
  assert.match(guide, /Builder[\s\S]*?Connectors[\s\S]*?GitHub OAuth connector/i);
  assert.match(guide, /Code[\s\S]*?Knowledge Base[\s\S]*?index/i);
  assert.match(guide, /automatically (?:creates|reuses)[\s\S]*?(?:GitHub )?OAuth connector/i);
  assert.match(guide, /Issues.*Read and write/i);
  assert.match(guide, /Pull requests.*Read-only/i);
  assert.match(guide, /SRE Agent[\s\S]*?creates[\s\S]*?issues/i);
  assert.match(guide, /Copilot coding agent[\s\S]*?creates[\s\S]*?pull requests/i);
  assert.doesNotMatch(guide, /GitHub MCP connector/i);
});

test('cost guidance rejects the unresolved scaffold marker', () => {
  const guide = `## Cost profile

The cost profile is **low**. REPLACE_THIS_COST_GUIDANCE with dominant cost drivers.
`;

  assert.throws(
    () => assertCostGuidance(guide, 'low'),
    /REPLACE_THIS_COST_GUIDANCE/,
  );
});

for (const scenarioDirectory of scenarioDirectories) {
  test(`${scenarioDirectory} guide documents its cost profile`, () => {
    const scenarioRoot = resolve(scenariosRoot, scenarioDirectory);
    const manifest = yaml.load(readFileSync(resolve(scenarioRoot, 'scenario.yaml'), 'utf8'));
    const guide = readFileSync(resolve(scenarioRoot, manifest.guide), 'utf8');

    assertCostGuidance(guide, manifest.costProfile);
  });
}
