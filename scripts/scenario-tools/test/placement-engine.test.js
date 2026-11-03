import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import {
  AzError, DiscoveryError, PlacementError, TAGS, assessFailedAttempt, boundedDeploymentName, classifyFailure, createAzRunner, evaluateRegion,
  inspectExisting, loadPolicy, orderedRegions, persistPlacement, preferredSkus, provision, quotaShortfall,
  reconcilePinnedRegion, remediationDemands, resumableRemediationTarget, skuIneligibility, validatePolicy, verifyRemediationTarget,
} from '../../placement/placement.mjs';
import { buildParameters, main, resolveNames, runCheck } from '../../placement/provision.mjs';

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
  ...['sites', 'serverFarms', 'namespaces', 'storageAccounts', 'components', 'managedClusters', 'databaseAccounts', 'dataCollectionRules']
    .map(resourceType => ({ resourceType, locations: [] })),
] };
const IDENTITY = 'deployer@example.com';
const REGION_NAMES = [{ name: 'East US 2' }, { name: 'Sweden Central' }, { name: 'Australia East' }, { name: 'West Europe' }];

// Representative `az aks get-versions` responses.
const AKS_VERSIONS = { values: [
  { version: '1.33', isPreview: false, capabilities: { supportPlan: ['AKSLongTermSupport'] } },
  { version: '1.34', isPreview: false, capabilities: { supportPlan: ['KubernetesOfficial', 'AKSLongTermSupport'] } },
  { version: '1.35', isPreview: false, isDefault: true, capabilities: { supportPlan: ['KubernetesOfficial'] } },
  { version: '1.36', isPreview: false, capabilities: { supportPlan: ['KubernetesOfficial'] } },
  { version: '1.37', isPreview: true, capabilities: { supportPlan: ['KubernetesOfficial'] } },
] };

const linuxStack = (name, runtimeVersion, extra = {}) => ({ name, properties: { majorVersions: [{ minorVersions: [
  { stackSettings: { linuxRuntimeSettings: { runtimeVersion, ...extra } } }] }] } });
const WEB_STACKS = { value: [linuxStack('dotnet', 'DOTNETCORE|10.0'), linuxStack('php', 'PHP|8.3')] };
const FUNCTION_STACKS = { value: [linuxStack('python', 'Python|3.12', { supportedFunctionsExtensionVersions: ['~4'] })] };

const rid = (group, type, name) => `/subscriptions/sub/resourceGroups/${group}/providers/${type}/${name}`;

// In-memory Azure: records every call; regions can override SKUs/usage.
// resources[group] = [{ id, type, location, systemData }]; operations are
// recorded per deployment name so cleanup can trace attempt-created resources.
function fakeAzure({
  regions = {}, groups, scenario = 'cpu-runaway', resources = {}, deployFailures = [], vms = {}, clusters = {}, failOn, deleteFails = false,
  identity = IDENTITY, resourceGroup = 'rg-test', concurrentContents, concurrentTags, concurrentGroup, linuxConsumptionRegions, appearsOnRecheck = false, aksVersions = AKS_VERSIONS, onDeploy, validateFailures = [],
  now = () => new Date().toISOString(),
} = {}) {
  const calls = [];
  const deployments = [];
  // By default the operator has created and designated an empty target group.
  const initialGroups = groups ?? { [resourceGroup]: { location: 'eastus2', tags: { [TAGS.scenario]: scenario } } };
  const state = { groups: structuredClone(initialGroups), resources: structuredClone(resources), operations: {}, records: {} };
  const findResource = id => Object.values(state.resources).flat().find(item => item.id.toLowerCase() === String(id).toLowerCase());
  const az = async (args) => {
    calls.push(args);
    const command = args.join(' ');
    const value = flag => args[args.indexOf(flag) + 1];
    if (failOn && command.includes(failOn)) throw new AzError(args, 1, 'ERROR: (AuthorizationFailed) simulated discovery failure');
    if (command.startsWith('group exists')) {
      state.existsCalls = (state.existsCalls ?? 0) + 1;
      if (appearsOnRecheck && state.existsCalls === 2) state.groups[value('--name')] = { location: 'eastus2', tags: {} };
      return Boolean(state.groups[value('--name')]);
    }
    if (command.startsWith('group show')) return state.groups[value('--name')];
    if (command.startsWith('group create')) {
      state.groupCreates = (state.groupCreates ?? 0) + 1;
      const name = value('--name');
      if (concurrentGroup && !state.groups[name]) state.groups[name] = structuredClone(concurrentGroup);
      const tags = Object.fromEntries(args.slice(args.indexOf('--tags') + 1, args.indexOf('--output')).map(pair => pair.split('=')));
      state.groups[name] = { location: state.groups[name]?.location ?? value('--location'), tags };
      if (concurrentContents) state.resources[name] = [...(state.resources[name] ?? []), ...concurrentContents];
      const response = structuredClone(state.groups[name]);
      // Another writer's upsert lands right after ours.
      if (concurrentTags) state.groups[name].tags = concurrentTags;
      return response;
    }
    if (command.startsWith('group update')) {
      const group = state.groups[value('--name')];
      for (const pair of args.slice(args.indexOf('--set') + 1, args.indexOf('--output'))) {
        const [key, ...rest] = pair.replace(/^tags\./, '').split('=');
        group.tags = { ...group.tags, [key]: rest.join('=') };
      }
      return group;
    }
    if (command.startsWith('group delete')) throw new Error('resource groups must never be deleted');
    if (command.startsWith('resource list')) {
      return (state.resources[value('--resource-group')] ?? []).map(({ id, type, location, tags }) => ({ id, type, location, tags }));
    }
    if (command.startsWith('resource show')) {
      const found = findResource(value('--ids'));
      if (!found) throw new AzError(args, 3, '(ResourceNotFound) not found');
      return found;
    }
    if (command.startsWith('resource delete')) {
      if (!deleteFails) for (const [group, list] of Object.entries(state.resources)) state.resources[group] = list.filter(item => item.id !== value('--ids'));
      return null;
    }
    if (command.startsWith('account show')) return { name: identity, type: 'user' };
    if (command.startsWith('deployment group validate')) {
      const failure = validateFailures.shift();
      if (failure) throw new AzError(args, 1, failure);
      return { properties: { provisioningState: 'Succeeded' } };
    }
    if (command.startsWith('deployment group create')) {
      state.records[`${value('--resource-group')}/${value('--name')}`] = { properties: { provisioningState: 'Succeeded', outputs: {} } };
      return {};
    }
    if (command.startsWith('deployment group show') || command.startsWith('deployment sub show')) {
      const key = command.startsWith('deployment sub') ? `sub/${value('--name')}` : `${value('--resource-group')}/${value('--name')}`;
      if (!state.records[key]) throw new AzError(args, 3, `(DeploymentNotFound) Deployment '${value('--name')}' could not be found.`);
      return state.records[key];
    }
    if (command.startsWith('deployment operation group list')) return state.operations[`${value('--resource-group')}/${value('--name')}`] ?? [];
    if (command.startsWith('deployment operation sub list')) return state.operations[`sub/${value('--name')}`] ?? [];
    if (command.startsWith('provider show')) return PROVIDER;
    if (command.startsWith('functionapp list-consumption-locations') || command.startsWith('appservice list-locations')) return REGION_NAMES;
    if (command.startsWith('cosmosdb locations list')) return REGION_NAMES;
    if (command.startsWith('aks get-versions')) return aksVersions;
    if (command.startsWith('rest --method get')) {
      const url = value('--url');
      const region = /locations\/([^/]+)\//.exec(url)?.[1];
      const stacks = regions[region]?.stacks;
      if (url.includes('/geoRegions')) {
        // Dynamic (Y1) regions; Linux workers only when explicitly requested.
        const all = ['East US 2', 'Sweden Central', 'Australia East', 'West Europe'];
        const names = /linuxDynamicWorkersEnabled=true/.test(url) ? (linuxConsumptionRegions ?? all) : all;
        return { value: names.map(name => ({ id: `/geo/${name}`, name, properties: { name, displayName: name } })) };
      }
      if (url.includes('/functionAppStacks')) return stacks?.functions ?? FUNCTION_STACKS;
      if (url.includes('/webAppStacks')) return stacks?.web ?? WEB_STACKS;
    }
    if (command.startsWith('vm list-skus')) return regions[value('--location')]?.skus ?? STANDARD_SKUS;
    if (command.startsWith('vm list-usage')) return regions[value('--location')]?.usage ?? PLENTY;
    if (command.startsWith('vm list ')) {
      if (vms[value('--resource-group')] === 'malformed') return null;
      // Unnamed fixture VMs: the first two non-DSv2 VMs are the baseline; the rest are the (possibly migrated) legacy fleet.
      let base = 0, legacy = 0;
      // Without explicit VMs, list the VMs earlier fake deployments created.
      const deployed = (state.resources[value('--resource-group')] ?? []).filter(item => item.fakeVm).map(item => item.fakeVm);
      return (vms[value('--resource-group')] ?? deployed).map(vm => 'name' in vm ? vm : { ...vm,
        name: !/^Standard_DS\d_v2$/i.test(vm.size) && base < 2 ? `test-vm0${++base}` : `test-legacy-0${++legacy}` });
    }
    if (command.startsWith('aks list')) return clusters[value('--resource-group')] === 'malformed' ? null : clusters[value('--resource-group')] ?? [];
    throw new Error(`Unexpected az call: ${command}`);
  };
  // One deployment attempt. A string failure fails during validation (only a
  // subscription-scope template has created its group); an object failure
  // { message, leavesResources: true } fails after creating a resource.
  const deploy = async (input) => {
    deployments.push(input);
    const { location, sku: size, deploymentName = 'deployment', context = {}, tags = {} } = input;
    const subscriptionScope = Object.hasOwn(context, 'resourceGroupLocation');
    if (!state.groups[resourceGroup]) state.groups[resourceGroup] = { location: context.resourceGroupLocation ?? location, tags };
    const failure = deployFailures.shift();
    // A string failure is a rejection from ARM's validate API (never writes).
    if (typeof failure === 'string') throw Object.assign(new AzError(['deployment', 'validate'], 1, failure), { validationOnly: true });
    // Object failures create a deployment record. Options: deploymentState
    // (default Failed), nestedState, operations (overrides), noResources.
    const record = provisioningState => ({ properties: { provisioningState } });
    const topKey = subscriptionScope ? `sub/${deploymentName}` : `${resourceGroup}/${deploymentName}`;
    const id = rid(resourceGroup, 'Microsoft.Compute/virtualMachines', `vm-${deploymentName}`);
    if (!failure?.noResources) {
      state.resources[resourceGroup] = [...(state.resources[resourceGroup] ?? []),
        { id, type: 'Microsoft.Compute/virtualMachines', location, systemData: { createdAt: now(), createdBy: identity },
          fakeVm: { name: `test-vm0${(state.resources[resourceGroup] ?? []).filter(item => item.fakeVm).length + 1}`, size: size ?? 'Standard_B2s', location } }];
    }
    const operation = { properties: { provisioningOperation: 'Create', provisioningState: failure ? 'Failed' : 'Succeeded', timestamp: now(),
      targetResource: { id, resourceType: 'Microsoft.Compute/virtualMachines' } } };
    const topState = failure ? (failure.deploymentState ?? 'Failed') : 'Succeeded';
    if (!failure?.noRecord) state.records[topKey] = record(topState);
    if (subscriptionScope) {
      state.operations[topKey] = [
        { properties: { provisioningOperation: 'Create', provisioningState: topState, targetResource: { id: rid(resourceGroup, 'Microsoft.Resources/deployments', 'monitoring'), resourceType: 'Microsoft.Resources/deployments', resourceName: 'monitoring' } } },
      ];
      state.records[`${resourceGroup}/monitoring`] = record(failure?.nestedState ?? topState);
      state.operations[`${resourceGroup}/monitoring`] = failure?.operations ?? [operation];
    } else {
      state.operations[topKey] = failure?.operations ?? [operation];
    }
    onDeploy?.(state, input);
    if (failure) throw new AzError(['deployment'], 1, failure.message);
    return { placed: `${location}/${size}` };
  };
  return { az, deploy, calls, state, deployments };
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
  assert.throws(() => validatePolicy({ scenario: 'x', regions: ['a'], compute: { kind: 'vm', count: 1, skus: ['s'], baselineNames: ['{workload}-vm01'] },
    deployment: { template: 't', parameters: {} } }), /\{sku\}/);
  assert.throws(() => validatePolicy({ scenario: 'x', regions: ['a'], compute: { kind: 'vm', count: 1, skus: ['s'] },
    deployment: { template: 't', parameters: { vmSize: '{sku}' } } }), /baselineNames/);
  for (const names of [['vm01'], ['{workload}-{workload}'], ['{tenant}-vm01'], ['{workload}-vm01', '{workload}-vm02']]) {
    assert.throws(() => validatePolicy({ scenario: 'x', regions: ['a'], compute: { kind: 'vm', count: 1, skus: ['s'], baselineNames: names },
      deployment: { template: 't', parameters: { vmSize: '{sku}' } } }), /baselineNames|exactly one/, names.join());
  }
  assert.throws(() => validatePolicy({ scenario: 'x', regions: ['a'], compute: { kind: 'aks', count: 2, skus: ['s'], requires: { vCPUs: 4, minMemoryGB: 4 } },
    deployment: { template: 't', parameters: { vmSize: '{sku}' } } }), /clusterName/);
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

test('discovery data that is missing or malformed is rejected, never treated as eligible', () => {
  const requires = { vCPUs: 4, minMemoryGB: 4, architecture: 'x64', hyperVGeneration: 'V2' };
  const without = (name, drop) => { const item = sku('Standard_D4s_v5', 'f', { vcpus: 4 }); item.capabilities = item.capabilities.filter(cap => cap.name !== drop); return item; };
  const withValue = (name, value) => { const item = sku('Standard_D4s_v5', 'f', { vcpus: 4 }); item.capabilities.find(cap => cap.name === name).value = value; return item; };
  assert.equal(skuIneligibility(sku('Standard_D4s_v5', 'f', { vcpus: 4 }), 'eastus2', requires), null);
  assert.match(skuIneligibility(without('x', 'MemoryGB'), 'eastus2', requires), /memory/i);
  assert.match(skuIneligibility(withValue('MemoryGB', 'n/a'), 'eastus2', requires), /memory/i);
  assert.match(skuIneligibility(withValue('vCPUs', ''), 'eastus2', requires), /vCPU/);
  assert.match(skuIneligibility(without('x', 'CpuArchitectureType'), 'eastus2', requires), /architecture/i);
  assert.match(skuIneligibility(without('x', 'HyperVGenerations'), 'eastus2', requires), /generation/i);
  const quota = family => [{ name: { value: 'cores' }, currentValue: 0, limit: 100 }, { name: { value: 'f' }, ...family }];
  assert.equal(quotaShortfall(quota({ currentValue: 0, limit: 8 }), [{ family: 'f', vcpus: 4 }]), null);
  assert.match(quotaShortfall(quota({ currentValue: 0 }), [{ family: 'f', vcpus: 4 }]), /missing or malformed/);
  assert.match(quotaShortfall(quota({ currentValue: 'x', limit: 8 }), [{ family: 'f', vcpus: 4 }]), /missing or malformed/);
  assert.match(quotaShortfall(quota({ currentValue: '', limit: 8 }), [{ family: 'f', vcpus: 4 }]), /missing or malformed/);
  assert.match(quotaShortfall(quota({ currentValue: 0, limit: null }), [{ family: 'f', vcpus: 4 }]), /missing or malformed/);
  assert.match(quotaShortfall(quota({ currentValue: 0, limit: 8 }), [{ family: 'f', vcpus: NaN }]), /not a valid number/);
});

test('runtime stacks must be offered, GA and supported by the Functions host in the region', async () => {
  const cloud = await loadPolicy(policyFile('cloud-agent-handover'));
  const boards = await loadPolicy(policyFile('azure-boards-copilot-handover'));
  const latency = await loadPolicy(policyFile('appservice-latency-context'));
  assert.ok(cloud.regionChecks.some(check => check.type === 'runtimeStack' && check.runtimeVersion === 'DOTNETCORE|10.0'));
  assert.ok(latency.regionChecks.some(check => check.type === 'runtimeStack' && check.runtimeVersion === 'PHP|8.3'));
  assert.ok(boards.regionChecks.some(check => check.type === 'runtimeStack' && check.runtimeVersion === 'Python|3.12' && check.functionsExtensionVersion === '~4'));
  const evaluate = async (policy, stacks) => {
    const fake = fakeAzure({ regions: { eastus2: { stacks } } });
    return { fake, result: await evaluateRegion(policy, 'eastus2', fake.az) };
  };
  const ok = await evaluate(cloud, {});
  assert.deepEqual(ok.result.issues, []);
  assert.ok(ok.fake.calls.some(args => args[0] === 'rest' && /locations\/eastus2\/webAppStacks\?.*stackOsType=Linux/.test(args[args.indexOf('--url') + 1])));
  assert.match((await evaluate(cloud, { web: { value: [linuxStack('dotnet', 'DOTNETCORE|9.0')] } })).result.issues.join(), /DOTNETCORE\|10.0 is not offered in eastus2/);
  assert.match((await evaluate(latency, { web: { value: [linuxStack('php', 'PHP|8.3', { isDeprecated: true })] } })).result.issues.join(), /deprecated/);
  assert.match((await evaluate(latency, { web: { value: [linuxStack('php', 'PHP|8.3', { endOfLifeDate: '2000-01-01T00:00:00Z' })] } })).result.issues.join(), /end-of-life/);
  assert.match((await evaluate(cloud, { web: { value: [linuxStack('dotnet', 'DOTNETCORE|10.0', { isPreview: true })] } })).result.issues.join(), /preview/);
  assert.deepEqual((await evaluate(boards, {})).result.issues, []);
  assert.match((await evaluate(boards, { functions: { value: [linuxStack('python', 'Python|3.12', { supportedFunctionsExtensionVersions: ['~3'] })] } })).result.issues.join(), /Functions ~4/);
  assert.match((await evaluate(boards, { functions: { value: [linuxStack('python', 'Python|3.12')] } })).result.issues.join(), /unsupported by the required host/);
  // Malformed or unauthorized discovery is an error, not an unavailable stack.
  await assert.rejects(evaluate(cloud, { web: { error: 'no list' } }), DiscoveryError);
  const denied = fakeAzure({ failOn: 'webAppStacks' });
  await assert.rejects(evaluateRegion(cloud, 'eastus2', denied.az), DiscoveryError);
});

test('Functions Consumption placement requires Linux dynamic workers, not just Windows Y1', async () => {
  const policy = await loadPolicy(policyFile('azure-boards-copilot-handover'));
  const linux = fakeAzure({ linuxConsumptionRegions: ['Sweden Central', 'Australia East'] });
  const eastus2 = await evaluateRegion(policy, 'eastus2', linux.az);
  assert.match(eastus2.issues.join(), /Linux Functions Consumption \(Y1\) is not offered in eastus2/);
  assert.deepEqual((await evaluateRegion(policy, 'swedencentral', linux.az)).issues, []);
  const url = linux.calls.find(args => args[0] === 'rest' && /geoRegions/.test(args.join(' ')));
  assert.match(url[url.indexOf('--url') + 1], /^\/subscriptions\/\{subscriptionId\}\/providers\/Microsoft\.Web\/geoRegions\?.*sku=Dynamic&linuxDynamicWorkersEnabled=true/);
  assert.ok(!linux.calls.some(args => args[0] === 'functionapp'), 'the Windows-inclusive CLI listing is not used');
  const denied = fakeAzure({ failOn: 'geoRegions' });
  await assert.rejects(evaluateRegion(policy, 'eastus2', denied.az), DiscoveryError);
});

test('setup can verify ownership before registering providers; unregistered providers still fail the full check', async () => {
  const policy = await loadPolicy(policyFile('cloud-agent-handover'));
  const fake = fakeAzure({ scenario: 'cloud-agent-handover' });
  const az = async (args) => {
    const command = args.join(' ');
    if (command.startsWith('provider show') && /Microsoft\.(Web|Insights|OperationalInsights)\b/.test(command)) {
      return { ...structuredClone(PROVIDER), registrationState: 'NotRegistered' };
    }
    if (/runtimeStacks|webapp list-runtimes|functionapp list-runtimes|list-skus --location .* --resource-type serverFarms/.test(command)) {
      throw new Error(`service check must be deferred, but called: ${command}`);
    }
    return fake.az(args);
  };
  const options = { workload: 'test', resourceGroup: 'rg-test', location: 'eastus2', parts: {} };
  const strict = await runCheck({ policy, az, options, log: silent });
  assert.equal(strict.eligible, false);
  assert.match(strict.regions[0].issues.join('\n'), /NotRegistered; run: az provider register/);
  const lines = [];
  const deferred = await runCheck({ policy, az, options: { ...options, deferUnregisteredProviders: true }, log: line => lines.push(line) });
  assert.equal(deferred.eligible, true);
  assert.equal(deferred.resourceGroupReady, true);
  assert.deepEqual([...deferred.providersPending].sort(), ['Microsoft.Insights', 'Microsoft.OperationalInsights', 'Microsoft.Web']);
  assert.match(lines.join('\n'), /deferred to the deploy preflight/);
  // Ownership is still enforced: a foreign group fails even with deferral.
  const foreign = fakeAzure({ scenario: 'cloud-agent-handover', groups: { 'rg-test': { location: 'eastus2', tags: { owner: 'someone-else' } } }, resources: { 'rg-test': [{ id: rid('rg-test', 'Microsoft.Storage/storageAccounts', 'x'), type: 'Microsoft.Storage/storageAccounts', location: 'eastus2', tags: {} }] } });
  await assert.rejects(runCheck({ policy, az: foreign.az, options: { ...options, deferUnregisteredProviders: true }, log: silent }));
});

test('check reports whether the resource group is created and designated, and prints the create command otherwise', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const lines = [];
  const missing = fakeAzure({ groups: {} });
  const absent = await runCheck({ policy, az: missing.az, options: { workload: 'test', resourceGroup: 'rg-test', location: 'eastus2', parts: {} }, log: line => lines.push(line) });
  assert.equal(absent.resourceGroupReady, false);
  assert.match(lines.join('\n'), /az group create --name rg-test --location eastus2 --tags sre-workshop-scenario=cpu-runaway/);
  assert.equal(missing.state.groupCreates ?? 0, 0);
  const ready = await runCheck({ policy, az: fakeAzure({}).az, options: { workload: 'test', resourceGroup: 'rg-test', location: 'eastus2', parts: {} }, log: () => {} });
  assert.equal(ready.resourceGroupReady, true);
});

test('orderedRegions puts a supported preference first and rejects unsupported regions', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  assert.deepEqual(orderedRegions(policy, 'Australia East'), ['australiaeast', 'eastus2', 'swedencentral']);
  assert.deepEqual(orderedRegions(policy, 'swedencentral', { noFallback: true }), ['swedencentral']);
  assert.throws(() => orderedRegions(policy, 'westus'), /not supported/);
});

const vmId = (name, group = 'rg-test') => rid(group, 'Microsoft.Compute/virtualMachines', name);
const deletes = fake => fake.calls.filter(args => args[1] === 'delete');
const leaves = message => ({ message, leavesResources: true });

test('provision tries families before regions, retrying only attempts that left no new resources', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ deployFailures: ['(SkuNotAvailable) Standard_B2s is currently not available'] });
  const result = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent, attemptId: 'a1b2c3d4-0000' });
  assert.equal(result.location, 'eastus2');
  assert.equal(result.sku, 'Standard_D2s_v5');
  assert.equal(result.mode, 'new');
  assert.deepEqual(fake.deployments.map(item => item.deploymentName), ['cpu-runaway-a1b2c3d4-1', 'cpu-runaway-a1b2c3d4-2']);
  assert.deepEqual(deletes(fake), []);
  assert.deepEqual(fake.state.resources['rg-test'].map(item => item.id), [vmId('vm-cpu-runaway-a1b2c3d4-2')]);
  assert.equal(fake.state.groups['rg-test'].tags[TAGS.sku], 'Standard_D2s_v5');
  assert.equal(fake.state.groups['rg-test'].tags[TAGS.location], 'eastus2');
  assert.equal(fake.state.groups['rg-test'].tags[TAGS.attempt], 'a1b2c3d4-0000');
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

test('a preferred SKU is tried first and the policy order still applies after it', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  assert.deepEqual(preferredSkus(policy, 'Standard_D2as_v5').slice(0, 2), ['Standard_D2as_v5', 'Standard_B2s']);
  assert.equal(preferredSkus(policy, 'Standard_D2as_v5').length, policy.compute.skus.length);
  assert.throws(() => preferredSkus(policy, 'Standard_M128'), /not in the cpu-runaway policy/);
  const fake = fakeAzure({ deployFailures: ['(SkuNotAvailable) Standard_D2as_v5 is currently not available'] });
  const result = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', sku: 'Standard_D2as_v5', log: silent });
  assert.deepEqual(fake.deployments.map(item => item.sku), ['Standard_D2as_v5', 'Standard_B2s']);
  assert.equal(result.sku, 'Standard_B2s');
});

test('a failed attempt that left any new resource stops with manual instructions and deletes nothing', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ deployFailures: [leaves('(SkuNotAvailable) allocation failed')] });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }),
    error => error instanceof PlacementError && /Nothing was deleted/.test(error.message) && /recorded a Create operation/.test(error.message)
      && error.attempts.length === 1);
  assert.equal(fake.deployments.length, 1, 'no retry while an ambiguous target remains');
  assert.deepEqual(deletes(fake), []);
  assert.equal(fake.state.resources['rg-test'].length, 1);
  assert.ok(fake.state.groups['rg-test']);
});

test('a same-identity concurrent resource appearing during an attempt is never deleted or retried around', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure();
  // Same identity, timestamp inside the attempt window, and the failed
  // deployment even reports a Create on it: still not proof of ownership.
  const concurrent = vmId('colleague-vm');
  const deploy = async input => {
    fake.deployments.push(input);
    fake.state.resources['rg-test'] = [{ id: concurrent, type: 'Microsoft.Compute/virtualMachines', location: input.location,
      systemData: { createdAt: new Date().toISOString(), createdBy: IDENTITY } }];
    fake.state.operations[`rg-test/${input.deploymentName}`] = [{ properties: { provisioningOperation: 'Create', targetResource: { id: concurrent } } }];
    throw Object.assign(new AzError(['deployment'], 1, '(SkuNotAvailable) not available'), { validationOnly: true });
  };
  await assert.rejects(provision({ policy, az: fake.az, deploy, resourceGroup: 'rg-test', log: silent }), /colleague-vm.*Nothing was deleted/s);
  assert.equal(fake.deployments.length, 1);
  assert.deepEqual(deletes(fake), []);
  assert.deepEqual(fake.state.resources['rg-test'].map(item => item.id), [concurrent]);
});

test('a non-retryable failure that left nothing stops and reports that nothing was deleted', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ deployFailures: ['(InvalidTemplateDeployment) bad password'] });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }),
    error => error instanceof PlacementError && /non-retryable/.test(error.message) && /nothing was deleted/.test(error.message));
  assert.equal(fake.deployments.length, 1);
  assert.ok(fake.state.groups['rg-test'], 'the resource group is never deleted');
  assert.deepEqual(deletes(fake), []);
});

test('assessFailedAttempt fails closed when the group cannot be listed', async () => {
  const rejected = Object.assign(new AzError(['deployment'], 1, '(SkuNotAvailable) not available'), { validationOnly: true });
  const fake = fakeAzure({ groups: { 'rg-test': { location: 'eastus2', tags: {} } }, failOn: 'resource list' });
  await assert.rejects(assessFailedAttempt({ az: fake.az, resourceGroup: 'rg-test', deploymentName: 'd-1', snapshot: new Set(), error: rejected }),
    /could not be listed.*Nothing was deleted/s);
  const clean = fakeAzure({ groups: { 'rg-test': { location: 'eastus2', tags: {} } }, resources: { 'rg-test': [{ id: vmId('old'), type: 'x', location: 'eastus2' }] } });
  assert.deepEqual((await assessFailedAttempt({ az: clean.az, resourceGroup: 'rg-test', deploymentName: 'd-1', snapshot: new Set([vmId('old').toLowerCase()]), error: rejected })).added, []);
  assert.deepEqual(deletes(clean), []);
});

test('provision never creates or upserts a resource group and explains how to designate one', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ groups: {} });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', location: 'swedencentral', log: silent }),
    error => error instanceof PlacementError && /never creates resource groups/.test(error.message)
      && error.message.includes('az group create --name rg-test --location swedencentral --tags sre-workshop-scenario=cpu-runaway'));
  assert.equal(fake.state.groupCreates ?? 0, 0);
  assert.equal(fake.deployments.length, 0);
  assert.ok(!fake.calls.some(args => args[0] === 'group' && ['create', 'update'].includes(args[1])));
});

test('a foreign empty group created concurrently keeps its original tags because nothing is upserted', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  // The fake's group create behaves like Azure's create-or-update: it would
  // overwrite the foreign group's tags. Another writer creates an empty group
  // right after our existence check.
  const foreignTags = { owner: 'colleague', purpose: 'their-lab' };
  const fake = fakeAzure({ groups: {} });
  const az = async args => {
    const result = await fake.az(args);
    if (args[0] === 'group' && args[1] === 'exists') fake.state.groups['rg-test'] = { location: 'westeurope', tags: { ...foreignTags } };
    return result;
  };
  await assert.rejects(provision({ policy, az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }), /never creates resource groups/);
  assert.deepEqual(fake.state.groups['rg-test'].tags, foreignTags, 'the foreign group was not taken over');
  assert.equal(fake.state.groupCreates ?? 0, 0);
  assert.equal(fake.deployments.length, 0);
  // Even if it already existed at discovery time, an undesignated empty group is refused.
  const undesignated = fakeAzure({ groups: { 'rg-test': { location: 'westeurope', tags: { ...foreignTags } } } });
  await assert.rejects(provision({ policy, az: undesignated.az, deploy: undesignated.deploy, resourceGroup: 'rg-test', log: silent }), /not designated/);
  assert.deepEqual(undesignated.state.groups['rg-test'].tags, foreignTags);
  assert.equal(undesignated.deployments.length, 0);
});

test('the subscription-scope template never upserts the group: the engine requires it and disables template creation', async () => {
  const policy = await loadPolicy(policyFile('azure-boards-copilot-handover'));
  const missing = fakeAzure({ groups: {}, resourceGroup: 'w-rg' });
  await assert.rejects(provision({ policy, az: missing.az, deploy: missing.deploy, resourceGroup: 'w-rg', log: silent }), /never creates resource groups/);
  assert.equal(missing.deployments.length, 0);
  assert.equal('createResourceGroup' in buildParameters(policy, { location: 'eastus2', workload: 'w', context: { resourceGroupLocation: 'eastus2' } }), false);
  const template = readFileSync(resolve(repositoryRoot, 'scenarios/azure-boards-copilot-handover/infra/bicep/main.bicep'), 'utf8');
  assert.doesNotMatch(template, /createResourceGroup|resource \w+ 'Microsoft\.Resources\/resourceGroups@[^']+' = (?!.*existing)/,
    'direct deployments of the template must not create-or-update the group either');
  assert.match(template, /resource scenarioResourceGroup 'Microsoft\.Resources\/resourceGroups@[^']+' existing/);
});

test('a designated group that already holds unplaced resources is refused rather than guessed about', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ resources: { 'rg-test': [{ id: rid('rg-test', 'Microsoft.Insights/actionGroups', 'ag'), type: 'Microsoft.Insights/actionGroups', location: 'global' }] } });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }), /already contains 1 resource/);
  assert.equal(fake.deployments.length, 0);
  assert.deepEqual(deletes(fake), []);
});

test('a tagging failure after a successful deployment keeps the deployment and reports partial success', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ failOn: 'group update' });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }),
    error => error instanceof PlacementError && /deployed successfully/.test(error.message) && /deployment was kept/.test(error.message)
      && error.partial?.location === 'eastus2' && error.partial?.sku === 'Standard_B2s');
  assert.equal(fake.deployments.length, 1, 'no further attempts after a completed deployment');
  assert.equal(fake.state.resources['rg-test'].length, 1);
  assert.deepEqual(deletes(fake), []);
});

test('an existing group without this scenario\'s designation tag or placement is refused', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ groups: { 'rg-test': { location: 'eastus2', tags: {} } } });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }), /not designated for cpu-runaway/);
  assert.equal(fake.deployments.length, 0);
  const designated = fakeAzure();
  const result = await provision({ policy, az: designated.az, deploy: designated.deploy, resourceGroup: 'rg-test', log: silent });
  assert.equal(result.mode, 'new');
  assert.ok(!designated.calls.some(args => args[0] === 'group' && args[1] === 'create'));
});

test('discovery failures are reported, never treated as empty availability', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({ failOn: 'vm list-skus' });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }), DiscoveryError);
  assert.ok(!fake.calls.some(args => args[0] === 'group' && args[1] === 'create'));
});

test('existing deployments stay pinned to their actual workload placement and are never relocated', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const groups = { 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: 'cpu-runaway', [TAGS.location]: 'swedencentral', [TAGS.sku]: 'Standard_D2s_v5' } } };
  const vms = { 'rg-test': [{ size: 'Standard_D2s_v5', location: 'swedencentral' }, { size: 'Standard_D2s_v5', location: 'swedencentral' }] };
  const fake = fakeAzure({ groups, vms });
  const result = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent });
  assert.equal(result.mode, 'pinned');
  assert.equal(result.location, 'swedencentral');
  assert.equal(result.sku, 'Standard_D2s_v5');
  assert.ok(!fake.calls.some(args => args[1] === 'create' || args[1] === 'delete'));
  const mismatched = fakeAzure({ groups, vms: { 'rg-test': [{ size: 'Standard_D2s_v5', location: 'australiaeast' }] } });
  await assert.rejects(provision({ policy, az: mismatched.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }), /records placement/);
  const foreign = fakeAzure({ groups: { 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: 'iis-app-pool' } } } });
  await assert.rejects(provision({ policy, az: foreign.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }), /belongs to scenario/);
});

test('reruns after a fallback reuse the pinned region for the unchanged default --location; strict selection fails', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  // First run: East US 2 has no capacity, so placement falls back to Sweden Central.
  const fake = fakeAzure({ deployFailures: Array(policy.compute.skus.length).fill('(SkuNotAvailable) no capacity') });
  const first = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', location: 'eastus2', log: silent });
  assert.equal(first.location, 'swedencentral');
  fake.state.groups['rg-test'].location = 'eastus2';
  // Rerun with the workflow/setup default input.
  const messages = [];
  const rerun = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', location: 'eastus2', log: message => messages.push(message) });
  assert.equal(rerun.mode, 'pinned');
  assert.equal(rerun.location, 'swedencentral');
  assert.equal(fake.deployments.at(-1).location, 'swedencentral');
  assert.ok(messages.some(message => /Preferred region eastus2 ignored: rg-test is already placed in swedencentral/.test(message)));
  const report = await runCheck({ policy, az: fake.az, options: { workload: 'test', resourceGroup: 'rg-test', location: 'eastus2', parts: {} }, log: silent });
  assert.equal(report.pinnedLocation, 'swedencentral');
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', location: 'eastus2', noRegionFallback: true, log: silent }),
    /never relocated/);
  await assert.rejects(runCheck({ policy, az: fake.az, options: { workload: 'test', resourceGroup: 'rg-test', location: 'eastus2', noRegionFallback: true, parts: {} }, log: silent }),
    /no region fallback/);
  assert.throws(() => reconcilePinnedRegion({ resourceGroup: 'g', pinned: 'swedencentral', location: 'eastus2', strict: true }), /never relocated/);
});

test('existing App Service placement comes from workload resource locations, not group metadata', async () => {
  const policy = await loadPolicy(policyFile('cloud-agent-handover'));
  const site = (name, location, type = 'Microsoft.Web/sites') => ({ id: rid('rg-app', type, name), type, location });
  const groups = { 'rg-app': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario } } };
  const placed = fakeAzure({ groups, resourceGroup: 'rg-app', resources: { 'rg-app': [
    site('plan', 'Sweden Central', 'Microsoft.Web/serverFarms'), site('app', 'Sweden Central'), site('alert', 'global', 'Microsoft.Insights/actionGroups'),
  ] } });
  const state = await inspectExisting(policy, 'rg-app', placed.az);
  assert.equal(state.location, 'swedencentral');
  const result = await provision({ policy, az: placed.az, deploy: placed.deploy, resourceGroup: 'rg-app', location: 'eastus2', log: silent });
  assert.equal(result.mode, 'pinned');
  assert.equal(placed.deployments[0].location, 'swedencentral');

  const split = fakeAzure({ groups, resources: { 'rg-app': [site('app', 'swedencentral'), site('plan', 'eastus2', 'Microsoft.Web/serverFarms')] } });
  await assert.rejects(provision({ policy, az: split.az, deploy: split.deploy, resourceGroup: 'rg-app', log: silent }), /several regions/);
  assert.equal(split.deployments.length, 0);
  const unreadable = fakeAzure({ groups, failOn: 'resource list' });
  await assert.rejects(provision({ policy, az: unreadable.az, deploy: unreadable.deploy, resourceGroup: 'rg-app', log: silent }), DiscoveryError);
  assert.equal(unreadable.deployments.length, 0);
});

test('non-VM scenarios never call VM APIs during ownership inspection or pinned reruns', async () => {
  for (const id of ['cloud-agent-handover', 'azure-boards-copilot-handover', 'appservice-latency-context']) {
    const policy = await loadPolicy(policyFile(id));
    const site = (name, type = 'Microsoft.Web/sites') => ({ id: rid('rg-app', type, name), type, location: 'eastus2' });
    const groups = { 'rg-app': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario } } };
    const fake = fakeAzure({ groups, resourceGroup: 'rg-app', scenario: id, failOn: 'vm list', resources: { 'rg-app': [site('plan', 'Microsoft.Web/serverFarms'), site('app')] } });
    const state = await inspectExisting(policy, 'rg-app', fake.az);
    assert.equal(state.location, 'eastus2', id);
    assert.ok(!fake.calls.some(args => args[0] === 'vm'), `${id} called a VM API`);
  }
  const aks = await loadPolicy(policyFile('cosmos-rbac-removal'));
  const cluster = fakeAzure({ scenario: aks.scenario, failOn: 'vm list', resources: { 'rg-test': [{ id: rid('rg-test', 'Microsoft.ContainerService/managedClusters', 'aks'), type: 'Microsoft.ContainerService/managedClusters', location: 'eastus2' }] },
    clusters: { 'rg-test': [{ name: 'w-aks', location: 'eastus2', provisioningState: 'Succeeded', kubernetesVersion: '1.34.5', currentKubernetesVersion: '1.34.5', agentPoolProfiles: [{ name: 'system', mode: 'System', vmSize: 'Standard_D4s_v5', count: 2, currentOrchestratorVersion: '1.34.5' }] }] } });
  await inspectExisting(aks, 'rg-test', cluster.az);
  assert.ok(!cluster.calls.some(args => args[0] === 'vm' && args[1] === 'list'), 'AKS inspection listed VMs');
  // VM and retirement policies still read the VMs they own.
  for (const id of ['cpu-runaway', 'vm-size-retirement']) {
    const policy = await loadPolicy(policyFile(id));
    const fake = fakeAzure({ scenario: id });
    await inspectExisting(policy, 'rg-test', fake.az);
    assert.ok(fake.calls.some(args => args[0] === 'vm' && args[1] === 'list'), `${id} skipped VM discovery`);
  }
});

test('Boards resource-group overrides must match the template-created group and are rejected before any Azure call', async () => {
  const policy = await loadPolicy(policyFile('azure-boards-copilot-handover'));
  assert.equal(resolveNames(policy, { workload: 'boardsx' }).resourceGroup, 'boardsx-rg');
  assert.throws(() => resolveNames(policy, { workload: 'boardsx', resourceGroup: 'other-rg' }), /does not match/);
  const fake = fakeAzure({ resourceGroup: 'boardsx-rg', groups: { 'boardsx-rg': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario } } } });
  const errors = [];
  const originalError = console.error;
  console.error = message => errors.push(message);
  try {
    assert.equal(await main(['deploy', policy.scenario, '--workload', 'boardsx', '--resource-group', 'other-rg'], { azFactory: () => fake.az, log: silent, env: {} }), 1);
    assert.equal(await main(['check', policy.scenario, '--workload', 'boardsx', '--resource-group', 'other-rg'], { azFactory: () => fake.az, log: silent, env: {} }), 1);
  } finally {
    console.error = originalError;
  }
  assert.equal(fake.calls.length, 0);
  assert.ok(errors.some(message => /does not match/.test(message)));
});

test('subscription-scope fallback keeps the designated group in its region and deletes nothing', async () => {
  const policy = await loadPolicy(policyFile('azure-boards-copilot-handover'));
  const fake = fakeAzure({ resourceGroup: 'w-rg', scenario: 'azure-boards-copilot-handover', deployFailures: ['(LocationIsOfflineForProvisioning) region is offline'] });
  const result = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'w-rg', log: silent });
  assert.equal(result.location, 'swedencentral');
  assert.equal(fake.deployments[0].context.resourceGroupLocation, 'eastus2');
  assert.equal(fake.deployments[1].context.resourceGroupLocation, 'eastus2', 'the designated group keeps its region');
  assert.deepEqual(deletes(fake), []);
  assert.ok(fake.state.groups['w-rg']);
  const parameters = buildParameters(policy, { ...fake.deployments[1], workload: 'w' });
  assert.equal(parameters.location, 'swedencentral');
  assert.equal('resourceGroupLocation' in parameters, false, 'the template never writes the group, so its region is not a parameter');
});

test('pinned reruns keep the designated group ownership tags in deployment tags', async () => {
  const policy = await loadPolicy(policyFile('azure-boards-copilot-handover'));
  const tags = { [TAGS.scenario]: policy.scenario, [TAGS.attempt]: 'a1', [TAGS.location]: 'swedencentral', workshop: 'sre-agent' };
  const fake = fakeAzure({ groups: { 'w-rg': { location: 'swedencentral', tags } } });
  let seen;
  await provision({ policy, az: fake.az, resourceGroup: 'w-rg', log: silent, deploy: async (input) => { seen = input; return {}; } });
  const parameters = buildParameters(policy, { ...seen, workload: 'w' });
  assert.equal(parameters.tags[TAGS.attempt], 'a1');
  assert.equal(parameters.tags.scenario, policy.scenario);
  assert.equal(parameters.location, 'swedencentral');
});

test('reruns do not count already-deployed fleet or compute against quota', async () => {
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const tight = usage({ cores: [10, 14], standardBSFamily: [4, 4], standardDSv2Family: [4, 4], standardDSv5Family: [0, 6], standardDASv5Family: [0, 6], standardDSv4Family: [0, 6] });
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

test('retirement target quota covers resizing the whole legacy fleet, not one VM', async () => {
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const legacy = [{ size: 'Standard_DS1_v2', location: 'eastus2' }, { size: 'Standard_DS2_v2', location: 'eastus2' }, { size: 'Standard_DS1_v2', location: 'eastus2' }];
  const baseline = [{ size: 'Standard_B2s', location: 'eastus2' }, { size: 'Standard_B2s', location: 'eastus2' }];
  const groups = { 'rg-test': { location: 'eastus2', tags: {
    [TAGS.scenario]: policy.scenario, [TAGS.location]: 'eastus2', [TAGS.sku]: 'Standard_B2s', [TAGS.remediationTarget]: 'Standard_D2s_v5' } } };
  const targetsOnly = { services: false, compute: false, fleet: false, targets: true };
  // Only two Dsv5 vCPUs remain, but the three legacy VMs need 3 x 2 = 6.
  const twoLeft = usage({ cores: [8, 100], standardBSFamily: [4, 20], standardDSv2Family: [4, 20], standardDSv5Family: [18, 20], standardDASv5Family: [0, 20], standardDSv4Family: [0, 20] });
  const fake = fakeAzure({ groups, vms: { 'rg-test': [...baseline, ...legacy] }, regions: { eastus2: { usage: twoLeft } } });
  const report = await runCheck({ policy, az: fake.az, options: { workload: 'test', resourceGroup: 'rg-test', parts: targetsOnly }, log: silent });
  assert.equal(report.eligible, false, 'the recorded target is rechecked, never swapped for another size');
  assert.match(JSON.stringify(report.regions[0].rejected), /standardDSv5Family vCPU quota has 2 free, 6 required/);

  // Regional total: net +1 per DS1 (x2), +0 for DS2, plus one in-flight 2-vCPU resize.
  const tightCores = usage({ cores: [8, 11], standardBSFamily: [4, 20], standardDSv2Family: [4, 20], standardDSv5Family: [0, 20], standardDASv5Family: [0, 20], standardDSv4Family: [0, 20] });
  const cores = await runCheck({ policy, az: fakeAzure({ groups, vms: { 'rg-test': [...baseline, ...legacy] }, regions: { eastus2: { usage: tightCores } } }).az,
    options: { workload: 'test', resourceGroup: 'rg-test', parts: targetsOnly }, log: silent });
  assert.match(JSON.stringify(cores.regions[0].rejected), /total regional vCPU quota has 3 free, 4 required/);

  // A partially migrated fleet only needs quota for the VMs still pending.
  const partial = [{ size: 'Standard_D2s_v5', location: 'eastus2' }, { size: 'Standard_DS2_v2', location: 'eastus2' }, { size: 'Standard_DS1_v2', location: 'eastus2' }];
  const fourLeft = usage({ cores: [9, 100], standardBSFamily: [4, 20], standardDSv2Family: [3, 20], standardDSv5Family: [16, 20], standardDASv5Family: [0, 20], standardDSv4Family: [0, 20] });
  const resumed = await runCheck({ policy, az: fakeAzure({ groups, vms: { 'rg-test': [...baseline, ...partial] }, regions: { eastus2: { usage: fourLeft } } }).az,
    options: { workload: 'test', resourceGroup: 'rg-test', parts: targetsOnly }, log: silent });
  assert.equal(resumed.eligible, true, JSON.stringify(resumed.regions));
  assert.equal(resumed.remediationTarget, 'Standard_D2s_v5');

  // Setup after a partial inject (one DS1 exists, two still to create) budgets the whole fleet.
  const oneInjected = [{ size: 'Standard_DS1_v2', location: 'eastus2' }];
  const twoLeftAgain = usage({ cores: [5, 100], standardBSFamily: [4, 20], standardDSv2Family: [1, 20], standardDSv5Family: [18, 20], standardDASv5Family: [0, 20], standardDSv4Family: [0, 20] });
  const setup = await runCheck({ policy, az: fakeAzure({ groups, vms: { 'rg-test': [...baseline, ...oneInjected] }, regions: { eastus2: { usage: twoLeftAgain } } }).az,
    options: { workload: 'test', resourceGroup: 'rg-test' }, log: silent });
  assert.equal(setup.eligible, false);
  assert.match(JSON.stringify(setup.regions[0].rejected), /standardDSv5Family vCPU quota has 2 free, 6 required/);
  // The remediation-only preflight resizes just the VM that exists.
  const remediation = await runCheck({ policy, az: fakeAzure({ groups, vms: { 'rg-test': [...baseline, ...oneInjected] }, regions: { eastus2: { usage: twoLeftAgain } } }).az,
    options: { workload: 'test', resourceGroup: 'rg-test', parts: targetsOnly }, log: silent });
  assert.equal(remediation.eligible, true, JSON.stringify(remediation.regions));

  // New placement: a target with room for one VM is skipped for one that fits the fleet.
  const planned = usage({ cores: [0, 100], standardBSFamily: [0, 20], standardDSv2Family: [0, 20], standardDSv5Family: [18, 20], standardDASv5Family: [0, 20], standardDSv4Family: [0, 20] });
  const evaluation = await evaluateRegion(policy, 'eastus2', fakeAzure({ regions: { eastus2: { usage: planned } } }).az);
  assert.equal(evaluation.candidates[0].remediationTarget, 'Standard_D2as_v5');
});

test('the retirement exercise fails early with the unsupported-subscription diagnostic when DSv2 is unavailable everywhere', async () => {
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const noDsv2 = usage({ cores: [0, 100], standardBSFamily: [0, 20], standardDSv5Family: [0, 20], standardDASv5Family: [0, 20], standardDSv4Family: [0, 20], standardDSv2Family: [0, 0] });
  const fake = fakeAzure({ scenario: policy.scenario, regions: Object.fromEntries(policy.regions.map(region => [region, { usage: noDsv2 }])) });
  await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }),
    error => error instanceof PlacementError && /UNSUPPORTED SUBSCRIPTION/.test(error.diagnostic));
  assert.ok(!fake.calls.some(args => args[1] === 'create'));
  const evaluation = await evaluateRegion(policy, 'eastus2', fake.az);
  assert.equal(evaluation.fleetUnavailable, true);
});

test('the retirement placement records an eligible modern remediation target in the same region', async () => {
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const fake = fakeAzure({ scenario: policy.scenario, regions: { eastus2: { skus: STANDARD_SKUS.map(item => item.name === 'Standard_D2s_v5' ? sku('Standard_D2s_v5', 'standardDSv5Family', { restrictedIn: 'eastus2' }) : item) } } });
  const result = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent });
  assert.equal(result.location, 'eastus2');
  assert.equal(result.context.remediationTarget, 'Standard_D2as_v5');
  assert.equal(fake.state.groups['rg-test'].tags[TAGS.remediationTarget], 'Standard_D2as_v5');
});

const AKS_SKUS = [
  sku('Standard_D2ads_v6', 'standardDADSv6Family'),
  sku('Standard_D4ads_v6', 'standardDADSv6Family', { vcpus: 4, memory: 16 }),
  sku('Standard_D4ads_v5', 'standardDADSv5Family', { vcpus: 4, memory: 16 }),
  sku('Standard_D4s_v5', 'standardDSv5Family', { vcpus: 4, memory: 16 }),
  sku('Standard_D4as_v5', 'standardDASv5Family', { vcpus: 4, memory: 16 }),
];
const aksAz = (base, { versions = AKS_VERSIONS } = {}) => async (args) => {
  const command = args.join(' ');
  if (command.startsWith('aks get-versions')) return versions;
  if (command.startsWith('cosmosdb locations list')) return [{ name: 'East US 2', properties: { isSubscriptionRegionAccessAllowedForRegular: true } }];
  if (command.startsWith('provider show')) return { registrationState: 'Registered', resourceTypes: [
    { resourceType: 'managedClusters', locations: ['East US 2'] }, { resourceType: 'databaseAccounts', locations: [] },
    { resourceType: 'workspaces', locations: [] }, { resourceType: 'dataCollectionRules', locations: [] }] };
  return base.az(args);
};

test('AKS policies require 4-vCPU system nodes and reject 2-vCPU candidates', async () => {
  for (const id of ['cosmos-rbac-removal', 'workload-identity-break']) {
    const policy = await loadPolicy(policyFile(id));
    assert.ok(policy.compute.count >= 2);
    assert.ok(policy.compute.skus.every(name => /^Standard_D4/.test(name)), `${id}: ${policy.compute.skus}`);
    assert.ok(!policy.regionChecks.find(check => check.type === 'aksVersion').versions, 'no hard-coded version allowlist');
    for (const skuName of ['Standard_D2ads_v6', 'Standard_D2s_v5']) {
      assert.throws(() => validatePolicy({ ...policy, compute: { ...policy.compute, skus: [skuName], requires: { ...policy.compute.requires, minVCPUs: 2 } } }), /4 vCPUs/);
    }
    assert.throws(() => validatePolicy({ ...policy, compute: { ...policy.compute, count: 1 } }), /at least two nodes/);
    const template = readFileSync(resolve(policy.capsule, 'infra', 'bicep', 'main.bicep'), 'utf8');
    assert.match(template, /^param systemNodeVmSize string = 'Standard_D4ads_v6'$/m);
    assert.match(template, /^param kubernetesVersion string = ''$/m);
  }
  const requires = { minVCPUs: 4, maxVCPUs: 4, minMemoryGB: 4, architecture: 'x64' };
  assert.match(skuIneligibility(AKS_SKUS[0], 'eastus2', requires), /vCPUs/);
  assert.equal(skuIneligibility(AKS_SKUS[1], 'eastus2', requires), null);
});

test('AKS placement selects a standard-support regional version and reserves node plus surge quota', async () => {
  const policy = await loadPolicy(policyFile('cosmos-rbac-removal'));
  const base = fakeAzure({ regions: { eastus2: {
    skus: AKS_SKUS,
    usage: usage({ cores: [0, 100], standardDADSv6Family: [0, 8], standardDADSv5Family: [0, 12] }),
  } } });
  const evaluation = await evaluateRegion(policy, 'eastus2', aksAz(base));
  assert.equal(evaluation.context.kubernetesVersion, '1.35', 'the regional default standard-support version');
  assert.deepEqual(evaluation.candidates.map(item => item.sku), ['Standard_D4ads_v5']);
  assert.match(evaluation.rejected.find(item => item.sku === 'Standard_D4ads_v6').reason, /8 free, 12 required/);
  const parameters = buildParameters(policy, { location: 'eastus2', sku: 'Standard_D4ads_v5', context: evaluation.context, workload: 'w' });
  const { tags, ...selected } = parameters;
  assert.deepEqual(selected, { location: 'eastus2', workloadName: 'w', systemNodeVmSize: 'Standard_D4ads_v5', kubernetesVersion: '1.35' });
  assert.equal(tags.workshop, 'sre-agent');

  // Without a default, the newest non-preview standard-support version wins; LTS-only and preview are ignored.
  const noDefault = { values: AKS_VERSIONS.values.map(({ isDefault, ...rest }) => rest) };
  assert.equal((await evaluateRegion(policy, 'eastus2', aksAz(base, { versions: noDefault }))).context.kubernetesVersion, '1.36');
  const onlyUnsupported = { values: [
    { version: '1.32', isPreview: false, capabilities: { supportPlan: ['KubernetesOfficial'] } },
    { version: '1.33', isPreview: false, capabilities: { supportPlan: ['AKSLongTermSupport'] } },
    { version: '1.38', isPreview: true, capabilities: { supportPlan: ['KubernetesOfficial'] } },
  ] };
  const none = await evaluateRegion(policy, 'eastus2', aksAz(base, { versions: onlyUnsupported }));
  assert.ok(none.issues.some(issue => /standard-support AKS version/.test(issue)), JSON.stringify(none.issues));
  await assert.rejects(evaluateRegion(policy, 'eastus2', aksAz(base, { versions: { unexpected: true } })), DiscoveryError);
});

test('existing AKS clusters keep their running Kubernetes version and system node size', async () => {
  const policy = await loadPolicy(policyFile('workload-identity-break'));
  const groups = { 'rg-aks': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario } } };
  const cluster = (overrides = {}, pool = {}) => ({ name: 'w-aks', location: 'swedencentral', provisioningState: 'Succeeded',
    kubernetesVersion: '1.34.5', currentKubernetesVersion: '1.34.5',
    agentPoolProfiles: [{ name: 'system', mode: 'System', vmSize: 'Standard_D4s_v5', count: 2, provisioningState: 'Succeeded', orchestratorVersion: '1.34.5', currentOrchestratorVersion: '1.34.5', ...pool }], ...overrides });
  const fake = fakeAzure({ groups, clusters: { 'rg-aks': [cluster()] }, resourceGroup: 'rg-aks' });
  const result = await provision({ policy, az: aksAz(fake), deploy: fake.deploy, resourceGroup: 'rg-aks', log: silent });
  assert.equal(result.mode, 'pinned');
  assert.equal(result.location, 'swedencentral');
  assert.equal(result.sku, 'Standard_D4s_v5');
  // The exact running patch, never just the minor (which AKS would resolve to its latest patch).
  assert.equal(result.context.kubernetesVersion, '1.34.5');
  assert.match(JSON.stringify(fake.deployments[0]), /"kubernetesVersion":"1\.34\.5"/);
  assert.ok(!fake.calls.some(args => args[0] === 'aks' && args[1] === 'get-versions'));

  // Normal fresh-cluster response: created with the policy's major.minor, running a full patch.
  const fresh = fakeAzure({ groups, clusters: { 'rg-aks': [cluster({ kubernetesVersion: '1.34' })] }, resourceGroup: 'rg-aks' });
  const freshResult = await provision({ policy, az: aksAz(fresh), deploy: fresh.deploy, resourceGroup: 'rg-aks', log: silent });
  assert.equal(freshResult.context.kubernetesVersion, '1.34.5');
  assert.match(JSON.stringify(fresh.deployments[0]), /"kubernetesVersion":"1\.34\.5"/);

  for (const [label, broken] of [
    ['upgrading', cluster({ provisioningState: 'Upgrading' })],
    ['pool upgrading', cluster({}, { provisioningState: 'Upgrading' })],
    ['unknown version', cluster({ kubernetesVersion: undefined, currentKubernetesVersion: undefined })],
    ['minor only', cluster({ currentKubernetesVersion: '1.34', kubernetesVersion: '1.34' })],
    ['pending upgrade', cluster({ kubernetesVersion: '1.35.1' })],
    ['pending minor upgrade', cluster({ kubernetesVersion: '1.35' })],
    ['different patch', cluster({ kubernetesVersion: '1.34.6' })],
    ['malformed requested', cluster({ kubernetesVersion: '1.34.x' })],
    ['minor-only while upgrading', cluster({ kubernetesVersion: '1.34', provisioningState: 'Upgrading' })],
    ['mixed pools', cluster({}, { currentOrchestratorVersion: '1.33.9' })],
    ['unknown pool version', cluster({}, { orchestratorVersion: undefined, currentOrchestratorVersion: undefined })],
  ]) {
    const stalled = fakeAzure({ groups, clusters: { 'rg-aks': [broken] }, resourceGroup: 'rg-aks' });
    await assert.rejects(provision({ policy, az: aksAz(stalled), deploy: stalled.deploy, resourceGroup: 'rg-aks', log: silent }), PlacementError, label);
    assert.equal(stalled.deployments.length, 0, label);
  }
});
test('existing AKS pinning reads only the template cluster and its system pool, failing closed on ambiguity', async () => {
  const policy = await loadPolicy(policyFile('workload-identity-break'));
  const groups = { 'rg-aks': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario } } };
  const pool = (name, vmSize, extra = {}) => ({ name, mode: 'System', vmSize, count: 2, provisioningState: 'Succeeded', currentOrchestratorVersion: '1.34.5', ...extra });
  const cluster = (name, pools) => ({ name, location: 'eastus2', provisioningState: 'Succeeded', kubernetesVersion: '1.34.5', currentKubernetesVersion: '1.34.5', agentPoolProfiles: pools });
  // A user-added System-mode pool listed first with a different size must not be pinned.
  const extra = fakeAzure({ groups, clusters: { 'rg-aks': [cluster('w-aks', [pool('extra', 'Standard_D8s_v5'), pool('system', 'Standard_D4s_v5')])] }, resourceGroup: 'rg-aks' });
  const result = await provision({ policy, az: aksAz(extra), deploy: extra.deploy, resourceGroup: 'rg-aks', log: silent });
  assert.equal(result.sku, 'Standard_D4s_v5');

  for (const [label, clusters, kind] of [
    ['two clusters of different sizes', [cluster('w-aks', [pool('system', 'Standard_D4s_v5')]), cluster('other-aks', [pool('system', 'Standard_D2s_v5')])], PlacementError],
    ['no pool named system', [cluster('w-aks', [pool('nodepool1', 'Standard_D4s_v5')])], PlacementError],
    ['two pools named system', [cluster('w-aks', [pool('system', 'Standard_D4s_v5'), pool('SYSTEM', 'Standard_D2s_v5')])], PlacementError],
    ['null count', [cluster('w-aks', [pool('system', 'Standard_D4s_v5', { count: null })])], DiscoveryError],
    ['missing count', [cluster('w-aks', [pool('system', 'Standard_D4s_v5', { count: undefined })])], DiscoveryError],
    ['empty-string count', [cluster('w-aks', [pool('system', 'Standard_D4s_v5', { count: '' })])], DiscoveryError],
    ['fractional count', [cluster('w-aks', [pool('system', 'Standard_D4s_v5', { count: 1.5 })])], DiscoveryError],
  ]) {
    const fake = fakeAzure({ groups, clusters: { 'rg-aks': clusters }, resourceGroup: 'rg-aks' });
    await assert.rejects(provision({ policy, az: aksAz(fake), deploy: fake.deploy, resourceGroup: 'rg-aks', log: silent }), kind, label);
    assert.equal(fake.deployments.length, 0, label);
  }
});

test('partial reruns that recreate a missing baseline VM or template-pool node get the pinned-size quota preflight', async () => {
  const cpu = await loadPolicy(policyFile('cpu-runaway'));
  const groups = { 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: cpu.scenario, [TAGS.sku]: 'Standard_B2s' } } };
  const oneVm = [{ name: 'test-vm01', size: 'Standard_B2s', location: 'eastus2' }];
  const full = usage({ cores: [2, 100], standardBSFamily: [2, 2] });
  const blocked = fakeAzure({ groups: structuredClone(groups), vms: { 'rg-test': oneVm }, regions: { eastus2: { usage: full } } });
  await assert.rejects(provision({ policy: cpu, az: blocked.az, deploy: blocked.deploy, resourceGroup: 'rg-test', log: silent }), /quota|No eligible compute/i);
  assert.equal(blocked.deployments.length, 0);
  const ok = fakeAzure({ groups: structuredClone(groups), vms: { 'rg-test': oneVm } });
  const result = await provision({ policy: cpu, az: ok.az, deploy: ok.deploy, resourceGroup: 'rg-test', log: silent });
  assert.equal(result.sku, 'Standard_B2s');
  assert.ok(ok.calls.some(args => args[0] === 'vm' && args[1] === 'list-usage'), 'the quota preflight ran');
  // A complete baseline skips it (no capacity is created).
  const complete = fakeAzure({ groups: structuredClone(groups), vms: { 'rg-test': [...oneVm, { name: 'test-vm02', size: 'Standard_B2s', location: 'eastus2' }] }, regions: { eastus2: { usage: full } } });
  await provision({ policy: cpu, az: complete.az, deploy: complete.deploy, resourceGroup: 'rg-test', log: silent });
  assert.ok(!complete.calls.some(args => args[0] === 'vm' && args[1] === 'list-usage'));

  const aks = await loadPolicy(policyFile('workload-identity-break'));
  const aksGroups = { 'rg-aks': { location: 'eastus2', tags: { [TAGS.scenario]: aks.scenario } } };
  const shrunk = [{ name: 'w-aks', location: 'eastus2', provisioningState: 'Succeeded', kubernetesVersion: '1.34.5', currentKubernetesVersion: '1.34.5',
    agentPoolProfiles: [{ name: 'system', mode: 'System', vmSize: 'Standard_D4s_v5', count: 1, provisioningState: 'Succeeded', currentOrchestratorVersion: '1.34.5' }] }];
  const noRoom = fakeAzure({ groups: aksGroups, clusters: { 'rg-aks': shrunk }, resourceGroup: 'rg-aks', regions: { eastus2: { usage: usage({ cores: [4, 100], standardDSv5Family: [4, 4] }) } } });
  await assert.rejects(provision({ policy: aks, az: aksAz(noRoom), deploy: noRoom.deploy, resourceGroup: 'rg-aks', log: silent }), PlacementError);
  assert.equal(noRoom.deployments.length, 0);
});

test('reruns never resize baseline VMs: mixed or ambiguous baseline sizes fail closed with zero deployments', async () => {
  const cpu = await loadPolicy(policyFile('cpu-runaway'));
  const groups = () => ({ 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: cpu.scenario } } });
  const named = (name, size) => ({ name, size, location: 'eastus2' });
  for (const [label, list] of [
    ['mixed', [named('w-vm01', 'Standard_B2s'), named('w-vm02', 'Standard_D2s_v5')]],
    ['too many baseline-named', [named('w-vm01', 'Standard_B2s'), named('w-vm02', 'Standard_B2s'), named('w-vm03', 'Standard_B2s')]],
    ['unnamed', [{ size: 'Standard_B2s', location: 'eastus2', name: '' }]],
  ]) {
    const fake = fakeAzure({ groups: groups(), vms: { 'rg-test': list } });
    await assert.rejects(provision({ policy: cpu, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }), PlacementError, label);
    assert.equal(fake.deployments.length, 0, label);
  }
  // Retirement: only the scenario's -vmNN baseline pins the size; legacy or migrated fleet VMs never do.
  const retirement = await loadPolicy(policyFile('vm-size-retirement'));
  const fleet = [named('w-legacy-01', 'Standard_D2as_v5'), named('w-vm01', 'Standard_D2s_v5'), named('w-legacy-02', 'Standard_DS2_v2'), named('w-vm02', 'Standard_D2s_v5')];
  const ok = fakeAzure({ groups: { 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: retirement.scenario } } }, vms: { 'rg-test': fleet }, scenario: retirement.scenario });
  const state = await inspectExisting(retirement, 'rg-test', ok.az);
  assert.equal(state.sku, 'Standard_D2s_v5');
});

test('reruns reuse only the requested workload\'s template-managed VMs and cluster, failing closed otherwise', async () => {
  const named = (name, size = 'Standard_B2s') => ({ name, size, location: 'eastus2' });
  const vmCase = async (scenario, vms, workload) => {
    const policy = await loadPolicy(policyFile(scenario));
    const fake = fakeAzure({ groups: { 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario } } }, vms: { 'rg-test': vms }, scenario: policy.scenario });
    return { fake, run: () => provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', workload, log: silent }) };
  };
  // Matching workload: the existing baseline is reused.
  const same = await vmCase('cpu-runaway', [named('alpha-vm01'), named('alpha-vm02')], 'alpha');
  assert.equal((await same.run()).mode, 'pinned');
  // IIS derives take(replace(workload, '-', ''), 10) followed by -01/-02.
  const iis = await vmCase('iis-app-pool', [named('srelabiisp-01'), named('srelabiisp-02')], 'sre-lab-iis-pool');
  assert.equal((await iis.run()).mode, 'pinned');
  for (const [label, scenario, vms, workload] of [
    ['different workload', 'cpu-runaway', [named('alpha-vm01'), named('alpha-vm02')], 'beta'],
    ['IIS different workload', 'iis-app-pool', [named('srelabiisp-01'), named('srelabiisp-02')], 'other-iis'],
    ['IIS full-name convention is not the template', 'iis-app-pool', [named('sre-lab-iis-pool-vm01')], 'sre-lab-iis-pool'],
    ['unrecognized VM', 'cpu-runaway', [named('alpha-vm01'), named('jumpbox')], 'alpha'],
    ['retirement fleet of another workload', 'vm-size-retirement', [named('alpha-vm01'), named('alpha-vm02'), named('beta-legacy-01', 'Standard_DS1_v2')], 'alpha'],
    ['two workloads, none requested', 'cpu-runaway', [named('alpha-vm01'), named('beta-vm01')], undefined],
  ]) {
    const { fake, run } = await vmCase(scenario, vms, workload);
    await assert.rejects(run(), PlacementError, label);
    assert.equal(fake.deployments.length, 0, label);
  }
  // Without an explicit workload (remediation given only a group) the single workload is inferred.
  const retirement = await loadPolicy(policyFile('vm-size-retirement'));
  const inferred = fakeAzure({ groups: { 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: retirement.scenario } } },
    vms: { 'rg-test': [named('alpha-vm01'), named('alpha-vm02'), named('alpha-legacy-01', 'Standard_DS1_v2')] }, scenario: retirement.scenario });
  assert.equal((await inspectExisting(retirement, 'rg-test', inferred.az)).sku, 'Standard_B2s');

  const aks = await loadPolicy(policyFile('workload-identity-break'));
  const aksGroups = { 'rg-aks': { location: 'eastus2', tags: { [TAGS.scenario]: aks.scenario } } };
  const cluster = name => ({ name, location: 'eastus2', provisioningState: 'Succeeded', kubernetesVersion: '1.34.5', currentKubernetesVersion: '1.34.5',
    agentPoolProfiles: [{ name: 'system', mode: 'System', vmSize: 'Standard_D4s_v5', count: 2, currentOrchestratorVersion: '1.34.5' }] });
  const ok = fakeAzure({ groups: aksGroups, clusters: { 'rg-aks': [cluster('alpha-aks')] }, resourceGroup: 'rg-aks' });
  assert.equal((await provision({ policy: aks, az: aksAz(ok), deploy: ok.deploy, resourceGroup: 'rg-aks', workload: 'alpha', log: silent })).mode, 'pinned');
  for (const [label, name] of [['different workload cluster', 'alpha-aks'], ['non-template cluster', 'aks']]) {
    const fake = fakeAzure({ groups: aksGroups, clusters: { 'rg-aks': [cluster(name)] }, resourceGroup: 'rg-aks' });
    await assert.rejects(provision({ policy: aks, az: aksAz(fake), deploy: fake.deploy, resourceGroup: 'rg-aks', workload: 'beta', log: silent }), PlacementError, label);
    assert.equal(fake.deployments.length, 0, label);
  }
});

test('malformed or incomplete VM/AKS discovery fails closed instead of re-selecting a size', async () => {
  const cpu = await loadPolicy(policyFile('cpu-runaway'));
  const vmGroups = () => ({ 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: cpu.scenario } } });
  const vmResource = name => ({ id: vmId(name), type: 'Microsoft.Compute/virtualMachines', location: 'eastus2', tags: {} });
  for (const [label, vms, resources] of [
    ['null list', 'malformed', []],
    ['missing size', [{ name: 'w-vm01', location: 'eastus2' }], []],
    ['VMs listed but none discovered', [], [vmResource('w-vm01'), vmResource('w-vm02')]],
  ]) {
    const fake = fakeAzure({ groups: vmGroups(), vms: { 'rg-test': vms }, resources: { 'rg-test': resources } });
    await assert.rejects(provision({ policy: cpu, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }), DiscoveryError, label);
    assert.equal(fake.deployments.length, 0, label);
  }
  const aks = await loadPolicy(policyFile('workload-identity-break'));
  const aksGroups = () => ({ 'rg-aks': { location: 'eastus2', tags: { [TAGS.scenario]: aks.scenario } } });
  const clusterResource = { id: rid('rg-aks', 'Microsoft.ContainerService/managedClusters', 'aks'), type: 'Microsoft.ContainerService/managedClusters', location: 'eastus2', tags: {} };
  const healthy = { name: 'w-aks', location: 'eastus2', provisioningState: 'Succeeded', kubernetesVersion: '1.34.5', currentKubernetesVersion: '1.34.5' };
  for (const [label, clusters, resources] of [
    ['null list', 'malformed', []],
    ['cluster listed but none discovered', [], [clusterResource]],
    ['no node pools', [{ ...healthy, agentPoolProfiles: [] }], []],
    ['pool without size', [{ ...healthy, agentPoolProfiles: [{ mode: 'System', count: 2 }] }], []],
  ]) {
    const fake = fakeAzure({ groups: aksGroups(), clusters: { 'rg-aks': clusters }, resources: { 'rg-aks': resources }, resourceGroup: 'rg-aks' });
    await assert.rejects(provision({ policy: aks, az: aksAz(fake), deploy: fake.deploy, resourceGroup: 'rg-aks', log: silent }), DiscoveryError, label);
    assert.equal(fake.deployments.length, 0, label);
  }
});

test('pinned reruns use a bounded, deterministic deployment name for long workloads', async () => {
  const name = `cloud-agent-handover-${'w'.repeat(51)}`;
  assert.ok(name.length > 64);
  const bounded = boundedDeploymentName(name);
  assert.ok(bounded.length <= 64, bounded);
  assert.equal(boundedDeploymentName(name), bounded, 'deterministic across reruns');
  assert.notEqual(boundedDeploymentName(`${name}x`), bounded, 'collision-resistant suffix');
  assert.equal(boundedDeploymentName('cpu-runaway-short'), 'cpu-runaway-short', 'short names are unchanged');
  assert.match(bounded, /^[\w.-]+$/);

  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const groups = { 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario } } };
  const fake = fakeAzure({ groups, vms: { 'rg-test': [{ size: 'Standard_B2s', location: 'eastus2' }, { size: 'Standard_B2s', location: 'eastus2' }] } });
  const result = await provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', deploymentName: name, log: silent });
  assert.equal(result.mode, 'pinned');
  assert.equal(fake.deployments[0].deploymentName, bounded);
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

test('the CLI validates before creating, so a validate-API rejection is the only failure that falls back without a record', async () => {
  const fake = fakeAzure({ validateFailures: ['ERROR: (InvalidTemplateDeployment) (SkuNotAvailable) Standard_B2s is not available'] });
  const code = await main(['deploy', 'cpu-runaway', '--workload', 'test', '--resource-group', 'rg-test', '--location', 'eastus2', '--no-region-fallback'],
    { azFactory: () => fake.az, log: silent, env: { ADMIN_PASSWORD: 'x' }, stateDir: mkdtempSync(join(tmpdir(), 'placement-state-')) });
  assert.equal(code, 0);
  const verbs = fake.calls.filter(args => args[0] === 'deployment' && args[1] === 'group' && ['validate', 'create'].includes(args[2])).map(args => args[2]);
  assert.deepEqual(verbs, ['validate', 'validate', 'create'], 'B2s rejected by validate, next family validated then created');
  const created = fake.calls.find(args => args[2] === 'create');
  assert.ok(created.includes('--name'));
});

test('the real az runner fails explicitly on malformed JSON output', { skip: process.platform === 'win32' }, async () => {
  const bin = mkdtempSync(join(tmpdir(), 'fake-az-'));
  writeFileSync(join(bin, 'az'), '#!/bin/sh\necho "not json"\n');
  chmodSync(join(bin, 'az'), 0o755);
  const az = createAzRunner({ env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  await assert.rejects(az(['vm', 'list-skus', '--output', 'json']), /expected JSON output/);
  assert.ok(existsSync(join(bin, 'az')));
});

test('an empty resource listing is never proof: in-flight, delayed or ambiguous attempts stop without retry', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const cases = [
    // Deployment still running; its resources are not visible yet.
    [{ message: '(SkuNotAvailable) not available', noResources: true, deploymentState: 'Running', operations: [] }, /is running, not terminal/],
    // Terminal deployment, but an operation is still in flight.
    [{ message: '(SkuNotAvailable) not available', noResources: true, operations: [{ properties: { provisioningOperation: 'Create', provisioningState: 'Running',
      targetResource: { id: vmId('pending'), resourceType: 'Microsoft.Compute/virtualMachines' } } }] }, /pending.*is running/],
    // A failed Create may still have left a partial resource that appears later.
    [{ message: '(AllocationFailed) no capacity', noResources: true, operations: [{ properties: { provisioningOperation: 'Create', provisioningState: 'Failed',
      targetResource: { id: vmId('partial'), resourceType: 'Microsoft.Compute/virtualMachines' } } }] }, /recorded a Create operation on .*partial/],
    // Transport failure and no record yet: the deployment may still be starting.
    [{ message: 'ERROR: The operation timed out (connection aborted)', noRecord: true, noResources: true }, /has no record/],
    // A structured server code with an absent record is still not proof.
    [{ message: '(SkuNotAvailable) Standard_B2s is not available', noRecord: true, noResources: true }, /has no record.*not a validation-only rejection/],
  ];
  for (const [failure, reason] of cases) {
    const fake = fakeAzure({ deployFailures: [failure] });
    await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }),
      error => error instanceof PlacementError && reason.test(error.message) && /without retrying/.test(error.message));
    assert.equal(fake.deployments.length, 1, `no retry for ${reason}`);
    assert.deepEqual(deletes(fake), []);
  }
});

test('a nested deployment still in flight blocks retry; a fully terminal read-only attempt still falls back', async () => {
  const policy = await loadPolicy(policyFile('azure-boards-copilot-handover'));
  const nested = fakeAzure({ resourceGroup: 'w-rg', scenario: policy.scenario,
    deployFailures: [{ message: '(LocationIsOfflineForProvisioning) offline', noResources: true, nestedState: 'Running', operations: [] }] });
  await assert.rejects(provision({ policy, az: nested.az, deploy: nested.deploy, workloadName: 'w', resourceGroup: 'w-rg', log: silent }),
    /deployment monitoring is running, not terminal/);
  assert.equal(nested.deployments.length, 1);

  const cpu = await loadPolicy(policyFile('cpu-runaway'));
  const readOnly = fakeAzure({ deployFailures: [{ message: '(SkuNotAvailable) not available', noResources: true,
    operations: [{ properties: { provisioningOperation: 'Read', provisioningState: 'Succeeded', targetResource: { id: vmId('existing') } } }] }] });
  const result = await provision({ policy: cpu, az: readOnly.az, deploy: readOnly.deploy, resourceGroup: 'rg-test', log: silent });
  assert.equal(readOnly.deployments.length, 2, 'a proven non-mutating terminal attempt may fall back');
  assert.equal(result.mode, 'new');

  const unreadable = fakeAzure({ deployFailures: [{ message: '(SkuNotAvailable) not available', noResources: true }], failOn: 'deployment operation' });
  await assert.rejects(provision({ policy: cpu, az: unreadable.az, deploy: unreadable.deploy, resourceGroup: 'rg-test', log: silent }),
    /could not be fully verified/);
  assert.equal(unreadable.deployments.length, 1);
});

test('verifiable legacy workshop deployments are re-adopted and designated; unrelated groups are refused', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const legacyGroup = () => ({ 'rg-test': { location: 'eastus2', tags: { scenario: 'cpu-runaway', environment: 'demo' } } });
  const vm = (name, tags) => ({ id: vmId(name), type: 'Microsoft.Compute/virtualMachines', location: 'eastus2', tags });
  const vms = { 'rg-test': [{ size: 'Standard_B2s', location: 'eastus2' }, { size: 'Standard_B2s', location: 'eastus2' }] };

  const legacy = fakeAzure({ groups: legacyGroup(), vms, resources: { 'rg-test': [vm('a', { scenario: 'cpu-runaway' }), vm('b', { scenario: 'cpu-runaway' })] } });
  const result = await provision({ policy, az: legacy.az, deploy: legacy.deploy, resourceGroup: 'rg-test', log: silent });
  assert.equal(result.mode, 'pinned');
  assert.equal(result.location, 'eastus2');
  assert.equal(legacy.state.groups['rg-test'].tags[TAGS.scenario], 'cpu-runaway', 'designated after a successful rerun');
  assert.equal(legacy.state.groups['rg-test'].tags.scenario, 'cpu-runaway', 'legacy tags are preserved');
  assert.equal(legacy.deployments[0].tags[TAGS.scenario], 'cpu-runaway');
  assert.equal((await runCheck({ policy, az: fakeAzure({ groups: legacyGroup(), vms, resources: { 'rg-test': [vm('a', { scenario: 'cpu-runaway' })] } }).az,
    options: { workload: 'test', resourceGroup: 'rg-test', location: 'eastus2', parts: {} }, log: silent })).ownership, 'legacy');

  const refusals = [
    [{ 'rg-test': { location: 'eastus2', tags: {} } }, [vm('a', { scenario: 'cpu-runaway' })], /group tag scenario=cpu-runaway is missing/],
    [{ 'rg-test': { location: 'eastus2', tags: { scenario: 'iis-app-pool' } } }, [vm('a', { scenario: 'iis-app-pool' })], /group tag scenario=cpu-runaway is missing/],
    [legacyGroup(), [vm('a', { scenario: 'cpu-runaway' }), vm('colleague', {})], /1 resource\(s\) lack tag scenario=cpu-runaway.*colleague/],
  ];
  for (const [groups, resources, reason] of refusals) {
    const fake = fakeAzure({ groups, vms, resources: { 'rg-test': resources } });
    await assert.rejects(provision({ policy, az: fake.az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }),
      error => error instanceof PlacementError && reason.test(error.message) && /refusing to adopt/.test(error.message));
    assert.equal(fake.deployments.length, 0);
    assert.ok(!fake.calls.some(args => args[0] === 'group' && args[1] === 'update'));
  }
});

test('generic legacy Cloud tags need succeeded deployment evidence before a group is re-adopted', async () => {
  const policy = await loadPolicy(policyFile('cloud-agent-handover'));
  const groups = () => ({ 'w-rg': { location: 'eastus2', tags: { workshop: 'sre-agent', environment: 'demo' } } });
  const site = { id: rid('w-rg', 'Microsoft.Web/sites', 'w-app'), type: 'Microsoft.Web/sites', location: 'swedencentral', tags: { workshop: 'sre-agent' } };
  const without = fakeAzure({ groups: groups(), resourceGroup: 'w-rg', scenario: policy.scenario, resources: { 'w-rg': [site] } });
  await assert.rejects(provision({ policy, az: without.az, deploy: without.deploy, resourceGroup: 'w-rg', log: silent }), /no legacy deployment named main/);
  assert.equal(without.deployments.length, 0);

  const partial = fakeAzure({ groups: groups(), resourceGroup: 'w-rg', scenario: policy.scenario, resources: { 'w-rg': [site] } });
  partial.state.records['w-rg/main'] = { properties: { provisioningState: 'Succeeded', outputs: { webAppName: {} } } };
  await assert.rejects(provision({ policy, az: partial.az, deploy: partial.deploy, resourceGroup: 'w-rg', log: silent }), /lacks output\(s\) webAppHostName/);

  const proven = fakeAzure({ groups: groups(), resourceGroup: 'w-rg', scenario: policy.scenario, resources: { 'w-rg': [site] } });
  proven.state.records['w-rg/main'] = { properties: { provisioningState: 'Succeeded', outputs: { webAppName: {}, webAppHostName: {}, logAnalyticsId: {} } } };
  const result = await provision({ policy, az: proven.az, deploy: proven.deploy, resourceGroup: 'w-rg', log: silent });
  assert.equal(result.location, 'swedencentral', 'pinned to the actual workload, never relocated');
  assert.equal(proven.state.groups['w-rg'].tags[TAGS.scenario], policy.scenario);
});

test('legacy AKS deployments from the pre-change workflows (scenario + environment tags, no workshop tag) are re-adopted', async () => {
  for (const id of ['cosmos-rbac-removal', 'workload-identity-break']) {
    const policy = await loadPolicy(policyFile(id));
    // Exact shape of the earlier deploy-*-infra.yml: group and template tags {scenario, environment:demo}.
    const groups = { 'rg-aks': { location: 'eastus2', tags: { scenario: id, environment: 'demo' } } };
    const tags = { scenario: id, environment: 'demo' };
    const resources = { 'rg-aks': [
      { id: rid('rg-aks', 'Microsoft.ContainerService/managedClusters', 'aks'), type: 'Microsoft.ContainerService/managedClusters', location: 'eastus2', tags },
      { id: rid('rg-aks', 'Microsoft.OperationalInsights/workspaces', 'law'), type: 'Microsoft.OperationalInsights/workspaces', location: 'eastus2', tags },
    ] };
    const clusters = { 'rg-aks': [{ name: 'w-aks', location: 'eastus2', provisioningState: 'Succeeded', kubernetesVersion: '1.34.5', currentKubernetesVersion: '1.34.5', agentPoolProfiles: [{ name: 'system', mode: 'System', vmSize: 'Standard_D4s_v5', count: 2, currentOrchestratorVersion: '1.34.5' }] }] };
    const fake = fakeAzure({ groups, resources, clusters, resourceGroup: 'rg-aks', scenario: id });
    const result = await provision({ policy, az: aksAz(fake), deploy: fake.deploy, resourceGroup: 'rg-aks', log: silent });
    assert.equal(result.mode, 'pinned', id);
    assert.equal(fake.state.groups['rg-aks'].tags[TAGS.scenario], id);

    const foreign = fakeAzure({ groups: { 'rg-aks': { location: 'eastus2', tags: { scenario: id, environment: 'demo' } } },
      resources: { 'rg-aks': [...resources['rg-aks'], { id: rid('rg-aks', 'Microsoft.KeyVault/vaults', 'kv'), type: 'Microsoft.KeyVault/vaults', location: 'eastus2', tags: {} }] },
      clusters, resourceGroup: 'rg-aks', scenario: id });
    await assert.rejects(provision({ policy, az: aksAz(foreign), deploy: foreign.deploy, resourceGroup: 'rg-aks', log: silent }), /refusing to adopt/);
    assert.equal(foreign.deployments.length, 0);
  }
});

test('legacy retirement groups accept untagged NICs/disks/auto-shutdown schedules only when Azure reports them attached to accepted VMs', async () => {
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const tags = { workshop: 'sre-agent', environment: 'demo', track: 'vm', scenario: 'vm-size-retirement' };
  const groups = () => ({ 'rg-test': { location: 'eastus2', tags: { ...tags } } });
  const vm = name => ({ id: vmId(name), type: 'Microsoft.Compute/virtualMachines', location: 'eastus2', tags });
  const nicId = name => rid('rg-test', 'Microsoft.Network/networkInterfaces', name);
  const nic = (name, vmName) => ({ id: nicId(name), type: 'Microsoft.Network/networkInterfaces', location: 'eastus2', tags: {},
    properties: vmName ? { virtualMachine: { id: vmId(vmName) } } : {} });
  const disk = (name, vmName) => ({ id: rid('rg-test', 'Microsoft.Compute/disks', name), type: 'Microsoft.Compute/disks', location: 'eastus2', tags: {}, managedBy: vmName ? vmId(vmName) : null });
  const vms = { 'rg-test': [{ size: 'Standard_B2s', location: 'eastus2' }, { size: 'Standard_B2s', location: 'eastus2' }, { size: 'Standard_DS1_v2', location: 'eastus2' }] };
  const attached = [vm('base-1'), vm('base-2'), vm('legacy-01'), nic('legacy-01-nic', 'legacy-01'), disk('legacy-01-os', 'legacy-01')];
  const ok = fakeAzure({ groups: groups(), vms, resources: { 'rg-test': attached }, scenario: policy.scenario });
  const report = await runCheck({ policy, az: ok.az, options: { workload: 'test', resourceGroup: 'rg-test', parts: {} }, log: silent });
  assert.equal(report.ownership, 'legacy');

  // Earlier templates created untagged auto-shutdown schedules per VM.
  const schedule = (name, target) => ({ id: rid('rg-test', 'Microsoft.DevTestLab/schedules', name), name, type: 'Microsoft.DevTestLab/schedules',
    location: 'eastus2', tags: {}, properties: target ? { targetResourceId: target } : {} });
  const withSchedules = [...attached, schedule('shutdown-computevm-base-1', vmId('base-1')), schedule('shutdown-computevm-legacy-01', vmId('legacy-01'))];
  const scheduled = fakeAzure({ groups: groups(), vms, resources: { 'rg-test': withSchedules }, scenario: policy.scenario });
  assert.equal((await runCheck({ policy, az: scheduled.az, options: { workload: 'test', resourceGroup: 'rg-test', parts: {} }, log: silent })).ownership, 'legacy');
  const foreignVm = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-other/providers/Microsoft.Compute/virtualMachines/base-1';

  for (const extra of [nic('stray-nic'), disk('stray-disk'), nic('foreign-nic', 'not-in-group'),
    schedule('shutdown-computevm-base-1', foreignVm), schedule('shutdown-computevm-legacy-01', vmId('base-1')),
    schedule('shutdown-computevm-ghost', vmId('ghost')), schedule('nightly-stop', vmId('base-2')), schedule('shutdown-computevm-base-2')]) {
    const fake = fakeAzure({ groups: groups(), vms, resources: { 'rg-test': [...attached, extra] }, scenario: policy.scenario });
    await assert.rejects(runCheck({ policy, az: fake.az, options: { workload: 'test', resourceGroup: 'rg-test', parts: {} }, log: silent }),
      error => /refusing to adopt/.test(error.message), extra.id);
  }
});

test('existing deployments on SKUs the current policy no longer selects stay usable and are never resized', async () => {
  const aks = await loadPolicy(policyFile('workload-identity-break'));
  const groups = { 'rg-aks': { location: 'eastus2', tags: { [TAGS.scenario]: aks.scenario } } };
  // Earlier workshop versions used 2-vCPU D2ads_v6 system nodes; the current policy requires >= 4 vCPUs.
  const clusters = { 'rg-aks': [{ name: 'test-aks', location: 'eastus2', provisioningState: 'Succeeded', kubernetesVersion: '1.34.5', currentKubernetesVersion: '1.34.5', agentPoolProfiles: [{ name: 'system', mode: 'System', vmSize: 'Standard_D2ads_v6', count: 2, currentOrchestratorVersion: '1.34.5' }] }] };
  const check = fakeAzure({ groups, clusters, resourceGroup: 'rg-aks', scenario: aks.scenario });
  const notes = [];
  const report = await runCheck({ policy: aks, az: aksAz(check), options: { workload: 'test', resourceGroup: 'rg-aks', parts: {} }, log: line => notes.push(line) });
  assert.equal(report.eligible, true, JSON.stringify(report.regions));
  assert.ok(notes.some(line => /D2ads_v6 .*kept unchanged \(no resize\)/.test(line)), notes.join('\n'));
  const fake = fakeAzure({ groups, clusters, resourceGroup: 'rg-aks', scenario: aks.scenario });
  const result = await provision({ policy: aks, az: aksAz(fake), deploy: fake.deploy, resourceGroup: 'rg-aks', log: silent });
  assert.equal(result.sku, 'Standard_D2ads_v6');
  assert.equal(fake.deployments[0].parameters?.systemNodeVmSize ?? result.sku, 'Standard_D2ads_v6');

  const cpu = await loadPolicy(policyFile('cpu-runaway'));
  // An older VM size that is not in the policy and not even offered in the region any more.
  const vms = { 'rg-test': [{ size: 'Standard_A2_v2', location: 'eastus2' }, { size: 'Standard_A2_v2', location: 'eastus2' }] };
  const vmCheck = await runCheck({ policy: cpu, az: fakeAzure({ vms }).az, options: { workload: 'test', resourceGroup: 'rg-test', parts: {} }, log: silent });
  assert.equal(vmCheck.eligible, true, JSON.stringify(vmCheck.regions));
  assert.match(vmCheck.regions[0].notes.join(' '), /Standard_A2_v2 .*kept unchanged/);
  const vmFake = fakeAzure({ vms });
  const pinned = await provision({ policy: cpu, az: vmFake.az, deploy: vmFake.deploy, resourceGroup: 'rg-test', log: silent });
  assert.equal(pinned.sku, 'Standard_A2_v2');
  // A missing VM on an unknown SKU cannot be quota-checked: fail closed.
  const short = { 'rg-test': [{ size: 'Standard_A2_v2', location: 'eastus2' }] };
  const shortCheck = await runCheck({ policy: cpu, az: fakeAzure({ vms: short }).az, options: { workload: 'test', resourceGroup: 'rg-test', parts: {} }, log: silent });
  assert.equal(shortCheck.eligible, false);
});

test('a retirement target is proposed read-only by check and persisted (and verified) before the first resize', async () => {
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const groups = () => ({ 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario, [TAGS.location]: 'eastus2', [TAGS.sku]: 'Standard_B2s' } } });
  const baseline = [{ size: 'Standard_B2s', location: 'eastus2' }, { size: 'Standard_B2s', location: 'eastus2' }];
  const legacy = [{ size: 'Standard_DS1_v2', location: 'eastus2' }, { size: 'Standard_DS2_v2', location: 'eastus2' }, { size: 'Standard_DS1_v2', location: 'eastus2' }];
  const targetsOnly = { services: false, compute: false, fleet: false, targets: true };
  const options = extra => ({ workload: 'test', resourceGroup: 'rg-test', parts: targetsOnly, noRegionFallback: true, claimSettleMs: 0, ...extra });

  const readOnly = fakeAzure({ groups: groups(), vms: { 'rg-test': [...baseline, ...legacy] }, scenario: policy.scenario });
  const proposed = await runCheck({ policy, az: readOnly.az, options: options(), log: silent });
  assert.equal(proposed.remediationTarget, 'Standard_D2s_v5');
  assert.equal(proposed.remediationTargetRecorded, false, 'check is truthful: the target is only proposed');
  assert.ok(!readOnly.calls.some(args => args[0] === 'group' && args[1] === 'update'), 'plain check never writes');

  const record = fakeAzure({ groups: groups(), vms: { 'rg-test': [...baseline, ...legacy] }, scenario: policy.scenario });
  const recorded = await runCheck({ policy, az: record.az, options: options({ recordTarget: true }), log: silent });
  assert.equal(recorded.remediationTargetRecorded, true);
  assert.equal(record.state.groups['rg-test'].tags[TAGS.remediationTarget], 'Standard_D2s_v5');
  // Later the preferred family becomes unavailable: the recorded target is rechecked, never swapped.
  const later = fakeAzure({ groups: structuredClone(record.state.groups), vms: { 'rg-test': [...baseline, ...legacy] }, scenario: policy.scenario,
    regions: { eastus2: { skus: STANDARD_SKUS.map(item => item.name === 'Standard_D2s_v5' ? sku('Standard_D2s_v5', 'standardDSv5Family', { restrictedIn: 'eastus2' }) : item) } } });
  const rechecked = await runCheck({ policy, az: later.az, options: options({ recordTarget: true }), log: silent });
  assert.equal(rechecked.eligible, false);
  assert.equal(later.state.groups['rg-test'].tags[TAGS.remediationTarget], 'Standard_D2s_v5');

  // Interrupted migration on a group missing the tag: resume with the applied size.
  const partial = [{ size: 'Standard_D2as_v5', location: 'eastus2' }, { size: 'Standard_DS2_v2', location: 'eastus2' }, { size: 'Standard_DS1_v2', location: 'eastus2' }];
  const resumed = fakeAzure({ groups: groups(), vms: { 'rg-test': [...baseline, ...partial] }, scenario: policy.scenario });
  const resumedReport = await runCheck({ policy, az: resumed.az, options: options({ recordTarget: true }), log: silent });
  assert.equal(resumedReport.remediationTarget, 'Standard_D2as_v5');
  assert.equal(resumed.state.groups['rg-test'].tags[TAGS.remediationTarget], 'Standard_D2as_v5');
  // A deploy rerun of the same group also resumes with (and records) that size.
  const rerun = fakeAzure({ groups: groups(), vms: { 'rg-test': [...baseline, ...partial] }, scenario: policy.scenario });
  const pinned = await provision({ policy, az: rerun.az, deploy: rerun.deploy, resourceGroup: 'rg-test', log: silent });
  assert.equal(pinned.context.remediationTarget, 'Standard_D2as_v5');
  assert.equal(rerun.state.groups['rg-test'].tags[TAGS.remediationTarget], 'Standard_D2as_v5');
  // Baseline VMs on a size that is also a remediation target are not mistaken for resized legacy VMs.
  const modernBaseline = [{ size: 'Standard_D2s_v5', location: 'eastus2' }, { size: 'Standard_D2s_v5', location: 'eastus2' }];
  const baselineGroups = { 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario, [TAGS.sku]: 'Standard_D2s_v5' } } };
  const modern = await runCheck({ policy, az: fakeAzure({ groups: baselineGroups, vms: { 'rg-test': [...modernBaseline, ...legacy] }, scenario: policy.scenario }).az,
    options: options(), log: silent });
  assert.equal(modern.remediationTargetRecorded, false);
  // Two different applied sizes are ambiguous: fail closed, write nothing.
  const mixed = fakeAzure({ groups: groups(), vms: { 'rg-test': [...baseline, { size: 'Standard_D2as_v5', location: 'eastus2' }, { size: 'Standard_D2s_v4', location: 'eastus2' }, legacy[0]] }, scenario: policy.scenario });
  await assert.rejects(runCheck({ policy, az: mixed.az, options: options({ recordTarget: true }), log: silent }), /already resized to Standard_D2as_v5 and Standard_D2s_v4/);
  assert.ok(!mixed.calls.some(args => args[0] === 'group' && args[1] === 'update'));
  // A record that cannot be confirmed by readback stops before any resize.
  const lost = fakeAzure({ groups: groups(), vms: { 'rg-test': [...baseline, ...legacy] }, scenario: policy.scenario });
  const originalAz = lost.az;
  const dropUpdates = async args => (args[0] === 'group' && args[1] === 'update' ? {} : originalAz(args));
  await assert.rejects(runCheck({ policy, az: dropUpdates, options: options({ recordTarget: true }), log: silent }), /could not be confirmed/);
});

test('a missing baseline VM is never confused with a fleet VM already migrated to the baseline size', async () => {
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const at = (name, size) => ({ name, size, location: 'eastus2' });
  // Modern baseline on D2s_v5 with test-vm02 missing; one legacy VM was already migrated to D2s_v5.
  const vms = [at('test-vm01', 'Standard_D2s_v5'), at('test-legacy-01', 'Standard_D2s_v5'),
    at('test-legacy-02', 'Standard_DS2_v2'), at('test-legacy-03', 'Standard_DS1_v2')];
  const groups = tags => ({ 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario, [TAGS.sku]: 'Standard_D2s_v5', ...tags } } });

  const state = await inspectExisting(policy, 'rg-test', fakeAzure({ groups: groups(), vms: { 'rg-test': vms }, scenario: policy.scenario }).az);
  assert.deepEqual(state.baselineExisting, { standard_d2s_v5: 1 });
  assert.equal(state.existing.standard_d2s_v5, 2);
  // Detection uses the discovered baseline (1), not the configured count (2).
  assert.equal(resumableRemediationTarget(policy, state, 'rg-test'), 'Standard_D2s_v5');

  // A different recorded target is refused: the migrated VM proves D2s_v5 is in use.
  const other = fakeAzure({ groups: groups({ [TAGS.remediationTarget]: 'Standard_D2as_v5' }), vms: { 'rg-test': vms }, scenario: policy.scenario });
  await assert.rejects(verifyRemediationTarget({ policy, az: other.az, resourceGroup: 'rg-test', target: 'Standard_D2as_v5' }),
    /already resized to Standard_D2s_v5; refusing to mix/);
  const same = fakeAzure({ groups: groups({ [TAGS.remediationTarget]: 'Standard_D2s_v5' }), vms: { 'rg-test': vms }, scenario: policy.scenario });
  await verifyRemediationTarget({ policy, az: same.az, resourceGroup: 'rg-test', target: 'Standard_D2s_v5' });

  // check resumes the applied target instead of selecting another.
  const check = await runCheck({ policy, az: fakeAzure({ groups: groups(), vms: { 'rg-test': vms }, scenario: policy.scenario }).az,
    options: { workload: 'test', resourceGroup: 'rg-test', parts: { services: false, compute: false, fleet: false, targets: true }, noRegionFallback: true }, log: silent });
  assert.equal(check.remediationTarget, 'Standard_D2s_v5');

  // Quota: the migrated VM is attributed as migrated (less remaining demand) only with actual baseline counts.
  const catalog = STANDARD_SKUS;
  const target = catalog.find(item => item.name === 'Standard_D2s_v5');
  const already = name => Number(state.existing[name.toLowerCase()] ?? 0);
  const configured = remediationDemands(policy, catalog, target, 'Standard_D2s_v5', already);
  const actual = remediationDemands(policy, catalog, target, 'Standard_D2s_v5', already, { baselineAlready: name => Number(state.baselineExisting[name.toLowerCase()] ?? 0) });
  const total = demands => demands.reduce((sum, item) => sum + item.vcpus, 0);
  assert.ok(total(actual) < total(configured), `${JSON.stringify(actual)} vs ${JSON.stringify(configured)}`);
  // ...and the missing baseline VM's recreation is still counted on rerun (existing-SKU path).
  const evaluation = await evaluateRegion(policy, 'eastus2', fakeAzure({ groups: groups(), vms: { 'rg-test': vms }, scenario: policy.scenario }).az,
    { existingSku: 'Standard_D2s_v5', existing: state.existing, baselineExisting: state.baselineExisting, parts: { services: false, fleet: false, targets: false } });
  assert.equal(evaluation.candidates[0]?.sku, 'Standard_D2s_v5', JSON.stringify(evaluation));
});

test('concurrent first target claims never both resize with different families', async () => {
  const policy = await loadPolicy(policyFile('vm-size-retirement'));
  const groups = () => ({ 'rg-test': { location: 'eastus2', tags: { [TAGS.scenario]: policy.scenario, [TAGS.location]: 'eastus2', [TAGS.sku]: 'Standard_B2s' } } });
  const baseline = [{ size: 'Standard_B2s', location: 'eastus2' }, { size: 'Standard_B2s', location: 'eastus2' }];
  const legacy = [{ size: 'Standard_DS1_v2', location: 'eastus2' }, { size: 'Standard_DS2_v2', location: 'eastus2' }, { size: 'Standard_DS1_v2', location: 'eastus2' }];
  const options = { workload: 'test', resourceGroup: 'rg-test', parts: { services: false, compute: false, fleet: false, targets: true },
    noRegionFallback: true, recordTarget: true, claimSettleMs: 5 };
  const otherTag = state => { state.groups['rg-test'].tags[TAGS.remediationTarget] = 'Standard_D2as_v5'; };

  // 1. B's claim lands between A's check and A's write: A refuses to overwrite it.
  const early = fakeAzure({ groups: groups(), vms: { 'rg-test': [...baseline, ...legacy] }, scenario: policy.scenario });
  let checks = 0;
  const earlyAz = async args => {
    if (args[0] === 'group' && args[1] === 'show' && ++checks === 2) otherTag(early.state);
    return early.az(args);
  };
  await assert.rejects(runCheck({ policy, az: earlyAz, options, log: silent, sleep: async () => {} }), /Another run recorded remediation target Standard_D2as_v5/);
  assert.equal(early.state.groups['rg-test'].tags[TAGS.remediationTarget], 'Standard_D2as_v5', 'the concurrent claim is never overwritten');

  // 2. B overwrites A's claim during A's settle interval: A detects it before any resize.
  const settle = fakeAzure({ groups: groups(), vms: { 'rg-test': [...baseline, ...legacy] }, scenario: policy.scenario });
  let slept = 0;
  await assert.rejects(runCheck({ policy, az: settle.az, options, log: silent, sleep: async ms => { slept = ms; otherTag(settle.state); } }),
    /now records remediation target Standard_D2as_v5.*claim lost/);
  assert.equal(slept, 5, 'the settle interval is honoured');
  assert.ok(!settle.calls.some(args => args[0] === 'vm' && args[1] === 'resize'));

  // 3. B's write lands only after A confirmed (residual window): per-resize
  //    verification stops A before its next resize, and a fleet already holding
  //    another target family fails closed even when the tag matches.
  const late = fakeAzure({ groups: groups(), vms: { 'rg-test': [...baseline, ...legacy] }, scenario: policy.scenario });
  const report = await runCheck({ policy, az: late.az, options, log: silent, sleep: async () => {} });
  assert.equal(report.remediationTarget, 'Standard_D2s_v5');
  await verifyRemediationTarget({ policy, az: late.az, resourceGroup: 'rg-test', target: 'Standard_D2s_v5' });
  otherTag(late.state);
  await assert.rejects(verifyRemediationTarget({ policy, az: late.az, resourceGroup: 'rg-test', target: 'Standard_D2s_v5' }), /now records remediation target Standard_D2as_v5/);
  const mixed = fakeAzure({ groups: { 'rg-test': { ...groups()['rg-test'], tags: { ...groups()['rg-test'].tags, [TAGS.remediationTarget]: 'Standard_D2s_v5' } } },
    vms: { 'rg-test': [...baseline, { size: 'Standard_D2as_v5', location: 'eastus2' }, ...legacy.slice(1)] }, scenario: policy.scenario });
  await assert.rejects(verifyRemediationTarget({ policy, az: mixed.az, resourceGroup: 'rg-test', target: 'Standard_D2s_v5' }), /already resized to Standard_D2as_v5; refusing to mix/);

  // A deploy rerun never overwrites a target another run recorded meanwhile.
  const partial = [{ size: 'Standard_D2as_v5', location: 'eastus2' }, { size: 'Standard_DS2_v2', location: 'eastus2' }, { size: 'Standard_DS1_v2', location: 'eastus2' }];
  const rerun = fakeAzure({ groups: groups(), vms: { 'rg-test': [...baseline, ...partial] }, scenario: policy.scenario,
    onDeploy: state => { state.groups['rg-test'].tags[TAGS.remediationTarget] = 'Standard_D2s_v4'; } });
  await assert.rejects(provision({ policy, az: rerun.az, deploy: rerun.deploy, resourceGroup: 'rg-test', log: silent }), /another run recorded remediation target Standard_D2s_v4/);
  assert.equal(rerun.state.groups['rg-test'].tags[TAGS.remediationTarget], 'Standard_D2s_v4');
});

test('first placement aborts before deploying when the empty group gains resources during preflight', async () => {
  const policy = await loadPolicy(policyFile('cpu-runaway'));
  const fake = fakeAzure({});
  let injected = false;
  const az = async args => {
    if (!injected && args[0] === 'vm' && args[1] === 'list-skus') {
      injected = true;
      fake.state.resources['rg-test'] = [{ id: rid('rg-test', 'Microsoft.Network/virtualNetworks', 'someone-elses'), type: 'Microsoft.Network/virtualNetworks', location: 'eastus2' }];
    }
    return fake.az(args);
  };
  await assert.rejects(provision({ policy, az, deploy: fake.deploy, resourceGroup: 'rg-test', log: silent }),
    /was empty when checked but now contains 1 resource\(s\).*Nothing was deployed or deleted/s);
  assert.equal(fake.deployments.length, 0, 'no deployment is started');
  assert.ok(!fake.calls.some(args => args[0] === 'resource' && args[1] === 'delete'));
  assert.equal(fake.state.resources['rg-test'].length, 1);
});

test('check --require-group fails without writing unless the group is ready for deploy', async () => {
  const errors = [];
  const originalError = console.error;
  console.error = message => errors.push(message);
  const writes = fake => fake.calls.filter(args => ['create', 'update', 'delete'].includes(args[1]) || ['create', 'delete'].includes(args[2]));
  const args = ['check', 'cpu-runaway', '--workload', 'test', '--resource-group', 'rg-test', '--require-group'];
  try {
    const missing = fakeAzure({ groups: {} });
    assert.equal(await main(args, { azFactory: () => missing.az, log: silent, env: {} }), 1);
    assert.ok(errors.some(message => /not ready for deploy[\s\S]*az group create --name rg-test/.test(message)));
    const undesignated = fakeAzure({ groups: { 'rg-test': { location: 'eastus2', tags: {} } } });
    assert.equal(await main(args, { azFactory: () => undesignated.az, log: silent, env: {} }), 1);
    const designated = fakeAzure({});
    assert.equal(await main(args, { azFactory: () => designated.az, log: silent, env: {} }), 0);
    for (const fake of [missing, undesignated, designated]) assert.deepEqual(writes(fake), []);
    // Without --require-group a plain eligibility check still succeeds.
    assert.equal(await main(args.slice(0, -1), { azFactory: () => fakeAzure({ groups: {} }).az, log: silent, env: {} }), 0);
  } finally {
    console.error = originalError;
  }
});
