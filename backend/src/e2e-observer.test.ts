import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CharacterGenerationEnvelopeV2Schema } from "@kshiai/shared";

const tempDir = mkdtempSync(join(tmpdir(), "kshiai-e2e-observer-test-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(tempDir, "test.db");
const { E2E_FIXTURE_IDS, ensurePersistentE2eFixtures } = await import(
  "./e2e-observer.js"
);
const characterRepo = await import("./repositories/characters.js");
const characterAssetRepo = await import("./repositories/character-assets-v2.js");
const battlefieldRepo = await import("./repositories/battlefields.js");
const battlefieldAssetRepo = await import("./repositories/battlefield-assets-v2.js");
const narrationStyleRepo = await import("./repositories/narration-styles.js");
const narrationStyleAssetRepo = await import(
  "./repositories/narration-style-assets-v2.js"
);
const { createAssetGeneration } = await import("./repositories/asset-generations.js");
const { getDb, query } = await import("./db.js");

after(() => rmSync(tempDir, { recursive: true, force: true }));

describe("persistent E2E fixtures", () => {
  it("creates fixtures once and reuses their accumulated state", async () => {
    const db = getDb();
    const insertUser = db.prepare(
      `INSERT INTO users
        (id, username, password_hash, email, account_kind, created_at)
       VALUES (?, ?, 'x', ?, ?, '2026-08-07T00:00:00.000Z')`,
    );
    insertUser.run("observer", "observer", "observer@example.test", "e2e");
    insertUser.run("opponent", "opponent", "opponent@example.test", "test");

    assert.deepEqual(
      await ensurePersistentE2eFixtures({
        observerUserId: "observer",
        opponentUserId: "opponent",
      }),
      {
        observerCharacter: "created",
        opponentCharacter: "created",
        battlefield: "created",
        narrationStyle: "created",
      },
    );

    const observer = await characterRepo.getSheet(E2E_FIXTURE_IDS.observerCharacter);
    assert.ok(observer);
    observer.record = {
      ...observer.record!,
      wins: 1,
      gamesPlayed: 1,
      rating: 1512,
    };
    observer.updatedAt = "2026-08-07T00:01:00.000Z";
    await characterRepo.saveSheet(observer);
    await battlefieldRepo.updateBattlefieldVisibility(
      E2E_FIXTURE_IDS.battlefield,
      "observer",
      "private",
    );
    await narrationStyleRepo.updateNarrationStyleVisibility(
      E2E_FIXTURE_IDS.narrationStyle,
      "observer",
      "private",
    );

    assert.deepEqual(
      await ensurePersistentE2eFixtures({
        observerUserId: "observer",
        opponentUserId: "opponent",
      }),
      {
        observerCharacter: "reused",
        opponentCharacter: "reused",
        battlefield: "reused",
        narrationStyle: "reused",
      },
    );
    assert.equal(
      (await characterRepo.getSheet(E2E_FIXTURE_IDS.observerCharacter))?.record?.rating,
      1512,
    );

    const observerReady = await characterAssetRepo.getReadyCharacterGeneration(
      E2E_FIXTURE_IDS.observerCharacter,
    );
    const opponentReady = await characterAssetRepo.getReadyCharacterGeneration(
      E2E_FIXTURE_IDS.opponentCharacter,
    );
    assert.ok(observerReady);
    assert.ok(opponentReady);
    const observerEnvelope = CharacterGenerationEnvelopeV2Schema.parse(
      observerReady.content,
    );
    const missingCompiler = {
      ...observerEnvelope,
      compilerCompatibility: observerEnvelope.compilerCompatibility.slice(1),
    };
    const observerUnsupported = await createAssetGeneration({
      assetType: "character",
      assetId: E2E_FIXTURE_IDS.observerCharacter,
      schemaVersion: 2,
      content: missingCompiler,
    });
    const opponentUnsupported = await createAssetGeneration({
      assetType: "character",
      assetId: E2E_FIXTURE_IDS.opponentCharacter,
      schemaVersion: 2,
      content: { envelopeVersion: 2 },
    });
    await createAssetGeneration({
      assetType: "battlefield-preset",
      assetId: E2E_FIXTURE_IDS.battlefield,
      schemaVersion: 1,
      content: { legacy: true },
    });
    await createAssetGeneration({
      assetType: "narration-style",
      assetId: E2E_FIXTURE_IDS.narrationStyle,
      schemaVersion: 1,
      content: { legacy: true },
    });
    await query(
      `UPDATE character_asset_states
          SET compatibility_status = 'ready', current_generation_id = $2
        WHERE character_id = $1`,
      [E2E_FIXTURE_IDS.observerCharacter, observerUnsupported.generationId],
    );
    await query(
      `UPDATE character_asset_states
          SET compatibility_status = 'ready', current_generation_id = $2
        WHERE character_id = $1`,
      [E2E_FIXTURE_IDS.opponentCharacter, opponentUnsupported.generationId],
    );
    await query(
      "DELETE FROM battlefield_asset_states WHERE battlefield_id = $1",
      [E2E_FIXTURE_IDS.battlefield],
    );
    await query(
      "DELETE FROM narration_style_asset_states WHERE narration_style_id = $1",
      [E2E_FIXTURE_IDS.narrationStyle],
    );
    assert.equal(
      (await characterAssetRepo.getCharacterCompatibility(
        E2E_FIXTURE_IDS.observerCharacter,
      )).reasonCode,
      "missing_required_compiler",
    );
    assert.equal(
      (await characterAssetRepo.getCharacterCompatibility(
        E2E_FIXTURE_IDS.opponentCharacter,
      )).reasonCode,
      "invalid_v2_envelope",
    );
    assert.equal(
      (await battlefieldAssetRepo.getBattlefieldCompatibility(
        E2E_FIXTURE_IDS.battlefield,
      )).reasonCode,
      "legacy_schema",
    );
    assert.equal(
      (await narrationStyleAssetRepo.getNarrationStyleCompatibility(
        E2E_FIXTURE_IDS.narrationStyle,
      )).reasonCode,
      "legacy_schema",
    );

    assert.deepEqual(
      await ensurePersistentE2eFixtures({
        observerUserId: "observer",
        opponentUserId: "opponent",
      }),
      {
        observerCharacter: "reused",
        opponentCharacter: "reused",
        battlefield: "reused",
        narrationStyle: "reused",
      },
    );
    assert.ok(await characterAssetRepo.getReadyCharacterGeneration(
      E2E_FIXTURE_IDS.observerCharacter,
    ));
    assert.ok(await characterAssetRepo.getReadyCharacterGeneration(
      E2E_FIXTURE_IDS.opponentCharacter,
    ));
    assert.ok(await battlefieldAssetRepo.getReadyBattlefieldGeneration(
      E2E_FIXTURE_IDS.battlefield,
    ));
    assert.ok(await narrationStyleAssetRepo.getReadyNarrationStyleGeneration(
      E2E_FIXTURE_IDS.narrationStyle,
    ));
    assert.equal(
      (await characterRepo.getSheet(E2E_FIXTURE_IDS.observerCharacter))?.record?.rating,
      1512,
    );
    assert.equal(
      (await characterRepo.listPlayableOpponentSheets("observer"))
        .some((sheet) => sheet.id === E2E_FIXTURE_IDS.opponentCharacter),
      true,
    );
    assert.equal(
      (await battlefieldRepo.getPreset(E2E_FIXTURE_IDS.battlefield))?.visibility,
      "private",
    );
    assert.equal(
      (await narrationStyleRepo.getNarrationStyle(
        E2E_FIXTURE_IDS.narrationStyle,
      ))?.visibility,
      "private",
    );

    const generationCountsBefore = await Promise.all([
      ["character", E2E_FIXTURE_IDS.observerCharacter],
      ["character", E2E_FIXTURE_IDS.opponentCharacter],
      ["battlefield-preset", E2E_FIXTURE_IDS.battlefield],
      ["narration-style", E2E_FIXTURE_IDS.narrationStyle],
    ].map(async ([assetType, assetId]) => Number((await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM asset_generations
        WHERE asset_type = $1 AND asset_id = $2`,
      [assetType, assetId],
    )).rows[0]?.count ?? 0)));
    await ensurePersistentE2eFixtures({
      observerUserId: "observer",
      opponentUserId: "opponent",
    });
    const generationCountsAfter = await Promise.all([
      ["character", E2E_FIXTURE_IDS.observerCharacter],
      ["character", E2E_FIXTURE_IDS.opponentCharacter],
      ["battlefield-preset", E2E_FIXTURE_IDS.battlefield],
      ["narration-style", E2E_FIXTURE_IDS.narrationStyle],
    ].map(async ([assetType, assetId]) => Number((await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM asset_generations
        WHERE asset_type = $1 AND asset_id = $2`,
      [assetType, assetId],
    )).rows[0]?.count ?? 0)));
    assert.deepEqual(generationCountsAfter, generationCountsBefore);
  });
});
