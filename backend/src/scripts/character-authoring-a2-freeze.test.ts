import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertXaiResponseSchema } from "../llm/provider-response-schema.js";
import {
  CHARACTER_AUTHORING_A2_MAX_CALLS,
  CHARACTER_AUTHORING_A2_MODEL,
  CHARACTER_AUTHORING_A2_SCHEMA_NAME,
  freezeCharacterAuthoringA2,
} from "./character-authoring-a2-freeze.js";

describe("character authoring A2 freeze", () => {
  it("captures one create_instruction request against the acyclic v2 schema", async () => {
    const { freeze, schema, captured } = await freezeCharacterAuthoringA2();
    assert.equal(freeze.maxCalls, CHARACTER_AUTHORING_A2_MAX_CALLS);
    assert.equal(freeze.model, CHARACTER_AUTHORING_A2_MODEL);
    assert.equal(freeze.sourceKind, "create_instruction");
    assert.equal(freeze.schemaName, CHARACTER_AUTHORING_A2_SCHEMA_NAME);
    assert.equal(freeze.retry.definitionRepairFollowUp, false);
    assert.equal(freeze.retry.sdkMaxRetries, 0);
    assert.equal(freeze.productionEffects.deployment, false);
    assert.equal(captured.opts.label, "generateCharacterDefinitionV2");
    assert.equal(captured.opts.tier, "engine");
    assertXaiResponseSchema(schema);
    assert.equal(freeze.schemaDigestSha256.length, 64);
    assert.equal(freeze.requestDigestSha256.length, 64);
    assert.ok(freeze.serializedRequestBytes > 0);
    assert.ok(freeze.reservedCostUsd <= freeze.maxReservedUsd);
    const again = await freezeCharacterAuthoringA2();
    assert.equal(again.freeze.schemaDigestSha256, freeze.schemaDigestSha256);
    assert.equal(again.freeze.requestDigestSha256, freeze.requestDigestSha256);
  });
});
