#!/usr/bin/env node
// Scenario provisioning CLI. Usage:
//   node scripts/placement/provision.mjs deploy <scenario> [options]
//   node scripts/placement/provision.mjs check  <scenario> [options]
// See docs/region-and-sku-fallback.md.

import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DiscoveryError, PlacementError, assertOwnership, createAzRunner, evaluateRegion, formatAttempts, inspectExisting, loadPolicy,
  normalizeRegion, orderedRegions, persistPlacement, provision, repositoryRoot,
} from './placement.mjs';

const USAGE = `Usage: provision.mjs <deploy|check> <scenario> [options]

Options:
  --location <region>        Preferred region (must be in the scenario policy)
  --no-region-fallback       Only try the preferred region
  --sku <vm-size>            Preferred compute SKU (must be in the policy)
  --workload <name>          Workload name (scenario default otherwise)
  --resource-group <name>    Resource group (derived from the workload otherwise)
  --subscription <id>        Azure subscription
  --param <name=value>       Extra template parameter (repeatable)
  --secure-param-env <name=ENV_VAR>
                             Secure template parameter read from an environment
                             variable; its value is never printed (repeatable)
  --outputs-file <path>      Write deployment outputs JSON to this file
  --parts <list>             check only: services,compute,fleet,targets
  --json                     check only: print a JSON report
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
    if (typeof template === 'string' && /\{\w+\}/.test(template)) managed.add(name);
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
    const scopeArgs = (policy.deployment.scope ?? 'group') === 'subscription'
      ? ['deployment', 'sub', 'create', '--location', parameters.location]
      : ['deployment', 'group', 'create', '--resource-group', resourceGroup];
    return await az([...scopeArgs, '--name', deploymentName, '--template-file', template,
      '--parameters', `@${file}`, '--query', 'properties.outputs', '--output', 'json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function resolveNames(policy, options) {
  const workload = options.workload ?? policy.defaultWorkload;
  if (!workload) throw new Error(`${policy.scenario}: a workload name is required`);
  const resourceGroup = options.resourceGroup ?? expand(policy.resourceGroup ?? 'rg-{workload}', { workload });
  return { workload, resourceGroup, deploymentName: expand(policy.deployment.name ?? `${policy.scenario}`, { workload }) };
}

export async function runCheck({ policy, az, options, log = console.log }) {
  const { resourceGroup } = resolveNames(policy, options);
  const report = { scenario: policy.scenario, resourceGroup, regions: [] };
  const exists = await az(['group', 'exists', '--name', resourceGroup, '--output', 'json']).catch(error => {
    throw new DiscoveryError(`checking resource group ${resourceGroup}`, error);
  });
  let regions;
  let existing = {};
  if (exists) {
    const state = await inspectExisting(policy, resourceGroup, az);
    assertOwnership(policy, resourceGroup, state.group);
    report.pinnedLocation = state.location;
    if (options.location && normalizeRegion(options.location) !== state.location) {
      throw new PlacementError(`${resourceGroup} is already placed in ${state.location}; existing deployments are never relocated.`);
    }
    existing = state.existing;
    regions = [report.pinnedLocation];
    log(`${resourceGroup} exists in ${report.pinnedLocation}; reruns stay pinned there.`);
  } else {
    regions = orderedRegions(policy, options.location, { noFallback: options.noRegionFallback });
  }
  const cache = new Map();
  for (const region of regions) {
    const evaluation = await evaluateRegion(policy, region, az, {
      cache, skus: options.sku ? [options.sku] : undefined, parts: options.parts ?? {}, existing,
    });
    report.regions.push(evaluation);
    const usable = !evaluation.issues.length && evaluation.candidates.length > 0;
    log(`${usable ? 'OK  ' : 'SKIP'} ${region}${usable && evaluation.candidates[0].sku ? `: ${evaluation.candidates.map(item => item.sku).join(', ')}` : ''}`);
    for (const issue of evaluation.issues) log(`       ${issue}`);
    for (const item of evaluation.rejected) log(`       ${item.sku}: ${item.reason}`);
  }
  report.eligible = report.regions.some(item => !item.issues.length && item.candidates.length > 0);
  report.fleetUnavailableEverywhere = report.regions.length > 0 && report.regions.every(item => item.fleetUnavailable);
  return report;
}

export async function main(argv = process.argv.slice(2), { env = process.env, azFactory = createAzRunner, log = console.log } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (options.help || !options.mode) { log(USAGE); return options.help ? 0 : 2; }
  if (!['deploy', 'check'].includes(options.mode) || !/^[a-z0-9-]+$/.test(options.scenario ?? '')) {
    console.error(USAGE);
    return 2;
  }
  try {
    const policy = await loadPolicy(path.join(repositoryRoot, 'scenarios', options.scenario, 'infra', 'placement.json'));
    const az = azFactory({ subscription: options.subscription ?? env.AZURE_SUBSCRIPTION_ID, env });
    if (options.mode === 'check') {
      const report = await runCheck({ policy, az, options, log: options.json ? () => {} : log });
      if (options.json) log(JSON.stringify(report, null, 2));
      if (!report.eligible) {
        console.error(report.fleetUnavailableEverywhere && policy.fleetUnavailableDiagnostic
          ? policy.fleetUnavailableDiagnostic
          : `No supported region currently passes the ${policy.scenario} preflight.`);
        return 1;
      }
      return 0;
    }
    const { workload, resourceGroup, deploymentName } = resolveNames(policy, options);
    const result = await provision({
      policy, az, resourceGroup, location: options.location, sku: options.sku,
      noRegionFallback: options.noRegionFallback, log,
      deploy: async ({ location, sku, context, tags }) => runDeployment({
        az, policy, resourceGroup, deploymentName, env, secureParams: options.secureParams,
        parameters: buildParameters(policy, { location, sku, context, tags, workload, params: options.params }),
      }),
    });
    const file = await persistPlacement(result, policy, { githubOutput: env.GITHUB_OUTPUT });
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
