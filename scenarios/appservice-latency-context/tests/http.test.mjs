import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare, startServer } from '../scripts/local.mjs';

const order = { orderId: 'DEMO-1001', status: 'processing', estimatedDelivery: '2026-12-10' };

async function request(server, path) {
  const started = performance.now();
  const response = await fetch(`${server.url}${path}`, { signal: AbortSignal.timeout(28_000) });
  return {
    response,
    body: await response.json(),
    elapsed: performance.now() - started,
  };
}

test('repair preserves order content and a small nonzero request-path pause', { timeout: 35_000 }, async () => {
  const server = await startServer({ app: process.env.APP_DIR });
  try {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const result = await request(server, '/api/orders/DEMO-1001');
      assert.equal(result.response.status, 200);
      assert.deepEqual(result.body, order);
      samples.push(result.elapsed);
      const id = result.response.headers.get('x-request-id');
      await server.waitForLog(entry => entry.event === 'request.completed' && entry.request_id === id);
      const stages = server.logs.filter(entry => entry.request_id === id && entry.stage === 'order-status');
      assert.ok(stages.some(entry => entry.event === 'stage.started'));
      const completed = stages.find(entry => entry.event === 'stage.completed');
      assert.ok(completed?.duration_ms >= 15 && completed.duration_ms < 1000,
        `request-path stage must retain its pause: ${completed?.duration_ms} ms`);
    }
    assert.ok(Math.min(...samples) >= 15 && Math.max(...samples) < 1000,
      `controlled local response bounds exceeded: ${samples}`);
  } finally {
    await server.close();
  }
});

test('repair gate rejects a candidate that removes the pause', { timeout: 10_000 }, async () => {
  const app = await prepare('healthy');
  try {
    await writeFile(path.join(app, 'timing.php'),
      '<?php function pauseForOrder(int $milliseconds): void {}');
    const env = { ...process.env, APP_DIR: app };
    // The probe is a separate test run, not a nested node:test worker.
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, [
      '--test', '--test-name-pattern', '^repair preserves',
      fileURLToPath(import.meta.url),
    ], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', resolve);
    });
    assert.equal(code, 1, output);
    assert.match(output, /request-path stage must retain its pause/, output);
  } finally {
    await rm(app, { recursive: true, force: true });
  }
});

test('bounded workload reports one order and three healthy responses', { timeout: 10_000 }, async () => {
  const server = await startServer();
  try {
    const child = spawn(process.execPath, [
      fileURLToPath(new URL('../scripts/workload.mjs', import.meta.url)), server.url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', resolve);
    });
    assert.equal(code, 0, errors);
    const results = output.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(results.length, 4);
    assert.equal(results.filter(result => result.route === '/health' && result.body.status === 'healthy').length, 3);
    assert.deepEqual(results.find(result => result.route === '/api/orders/DEMO-1001').body, order);
    assert.ok(results.every(result => result.status === 200 && result.request_id));
  } finally {
    await server.close();
  }
});

test('one slow order remains valid while independent health requests stay fast', { timeout: 35_000 }, async () => {
  const server = await startServer({ state: 'faulty' });
  try {
    const slow = request(server, '/api/orders/DEMO-1001');
    // Attach a rejection handler immediately, even if an earlier assertion fails.
    slow.catch(() => {});
    await server.waitForLog(entry => entry.event === 'stage.started');
    for (let i = 0; i < 3; i++) {
      const health = await request(server, '/health');
      assert.equal(health.response.status, 200);
      assert.deepEqual(health.body, { status: 'healthy' });
      assert.ok(health.elapsed < 1000, `health blocked for ${health.elapsed} ms`);
    }
    const result = await slow;
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body, order);
    assert.ok(result.elapsed >= 19_000 && result.elapsed < 27_000,
      `expected a bounded real slow request: ${result.elapsed} ms`);
    const id = result.response.headers.get('x-request-id');
    const completed = await server.waitForLog(entry => entry.event === 'request.completed' && entry.request_id === id);
    assert.ok(completed.duration_ms >= 19_000 && completed.duration_ms < 27_000);
    assert.ok(completed.prepared_at && completed.revision);
    assert.equal(server.logs.filter(entry => entry.event === 'stage.started').length, 1);
  } finally {
    await server.close();
  }
});
