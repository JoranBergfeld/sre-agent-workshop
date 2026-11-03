import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageApp } from './package.mjs';

const [variant, destination] = process.argv.slice(2);
const states = { healthy: 'healthy', faulty: 'faulty', 'reviewed-source': 'reviewed' };
if (!Object.hasOwn(states, variant) || !destination) {
  throw new Error('Usage: build-artifact.mjs <healthy|faulty|reviewed-source> <output-directory>');
}
const capsule = fileURLToPath(new URL('../', import.meta.url));
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, 'deployment.zip'), await packageApp(capsule, states[variant]));
