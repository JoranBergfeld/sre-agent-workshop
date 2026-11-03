#!/usr/bin/env node
// Scenario provisioning CLI. Usage:
//   node scripts/placement/provision.mjs deploy <scenario> [options]
//   node scripts/placement/provision.mjs check  <scenario> [options]
// See docs/region-and-sku-fallback.md.

import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AzError,
  DiscoveryError, PlacementError, TAGS, assertOwnership, verifyRemediationTarget, missingGroupMessage, verifyExistingOwnership, recordPlacementTags, resumableRemediationTarget, createAzRunner, evaluateRegion, formatAttempts, inspectExisting, loadPolicy,
  orderedRegions, persistPlacement, preferredSkus, provision, reconcilePinnedRegion, repositoryRoot,
} from './placement.mjs';

const USAGE = `Usage: provision.mjs <deploy|check> <scenario> [options]
       provision.mjs verify-target <scenario> --resource-group <name> --target <vm-size>

Options:
  --location <region>        Preferred region (must be in the scenario policy); the
                             rest of the policy order follows. An existing
                             deployment keeps its actual region.
  --no-region-fallback       Strict: only the given region; an existing deployment
                             elsewhere is an error instead of being reused
  --sku <vm-size>            Preferred compute SKU (must be in the policy); the
                             rest of the policy order follows. An existing
                             deployment keeps its SKU.
  --workload <name>          Workload name (scenario default otherwise)
  --resource-group <name>    Resource group (derived from the workload otherwise;
                             subscription-scope scenarios must use the derived name)
  --subscription <id>        Azure subscription
  --param <name=value>       Extra template parameter (repeatable)
  --secure-param-env <name=ENV_VAR>
                             Secure template parameter read from an environment
                             variable; its value is never printed (repeatable)
  --outputs-file <path>      Write deployment outputs JSON to this file
  --parts <list>             check only: services,compute,fleet,targets
  --json                     check only: print a JSON report
  --record-target            check only: for an existing deployment with
                             remediation targets, persist the verified target on
                             the group before any resize (reused afterwards)
  --require-group            check only: also fail unless the resource group is
                             ready for deploy (verified existing deployment, or
                             an empty group designated for the scenario). Lets
                             setup verify ownership before mutating anything.
  --defer-unregistered-providers
                             check only: report unregistered policy providers as
                             pending (and defer the service checks that need
                             them) instead of failing, so setup can verify
                             ownership before registering providers. deploy
                             always runs the complete preflight.
  --claim-settle-seconds <n> check --record-target only: wait this long after
                             recording a new target before re-verifying it
                             (default 30), so a concurrent claim is detected
  --target <vm-size>         verify-target only: the target about to be applied;
                             fails unless the group still records it and no VM
                             was resized to another target (run before each resize)
  -h, --help                 Show this help`;

export function parseArgs(argv) {
  const options = { params: {}, secureParams: {}, parts: null };
  const [mode, scenario, ...rest] = argv;
  options.mode = mode;
  options.scenario = scenario;
  const value = (flag, index) => {
    if (index >= rest.length || rest[index].startsWith('--')) throw new Error(`${flag} requires a value`);
    return rest[index];
  };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    switch (flag) {
      case '--location': options.location = value(flag, ++index); break;
      case '--sku': options.sku = value(flag, ++index); break;
      case '--workload': options.workload = value(flag, ++index); break;
      case '--resource-group': options.resourceGroup = value(flag, ++index); break;
      case '--subscription': options.subscription = value(flag, ++index); break;
      case '--outputs-file': options.outputsFile = value(flag, ++index); break;
      case '--no-region-fallback': options.noRegionFallback = true; break;
      case '--json': options.json = true; break;
      case '--record-target': options.recordTarget = true; break;
      case '--require-group': options.requireGroup = true; break;
      case '--defer-unregistered-providers': options.deferUnregisteredProviders = true; break;
      case '--target': options.target = value(flag, ++index); break;
      case '--claim-settle-seconds': {
        const seconds = Number(value(flag, ++index));
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 600) throw new Error(`${flag} must be 0-600`);
        options.claimSettleMs = seconds * 1000;
        break;
      }
      case '--parts':
        options.parts = Object.fromEntries(['services', 'compute', 'fleet', 'targets']
          .map(part => [part, value(flag, index + 1).split(',').includes(part)]));
        index += 1;
        break;
      case '--param':
      case '--secure-param-env': {
        const pair = value(flag, ++index);
        const at = pair.indexOf('=');
        if (at < 1) throw new Error(`${flag} expects name=value`);
        (flag === '--param' ? options.params : options.secureParams)[pair.slice(0, at)] = pair.slice(at + 1);
        break;
      }
      case '-h':
      case '--help': options.help = true; break;
      default: throw new Error(`Unknown option ${flag}`);
    }
  }
  return options;
}

const expand = (text, values) => text.replace(/\{(\w+)\}/g, (match, key) => (values[key] ?? match));

// Template values: "{location}", "{sku}", "{kubernetesVersion}", "{workload}",
// "{remediationTarget}" are substituted; "{groupTags}" becomes the attempt tag object.
export function buildParameters(policy, { location, sku, context = {}, tags = {}, workload, params = {} }) {
  const values = { location, sku, workload, ...context };
  const parameters = {};
  const managed = new Set();
  for (const [name, template] of Object.entries(policy.deployment.parameters ?? {})) {
    if ((typeof template === 'string' && /\{\w+\}/.test(template)) || typeof template === 'boolean') managed.add(name);
    if (template === '{groupTags}') parameters[name] = { ...(policy.groupTags ?? {}), ...tags };
    else if (typeof template === 'string') parameters[name] = expand(template, values);
    else parameters[name] = template;
  }
  for (const [name, raw] of Object.entries(params)) {
    if (managed.has(name)) throw new Error(`Parameter ${name} is selected by the placement policy and cannot be overridden; use --location/--sku/--workload instead.`);
    parameters[name] = raw;
  }
  for (const [name, item] of Object.entries(parameters)) {
    if (typeof item === 'string' && /\{\w+\}/.test(item)) throw new Error(`Parameter ${name} has an unresolved placeholder: ${item}`);
  }
  return parameters;
}

async function runDeployment({ az, policy, resourceGroup, deploymentName, parameters, secureParams, env }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sre-workshop-'));
  const file = path.join(directory, 'parameters.json');
  const document = { $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#', contentVersion: '1.0.0.0', parameters: {} };
  for (const [name, item] of Object.entries(parameters)) document.parameters[name] = { value: item };
  for (const [name, variable] of Object.entries(secureParams)) {
    if (Object.hasOwn(parameters, name)) throw new Error(`Secure parameter ${name} collides with a policy or --param value`);
    if (!env[variable]) throw new Error(`Secure parameter ${name}: environment variable ${variable} is empty`);
    document.parameters[name] = { value: env[variable] };
  }
  try {
    await writeFile(file, JSON.stringify(document), { mode: 0o600 });
    await chmod(file, 0o600).catch(() => {});
    const template = path.join(policy.capsule, policy.deployment.template);
    const scopeArgs = verb => ((policy.deployment.scope ?? 'group') === 'subscription'
      ? ['deployment', 'sub', verb, '--location', parameters.location]
      : ['deployment', 'group', verb, '--resource-group', resourceGroup]);
    const common = ['--name', deploymentName, '--template-file', template, '--parameters', `@${file}`];
    // ARM's validate API never creates a deployment or any resource, so a
    // rejection here is provably non-mutating and the engine may fall back.
    let validation;
    try {
      validation = await az([...scopeArgs('validate'), ...common, '--output', 'json']);
    } catch (error) {
      throw Object.assign(error, { validationOnly: true });
    }
    if (validation?.error) {
      throw Object.assign(new AzError(['deployment', 'validate'], 1, JSON.stringify(validation.error)), { validationOnly: true });
    }
    return await az([...scopeArgs('create'), ...common, '--query', 'properties.outputs', '--output', 'json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function resolveNames(policy, options) {
  const workload = options.workload ?? policy.defaultWorkload;
  if (!workload) throw new Error(`${policy.scenario}: a workload name is required`);
  const derived = expand(policy.resourceGroup ?? 'rg-{workload}', { workload });
  // Subscription-scope templates create their own group from the workload
  // name, so a different --resource-group would check and clean the wrong one.
  if ((policy.deployment.scope ?? 'group') === 'subscription' && options.resourceGroup && options.resourceGroup !== derived) {
    throw new Error(`${policy.scenario} deploys into ${derived} (derived from the workload name by its template); `
      + `--resource-group ${options.resourceGroup} does not match. Use --workload to choose the group instead.`);
  }
  const resourceGroup = options.resourceGroup ?? derived;
  return { workload, resourceGroup, deploymentName: expand(policy.deployment.name ?? `${policy.scenario}`, { workload }) };
}

// Persist the verified remediation target before the first resize, so an
// interrupted migration resumes with the same target instead of re-selecting.
//
// Azure's resource-group tag update is read-modify-write with no conditional
// (If-Match / create-only) semantics we can rely on, so this claim is not
// atomic. Mitigation: refuse to overwrite a target that appeared since the
// check, wait a settle interval after writing, then re-verify the tag and the
// fleet; migrate re-verifies again before every resize. A concurrent run whose
// write lands later is detected before the next resize, and a mixed-family
// fleet always fails closed for manual resolution.
async function recordRemediationTarget({ policy, az, resourceGroup, state, report, log, options, sleep }) {
  if (!(policy.remediationTargets?.length)) throw new PlacementError(`${policy.scenario} has no remediation targets to record`);
  if (!state?.location || !report.ownership) {
    throw new PlacementError(`${resourceGroup} has no verified existing ${policy.scenario} deployment; no remediation target was recorded.`);
  }
  // An ineligible check already fails with its reasons; record nothing.
  if (!report.eligible || report.remediationTargetRecorded) return;
  if (!report.remediationTarget) throw new PlacementError(`No eligible remediation target in ${report.pinnedLocation}; nothing was recorded or resized.`);
  const reread = async () => (await az(['group', 'show', '--name', resourceGroup, '--output', 'json']).catch(error => {
    throw new DiscoveryError(`re-reading ${resourceGroup}`, error);
  }))?.tags?.[TAGS.remediationTarget];
  const appeared = await reread();
  if (appeared) {
    throw new PlacementError(`Another run recorded remediation target ${appeared} on ${resourceGroup} after this check started; `
      + `${report.remediationTarget} was not recorded and nothing was resized. Rerun to continue with the recorded target.`);
  }
  const tags = { [TAGS.remediationTarget]: report.remediationTarget };
  if (report.ownership === 'legacy') tags[TAGS.scenario] = policy.scenario;
  await recordPlacementTags(az, resourceGroup, tags);
  const found = await reread();
  if (found !== report.remediationTarget) {
    throw new PlacementError(`Recording remediation target ${report.remediationTarget} on ${resourceGroup} could not be confirmed `
      + `(found ${found ?? 'none'}); nothing was resized.`);
  }
  await sleep(options.claimSettleMs ?? 30_000);
  try {
    await verifyRemediationTarget({ policy, az, resourceGroup, target: report.remediationTarget });
  } catch (error) {
    if (error instanceof PlacementError) error.message = `${error.message} (claim lost during the settle interval; nothing was resized)`;
    throw error;
  }
  report.remediationTargetRecorded = true;
  log(`Recorded remediation target ${report.remediationTarget} on ${resourceGroup}; later runs reuse it.`);
}

const delay = ms => new Promise(resolve => { setTimeout(resolve, ms); });

export async function runCheck({ policy, az, options, log = console.log, sleep = delay }) {
  const { resourceGroup } = resolveNames(policy, options);
  const report = { scenario: policy.scenario, resourceGroup, regions: [] };
  const exists = await az(['group', 'exists', '--name', resourceGroup, '--output', 'json']).catch(error => {
    throw new DiscoveryError(`checking resource group ${resourceGroup}`, error);
  });
  let regions;
  let existing = {};
  let remediationTargets;
  let skus = preferredSkus(policy, options.sku);
  let existingSku;
  const state = exists ? await inspectExisting(policy, resourceGroup, az) : null;
  if (state) assertOwnership(policy, resourceGroup, state.group);
  report.resourceGroupReady = Boolean(state && (state.location
    || (state.group?.tags?.[TAGS.scenario] === policy.scenario && !state.resourceCount)));
  if (!state) report.resourceGroupMissing = true;
  if (!state) log(`NOTE ${missingGroupMessage(policy, resourceGroup, options.location)}`);
  else if (!report.resourceGroupReady) log(`NOTE ${resourceGroup} exists but is not an empty group designated with ${TAGS.scenario}=${policy.scenario}; deploy will refuse it.`);
  if (state?.location) {
    report.ownership = await verifyExistingOwnership(policy, resourceGroup, state, az);
    report.pinnedLocation = reconcilePinnedRegion({
      resourceGroup, pinned: state.location, location: options.location, strict: options.noRegionFallback, log,
    });
    existing = state.existing;
    if (state.sku) {
      existingSku = state.sku;
      skus = undefined;
    }
    if (state.remediationTarget) remediationTargets = [state.remediationTarget];
    else {
      const resumed = resumableRemediationTarget(policy, state, resourceGroup);
      if (resumed) {
        remediationTargets = [resumed];
        log(`NOTE ${resourceGroup} has VMs already resized to ${resumed}; the interrupted migration resumes with that target.`);
      }
    }
    regions = [report.pinnedLocation];
    log(`${resourceGroup} exists in ${report.pinnedLocation}; reruns stay pinned there.`);
  } else {
    regions = orderedRegions(policy, options.location, { noFallback: options.noRegionFallback });
  }
  const cache = new Map();
  for (const region of regions) {
    const evaluation = await evaluateRegion(policy, region, az, {
      cache, skus, existingSku, parts: options.parts ?? {}, existing, baselineExisting: state?.location ? state.baselineExisting : undefined, remediationTargets,
      // `--parts targets` without fleet is the remediation preflight: only
      // retiring VMs that exist now are resized.
      remediationScope: options.parts && !options.parts.fleet ? 'present' : 'exercise',
      deferUnregisteredProviders: Boolean(options.deferUnregisteredProviders),
    });
    report.regions.push(evaluation);
    const usable = !evaluation.issues.length && evaluation.candidates.length > 0;
    log(`${usable ? 'OK  ' : 'SKIP'} ${region}${usable && evaluation.candidates[0].sku ? `: ${evaluation.candidates.map(item => item.sku).join(', ')}` : ''}`);
    for (const issue of evaluation.issues) log(`       ${issue}`);
    for (const item of evaluation.rejected) log(`       ${item.sku}: ${item.reason}`);
    for (const note of evaluation.notes ?? []) log(`NOTE ${note}`);
  }
  const usable = report.regions.find(item => !item.issues.length && item.candidates.length > 0);
  report.eligible = Boolean(usable);
  report.providersPending = [...new Set(report.regions.flatMap(item => item.providersPending ?? []))];
  if (usable?.candidates[0].remediationTarget) report.remediationTarget = usable.candidates[0].remediationTarget;
  report.remediationTargetRecorded = Boolean(state?.remediationTarget);
  if (report.remediationTarget && !report.remediationTargetRecorded) {
    log(`NOTE ${report.remediationTarget} is only proposed: no remediation target is recorded on ${resourceGroup} yet.`);
  }
  if (options.recordTarget) await recordRemediationTarget({ policy, az, resourceGroup, state, report, log, options, sleep });
  report.fleetUnavailableEverywhere = report.regions.length > 0 && report.regions.every(item => item.fleetUnavailable);
  return report;
}

export async function main(argv = process.argv.slice(2), { env = process.env, azFactory = createAzRunner, log = console.log, stateDir } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (options.help || !options.mode) { log(USAGE); return options.help ? 0 : 2; }
  if (!['deploy', 'check', 'verify-target'].includes(options.mode) || !/^[a-z0-9-]+$/.test(options.scenario ?? '')) {
    console.error(USAGE);
    return 2;
  }
  try {
    const policy = await loadPolicy(path.join(repositoryRoot, 'scenarios', options.scenario, 'infra', 'placement.json'));
    const az = azFactory({ subscription: options.subscription ?? env.AZURE_SUBSCRIPTION_ID, env });
    if (options.mode === 'verify-target') {
      if (!options.resourceGroup || !options.target) throw new Error('verify-target requires --resource-group and --target');
      await verifyRemediationTarget({ policy, az, resourceGroup: options.resourceGroup, target: options.target });
      log(`${options.resourceGroup} still records ${options.target} and no VM uses another target.`);
      return 0;
    }
    if (options.mode === 'check') {
      const report = await runCheck({ policy, az, options, log: options.json ? () => {} : log });
      if (options.json) log(JSON.stringify(report, null, 2));
      if (!report.eligible) {
        if (options.json) {
          for (const region of report.regions) {
            for (const issue of region.issues) console.error(`${region.region}: ${issue}`);
            for (const item of region.rejected) console.error(`${region.region}${item.sku ? ` / ${item.sku}` : ''}: ${item.reason}`);
          }
        }
        console.error(report.fleetUnavailableEverywhere && policy.fleetUnavailableDiagnostic
          ? policy.fleetUnavailableDiagnostic
          : `No supported region currently passes the ${policy.scenario} preflight.`);
        return 1;
      }
      if (options.requireGroup && !report.resourceGroupReady) {
        console.error(`${report.resourceGroup} is not ready for deploy: it must exist and either hold a verified ${policy.scenario} `
          + `deployment or be an empty group tagged ${TAGS.scenario}=${policy.scenario}. Nothing was changed.`
          + (report.resourceGroupMissing ? `\n${missingGroupMessage(policy, report.resourceGroup, options.location)}` : ''));
        return 1;
      }
      return 0;
    }
    const { workload, resourceGroup, deploymentName } = resolveNames(policy, options);
    const result = await provision({
      policy, az, resourceGroup, location: options.location, sku: options.sku,
      noRegionFallback: options.noRegionFallback, deploymentName, log,
      deploy: async ({ location, sku, context, tags, deploymentName: attemptName }) => runDeployment({
        az, policy, resourceGroup, deploymentName: attemptName, env, secureParams: options.secureParams,
        parameters: buildParameters(policy, { location, sku, context, tags, workload, params: options.params }),
      }),
    });
    const file = await persistPlacement(result, policy, { githubOutput: env.GITHUB_OUTPUT, ...(stateDir ? { directory: stateDir } : {}) });
    if (options.outputsFile) await writeFile(options.outputsFile, `${JSON.stringify(result.outputs ?? {}, null, 2)}\n`);
    log(`Placement recorded in ${path.relative(repositoryRoot, file)}: ${result.location}${result.sku ? ` / ${result.sku}` : ''}`);
    return 0;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    if (error instanceof PlacementError && error.diagnostic) console.error(`\n${error.diagnostic}`);
    if (error instanceof PlacementError && error.attempts?.length && !error.message.includes(formatAttempts(error.attempts))) {
      console.error(formatAttempts(error.attempts));
    }
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
