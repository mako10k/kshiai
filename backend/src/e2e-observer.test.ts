/** R: Verify observer registration reuses V3 assets without creating or upgrading V2 characters. */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultBasicAttack, defaultParameters, type CharacterSheet } from "@kshiai/shared";
const directory = mkdtempSync(join(tmpdir(), "kshiai-e2e-v3-only-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "test.db");
const { query, closeDatabase } = await import("./db.js");
const { E2E_FIXTURE_IDS, ensurePersistentE2eFixtures } = await import("./e2e-observer.js");
const { saveHistoricalCharacterFixture } = await import("./testing/historical-character-fixtures.js");
const { createAssetGeneration } = await import("./repositories/asset-generations.js");
const { createV3StageTrialCandidate } = await import("./fixtures/neva-v3.js");
function character(id: string, ownerUserId: string): CharacterSheet {
  return { id, ownerUserId, displayName: id, tags: [], createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
    appearance: { summary: "old cloak", visualPrompt: "blue cloak" }, traits: [], parameters: defaultParameters(),
    basicAttack: defaultBasicAttack(), skills: [], weapon: null, armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false }, narrativeBlurb: "historical fixture" };
}
before(async () => {
  for (const owner of ["observer", "opponent"]) await query(
    "INSERT INTO users (id,username,password_hash,created_at) VALUES ($1,$1,'test',$2)",
    [owner, new Date().toISOString()]);
});
after(async () => { await closeDatabase(); rmSync(directory, {recursive:true,force:true}); });
const input = { observerUserId: "observer", opponentUserId: "opponent" };
describe("V3-only observer registration", () => {
  it("rejects missing character fixtures without creating V2", async () => {
    await assert.rejects(ensurePersistentE2eFixtures(input), /E2E_V3_CHARACTER_FIXTURE_REQUIRED/);
    assert.equal((await query("SELECT id FROM characters")).rows.length, 0);
  });
  it("rejects existing historical V2 without rewriting it", async () => {
    await saveHistoricalCharacterFixture(character(E2E_FIXTURE_IDS.observerCharacter, "observer"));
    await saveHistoricalCharacterFixture(character(E2E_FIXTURE_IDS.opponentCharacter, "opponent"));
    const before = (await query("SELECT generation_id FROM asset_generations WHERE asset_type='character'")).rows;
    await assert.rejects(ensurePersistentE2eFixtures(input), /CHARACTER_V3_UPDATE_REQUIRED/);
    assert.deepEqual((await query("SELECT generation_id FROM asset_generations WHERE asset_type='character'")).rows, before);
  });
  it("reuses existing V3 fixtures without adding any character generations", async () => {
    for (const id of [E2E_FIXTURE_IDS.observerCharacter, E2E_FIXTURE_IDS.opponentCharacter]) {
      await createAssetGeneration({assetType:"character",assetId:id,schemaVersion:3,content:createV3StageTrialCandidate()});
    }
    const before = (await query("SELECT generation_id FROM asset_generations WHERE asset_type='character'")).rows;
    const result = await ensurePersistentE2eFixtures(input);
    assert.equal(result.observerCharacter,"reused"); assert.equal(result.opponentCharacter,"reused");
    assert.deepEqual((await query("SELECT generation_id FROM asset_generations WHERE asset_type='character'")).rows, before);
  });
});
