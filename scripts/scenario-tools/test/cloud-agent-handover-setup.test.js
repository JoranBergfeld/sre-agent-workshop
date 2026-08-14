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
    assert.doesNotMatch(setup, /AZURE_CLIENT_ID|AZURE_TENANT_ID/);
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
