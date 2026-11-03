import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import yaml from 'js-yaml';

const root = resolve(import.meta.dirname, '../../..');
const workflows = {
  'cloud-agent-handover': 'validate-appservice-app.yml',
  'azure-boards-copilot-handover': 'validate-azure-boards-copilot-handover-app.yml',
  'appservice-latency-context': 'build-appservice-latency-context.yml',
  'cosmos-rbac-removal': 'publish-cosmos-rbac-removal-image.yml',
  'workload-identity-break': 'publish-workload-identity-break-image.yml',
};
const load = name => yaml.load(readFileSync(resolve(root, '.github/workflows', name), 'utf8'));
const stepsOf = workflow => Object.values(workflow.jobs).flatMap(job => job.steps);

for (const [scenario, filename] of Object.entries(workflows)) {
  test(`${scenario} builds exact-source outputs without Azure credentials or PR publication`, () => {
    const workflow = load(filename);
    assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
    assert.deepEqual(workflow.on.push.branches, ['main']);
    assert.ok(workflow.on.push.paths.some(path => path.startsWith(`scenarios/${scenario}/`)));
    assert.ok(workflow.on.push.paths.includes('scripts/build-artifacts/**'));
    assert.ok(workflow.on.push.paths.includes(`.github/workflows/${filename}`));
    assert.equal(workflow.permissions.contents, 'read');
    assert.equal(workflow.permissions['id-token'], undefined);
    assert.equal(workflow.on.pull_request_target, undefined);
    const steps = stepsOf(workflow);
    assert.ok(steps.some(step => step.run?.includes("python -m unittest discover -s scripts/build-artifacts")));
    const metadata = steps.find(step => step.run?.includes('artifact.py metadata'));
    const upload = steps.find(step => step.uses === 'actions/upload-artifact@v4');
    assert.ok(metadata);
    assert.match(metadata.run, new RegExp(`--scenario ${scenario}`));
    assert.ok(steps.indexOf(upload) > steps.indexOf(metadata));
    assert.match(upload.with.name, new RegExp(`^${scenario}-.*github.sha`));
    assert.equal(upload.with['if-no-files-found'], 'error');
    for (const step of steps) {
      assert.doesNotMatch(step.uses ?? '', /azure\/|download-artifact/);
      assert.doesNotMatch(step.run ?? '', /\baz\s|config-zip|kubectl|workflow run.*github\.sha/);
      if (workflow.on.pull_request && (step === upload || step === metadata)) {
        assert.match(step.if, /github.event_name != 'pull_request'/);
      }
    }
  });
}

test('Cloud artifact is published only after the existing Release quality gates', () => {
  const steps = stepsOf(load(workflows['cloud-agent-handover']));
  const tests = steps.findIndex(step => step.run?.includes('dotnet test'));
  const coverage = steps.findIndex(step => step.run?.includes('--fail-under=100'));
  const publish = steps.findIndex(step => step.run?.includes('dotnet publish'));
  assert.ok(tests >= 0 && coverage > tests && publish > coverage);
  assert.match(steps[tests].run, /--configuration Release/);
  assert.match(steps[publish].run, /--configuration Release --runtime linux-x64 --self-contained false/);
  assert.match(steps[publish].run, /artifact.py dotnet/);
});

test('Functions packaging preserves the expected-red gate and bundles Linux CPython 3.12 wheels', () => {
  const steps = stepsOf(load(workflows['azure-boards-copilot-handover']));
  const repair = steps.findIndex(step => step.run?.includes('repair_status'));
  const packaging = steps.findIndex(step => step.run?.includes('artifact.py functions'));
  assert.ok(repair >= 0 && packaging > repair);
  assert.match(steps[repair].run, /"\$repair_status" -eq 0/);
  assert.match(steps[repair].run, /"\$expected_failures" -ne 3/);
  assert.match(steps[packaging].run, /--platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --abi cp312/);
  assert.match(steps[packaging].run, /--only-binary=:all: --no-compile/);
  assert.match(steps[packaging].run, /--source-sha "\$GITHUB_SHA"/);
  assert.doesNotMatch(steps[packaging].run, /requirements-dev/);
  const smoke = steps.findIndex(step => step.name === 'Smoke test packaged Functions imports');
  const upload = steps.findIndex(step => step.uses === 'actions/upload-artifact@v4');
  assert.ok(smoke > packaging && upload > smoke);
  assert.match(steps[smoke].run, /function_app.PACKAGE_COMMIT_SHA == os.environ\["GITHUB_SHA"\]/);
});

test('latency fixtures and reviewed source are isolated and never equated with approval', () => {
  const workflow = load(workflows['appservice-latency-context']);
  assert.deepEqual(workflow.jobs.package.strategy.matrix.variant, ['healthy', 'faulty', 'reviewed-source']);
  const steps = stepsOf(workflow);
  const packaging = steps.find(step => step.run?.includes('build-artifact.mjs'));
  const upload = steps.find(step => step.uses === 'actions/upload-artifact@v4');
  for (const step of [packaging, upload]) {
    assert.match(step.if, /matrix.variant != 'reviewed-source' \|\| github.ref == 'refs\/heads\/main'/);
  }
  const gate = steps.findIndex(step => step.name === 'Test source repair contract');
  assert.ok(gate < steps.indexOf(packaging));
  assert.match(steps[gate].run, /http.test.mjs/);
  assert.match(steps[gate].if, /matrix.variant == 'reviewed-source'/);
});

for (const scenario of ['cosmos-rbac-removal', 'workload-identity-break']) {
  test(`${scenario} extends authenticated GHCR publication with immutable digest metadata`, () => {
    const workflow = load(workflows[scenario]);
    assert.equal(workflow.on.pull_request, undefined);
    assert.equal(workflow.permissions.packages, 'write');
    const steps = stepsOf(workflow);
    const login = steps.find(step => step.uses === 'docker/login-action@v3');
    assert.equal(login.with.registry, 'ghcr.io');
    assert.equal(login.with.password, '${{ secrets.GITHUB_TOKEN }}');
    const build = steps.find(step => step.uses === 'docker/build-push-action@v6');
    assert.equal(build.with.context, `scenarios/${scenario}/src/app`);
    assert.equal(build.with.platforms, 'linux/amd64');
    assert.match(build.with.tags, /app:\$\{\{ github.sha \}\}/);
    assert.match(build.with.labels, /org.opencontainers.image.revision=\$\{\{ github.sha \}\}/);
    const metadata = steps.find(step => step.run?.includes('artifact.py metadata'));
    assert.equal(metadata.env.DIGEST, '${{ steps.image.outputs.digest }}');
    assert.match(metadata.run, /--image "\$IMAGE" --digest "\$DIGEST"/);
  });
}
