// Shared, dependency-free placement engine for workshop scenarios.
// Scenario policies (scenarios/<id>/infra/placement.json) own the candidate
// regions, compute families and service checks; this module only evaluates
// and orchestrates them. Every Azure call goes through an injected `az`
// function so selection, retry and cleanup logic can be tested with fixtures.

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export const TAGS = Object.freeze({
  scenario: 'sre-workshop-scenario',
  attempt: 'sre-workshop-attempt',
  location: 'sre-workshop-location',
  sku: 'sre-workshop-sku',
  remediationTarget: 'sre-workshop-remediation-target',
});

export class AzError extends Error {
  constructor(args, code, stderr) {
    super(`az ${args.slice(0, 3).join(' ')} failed (exit ${code}): ${String(stderr).trim()}`);
    this.name = 'AzError';
    this.args = args;
    this.code = code;
    this.stderr = String(stderr);
  }
}

export class DiscoveryError extends Error {
  constructor(what, cause) {
    super(`Discovery failed while ${what}; this is not treated as "unavailable". ${cause?.message ?? cause}`);
    this.name = 'DiscoveryError';
  }
}

export class PlacementError extends Error {
  constructor(message, { attempts = [], diagnostic } = {}) {
    super(message);
    this.name = 'PlacementError';
    this.attempts = attempts;
    this.diagnostic = diagnostic;
  }
}

export const normalizeRegion = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Retry only capacity/eligibility failures. Anything else is fatal.
const SKU_FAILURES = [
  /SkuNotAvailable/i,
  /\bAllocationFailed\b/i,
  /ZonalAllocationFailed/i,
  /Overconstrained(Zonal)?AllocationRequest/i,
  /\bQuotaExceeded\b/i,
  /InsufficientVCPUQuota/i,
  /OperationNotAllowed[\s\S]{0,400}\bquota\b/i,
  /exceed(s|ing)? (the )?approved [\s\S]{0,60}quota/i,
  /NotAvailableForSubscription/i,
  /(VMSize|Sku)NotSupported|UnsupportedVMSize/i,
  /capacity restriction/i,
];
const REGION_FAILURES = [
  /LocationNotAvailableForResourceType/i,
  /RegionDoesNotAllowProvisioning/i,
  /LocationIsOfflineForProvisioning/i,
  // NoRegisteredProviderFound is deliberately fatal: it usually means an
  // invalid API version or an unregistered provider, not regional capacity.
  /(AgentPool)?K8sVersionNotSupported|KubernetesVersionNotSupported/i,
  /high demand in (the )?(\w+ )?region/i,
  /SubscriptionIsOverQuotaForSku/i,
  /not (currently )?(supported|available) in (this|the) (region|location)/i,
  /Serverless[\s\S]{0,80}not (supported|available)/i,
];

export function classifyFailure(text, { hasSkuFallback = true } = {}) {
  const message = String(text ?? '');
  if (SKU_FAILURES.some(pattern => pattern.test(message))) return hasSkuFallback ? 'sku' : 'region';
  if (REGION_FAILURES.some(pattern => pattern.test(message))) return 'region';
  return 'fatal';
}

export async function loadPolicy(file) {
  const policy = JSON.parse(await readFile(file, 'utf8'));
  validatePolicy(policy, file);
  policy.file = path.resolve(file);
  policy.capsule = path.resolve(path.dirname(file), '..');
  return policy;
}

export function validatePolicy(policy, label = 'policy') {
  const fail = message => { throw new Error(`${label}: ${message}`); };
  if (!/^[a-z0-9-]+$/.test(policy?.scenario ?? '')) fail('scenario id is required');
  if (!Array.isArray(policy.regions) || policy.regions.length === 0 || policy.regions.length > 6) {
    fail('regions must be a bounded, ordered list (1-6 entries)');
  }
  if (new Set(policy.regions.map(normalizeRegion)).size !== policy.regions.length) fail('regions must be unique');
  const kind = policy.compute?.kind ?? 'none';
  if (!['vm', 'aks', 'none'].includes(kind)) fail('compute.kind must be vm, aks or none');
  if (kind !== 'none') {
    const { skus, count } = policy.compute;
    if (!Array.isArray(skus) || skus.length === 0 || skus.length > 6) fail('compute.skus must be a bounded, ordered list (1-6 entries)');
    if (!Number.isInteger(count) || count < 1) fail('compute.count must be a positive integer');
    if (!policy.deployment?.parameters || !Object.values(policy.deployment.parameters).includes('{sku}')) {
      fail('deployment.parameters must pass {sku} to the template');
    }
  }
  for (const entry of policy.fixedFleet ?? []) {
    if (!entry.sku || !Number.isInteger(entry.count)) fail('fixedFleet entries need sku and count');
  }
  if (!policy.deployment?.template) fail('deployment.template is required');
  if (!['group', 'subscription'].includes(policy.deployment.scope ?? 'group')) fail('deployment.scope must be group or subscription');
  return policy;
}

function capability(sku, name) {
  return sku?.capabilities?.find(item => item.name === name)?.value;
}

export function skuVcpus(sku) {
  return Number(capability(sku, 'vCPUs') ?? NaN);
}

// Returns null when the SKU is eligible, otherwise a human-readable reason.
export function skuIneligibility(sku, region, requires = {}) {
  if (!sku) return 'not offered in this region';
  const restriction = (sku.restrictions ?? []).find(item => item.type === 'Location'
    && (item.values ?? item.restrictionInfo?.locations ?? []).map(normalizeRegion).includes(normalizeRegion(region)));
  if (restriction) return `restricted for this subscription (${restriction.reasonCode ?? 'Location'})`;
  const vcpus = skuVcpus(sku);
  if (requires.vCPUs && vcpus !== requires.vCPUs) return `has ${vcpus} vCPUs, ${requires.vCPUs} required`;
  if (requires.minMemoryGB && Number(capability(sku, 'MemoryGB')) < requires.minMemoryGB) {
    return `has less than ${requires.minMemoryGB} GB memory`;
  }
  const architecture = capability(sku, 'CpuArchitectureType');
  if (requires.architecture && architecture && architecture !== requires.architecture) {
    return `CPU architecture ${architecture}, ${requires.architecture} required`;
  }
  if (requires.premiumIO && capability(sku, 'PremiumIO') !== 'True') return 'does not support Premium SSD';
  const generations = capability(sku, 'HyperVGenerations');
  if (requires.hyperVGeneration && generations && !generations.split(',').includes(requires.hyperVGeneration)) {
    return `does not support Hyper-V generation ${requires.hyperVGeneration}`;
  }
  const controllers = capability(sku, 'DiskControllerTypes');
  if (requires.diskController && controllers && !controllers.split(',').includes(requires.diskController)) {
    return `disk controller ${controllers}, ${requires.diskController} required by the template`;
  }
  return null;
}

async function discover(what, call) {
  try {
    return await call();
  } catch (error) {
    throw new DiscoveryError(what, error);
  }
}

function locationsInclude(list, region) {
  const wanted = normalizeRegion(region);
  return (list ?? []).some(item => normalizeRegion(typeof item === 'string' ? item : item?.name ?? item?.displayName) === wanted);
}

function cached(cache, key, what, call) {
  if (!cache.has(key)) cache.set(key, discover(what, call));
  return cache.get(key);
}

// Region-level service checks. Each returns { issue?, context? }.
const regionChecks = {
  async provider(check, region, az, cache) {
    const provider = await cached(cache, `provider:${check.namespace}`, `reading provider ${check.namespace}`,
      () => az(['provider', 'show', '--namespace', check.namespace, '--output', 'json']));
    if (provider?.registrationState && provider.registrationState !== 'Registered') {
      return { issue: `${check.namespace} is ${provider.registrationState}; run: az provider register --namespace ${check.namespace}` };
    }
    const type = (provider?.resourceTypes ?? []).find(item => item.resourceType?.toLowerCase() === check.resourceType.toLowerCase());
    if (!type) throw new DiscoveryError(`reading ${check.namespace}/${check.resourceType}`, 'resource type not returned');
    if ((type.locations ?? []).length && !locationsInclude(type.locations, region)) {
      return { issue: `${check.namespace}/${check.resourceType} is not offered in ${region}` };
    }
    return {};
  },
  async aksVersion(check, region, az, cache) {
    const result = await cached(cache, `aks:${region}`, `listing AKS versions in ${region}`,
      () => az(['aks', 'get-versions', '--location', region, '--output', 'json']));
    const offered = (result?.values ?? []).filter(item => !item.isPreview).map(item => item.version);
    const version = check.versions.find(candidate => offered.includes(candidate));
    if (!version) return { issue: `none of AKS versions ${check.versions.join(', ')} is generally available in ${region}` };
    return { context: { kubernetesVersion: version } };
  },
  async appServiceLinux(check, region, az, cache) {
    const list = await cached(cache, `appservice:${check.sku}`, `listing Linux App Service ${check.sku} regions`,
      () => az(['appservice', 'list-locations', '--sku', check.sku, '--linux-workers-enabled', '--output', 'json']));
    if (!locationsInclude(list, region)) return { issue: `Linux App Service ${check.sku} is not offered in ${region}` };
    return {};
  },
  async functionsConsumption(check, region, az, cache) {
    const list = await cached(cache, 'functions', 'listing Functions Consumption regions',
      () => az(['functionapp', 'list-consumption-locations', '--output', 'json']));
    if (!locationsInclude(list, region)) return { issue: `Functions Consumption is not offered in ${region}` };
    return {};
  },
  async cosmos(check, region, az, cache) {
    const list = await cached(cache, 'cosmos', 'listing Cosmos DB regions',
      () => az(['cosmosdb', 'locations', 'list', '--output', 'json']));
    const entry = (list ?? []).find(item => normalizeRegion(item.name) === normalizeRegion(region)
      || normalizeRegion(String(item.id ?? '').split('/').pop()) === normalizeRegion(region));
    if (!entry) return { issue: `Cosmos DB is not offered in ${region}` };
    if (entry.properties?.isSubscriptionRegionAccessAllowedForRegular === false) {
      return { issue: `Cosmos DB access in ${region} is not allowed for this subscription` };
    }
    return {};
  },
};

// Each demand is { family, vcpus }. Returns the first quota shortfall or null.
export function quotaShortfall(usage, demands) {
  const totals = new Map();
  for (const demand of demands) {
    totals.set(demand.family, (totals.get(demand.family) ?? 0) + demand.vcpus);
    totals.set('cores', (totals.get('cores') ?? 0) + demand.vcpus);
  }
  for (const [family, needed] of totals) {
    const entry = (usage ?? []).find(item => (item.name?.value ?? item.name) === family);
    if (!entry) return `no vCPU quota is visible for ${family}`;
    const free = Number(entry.limit) - Number(entry.currentValue);
    if (free < needed) {
      return `${family === 'cores' ? 'total regional' : family} vCPU quota has ${free} free, ${needed} required`;
    }
  }
  return null;
}

function findSku(skus, name) {
  return (skus ?? []).find(item => item.name?.toLowerCase() === String(name).toLowerCase());
}

/**
 * Evaluate one region against the policy. Discovery failures throw.
 * parts selects demand groups: services, compute, fleet, targets.
 */
export async function evaluateRegion(policy, region, az, { cache = new Map(), skus: skuOverride, parts = {}, existing = {} } = {}) {
  const already = name => Number(existing[String(name).toLowerCase()] ?? 0);
  const include = { services: true, compute: true, fleet: true, targets: true, ...parts };
  const result = { region, issues: [], candidates: [], rejected: [], context: {} };
  if (include.services) {
    for (const check of policy.regionChecks ?? []) {
      const handler = regionChecks[check.type];
      if (!handler) throw new Error(`Unknown region check type ${check.type}`);
      const outcome = await handler(check, region, az, cache);
      if (outcome.issue) result.issues.push(outcome.issue);
      Object.assign(result.context, outcome.context ?? {});
    }
    if (result.issues.length) return result;
  }
  const kind = policy.compute?.kind ?? 'none';
  const useCompute = include.compute && kind !== 'none';
  const useFleet = include.fleet && (policy.fixedFleet?.length ?? 0) > 0;
  const useTargets = include.targets && (policy.remediationTargets?.length ?? 0) > 0;
  if (!useCompute && !useFleet && !useTargets) {
    result.candidates.push({ sku: null });
    return result;
  }
  const catalog = await cached(cache, `skus:${region}`, `listing VM SKUs in ${region}`,
    () => az(['vm', 'list-skus', '--location', region, '--resource-type', 'virtualMachines', '--all', '--output', 'json']));
  const usage = await cached(cache, `usage:${region}`, `reading vCPU quota in ${region}`,
    () => az(['vm', 'list-usage', '--location', region, '--output', 'json']));
  const fixedDemands = [];
  if (useFleet) {
    for (const entry of policy.fixedFleet) {
      const sku = findSku(catalog, entry.sku);
      const reason = skuIneligibility(sku, region, entry.requires ?? {});
      if (reason) { result.issues.push(`${entry.sku} ${reason}`); continue; }
      fixedDemands.push({ family: sku.family, vcpus: skuVcpus(sku) * Math.max(0, entry.count - already(entry.sku)) });
    }
    const shortfall = result.issues.length ? null : quotaShortfall(usage, fixedDemands);
    if (shortfall) result.issues.push(`${policy.fixedFleetLabel ?? 'fixed fleet'}: ${shortfall}`);
    if (result.issues.length) {
      result.fleetUnavailable = true;
      return result;
    }
  }
  const computeSkus = useCompute ? (skuOverride ?? policy.compute.skus) : [null];
  for (const name of computeSkus) {
    const demands = [...fixedDemands];
    if (name) {
      const sku = findSku(catalog, name);
      const reason = skuIneligibility(sku, region, policy.compute.requires ?? {});
      if (reason) { result.rejected.push({ sku: name, reason }); continue; }
      // Existing nodes/VMs of this size are already counted in current usage.
      const nodes = Math.max(0, policy.compute.count + (policy.compute.surge ?? 0) - already(name));
      demands.push({ family: sku.family, vcpus: skuVcpus(sku) * nodes });
    }
    const shortfall = demands.length ? quotaShortfall(usage, demands) : null;
    if (shortfall) { result.rejected.push({ sku: name, reason: shortfall }); continue; }
    let remediationTarget;
    if (useTargets) {
      const reasons = [];
      for (const targetName of policy.remediationTargets) {
        const targetSku = findSku(catalog, targetName);
        const reason = skuIneligibility(targetSku, region, policy.remediationRequires ?? {})
          ?? quotaShortfall(usage, [...demands, { family: targetSku.family, vcpus: skuVcpus(targetSku) }]);
        if (!reason) { remediationTarget = targetName; break; }
        reasons.push(`${targetName}: ${reason}`);
      }
      if (!remediationTarget) {
        result.rejected.push({ sku: name, reason: `no eligible modern remediation target (${reasons.join('; ')})` });
        continue;
      }
    }
    result.candidates.push({ sku: name, remediationTarget });
  }
  return result;
}

export function orderedRegions(policy, requested, { noFallback = false } = {}) {
  const regions = policy.regions.map(normalizeRegion);
  if (!requested) return regions;
  const wanted = normalizeRegion(requested);
  if (!regions.includes(wanted)) {
    throw new PlacementError(`Region ${requested} is not supported by ${policy.scenario}. Supported, in order: ${regions.join(', ')}`);
  }
  return noFallback ? [wanted] : [wanted, ...regions.filter(region => region !== wanted)];
}

export async function inspectExisting(policy, resourceGroup, az) {
  const group = await discover(`reading resource group ${resourceGroup}`,
    () => az(['group', 'show', '--name', resourceGroup, '--output', 'json']));
  const kind = policy.compute?.kind ?? 'none';
  const existing = {};
  const workloadLocations = new Set();
  let sku = null;
  const context = {};
  const vms = await discover(`listing VMs in ${resourceGroup}`, () => az(['vm', 'list', '--resource-group', resourceGroup,
    '--query', '[].{size:hardwareProfile.vmSize, location:location}', '--output', 'json'])) ?? [];
  for (const vm of vms) {
    const size = String(vm.size).toLowerCase();
    existing[size] = (existing[size] ?? 0) + 1;
    workloadLocations.add(normalizeRegion(vm.location));
  }
  if (kind === 'vm') {
    const fixed = new Set((policy.fixedFleet ?? []).map(entry => entry.sku.toLowerCase()));
    sku = vms.map(vm => vm.size).find(size => policy.compute.skus.some(item => item.toLowerCase() === String(size).toLowerCase()))
      ?? vms.map(vm => vm.size).find(size => !fixed.has(String(size).toLowerCase())) ?? null;
  }
  if (kind === 'aks') {
    const clusters = await discover(`listing AKS clusters in ${resourceGroup}`,
      () => az(['aks', 'list', '--resource-group', resourceGroup, '--output', 'json'])) ?? [];
    for (const cluster of clusters) {
      workloadLocations.add(normalizeRegion(cluster.location));
      for (const pool of cluster.agentPoolProfiles ?? []) {
        const size = String(pool.vmSize).toLowerCase();
        existing[size] = (existing[size] ?? 0) + Number(pool.count ?? 0);
      }
      const system = (cluster.agentPoolProfiles ?? []).find(pool => pool.mode === 'System') ?? cluster.agentPoolProfiles?.[0];
      sku = sku ?? system?.vmSize ?? null;
      const version = String(cluster.currentKubernetesVersion ?? cluster.kubernetesVersion ?? '').split('.').slice(0, 2).join('.');
      if (version && !context.kubernetesVersion) context.kubernetesVersion = version;
    }
  }
  const recorded = group?.tags?.[TAGS.location] ? normalizeRegion(group.tags[TAGS.location]) : null;
  if (workloadLocations.size > 1) {
    throw new PlacementError(`${resourceGroup} contains workload resources in several regions (${[...workloadLocations].join(', ')}); refusing to guess its placement.`);
  }
  const actual = [...workloadLocations][0] ?? null;
  if (recorded && actual && recorded !== actual) {
    throw new PlacementError(`${resourceGroup} records placement ${recorded} but its workload runs in ${actual}; resolve this before rerunning.`);
  }
  return {
    group, existing, context, sku: sku ?? group?.tags?.[TAGS.sku] ?? null,
    location: actual ?? recorded ?? normalizeRegion(group.location),
    remediationTarget: group?.tags?.[TAGS.remediationTarget],
  };
}

// Delete only a resource group this attempt provably created: it must carry
// this attempt's tag, and every resource inside must have been created after
// the attempt started. Anything else stops without deleting.
export async function cleanupAttempt({ az, resourceGroup, attemptId, startedAt, log = console.log }) {
  const exists = await az(['group', 'exists', '--name', resourceGroup, '--output', 'json']);
  if (!exists) return 'absent';
  const stop = reason => new PlacementError(`Cleanup stopped: ${reason}. Nothing was deleted; inspect ${resourceGroup} manually.`);
  const group = await az(['group', 'show', '--name', resourceGroup, '--output', 'json']);
  if (group?.tags?.[TAGS.attempt] !== attemptId) throw stop(`${resourceGroup} is not verifiably owned by attempt ${attemptId}`);
  const resources = await az(['resource', 'list', '--resource-group', resourceGroup,
    '--query', '[].{id:id, createdTime:createdTime}', '--output', 'json']);
  if (!Array.isArray(resources)) throw stop(`resources in ${resourceGroup} could not be enumerated`);
  const started = Date.parse(startedAt);
  const unproven = resources.filter(item => !item.createdTime || !(Date.parse(item.createdTime) >= started));
  if (unproven.length) {
    throw stop(`${unproven.length} resource(s) in ${resourceGroup} cannot be proven to belong to this attempt (${unproven.slice(0, 3).map(item => item.id).join(', ')})`);
  }
  log(`  Deleting attempt-owned resource group ${resourceGroup} (${resources.length} attempt-created resources) ...`);
  await az(['group', 'delete', '--name', resourceGroup, '--yes', '--output', 'json']);
  if (await az(['group', 'exists', '--name', resourceGroup, '--output', 'json'])) {
    throw new PlacementError(`Cleanup could not be verified: ${resourceGroup} still exists. Stopping without further attempts.`);
  }
  return 'deleted';
}

export function formatAttempts(attempts) {
  return attempts.map(item => `  - ${item.region}${item.sku ? ` / ${item.sku}` : ''}: ${item.reason}`).join('\n');
}

function summarize(error) {
  const text = String(error?.stderr || error?.message || error);
  const code = /"code"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? /\(([A-Z][A-Za-z]+)\)/.exec(text)?.[1];
  const line = text.split(/\r?\n/).find(item => item.trim()) ?? text;
  return (code && !line.includes(code) ? `${code}: ${line}` : line).slice(0, 300);
}

export function assertOwnership(policy, resourceGroup, group) {
  const owner = group?.tags?.[TAGS.scenario];
  if (owner && owner !== policy.scenario) {
    throw new PlacementError(`${resourceGroup} belongs to scenario ${owner}; refusing to deploy ${policy.scenario} into it.`);
  }
}

async function pinnedPlacement({ policy, az, resourceGroup, location, sku, deploy, log }) {
  const state = await inspectExisting(policy, resourceGroup, az);
  const { group } = state;
  assertOwnership(policy, resourceGroup, group);
  const region = state.location;
  if (location && normalizeRegion(location) !== region) {
    throw new PlacementError(`${resourceGroup} is already placed in ${region}. Existing deployments are never relocated; `
      + 'omit the location, or clean up the scenario before choosing another region.');
  }
  if (sku && state.sku && sku.toLowerCase() !== state.sku.toLowerCase()) {
    throw new PlacementError(`${resourceGroup} already uses ${state.sku}; rerunning provisioning cannot change the SKU.`);
  }
  let pinnedSku = sku || state.sku;
  const context = { ...state.context };
  let { remediationTarget } = state;
  const kind = policy.compute?.kind ?? 'none';
  const needsSku = kind !== 'none' && !pinnedSku;
  const needsVersion = (policy.regionChecks ?? []).some(check => check.type === 'aksVersion') && !context.kubernetesVersion;
  const needsTarget = (policy.remediationTargets?.length ?? 0) > 0 && !remediationTarget;
  if (needsSku || needsVersion || needsTarget) {
    const evaluation = await evaluateRegion(policy, region, az, {
      skus: pinnedSku ? [pinnedSku] : undefined,
      parts: { fleet: false },
      existing: state.existing,
    });
    if (evaluation.issues.length) throw new PlacementError(`Pinned region ${region} is not eligible: ${evaluation.issues.join('; ')}`);
    const candidate = evaluation.candidates[0];
    if (!candidate && (needsSku || needsTarget)) {
      throw new PlacementError(`No eligible compute in pinned region ${region}:\n${formatAttempts(evaluation.rejected.map(item => ({ region, ...item })))}`);
    }
    pinnedSku = pinnedSku || candidate?.sku || null;
    remediationTarget = remediationTarget || candidate?.remediationTarget;
    Object.assign(context, { ...evaluation.context, ...context });
  }
  if (remediationTarget) context.remediationTarget = remediationTarget;
  log(`Existing deployment: ${resourceGroup} is pinned to ${region}${pinnedSku ? ` / ${pinnedSku}` : ''} (single attempt, no relocation, no cleanup).`);
  const ownershipTags = Object.fromEntries(Object.entries(group?.tags ?? {}).filter(([key]) => key.startsWith('sre-workshop-')));
  const outputs = await deploy({ location: region, sku: pinnedSku, context, tags: ownershipTags });
  return { mode: 'pinned', resourceGroup, location: region, sku: pinnedSku, context, outputs };
}
/**
 * Place and deploy a scenario. `deploy({ location, sku, context, tags })`
 * performs exactly one deployment attempt and returns its outputs.
 */
export async function provision({
  policy, az, resourceGroup, location, sku, noRegionFallback = false, deploy,
  log = console.log, attemptId = randomUUID(),
}) {
  const kind = policy.compute?.kind ?? 'none';
  const hasSkuFallback = kind !== 'none';
  const groupScope = (policy.deployment?.scope ?? 'group') === 'group';
  if (sku && (!hasSkuFallback || !policy.compute.skus.some(item => item.toLowerCase() === sku.toLowerCase()))) {
    throw new PlacementError(`SKU ${sku} is not in the ${policy.scenario} policy${hasSkuFallback ? `: ${policy.compute.skus.join(', ')}` : ''}`);
  }
  const exists = await discover(`checking resource group ${resourceGroup}`,
    () => az(['group', 'exists', '--name', resourceGroup, '--output', 'json']));
  if (exists) return pinnedPlacement({ policy, az, resourceGroup, location, sku, deploy, log });

  const attempts = [];
  let fleetUnavailableEverywhere = (policy.fixedFleet?.length ?? 0) > 0;
  const cache = new Map();
  for (const region of orderedRegions(policy, location, { noFallback: noRegionFallback })) {
    log(`Checking ${region} ...`);
    const evaluation = await evaluateRegion(policy, region, az, { cache, skus: sku ? [sku] : undefined });
    if (!evaluation.fleetUnavailable) fleetUnavailableEverywhere = false;
    if (evaluation.issues.length) {
      attempts.push({ region, reason: `preflight: ${evaluation.issues.join('; ')}` });
      continue;
    }
    for (const rejected of evaluation.rejected) attempts.push({ region, sku: rejected.sku, reason: `preflight: ${rejected.reason}` });
    for (const candidate of evaluation.candidates) {
      const context = { ...evaluation.context };
      if (candidate.remediationTarget) context.remediationTarget = candidate.remediationTarget;
      const tags = {
        ...(policy.groupTags ?? {}),
        [TAGS.scenario]: policy.scenario,
        [TAGS.attempt]: attemptId,
        [TAGS.location]: region,
        ...(candidate.sku ? { [TAGS.sku]: candidate.sku } : {}),
        ...(context.remediationTarget ? { [TAGS.remediationTarget]: context.remediationTarget } : {}),
      };
      log(`Attempting ${region}${candidate.sku ? ` with ${candidate.sku}` : ''} (attempt ${attemptId}) ...`);
      // Re-check immediately before creating so a group that appeared
      // concurrently is never retagged (and later deleted) as attempt-owned.
      if (await discover(`re-checking resource group ${resourceGroup}`,
        () => az(['group', 'exists', '--name', resourceGroup, '--output', 'json']))) {
        throw new PlacementError(`${resourceGroup} appeared while placing ${policy.scenario}; stopping without changes. Rerun to use the existing deployment.`, { attempts });
      }
      const startedAt = new Date(Date.now() - 1000).toISOString();
      if (groupScope) {
        await az(['group', 'create', '--name', resourceGroup, '--location', region, '--tags',
          ...Object.entries(tags).map(([key, value]) => `${key}=${value}`), '--output', 'json']);
      }
      try {
        const outputs = await deploy({ location: region, sku: candidate.sku, context, tags });
        log(`Placed ${policy.scenario} in ${region}${candidate.sku ? ` with ${candidate.sku}` : ''}.`);
        return { mode: 'new', resourceGroup, location: region, sku: candidate.sku, context, outputs, attemptId, attempts };
      } catch (error) {
        const classification = classifyFailure(error?.stderr ?? error?.message, { hasSkuFallback });
        const summary = summarize(error);
        attempts.push({ region, sku: candidate.sku, reason: `${classification === 'fatal' ? 'non-retryable failure' : `${classification}-level availability failure`}: ${summary}` });
        log(`  Attempt failed (${classification}): ${summary}`);
        await cleanupAttempt({ az, resourceGroup, attemptId, startedAt, log });
        if (classification === 'fatal') {
          throw new PlacementError(`Deployment failed with a non-retryable error; only this attempt's resource group was cleaned up.\n${formatAttempts(attempts)}`, { attempts });
        }
        if (classification === 'region') break;
      }
    }
  }
  throw new PlacementError(`No supported placement succeeded for ${policy.scenario}. Tried, in order:\n${formatAttempts(attempts)}`, {
    attempts,
    diagnostic: fleetUnavailableEverywhere ? policy.fleetUnavailableDiagnostic : undefined,
  });
}

export async function persistPlacement(result, policy, {
  directory = path.join(repositoryRoot, '.sre-workshop'), githubOutput = process.env.GITHUB_OUTPUT,
} = {}) {
  await mkdir(directory, { recursive: true });
  const record = {
    scenario: policy.scenario,
    resourceGroup: result.resourceGroup,
    location: result.location,
    sku: result.sku ?? null,
    ...result.context,
    mode: result.mode,
    recordedAt: new Date().toISOString(),
  };
  const file = path.join(directory, `${policy.scenario}-placement.json`);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
  if (githubOutput) {
    await appendFile(githubOutput, [
      `resource_group=${record.resourceGroup}`,
      `location=${record.location}`,
      `sku=${record.sku ?? ''}`,
      `kubernetes_version=${record.kubernetesVersion ?? ''}`,
      `remediation_target=${record.remediationTarget ?? ''}`,
    ].join('\n') + '\n');
  }
  return file;
}

// Real Azure CLI runner. On Windows `az` is a .cmd shim, so it is invoked
// through a PowerShell bridge instead of a shell to keep arguments literal.
export function createAzRunner({ subscription, env = process.env } = {}) {
  const bridge = fileURLToPath(new URL('./az-bridge.ps1', import.meta.url));
  return function az(args) {
    const full = [...args, ...(subscription ? ['--subscription', subscription] : []), '--only-show-errors'];
    const windows = process.platform === 'win32';
    const child = spawn(windows ? 'pwsh.exe' : 'az', windows ? ['-NoProfile', '-NonInteractive', '-File', bridge] : full, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: windows ? { ...env, SRE_WORKSHOP_AZ_ARGS: JSON.stringify(full) } : env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    return new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', code => {
        if (code !== 0) return reject(new AzError(args, code, stderr));
        const text = stdout.trim();
        if (!text) return resolve(null);
        try {
          resolve(JSON.parse(text));
        } catch {
          reject(new AzError(args, 'malformed-output', `expected JSON output but received: ${text.slice(0, 200)}`));
        }
      });
    });
  };
}
