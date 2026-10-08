import assert from "node:assert/strict";
import { z } from "zod";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  CharacterGenerationEnvelopeV2Schema,
  CharacterPublicSchema,
  CharacterAuthoringReviewSchema,
  OwnerNotificationPublicSchema,
  CharacterSheetSchema,
  defaultParameters,
  defaultBasicAttack,
  requireCombatReadyCharacterSheet,
  type CharacterSheet,
} from "@kshiai/shared";

const directory = mkdtempSync(join(tmpdir(), "kshiai-character-routes-v2-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "routes.db");
process.env.LLM_PROVIDER = "mock";

const { saveHistoricalCharacterFixture, activateHistoricalCharacterFixtureV2 } = await import("./testing/historical-character-fixtures.js");
const { closeDatabase, query } = await import("./db.js");
const { buildV3CharacterEnvelopeFixture } = await import("./testing/v3-character-envelope-fixture.js");
const generations = await import("./testing/historical-asset-generations.js");
const ErrorResponseSchema = z.object({ error: z.string() }).passthrough();
const PublicCharacterWireSchema = CharacterPublicSchema.passthrough();
const { MockLlmProvider } = await import("./llm/mock.js");
const { createOfflineFocusedAuthoringProvider } = await import("./testing/offline-focused-authoring-provider.js");
const characterRepo = await import("./repositories/characters.js");
const { buildImportedCharacterEnvelopeV2 } = await import("./services/character-authoring-service.js");
const CharactersResponseSchema = z.object({ characters: z.array(PublicCharacterWireSchema) });
const AcceptedResponseSchema = z.object({ attemptId: z.string(), characterId: z.string() }).passthrough();
const NotificationsResponseSchema = z.object({ unreadCount: z.number().int().nonnegative(),
  notifications: z.array(OwnerNotificationPublicSchema.passthrough()) });
const characterAssetRepo = await import("./repositories/character-assets-v2.js");
const { drainCharacterAuthoringJobs } = await import("./services/character-authoring-jobs.js");
const { buildRoutes } = await import("./routes.js");

const partialFailureLlm = createOfflineFocusedAuthoringProvider({ failAt: "after_skeleton" });
const initialFailureLlm = createOfflineFocusedAuthoringProvider({ failAt: "first" });
const successLlm = createOfflineFocusedAuthoringProvider();
const app = buildRoutes({ llm: partialFailureLlm });
const initialFailureApp = buildRoutes({ llm: initialFailureLlm });
let generatedPortraitCalls = 0;
const generatedPortraitUrl =
  "/api/media/characters/route-ready-mine.generated.jpg";
const successApp = buildRoutes({
  llm: successLlm,
  enableCharacterMigrationAcceptanceTrial: true,
  generateCharacterPortrait: async (character) => {
    generatedPortraitCalls += 1;
    return {
      url: generatedPortraitUrl,
      previousUrl: character.appearance.imageUrl ?? null,
      note: "fixture portrait generated",
      ok: true,
    };
  },
});
const sessionToken = "ses_structured_character_route_acceptance";
const authHeaders = {
  Cookie: `kshiai_session=${sessionToken}`,
};

async function drainAuthoring(llm: InstanceType<typeof MockLlmProvider>): Promise<void> {
  await drainCharacterAuthoringJobs({ llm, workerId: "route-test-worker" });
}

function sheet(input: {
  id: string;
  ownerUserId: string;
  displayName: string;
}): CharacterSheet {
  const now = "2026-08-14T00:00:00.000Z";
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    displayName: input.displayName,
    tags: [],
    createdAt: now,
    updatedAt: now,
    appearance: {
      summary: `${input.displayName}の外見`,
      visualPrompt: `${input.displayName} portrait`,
      imageUrl: `/api/media/characters/${input.id}.initial.jpg`,
    },
    traits: ["慎重"],
    parameters: defaultParameters(),
    basicAttack: defaultBasicAttack(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: `${input.displayName}の公開プロフィール。`,
    visibility: "public",
  };
}

function migrationSourceSheet(character: CharacterSheet): CharacterSheet {
  const source = requireCombatReadyCharacterSheet(character);
  return { ...source, basicAttack: { ...source.basicAttack,
    name: "構え", description: "身構え、間合いを見て相手に働きかける" } };
}

async function insertLegacyCharacter(character: CharacterSheet): Promise<void> {
  await query(
    `INSERT INTO characters (id, owner_user_id, sheet_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      character.id,
      character.ownerUserId,
      JSON.stringify(character),
      character.createdAt,
      character.updatedAt,
    ],
  );
}

before(async () => {
  const now = "2026-08-14T00:00:00.000Z";
  const expiresAt = "2099-08-15T00:00:00.000Z";
  await query(
    `INSERT INTO users (id, username, password_hash, created_at)
     VALUES ($1, $2, 'x', $3), ($4, $5, 'x', $3)`,
    ["route-owner", "route-owner", now, "route-opponent", "route-opponent"],
  );
  await query(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionToken, "route-owner", now, expiresAt],
  );
  await saveHistoricalCharacterFixture(sheet({
    id: "route-ready-mine",
    ownerUserId: "route-owner",
    displayName: "準備済み自キャラ",
  }));
  await saveHistoricalCharacterFixture(sheet({
    id: "route-ready-opponent",
    ownerUserId: "route-opponent",
    displayName: "準備済み相手",
  }));
  for (const id of ["route-ready-mine", "route-ready-opponent"]) {
    const current = await characterRepo.getSheet(id);
    assert.ok(current);
    const generation = await generations.createAssetGeneration({ assetType: "character", assetId: id,
      schemaVersion: 3, content: buildV3CharacterEnvelopeFixture(current) });
    await query("UPDATE character_asset_states SET current_generation_id = $2 WHERE character_id = $1",
      [id, generation.generationId]);
  }
  await insertLegacyCharacter(sheet({
    id: "route-legacy-mine",
    ownerUserId: "route-owner",
    displayName: "未更新自キャラ",
  }));
  await insertLegacyCharacter(sheet({
    id: "route-legacy-opponent",
    ownerUserId: "route-opponent",
    displayName: "未更新相手",
  }));
  const legacyDraft = sheet({
    id: "route-legacy-draft-character",
    ownerUserId: "route-owner",
    displayName: "旧下書き",
  });
  await query(
    `INSERT INTO character_drafts
      (id, owner_user_id, sheet_json, assistant_message, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)`,
    [
      "route-legacy-draft",
      "route-owner",
      JSON.stringify(legacyDraft),
      "旧下書きの応答",
      now,
    ],
  );
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("structured character route acceptance", () => {
  it("records provider failures without exposing a partial character", async () => {
    const cases = [
      {
        routeApp: initialFailureApp,
        llm: initialFailureLlm,
        key: "route-initial-failure-001",
        message: "technical_failure",
        expectedCalls: 1,
      },
      {
        routeApp: app,
        llm: partialFailureLlm,
        key: "route-partial-failure-001",
        message: "technical_failure",
        expectedCalls: 2,
      },
    ];
    for (const testCase of cases) {
      const response = await testCase.routeApp.request("/api/characters/generate", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "Idempotency-Key": testCase.key,
        },
        body: JSON.stringify({ prompt: "部分失敗を検証する旅人" }),
      });
      assert.equal(response.status, 202);
      const accepted = z.object({ attemptId: z.string() }).parse(await response.json());
      assert.ok(accepted.attemptId);
      await drainAuthoring(testCase.llm);

      const attempt = await query<{
        character_id: string;
        status: string;
        candidate_json: unknown | null;
        error_code: string | null;
      }>(
        `SELECT character_id, status, candidate_json, error_code
           FROM character_authoring_attempts
          WHERE owner_user_id = $1 AND idempotency_key = $2`,
        ["route-owner", `character-create:${testCase.key}`],
      );
      assert.equal(attempt.rows[0]?.status, "failed");
      assert.equal(attempt.rows[0]?.candidate_json, null);
      assert.equal(attempt.rows[0]?.error_code, testCase.message);
      assert.equal(testCase.llm.focusedFixtureCalls(), testCase.expectedCalls);
      const characterId = attempt.rows[0]?.character_id;
      assert.ok(characterId);
      const partialRows = await query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM asset_generations
          WHERE asset_type = 'character' AND asset_id = $1`,
        [characterId],
      );
      assert.equal(Number(partialRows.rows[0]?.count), 0);
      assert.equal(await characterRepo.getSheet(characterId), null);
    }
    const latest = await app.request("/api/character-drafts/latest", {
      headers: authHeaders,
    });
    assert.equal(latest.status, 200);
    const latestBody = z.object({ draft: z.unknown(),
      failed: z.object({ errorCode: z.string().nullable() }).nullable() })
      .parse(await latest.json());
    assert.equal(latestBody.draft, null);
    assert.equal(latestBody.failed?.errorCode, "technical_failure");
  });

  it("uses current V3 attempts for create review confirm and discard routes", async () => {
    const generated = await successApp.request("/api/characters/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "route-v2-create-001",
      },
      body: JSON.stringify({ prompt: "現行V3経路で確定する航海士" }),
    });
    assert.equal(generated.status, 202);
    await drainAuthoring(successLlm);
    const generatedBody = AcceptedResponseSchema.parse(await generated.json());
    const attemptId = generatedBody.attemptId;

    const latest = await successApp.request("/api/character-drafts/latest", {
      headers: authHeaders,
    });
    assert.equal(latest.status, 200);
    assert.equal(
      z.object({ reviewAttemptId: z.string() }).parse(await latest.json()).reviewAttemptId,
      attemptId,
    );

    const beforeChatResponse = await successApp.request(`/api/character-drafts/${attemptId}`, { headers: authHeaders });
    const beforeChat = CharacterAuthoringReviewSchema.parse(await beforeChatResponse.json());
    assert.ok(beforeChat.candidateDigest);
    const predecessorBefore = await characterAssetRepo.getCharacterAuthoringAttempt(attemptId, "route-owner");
    const callsBeforeCorrection = successLlm.focusedFixtureCalls();

    const adjusted = await successApp.request(
      `/api/character-drafts/${attemptId}/chat`,
      {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json", "Idempotency-Key": "route-correction-001" },
        body: JSON.stringify({ message: "判断をより慎重にしてください", candidateDigest: beforeChat.candidateDigest }),
      },
    );
    assert.equal(adjusted.status, 202);
    const successor = AcceptedResponseSchema.extend({ predecessorAttemptId: z.string() }).parse(await adjusted.json());
    assert.notEqual(successor.attemptId, attemptId);
    assert.equal(successor.predecessorAttemptId, attemptId);
    assert.equal(successor.characterId, generatedBody.characterId);
    await drainAuthoring(successLlm);
    const afterChat = await successApp.request(`/api/character-drafts/${successor.attemptId}`, {
      headers: authHeaders,
    });
    const afterChatBody = CharacterAuthoringReviewSchema.parse(await afterChat.json());
    assert.equal(afterChatBody.attemptId, successor.attemptId);
    assert.equal(afterChatBody.canEditCandidate, true);
    assert.equal(afterChatBody.canAccept, true,
      `review=${JSON.stringify(afterChatBody.failed)}, work=${JSON.stringify(successLlm.focusedFixtureWork())}, bounds=${JSON.stringify(successLlm.focusedFixtureBounds())}`);
    assert.notEqual(afterChatBody.candidateDigest, beforeChat.candidateDigest);
    assert.deepEqual(await characterAssetRepo.getCharacterAuthoringAttempt(attemptId, "route-owner"), predecessorBefore);
    const callsAfterCorrection = successLlm.focusedFixtureCalls();
    assert.ok(callsAfterCorrection - callsBeforeCorrection <= 10, "scope and dependent work share the successor call cap");
    assert.ok(successLlm.focusedFixtureBounds().every((bound) => bound.inputTokens <= 6000 && bound.inputBytes <= 24576));
    console.info("CORRECTION_DIAGNOSTIC", JSON.stringify({
      physicalCalls: callsAfterCorrection - callsBeforeCorrection,
      preparedBounds: successLlm.focusedFixtureBounds().slice(callsBeforeCorrection),
    }));
    const replay = await successApp.request(`/api/character-drafts/${attemptId}/chat`, {
      method: "POST", headers: { ...authHeaders, "Content-Type": "application/json", "Idempotency-Key": "route-correction-001" },
      body: JSON.stringify({ message: "判断をより慎重にしてください", candidateDigest: beforeChat.candidateDigest }),
    });
    assert.equal(replay.status, 202);
    assert.equal(AcceptedResponseSchema.parse(await replay.json()).attemptId, successor.attemptId);
    const conflict = await successApp.request(`/api/character-drafts/${attemptId}/chat`, {
      method: "POST", headers: { ...authHeaders, "Content-Type": "application/json", "Idempotency-Key": "route-correction-001" },
      body: JSON.stringify({ message: "外套を青に変更", candidateDigest: beforeChat.candidateDigest }),
    });
    assert.equal(conflict.status, 409);
    assert.equal(ErrorResponseSchema.parse(await conflict.json()).error, "AUTHORING_IDEMPOTENCY_CONFLICT");
    const missingKey = await successApp.request(`/api/character-drafts/${attemptId}/chat`, {
      method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "判断をより慎重にしてください", candidateDigest: beforeChat.candidateDigest }),
    });
    assert.equal(missingKey.status, 400);
    const staleConfirmation = await successApp.request(`/api/characters/${attemptId}/confirm`, {
      method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ candidateDigest: beforeChat.candidateDigest }),
    });
    assert.equal(staleConfirmation.status, 409);
    const wrongDigest = await successApp.request(`/api/characters/${successor.attemptId}/confirm`, {
      method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ candidateDigest: beforeChat.candidateDigest }),
    });
    assert.equal(wrongDigest.status, 409);
    assert.equal(successLlm.focusedFixtureCalls(), callsAfterCorrection, "replay, rejection and reads cannot generate");

    const confirmed = await successApp.request(
      `/api/characters/${successor.attemptId}/confirm`,
      { method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ candidateDigest: afterChatBody.candidateDigest }) },
    );
    assert.equal(confirmed.status, 200);
    const confirmedBody = z.object({ character: PublicCharacterWireSchema }).parse(await confirmed.json());
    assert.equal(confirmedBody.character.id, generatedBody.characterId);
    assert.equal(confirmedBody.character.compatibility?.status, "ready");
    assert.equal(
      (await characterAssetRepo.getReadyCharacterGeneration(
        confirmedBody.character.id,
      ))?.generation,
      1,
    );

    const discardCandidate = await successApp.request("/api/characters/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "route-v2-discard-001",
      },
      body: JSON.stringify({ prompt: "破棄する現行V3候補" }),
    });
    assert.equal(discardCandidate.status, 202);
    await drainAuthoring(successLlm);
    const discardAttemptId = AcceptedResponseSchema.parse(await discardCandidate.json()).attemptId;
    const discarded = await successApp.request(
      `/api/character-drafts/${discardAttemptId}`,
      { method: "DELETE", headers: authHeaders },
    );
    assert.equal(discarded.status, 200);
    assert.equal(
      (await characterAssetRepo.getCharacterAuthoringAttempt(
        discardAttemptId,
        "route-owner",
      ))?.status,
      "discarded",
    );
  });

  it("does not read mutate confirm or delete legacy draft rows", async () => {
    const latest = await successApp.request("/api/character-drafts/latest", {
      headers: authHeaders,
    });
    const latestCurrent = z.object({ draft: z.unknown(), progress: z.unknown(), failed: z.unknown(),
      reviewAttemptId: z.string().optional() }).parse(await latest.json());
    assert.equal(latestCurrent.draft, null);
    assert.equal(latestCurrent.progress, null);
    assert.equal(latestCurrent.failed, null);
    assert.notEqual(latestCurrent.reviewAttemptId, "route-legacy-draft");

    const chat = await successApp.request(
      "/api/character-drafts/route-legacy-draft/chat",
      {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ message: "旧経路を変更する" }),
      },
    );
    assert.equal(chat.status, 404);
    const confirm = await successApp.request(
      "/api/characters/route-legacy-draft/confirm",
      { method: "POST", headers: authHeaders },
    );
    assert.equal(confirm.status, 404);
    const discard = await successApp.request(
      "/api/character-drafts/route-legacy-draft",
      { method: "DELETE", headers: authHeaders },
    );
    assert.equal(discard.status, 404);
    const retained = await query<{
      sheet_json: string;
      assistant_message: string;
      updated_at: string;
    }>(
      `SELECT sheet_json, assistant_message, updated_at
         FROM character_drafts
        WHERE id = $1`,
      ["route-legacy-draft"],
    );
    assert.equal(retained.rows.length, 1);
    assert.equal(
      CharacterSheetSchema.parse(JSON.parse(retained.rows[0]?.sheet_json ?? "{}"))
        .displayName,
      "旧下書き",
    );
    assert.equal(retained.rows[0]?.assistant_message, "旧下書きの応答");
    assert.equal(retained.rows[0]?.updated_at, "2026-08-14T00:00:00.000Z");
  });

  it("rejects legacy restore and portrait mutations before side effects", async () => {
    const beforeSheet = await query<{ sheet_json: string }>(
      "SELECT sheet_json FROM characters WHERE id = $1",
      ["route-legacy-mine"],
    );
    const portraitCallsBefore = generatedPortraitCalls;
    const requests = [
      successApp.request("/api/characters/route-legacy-mine/restore-revision", {
        method: "POST",
        headers: authHeaders,
      }),
      successApp.request("/api/characters/route-legacy-mine/image/toggle", {
        method: "POST",
        headers: authHeaders,
      }),
      successApp.request("/api/characters/route-legacy-mine/image", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ extra: "変更しない" }),
      }),
    ];
    for (const response of await Promise.all(requests)) {
      assert.equal(response.status, 409);
      assert.equal(
        ErrorResponseSchema.parse(await response.json()).error,
        "character_v3_update_required",
      );
    }
    assert.equal(generatedPortraitCalls, portraitCallsBefore);
    const afterSheet = await query<{ sheet_json: string }>(
      "SELECT sheet_json FROM characters WHERE id = $1",
      ["route-legacy-mine"],
    );
    assert.deepEqual(afterSheet.rows[0]?.sheet_json, beforeSheet.rows[0]?.sheet_json);
    const generations = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM asset_generations
        WHERE asset_type = 'character' AND asset_id = $1`,
      ["route-legacy-mine"],
    );
    assert.equal(Number(generations.rows[0]?.count), 0);
  });

  it("commits immutable V3 portrait generations and rejects unavailable restore", async () => {
    const initial = await characterAssetRepo.getReadyCharacterGeneration(
      "route-ready-mine",
    );
    assert.ok(initial);
    const imageHeaders = {
      ...authHeaders,
      "Content-Type": "application/json",
      "Idempotency-Key": "route-v2-image-001",
    };
    const generated = await successApp.request(
      "/api/characters/route-ready-mine/image",
      {
        method: "POST",
        headers: imageHeaders,
        body: JSON.stringify({ extra: "青い光" }),
      },
    );
    assert.equal(generated.status, 200);
    assert.equal(generatedPortraitCalls, 1);
    const afterImage = await characterAssetRepo.getReadyCharacterGeneration(
      "route-ready-mine",
    );
    assert.equal(afterImage?.generation, initial.generation + 1);
    assert.equal(
      (await characterRepo.getSheet("route-ready-mine"))?.appearance.imageUrl,
      generatedPortraitUrl,
    );
    const replayedImage = await successApp.request(
      "/api/characters/route-ready-mine/image",
      {
        method: "POST",
        headers: imageHeaders,
        body: JSON.stringify({ extra: "青い光" }),
      },
    );
    assert.equal(replayedImage.status, 200);
    assert.equal(generatedPortraitCalls, 1);

    const toggled = await successApp.request(
      "/api/characters/route-ready-mine/image/toggle",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "route-v2-toggle-001",
        },
      },
    );
    assert.equal(toggled.status, 200);
    const afterToggle = await characterAssetRepo.getReadyCharacterGeneration(
      "route-ready-mine",
    );
    assert.equal(afterToggle?.generation, (afterImage?.generation ?? 0) + 1);
    assert.equal(
      (await characterRepo.getSheet("route-ready-mine"))?.appearance.imageUrl,
      "/api/media/characters/route-ready-mine.initial.jpg",
    );
    const replayedToggle = await successApp.request(
      "/api/characters/route-ready-mine/image/toggle",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "route-v2-toggle-001",
        },
      },
    );
    assert.equal(replayedToggle.status, 200);
    assert.equal(
      (await characterAssetRepo.getReadyCharacterGeneration("route-ready-mine"))
        ?.generation,
      afterToggle?.generation,
    );

    const restored = await successApp.request(
      "/api/characters/route-ready-mine/restore-revision",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "route-v2-restore-001",
        },
      },
    );
    assert.equal(restored.status, 409);
    assert.equal(ErrorResponseSchema.parse(await restored.json()).error, "character_update_unavailable");
    const afterRestore = await characterAssetRepo.getReadyCharacterGeneration(
      "route-ready-mine",
    );
    assert.equal(afterRestore?.generationId, afterToggle?.generationId);
    assert.deepEqual(afterRestore?.content, afterToggle?.content);
    assert.equal(
      (await characterRepo.getSheet("route-ready-mine"))?.appearance.imageUrl,
      "/api/media/characters/route-ready-mine.initial.jpg",
    );
    const replayedRestore = await successApp.request(
      "/api/characters/route-ready-mine/restore-revision",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "route-v2-restore-001",
        },
      },
    );
    assert.equal(replayedRestore.status, 409);
    assert.equal(ErrorResponseSchema.parse(await replayedRestore.json()).error, "character_update_unavailable");
    assert.equal(
      (await characterAssetRepo.getReadyCharacterGeneration("route-ready-mine"))
        ?.generation,
      afterRestore?.generation,
    );
  });

  it("excludes unsupported characters from every selector route", async () => {
    const ownedResponse = await app.request(
      "/api/characters?selectable=true&limit=20",
      { headers: authHeaders },
    );
    assert.equal(ownedResponse.status, 200);
    const owned = z.object({ characters: z.array(PublicCharacterWireSchema) })
      .parse(await ownedResponse.json());
    const ownedIds = new Set(owned.characters.map((character) => character.id));
    assert.equal(ownedIds.has("route-ready-mine"), true);
    assert.equal(ownedIds.has("route-legacy-mine"), false);
    assert.ok(owned.characters.every((character) => character.selectable));

    const candidateResponse = await app.request(
      "/api/match/candidates?limit=20",
      { headers: authHeaders },
    );
    assert.equal(candidateResponse.status, 200);
    const candidates = z.object({ candidates: z.array(PublicCharacterWireSchema) })
      .parse(await candidateResponse.json());
    const candidateIds = new Set(candidates.candidates.map((candidate) => candidate.id));
    assert.equal(candidateIds.has("route-ready-mine"), true);
    assert.equal(candidateIds.has("route-ready-opponent"), true);
    assert.equal(candidateIds.has("route-legacy-mine"), false);
    assert.equal(candidateIds.has("route-legacy-opponent"), false);

    const randomResponse = await app.request("/api/match/random", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ myCharacterId: "route-ready-mine" }),
    });
    assert.equal(randomResponse.status, 200);
    const randomOpponentId =
      z.object({ opponent: PublicCharacterWireSchema }).parse(await randomResponse.json()).opponent.id;
    assert.equal(candidateIds.has(randomOpponentId), true);
    assert.notEqual(randomOpponentId, "route-ready-mine");
    assert.notEqual(randomOpponentId, "route-legacy-mine");
    assert.notEqual(randomOpponentId, "route-legacy-opponent");

    const autoResponse = await app.request("/api/match/auto", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ myCharacterId: "route-ready-mine" }),
    });
    assert.equal(autoResponse.status, 200);
    const autoOpponentId =
      z.object({ opponent: PublicCharacterWireSchema }).parse(await autoResponse.json()).opponent.id;
    assert.equal(candidateIds.has(autoOpponentId), true);
    assert.notEqual(autoOpponentId, "route-ready-mine");
    assert.notEqual(autoOpponentId, "route-legacy-mine");
    assert.notEqual(autoOpponentId, "route-legacy-opponent");
  });

  it("rejects direct battle creation for either unsupported side", async () => {
    const cases = [
      {
        key: "route-battle-legacy-mine-001",
        myCharacterId: "route-legacy-mine",
        opponentCharacterId: "route-ready-opponent",
        error: "my_character_v3_capability_blocked",
      },
      {
        key: "route-battle-legacy-opponent-001",
        myCharacterId: "route-ready-mine",
        opponentCharacterId: "route-legacy-opponent",
        error: "opponent_character_v3_capability_blocked",
      },
    ];
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      for (const testCase of cases) {
        const response = await app.request("/api/battles", {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json",
            "Idempotency-Key": testCase.key,
          },
          body: JSON.stringify({
            myCharacterId: testCase.myCharacterId,
            opponentCharacterId: testCase.opponentCharacterId,
            battlefieldMode: "random",
          }),
        });
        assert.equal(response.status, 409);
        const body = ErrorResponseSchema.parse(await response.json());
        assert.equal(body.error, testCase.error);
      }
    } finally {
      console.error = originalConsoleError;
    }
    const battles = await query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM battles",
    );
    assert.equal(Number(battles.rows[0]?.count), 0);
  });

  it("upgrades an existing character only after owner confirmation", async () => {
    const sourceSheet = await characterRepo.getSheet("route-legacy-mine");
    assert.ok(sourceSheet);
    const original = await activateHistoricalCharacterFixtureV2({ sheet: migrationSourceSheet(sourceSheet),
      envelope: buildImportedCharacterEnvelopeV2({ sheet: migrationSourceSheet(sourceSheet), attemptId: "historical-migration-source" }) });
    const managementBefore = await successApp.request(
      "/api/characters?limit=20",
      { headers: authHeaders },
    );
    const beforeCharacters = CharactersResponseSchema.parse(await managementBefore.json()).characters;
    const legacyBefore = beforeCharacters.find(
      (character) => character.id === "route-legacy-mine",
    );
    assert.equal(legacyBefore?.selectable, false);
    assert.equal(legacyBefore?.upgradeAction?.targetSchemaVersion, 3);

    const upgrade = await successApp.request(
      "/api/characters/route-legacy-mine/upgrade",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "route-v2-upgrade-001",
        },
      },
    );
    assert.equal(upgrade.status, 202);
    await drainAuthoring(successLlm);
    const attemptId = AcceptedResponseSchema.parse(await upgrade.json()).attemptId;
    assert.equal(
      (await characterAssetRepo.getCharacterCompatibility("route-legacy-mine"))
        .status,
      "upgrading",
    );
    assert.equal(
      await characterAssetRepo.getReadyCharacterGeneration("route-legacy-mine"),
      null,
    );

    assert.deepEqual((await generations.getAssetGeneration(original.generationId))?.content, original.content);
    const migrationReview = await successApp.request(`/api/character-drafts/${attemptId}`, { headers: authHeaders });
    const reviewed = CharacterAuthoringReviewSchema.parse(await migrationReview.json());
    assert.equal(reviewed.canAccept, true, JSON.stringify({ reviewed, work: successLlm.focusedFixtureWork() }));
    assert.equal(reviewed.semanticCandidateReview?.schemaVersion, 3);
    const confirmed = await successApp.request(
      `/api/characters/${attemptId}/confirm`,
      { method: "POST", headers: authHeaders },
    );
    assert.equal(confirmed.status, 200);
    const confirmedCharacter = z.object({ character: PublicCharacterWireSchema }).parse(await confirmed.json());
    assert.equal(confirmedCharacter.character.id, "route-legacy-mine");
    assert.equal(confirmedCharacter.character.selectable, true);
    assert.equal(confirmedCharacter.character.compatibility?.status, "ready");
    assert.equal(
      (await generations.getCurrentAssetGeneration("character", "route-legacy-mine"))
        ?.generation,
      original.generation + 1,
    );

    const selectableAfter = await successApp.request(
      "/api/characters?selectable=true&limit=20",
      { headers: authHeaders },
    );
    const selectableIds = new Set(CharactersResponseSchema.parse(await selectableAfter.json())
      .characters.map((character) => character.id));
    assert.equal(selectableIds.has("route-legacy-mine"), true);
  });

  it("exposes in-flight authoring progress while an upgrade is running", { timeout: 10_000 }, async () => {
    await saveHistoricalCharacterFixture(migrationSourceSheet(sheet({ id: "route-legacy-progress",
      ownerUserId: "route-owner", displayName: "進捗確認キャラ" })));
    let releaseReply: () => void = () => { throw new Error("reply gate not initialized"); };
    const replyGate = new Promise<void>((resolve) => { releaseReply = resolve; });
    let markEntered: () => void = () => { throw new Error("entry gate not initialized"); };
    const entered = new Promise<void>((resolve) => { markEntered = resolve; });
    const slowLlm = createOfflineFocusedAuthoringProvider({ beforeReply: async () => {
      markEntered();
      await replyGate;
    } });
    const progressApp = buildRoutes({ llm: slowLlm });
    let draining: Promise<void> | undefined;
    try {
      const upgrade = await progressApp.request("/api/characters/route-legacy-progress/upgrade", {
        method: "POST", headers: { ...authHeaders, "Idempotency-Key": "route-v3-progress-001" },
      });
      assert.equal(upgrade.status, 202);
      const accepted = AcceptedResponseSchema.parse(await upgrade.json());
      draining = drainAuthoring(slowLlm);
      await entered;
      const mid = await progressApp.request("/api/characters/route-legacy-progress", { headers: authHeaders });
      assert.equal(mid.status, 200);
      const observed = z.object({ character: PublicCharacterWireSchema }).parse(await mid.json());
      assert.equal(observed.character.authoringProgress?.attemptId, accepted.attemptId);
      assert.equal(observed.character.authoringProgress?.status, "generating_structure");
      assert.match(observed.character.authoringProgress?.label ?? "", /構造/);
      assert.equal(observed.character.authoringProgress?.stepCount, 5);
    } finally {
      releaseReply();
      await draining;
    }
  });

  it("does not surface an older awaiting draft after a later attempt fails", async () => {
    const first = await successApp.request("/api/characters/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "route-stale-draft-001",
      },
      body: JSON.stringify({ prompt: "先に残す下書き" }),
    });
    assert.equal(first.status, 202);
    await drainAuthoring(successLlm);
    const firstId = z.object({ attemptId: z.string() }).parse(await first.json()).attemptId;
    const latestBefore = await successApp.request("/api/character-drafts/latest", {
      headers: authHeaders,
    });
    assert.equal(z.object({ reviewAttemptId: z.string() }).parse(await latestBefore.json()).reviewAttemptId,
      firstId);
    const storedReview = await successApp.request(`/api/character-drafts/${firstId}`, { headers: authHeaders });
    assert.equal(storedReview.status, 200);
    const structuredReview = CharacterAuthoringReviewSchema.parse(await storedReview.json());
    assert.equal(structuredReview.status, "awaiting_owner_acceptance");
    assert.equal(structuredReview.semanticCandidateReview?.schemaVersion, 3);

    const failed = await initialFailureApp.request("/api/characters/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "route-stale-draft-fail-001",
      },
      body: JSON.stringify({ prompt: "後から失敗する生成" }),
    });
    assert.equal(failed.status, 202);
    await drainAuthoring(initialFailureLlm);
    const latest = await initialFailureApp.request("/api/character-drafts/latest", {
      headers: authHeaders,
    });
    const latestBody = z.object({ draft: z.unknown(),
      failed: z.object({ errorCode: z.string().nullable() }).nullable() })
      .parse(await latest.json());
    assert.equal(latestBody.draft, null);
    assert.equal(latestBody.failed?.errorCode, "technical_failure");
  });

  it("discards an unclaimed queued attempt before the worker runs", async () => {
    const generated = await successApp.request("/api/characters/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "route-unclaimed-discard-001",
      },
      body: JSON.stringify({ prompt: "受け付け直後に破棄する" }),
    });
    assert.equal(generated.status, 202);
    const attemptId = z.object({ attemptId: z.string() }).parse(await generated.json()).attemptId;
    const discarded = await successApp.request(
      `/api/character-drafts/${attemptId}`,
      { method: "DELETE", headers: authHeaders },
    );
    assert.equal(discarded.status, 200);
    await drainAuthoring(successLlm);
    assert.equal(
      (await characterAssetRepo.getCharacterAuthoringAttempt(
        attemptId,
        "route-owner",
      ))?.status,
      "discarded",
    );
  });

  it("returns a create review without a current character", async () => {
    const generated = await successApp.request("/api/characters/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "route-review-create-001",
      },
      body: JSON.stringify({ prompt: "承認画面用の旅人" }),
    });
    assert.equal(generated.status, 202);
    await drainAuthoring(successLlm);
    const attemptId = z.object({ attemptId: z.string() }).parse(await generated.json()).attemptId;
    const review = await successApp.request(`/api/character-drafts/${attemptId}`, {
      headers: authHeaders,
    });
    assert.equal(review.status, 200);
    const body = CharacterAuthoringReviewSchema.parse(await review.json());
    assert.equal(body.kind, "create");
    assert.equal(body.canAccept, true, JSON.stringify({ body, work: successLlm.focusedFixtureWork() }));
    assert.equal(body.current, null);
    assert.ok(body.candidate?.displayName);
    assert.equal(body.stale, false);
  });

  it("returns a compare review for upgrade and marks an older attempt stale", async () => {
    await saveHistoricalCharacterFixture(migrationSourceSheet(sheet({
      id: "route-legacy-review",
      ownerUserId: "route-owner",
      displayName: "比較用旧キャラ",
    })));
    const upgrade = await successApp.request(
      "/api/characters/route-legacy-review/upgrade",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "route-review-upgrade-001",
        },
      },
    );
    assert.equal(upgrade.status, 202);
    await drainAuthoring(successLlm);
    const attemptId = AcceptedResponseSchema.parse(await upgrade.json()).attemptId;
    const review = await successApp.request(`/api/character-drafts/${attemptId}`, {
      headers: authHeaders,
    });
    assert.equal(review.status, 200);
    const body = CharacterAuthoringReviewSchema.parse(await review.json());
    assert.equal(body.kind, "upgrade");
    assert.equal(body.canAccept, true, JSON.stringify({ body, work: successLlm.focusedFixtureWork() }));
    assert.equal(body.current?.displayName, "比較用旧キャラ");
    assert.equal(body.semanticCandidateReview?.schemaVersion, 3);
    assert.ok(body.semanticCandidateReview?.fields.some((field) => field.key === "identity"));
    const listed = await successApp.request("/api/characters?limit=50", {
      headers: authHeaders,
    });
    const listedBody = CharactersResponseSchema.parse(await listed.json());
    const marked = listedBody.characters.find((item) => item.id === "route-legacy-review");
    assert.equal(marked?.reviewState, "awaiting_acceptance");
    assert.equal(marked?.reviewAttemptId, attemptId);

    const blocked = await successApp.request(
      "/api/characters/route-legacy-review/upgrade",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "route-review-upgrade-blocked",
        },
      },
    );
    assert.equal(blocked.status, 409);
    const discarded = await successApp.request(
      `/api/character-drafts/${attemptId}`,
      { method: "DELETE", headers: authHeaders },
    );
    assert.equal(discarded.status, 200);
    const next = await successApp.request(
      "/api/characters/route-legacy-review/upgrade",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "route-review-upgrade-002",
        },
      },
    );
    assert.equal(next.status, 202);
    await drainAuthoring(successLlm);
    const stale = await successApp.request(`/api/character-drafts/${attemptId}`, {
      headers: authHeaders,
    });
    const staleBody = CharacterAuthoringReviewSchema.parse(await stale.json());
    assert.equal(staleBody.stale, true);
    assert.equal(staleBody.canAccept, false);
  });

  it("lists characters without deserializing a historical candidate", async () => {
    const characterId = "route-historical-candidate";
    const historicalSheet = sheet({ id: characterId, ownerUserId: "route-owner",
      displayName: "過去候補を持つキャラ" });
    await insertLegacyCharacter(historicalSheet);
    const attemptId = "cat_route_historical_candidate";
    const candidate = CharacterGenerationEnvelopeV2Schema.parse(buildImportedCharacterEnvelopeV2({
      sheet: historicalSheet, attemptId,
    }));
    candidate.definition.actionNorms = [{
      id: "historical-selectorless-norm",
      when: {
        match: "all",
        clauses: [{ kind: "always", operator: "is", value: "true" }],
      },
      response: {
        disposition: "prefer",
        actionRefs: [],
        actionKinds: [],
        tacticTags: [],
        statement: "以前は説明文だけでも保存できた行動規範",
        fallbackActionRef: null,
      },
      priority: 50,
      force: "preference",
      selfAwareness: "aware",
      exceptions: [],
      description: null,
    }];
    // Reconstruct a stored pre-retirement candidate. No current authoring command
    // may write this V2 payload or enqueue work for it.
    const timestamp = new Date().toISOString();
    await query(`INSERT INTO character_authoring_attempts
      (attempt_id, owner_user_id, character_id, kind, idempotency_key, request_digest,
       source_text, source_digest, status, candidate_json, candidate_digest,
       created_at, updated_at, expires_at)
      VALUES ($1, $2, $3, 'upgrade', $4, $5, $6, $5, 'awaiting_owner_acceptance', $7, $8, $9, $9, $10)`,
    [attemptId, "route-owner", characterId, "historical-review-fixture", generations.assetContentDigest(historicalSheet.narrativeBlurb),
      historicalSheet.narrativeBlurb, JSON.stringify(candidate), generations.assetContentDigest(candidate),
      timestamp, "2099-08-15T00:00:00.000Z"]);

    const listed = await successApp.request("/api/characters?limit=50", {
      headers: authHeaders,
    });
    assert.equal(listed.status, 200);
    const body = CharactersResponseSchema.parse(await listed.json());
    const character = body.characters.find((item) => item.id === characterId);
    assert.equal(character?.reviewState, "awaiting_acceptance");
    assert.equal(character?.reviewAttemptId, attemptId);
    const historicalAttempt = await characterAssetRepo.getCharacterAuthoringAttempt(
      attemptId,
      "route-owner",
    );
    assert.ok(historicalAttempt?.candidate);
    const review = await successApp.request(`/api/character-drafts/${attemptId}`, {
      headers: authHeaders,
    });
    assert.equal(review.status, 200);
    const reviewBody = CharacterAuthoringReviewSchema.parse(await review.json());
    assert.ok(reviewBody.candidate);
    assert.equal(reviewBody.canAccept, false);
    assert.equal(
      reviewBody.acceptanceError,
      "CHARACTER_ACTION_NORM_SELECTOR_MISSING",
    );
  });

  it("projects ready and failed notifications without duplicating them", async () => {
    const generated = await successApp.request("/api/characters/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "route-notify-ready-001",
      },
      body: JSON.stringify({ prompt: "お知らせ用の成功" }),
    });
    assert.equal(generated.status, 202);
    const accepted = AcceptedResponseSchema.parse(await generated.json());
    await drainAuthoring(successLlm);
    await drainAuthoring(successLlm);
    const inbox = await successApp.request("/api/notifications?limit=20", {
      headers: authHeaders,
    });
    assert.equal(inbox.status, 200);
    const inboxBody = NotificationsResponseSchema.parse(await inbox.json());
    const readyItems = inboxBody.notifications.filter((item) => item.kind === "authoring_ready"
      && item.attemptId === accepted.attemptId);
    assert.equal(readyItems.length, 1);
    const ready = readyItems[0];
    assert.ok(ready);
    assert.equal(ready?.readAt, null);
    assert.ok(inboxBody.unreadCount >= 1);
    const marked = await successApp.request(`/api/notifications/${ready.id}/read`, {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(marked.status, 200);
    const afterRead = await successApp.request("/api/notifications?limit=20", {
      headers: authHeaders,
    });
    const afterBody = NotificationsResponseSchema.parse(await afterRead.json());
    assert.ok(afterBody.notifications.find((item) => item.id === ready.id)?.readAt);

    const failed = await initialFailureApp.request("/api/characters/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "route-notify-fail-001",
      },
      body: JSON.stringify({ prompt: "お知らせ用の失敗" }),
    });
    assert.equal(failed.status, 202);
    const failedAccepted = AcceptedResponseSchema.parse(await failed.json());
    await drainAuthoring(initialFailureLlm);
    await drainAuthoring(initialFailureLlm);
    const failedInbox = await initialFailureApp.request("/api/notifications?limit=20", {
      headers: authHeaders,
    });
    const failedBody = NotificationsResponseSchema.parse(await failedInbox.json());
    assert.equal(failedBody.notifications.filter((item) => item.kind === "authoring_failed"
      && item.attemptId === failedAccepted.attemptId).length, 1);
  });
});
