import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const capsule = fileURLToPath(new URL('../', import.meta.url));

export async function prepare(state = 'healthy') {
  if (!['healthy', 'faulty'].includes(state)) throw new Error('State must be healthy or faulty');
  const directory = path.join(capsule, '.local', `${state}-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  try {
    await cp(path.join(capsule, 'src'), directory, { recursive: true });
    if (state === 'faulty') {
      await cp(path.join(capsule, 'tests/fixtures/timing-faulty.php'), path.join(directory, 'timing.php'));
    }
    await writeFile(path.join(directory, 'deployment.json'), JSON.stringify({
      revision: state === 'healthy' ? 'baseline-v1' : 'candidate-v2',
      prepared_at: new Date().toISOString(),
    }));
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function startServer({ app, state = 'healthy', port = 0, onLog = () => {} } = {}) {
  if (process.platform === 'win32') {
    throw new Error('Use Linux/macOS or WSL: PHP CLI workers are not supported on Windows.');
  }
  const owned = !app;
  app = app ? path.resolve(app) : await prepare(state);
  if (!port) {
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
  }
  const url = `http://127.0.0.1:${port}`;
  const logs = [];
  let diagnostics = '';
  let spawnError;
  let pending = '';
  const child = spawn(process.env.PHP_BIN || 'php', [
    '-n', '-d', 'max_execution_time=30', '-S', `127.0.0.1:${port}`,
    '-t', app, path.join(app, 'index.php'),
  ], {
    env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.on('error', error => { spawnError = error; });
  child.stdout.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-8000); });
  child.stderr.on('data', chunk => {
    diagnostics = (diagnostics + chunk).slice(-8000);
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) {
      const start = line.indexOf('{"timestamp":');
      if (start < 0) continue;
      try {
        const entry = JSON.parse(line.slice(start));
        logs.push(entry);
        if (logs.length > 1000) logs.shift();
        onLog(entry);
      } catch {
        // Native CLI server diagnostics are not application events.
      }
    }
  });
  async function close() {
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise(resolve => child.once('exit', resolve));
      }
    }
    if (owned) await rm(app, { recursive: true, force: true });
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(diagnostics);
      try {
        const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(300) });
        const id = response.headers.get('x-request-id');
        if (response.ok && (await response.json()).status === 'healthy') {
          for (let count = 0; count < 10 && !logs.some(entry => entry.request_id === id); count++) {
            await delay(10);
          }
          if (!logs.some(entry => entry.request_id === id)) continue;
          ready = true;
          break;
        }
      } catch { /* Wait for the child to bind its listener. */ }
      await delay(50);
    }
    if (!ready) throw new Error(`PHP did not become ready: ${diagnostics}`);
  } catch (error) {
    await close();
    throw error;
  }
  return {
    url, app, logs, close,
    async waitForLog(predicate) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const entry = logs.find(predicate);
        if (entry) return entry;
        await delay(20);
      }
      throw new Error('Expected correlated application event was not observed');
    },
  };
}

async function main() {
  const [command, value] = process.argv.slice(2);
  if (command === 'prepare') {
    console.log(await prepare(value));
  } else if (command === 'serve') {
    const server = await startServer({
      app: value,
      port: 8080,
      onLog: entry => console.log(JSON.stringify(entry)),
    });
    console.log(`Local-only server: ${server.url}; application: ${server.app}`);
    let closing = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
      if (closing) return;
      closing = true;
      await server.close();
    });
  } else {
    throw new Error('Usage: node scripts/local.mjs prepare healthy|faulty OR serve [prepared-directory]');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
