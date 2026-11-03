import { spawnSync } from 'node:child_process';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packageApp } from '../../scripts/package.mjs';

const [script, ...args] = process.argv.slice(2);
const directory = process.env.FIXTURE_DIR;
if (!directory) throw new Error('Controlled fixture requires FIXTURE_DIR');
if (script.endsWith('/scripts/build-artifacts/resolve.mjs')) {
  await appendFile(path.join(directory, 'calls.jsonl'), `${JSON.stringify(['resolve', ...args])}\n`);
  if (process.env.FAIL_RESOLVE) {
    console.error('No successful, unexpired exact-source build. Dispatch the exact-commit build or use --local-build.');
    process.exit(23);
  }
  const value = flag => args[args.indexOf(flag) + 1];
  if (args.includes('--repo')) throw new Error('Resolver must discover origin identity');
  const variant = value('--variant');
  const output = path.join(value('--output-dir'), `artifact-${variant}`);
  await mkdir(output, { recursive: true });
  const deploymentZip = path.join(output, 'deployment.zip');
  const revision = variant === 'reviewed-source' ? 'reviewed' : variant;
  await writeFile(deploymentZip, await packageApp(fileURLToPath(new URL('../../', import.meta.url)), revision));
  console.log(JSON.stringify({
    scenario: 'appservice-latency-context', variant, sourceSha: 'a'.repeat(40), deploymentZip,
  }));
} else if (script.endsWith('/scripts/placement/provision.mjs')) {
  await appendFile(path.join(directory, 'calls.jsonl'), `${JSON.stringify(['placement', ...args])}\n`);
  const { main } = await import(pathToFileURL(script));
  process.exitCode = await main(args, { stateDir: path.join(directory, 'placement-state') });
} else {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status;
}
