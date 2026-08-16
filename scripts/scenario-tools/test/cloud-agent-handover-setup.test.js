import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

test('Cloud Agent Handover setup retains the authenticated GitHub environment token', () => {
  const bashSetup = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/scripts/setup.sh'),
    'utf8'
  );
  const powershellSetup = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/scripts/setup.ps1'),
    'utf8'
  );

  assert.doesNotMatch(bashSetup, /unset GH_TOKEN GITHUB_TOKEN/);
  assert.doesNotMatch(powershellSetup, /Remove-Item Env:GH_TOKEN, Env:GITHUB_TOKEN/);
});

test('Cloud Agent Handover setup verifies the requested Azure subscription', () => {
  const bashSetup = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/scripts/setup.sh'),
    'utf8'
  );

  assert.match(bashSetup, /requested_subscription_id="\$\{AZURE_SUBSCRIPTION_ID:-\}"/);
  assert.match(bashSetup, /Azure subscription mismatch/);
  assert.doesNotMatch(bashSetup, /AZURE_ACTIVE_SUBSCRIPTION_ID/);
});

test('Cloud Agent Handover onboarding makes manual SRE Agent creation explicit', () => {
  const onboardingGuide = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md'),
    'utf8'
  );

  assert.match(onboardingGuide, /does \*\*not\*\*\s+deploy an SRE Agent/i);
  assert.match(onboardingGuide, /Create an SRE Agent manually/i);
});

test('Cloud Agent Handover documentation retains the authenticated Codespaces token', () => {
  const rootReadme = readFileSync(resolve(repositoryRoot, 'README.md'), 'utf8');
  const prerequisites = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/docs/00-prerequisites.md'),
    'utf8'
  );
  const deploymentGuide = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md'),
    'utf8'
  );

  assert.match(rootReadme, /Codespaces' authenticated `GITHUB_TOKEN` is used by\s+`gh`/);
  assert.match(prerequisites, /setup uses the authenticated `GITHUB_TOKEN`/i);
  assert.match(deploymentGuide, /uses the active GitHub CLI credential/i);
  assert.doesNotMatch(rootReadme, /env -u GH_TOKEN -u GITHUB_TOKEN/);
  assert.doesNotMatch(prerequisites, /Remove-Item Env:GH_TOKEN, Env:GITHUB_TOKEN/);
});

test('Cloud Agent Handover deploy helpers publish the current checkout through Azure CLI', () => {
  const bashPath = resolve(
    repositoryRoot,
    'scenarios/cloud-agent-handover/scripts/deploy.sh'
  );
  const powershellPath = resolve(
    repositoryRoot,
    'scenarios/cloud-agent-handover/scripts/deploy.ps1'
  );
  const bashDeploy = readFileSync(bashPath, 'utf8');
  const powershellDeploy = readFileSync(powershellPath, 'utf8');

  assert.notEqual(statSync(bashPath).mode & 0o111, 0);
  assert.match(bashDeploy, /dotnet test/);
  assert.match(bashDeploy, /dotnet publish/);
  assert.match(bashDeploy, /az webapp deploy/);
  assert.match(bashDeploy, /--type zip/);
  assert.match(powershellDeploy, /"dotnet"[\s\S]*"test"/);
  assert.match(powershellDeploy, /"dotnet"[\s\S]*"publish"/);
  assert.match(powershellDeploy, /"webapp", "deploy"/);
  assert.match(powershellDeploy, /"--type", "zip"/);
  for (const script of [bashDeploy, powershellDeploy]) {
    assert.doesNotMatch(
      script,
      /\bgit\s+(?:fetch|pull|checkout|switch|merge|reset)\b/i
    );
  }
});

test('Cloud Agent Handover no longer provisions GitHub deployment credentials', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  const mainBicep = readFileSync(
    resolve(scenarioRoot, 'infra/bicep/main.bicep'),
    'utf8'
  );
  const bashSetup = readFileSync(resolve(scenarioRoot, 'scripts/setup.sh'), 'utf8');
  const powershellSetup = readFileSync(
    resolve(scenarioRoot, 'scripts/setup.ps1'),
    'utf8'
  );

  assert.equal(
    existsSync(resolve(repositoryRoot, '.github/workflows/deploy-appservice-app.yml')),
    false
  );
  assert.equal(
    existsSync(resolve(scenarioRoot, 'infra/bicep/modules/identity.bicep')),
    false
  );
  assert.doesNotMatch(
    mainBicep,
    /githubRepository|deploymentIdentity|deploymentClientId/
  );
  for (const setup of [bashSetup, powershellSetup]) {
    assert.doesNotMatch(
      setup,
      /variable["',\s]+set["',\s]+AZURE_(?:CLIENT|TENANT|SUBSCRIPTION)_ID/i
    );
    assert.match(setup, /AZURE_RESOURCE_GROUP/);
    assert.match(setup, /AZURE_WEBAPP_NAME/);
  }
});

test('Cloud Agent Handover documents operator-controlled local deployment', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  const readme = readFileSync(resolve(scenarioRoot, 'README.md'), 'utf8');
  const handoverGuide = readFileSync(
    resolve(scenarioRoot, 'docs/90-watch-sre-agent.md'),
    'utf8'
  );
  const operationalGuidance = readFileSync(
    resolve(scenarioRoot, 'knowledge/operational-guidelines.md'),
    'utf8'
  );

  for (const document of [readme, handoverGuide, operationalGuidance]) {
    assert.match(document, /local/i);
    assert.match(document, /deploy\.(?:sh|ps1)/i);
    assert.doesNotMatch(
      document,
      /OIDC-based.*Deploy Cloud Agent Handover/is
    );
  }
  assert.match(handoverGuide, /git pull/i);
});

test('Cloud Agent Handover setup removes legacy automatic deployment state', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  const bashSetup = readFileSync(resolve(scenarioRoot, 'scripts/setup.sh'), 'utf8');
  const powershellSetup = readFileSync(
    resolve(scenarioRoot, 'scripts/setup.ps1'),
    'utf8'
  );

  for (const setup of [bashSetup, powershellSetup]) {
    assert.match(setup, /github-deploy/);
    assert.match(setup, /role["',\s]+assignment["',\s]+delete/i);
    assert.match(setup, /identity["',\s]+delete/i);
    assert.match(setup, /variable["',\s]+delete/i);
    assert.match(setup, /AZURE_CLIENT_ID/);
    assert.match(setup, /AZURE_TENANT_ID/);
    assert.match(setup, /AZURE_SUBSCRIPTION_ID/);
  }
});

test('Shared Cloud Agent Handover guidance uses local deployment', () => {
  const connectorGuide = readFileSync(
    resolve(repositoryRoot, 'docs/connect-github-to-sre-agent.md'),
    'utf8'
  );
  const copilotInstructions = readFileSync(
    resolve(repositoryRoot, '.github/copilot-instructions.md'),
    'utf8'
  );

  for (const document of [connectorGuide, copilotInstructions]) {
    assert.match(document, /deploy\.(?:sh|ps1)/i);
    assert.doesNotMatch(document, /Deploy Cloud Agent Handover Application/);
  }
});

test('Cloud Agent Handover documents providers, CodeQL licensing, and recommended region', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  const prerequisites = readFileSync(
    resolve(scenarioRoot, 'docs/00-prerequisites.md'),
    'utf8'
  );
  const deploymentGuide = readFileSync(
    resolve(scenarioRoot, 'docs/01-deploy-infrastructure.md'),
    'utf8'
  );

  for (const provider of [
    'Microsoft.Web',
    'Microsoft.Insights',
    'Microsoft.OperationalInsights',
  ]) {
    assert.match(prerequisites, new RegExp(provider.replace('.', '\\.')));
  }
  assert.match(prerequisites, /public repositories[\s\S]*CodeQL[\s\S]*free/i);
  assert.match(
    prerequisites,
    /private or internal[\s\S]*GitHub Code Security[\s\S]*GitHub Advanced Security/i
  );
  assert.match(prerequisites, /recommend[\s\S]*`swedencentral`/i);
  assert.match(deploymentGuide, /recommended[\s\S]*`swedencentral`/i);
});

test('Cloud Agent Handover documents prescriptive SRE Agent setup', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  const onboardingGuide = readFileSync(
    resolve(scenarioRoot, 'docs/03-onboard-sre-agent.md'),
    'utf8'
  );

  for (const panel of ['Code', 'Logs', 'Azure Resources', 'Incidents']) {
    assert.match(onboardingGuide, new RegExp(`\\*\\*${panel}\\*\\*`));
  }
  assert.match(onboardingGuide, /Complete setup/i);
  assert.match(onboardingGuide, /Azure Monitor/i);
  assert.match(onboardingGuide, /`<workload>-ai`/i);
  assert.match(onboardingGuide, /Logs[\s\S]*skip/i);
  assert.match(onboardingGuide, /Code[\s\S]*green check/i);
  assert.match(onboardingGuide, /Azure Resources[\s\S]*permissions complete/i);
});

test('Cloud Agent Handover documents current governed response-plan flow', () => {
  const responsePlan = readFileSync(
    resolve(
      repositoryRoot,
      'scenarios/cloud-agent-handover/docs/04-configure-incident-response.md'
    ),
    'utf8'
  );

  assert.match(responsePlan, /Azure Monitor[\s\S]*connected/i);
  assert.match(responsePlan, /cloud-agent-handover-investigator/);
  assert.match(responsePlan, /Builder[\s\S]*Agent Canvas/i);
  assert.match(
    responsePlan,
    /Create[\s\S]*Trigger[\s\S]*Incident response plan/i
  );
  assert.match(responsePlan, /Agent autonomy level[\s\S]*Review/i);
  assert.match(responsePlan, /one unassigned GitHub issue/i);
});
