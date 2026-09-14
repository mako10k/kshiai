import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CharacterGenerationEnvelopeV3Schema,
  defaultBasicAttack,
  defaultParameters,
  type CharacterSheet,
} from "@kshiai/shared";
import { assetContentDigest, type AssetGeneration } from "./asset-generations.js";
import { buildImportedCharacterEnvelopeV2 } from "../services/character-authoring-service.js";
import { readCharacterGeneration } from "./character-generation-reader.js";

const createdAt = "2026-09-14T00:00:00.000Z";
const requiredV3Capabilities = {
  contractVersion: 1 as const,
  required: [{ consumer: "battle-mechanics" as const, version: 3 }],
};

function sheet(): CharacterSheet {
  return {
    id: "reader-character",
    ownerUserId: "reader-owner",
    displayName: "版別読取",
    tags: ["reader"],
    createdAt,
    updatedAt: createdAt,
    appearance: {
      summary: "青い外套",
      visualPrompt: "adult in a blue cloak",
      imageUrl: null,
      previousImageUrl: "https://example.test/previous.png",
    },
    traits: ["慎重"],
    parameters: defaultParameters(),
    basicAttack: defaultBasicAttack(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "版別 reader の一時フィクスチャ。",
    visibility: "private",
  };
}

function generation(schemaVersion: number, content: unknown): AssetGeneration {
  return {
    assetType: "character",
    assetId: sheet().id,
    generation: schemaVersion,
    generationId: `character:${sheet().id}:g${schemaVersion}`,
    schemaVersion,
    content,
    contentDigest: assetContentDigest(content),
    createdAt,
  };
}

function envelopeV2() {
  return buildImportedCharacterEnvelopeV2({
    sheet: sheet(),
    attemptId: "reader-attempt-v2",
  });
}

function envelopeV3() {
  const source = envelopeV2();
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
    compilerCompatibility: [{ consumer: "battle-mechanics", version: 3 }],
    deferredValues: { contractVersion: 1, values: [] },
  });
}

describe("versioned character generation reader", () => {
  it("reads historical V2 and new V3 without changing either meaning", () => {
    const v2 = readCharacterGeneration({
      generation: generation(2, envelopeV2()),
      currentSheet: sheet(),
      requiredV3Capabilities,
    });
    const v3 = readCharacterGeneration({
      generation: generation(3, envelopeV3()),
      currentSheet: sheet(),
      requiredV3Capabilities,
    });
    assert.equal(v2.schemaVersion, 2);
    assert.equal(v2.sheet.displayName, "版別読取");
    assert.equal(v3.schemaVersion, 3);
    assert.equal(v3.sheet.displayName, "版別読取");
    assert.equal(v3.sheet.appearance.previousImageUrl,
      "https://example.test/previous.png");
    assert.equal(v3.sheet.visibility, "private");
    assert.equal(v3.compatibility.status, "ready");
    assert.equal(v3.actionNorms.contractVersion, 3);
    assert.equal(v3.consciousGuidance.contractVersion, 1);
    assert.equal(v3.mechanicalConflictFallbacks.contractVersion, 1);
  });

  it("rejects mixed storage and envelope versions", () => {
    assert.throws(
      () => readCharacterGeneration({
        generation: generation(2, envelopeV3()),
        currentSheet: sheet(),
        requiredV3Capabilities,
      }),
    );
    assert.throws(
      () => readCharacterGeneration({
        generation: generation(3, envelopeV2()),
        currentSheet: sheet(),
        requiredV3Capabilities,
      }),
    );
  });

  it("rejects content identity drift", () => {
    assert.throws(
      () => readCharacterGeneration({
        generation: {
          ...generation(3, envelopeV3()),
          contentDigest: "0".repeat(64),
        },
        currentSheet: sheet(),
        requiredV3Capabilities,
      }),
      /CONTENT_DIGEST_MISMATCH/,
    );
  });
});
