// Shared, dependency-free placement engine for workshop scenarios.
// Scenario policies (scenarios/<id>/infra/placement.json) own the candidate
// regions, compute families and service checks; this module only evaluates
// and orchestrates them. Every Azure call goes through an injected `az`
// function so selection, retry and cleanup logic can be tested with fixtures.

import { createHash, randomUUID } from 'node:crypto';
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
  constructor(message, { attempts = [], diagnostic, partial } = {}) {
    super(message);
    this.name = 'PlacementError';
    this.attempts = attempts;
    this.diagnostic = diagnostic;
    this.partial = partial;
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
    if (kind === 'vm') {
      const names = policy.compute.baselineNames;
      if (!Array.isArray(names) || names.length !== count) fail('VM policies need compute.baselineNames: one template-managed name per baseline VM');
      for (const template of [...names, ...(policy.compute.fleetVmNames ?? [])]) {
        try { nameMatcher(template); } catch (error) { fail(`compute names: ${error.message}`); }
      }
    }
    if (kind === 'aks') {
      try { nameMatcher(policy.compute.clusterName); } catch (error) { fail(`compute.clusterName: ${error.message}`); }
    }
    if (!policy.deployment?.parameters || !Object.values(policy.deployment.parameters).includes('{sku}')) {
      fail('deployment.parameters must pass {sku} to the template');
    }
    if (kind === 'aks') {
      // AKS system pools need >= 2 nodes with >= 4 vCPUs and 4 GiB each.
      const requires = policy.compute.requires ?? {};
      if (count < 2) fail('AKS system pools need at least two nodes');
      if (!(requires.minVCPUs >= 4) && !(requires.vCPUs >= 4)) fail('AKS system-node SKUs must require at least 4 vCPUs');
      if (!(requires.minMemoryGB >= 4)) fail('AKS system-node SKUs must require at least 4 GiB memory');
    }
  }
  for (const check of policy.regionChecks ?? []) {
    if (check.type === 'runtimeStack') {
      if (!['webapp', 'functionapp'].includes(check.host) || !check.stack || !check.runtimeVersion) {
        fail('runtimeStack checks need host (webapp|functionapp), stack and runtimeVersion');
      }
      if (check.host === 'functionapp' && !check.functionsExtensionVersion) fail('functionapp runtimeStack checks need functionsExtensionVersion');
    }
    if (check.type !== 'aksVersion') continue;
    if (check.versions) fail('aksVersion must not hard-code a version allowlist; use minVersion/maxVersion');
    for (const key of ['minVersion', 'maxVersion']) {
      if (check[key] !== undefined && !/^\d+\.\d+$/.test(check[key])) fail(`aksVersion.${key} must look like 1.35`);
    }
  }
  for (const entry of policy.fixedFleet ?? []) {
    if (!entry.sku || !Number.isInteger(entry.count)) fail('fixedFleet entries need sku and count');
  }
  if (policy.legacyOwnership) {
    const { groupTags, resourceTags, deployments } = policy.legacyOwnership;
    if (!groupTags || Object.keys(groupTags).length === 0) fail('legacyOwnership needs groupTags');
    if (!Object.keys(resourceTags ?? {}).length && !(deployments ?? []).length) fail('legacyOwnership needs resourceTags or deployment evidence');
    const scenarioSpecific = Object.values(groupTags).includes(policy.scenario) || Object.values(resourceTags ?? {}).includes(policy.scenario);
    if (!scenarioSpecific && !(deployments ?? []).some(item => item.outputs?.length)) {
      fail('generic legacyOwnership tags need a deployment with expected outputs as evidence');
    }
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
  // Missing or malformed capability data rejects the SKU explicitly; it is never assumed to qualify.
  const vcpus = skuVcpus(sku);
  if (!(Number.isFinite(vcpus) && vcpus > 0)) return 'reports no valid vCPUs capability';
  if (requires.vCPUs && vcpus !== requires.vCPUs) return `has ${vcpus} vCPUs, ${requires.vCPUs} required`;
  if (requires.minVCPUs && !(vcpus >= requires.minVCPUs)) return `has ${vcpus} vCPUs, at least ${requires.minVCPUs} required`;
  if (requires.maxVCPUs && !(vcpus <= requires.maxVCPUs)) return `has ${vcpus} vCPUs, at most ${requires.maxVCPUs} allowed`;
  if (requires.minMemoryGB) {
    const memory = Number(capability(sku, 'MemoryGB') ?? NaN);
    if (!Number.isFinite(memory)) return 'reports no valid MemoryGB capability';
    if (memory < requires.minMemoryGB) return `has ${memory} GB memory, at least ${requires.minMemoryGB} GB required`;
  }
  const architecture = capability(sku, 'CpuArchitectureType');
  if (requires.architecture && !architecture) return 'reports no CpuArchitectureType capability';
  if (requires.architecture && architecture !== requires.architecture) {
    return `CPU architecture ${architecture}, ${requires.architecture} required`;
  }
  if (requires.premiumIO && capability(sku, 'PremiumIO') !== 'True') return 'does not support Premium SSD';
  const generations = capability(sku, 'HyperVGenerations');
  if (requires.hyperVGeneration && !generations) return 'reports no HyperVGenerations capability';
  if (requires.hyperVGeneration && !generations.split(',').includes(requires.hyperVGeneration)) {
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

export function compareVersions(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  for (let index = 0; index < 2; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

const majorMinor = version => String(version).split('.').slice(0, 2).join('.');
export const RUNTIME_STACKS_API = '2024-04-01';

// GET an ARM list through `az rest`, following nextLink (bounded).
async function listPages(az, firstUrl) {
  const items = [];
  let url = firstUrl;
  for (let page = 0; url; page += 1) {
    if (page >= 20) throw new Error('too many result pages');
    const body = await az(['rest', '--method', 'get', '--url', url, '--output', 'json']);
    if (!Array.isArray(body?.value)) throw new Error('response has no value list');
    items.push(...body.value);
    url = body.nextLink || null;
  }
  return items;
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
    const values = result?.values;
    if (!Array.isArray(values)) throw new DiscoveryError(`listing AKS versions in ${region}`, 'no version list was returned');
    // Standard-support, non-preview versions from the live regional response,
    // within the policy's compatible range. No hard-coded version allowlist.
    const eligible = values.filter(item => /^\d+\.\d+/.test(String(item.version ?? '')) && item.isPreview !== true
      && (!item.capabilities?.supportPlan || item.capabilities.supportPlan.includes('KubernetesOfficial'))
      && (!check.minVersion || compareVersions(item.version, check.minVersion) >= 0)
      && (!check.maxVersion || compareVersions(item.version, check.maxVersion) <= 0));
    if (!eligible.length) {
      const range = [check.minVersion && `>= ${check.minVersion}`, check.maxVersion && `<= ${check.maxVersion}`].filter(Boolean).join(' and ');
      return { issue: `no generally available, standard-support AKS version${range ? ` ${range}` : ''} is offered in ${region}` };
    }
    const chosen = eligible.find(item => item.isDefault) ?? [...eligible].sort((a, b) => compareVersions(b.version, a.version))[0];
    return { context: { kubernetesVersion: majorMinor(chosen.version) } };
  },
  async appServiceLinux(check, region, az, cache) {
    const list = await cached(cache, `appservice:${check.sku}`, `listing Linux App Service ${check.sku} regions`,
      () => az(['appservice', 'list-locations', '--sku', check.sku, '--linux-workers-enabled', '--output', 'json']));
    if (!locationsInclude(list, region)) return { issue: `Linux App Service ${check.sku} is not offered in ${region}` };
    return {};
  },
  // `az functionapp list-consumption-locations` lists Dynamic (Y1) regions
  // without asking for Linux workers, so query geoRegions with
  // linuxDynamicWorkersEnabled directly. az rest expands {subscriptionId}.
  async functionsConsumption(check, region, az, cache) {
    const list = await cached(cache, 'functions-linux-consumption', 'listing Linux Functions Consumption regions', () => listPages(az,
      `/subscriptions/{subscriptionId}/providers/Microsoft.Web/geoRegions?api-version=${RUNTIME_STACKS_API}&sku=Dynamic&linuxDynamicWorkersEnabled=true`));
    const names = list.map(item => item?.properties?.displayName ?? item?.properties?.name ?? item?.name);
    if (names.some(name => typeof name !== 'string')) throw new DiscoveryError('listing Linux Functions Consumption regions', 'a region entry has no name');
    if (!names.some(name => normalizeRegion(name) === region)) return { issue: `Linux Functions Consumption (Y1) is not offered in ${region}` };
    return {};
  },
  // The Linux runtime (and Functions host version) the template configures
  // must be offered, GA and not end-of-life in the region.
  async runtimeStack(check, region, az, cache) {
    const resource = check.host === 'functionapp' ? 'functionAppStacks' : 'webAppStacks';
    const what = `listing ${check.host === 'functionapp' ? 'Function App' : 'Web App'} Linux stacks in ${region}`;
    const stacks = await cached(cache, `${resource}:${region}`, what, () => listPages(az,
      `/providers/Microsoft.Web/locations/${region}/${resource}?api-version=${RUNTIME_STACKS_API}&stackOsType=Linux`));
    const settings = [];
    for (const stack of stacks) {
      if (lower(stack?.name ?? stack?.properties?.value) !== lower(check.stack)) continue;
      for (const major of stack?.properties?.majorVersions ?? []) {
        for (const minor of major?.minorVersions ?? []) {
          const linux = minor?.stackSettings?.linuxRuntimeSettings;
          if (linux && lower(linux.runtimeVersion) === lower(check.runtimeVersion)) settings.push(linux);
        }
      }
    }
    const label = `${check.runtimeVersion}${check.functionsExtensionVersion ? ` (Functions ${check.functionsExtensionVersion})` : ''}`;
    if (!settings.length) return { issue: `Linux runtime ${label} is not offered in ${region}` };
    const now = Date.now();
    const usable = settings.filter(item => item.isPreview !== true && item.isDeprecated !== true && item.isHidden !== true
      && item.isEarlyAccess !== true && !(item.endOfLifeDate && Date.parse(item.endOfLifeDate) < now)
      && (!check.functionsExtensionVersion
        || (Array.isArray(item.supportedFunctionsExtensionVersions) && item.supportedFunctionsExtensionVersions.includes(check.functionsExtensionVersion))));
    if (!usable.length) return { issue: `Linux runtime ${label} is preview, deprecated, end-of-life or unsupported by the required host in ${region}` };
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

// Each demand is { family, vcpus, cores? }; `cores` (default vcpus) is the
// regional total contribution when it differs from the family demand.
// Returns the first quota shortfall or null.
export function quotaShortfall(usage, demands) {
  const totals = new Map();
  for (const demand of demands) {
    if (!(Number.isFinite(demand.vcpus) && demand.vcpus >= 0)) return `vCPU demand for ${demand.family} is not a valid number`;
    const cores = demand.cores ?? demand.vcpus;
    if (!(Number.isFinite(cores) && cores >= 0)) return `regional vCPU demand for ${demand.family} is not a valid number`;
    if (demand.vcpus > 0) totals.set(demand.family, (totals.get(demand.family) ?? 0) + demand.vcpus);
    if (cores > 0) totals.set('cores', (totals.get('cores') ?? 0) + cores);
  }
  for (const [family, needed] of totals) {
    const entry = (usage ?? []).find(item => (item.name?.value ?? item.name) === family);
    if (!entry) return `no vCPU quota is visible for ${family}`;
    const limit = typeof entry.limit === 'string' && entry.limit.trim() === '' ? NaN : Number(entry.limit ?? NaN);
    const current = typeof entry.currentValue === 'string' && entry.currentValue.trim() === '' ? NaN : Number(entry.currentValue ?? NaN);
    if (!Number.isFinite(limit) || !Number.isFinite(current)) {
      return `${family} quota data is missing or malformed (limit ${JSON.stringify(entry.limit)}, current ${JSON.stringify(entry.currentValue)})`;
    }
    const free = limit - current;
    if (!(free >= needed)) {
      return `${family === 'cores' ? 'total regional' : family} vCPU quota has ${free} free, ${needed} required`;
    }
  }
  return null;
}

function findSku(skus, name) {
  return (skus ?? []).find(item => item.name?.toLowerCase() === String(name).toLowerCase());
}

/**
 * Quota needed to resize every still-pending legacy fleet VM to the target.
 * Deallocated VMs keep counting against quota, so the target family needs
 * target vCPUs for each pending VM, and the regional total needs the net
 * change (target minus legacy vCPUs) plus one in-flight resize where the old
 * size is not yet released.
 *
 * scope 'exercise' (setup/deploy): the whole planned fleet, existing or still
 * to be injected, less VMs already migrated to the target. scope 'present'
 * (remediation): only retiring VMs that actually exist now.
 */
export function remediationDemands(policy, catalog, targetSku, baselineSku, already = () => 0, { scope = 'exercise', baselineAlready } = {}) {
  const fleet = policy.fixedFleet ?? [];
  const target = skuVcpus(targetSku);
  // Without discovered baseline counts (fresh deployment), assume the full
  // baseline sits on the target size: fewer VMs counted as migrated keeps the
  // remaining demand conservative.
  const baselineOnTarget = baselineAlready
    ? baselineAlready(targetSku.name)
    : baselineSku && lower(baselineSku) === lower(targetSku.name) ? policy.compute?.count ?? 0 : 0;
  const migrated = Math.max(0, already(targetSku.name) - baselineOnTarget);
  const entries = fleet.map(entry => {
    const sku = findSku(catalog, entry.sku);
    return { sku, old: sku ? skuVcpus(sku) : NaN, count: scope === 'present' ? already(entry.sku) : Math.max(entry.count, already(entry.sku)) };
  });
  if (scope !== 'present') {
    // Attribute migrated VMs to the entries with the smallest net change, so
    // the remaining regional demand stays conservative.
    let left = migrated;
    for (const entry of [...entries].sort((a, b) => (target - a.old) - (target - b.old))) {
      const take = Math.min(left, entry.count);
      entry.count -= take;
      left -= take;
    }
  }
  let pending = 0;
  let net = 0;
  let overlap = 0;
  const legacyFamilies = new Set();
  for (const { sku, old, count } of entries) {
    if (sku) legacyFamilies.add(sku.family);
    if (!count) continue;
    pending += count;
    net += count * (target - old);
    overlap = Math.max(overlap, old);
  }
  if (!pending) return [];
  const cores = Math.max(0, net) + overlap;
  // A target in the legacy family only needs the net change there too.
  const family = legacyFamilies.has(targetSku.family) ? cores : target * pending;
  return [{ family: targetSku.family, vcpus: family, cores }];
}

/**
 * Evaluate one region against the policy. Discovery failures throw.
 * parts selects demand groups: services, compute, fleet, targets.
 */
export async function evaluateRegion(policy, region, az, { cache = new Map(), skus: skuOverride, existingSku, parts = {}, existing = {}, baselineExisting, remediationTargets, remediationScope = 'exercise', deferUnregisteredProviders = false } = {}) {
  const already = name => Number(existing[String(name).toLowerCase()] ?? 0);
  const baselineAlready = baselineExisting ? name => Number(baselineExisting[String(name).toLowerCase()] ?? 0) : undefined;
  const include = { services: true, compute: true, fleet: true, targets: true, ...parts };
  const result = { region, issues: [], candidates: [], rejected: [], notes: [], context: {} };
  if (include.services) {
    const checks = policy.regionChecks ?? [];
    // Pre-registration ownership gate (setup on a fresh subscription): an
    // unregistered provider is reported as pending instead of failing, and the
    // service checks that depend on registered providers are deferred. The
    // later deploy always re-runs the complete preflight.
    if (deferUnregisteredProviders) {
      const pending = [];
      for (const check of checks.filter(item => item.type === 'provider')) {
        const provider = await cached(cache, `provider:${check.namespace}`, `reading provider ${check.namespace}`,
          () => az(['provider', 'show', '--namespace', check.namespace, '--output', 'json']));
        if (provider?.registrationState && provider.registrationState !== 'Registered') pending.push(check.namespace);
      }
      if (pending.length) {
        result.providersPending = [...new Set(pending)];
        result.notes.push(`Providers not yet registered: ${result.providersPending.join(', ')}; service checks are deferred to the deploy preflight after registration.`);
      }
    }
    for (const check of result.providersPending ? [] : checks) {
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
  const computeSkus = useCompute ? (existingSku ? [existingSku] : (skuOverride ?? policy.compute.skus)) : [null];
  for (const name of computeSkus) {
    const demands = [...fixedDemands];
    if (name && existingSku) {
      // An existing deployment keeps its compute SKU; reruns never resize it,
      // so it is not re-judged against today's policy. Only nodes/VMs that
      // are missing (no surge: nothing is upgraded) need quota.
      const sku = findSku(catalog, name);
      const reason = skuIneligibility(sku, region, policy.compute.requires ?? {});
      if (reason) {
        result.notes.push(`existing ${name} ${reason} under the current policy; it is kept unchanged (no resize). `
          + 'Clean up and redeploy the scenario to adopt the current policy.');
      }
      const missing = Math.max(0, policy.compute.count - (baselineAlready ?? already)(name));
      if (missing) {
        const vcpus = skuVcpus(sku);
        if (!(Number.isFinite(vcpus) && vcpus > 0)) {
          result.rejected.push({ sku: name, reason: `${missing} missing ${name} node(s)/VM(s) cannot be re-created: the SKU reports no valid vCPUs in ${region}` });
          continue;
        }
        demands.push({ family: sku.family, vcpus: vcpus * missing });
      }
    } else if (name) {
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
      // A recorded target is never re-selected; only its eligibility is rechecked.
      for (const targetName of remediationTargets ?? policy.remediationTargets) {
        const targetSku = findSku(catalog, targetName);
        const reason = skuIneligibility(targetSku, region, policy.remediationRequires ?? {})
          ?? quotaShortfall(usage, [...demands, ...remediationDemands(policy, catalog, targetSku, name ?? skuOverride?.[0], already, { scope: remediationScope, baselineAlready })]);
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

// A --sku is a preference: it is tried first, followed by the rest of the
// policy order. It must be one of the policy's SKUs.
export function preferredSkus(policy, sku) {
  if (!sku) return undefined;
  const skus = policy.compute?.skus ?? [];
  const match = skus.find(item => item.toLowerCase() === String(sku).toLowerCase());
  if (!match) {
    throw new PlacementError(`SKU ${sku} is not in the ${policy.scenario} policy${skus.length ? `: ${skus.join(', ')}` : ''}`);
  }
  return [match, ...skus.filter(item => item !== match)];
}

const lower = value => String(value ?? '').toLowerCase();

async function listGroupResources(az, resourceGroup) {
  const resources = await az(['resource', 'list', '--resource-group', resourceGroup,
    '--query', '[].{id:id, type:type, location:location, tags:tags}', '--output', 'json']);
  if (!Array.isArray(resources)) throw new Error(`resources in ${resourceGroup} were not returned as a list`);
  return resources;
}

/**
 * Establish the actual placement of an existing deployment from its regional
 * resources (not resource-group metadata). location is null when the group has
 * no regional workload resources and no recorded placement.
 */
// Template-managed resource names. Each policy name template holds exactly one
// workload token, matching how its Bicep derives the name.
const NAME_TOKENS = {
  workload: workload => workload,
  // iis-app-pool: take(replace(workloadName, '-', ''), 10)
  workloadCompact10: workload => workload.replace(/-/g, '').slice(0, 10),
};
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function nameMatcher(template) {
  if (typeof template !== 'string') throw new Error('a name template must be a string');
  const tokens = [...template.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
  if (tokens.length !== 1 || !NAME_TOKENS[tokens[0]]) {
    throw new Error(`"${template}" must contain exactly one of ${Object.keys(NAME_TOKENS).map(token => `{${token}}`).join(', ')}`);
  }
  const [before, after] = template.split(`{${tokens[0]}}`);
  return {
    template,
    token: tokens[0],
    regex: new RegExp(`^${escapeRegExp(before)}(.+)${escapeRegExp(after)}$`, 'i'),
    expected: workload => `${before}${NAME_TOKENS[tokens[0]](workload)}${after}`,
  };
}

// Resolves which workload's template-managed names a group holds. With an
// explicit workload every name must be that workload's; without one (read-only
// remediation checks given only a group), all names must agree on one workload.
function matchWorkloadNames(resourceGroup, items, matchers, workload, what) {
  const keys = new Set();
  const matched = [];
  for (const item of items) {
    const name = String(item?.name ?? '');
    const hit = matchers.find(matcher => matcher.regex.test(name));
    if (!hit) {
      throw new PlacementError(`${resourceGroup} contains ${what} "${name}", which is not one the scenario template manages `
        + `(${matchers.map(matcher => matcher.template).join(', ')}); refusing to guess its ownership.`);
    }
    if (workload !== undefined && lower(name) !== lower(hit.expected(workload))) {
      throw new PlacementError(`${resourceGroup} contains ${what} "${name}", which belongs to a different workload than "${workload}" `
        + `(expected ${hit.expected(workload)}). Rerun with that deployment's workload name, or use another group; nothing was changed.`);
    }
    keys.add(`${hit.token}:${lower(hit.regex.exec(name)[1])}`);
    matched.push({ item, matcher: hit });
  }
  if (keys.size > 1) {
    throw new PlacementError(`${resourceGroup} contains ${what}s from several workloads (${items.map(item => item?.name).join(', ')}); refusing to guess which deployment to keep.`);
  }
  return matched;
}

export async function inspectExisting(policy, resourceGroup, az, { workload } = {}) {
  const group = await discover(`reading resource group ${resourceGroup}`,
    () => az(['group', 'show', '--name', resourceGroup, '--output', 'json']));
  const resources = await discover(`listing resources in ${resourceGroup}`, () => listGroupResources(az, resourceGroup));
  const kind = policy.compute?.kind ?? 'none';
  const ignored = new Set((policy.placementIgnoreTypes ?? []).map(lower));
  const existing = {};
  const baselineExisting = {};
  const workloadLocations = new Set();
  let sku = null;
  const context = {};
  for (const resource of resources) {
    const region = normalizeRegion(resource.location);
    if (!region || region === 'global' || ignored.has(lower(resource.type))) continue;
    workloadLocations.add(region);
  }
  // Only VM policies (including the retirement fleet and its targets) read VM
  // APIs: App Service/Functions scenarios need neither Microsoft.Compute nor
  // VM-read permission, and AKS node pools come from `az aks list`.
  const readsVms = kind === 'vm' || (policy.fixedFleet?.length ?? 0) > 0 || (policy.remediationTargets?.length ?? 0) > 0;
  const vms = readsVms ? await discover(`listing VMs in ${resourceGroup}`, () => az(['vm', 'list', '--resource-group', resourceGroup,
    '--query', '[].{name:name, size:hardwareProfile.vmSize, location:location}', '--output', 'json'])) : [];
  // A successful but malformed/empty discovery response must never be read
  // as "no existing VMs": that would re-select (and resize to) a new size.
  if (!Array.isArray(vms)) throw new DiscoveryError(`listing VMs in ${resourceGroup}`, 'the response was not a VM list');
  if (vms.some(vm => !vm || typeof vm.size !== 'string' || !vm.size)) throw new DiscoveryError(`listing VMs in ${resourceGroup}`, 'a VM was returned without its size');
  const listedVms = resources.filter(item => lower(item.type) === 'microsoft.compute/virtualmachines').length;
  if (readsVms && listedVms > vms.length) {
    throw new DiscoveryError(`listing VMs in ${resourceGroup}`, `the group lists ${listedVms} VM resource(s) but VM discovery returned ${vms.length}`);
  }
  for (const vm of vms) {
    const size = lower(vm.size);
    existing[size] = (existing[size] ?? 0) + 1;
    workloadLocations.add(normalizeRegion(vm.location));
  }
  if (kind === 'vm') {
    // The template applies one size to every baseline VM, so the pinned size
    // comes only from the scenario's own baseline VMs (never an injected,
    // legacy or migrated fleet VM), and must be unambiguous: redeploying one
    // size over mixed baseline sizes would resize a VM.
    if (vms.some(vm => !vm.name)) throw new PlacementError(`could not read the names of the VMs in ${resourceGroup}; refusing to guess the baseline size.`);
    const baselineMatchers = policy.compute.baselineNames.map(nameMatcher);
    const matched = matchWorkloadNames(resourceGroup, vms,
      [...baselineMatchers, ...(policy.compute.fleetVmNames ?? []).map(nameMatcher)], workload, 'VM');
    const baseline = matched.filter(entry => baselineMatchers.includes(entry.matcher)).map(entry => entry.item);
    const sizes = [...new Set(baseline.map(vm => lower(vm.size)))];
    if (sizes.length > 1) {
      throw new PlacementError(`${resourceGroup} has baseline VMs on different sizes (${baseline.map(vm => `${vm.name}=${vm.size}`).join(', ')}); `
        + 'a rerun would resize some of them. Make the baseline VM sizes match (or remove the deployment) before rerunning.');
    }
    if (baseline.length > policy.compute.count) {
      throw new PlacementError(`${resourceGroup} has ${baseline.length} VMs matching the baseline naming but the scenario deploys ${policy.compute.count}; refusing to guess which are the baseline.`);
    }
    sku = baseline[0]?.size ?? null;
    // Actual baseline VMs per size: a missing baseline VM must never let a
    // migrated fleet VM of the same size be mistaken for it.
    for (const vm of baseline) baselineExisting[lower(vm.size)] = (baselineExisting[lower(vm.size)] ?? 0) + 1;
  }
  if (kind === 'aks') {
    const clusters = await discover(`listing AKS clusters in ${resourceGroup}`,
      () => az(['aks', 'list', '--resource-group', resourceGroup, '--output', 'json']));
    if (!Array.isArray(clusters)) throw new DiscoveryError(`listing AKS clusters in ${resourceGroup}`, 'the response was not a cluster list');
    const listedClusters = resources.filter(item => lower(item.type) === 'microsoft.containerservice/managedclusters').length;
    if (listedClusters > clusters.length) {
      throw new DiscoveryError(`listing AKS clusters in ${resourceGroup}`, `the group lists ${listedClusters} cluster(s) but AKS discovery returned ${clusters.length}`);
    }
    // The templates deploy exactly one cluster with one node pool named
    // `system`; pin only that pool's size, never another cluster's or pool's.
    if (clusters.length > 1) {
      throw new PlacementError(`${resourceGroup} contains ${clusters.length} AKS clusters (${clusters.map(item => item?.name).join(', ')}); `
        + 'the scenario deploys one, so refusing to guess which to keep unchanged.');
    }
    matchWorkloadNames(resourceGroup, clusters, [nameMatcher(policy.compute.clusterName)], workload, 'AKS cluster');
    for (const cluster of clusters) {
      const pools = cluster?.agentPoolProfiles;
      const validCount = count => typeof count === 'number' && Number.isInteger(count) && count >= 0;
      if (!Array.isArray(pools) || !pools.length || pools.some(pool => typeof pool?.vmSize !== 'string' || !pool.vmSize || !validCount(pool.count))) {
        throw new DiscoveryError(`listing AKS clusters in ${resourceGroup}`, `${cluster?.name ?? 'a cluster'} was returned without complete node-pool size/count data`);
      }
      workloadLocations.add(normalizeRegion(cluster.location));
      for (const pool of pools) {
        const size = lower(pool.vmSize);
        existing[size] = (existing[size] ?? 0) + pool.count;
      }
      const systemPools = pools.filter(pool => lower(pool.name) === 'system');
      if (systemPools.length !== 1) {
        throw new PlacementError(`${cluster.name ?? 'The AKS cluster'} in ${resourceGroup} has ${systemPools.length} node pools named "system" `
          + `(pools: ${pools.map(pool => `${pool.name ?? '?'}=${pool.vmSize}`).join(', ')}); refusing to guess which size the template manages.`);
      }
      sku = systemPools[0].vmSize;
      // Only the template pool's nodes count toward its own (re)creation.
      baselineExisting[lower(sku)] = systemPools[0].count;
      // Keep the cluster on the exact patch it already runs: redeploying only a
      // minor lets AKS move to that minor's latest patch (an unintended upgrade).
      // Fail closed when the running version is unknown or an upgrade is underway.
      const name = cluster.name ?? 'AKS cluster';
      const state = lower(cluster.provisioningState);
      if (state !== 'succeeded' || pools.some(pool => pool.provisioningState && lower(pool.provisioningState) !== 'succeeded')) {
        throw new PlacementError(`${name} in ${resourceGroup} is ${cluster.provisioningState ?? 'in an unknown state'} (an upgrade or other operation may be in progress); wait for it to finish before rerunning.`);
      }
      const current = String(cluster.currentKubernetesVersion ?? '');
      if (!/^\d+\.\d+\.\d+$/.test(current)) {
        throw new PlacementError(`could not establish the exact running Kubernetes version of ${name} in ${resourceGroup}; refusing to redeploy and risk an upgrade.`);
      }
      const requested = String(cluster.kubernetesVersion ?? current);
      // A pool whose version is unknown is never assumed to match the control plane.
      const poolVersions = pools.map(pool => String(pool.currentOrchestratorVersion ?? pool.orchestratorVersion ?? 'unknown'));
      // AKS reports a cluster created with only major.minor as that value in
      // kubernetesVersion while currentKubernetesVersion carries the patch.
      const requestedMatches = requested === current
        || (/^\d+\.\d+$/.test(requested) && majorMinor(current) === requested);
      if (!requestedMatches || poolVersions.some(version => version !== current)) {
        throw new PlacementError(`${name} in ${resourceGroup} has mixed Kubernetes versions (control plane ${current}, requested ${requested}, node pools ${[...new Set(poolVersions)].join(', ')}); finish or resolve the upgrade before rerunning.`);
      }
      if (context.kubernetesVersion && context.kubernetesVersion !== current) {
        throw new PlacementError(`${resourceGroup} contains AKS clusters on different Kubernetes versions; refusing to guess which to keep.`);
      }
      context.kubernetesVersion = current;
    }
  }
  workloadLocations.delete('');
  const recorded = group?.tags?.[TAGS.location] ? normalizeRegion(group.tags[TAGS.location]) : null;
  if (workloadLocations.size > 1) {
    throw new PlacementError(`${resourceGroup} contains workload resources in several regions (${[...workloadLocations].join(', ')}); refusing to guess its placement.`);
  }
  const actual = [...workloadLocations][0] ?? null;
  if (recorded && actual && recorded !== actual) {
    throw new PlacementError(`${resourceGroup} records placement ${recorded} but its workload runs in ${actual}; resolve this before rerunning.`);
  }
  return {
    group, existing, baselineExisting: kind === 'none' ? undefined : baselineExisting, context, resources, resourceCount: resources.length,
    sku: sku ?? group?.tags?.[TAGS.sku] ?? null,
    location: actual ?? recorded ?? null,
    remediationTarget: group?.tags?.[TAGS.remediationTarget],
  };
}

const TERMINAL_FAILED = new Set(['failed', 'canceled']);
const TERMINAL = new Set(['succeeded', 'failed', 'canceled']);
const NON_MUTATING_OPERATIONS = new Set(['read', 'evaluatedeploymentoutput']);
const DEPLOYMENT_NOT_FOUND = /DeploymentNotFound|ResourceNotFound|could not be found/i;
const DEPLOYMENT_ID = /^\/subscriptions\/[^/]+(?:\/resourceGroups\/([^/]+))?\/providers\/Microsoft\.Resources\/deployments\/([^/]+)$/i;

/**
 * Decide whether a failed attempt may be retried elsewhere. Azure cannot prove
 * that a resource was created exclusively by this attempt, and a resource
 * listing is only a snapshot (parallel ARM/provider operations can still be in
 * flight or become visible later), so nothing is ever deleted and an empty
 * listing is never treated as proof. A retry is allowed only when the attempt
 * is proven terminal and non-mutating:
 *  - ARM's validate API rejected it (validate never writes) and no deployment
 *    record exists; or
 *  - the deployment (and every nested deployment) is terminally Failed or
 *    Canceled, and every recorded operation is terminal and read-only.
 * As an extra guard, no resource absent before the attempt may be present.
 * Otherwise placement stops without retry and reports the retained state.
 */
export async function assessFailedAttempt({ az, resourceGroup, deploymentName, snapshot = new Set(), scope = 'group', error }) {
  const manual = reason => new PlacementError(`Stopped after the failed attempt without retrying: ${reason}. Nothing was deleted, because the `
    + `attempt cannot be proven to have made no changes. Inspect ${resourceGroup} and deployment ${deploymentName} (including nested deployments `
    + 'and operations still running), wait until they are terminal, remove anything you are sure this attempt created (or delete the whole group '
    + 'if it holds nothing else), and rerun.');
  const show = (group, name) => az(group
    ? ['deployment', 'group', 'show', '--resource-group', group, '--name', name, '--output', 'json']
    : ['deployment', 'sub', 'show', '--name', name, '--output', 'json']);
  const operations = (group, name) => az(group
    ? ['deployment', 'operation', 'group', 'list', '--resource-group', group, '--name', name, '--output', 'json']
    : ['deployment', 'operation', 'sub', 'list', '--name', name, '--output', 'json']);
  const topGroup = scope === 'subscription' ? null : resourceGroup;

  let record;
  try {
    record = await show(topGroup, deploymentName);
  } catch (lookup) {
    if (!DEPLOYMENT_NOT_FOUND.test(String(lookup?.stderr ?? lookup?.message))) {
      throw manual(`deployment ${deploymentName} could not be read (${summarize(lookup)})`);
    }
    record = null;
  }
  if (!record) {
    // An absent record right after a failed create can be propagation or
    // lookup lag, and an error code alone does not prove nothing was accepted.
    // Only a rejection from ARM's validate API (which never writes) counts.
    if (!error?.validationOnly) {
      throw manual(`deployment ${deploymentName} has no record and the failure was not a validation-only rejection, so it may still be starting or have written`);
    }
  } else {
    let walked = 0;
    const walk = async (group, name, depth) => {
      const state = lower((depth === 0 ? record : await show(group, name))?.properties?.provisioningState);
      if (!(depth === 0 ? TERMINAL_FAILED : TERMINAL).has(state)) {
        throw manual(`deployment ${name} is ${state || 'in an unknown state'}, not terminal`);
      }
      const list = await operations(group, name);
      if (!Array.isArray(list)) throw manual(`operations of deployment ${name} could not be read`);
      for (const item of list) {
        if ((walked += 1) > 500 || depth > 8) throw manual('the deployment tree is too large to verify');
        const props = item?.properties ?? {};
        const opState = lower(props.provisioningState);
        const target = props.targetResource ?? {};
        if (!TERMINAL.has(opState)) throw manual(`operation on ${target.id ?? 'an unknown target'} in ${name} is ${opState || 'unknown'}`);
        const nested = DEPLOYMENT_ID.exec(target.id ?? '');
        if (nested || lower(target.resourceType) === 'microsoft.resources/deployments') {
          if (!nested) throw manual(`nested deployment in ${name} has no resolvable id`);
          await walk(nested[1] ?? null, nested[2], depth + 1);
          continue;
        }
        if (!NON_MUTATING_OPERATIONS.has(lower(props.provisioningOperation))) {
          throw manual(`deployment ${name} recorded a ${props.provisioningOperation ?? 'unknown'} operation on ${target.id ?? 'an unknown target'}, which may have written to Azure`);
        }
      }
    };
    try {
      await walk(topGroup, deploymentName, 0);
    } catch (failure) {
      if (failure instanceof PlacementError) throw failure;
      throw manual(`deployment ${deploymentName} could not be fully verified (${summarize(failure)})`);
    }
  }

  let present;
  try {
    present = await az(['group', 'exists', '--name', resourceGroup, '--output', 'json'])
      ? await listGroupResources(az, resourceGroup) : [];
  } catch (failure) {
    throw manual(`${resourceGroup} could not be listed (${summarize(failure)})`);
  }
  const added = present.filter(item => !snapshot.has(lower(item.id))).map(item => item.id);
  if (added.length) {
    throw manual(`${added.length} resource(s) appeared in ${resourceGroup} during the attempt (${added.slice(0, 5).join(', ')}${added.length > 5 ? ', ...' : ''})`);
  }
  return { added };
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

const parentNic = id => /^(.*\/networkInterfaces\/[^/]+)\//i.exec(id ?? '')?.[1] ?? id;
const ATTACHMENTS = {
  'microsoft.compute/disks': detail => [detail?.managedBy],
  'microsoft.network/networkinterfaces': detail => [detail?.properties?.virtualMachine?.id],
  'microsoft.network/publicipaddresses': detail => [parentNic(detail?.properties?.ipConfiguration?.id)],
  'microsoft.network/networksecuritygroups': detail => (detail?.properties?.networkInterfaces ?? []).map(item => item?.id),
  // Earlier VM templates created untagged auto-shutdown schedules named
  // shutdown-computevm-<vm>; one is accepted only when its name matches the
  // VM it targets and that VM is itself an accepted workshop resource.
  'microsoft.devtestlab/schedules': (detail, item) => {
    const target = detail?.properties?.targetResourceId;
    const vmName = /\/providers\/Microsoft\.Compute\/virtualMachines\/([^/]+)$/i.exec(target ?? '')?.[1];
    return vmName && lower(item?.name ?? detail?.name) === lower(`shutdown-computevm-${vmName}`) ? [target] : [];
  },
};

/**
 * An existing group with workload resources is only reused when it is
 * designated for this scenario, or when the scenario's explicit
 * legacyOwnership rule proves it is an earlier workshop deployment: the
 * group carries the legacy group tags, every resource carries the legacy
 * resource tags, and any required legacy deployment succeeded with the
 * expected outputs. Anything else is refused, never silently adopted.
 */
export async function verifyExistingOwnership(policy, resourceGroup, state, az) {
  const tags = state.group?.tags ?? {};
  if (tags[TAGS.scenario] === policy.scenario) return 'designated';
  const refuse = reason => new PlacementError(`${resourceGroup} already holds ${state.resourceCount} resource(s) but is not designated for `
    + `${policy.scenario} (${reason}); refusing to adopt it. If you have verified that it is this scenario's earlier workshop deployment, `
    + `designate it yourself and rerun:\n  az group update --name ${resourceGroup} --set tags.${TAGS.scenario}=${policy.scenario}`);
  const legacy = policy.legacyOwnership;
  if (!legacy) throw refuse('this scenario has no legacy ownership rule');
  for (const [key, value] of Object.entries(legacy.groupTags ?? {})) {
    if (tags[key] !== value) throw refuse(`group tag ${key}=${value} is missing`);
  }
  const required = Object.entries(legacy.resourceTags ?? {});
  if (required.length) {
    const tagged = item => required.every(([key, value]) => item?.tags?.[key] === value);
    const accepted = new Set((state.resources ?? []).filter(tagged).map(item => lower(item.id)));
    let pending = (state.resources ?? []).filter(item => !tagged(item));
    // Untagged dependents (a NIC, OS disk, or auto-shutdown schedule) are
    // accepted only when Azure itself reports them attached exclusively to
    // already-accepted resources; anything else stays unknown and is refused.
    const attachments = new Map();
    for (const item of pending) {
      const extract = ATTACHMENTS[lower(item.type)];
      if (!extract) continue;
      const detail = await discover(`reading ${item.id}`, () => az(['resource', 'show', '--ids', item.id, '--output', 'json']));
      attachments.set(lower(item.id), extract(detail, item).filter(Boolean).map(lower));
    }
    for (let changed = true; changed;) {
      changed = false;
      pending = pending.filter(item => {
        const links = attachments.get(lower(item.id));
        if (!links?.length || !links.every(link => accepted.has(link))) return true;
        accepted.add(lower(item.id));
        changed = true;
        return false;
      });
    }
    if (pending.length) {
      const tagText = required.map(([key, value]) => `${key}=${value}`).join(', ');
      throw refuse(`${pending.length} resource(s) lack tag ${tagText} and are not attached only to tagged workshop resources, e.g. ${pending[0].id}`);
    }
  }
  for (const evidence of legacy.deployments ?? []) {
    let deployment;
    try {
      deployment = await az(['deployment', 'group', 'show', '--resource-group', resourceGroup, '--name', evidence.name, '--output', 'json']);
    } catch (error) {
      if (/DeploymentNotFound|ResourceNotFound|could not be found/i.test(String(error?.stderr ?? error?.message))) {
        throw refuse(`no legacy deployment named ${evidence.name}`);
      }
      throw new DiscoveryError(`reading deployment ${evidence.name} in ${resourceGroup}`, error);
    }
    if (deployment?.properties?.provisioningState !== 'Succeeded') throw refuse(`legacy deployment ${evidence.name} did not succeed`);
    const missing = (evidence.outputs ?? []).filter(name => !(name in (deployment.properties.outputs ?? {})));
    if (missing.length) throw refuse(`legacy deployment ${evidence.name} lacks output(s) ${missing.join(', ')}`);
  }
  return 'legacy';
}

// Resolve a requested region against an existing placement. A requested
// region is a preference unless the selection is strict (no fallback).
export function reconcilePinnedRegion({ resourceGroup, pinned, location, strict, log = console.log }) {
  if (!location || normalizeRegion(location) === pinned) return pinned;
  if (strict) {
    throw new PlacementError(`${resourceGroup} is already placed in ${pinned}, but ${normalizeRegion(location)} was required (no region fallback). `
      + 'Existing deployments are never relocated; rerun without the strict region, or clean up the scenario before choosing another region.');
  }
  log(`Preferred region ${normalizeRegion(location)} ignored: ${resourceGroup} is already placed in ${pinned}, and existing deployments are never relocated.`);
  return pinned;
}

const subscriptionScope = policy => (policy.deployment?.scope ?? 'group') === 'subscription';

// Azure deployment names are limited to 64 characters. Names that fit are
// kept unchanged; longer ones are shortened deterministically with a hash of
// the full name so reruns reuse the same bounded name without collisions.
export function boundedDeploymentName(name) {
  if (name.length <= 64) return name;
  return `${name.slice(0, 55).replace(/[-.]+$/, '')}-${createHash('sha256').update(name).digest('hex').slice(0, 8)}`;
}

async function pinnedPlacement({ policy, az, state, ownership, resourceGroup, location, sku, noRegionFallback, deploymentName, deploy, log }) {
  const { group } = state;
  const region = reconcilePinnedRegion({ resourceGroup, pinned: state.location, location, strict: noRegionFallback, log });
  if (sku && state.sku && lower(sku) !== lower(state.sku)) {
    log(`Preferred SKU ${sku} ignored: ${resourceGroup} already uses ${state.sku}, and reruns never change it.`);
  }
  let pinnedSku = state.sku || null;
  const context = { ...state.context };
  if (subscriptionScope(policy)) context.resourceGroupLocation = normalizeRegion(group.location);
  let remediationTarget = state.remediationTarget || resumableRemediationTarget(policy, state, resourceGroup);
  if (remediationTarget && !state.remediationTarget) log(`NOTE ${resourceGroup} has VMs already resized to ${remediationTarget}; resuming with that target.`);
  const kind = policy.compute?.kind ?? 'none';
  const needsSku = kind !== 'none' && !pinnedSku;
  const needsVersion = (policy.regionChecks ?? []).some(check => check.type === 'aksVersion') && !context.kubernetesVersion;
  const needsTarget = (policy.remediationTargets?.length ?? 0) > 0 && !remediationTarget;
  // A partial deployment (missing baseline VM or template-pool node) recreates
  // capacity, so it gets the pinned-size quota preflight too.
  const present = Object.values(state.baselineExisting ?? {}).reduce((sum, count) => sum + count, 0);
  const needsCapacity = kind !== 'none' && Boolean(pinnedSku) && present < Number(policy.compute?.count ?? 0);
  if (needsSku || needsVersion || needsTarget || needsCapacity) {
    const evaluation = await evaluateRegion(policy, region, az, {
      skus: pinnedSku ? undefined : preferredSkus(policy, sku),
      existingSku: pinnedSku || undefined,
      parts: { fleet: false },
      existing: state.existing,
      baselineExisting: state.baselineExisting,
      remediationTargets: remediationTarget ? [remediationTarget] : undefined,
    });
    if (evaluation.issues.length) throw new PlacementError(`Pinned region ${region} is not eligible: ${evaluation.issues.join('; ')}`);
    for (const note of evaluation.notes) log(`NOTE ${note}`);
    const candidate = evaluation.candidates[0];
    if (!candidate && (needsSku || needsTarget || needsCapacity)) {
      throw new PlacementError(`No eligible compute in pinned region ${region}:\n${formatAttempts(evaluation.rejected.map(item => ({ region, ...item })))}`);
    }
    pinnedSku = pinnedSku || candidate?.sku || null;
    remediationTarget = remediationTarget || candidate?.remediationTarget;
    Object.assign(context, { ...evaluation.context, ...context });
  }
  if (remediationTarget) context.remediationTarget = remediationTarget;
  log(`Existing deployment: ${resourceGroup} is pinned to ${region}${pinnedSku ? ` / ${pinnedSku}` : ''} (single attempt, no relocation, no cleanup).`);
  const ownershipTags = Object.fromEntries(Object.entries(group?.tags ?? {}).filter(([key]) => key.startsWith('sre-workshop-')));
  if (ownership === 'legacy') {
    log(`${resourceGroup} is a verified earlier ${policy.scenario} workshop deployment; it will be designated after this rerun.`);
    ownershipTags[TAGS.scenario] = policy.scenario;
  }
  const outputs = await deploy({ location: region, sku: pinnedSku, context, tags: ownershipTags, deploymentName: boundedDeploymentName(deploymentName) });
  const result = { mode: 'pinned', resourceGroup, location: region, sku: pinnedSku, context, outputs };
  // Persist what this rerun established: designation for a verified legacy
  // group, and a newly selected remediation target so it is never re-selected.
  let newTarget = remediationTarget && !state.remediationTarget;
  if (newTarget) {
    // Never overwrite a target another run recorded meanwhile.
    const current = await az(['group', 'show', '--name', resourceGroup, '--output', 'json']).catch(error => {
      throw Object.assign(new DiscoveryError(`re-reading ${resourceGroup}`, error), { partial: result });
    });
    const concurrent = current?.tags?.[TAGS.remediationTarget];
    if (concurrent && lower(concurrent) !== lower(remediationTarget)) {
      throw Object.assign(new PlacementError(`The rerun of ${resourceGroup} succeeded and was kept, but another run recorded remediation target `
        + `${concurrent} meanwhile; ${remediationTarget} was not recorded. Nothing was resized or deleted.`), { partial: result });
    }
    if (concurrent) newTarget = false;
  }
  if (ownership === 'legacy' || newTarget) {
    try {
      await recordPlacementTags(az, resourceGroup, {
        ...(ownership === 'legacy' ? { [TAGS.scenario]: policy.scenario, [TAGS.location]: region, [TAGS.sku]: pinnedSku } : {}),
        ...(newTarget ? { [TAGS.remediationTarget]: remediationTarget } : {}),
      });
    } catch (error) {
      throw Object.assign(new PlacementError(`The rerun of ${resourceGroup} succeeded and was kept, but recording its designation/target tags failed `
        + `(${summarize(error)}). Rerun to retry designation; nothing was deleted.`), { partial: result });
    }
  }
  return result;
}

// VMs of `size` that are not actually-present baseline VMs (i.e. migrated
// fleet VMs). Uses the discovered baseline, never the configured count.
function migratedTo(state, size) {
  const key = lower(size);
  return (state.existing?.[key] ?? 0) - (state.baselineExisting?.[key] ?? 0);
}

// With no recorded target, an interrupted migration is resumed with the size
// already applied to retiring VMs, never re-selected; ambiguity fails closed.
export function resumableRemediationTarget(policy, state, resourceGroup) {
  if (!(policy.remediationTargets?.length) || state.remediationTarget) return state.remediationTarget || null;
  const resized = policy.remediationTargets.filter(target => migratedTo(state, target) > 0);
  if (resized.length > 1) {
    throw new PlacementError(`${resourceGroup} has no recorded remediation target but VMs were already resized to ${resized.join(' and ')}; `
      + `record the intended one with: az group update --name ${resourceGroup} --set tags.${TAGS.remediationTarget}=<size>. Nothing was resized.`);
  }
  return resized[0] ?? null;
}

/**
 * Verify, immediately before a resize, that the group still records `target`
 * and that no VM was resized to a different remediation target (for example by
 * a concurrent run whose claim lost). Divergence fails closed.
 */
export async function verifyRemediationTarget({ policy, az, resourceGroup, target }) {
  const state = await inspectExisting(policy, resourceGroup, az);
  const recorded = state.remediationTarget;
  if (!recorded || lower(recorded) !== lower(target)) {
    throw new PlacementError(`${resourceGroup} now records remediation target ${recorded ?? 'none'}, not ${target}; another run may be `
      + 'migrating concurrently. Stopped before resizing; rerun once only one migration is active.');
  }
  const foreign = (policy.remediationTargets ?? []).filter(other => lower(other) !== lower(target))
    .filter(other => migratedTo(state, other) > 0);
  if (foreign.length) {
    throw new PlacementError(`${resourceGroup} records ${target} but VMs were already resized to ${foreign.join(', ')}; refusing to mix target `
      + `families. Resolve manually (choose one size, then: az group update --name ${resourceGroup} --set tags.${TAGS.remediationTarget}=<size>).`);
  }
  return state;
}

export async function recordPlacementTags(az, resourceGroup, tags) {
  const pairs = Object.entries(tags).filter(([, value]) => value).map(([key, value]) => `tags.${key}=${value}`);
  if (pairs.length) await az(['group', 'update', '--name', resourceGroup, '--set', ...pairs, '--output', 'json']);
}

export function missingGroupMessage(policy, resourceGroup, location) {
  const region = orderedRegions(policy, location)[0];
  return `Resource group ${resourceGroup} does not exist. This tooling never creates resource groups: Azure's create is a `
    + 'create-or-update that could silently take over a group someone else creates at the same moment. Choose a name nobody else uses, '
    + `confirm \`az group exists --name ${resourceGroup}\` prints false, then create and designate it yourself and rerun:\n`
    + `  az group create --name ${resourceGroup} --location ${region} --tags ${TAGS.scenario}=${policy.scenario}\n`
    + '(The group\'s own region is only metadata; workload resources may still fall back to another supported region.)';
}

/**
 * Place and deploy a scenario. `deploy({ location, sku, context, tags,
 * deploymentName })` performs exactly one deployment attempt under the given
 * (attempt-unique) deployment name and returns its outputs.
 */
export async function provision({
  policy, az, resourceGroup, workload, location, sku, noRegionFallback = false, deploy,
  deploymentName = policy.scenario, log = console.log, attemptId = randomUUID(),
}) {
  const kind = policy.compute?.kind ?? 'none';
  const hasSkuFallback = kind !== 'none';
  const scope = subscriptionScope(policy) ? 'subscription' : 'group';
  if (sku && !hasSkuFallback) throw new PlacementError(`${policy.scenario} has no compute SKU to select`);
  const skuOrder = preferredSkus(policy, sku);
  // Resource groups are never created here. Azure's group create (and a
  // template's resource-group resource) is a create-or-update, so it could
  // silently take over a group another writer creates at the same moment, and
  // no read-back can tell afterwards. The operator creates and tags the group.
  const exists = await discover(`checking resource group ${resourceGroup}`,
    () => az(['group', 'exists', '--name', resourceGroup, '--output', 'json']));
  if (!exists) throw new PlacementError(missingGroupMessage(policy, resourceGroup, location));
  const state = await inspectExisting(policy, resourceGroup, az, { workload });
  assertOwnership(policy, resourceGroup, state.group);
  if (state.location) {
    const ownership = await verifyExistingOwnership(policy, resourceGroup, state, az);
    return pinnedPlacement({ policy, az, state, ownership, resourceGroup, location, sku, noRegionFallback, deploymentName, deploy, log });
  }
  if (state.group?.tags?.[TAGS.scenario] !== policy.scenario) {
    throw new PlacementError(`${resourceGroup} exists but is not designated for ${policy.scenario} (tag ${TAGS.scenario}=${policy.scenario} is missing) `
      + 'and has no workload placement; refusing to deploy into it. Use a group you created for this exercise and tag it, or choose another name.');
  }
  if (state.resourceCount) {
    throw new PlacementError(`${resourceGroup} is designated for ${policy.scenario} but already contains ${state.resourceCount} resource(s) without a `
      + 'regional workload placement; refusing to guess their ownership. Inspect the group, remove what you are sure is leftover, and rerun.');
  }
  const groupLocation = normalizeRegion(state.group.location);
  log(`${resourceGroup} is designated for ${policy.scenario} and empty; placing ${policy.scenario} into it.`);

  const ownershipTags = { ...(policy.groupTags ?? {}), [TAGS.scenario]: policy.scenario, [TAGS.attempt]: attemptId };
  const attempts = [];
  let fleetUnavailableEverywhere = (policy.fixedFleet?.length ?? 0) > 0;
  const cache = new Map();
  let tryNumber = 0;
  for (const region of orderedRegions(policy, location, { noFallback: noRegionFallback })) {
    log(`Checking ${region} ...`);
    const evaluation = await evaluateRegion(policy, region, az, { cache, skus: skuOrder });
    if (!evaluation.fleetUnavailable) fleetUnavailableEverywhere = false;
    if (evaluation.issues.length) {
      attempts.push({ region, reason: `preflight: ${evaluation.issues.join('; ')}` });
      continue;
    }
    for (const rejected of evaluation.rejected) attempts.push({ region, sku: rejected.sku, reason: `preflight: ${rejected.reason}` });
    for (const candidate of evaluation.candidates) {
      tryNumber += 1;
      const attemptName = `${deploymentName.slice(0, 52)}-${attemptId.slice(0, 8)}-${tryNumber}`;
      const context = { ...evaluation.context };
      if (candidate.remediationTarget) context.remediationTarget = candidate.remediationTarget;
      log(`Attempting ${region}${candidate.sku ? ` with ${candidate.sku}` : ''} (deployment ${attemptName}) ...`);
      const listed = await discover(`listing resources in ${resourceGroup}`, () => listGroupResources(az, resourceGroup));
      // Re-check emptiness right before writing: another writer may have added
      // resources during the (possibly long) preflight, and a deployment would
      // upsert them. This narrows, but cannot close, the window: no ARM primitive
      // makes "group still empty" and "start deployment" atomic.
      if (listed.length) {
        throw new PlacementError(`${resourceGroup} was empty when checked but now contains ${listed.length} resource(s) `
          + `(${listed.slice(0, 5).map(item => item.id).join(', ')}${listed.length > 5 ? ', ...' : ''}); another writer appears to be using it. `
          + 'Nothing was deployed or deleted. Make sure only one run uses this group, then rerun.', { attempts });
      }
      const snapshot = new Set();
      if (scope === 'subscription') context.resourceGroupLocation = groupLocation;
      let outputs;
      try {
        outputs = await deploy({ location: region, sku: candidate.sku, context, tags: ownershipTags, deploymentName: attemptName });
      } catch (error) {
        if (error instanceof PlacementError) throw error;
        const classification = classifyFailure(error?.stderr ?? error?.message, { hasSkuFallback });
        const summary = summarize(error);
        attempts.push({ region, sku: candidate.sku, reason: `${classification === 'fatal' ? 'non-retryable failure' : `${classification}-level availability failure`}: ${summary}` });
        log(`  Attempt failed (${classification}): ${summary}`);
        try {
          await assessFailedAttempt({ az, resourceGroup, deploymentName: attemptName, snapshot, scope, error });
        } catch (stop) {
          if (stop instanceof PlacementError) stop.attempts = attempts;
          throw stop;
        }
        if (classification === 'fatal') {
          throw new PlacementError(`Deployment failed with a non-retryable error; the attempt was verified to have made no changes and nothing was deleted.\n${formatAttempts(attempts)}`, { attempts });
        }
        if (classification === 'region') break;
        continue;
      }
      // The deployment succeeded: it is never treated as failed or disposable work.
      try {
        await recordPlacementTags(az, resourceGroup, {
          [TAGS.location]: region, [TAGS.sku]: candidate.sku, [TAGS.remediationTarget]: context.remediationTarget, [TAGS.attempt]: attemptId,
        });
      } catch (error) {
        throw new PlacementError(`${policy.scenario} deployed successfully in ${region}${candidate.sku ? ` with ${candidate.sku}` : ''} (deployment ${attemptName}), `
          + `but recording its placement tags on ${resourceGroup} failed (${summarize(error)}). The deployment was kept. Rerun the same command: `
          + 'reruns detect the actual workload placement and pin to it.', { attempts, partial: { resourceGroup, location: region, sku: candidate.sku, context, outputs } });
      }
      log(`Placed ${policy.scenario} in ${region}${candidate.sku ? ` with ${candidate.sku}` : ''}.`);
      return { mode: 'new', resourceGroup, location: region, sku: candidate.sku, context, outputs, attemptId, attempts };
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
