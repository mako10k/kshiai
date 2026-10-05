/** R: Verify V2 write rejection independently of retained historical readers. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assetContentDigest, type AssetGeneration } from "../testing/historical-asset-generations.js";
import { createV3StageTrialCandidate } from "../fixtures/neva-v3.js";
import { assertCharacterV3UpdateGeneration, assertCharacterV3WriteCandidate } from "./character-update-policy.js";

function generation(version: number, content: unknown): AssetGeneration {
  return { assetType: "character", assetId: "policy-character", generation: 1,
    generationId: "policy-generation", schemaVersion: version, content,
    contentDigest: assetContentDigest(content), createdAt: "2026-10-02T00:00:00.000Z" };
}

describe("ordinary character write version admission", () => {
  it("rejects an old generation even if its row is otherwise ready", () => {
    assert.throws(() => assertCharacterV3UpdateGeneration(generation(2, createV3StageTrialCandidate())), /CHARACTER_V3_UPDATE_REQUIRED/);
  });
  it("rejects an old candidate before it can replace a current V3 generation", () => {
    const v3 = createV3StageTrialCandidate();
    assert.throws(() => assertCharacterV3WriteCandidate({ ...v3,
      definitionSchema: { family: "character", version: 2 },
      definition: { ...v3.definition, schemaVersion: 2 } }), /CHARACTER_V3_CANDIDATE_REQUIRED/);
  });
  it("admits a valid V3 target and candidate", () => {
    const v3 = createV3StageTrialCandidate();
    assertCharacterV3UpdateGeneration(generation(3, v3));
    assertCharacterV3WriteCandidate(v3);
  });
});
