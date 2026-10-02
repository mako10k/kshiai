import assert from "node:assert/strict";
import { it } from "node:test";
import { CharacterDefinitionV2Schema, type CharacterActionNormV3 } from "@kshiai/shared";
import { createV3StageTrialCandidate } from "../fixtures/neva-v3.js";
import { v3ToProfileDefinitionV2 } from "./character-v3-profile-adapter.js";

it("preserves restrictive and preference norm values through the V3 profile adapter", () => {
  const definition = createV3StageTrialCandidate().definition;
  const base = definition.actionNorms[0];
  assert.ok(base);
  const norms: CharacterActionNormV3[] = [
    { ...base, force: "constraint", response: { ...base.response, disposition: "forbid" } },
    { ...base, id: "original-preference", force: "commitment", response: { ...base.response, disposition: "avoid" } },
  ];
  const result = v3ToProfileDefinitionV2({ ...definition, actionNorms: norms });
  assert.ok(CharacterDefinitionV2Schema.safeParse(result).success);
  for (const [index, original] of norms.entries()) {
    const projected = result.actionNorms[index];
    assert.ok(projected);
    assert.equal(projected.force, original.force);
    assert.equal(projected.response.disposition, original.response.disposition);
    assert.deepEqual(projected.response.actionRefs, original.response.actionRefs);
    assert.deepEqual(projected.description, original.description);
  }
});
