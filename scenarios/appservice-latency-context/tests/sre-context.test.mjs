import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const tool = fileURLToPath(new URL('../investigation/query-latency.py', import.meta.url));
const end = new Date(Date.now() - 60_000);
end.setUTCMilliseconds(0);
const start = new Date(end.getTime() - 5 * 60_000);
const inputs = {
  workspace_id: '00000000-0000-0000-0000-000000000001',
  insights_resource_id: '/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/alctx-test/providers/Microsoft.Insights/components/alctx-example-insights',
  app_name: 'alctx-example',
  start_utc: start.toISOString().replace('.000Z', 'Z'),
  end_utc: end.toISOString().replace('.000Z', 'Z'),
  sample_limit: 2,
};

function execute(parameters, fixture = {}) {
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util, json, sys, types
fixture = json.loads(sys.argv[2])
calls = []
class Credential:
    def __init__(self, **kwargs): pass
    def get_token(self, scope):
        calls.append({"scope": scope})
        if fixture.get("auth_error"):
            raise RuntimeError("sensitive identity error")
        return types.SimpleNamespace(token="test-token")
class Response:
    status_code = fixture.get("status", 200)
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def iter_content(self, chunk_size):
        yield fixture.get("raw", json.dumps(fixture.get("body", {}))).encode()
def post(url, **kwargs):
    calls.append({"url": url, **kwargs})
    return Response()
azure = types.ModuleType("azure")
identity = types.ModuleType("azure.identity")
identity.DefaultAzureCredential = Credential
requests = types.ModuleType("requests")
requests.post = post
sys.modules.update({"azure": azure, "azure.identity": identity, "requests": requests})
spec = importlib.util.spec_from_file_location("latency_tool", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
result = module.main(**json.load(sys.stdin))
print(json.dumps({"result": result, "calls": calls}))
`, tool, JSON.stringify(fixture)], {
    input: JSON.stringify(parameters), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('query tool rejects unsafe resource, time and output inputs before authentication or network', () => {
  const invalid = [
    { workspace_id: 'https://attacker.invalid' },
    { workspace_id: `${inputs.workspace_id}/query` },
    { insights_resource_id: `${inputs.insights_resource_id}'; union *` },
    { insights_resource_id: inputs.insights_resource_id.replace('alctx-test', 'production') },
    { app_name: 'other-app' },
    { app_name: "alctx-example' | union *" },
    {
      app_name: `alctx-${'a'.repeat(1000)}`,
      insights_resource_id: inputs.insights_resource_id.replace('alctx-example', `alctx-${'a'.repeat(1000)}`),
    },
    { start_utc: 'ago(30d)' },
    { start_utc: start.toISOString() },
    { end_utc: inputs.start_utc },
    { start_utc: new Date(end.getTime() - 16 * 60_000).toISOString().replace('.000Z', 'Z') },
    { end_utc: '2099-01-01T00:00:00Z' },
    { start_utc: '2020-01-01T00:00:00Z', end_utc: '2020-01-01T00:05:00Z' },
    { sample_limit: 0 }, { sample_limit: 11 }, { sample_limit: 1.5 },
    { sample_limit: true }, { sample_limit: '2' },
  ];
  for (const change of invalid) {
    const observed = execute({ ...inputs, ...change });
    assert.equal(observed.result.status, 'invalid_input', JSON.stringify(change));
    assert.deepEqual(observed.calls, [], 'invalid input reached the external boundary');
  }
});

const columns = [
  'Kind', 'Route', 'Requests', 'Errors', 'AverageMs', 'P95Ms',
  'TimeGenerated', 'OperationId', 'DurationMs', 'ResultCode', 'Revision', 'Stage',
];
function body(rows) {
  return { tables: [{ name: 'PrimaryResult', columns: columns.map(name => ({ name })), rows }] };
}

test('query tool returns scoped latency/error summaries and correlated samples through the supported v1 API', () => {
  const rows = [
    ['summary', 'GET /api/orders/DEMO-1001', 1, 0, 20011, 20011, null, '', null, '', '', ''],
    ['summary', 'GET /health', 3, 0, 0.4, 0.6, null, '', null, '', '', ''],
    ['request', 'GET /api/orders/DEMO-1001', null, null, null, null, inputs.end_utc, 'abc123', 20011, '200', 'faulty', ''],
    ['stage', 'GET /api/orders/DEMO-1001', null, null, null, null, inputs.end_utc, 'abc123', 20010, '', 'faulty', 'order-status'],
  ];
  const observed = execute(inputs, { body: body(rows) });
  assert.equal(observed.result.status, 'ok');
  assert.deepEqual(observed.result.rows, rows.map(row => Object.fromEntries(columns.map((name, i) => [name, row[i]]))));
  assert.deepEqual(observed.result.evidence_gaps, []);
  assert.equal(observed.calls[0].scope, 'https://api.loganalytics.io/.default');
  const request = observed.calls[1];
  assert.equal(request.url, `https://api.loganalytics.azure.com/v1/workspaces/${inputs.workspace_id}/query`);
  assert.equal(request.allow_redirects, false);
  assert.equal(request.stream, true);
  assert.deepEqual(request.timeout, [5, 25]);
  assert.equal(request.headers.Prefer, 'wait=20');
  assert.equal(request.json.timespan, `${inputs.start_utc}/${inputs.end_utc}`);
  assert.ok(request.json.query.includes(inputs.insights_resource_id));
  assert.ok(request.json.query.includes(inputs.app_name));
  assert.ok(request.json.query.includes(`datetime(${inputs.start_utc})`));
  assert.ok(request.json.query.includes(`datetime(${inputs.end_utc})`));
  assert.ok(request.json.query.includes('AppRequests'));
  assert.ok(request.json.query.includes('AppTraces'));
  assert.ok(request.json.query.includes('take 2'));
  assert.ok(request.json.query.includes('take 6'));
  assert.equal(observed.calls.length, 2, 'one credential operation and one read-only query');
});

test('query failures, partial access and excessive output never masquerade as complete evidence', () => {
  const summary = ['summary', 'GET /health', 3, 0, 0.4, 0.6, null, '', null, '', '', ''];
  const fixtures = [
    { status: 403, body: body([summary]) },
    { status: 429, body: body([summary]) },
    { status: 302, body: body([summary]) },
    { body: { ...body([summary]), error: { code: 'PartialError', message: 'sensitive text' } } },
    { body: body(Array(7).fill(summary)) },
    { body: body([['request', 'GET /health', null, null, null, null, inputs.end_utc, 'x'.repeat(1000), 0.4, '200', '', '']]) },
    { body: body([summary.slice(1)]) },
    { body: body([['summary', 'GET /health', null, 0, 0.4, 0.6, null, '', null, '', '', '']]) },
    { body: body([['summary', 'GET /health', 3, 4, 0.4, 0.6, null, '', null, '', '', '']]) },
    { raw: ' '.repeat(65537) },
  ];
  for (const fixture of fixtures) {
    const observed = execute(inputs, fixture);
    assert.equal(observed.result.status, 'unavailable');
    assert.equal(observed.result.rows, undefined);
    assert.equal(observed.calls.length, 2, 'query must not retry automatically');
    assert.ok(!JSON.stringify(observed.result).includes('sensitive'));
  }
  const identity = execute(inputs, { auth_error: true });
  assert.equal(identity.result.status, 'unavailable');
  assert.equal(identity.result.reason, 'log_analytics_identity_unavailable');
  assert.equal(identity.calls.length, 1, 'identity failure must not call query endpoint');

  const absent = execute(inputs, { body: body([]) });
  assert.equal(absent.result.status, 'no_data');
  assert.ok(absent.result.evidence_gaps.length > 0);
  const incomplete = execute(inputs, { body: body([summary]) });
  assert.equal(incomplete.result.status, 'ok');
  assert.ok(incomplete.result.evidence_gaps.includes('missing_order_summary'));
  assert.ok(incomplete.result.evidence_gaps.includes('missing_correlated_stage_sample'));
});

test('learner can reach inactive starters, the guarded tool and operations facts without opening answer reveals', async () => {
  const page = fileURLToPath(new URL('../docs/05-sre-context.md', import.meta.url));
  const text = await readFile(page, 'utf8');
  const destinations = [...text.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/g)]
    .map(match => match[1]).filter(href => !/^https?:/.test(href));
  for (const href of [
    '04-baseline.md', '06-handover-context.md', '../context/sre/instructions.starter.md',
    '../context/sre/latency-investigation/SKILL.starter.md',
    '../investigation/query-latency.py', '../knowledge/operations.md',
  ]) {
    assert.ok(destinations.includes(href), `learner cannot reach ${href}`);
  }
  for (const href of destinations) await access(path.resolve(path.dirname(page), href));
  assert.match(text, /<details>\s*<summary>Show exact steps<\/summary>/);
  for (const block of text.matchAll(/<details([^>]*)>([\s\S]*?)<\/details>/g)) {
    assert.ok(!/\bopen\b/.test(block[1]), 'optional steps/references must start collapsed');
  }
  const instructions = await readFile(new URL('../context/sre/instructions.starter.md', import.meta.url), 'utf8');
  const skill = await readFile(new URL('../context/sre/latency-investigation/SKILL.starter.md', import.meta.url), 'utf8');
  assert.ok(instructions.includes('TODO'), 'instructions must require learner authorship');
  assert.ok(skill.includes('TODO'), 'skill must require learner authorship');
});
