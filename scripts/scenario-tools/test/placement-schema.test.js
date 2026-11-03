import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import Ajv from "ajv/dist/2020.js";
import { validatePolicy } from "../../placement/placement.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const schema = JSON.parse(readFileSync(resolve(repositoryRoot, "schemas/placement.schema.json"), "utf8"));
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

for (const scenario of readdirSync(resolve(repositoryRoot, "scenarios"))) {
  test(`${scenario} placement policy satisfies the placement schema and engine rules`, () => {
    const policy = JSON.parse(readFileSync(resolve(repositoryRoot, "scenarios", scenario, "infra/placement.json"), "utf8"));
    assert.equal(policy.$schema, "../../../schemas/placement.schema.json");
    assert.ok(validate(policy), JSON.stringify(validate.errors, null, 2));
    assert.equal(policy.scenario, scenario);
    validatePolicy(policy, scenario);
  });
}

test("placement schema rejects unbounded region lists and unknown keys", () => {
  const regions = ["a", "b", "c", "d", "e", "f", "g"];
  assert.equal(validate({ scenario: "x", regions, defaultWorkload: "x", resourceGroup: "rg", deployment: { scope: "group", template: "t", name: "n", parameters: {} } }), false);
  assert.equal(validate({ scenario: "x", regions: ["eastus2"], defaultWorkload: "x", resourceGroup: "rg", deployment: { scope: "group", template: "t", name: "n", parameters: {} }, surprise: 1 }), false);
});
