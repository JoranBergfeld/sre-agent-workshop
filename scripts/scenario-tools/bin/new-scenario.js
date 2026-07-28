import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const repoRoot = process.env.SCENARIO_TOOLS_REPO_ROOT
  ? resolve(process.env.SCENARIO_TOOLS_REPO_ROOT)
  : resolve(import.meta.dirname, '..', '..', '..');
const templateDir = process.env.SCENARIO_TOOLS_TEMPLATE_DIR
  ? resolve(process.env.SCENARIO_TOOLS_TEMPLATE_DIR)
  : resolve(import.meta.dirname, '..', 'template');
const scenariosDir = resolve(repoRoot, 'scenarios');

const usage = 'Usage: new-scenario.js <id> "Title" --platform <platform>';

class CliError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

function fail(message, code = 2) {
  throw new CliError(message, code);
}

function validateSingleLine(label, value) {
  if (!value) {
    fail(`Missing ${label}.`);
  }
  if (/[\u0000\r\n]/.test(value)) {
    fail(`${label} must be a single-line string without NUL or newline characters.`);
  }
}

export function parseArgs(argv) {
  const [id, title, ...rest] = argv;

  if (!id || !title) {
    fail(usage);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    fail(`Invalid id "${id}". Use kebab-case (e.g. disk-full).`);
  }
  if (title.startsWith('--')) {
    fail('Missing title. Put the scenario title in the second positional argument.');
  }
  validateSingleLine('title', title);

  let platform;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--platform') {
      if (platform !== undefined) {
        fail('Duplicate --platform option. Use it only once.');
      }
      platform = rest[++i];
      if (!platform || platform.startsWith('--')) {
        fail('Missing value for --platform.');
      }
      continue;
    }
    if (arg.startsWith('--platform=')) {
      if (platform !== undefined) {
        fail('Duplicate --platform option. Use it only once.');
      }
      platform = arg.slice('--platform='.length);
      if (!platform) {
        fail('Missing value for --platform.');
      }
      continue;
    }
    if (arg.startsWith('--')) {
      fail(`Unknown option "${arg}".`);
    }
    fail(`Unexpected argument "${arg}". Use --platform and quote the title if it contains spaces.`);
  }

  if (!platform) {
    fail('Missing required --platform option.');
  }
  validateSingleLine('platform', platform);

  return { id, title, platform };
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function substituteTokens(text, tokens) {
  const pattern = new RegExp(Object.keys(tokens).map(escapeRegex).join('|'), 'g');
  return text.replace(pattern, (match) => tokens[match]);
}

function writeScenarioManifest(dest, tokens) {
  const manifestPath = resolve(dest, 'scenario.yaml');
  const manifest = {
    ...yaml.load(readFileSync(manifestPath, 'utf8')),
    id: tokens.__SCENARIO_ID__,
    title: tokens.__SCENARIO_TITLE__,
    platform: tokens.__PLATFORM__,
  };
  writeFileSync(
    manifestPath,
    yaml.dump(manifest, {
      sortKeys: false,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    })
  );
}

function substituteFiles(dir, tokens) {
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) {
      substituteFiles(path, tokens);
      continue;
    }
    if (name === 'scenario.yaml') {
      continue;
    }

    let text = readFileSync(path, 'utf8');
    writeFileSync(path, substituteTokens(text, tokens));
  }
}

export function scaffoldScenario({ id, title, platform }) {
  const dest = resolve(scenariosDir, id);

  if (existsSync(dest)) {
    fail(`Scenario already exists: ${dest}`, 1);
  }

  mkdirSync(scenariosDir, { recursive: true });
  cpSync(templateDir, dest, { recursive: true });

  const tokens = {
    __SCENARIO_ID__: id,
    __SCENARIO_TITLE__: title,
    __PLATFORM__: platform,
  };

  writeScenarioManifest(dest, tokens);
  substituteFiles(dest, tokens);

  console.log(`Created scenario ${id} (${platform}) at ${dest}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Review scenarios/${id}/scenario.yaml and finish the manifest.`);
  console.log(`  2. Edit scenarios/${id}/README.md and infra/bicep/main.bicep.`);
  console.log(`  3. Run: scripts/validate-scenarios.sh --write`);
}

export function main(argv = process.argv.slice(2)) {
  const scenario = parseArgs(argv);
  scaffoldScenario(scenario);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(error instanceof CliError ? error.code : 1);
  }
}
