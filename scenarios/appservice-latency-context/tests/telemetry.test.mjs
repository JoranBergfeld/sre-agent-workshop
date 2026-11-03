import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:https';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { startServer } from '../scripts/local.mjs';

test('HTTP observations export correlated duration and stage evidence to the configured HTTPS ingestion boundary', { timeout: 15_000 }, async () => {
  const capsule = fileURLToPath(new URL('../', import.meta.url));
  const directory = path.join(capsule, '.test-runs', `telemetry-${process.pid}`);
  await mkdir(directory, { recursive: true });
  const key = path.join(directory, 'key.pem');
  const cert = path.join(directory, 'cert.pem');
  const certificate = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', key, '-out', cert,
  ], { encoding: 'utf8' });
  assert.equal(certificate.status, 0, certificate.stderr);
  const envelopes = [];
  const receiver = createServer({ key: await readFile(key), cert: await readFile(cert) }, async (request, response) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v2/track');
    let data = '';
    for await (const chunk of request) data += chunk;
    envelopes.push(...JSON.parse(data));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"itemsReceived":1,"itemsAccepted":1,"errors":[]}');
  });
  await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve));
  const original = {
    APPLICATIONINSIGHTS_CONNECTION_STRING: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    SSL_CERT_FILE: process.env.SSL_CERT_FILE,
  };
  process.env.APPLICATIONINSIGHTS_CONNECTION_STRING =
    `InstrumentationKey=00000000-0000-0000-0000-000000000001;IngestionEndpoint=https://127.0.0.1:${receiver.address().port}/`;
  process.env.SSL_CERT_FILE = cert;
  let server;
  try {
    server = await startServer();
    const response = await fetch(`${server.url}/api/orders/DEMO-1001`);
    assert.equal(response.status, 200);
    await response.json();
    const id = response.headers.get('x-request-id');
    for (let attempt = 0; attempt < 100 && !envelopes.some(item => item.data.baseType === 'RequestData' && item.tags['ai.operation.id'] === id); attempt++) {
      await delay(20);
    }
    const correlated = envelopes.filter(item => item.tags['ai.operation.id'] === id);
    const request = correlated.find(item => item.data.baseType === 'RequestData');
    assert.ok(request, 'missing exported request evidence (check HTTPS trust/configuration)');
    assert.equal(request.data.baseData.id, id);
    assert.equal(request.data.baseData.success, true);
    assert.match(request.data.baseData.duration, /^00:00:00\.\d+$/);
    assert.ok(correlated.some(item => item.data.baseData.message === 'stage.completed'));
    assert.ok(envelopes.some(item => item.data.baseData.properties.route === '/health'));
    assert.ok(correlated.every(item => Object.values(item.data.baseData.properties).every(value => typeof value === 'string')),
      'Application Insights custom properties require string values');
  } finally {
    if (server) await server.close();
    await new Promise(resolve => receiver.close(resolve));
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
