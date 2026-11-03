import { setTimeout as delay } from 'node:timers/promises';

const base = new URL(process.argv[2] || 'http://127.0.0.1:8080');
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) {
  throw new Error('Local reproduction accepts only loopback HTTP URLs');
}

async function request(route) {
  const started = performance.now();
  const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(28_000) });
  const body = await response.json();
  const result = {
    route,
    status: response.status,
    body,
    duration_ms: performance.now() - started,
    request_id: response.headers.get('x-request-id'),
  };
  console.log(JSON.stringify(result));
  if (!response.ok) throw new Error(`Unexpected HTTP ${response.status}`);
}

// Exactly one order request and three sequential health requests; no retries.
await Promise.all([
  request('/api/orders/DEMO-1001'),
  (async () => {
    await delay(100);
    for (let count = 0; count < 3; count++) await request('/health');
  })(),
]);
