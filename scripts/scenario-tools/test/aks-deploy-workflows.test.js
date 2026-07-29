import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..');
const workflows = {
  'deploy-cosmos-rbac-removal-app.yml': {
    namespace: 'cosmos-rbac-removal',
    workloadName: 'cosmos-rbac-removal-app',
  },
  'deploy-workload-identity-break-app.yml': {
    namespace: 'workload-identity-break',
    workloadName: 'workload-identity-break-app',
  },
};
const imageTagError = '::error::imageTag must be a full 40-character lowercase Git SHA published by the scenario image workflow.';

for (const [workflow, identity] of Object.entries(workflows)) {
  test(`${workflow} validates immutable tags and keeps GHCR tokens out of command arguments`, () => {
    const content = readFileSync(resolve(repositoryRoot, '.github', 'workflows', workflow), 'utf8');

    assert.match(content, new RegExp(`IMAGE_TAG.*\\n[\\s\\S]*?${imageTagError.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(content, /\[\[ ! "\$IMAGE_TAG" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
    assert.match(content, /exit 2/);
    assert.ok(content.indexOf(imageTagError) < content.indexOf('Check GHCR read token'));

    assert.match(content, /DOCKER_CONFIG=\$\(mktemp -d\)/);
    assert.match(content, /trap 'rm -rf -- "\$DOCKER_CONFIG"' EXIT/);
    assert.match(content, /docker --config "\$DOCKER_CONFIG" login ghcr\.io --username "\$\{\{ github\.repository_owner \}\}" --password-stdin/);
    assert.match(content, /docker --config "\$DOCKER_CONFIG" manifest inspect "\$\{IMAGE\}"/);
    assert.match(
      content,
      new RegExp(
        `kubectl create namespace ${identity.namespace} --dry-run=client -o yaml \\| kubectl apply -f -`,
      ),
    );
    assert.match(
      content,
      new RegExp(
        `kubectl create secret generic ghcr-pull --namespace ${identity.namespace} --type=kubernetes\\.io/dockerconfigjson --from-file=\\.dockerconfigjson="\\$DOCKER_CONFIG/config\\.json" --dry-run=client -o yaml \\| kubectl apply -f -`,
      ),
    );
    assert.match(
      content,
      new RegExp(
        `kubectl rollout status deployment/${identity.workloadName} -n ${identity.namespace} --timeout=120s`,
      ),
    );
    assert.match(
      content,
      new RegExp(`kubectl get svc ${identity.workloadName} -n ${identity.namespace}`),
    );
    assert.doesNotMatch(content, /--docker-password|docker-registry ghcr-pull/);
  });
}
