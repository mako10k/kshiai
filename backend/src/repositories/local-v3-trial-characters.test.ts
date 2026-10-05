/** R: Verify fixed V3 candidates reach selection only through exact owner confirmation. */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { CharacterAuthoringReviewSchema } from "@kshiai/shared";
import { createV3StageTrialCandidate, createV3StageTrialSource } from "../fixtures/neva-v3.js";
import { createV3StageTrialSecondCandidate, createV3StageTrialSecondSource } from "../fixtures/rio-v3.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-vt101-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "trial.db");

const { closeDatabase, query } = await import("../db.js");
const { getCurrentAssetGeneration, assetContentDigest } = await import("./asset-generations.js");
const { getCharacterCompatibility, discardCharacterAuthoringAttempt, activateCharacterAuthoringAttempt, saveCharacterAuthoringCandidate } = await import("./character-assets-v2.js");
const { listCharactersForUser, listPublicOpponents } = await import("./characters.js");
const { prepareV3TrialCharacter } = await import("./local-v3-trial-characters.js");
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
        envelope: createV3StageTrialCandidate(), source: createV3StageTrialSource() },
      { characterId: "vt101-rio", ownerUserId: "vt101-owner",
        envelope: createV3StageTrialSecondCandidate(), source: createV3StageTrialSecondSource() },
    ];
    assert.equal((await listCharactersForUser("vt101-owner")).characters.length, 0);
    const llm = new Proxy(new MockLlmProvider(), {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof value === "function") return () => { throw new Error(`UNEXPECTED_PROVIDER_CALL:${String(property)}`); };
        return value;
      },
    });
    const app = buildRoutes({ llm });
    const headers = { Cookie: "kshiai_session=vt101-session", "Content-Type": "application/json" };
    for (const input of inputs) {
      const first = await prepareV3TrialCharacter(input);
      const again = await prepareV3TrialCharacter(input);
      assert.deepEqual(again, first);
      assert.equal(first.status, "awaiting_owner_acceptance");
      assert.equal(await getCurrentAssetGeneration("character", input.characterId), null);
      assert.equal((await listCharactersForUser("vt101-owner")).characters.some((x) => x.id === input.characterId), false);
      const reviewResponse = await app.request(`/api/character-drafts/${first.attemptId}`, { headers });
      assert.equal(reviewResponse.status, 200);
      const review = CharacterAuthoringReviewSchema.parse(await reviewResponse.json());
      assert.equal(review.canAccept, true);
      assert.equal(review.canEditCandidate, false);
      assert.equal(review.candidateDigest, assetContentDigest(first.candidate));
      assert.ok(review.semanticCandidateReview?.fields.some((field) => field.key === "createSource" && field.source === JSON.stringify(input.source)));
      assert.ok(review.semanticCandidateReview?.fields.some((field) => field.key === "definition.capabilities" && field.source?.includes("追加")));
      assert.equal(first.candidate?.provenance.attemptId, first.attemptId);
      assert.equal(first.candidate?.provenance.sourceDigest, assetContentDigest(input.source));
      const jobs = await query<{ status: string }>(`SELECT status FROM character_authoring_jobs WHERE attempt_id = $1`, [first.attemptId]);
      assert.equal(jobs.rows[0]?.status, "completed");
      const noReceipt = await app.request(`/api/characters/${first.attemptId}/confirm`, { method: "POST", headers });
      assert.equal(noReceipt.status, 409);
      const wrongReceipt = await app.request(`/api/characters/${first.attemptId}/confirm`, { method: "POST", headers, body: JSON.stringify({candidateDigest: "wrong"}) });
      assert.equal(wrongReceipt.status, 409);
      assert.equal(await getCurrentAssetGeneration("character", input.characterId), null);
      const edits = await app.request(`/api/character-drafts/${first.attemptId}/chat`, { method: "POST", headers, body: JSON.stringify({ message: "change it" }) });
      assert.equal(edits.status, 409);
      const request = { method: "POST", headers, body: JSON.stringify({ candidateDigest: review.candidateDigest }) };
      const responses = await Promise.all([app.request(`/api/characters/${first.attemptId}/confirm`, request), app.request(`/api/characters/${first.attemptId}/confirm`, request)]);
      for (const response of responses) assert.equal(response.status, 200, await response.text());
      const finalAttempt = await prepareV3TrialCharacter(input);
      assert.equal(finalAttempt.attemptId, first.attemptId);
      assert.equal(finalAttempt.status, "succeeded");
      const generation = await getCurrentAssetGeneration("character", input.characterId);
      assert.equal(generation?.generationId, finalAttempt.resultGenerationId);
      assert.equal(generation?.contentDigest, first.candidateDigest);
      assert.equal(generation?.generation, 1);
      assert.equal(generation?.schemaVersion, 3);
      assert.deepEqual(generation?.content, first.candidate);
      const stored = await query<{ sheet_json: string }>(`SELECT sheet_json FROM characters WHERE id = $1`, [input.characterId]);
      assert.ok(stored.rows[0]);
      const altered: unknown = JSON.parse(stored.rows[0].sheet_json);
      assert.ok(altered && typeof altered === "object");
      await query(`UPDATE characters SET sheet_json = $2 WHERE id = $1`, [input.characterId, JSON.stringify({ ...altered, displayName: "later mutable projection" })]);
      const replayed = await activateCharacterAuthoringAttempt({ attemptId: first.attemptId, ownerUserId: input.ownerUserId, candidateDigest: first.candidateDigest! });
      assert.equal(replayed.sheet.displayName, input.envelope.definition.identity.displayName);
      assert.equal(replayed.generation.generationId, generation?.generationId);
      await query(`UPDATE characters SET sheet_json = $2 WHERE id = $1`, [input.characterId, stored.rows[0].sheet_json]);
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
    await assert.rejects(prepareV3TrialCharacter({
      ...inputs[0]!, envelope: inputs[1]!.envelope, source: inputs[1]!.source,
    }), /IDEMPOTENCY/);
    assert.equal((await getCurrentAssetGeneration("character", "vt101-neva"))?.generation, 1);
  });
  it("preserves absence on decline, owner mismatch, digest drift and transactional CAS conflict", async () => {
    const envelope = createV3StageTrialCandidate();
    const prepare = (characterId: string) => prepareV3TrialCharacter({ characterId, ownerUserId: "vt101-owner", envelope, source: createV3StageTrialSource() });
    const decline = await prepare("declined-v3");
    assert.equal(await discardCharacterAuthoringAttempt(decline.attemptId, "vt101-owner"), true);
    await assert.rejects(activateCharacterAuthoringAttempt({ attemptId: decline.attemptId, ownerUserId: "vt101-owner", candidateDigest: decline.candidateDigest! }));
    assert.equal(await getCurrentAssetGeneration("character", decline.characterId), null);
    const retry = await prepareV3TrialCharacter({ characterId: decline.characterId,
      ownerUserId: "vt101-owner", envelope, source: createV3StageTrialSource(), requestKey: "retry-1" });
    assert.notEqual(retry.attemptId, decline.attemptId);
    assert.equal(retry.status, "awaiting_owner_acceptance");
    const drift = await prepare("drift-v3");
    await assert.rejects(activateCharacterAuthoringAttempt({ attemptId: drift.attemptId, ownerUserId: "other", candidateDigest: drift.candidateDigest! }), /NOT_FOUND/);
    const changed = structuredClone(drift.candidate);
    assert.ok(changed);
    changed.definition.identity.tags.push("追加タグ");
    await saveCharacterAuthoringCandidate({ attemptId: drift.attemptId, ownerUserId: "vt101-owner", envelope: changed, assistantMessage: "changed" });
    await assert.rejects(activateCharacterAuthoringAttempt({ attemptId: drift.attemptId, ownerUserId: "vt101-owner", candidateDigest: drift.candidateDigest! }), /REVIEW_DIGEST_MISMATCH/);
    assert.equal(await getCurrentAssetGeneration("character", drift.characterId), null);
    const conflict = await prepare("conflict-v3");
    // A changed expected pointer simulates a stale confirmation; the entire append must roll back.
    await query(`UPDATE character_authoring_attempts SET expected_generation_id = 'stale-generation' WHERE attempt_id = $1`, [conflict.attemptId]);
    await assert.rejects(activateCharacterAuthoringAttempt({ attemptId: conflict.attemptId, ownerUserId: "vt101-owner", candidateDigest: conflict.candidateDigest! }), /ASSET_CURRENT_GENERATION_DRIFT/);
    assert.equal(await getCurrentAssetGeneration("character", conflict.characterId), null);
    const rows = await query<{ count: number }>(`SELECT COUNT(*) AS count FROM asset_generations WHERE asset_id = $1`, [conflict.characterId]);
    assert.equal(Number(rows.rows[0]?.count), 0);
    const characters = await query(`SELECT id FROM characters WHERE id = $1`, [conflict.characterId]);
    assert.equal(characters.rowCount, 0);
  });
  it("rejects broken receipts and expired confirmation before any generation becomes current", async () => {
    const envelope = createV3StageTrialCandidate();
    const invalid = structuredClone(envelope);
    invalid.publicPresentation.projectionDigest = "0".repeat(64);
    await assert.rejects(prepareV3TrialCharacter({ characterId: "invalid-receipt-v3", ownerUserId: "vt101-owner", envelope: invalid, source: createV3StageTrialSource() }), /PROFILE_PROJECTION_DIGEST_MISMATCH/);
    assert.equal((await query(`SELECT attempt_id FROM character_authoring_attempts WHERE character_id = $1`, ["invalid-receipt-v3"])).rowCount, 0);
    const expired = await prepareV3TrialCharacter({ characterId: "expired-v3", ownerUserId: "vt101-owner", envelope, source: createV3StageTrialSource() });
    await query(`UPDATE character_authoring_attempts SET expires_at = '2000-01-01T00:00:00.000Z' WHERE attempt_id = $1`, [expired.attemptId]);
    await assert.rejects(activateCharacterAuthoringAttempt({ attemptId: expired.attemptId, ownerUserId: "vt101-owner", candidateDigest: expired.candidateDigest! }), /EXPIRED/);
    assert.equal(await getCurrentAssetGeneration("character", expired.characterId), null);
    const state = await query<{ status: string }>(`SELECT status FROM character_authoring_attempts WHERE attempt_id = $1`, [expired.attemptId]);
    assert.equal(state.rows[0]?.status, "expired");
  });
});
