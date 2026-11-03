import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import {
  AzError, DiscoveryError, PlacementError, TAGS, classifyFailure, cleanupAttempt, createAzRunner, evaluateRegion,
  loadPolicy, orderedRegions, persistPlacement, provision, quotaShortfall, skuIneligibility, validatePolicy,
} from '../../placement/placement.mjs';
import { buildParameters, main, runCheck } from '../../placement/provision.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..');
const policyFile = id => resolve(repositoryRoot, 'scenarios', id, 'infra', 'placement.json');

const sku = (name, family, { vcpus = 2, memory = 8, premium = 'True', gens = 'V1,V2', controllers = 'SCSI', restrictedIn } = {}) => ({
  name, family,
  capabilities: [
    { name: 'vCPUs', value: String(vcpus) }, { name: 'MemoryGB', value: String(memory) },
    { name: 'CpuArchitectureType', value: 'x64' }, { name: 'PremiumIO', value: premium },
    { name: 'HyperVGenerations', value: gens }, { name: 'DiskControllerTypes', value: controllers },
  ],
  restrictions: restrictedIn ? [{ type: 'Location', values: [restrictedIn], reasonCode: 'NotAvailableForSubscription' }] : [],
});

const usage = (entries) => Object.entries(entries).map(([family, [current, limit]]) => ({ name: { value: family }, currentValue: current, limit }));

const STANDARD_SKUS = [
  sku('Standard_B2s', 'standardBSFamily', { memory: 4 }),
  sku('Standard_D2s_v5', 'standardDSv5Family'),
  sku('Standard_D2as_v5', 'standardDASv5Family'),
  sku('Standard_D2s_v6', 'standardDSv6Family', { gens: 'V2', controllers: 'SCSI,NVMe' }),
  sku('Standard_D2s_v4', 'standardDSv4Family'),
  sku('Standard_DS1_v2', 'standardDSv2Family', { vcpus: 1, memory: 3.5 }),
  sku('Standard_DS2_v2', 'standardDSv2Family', { memory: 7 }),
];
const PLENTY = usage({
  cores: [0, 100], standardBSFamily: [0, 20], standardDSv5Family: [0, 20], standardDASv5Family: [0, 20],
  standardDSv6Family: [0, 20], standardDSv4Family: [0, 20], standardDSv2Family: [0, 20],
});
const PROVIDER = { registrationState: 'Registered', resourceTypes: [
  { resourceType: 'virtualMachines', locations: ['East US 2', 'Sweden Central', 'Australia East'] },
  { resourceType: 'bastionHosts', locations: ['East US 2', 'Sweden Central', 'Australia East'] },
  { resourceType: 'workspaces', locations: ['East US 2', 'Sweden Central', 'Australia East'] },
] };

// In-memory Azure: records every call; regions can override SKUs/usage.
function fakeAzure({ regions = {}, groups = {}, deployFailures = [], vms = {}, failOn, deleteLeavesGroup = false, now = () => new Date().toISOString() } = {}) {
  const calls = [];
  const state = { groups: structuredClone(groups), resources: {} };
  const az = async (args) => {
    calls.push(args);
    const command = args.join(' ');
    const value = flag => args[args.indexOf(flag) + 1];
    if (failOn && command.includes(failOn)) throw new AzError(args, 1, 'ERROR: (AuthorizationFailed) simulated discovery failure');
    if (command.startsWith('group exists')) return Boolean(state.groups[value('--name')]);
    if (command.startsWith('group show')) return state.groups[value('--name')];
    if (command.startsWith('group create')) {
      const tags = Object.fromEntries(args.slice(args.indexOf('--tags') + 1, args.indexOf('--output')).map(pair => pair.split('=')));
      state.groups[value('--name')] = { location: value('--location'), tags };
      return state.groups[value('--name')];
    }
    if (command.startsWith('group delete')) {
      if (!deleteLeavesGroup) delete state.groups[value('--name')];
      return null;
    }
    if (command.startsWith('resource list')) return state.resources[value('--resource-group')] ?? [];
    if (command.startsWith('provider show')) return PROVIDER;
    if (command.startsWith('vm list-skus')) return regions[value('--location')]?.skus ?? STANDARD_SKUS;
    if (command.startsWith('vm list-usage')) return regions[value('--location')]?.usage ?? PLENTY;
    if (command.startsWith('vm list ')) return vms[value('--resource-group')] ?? [];
    if (command.startsWith('aks list')) return [];
    throw new Error(`Unexpected az call: ${command}`);
  };
  const deploy = async ({ location, sku: size }) => {
    const failure = deployFailures.shift();
    const group = Object.keys(state.groups).at(-1);
    state.resources[group] = [{ id: `/rg/${group}/vm01`, createdTime: now() }];
    if (failure) throw new AzError(['deployment'], 1, failure);
    return { placed: `${location}/${size}` };
  };
  return { az, deploy, calls, state };
}

const silent = () => {};

test('every scenario has a valid, bounded placement policy whose parameters exist in its template', async () => {
  const scenarios = readdirSync(resolve(repositoryRoot, 'scenarios'), { withFileTypes: true }).filter(entry => entry.isDirectory());
  assert.ok(scenarios.length >= 9);
  for (const entry of scenarios) {
    const policy = await loadPolicy(policyFile(entry.name));
    assert.equal(policy.scenario, entry.name);
    const template = readFileSync(resolve(policy.capsule, policy.deployment.template), 'utf8');
    for (const name of Object.keys(policy.deployment.parameters)) {
      assert.match(template, new RegExp(`^param ${name} `, 'm'), `${entry.name}: ${name} is not a template parameter`);
    }
  }
});

test('policies preserve the approved region order and family-first SKU order', async () => {
  for (const id of ['cpu-runaway', 'iis-app-pool', 'vm-size-retirement']) {
    const policy = await loadPolicy(policyFile(id));
    assert.deepEqual(policy.regions, ['eastus2', 'swedencentral', 'australiaeast']);
    assert.equal(policy.compute.skus[0], 'Standard_B2s');
    assert.ok(policy.compute.skus.slice(1).every(name => /^Standard_D2a?s_v[4-7]$/.test(name)), `${id}: B2s needs newer D-series fallbacks`);
  }
  const arc = await loadPolicy(policyFile('arc-disk-pressure'));
  assert.equal(arc.compute.skus[0], 'Standard_D2s_v7');
  assert.equal(arc.compute.count, 1);
  const latency = await loadPolicy(policyFile('appservice-latency-context'));
  assert.equal(latency.regions[0], 'westeurope');
  const retirement = await loadPolicy(policyFile('vm-size-retirement'));
  assert.deepEqual(retirement.fixedFleet.map(entry => entry.sku), ['Standard_DS1_v2', 'Standard_DS2_v2']);
  assert.ok(retirement.remediationTargets.every(name => !/_v2$/.test(name)), 'remediation targets must be modern sizes');
  assert.match(retirement.fleetUnavailableDiagnostic, /UNSUPPORTED SUBSCRIPTION/);
  assert.match(retirement.fleetUnavailableDiagnostic, /never substitutes/);
});

test('validatePolicy rejects unbounded or incomplete policies', () => {
  assert.throws(() => validatePolicy({ scenario: 'x', regions: [], deployment: { template: 't' } }), /bounded/);
  assert.throws(() => validatePolicy({ scenario: 'x', regions: ['a', 'A'], deployment: { template: 't' } }), /unique/);
  assert.throws(() => validatePolicy({ scenario: 'x', regions: ['a'], compute: { kind: 'vm', count: 1, skus: ['s'] },
    deployment: { template: 't', parameters: {} } }), /\{sku\}/);
});

test('classifyFailure retries only availability failures', () => {
  assert.equal(classifyFailure('Code: SkuNotAvailable The requested VM size'), 'sku');
  assert.equal(classifyFailure('(QuotaExceeded) Operation could not be completed'), 'sku');
  assert.equal(classifyFailure('AllocationFailed', { hasSkuFallback: false }), 'region');
  assert.equal(classifyFailure('(K8sVersionNotSupported) Version 1.34 is not supported in this region'), 'region');
  assert.equal(classifyFailure('(LocationNotAvailableForResourceType) The provided location'), 'region');
  assert.equal(classifyFailure('(NoRegisteredProviderFound) No registered resource provider found for API version'), 'fatal');
  assert.equal(classifyFailure('(AuthorizationFailed) does not have authorization'), 'fatal');
  assert.equal(classifyFailure('InvalidTemplate: something is wrong'), 'fatal');
});

test('skuIneligibility honours subscription restrictions and template capabilities', () => {
  const requires = { vCPUs: 2, architecture: 'x64', premiumIO: true, hyperVGeneration: 'V2', diskController: 'SCSI' };
  assert.equal(skuIneligibility(sku('Standard_D2s_v5', 'f'), 'eastus2', requires), null);
  assert.match(skuIneligibility(sku('Standard_D2s_v5', 'f', { restrictedIn: 'eastus2' }), 'East US 2', requires), /restricted/);
  assert.match(skuIneligibility(sku('n', 'f', { controllers: 'NVMe' }), 'eastus2', requires), /disk controller/);
  assert.match(skuIneligibility(sku('n', 'f', { gens: 'V1' }), 'eastus2', requires), /generation V2/);
  assert.match(skuIneligibility(sku('n', 'f', { premium: 'False' }), 'eastus2', requires), /Premium/);
  assert.match(skuIneligibility(sku('n', 'f', { vcpus: 4 }), 'eastus2', requires), /vCPUs/);
  assert.match(skuIneligibility(undefined, 'eastus2', requires), /not offered/);
});

test('quotaShortfall checks family and regional totals and treats missing families as unavailable', () => {
  const quota = usage({ cores: [8, 10], standardBSFamily: [0, 10] });
  assert.equal(quotaShortfall(quota, [{ family: 'standardBSFamily', vcpus: 2 }]), null);
  assert.match(quotaShortfall(quota, [{ family: 'standardBSFamily', vcpus: 4 }]), /total regional vCPU quota has 2 free, 4 required/);
  assert.match(quotaShortfall(quota, [{ family: 'standardDSv5Family', vcpus: 2 }]), /no vCPU quota is visible/);
});

test('orderedRegions puts a supported preference first and rejects unsupported regions', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  assert.deepEqual(orderedRegions(policy, 'Australia East'), ['australiaeast', 'eastus2', 'swedencentral']);
  assert.deepEqual(orderedRegions(policy, 'swedencentral', { noFallback: true }), ['swedencentral']);
  assert.throws(() => orderedRegions(policy, 'westus'), /not supported/);
});

test('provision tries families before regions and cleans up each failed attempt', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ deployFailures: ['(SkuNotAvailable) Standard_B2s is currently not available'] });
  const result = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent, attemptId: 'a1' });
  assert.equal(result.location, 'eastus2');
  assert.equal(result.sku, 'Standard_D2s_v5');
  assert.equal(result.mode, 'new');
  assert.equal(fake.calls.filter(args => args[0] === 'group' && args[1] === 'delete').length, 1);
  assert.equal(fake.state.groups['rg-test'].tags[TAGS.sku], 'Standard_D2s_v5');
  assert.equal(fake.state.groups['rg-test'].tags[TAGS.attempt], 'a1');
});

test('provision skips preflight-ineligible SKUs and moves to the next region on region-level failures', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({
    regions: { eastus2: { skus: STANDARD_SKUS.map(item => item.name === 'Standard_B2s' ? sku('Standard_B2s', 'standardBSFamily', { restrictedIn: 'eastus2' }) : item) } },
    deployFailures: ['(LocationIsOfflineForProvisioning) region is offline'],
  });
  const result = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent });
  assert.equal(result.location, 'swedencentral');
  assert.equal(result.sku, 'Standard_B2s');
  assert.ok(result.attempts.some(item => item.region === 'eastus2' && item.sku === 'Standard_B2s' && /restricted/.test(item.reason)));
});

test('provision stops on a non-retryable failure after cleaning up only its own attempt', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ deployFailures: ['(InvalidTemplateDeployment) bad password'] });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }),
    error => error instanceof PlacementError && /non-retryable/.test(error.message));
  assert.equal(fake.state.groups['rg-test'], undefined);
});

test('cleanup refuses to delete a group containing resources that predate the attempt', async () => {
  const fake = fakeAzure({ groups: { 'rg-test': { location: 'eastus2', tags: { [TAGS.attempt]: 'a1' } } } });
  fake.state.resources['rg-test'] = [{ id: '/old/vm', createdTime: '2020-01-01T00:00:00Z' }];
  await assert.rejects(cleanupAttempt({ az: fake.az, resourceGroup: 'rg-test', attemptId: 'a1', startedAt: '2025-01-01T00:00:00Z', log: silent }),
    /cannot be proven to belong/);
  assert.ok(!fake.calls.some(args => args[1] === 'delete'));
  fake.state.resources['rg-test'] = [{ id: '/new/vm' }];
  await assert.rejects(cleanupAttempt({ az: fake.az, resourceGroup: 'rg-test', attemptId: 'a1', startedAt: '2025-01-01T00:00:00Z', log: silent }),
    /cannot be proven/);
  await assert.rejects(cleanupAttempt({ az: fake.az, resourceGroup: 'rg-test', attemptId: 'other', startedAt: '2025-01-01T00:00:00Z', log: silent }),
    /not verifiably owned/);
  assert.ok(!fake.calls.some(args => args[1] === 'delete'));
});

test('provision stops when cleanup cannot be verified', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ deployFailures: ['(SkuNotAvailable) nope'], deleteLeavesGroup: true });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }),
    /Cleanup could not be verified/);
  assert.equal(fake.calls.filter(args => args[0] === 'group' && args[1] === 'create').length, 1);
});

test('discovery failures are reported, never treated as empty availability', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ failOn: 'vm list-skus' });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }), DiscoveryError);
  assert.ok(!fake.calls.some(args => args[0] === 'group' && args[1] === 'create'));
});

test('existing deployments stay pinned to their recorded workload placement and are never relocated', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const groups = { 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: 'cpu-runaway', [TAGS.location]: 'swedencentral', [TAGS.sku]: 'Standard_D2s_v5' } } };
  const vms = { 'rg-test': [{ size: 'Standard_D2s_v5', location: 'swedencentral' }, { size: 'Standard_D2s_v5', location: 'swedencentral' }] };
  const fake = fakeAzure({ groups, vms });
  const result = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent });
  assert.equal(result.mode, 'pinned');
  assert.equal(result.location, 'swedencentral');
  assert.equal(result.sku, 'Standard_D2s_v5');
  assert.ok(!fake.calls.some(args => args[1] === 'create' || args[1] === 'delete'));
  await assert.rejects(provision({ policy, az: fakeAzure({ groups, vms }).az, deploy: fake.deploy, resourceGroup: 'rg-test', location: 'eastus2', log: silent }),
    /never relocated/);
  const mismatched = fakeAzure({ groups, vms: { 'rg-test': [{ size: 'Standard_D2s_v5', location: 'australiaeast' }] } });
  await assert.rejects(provision({ policy, az: mismatched.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }), /records placement/);
  const foreign = fakeAzure({ groups: { 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: 'iis-app-pool' } } } });
  await assert.rejects(provision({ policy, az: foreign.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }), /belongs to scenario/);
});

test('pinned reruns keep ownership tags for template-created resource groups', async () => {
  const policy = await loadPolicy(policyFile('azure-boards-copilot-handover'));
  const tags = { [TAGS.scenario]: policy.scenario, [TAGS.attempt]: 'a1', [TAGS.location]: 'swedencentral', workshop: 'sre-agent' };
  const fake = fakeAzure({ groups: { 'w-rg': { location: 'swedencentral', tags } } });
  let seen;
  await provision({ policy, az: fake.az, resourceGroup: 'w-rg', log: silent, deploy: async (input) => { seen = input; return {}; } });
  const parameters = buildParameters(policy, { ...seen, workload: 'w' });
  assert.equal(parameters.tags[TAGS.attempt], 'a1');
  assert.equal(parameters.tags.scenario, policy.scenario);
});

test('reruns do not count already-deployed fleet or compute against quota', async () => {
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const tight = usage({ cores: [10, 12], standardBSFamily: [4, 4], standardDSv2Family: [4, 4], standardDSv5Family: [0, 2], standardDASv5Family: [0, 2], standardDSv4Family: [0, 2] });
  const groups = { 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario, [TAGS.location]: 'eastus2' } } };
  const vms = { 'rg-test': [
    { size: 'Standard_B2s', location: 'eastus2' }, { size: 'Standard_B2s', location: 'eastus2' },
    { size: 'Standard_DS1_v2', location: 'eastus2' }, { size: 'Standard_DS1_v2', location: 'eastus2' }, { size: 'Standard_DS2_v2', location: 'eastus2' },
  ] };
  const fake = fakeAzure({ groups, vms, regions: { eastus2: { usage: tight } } });
  const report = await runCheck({ policy, az: fake.az, options: { workload: 'test', resourceGroup: 'rg-test', parts: { services: false, compute: false, fleet: true, targets: true } }, log: silent });
  assert.equal(report.pinnedLocation, 'eastus2');
  assert.equal(report.eligible, true, JSON.stringify(report.regions));
});

test('the retirement exercise fails early with the unsupported-subscription diagnostic when DSv2 is unavailable everywhere', async () => {
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const noDsv2 = usage({ cores: [0, 100], standardBSFamily: [0, 20], standardDSv5Family: [0, 20], standardDASv5Family: [0, 20], standardDSv4Family: [0, 20], standardDSv2Family: [0, 0] });
  const fake = fakeAzure({ regions: Object.fromEntries(policy.regions.map(region => [region, { usage: noDsv2 }])) });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }),
    error => error instanceof PlacementError && /UNSUPPORTED SUBSCRIPTION/.test(error.diagnostic));
  assert.ok(!fake.calls.some(args => args[1] === 'create'));
  const evaluation = await evaluateRegion(policy, 'eastus2', fake.az);
  assert.equal(evaluation.fleetUnavailable, true);
});

test('the retirement placement records an eligible modern remediation target in the same region', async () => {
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const fake = fakeAzure({ regions: { eastus2: { skus: STANDARD_SKUS.map(item => item.name === 'Standard_D2s_v5' ? sku('Standard_D2s_v5', 'standardDSv5Family', { restrictedIn: 'eastus2' }) : item) } } });
  const result = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent });
  assert.equal(result.location, 'eastus2');
  assert.equal(result.context.remediationTarget, 'Standard_D2as_v5');
  assert.equal(fake.state.groups['rg-test'].tags[TAGS.remediationTarget], 'Standard_D2as_v5');
});

test('AKS placement selects a regional GA Kubernetes version and reserves surge capacity', async () => {
  const policy = await loadPolicy(policyFile('cosmos-rbac-removal'));
  const base = fakeAzure({ regions: { eastus2: {
    skus: [sku('Standard_D2ads_v6', 'standardDADSv6Family'), sku('Standard_D2s_v5', 'standardDSv5Family')],
    usage: usage({ cores: [0, 100], standardDADSv6Family: [0, 4], standardDSv5Family: [0, 6] }),
  } } });
  const az = async (args) => {
    const command = args.join(' ');
    if (command.startsWith('aks get-versions')) return { values: [{ version: '1.34', isPreview: true }, { version: '1.33', isPreview: false }] };
    if (command.startsWith('cosmosdb locations list')) return [{ name: 'East US 2', properties: { isSubscriptionRegionAccessAllowedForRegular: true } }];
    if (command.startsWith('provider show')) return { registrationState: 'Registered', resourceTypes: [
      { resourceType: 'managedClusters', locations: ['East US 2'] }, { resourceType: 'databaseAccounts', locations: [] },
      { resourceType: 'workspaces', locations: [] }, { resourceType: 'dataCollectionRules', locations: [] }] };
    return base.az(args);
  };
  const evaluation = await evaluateRegion(policy, 'eastus2', az);
  assert.equal(evaluation.context.kubernetesVersion, '1.33');
  assert.deepEqual(evaluation.candidates.map(item => item.sku), ['Standard_D2s_v5']);
  assert.match(evaluation.rejected.find(item => item.sku === 'Standard_D2ads_v6').reason, /4 free, 6 required/);
  const parameters = buildParameters(policy, { location: 'eastus2', sku: 'Standard_D2s_v5', context: evaluation.context, workload: 'w' });
  assert.deepEqual(parameters, { location: 'eastus2', workloadName: 'w', systemNodeVmSize: 'Standard_D2s_v5', kubernetesVersion: '1.33' });
});

test('policy-managed parameters cannot be overridden from the command line', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const input = { location: 'eastus2', sku: 'Standard_B2s', workload: 'w' };
  assert.equal(buildParameters(policy, { ...input, params: { adminUsername: 'ops' } }).adminUsername, 'ops');
  for (const name of ['location', 'vmSize', 'workloadName']) {
    assert.throws(() => buildParameters(policy, { ...input, params: { [name]: 'x' } }), /selected by the placement policy/);
  }
});

test('persistPlacement records the actual placement and propagates it to GitHub outputs', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'placement-'));
  const githubOutput = join(directory, 'out');
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const file = await persistPlacement({ mode: 'new', resourceGroup: 'rg', location: 'swedencentral', sku: 'Standard_D2s_v5', context: { remediationTarget: 'Standard_D2as_v5' } },
    policy, { directory, githubOutput });
  const record = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(record.location, 'swedencentral');
  assert.equal(record.remediationTarget, 'Standard_D2as_v5');
  assert.match(readFileSync(githubOutput, 'utf8'), /^location=swedencentral$/m);
  assert.match(readFileSync(githubOutput, 'utf8'), /^remediation_target=Standard_D2as_v5$/m);
});

test('the CLI rejects unknown scenarios and options without calling Azure', async () => {
  let created = false;
  const azFactory = () => { created = true; return async () => { throw new Error('no azure'); }; };
  const errors = [];
  const originalError = console.error;
  console.error = message => errors.push(message);
  try {
    assert.equal(await main(['deploy', 'cpu-runaway', '--bogus'], { azFactory, log: silent }), 2);
    assert.equal(await main(['deploy', '../etc'], { azFactory, log: silent }), 2);
    assert.equal(await main(['deploy', 'cpu-runaway', '--param', 'location=westus'], { azFactory, log: silent, env: {} }), 1);
  } finally {
    console.error = originalError;
  }
  assert.ok(errors.some(message => /Unknown option/.test(message)));
});

test('the real az runner fails explicitly on malformed JSON output', { skip: process.platform === 'win32' }, async () => {
  const bin = mkdtempSync(join(tmpdir(), 'fake-az-'));
  writeFileSync(join(bin, 'az'), '#!/bin/sh\necho "not json"\n');
  chmodSync(join(bin, 'az'), 0o755);
  const az = createAzRunner({ env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  await assert.rejects(az(['vm', 'list-skus', '--output', 'json']), /expected JSON output/);
  assert.ok(existsSync(join(bin, 'az')));
});
