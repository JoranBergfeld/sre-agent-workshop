import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.env.SCENARIO_TOOLS_REPO_ROOT
  ? resolve(process.env.SCENARIO_TOOLS_REPO_ROOT)
  : resolve(import.meta.dirname, '..', '..', '..');
const templateDir = process.env.SCENARIO_TOOLS_TEMPLATE_DIR
  ? resolve(process.env.SCENARIO_TOOLS_TEMPLATE_DIR)
  : resolve(import.meta.dirname, '..', 'template');
const scenariosDir = resolve(repoRoot, 'scenarios');

const args = process.argv.slice(2);
const usage = 'Usage: new-scenario.js <id> "Title" --platform <platform>';

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
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

  return { id, title, platform };
}

const { id, title, platform } = parseArgs(args);
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

const substitute = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) {
      substitute(path);
      continue;
    }

    let text = readFileSync(path, 'utf8');
    for (const [token, value] of Object.entries(tokens)) {
      text = text.split(token).join(value);
    }
    writeFileSync(path, text);
  }
};

substitute(dest);

console.log(`Created scenario ${id} (${platform}) at ${dest}`);
console.log('');
console.log('Next steps:');
console.log(`  1. Review scenarios/${id}/scenario.yaml and finish the manifest.`);
console.log(`  2. Edit scenarios/${id}/README.md and infra/bicep/main.bicep.`);
console.log(`  3. Run: scripts/validate-scenarios.sh --write`);
