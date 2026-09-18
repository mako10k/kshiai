import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CharacterGenerationEnvelopeV3Schema,
  type CharacterSheet,
} from "@kshiai/shared";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-v3-battle-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "v3-battle.db");

const { closeDatabase, query, withTransaction } = await import("../db.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const characterRepo = await import("../repositories/characters.js");
const generationRepo = await import("../repositories/asset-generations.js");
const settingsRepo = await import("../repositories/dialogue-pipeline-settings.js");
const { ensureSystemNarrationStyles } = await import("../repositories/narration-styles.js");
const { createConsciousFixture } = await import("./conscious-agency.fixtures.js");
const { startBattle, advanceTurn } = await import("./battle-service.js");
const { getBattle } = await import("../repositories/battles.js");
const { buildImportedCharacterEnvelopeV2 } = await import("./character-authoring-service.js");

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

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("ADR-0032 V3 character battle binding", () => {
  it("creates an all-V3 battle and keeps exact character generations after pointer changes and reload", async () => {
    const fixture = createConsciousFixture();
    await query(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ($1, $2, $3, $4)",
      ["inventory-owner", "v3-battle-owner", "test", new Date().toISOString()],
    );
    await characterRepo.saveSheet(fixture.mine);
    await characterRepo.saveSheet(fixture.opp);
    const previousA = await generationRepo.getCurrentAssetGeneration("character", fixture.mine.id);
    const previousB = await generationRepo.getCurrentAssetGeneration("character", fixture.opp.id);
    assert.ok(previousA);
    assert.ok(previousB);

    const v3A = await generationRepo.createAssetGeneration({
      assetType: "character",
      assetId: fixture.mine.id,
      schemaVersion: 3,
      content: envelopeV3(fixture.mine),
    });
    const v3B = await generationRepo.createAssetGeneration({
      assetType: "character",
      assetId: fixture.opp.id,
      schemaVersion: 3,
      content: envelopeV3(fixture.opp),
    });
    assert.equal(
      (await generationRepo.getCurrentAssetGeneration("character", fixture.mine.id))?.generationId,
      v3A.generationId,
    );
    assert.equal(
      (await generationRepo.getCurrentAssetGeneration("character", fixture.opp.id))?.generationId,
      v3B.generationId,
    );
    await ensureSystemNarrationStyles();
    await settingsRepo.updateDialoguePipelineSettings({
      userId: "inventory-owner",
      patch: { ...fixture.settings, schemaVersion: 3, expectedRevision: 0 },
    });

    const llm = new MockLlmProvider();
    const created = await startBattle({
      userId: "inventory-owner",
      battleId: "v3-battle-bound",
      myCharacterId: fixture.mine.id,
      opponentCharacterId: fixture.opp.id,
      battlefieldMode: "random",
      llm,
    });
    const bound = await getBattle(created.id);
    assert.equal(bound?.assetManifest?.schemaVersion, 4);
    assert.equal(bound.assetManifest.characters.a.generationId, v3A.generationId);
    assert.equal(bound.assetManifest.characters.b.generationId, v3B.generationId);
    assert.equal(bound.assetManifest.characters.a.contentDigest, v3A.contentDigest);
    assert.equal(bound.assetManifest.characters.b.contentDigest, v3B.contentDigest);
    assert.equal(bound.assetManifest.characters.a.basicAttackSource.kind, "character_generation_v3");
    assert.equal(bound.assetManifest.characters.b.basicAttackSource.kind, "character_generation_v3");

    await withTransaction(async (connection) => {
      await generationRepo.activateAssetGeneration(connection, previousA, v3A.generationId);
      await generationRepo.activateAssetGeneration(connection, previousB, v3B.generationId);
    });
    await advanceTurn({
      userId: "inventory-owner",
      battleId: created.id,
      operationId: "v3-battle-first-turn",
      llm,
    });
    const resumed = await getBattle(created.id);
    assert.equal(resumed?.assetManifest?.schemaVersion, 4);
    assert.deepEqual(resumed.assetManifest.characters, bound.assetManifest.characters);

    await withTransaction((connection) =>
      generationRepo.activateAssetGeneration(connection, v3A, previousA.generationId));
    await assert.rejects(
      startBattle({
        userId: "inventory-owner",
        battleId: "v3-battle-mixed-rejected",
        myCharacterId: fixture.mine.id,
        opponentCharacterId: fixture.opp.id,
        battlefieldMode: "random",
        llm,
      }),
      /BATTLE_CHARACTER_GENERATION_VERSION_MIXED/,
    );
  });
});
