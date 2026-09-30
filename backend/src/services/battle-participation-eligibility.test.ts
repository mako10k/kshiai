// R: Verify V3 battle eligibility rejects legacy and invalid capability or identity inputs.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CharacterGenerationEnvelopeV3Schema, type CharacterSheet } from "@kshiai/shared";
import { assetContentDigest, type AssetGeneration } from "../repositories/asset-generations.js";
import { buildImportedCharacterEnvelopeV2 } from "./character-authoring-service.js";
import { createConsciousFixture } from "./conscious-agency.fixtures.js";
import { evaluateBattleParticipantEligibility } from "./battle-participation-eligibility.js";

function envelopeV3(sheet: CharacterSheet) {
  const source = buildImportedCharacterEnvelopeV2({
    sheet,
    attemptId: `v3-battle-${sheet.id}`,
  });
  const { schemaVersion: _schemaVersion, actionNorms: _actionNorms, ...stable } =
    source.definition;
  return CharacterGenerationEnvelopeV3Schema.parse({
    ...source,
    definitionSchema: { family: "character", version: 3 },
    definition: {
      ...stable,
      schemaVersion: 3,
      actionNorms: [],
      consciousGuidance: [],
      mechanicalConflictFallbacks: [],
    },
    compilerCompatibility: [
      { consumer: "character-profile", version: 2 },
      { consumer: "battle-mechanics", version: 3 },
      { consumer: "psyche-trait-profile", version: 1 },
      { consumer: "character-conscious-self", version: 3 },
      { consumer: "character-action-norms", version: 3 },
      { consumer: "character-mechanical-conflict-fallback", version: 1 },
      { consumer: "character-relationship", version: 2 },
    ],
    deferredValues: { contractVersion: 1, values: [] },
  });
}

function generation(sheet: CharacterSheet, content: unknown = envelopeV3(sheet)): AssetGeneration {
  return { assetType: "character", assetId: sheet.id, generation: 1,
    generationId: "eligibility-generation", schemaVersion: 3,
    content, contentDigest: assetContentDigest(content), createdAt: sheet.createdAt };
}

describe("shared battle participation eligibility", () => {
  it("admits immutable V3 using only battle-mechanics@3", () => {
    const { mine } = createConsciousFixture();
    const content = { ...envelopeV3(mine), compilerCompatibility: [{ consumer: "battle-mechanics", version: 3 }] };
    const result = evaluateBattleParticipantEligibility(mine, generation(mine, content));
    assert.equal(result.status, "ready");
    if (result.status === "ready") assert.equal(result.participant.generation.generationId, "eligibility-generation");
  });
  it("rejects legacy, missing and capability-blocked generations", () => {
    const { mine } = createConsciousFixture();
    assert.deepEqual(evaluateBattleParticipantEligibility(mine, null), { status: "blocked", reason: "generation_missing" });
    assert.deepEqual(evaluateBattleParticipantEligibility(mine, { ...generation(mine), schemaVersion: 2 }), { status: "blocked", reason: "v3_required" });
    const content = { ...envelopeV3(mine), compilerCompatibility: [{ consumer: "character-profile", version: 2 }] };
    assert.deepEqual(evaluateBattleParticipantEligibility(mine, generation(mine, content)), { status: "blocked", reason: "capability_blocked" });
  });
  it("rejects digest, asset identity and deletion violations", () => {
    const { mine } = createConsciousFixture();
    for (const invalid of [{ ...generation(mine), contentDigest: "invalid" }, { ...generation(mine), assetId: "different" }]) {
      assert.deepEqual(evaluateBattleParticipantEligibility(mine, invalid), { status: "blocked", reason: "invalid_generation" });
    }
    assert.deepEqual(evaluateBattleParticipantEligibility({ ...mine, deletedAt: mine.createdAt }, generation(mine)), { status: "blocked", reason: "character_deleted" });
  });
});
