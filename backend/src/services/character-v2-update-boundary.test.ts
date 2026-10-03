/** R: Verify V2 character display and V3-only ordinary write boundaries. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "kshiai-v2-read-only-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.AUTH_PROVIDER = "legacy";
process.env.LLM_PROVIDER = "mock";
const { query, closeDatabase } = await import("../db.js");
const { buildRoutes } = await import("../routes.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const { saveSheet, getSheet } = await import("../repositories/characters.js");
const { saveHistoricalCharacterFixture } = await import("../testing/historical-character-fixtures.js");
const { defaultBasicAttack, defaultParameters } = await import("@kshiai/shared");
const { createV3StageTrialCandidate } = await import("../fixtures/neva-v3.js");
const { prepareV3TrialCharacter } = await import("../repositories/local-v3-trial-characters.js");
const assets = await import("../repositories/character-assets-v2.js");
const id = "v2-character", owner = "v2-owner";
const headers = { Cookie: "kshiai_session=v2-session", "Content-Type": "application/json", "Idempotency-Key": "v2-boundary" };
const llm = new MockLlmProvider();
const app = buildRoutes({ llm });
before(async () => {
  await query("INSERT INTO users (id,username,password_hash,created_at) VALUES ($1,$2,$3,$4)", [owner,"v2-owner","unused",new Date().toISOString()]);
  await query("INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES ($1,$2,$3,$4)", ["v2-session",owner,new Date().toISOString(),"2099-01-01T00:00:00Z"]);
  await saveHistoricalCharacterFixture({ id, ownerUserId: owner, displayName: "旧キャラ", tags: [], createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
    appearance: { summary: "青い服", visualPrompt: "blue clothes", imageUrl: null, previousImageUrl: null }, traits: ["慎重"],
    parameters: defaultParameters(), basicAttack: defaultBasicAttack(), skills: [], weapon: null, armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false }, narrativeBlurb: "旧キャラクター", visibility: "private" });
});
after(async () => { await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });
describe("V2 display without ordinary writes", () => {
  it("serves the bound old profile despite invalid executable battle data and retains access controls", async () => {
    const stored = await getSheet(id);
    assert.ok(stored);
    const { getCurrentAssetGeneration } = await import("../repositories/asset-generations.js");
    const generation = await getCurrentAssetGeneration("character", id);
    assert.ok(generation);
    const bound = { ...stored, displayName: "対戦当時の旧キャラ" };
    const state = { sideA: { characterId: id }, sideB: { characterId: "other" }, assetManifest: { characters: {
      a: { assetId: id, generationId: generation.generationId, snapshot: bound, compilerInputsV2: { invalid: true } },
      b: { assetId: "other", generationId: "other-generation", snapshot: { ...bound, id: "other" } },
    } } };
    const raw = JSON.stringify(state);
    await query("INSERT INTO battles (id,state_json,side_a_user_id,side_a_character_id,side_b_character_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)",
      ["old-display-battle", raw, owner, id, "other", stored.createdAt]);
    const response = await app.request(`/api/characters/${id}?battleId=old-display-battle`, { headers });
    assert.equal(response.status, 200);
    const profile = await response.json();
    assert.equal(profile.character.displayName, bound.displayName);
    assert.equal(profile.character.selectable, false);
    assert.equal(profile.character.upgradeAction, null);
    assert.equal(profile.isOwner, false);
    await query("UPDATE battles SET side_a_user_id=$1 WHERE id=$2", ["another-owner", "old-display-battle"]);
    assert.equal((await app.request(`/api/characters/${id}?battleId=old-display-battle`, { headers })).status, 404);
    assert.deepEqual((await query("SELECT state_json FROM battles WHERE id=$1", ["old-display-battle"])).rows, [{state_json:raw}]);
  });
  it("keeps current old-version display available", async () => {
    const r = await app.request(`/api/characters/${id}`, { headers });
    assert.equal(r.status, 200); const b = await r.json();
    assert.equal(b.character.displayName, "旧キャラ"); assert.equal(b.character.selectable, false);
    assert.equal(b.character.upgradeAction, null);
  });
  it("does not advertise unavailable migration or create an attempt when it is requested", async () => {
    const before = (await query("SELECT attempt_id FROM character_authoring_attempts")).rows;
    const response = await app.request(`/api/characters/${id}/upgrade`, { method: "POST", headers, body: "{}" });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "focused_authoring_unavailable");
    assert.deepEqual((await query("SELECT attempt_id FROM character_authoring_attempts")).rows, before);
  });
  it("rejects every ordinary owner mutation before creating attempts or changing the row", async () => {
    const original = await query("SELECT sheet_json FROM characters WHERE id=$1", [id]);
    for (const [method, suffix] of [["PATCH","/visibility"],["POST","/chat"],["POST","/restore-revision"],
      ["POST","/image"],["POST","/image/toggle"],["POST","/copy"],["POST","/improvement/analyze"],["POST","/improvement/prompt"],["DELETE",""]]) {
      const r = await app.request(`/api/characters/${id}${suffix}`, { method, headers, body: JSON.stringify({message:"変更",visibility:"public"}) });
      assert.equal(r.status, 409, suffix); const b = await r.json(); assert.equal(b.error,"character_v3_update_required",suffix);
    }
    assert.deepEqual((await query("SELECT sheet_json FROM characters WHERE id=$1", [id])).rows, original.rows);
    assert.equal((await query<{ n: number }>("SELECT COUNT(*) AS n FROM character_authoring_attempts")).rows[0]?.n, 0);
  });
  it("rejects programmatic V2 creation and updates without changing stored rows", async () => {
    const sheet = await getSheet(id);
    assert.ok(sheet);
    const before = (await query("SELECT sheet_json FROM characters WHERE id=$1", [id])).rows;
    await assert.rejects(saveSheet({ ...sheet, displayName: "changed" }), /CHARACTER_V3_UPDATE_REQUIRED/);
    await assert.rejects(saveSheet({ ...sheet, id: "forbidden-new-v2" }), /CHARACTER_V3_UPDATE_REQUIRED/);
    assert.deepEqual((await query("SELECT sheet_json FROM characters WHERE id=$1", [id])).rows, before);
    assert.equal((await query("SELECT id FROM characters WHERE id=$1", ["forbidden-new-v2"])).rows.length, 0);
  });
  it("retires dormant V2 provider generation before touching the provider or reporting work", async () => {
    const { buildCharacterGenerationCandidate } = await import("./character-authoring-service.js");
    const sheet = await getSheet(id);
    assert.ok(sheet);
    const retiredProvider = new Proxy(llm, {
      get() { throw new Error("provider_must_not_be_touched"); },
    });
    let statuses = 0;
    await assert.rejects(buildCharacterGenerationCandidate({
      llm: retiredProvider, attemptId: "retired-attempt", characterId: id,
      ownerUserId: owner, sourceText: "変更", sourceKind: "revision_instruction",
      generated: { sheet, assistantMessage: "旧候補" }, existing: sheet,
      reportStatus: async () => { statuses += 1; },
    }), /LEGACY_CHARACTER_AUTHORING_RETIRED/);
    assert.equal(statuses, 0);
  });
  it("rejects V2 portrait writes and keeps full restore unavailable", async () => {
    const before = (await query("SELECT generation_id FROM asset_generations WHERE asset_type='character'")).rows;
    const input = { characterId: id, ownerUserId: owner,
      expectedGenerationId: "old-generation", operationId: "retired-operation" };
    await assert.rejects(assets.activateCharacterPortraitRevision({ ...input,
      mediaId: "media", mediaRevisionId: "media-revision", sourceDigest: "source" }), /CHARACTER_V3_NOT_READY/);
    await assert.rejects(assets.toggleCharacterPortraitGeneration(input), /CHARACTER_V3_NOT_READY/);
    await assert.rejects(assets.restorePreviousCharacterGeneration(input), /CHARACTER_UPDATE_UNAVAILABLE/);
    assert.deepEqual((await query("SELECT generation_id FROM asset_generations WHERE asset_type='character'")).rows, before);
  });
  it("rejects legacy generation writes through the real generic repository", async () => {
    const store = await import("../repositories/asset-generations.js");
    const { withTransaction } = await import("../db.js");
    const existing = await store.getCurrentAssetGeneration("character", id);
    assert.ok(existing);
    const rows = (await query("SELECT generation_id FROM asset_generations WHERE asset_type='character'")).rows;
    for (const schemaVersion of [2, 3]) {
      const input = { assetType: "character", assetId: "blocked-generic-write", schemaVersion, content: existing.content };
      await assert.rejects(store.createAssetGeneration(input), /CHARACTER_V3_WRITE_REQUIRED/);
      await assert.rejects(withTransaction(c => store.appendAssetGeneration(c, input)), /CHARACTER_V3_WRITE_REQUIRED/);
    }
    await assert.rejects(withTransaction(c => store.activateAssetGeneration(c, existing, existing.generationId)), /CHARACTER_V3_WRITE_REQUIRED/);
    const forged = { ...existing, schemaVersion: 3, content: createV3StageTrialCandidate() };
    await assert.rejects(withTransaction(c => store.activateAssetGeneration(c, forged, existing.generationId)), /CHARACTER_V3_WRITE_REQUIRED/);
    assert.deepEqual((await query("SELECT generation_id FROM asset_generations WHERE asset_type='character'")).rows, rows);
    assert.equal((await store.getCurrentAssetGeneration("character", id))?.generationId, existing.generationId);
  });
  it("keeps historical fixture writes outside the runtime dependency graph", () => {
    const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
    function visit(directory: string) {
      for (const entry of readdirSync(directory, {withFileTypes:true})) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) { if (entry.name !== "testing") visit(path); continue; }
        if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
        const source = readFileSync(path, "utf8");
        assert.doesNotMatch(source, /(?:from\s*|import\s*\()\s*["'][^"']*testing\/(?:historical-character-fixtures|historical-asset-generations)/, path);
      }
    }
    visit(sourceRoot);
  });
  it("preserves the legacy definition when saving bound battle accounting facts", async () => {
    const { saveCharacterBattleAccounting } = await import("../repositories/character-battle-accounting.js");
    const { getCurrentAssetGeneration } = await import("../repositories/asset-generations.js");
    const original = await getSheet(id);
    assert.ok(original);
    const generationId = (await getCurrentAssetGeneration("character", id))?.generationId;
    const suppliedSheet = { ...original, displayName: "must not be copied", traits: ["changed"],
      record: { ...original.record!, wins: (original.record?.wins ?? 0) + 1 } };
    await saveCharacterBattleAccounting(suppliedSheet);
    const stored = await getSheet(id);
    assert.equal(stored?.displayName, original.displayName);
    assert.deepEqual(stored?.traits, original.traits);
    assert.equal(stored?.record?.wins, suppliedSheet.record.wins);
    assert.equal((await getCurrentAssetGeneration("character", id))?.generationId, generationId);
    await assert.rejects(saveSheet(suppliedSheet), /CHARACTER_V3_UPDATE_REQUIRED/);
  });
  it("does not fall back to V2 creation or migration when no V3 authoring provider exists", async () => {
    for (const path of ["/api/characters/generate", `/api/characters/${id}/upgrade`]) {
      const r = await app.request(path,{method:"POST",headers,body:JSON.stringify({prompt:"新規キャラ"})});
      assert.equal(r.status,409); assert.equal((await r.json()).error,"focused_authoring_unavailable");
    }
  });
  it("rejects confirmation of a previously stored V2 candidate without changing its generation", async () => {
    const { getCurrentAssetGeneration } = await import("../repositories/asset-generations.js");
    const original = await getCurrentAssetGeneration("character", id);
    assert.ok(original);
    await query(`INSERT INTO character_authoring_attempts
      (attempt_id, owner_user_id, character_id, kind, idempotency_key, request_digest,
       source_digest, status, candidate_json, created_at, updated_at, expires_at)
      VALUES ($1,$2,$3,'revision',$1,'old-request','old-source','awaiting_owner_acceptance',$4,$5,$5,$6)`,
      ["old-v2-attempt", owner, id, JSON.stringify(original.content), new Date().toISOString(), "2099-01-01T00:00:00Z"]);
    const response = await app.request("/api/characters/old-v2-attempt/confirm", { method: "POST", headers, body: "{}" });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).message, "CHARACTER_V3_CANDIDATE_REQUIRED");
    assert.equal((await getCurrentAssetGeneration("character", id))?.generationId, original.generationId);
  });
  it("retains direct validated V3 candidate preparation and activation", async () => {
    const envelope = createV3StageTrialCandidate();
    const attempt = await prepareV3TrialCharacter({ characterId: "new-v3", ownerUserId: owner, envelope,
      source: (await import("../fixtures/neva-v3.js")).createV3StageTrialSource() });
    const result = await assets.activateCharacterAuthoringAttempt({attemptId:attempt.attemptId,ownerUserId:owner,candidateDigest:attempt.candidateDigest ?? undefined});
    assert.equal(result.generation.schemaVersion,3);
  });
  it("keeps a bound V2 profile independent of the owner's current V3 generation", async () => {
    const old = await getSheet(id);
    assert.ok(old);
    const snapshot = { ...old, id: "new-v3", displayName: "旧V2の名前",
      appearance: { ...old.appearance, previousImageUrl: "https://example.test/bound-previous.png" },
      revisionSnapshot: undefined };
    const { toPublicCharacterForViewer } = await import("../repositories/characters.js");
    const profile = await toPublicCharacterForViewer(snapshot, owner);
    assert.equal(profile.displayName, snapshot.displayName);
    assert.equal(profile.appearance.previousImageUrl, snapshot.appearance.previousImageUrl);
    assert.equal(profile.revisionSavedAt, null);
    assert.equal(profile.revisionLabel, null);
  });

});
