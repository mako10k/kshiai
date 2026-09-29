/** R: Verify local V3 trial registration reaches persistent selection reads. */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { createV3StageTrialCandidate } from "../fixtures/neva-v3.js";
import { createV3StageTrialSecondCandidate } from "../fixtures/rio-v3.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-vt101-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "trial.db");

const { closeDatabase, query } = await import("../db.js");
const { getCurrentAssetGeneration } = await import("./asset-generations.js");
const { getCharacterCompatibility } = await import("./character-assets-v2.js");
const { listCharactersForUser, listPublicOpponents } = await import("./characters.js");
const { registerLocalV3TrialCharacter } = await import("./local-v3-trial-characters.js");
const { buildRoutes } = await import("../routes.js");
const { MockLlmProvider } = await import("../llm/mock.js");

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("local V3 trial registration", () => {
  it("persists Neva and Rio as immutable current generations visible to both selection lists", async () => {
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, 'x', $3)`,
      ["vt101-owner", "vt101-owner", "2026-09-29T00:00:00.000Z"],
    );
    await query(
      `INSERT INTO sessions (token, user_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4)`,
      ["vt101-session", "vt101-owner", "2026-09-29T00:00:00.000Z",
        "2099-09-29T00:00:00.000Z"],
    );
    const inputs = [
      { characterId: "vt101-neva", ownerUserId: "vt101-owner",
        envelope: createV3StageTrialCandidate() },
      { characterId: "vt101-rio", ownerUserId: "vt101-owner",
        envelope: createV3StageTrialSecondCandidate() },
    ];
    assert.equal((await listCharactersForUser("vt101-owner")).characters.length, 0);
    for (const input of inputs) {
      const first = await registerLocalV3TrialCharacter(input);
      const again = await registerLocalV3TrialCharacter(input);
      assert.deepEqual(again, first);
      const generation = await getCurrentAssetGeneration("character", input.characterId);
      assert.equal(generation?.generationId, first.generationId);
      assert.equal(generation?.contentDigest, first.contentDigest);
      assert.equal(generation?.generation, 1);
      assert.equal(generation?.schemaVersion, 3);
      assert.equal((await getCharacterCompatibility(input.characterId)).status, "ready");
    }
    const owner = await listCharactersForUser("vt101-owner");
    assert.deepEqual(new Set(owner.characters.map((item) => item.id)),
      new Set(inputs.map((input) => input.characterId)));
    assert.ok(owner.characters.every((item) => item.selectable
      && item.compatibility?.schemaVersion === 3));
    const opponents = await listPublicOpponents("vt101-owner");
    assert.deepEqual(new Set(opponents.characters.map((item) => item.id)),
      new Set(inputs.map((input) => input.characterId)));
    const app = buildRoutes({ llm: new MockLlmProvider() });
    const headers = { Cookie: "kshiai_session=vt101-session" };
    const selected = z.object({ characters: z.array(z.object({ id: z.string() })) });
    const candidates = z.object({ candidates: z.array(z.object({ id: z.string() })) });
    const ownResponse = await app.request("/api/characters?selectable=true", { headers });
    assert.equal(ownResponse.status, 200);
    assert.deepEqual(new Set(selected.parse(await ownResponse.json()).characters.map((x) => x.id)),
      new Set(inputs.map((input) => input.characterId)));
    const candidateResponse = await app.request("/api/match/candidates", { headers });
    assert.equal(candidateResponse.status, 200);
    assert.deepEqual(new Set(candidates.parse(await candidateResponse.json()).candidates.map((x) => x.id)),
      new Set(inputs.map((input) => input.characterId)));
    await assert.rejects(registerLocalV3TrialCharacter({
      ...inputs[0]!, envelope: inputs[1]!.envelope,
    }), /TRIAL_CHARACTER_ALREADY_EXISTS/);
    assert.equal((await getCurrentAssetGeneration("character", "vt101-neva"))?.generation, 1);
  });
});
