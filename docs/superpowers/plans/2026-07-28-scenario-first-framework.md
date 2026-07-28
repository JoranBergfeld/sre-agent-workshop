# Scenario-First Framework and Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the track-bound scenario contract with top-level scenario discovery, validation, scaffolding, and one generated root catalog.

**Architecture:** Root tooling discovers `scenarios/*/scenario.yaml`, validates scenario-relative lifecycle paths, and renders the catalog between markers in `README.md`. This plan prepares the contract before platform assets move; execute the App Service, AKS, and VM plans immediately afterward on the same branch.

**Tech Stack:** Node.js 22 ESM, `node:test`, AJV JSON Schema 2020-12, `js-yaml`, Bash, GitHub Actions.

---

### Task 1: Define the scenario capsule schema

**Files:**
- Modify: `schemas/scenario.schema.json`
- Modify: `scripts/scenario-tools/test/validate.test.js`

- [ ] **Step 1: Replace the test fixture with the new manifest shape**

Use this base fixture in `validate.test.js`:

```js
const baseManifest = {
  id: 'disk-full',
  title: 'Disk Full',
  platform: 'Azure VM',
  incidentType: 'Capacity',
  summary: 'C: fills up',
  severity: 2,
  estimatedMinutes: 25,
  difficulty: 'beginner',
  costProfile: 'medium',
  guide: 'README.md',
  setup: { bash: 'scripts/setup.sh', powershell: 'scripts/setup.ps1' },
  inject: { bash: 'scripts/inject.sh', powershell: 'scripts/inject.ps1' },
  validate: { bash: 'scripts/validate.sh', powershell: 'scripts/validate.ps1' },
  cleanup: { bash: 'scripts/cleanup.sh', powershell: 'scripts/cleanup.ps1' },
};
```

Replace the track-parent test with:

```js
test('referenced paths must remain inside the scenario directory', () => {
  const manifest = {
    ...baseManifest,
    cleanup: { bash: '../shared/cleanup.sh', powershell: 'scripts/cleanup.ps1' },
  };
  const errs = checkScenario(
    { id: 'disk-full', manifest, dir: '/repo/scenarios/disk-full' },
    { fileExists }
  );
  assert.ok(errs.some((e) => e.includes('cleanup.bash must stay inside the scenario directory')));
});
```

- [ ] **Step 2: Run the targeted test and confirm failure**

Run:

```bash
cd scripts/scenario-tools
node --test test/validate.test.js
```

Expected: FAIL because the validator still requires `track`, `docPage`, and only validates inject/validate.

- [ ] **Step 3: Replace the schema**

Define these required properties in `schemas/scenario.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/JoranBergfeld/sre-agent-workshop/schemas/scenario.schema.json",
  "title": "SRE Agent Scenario Capsule",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id", "title", "platform", "incidentType", "summary", "severity",
    "estimatedMinutes", "difficulty", "costProfile", "guide",
    "setup", "inject", "validate", "cleanup"
  ],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
    "title": { "type": "string", "minLength": 1 },
    "platform": { "type": "string", "minLength": 1 },
    "incidentType": { "type": "string", "minLength": 1 },
    "summary": { "type": "string", "minLength": 1 },
    "severity": { "type": "integer", "minimum": 0, "maximum": 4 },
    "estimatedMinutes": { "type": "integer", "minimum": 1 },
    "difficulty": { "type": "string", "enum": ["beginner", "intermediate", "advanced"] },
    "costProfile": { "type": "string", "enum": ["low", "medium", "high"] },
    "guide": { "$ref": "#/$defs/localPath" },
    "learningObjectives": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    },
    "setup": { "$ref": "#/$defs/scriptPair" },
    "inject": { "$ref": "#/$defs/scriptPair" },
    "validate": { "$ref": "#/$defs/scriptPair" },
    "cleanup": { "$ref": "#/$defs/scriptPair" },
    "signal": {
      "type": "object",
      "additionalProperties": false,
      "required": ["alertModule", "alertName"],
      "properties": {
        "alertModule": { "$ref": "#/$defs/localPath" },
        "alertName": { "type": "string", "minLength": 1 }
      }
    },
    "remediate": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["action", "bash", "powershell", "description"],
        "properties": {
          "action": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
          "bash": { "$ref": "#/$defs/localPath" },
          "powershell": { "$ref": "#/$defs/localPath" },
          "description": { "type": "string", "minLength": 1 }
        }
      }
    },
    "investigation": {
      "type": "object",
      "additionalProperties": false,
      "required": ["query"],
      "properties": { "query": { "$ref": "#/$defs/localPath" } }
    },
    "source": { "$ref": "#/$defs/localPath" },
    "tests": { "$ref": "#/$defs/localPath" }
  },
  "$defs": {
    "localPath": {
      "type": "string",
      "minLength": 1,
      "not": { "pattern": "^(?:/|[A-Za-z]:[\\\\/])" }
    },
    "scriptPair": {
      "type": "object",
      "additionalProperties": false,
      "required": ["bash", "powershell"],
      "properties": {
        "bash": { "$ref": "#/$defs/localPath" },
        "powershell": { "$ref": "#/$defs/localPath" }
      }
    }
  }
}
```

- [ ] **Step 4: Commit the schema contract**

```bash
git add schemas/scenario.schema.json scripts/scenario-tools/test/validate.test.js
git commit -m "feat: define scenario capsule schema"
```

### Task 2: Replace track discovery with top-level capsule discovery

**Files:**
- Modify: `scripts/scenario-tools/lib/paths.js`
- Modify: `scripts/scenario-tools/lib/scenarios.js`
- Create: `scripts/scenario-tools/test/scenarios.test.js`

- [ ] **Step 1: Write discovery tests**

Create temporary repositories in `scenarios.test.js` and assert:

```js
test('scenarioDirs discovers only direct scenario folders', () => {
  const root = makeRepo(['disk-full', '.hidden', '_template']);
  assert.deepEqual(
    scenarioDirs(resolve(root, 'scenarios')).map((p) => basename(p)),
    ['disk-full']
  );
});

test('loadScenario derives id from the capsule folder', () => {
  const root = makeRepo(['disk-full']);
  const loaded = loadScenario(resolve(root, 'scenarios', 'disk-full'));
  assert.equal(loaded.id, 'disk-full');
  assert.equal(loaded.manifest.platform, 'Azure VM');
});
```

- [ ] **Step 2: Run the discovery tests and confirm failure**

```bash
cd scripts/scenario-tools
node --test test/scenarios.test.js
```

Expected: FAIL because discovery requires `workshops/<track>/scenarios`.

- [ ] **Step 3: Implement top-level paths and discovery**

`paths.js` must export:

```js
export const REPO_ROOT = resolve(here, '..', '..', '..');
export const SCENARIOS_DIR = resolve(REPO_ROOT, 'scenarios');
export const ROOT_README = resolve(REPO_ROOT, 'README.md');
```

`scenarios.js` must expose:

```js
export function scenarioDirs(root = SCENARIOS_DIR) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => !name.startsWith('_') && !name.startsWith('.'))
    .map((name) => resolve(root, name))
    .filter((dir) => statSync(dir).isDirectory() && existsSync(resolve(dir, 'scenario.yaml')))
    .sort();
}

export function loadScenario(dir) {
  const id = basename(dir);
  const manifest = yaml.load(readFileSync(resolve(dir, 'scenario.yaml'), 'utf8'));
  return { id, dir, manifest };
}

export function loadAllScenarios(root = SCENARIOS_DIR) {
  return scenarioDirs(root).map(loadScenario);
}
```

- [ ] **Step 4: Run tests**

```bash
cd scripts/scenario-tools
node --test test/scenarios.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit discovery**

```bash
git add scripts/scenario-tools/lib/paths.js scripts/scenario-tools/lib/scenarios.js scripts/scenario-tools/test/scenarios.test.js
git commit -m "refactor: discover top-level scenarios"
```

### Task 3: Generate one root scenario catalog

**Files:**
- Modify: `scripts/scenario-tools/lib/generate.js`
- Modify: `scripts/scenario-tools/test/generate.test.js`
- Modify: `scripts/scenario-tools/bin/generate.js`
- Modify: `README.md`

- [ ] **Step 1: Replace generator tests**

Use `platform`, `incidentType`, and `costProfile` in fixtures and assert:

```js
test('renderCatalog lists capsules by difficulty then title', () => {
  const block = renderCatalog(scenarios);
  assert.ok(block.startsWith(CATALOG_BEGIN));
  assert.match(block, /\| Scenario \| Platform \| Incident \| Severity \| Est\. \| Difficulty \| Cost \|/);
  assert.match(block, /\[Disk Full\]\(scenarios\/disk-full\/\)/);
});
```

Delete tests for `renderIndex`, `renderAggregator`, `kebabToCamel`, and track README links.

- [ ] **Step 2: Run and confirm failure**

```bash
cd scripts/scenario-tools
node --test test/generate.test.js
```

Expected: FAIL because `renderCatalog` and catalog markers do not exist.

- [ ] **Step 3: Implement catalog rendering**

Export:

```js
export const CATALOG_BEGIN = '<!-- BEGIN SCENARIO CATALOG -->';
export const CATALOG_END = '<!-- END SCENARIO CATALOG -->';

export function renderCatalog(scenarios) {
  const rank = { beginner: 0, intermediate: 1, advanced: 2 };
  const rows = scenarios
    .slice()
    .sort((a, b) =>
      (rank[a.manifest.difficulty] - rank[b.manifest.difficulty])
      || a.manifest.title.localeCompare(b.manifest.title)
    )
    .map(({ id, manifest: m }) =>
      `| [${m.title}](scenarios/${id}/) | ${m.platform} | ${m.incidentType} | ${m.severity} | ${m.estimatedMinutes}m | ${m.difficulty} | ${m.costProfile} | ${m.summary} |`
    );

  return [
    CATALOG_BEGIN,
    '<!-- Generated by scripts/validate-scenarios.sh — do not edit by hand. -->',
    '',
    '| Scenario | Platform | Incident | Severity | Est. | Difficulty | Cost | Summary |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    CATALOG_END,
  ].join('\n');
}
```

`bin/generate.js` must load all scenarios, replace the root README marker block, and print:

```text
generated root catalog: N scenario(s)
```

- [ ] **Step 4: Add catalog markers to `README.md`**

Replace the existing “Choose a track” and “Scenarios at a glance” sections with:

```markdown
## Choose a scenario

Select one incident and follow its complete setup, exercise, recovery, and cleanup path.

<!-- BEGIN SCENARIO CATALOG -->
<!-- END SCENARIO CATALOG -->
```

- [ ] **Step 5: Run generator tests**

```bash
cd scripts/scenario-tools
node --test test/generate.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit catalog generation**

```bash
git add README.md scripts/scenario-tools/lib/generate.js scripts/scenario-tools/test/generate.test.js scripts/scenario-tools/bin/generate.js
git commit -m "feat: generate root scenario catalog"
```

### Task 4: Validate capsule paths and per-scenario remediation actions

**Files:**
- Modify: `scripts/scenario-tools/lib/validate.js`
- Modify: `scripts/scenario-tools/test/validate.test.js`
- Modify: `scripts/scenario-tools/bin/validate.js`

- [ ] **Step 1: Add failing validator tests**

Add tests for setup/cleanup parity, missing guide, path escape, optional remediation, and duplicate actions within one manifest:

```js
test('duplicate remediation actions within one scenario are reported', () => {
  const manifest = {
    ...baseManifest,
    remediate: [
      { action: 'cleanup', bash: 'scripts/a.sh', powershell: 'scripts/a.ps1', description: 'A' },
      { action: 'cleanup', bash: 'scripts/b.sh', powershell: 'scripts/b.ps1', description: 'B' },
    ],
  };
  assert.deepEqual(findDuplicateActions(manifest), ['cleanup']);
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd scripts/scenario-tools
node --test test/validate.test.js
```

Expected: FAIL on the new lifecycle and duplicate-action assertions.

- [ ] **Step 3: Implement validation**

`checkScenario` must validate `scenario.yaml`, `guide`, all four lifecycle script pairs,
optional remediation pairs, signal, investigation, source, and tests. Resolve each path,
then reject it unless:

```js
const relative = pathRelative(dir, resolved);
const staysInside = relative !== '' && !relative.startsWith('..') && !isAbsolute(relative);
```

`findDuplicateActions` must accept one manifest and return repeated action names:

```js
export function findDuplicateActions(manifest) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of manifest.remediate ?? []) {
    if (seen.has(item.action)) duplicates.add(item.action);
    seen.add(item.action);
  }
  return [...duplicates].sort();
}
```

`bin/validate.js` must:

1. Load all top-level scenarios.
2. Validate each schema and cross-field contract.
3. Validate duplicate actions per scenario.
4. Compare the root README block with `renderCatalog`.
5. Print `Scenario validation passed` only when all checks pass.

- [ ] **Step 4: Run validator tests**

```bash
cd scripts/scenario-tools
node --test test/validate.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit validation**

```bash
git add scripts/scenario-tools/lib/validate.js scripts/scenario-tools/test/validate.test.js scripts/scenario-tools/bin/validate.js
git commit -m "feat: validate scenario capsules"
```

### Task 5: Scaffold complete capsule skeletons

**Files:**
- Modify: `scripts/scenario-tools/bin/new-scenario.js`
- Replace: `scripts/scenario-tools/template/**`
- Modify: `scripts/scenario-tools/test/template.test.js`
- Modify: `scripts/new-scenario.sh`

- [ ] **Step 1: Write the new template test**

Materialize with tokens `__SCENARIO_ID__`, `__SCENARIO_TITLE__`, and `__PLATFORM__`. Assert the
template contains `README.md`, `infra/bicep/main.bicep`, and all eight lifecycle scripts.

- [ ] **Step 2: Run and confirm failure**

```bash
cd scripts/scenario-tools
node --test test/template.test.js
```

Expected: FAIL because the current template has no setup or cleanup scripts and uses `track`.

- [ ] **Step 3: Replace the template**

Use this manifest:

```yaml
id: __SCENARIO_ID__
title: __SCENARIO_TITLE__
platform: __PLATFORM__
incidentType: Application failure
summary: A controlled fault produces an observable service degradation for SRE Agent investigation.
severity: 2
estimatedMinutes: 30
difficulty: beginner
costProfile: low
guide: README.md
setup:
  bash: scripts/setup.sh
  powershell: scripts/setup.ps1
inject:
  bash: scripts/inject.sh
  powershell: scripts/inject.ps1
validate:
  bash: scripts/validate.sh
  powershell: scripts/validate.ps1
cleanup:
  bash: scripts/cleanup.sh
  powershell: scripts/cleanup.ps1
```

Create executable Bash stubs and matching PowerShell stubs under `template/scripts/`.
Create `template/infra/bicep/main.bicep` with `targetScope = 'resourceGroup'`.

- [ ] **Step 4: Update CLI parsing**

Support:

```bash
scripts/new-scenario.sh <id> "Title" --platform "Azure App Service"
```

Reject missing platform, invalid IDs, and existing destinations. The destination is
`scenarios/<id>`.

- [ ] **Step 5: Run template and full unit tests**

```bash
cd scripts/scenario-tools
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit scaffolding**

```bash
git add scripts/new-scenario.sh scripts/scenario-tools/bin/new-scenario.js scripts/scenario-tools/template scripts/scenario-tools/test/template.test.js
git commit -m "feat: scaffold standalone scenarios"
```

### Task 6: Repath scenario CI

**Files:**
- Modify: `.github/workflows/validate-scenarios.yml`

- [ ] **Step 1: Change workflow path filters**

Use:

```yaml
paths:
  - 'scenarios/**'
  - 'README.md'
  - 'schemas/scenario.schema.json'
  - 'scripts/scenario-tools/**'
```

Apply the same list to push and pull request.

- [ ] **Step 2: Build capsule Bicep entry points**

Replace the aggregator loop with:

```bash
shopt -s nullglob
for f in scenarios/*/infra/bicep/main.bicep scenarios/*/infra/bicep/modules/alert.bicep; do
  echo "Building $f"
  az bicep build --file "$f" --stdout > /dev/null
done
```

- [ ] **Step 3: Run framework validation**

```bash
npm --prefix scripts/scenario-tools test
scripts/validate-scenarios.sh --write
scripts/validate-scenarios.sh
```

Expected after all four migration plans are applied: `Scenario validation passed`.

- [ ] **Step 4: Commit CI changes**

```bash
git add .github/workflows/validate-scenarios.yml
git commit -m "ci: validate top-level scenarios"
```
