import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

import { REPO_ROOT } from '../lib/paths.js';

const scenariosRoot = resolve(REPO_ROOT, 'scenarios');
const aksScenarios = ['cosmos-rbac-removal', 'workload-identity-break'];
const canonicalTemplateUrl = 'https://github.com/JoranBergfeld/sre-agent-workshop/generate';
const canonicalTemplateLink = `[**Use this template**](${canonicalTemplateUrl})`;
const githubOAuthAnchor = '#configure-the-github-oauth-connector-for-issue-handoff';
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
        /a human creates or explicitly approves.*GitHub issue/i,
        `${document.path} assigns AKS issue creation to the human instead of the SRE Agent`,
      );
    }
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
      /Owner or User Access Administrator[\s\S]*?required[\s\S]*?selected (?:subscription or resource-group )?scope/i,
    );
    assert.match(prerequisites, /managed\s+identity role assignments/i);
    assert.doesNotMatch(prerequisites, /Optional role:\*\* Owner or User Access Administrator/i);
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
