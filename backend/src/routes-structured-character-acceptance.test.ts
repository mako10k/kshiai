import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  defaultParameters,
  type CharacterSheet,
} from "@kshiai/shared";
import type {
  GenerateCharacterDefinitionV2Input,
  GenerateCharacterInput,
  GenerateCharacterProfileInput,
} from "./llm/types.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-character-routes-v2-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "routes.db");
process.env.LLM_PROVIDER = "mock";

const { closeDatabase, query } = await import("./db.js");
const { MockLlmProvider } = await import("./llm/mock.js");
const characterRepo = await import("./repositories/characters.js");
const characterAssetRepo = await import("./repositories/character-assets-v2.js");
const { buildRoutes } = await import("./routes.js");

class PartialFailureProvider extends MockLlmProvider {
  override async generateCharacterProfile(
    _input: GenerateCharacterProfileInput,
  ): Promise<never> {
    throw new Error("PROVIDER_PROFILE_PARTIAL_FAILURE");
  }
}

class InitialFailureProvider extends MockLlmProvider {
  override async generateCharacter(
    _input: GenerateCharacterInput,
  ): Promise<never> {
    throw new Error("PROVIDER_INITIAL_FAILURE");
  }
}

const app = buildRoutes({ llm: new PartialFailureProvider() });
const initialFailureApp = buildRoutes({ llm: new InitialFailureProvider() });
let generatedPortraitCalls = 0;
const generatedPortraitUrl =
  "/api/media/characters/route-ready-mine.generated.jpg";
const successApp = buildRoutes({
  llm: new MockLlmProvider(),
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
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: `${input.displayName}の公開プロフィール。`,
    visibility: "public",
  };
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
  await characterRepo.saveSheet(sheet({
    id: "route-ready-mine",
    ownerUserId: "route-owner",
    displayName: "準備済み自キャラ",
  }));
  await characterRepo.saveSheet(sheet({
    id: "route-ready-opponent",
    ownerUserId: "route-opponent",
    displayName: "準備済み相手",
  }));
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
        key: "route-initial-failure-001",
        message: "PROVIDER_INITIAL_FAILURE",
      },
      {
        routeApp: app,
        key: "route-partial-failure-001",
        message: "PROVIDER_PROFILE_PARTIAL_FAILURE",
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
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), {
        error: "character_authoring_failed",
        message: testCase.message,
      });

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
  });

  it("uses only V2 attempts for create review confirm and discard routes", async () => {
    const generated = await successApp.request("/api/characters/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "route-v2-create-001",
      },
      body: JSON.stringify({ prompt: "V2経路だけで確定する航海士" }),
    });
    assert.equal(generated.status, 200);
    const generatedBody = await generated.json() as {
      draft: { id: string; character: { id: string } };
    };
    const attemptId = generatedBody.draft.id;

    const latest = await successApp.request("/api/character-drafts/latest", {
      headers: authHeaders,
    });
    assert.equal(latest.status, 200);
    assert.equal(
      ((await latest.json()) as { draft: { id: string } }).draft.id,
      attemptId,
    );

    const adjusted = await successApp.request(
      `/api/character-drafts/${attemptId}/chat`,
      {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ message: "判断をより慎重にしてください" }),
      },
    );
    assert.equal(adjusted.status, 200);
    assert.equal(
      ((await adjusted.json()) as { draft: { id: string } }).draft.id,
      attemptId,
    );

    const confirmed = await successApp.request(
      `/api/characters/${attemptId}/confirm`,
      { method: "POST", headers: authHeaders },
    );
    assert.equal(confirmed.status, 200);
    const confirmedBody = await confirmed.json() as {
      character: { id: string; compatibility: { status: string } };
    };
    assert.equal(confirmedBody.character.id, generatedBody.draft.character.id);
    assert.equal(confirmedBody.character.compatibility.status, "ready");
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
      body: JSON.stringify({ prompt: "破棄するV2候補" }),
    });
    assert.equal(discardCandidate.status, 200);
    const discardAttemptId = ((await discardCandidate.json()) as {
      draft: { id: string };
    }).draft.id;
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
    assert.deepEqual(await latest.json(), { draft: null, progress: null });

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
      (JSON.parse(retained.rows[0]?.sheet_json ?? "{}") as CharacterSheet)
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
        ((await response.json()) as { error: string }).error,
        "character_upgrade_required",
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

  it("commits image toggle and restore routes only as immutable V2 generations", async () => {
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
    assert.equal(restored.status, 200);
    const afterRestore = await characterAssetRepo.getReadyCharacterGeneration(
      "route-ready-mine",
    );
    assert.equal(afterRestore?.generation, (afterToggle?.generation ?? 0) + 1);
    assert.equal(
      (await characterRepo.getSheet("route-ready-mine"))?.appearance.imageUrl,
      generatedPortraitUrl,
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
    assert.equal(replayedRestore.status, 200);
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
    const owned = await ownedResponse.json() as {
      characters: Array<{ id: string; selectable: boolean }>;
    };
    const ownedIds = new Set(owned.characters.map((character) => character.id));
    assert.equal(ownedIds.has("route-ready-mine"), true);
    assert.equal(ownedIds.has("route-legacy-mine"), false);
    assert.ok(owned.characters.every((character) => character.selectable));

    const candidateResponse = await app.request(
      "/api/match/candidates?limit=20",
      { headers: authHeaders },
    );
    assert.equal(candidateResponse.status, 200);
    const candidates = await candidateResponse.json() as {
      candidates: Array<{ id: string }>;
    };
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
      ((await randomResponse.json()) as { opponent: { id: string } }).opponent.id;
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
      ((await autoResponse.json()) as { opponent: { id: string } }).opponent.id;
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
        error: "my_character_upgrade_required",
      },
      {
        key: "route-battle-legacy-opponent-001",
        myCharacterId: "route-ready-mine",
        opponentCharacterId: "route-legacy-opponent",
        error: "opponent_character_upgrade_required",
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
        const body = await response.json() as { error: string };
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
    const managementBefore = await successApp.request(
      "/api/characters?limit=20",
      { headers: authHeaders },
    );
    const beforeCharacters = ((await managementBefore.json()) as {
      characters: Array<{
        id: string;
        selectable: boolean;
        upgradeAction: { targetSchemaVersion: number } | null;
      }>;
    }).characters;
    const legacyBefore = beforeCharacters.find(
      (character) => character.id === "route-legacy-mine",
    );
    assert.equal(legacyBefore?.selectable, false);
    assert.equal(legacyBefore?.upgradeAction?.targetSchemaVersion, 2);

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
    assert.equal(upgrade.status, 200);
    const attemptId = ((await upgrade.json()) as { draft: { id: string } }).draft.id;
    assert.equal(
      (await characterAssetRepo.getCharacterCompatibility("route-legacy-mine"))
        .status,
      "upgrading",
    );
    assert.equal(
      await characterAssetRepo.getReadyCharacterGeneration("route-legacy-mine"),
      null,
    );

    const confirmed = await successApp.request(
      `/api/characters/${attemptId}/confirm`,
      { method: "POST", headers: authHeaders },
    );
    assert.equal(confirmed.status, 200);
    const confirmedCharacter = (await confirmed.json()) as {
      character: {
        id: string;
        selectable: boolean;
        compatibility: { status: string };
      };
    };
    assert.equal(confirmedCharacter.character.id, "route-legacy-mine");
    assert.equal(confirmedCharacter.character.selectable, true);
    assert.equal(confirmedCharacter.character.compatibility.status, "ready");
    assert.equal(
      (await characterAssetRepo.getReadyCharacterGeneration("route-legacy-mine"))
        ?.generation,
      1,
    );

    const selectableAfter = await successApp.request(
      "/api/characters?selectable=true&limit=20",
      { headers: authHeaders },
    );
    const selectableIds = new Set(
      ((await selectableAfter.json()) as {
        characters: Array<{ id: string }>;
      }).characters.map((character) => character.id),
    );
    assert.equal(selectableIds.has("route-legacy-mine"), true);
  });

  it("exposes in-flight authoring progress while an upgrade is running", async () => {
    class SlowStructureProvider extends MockLlmProvider {
      override async generateCharacterDefinitionV2(
        input: GenerateCharacterDefinitionV2Input,
      ) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return super.generateCharacterDefinitionV2(input);
      }
    }

    await insertLegacyCharacter(sheet({
      id: "route-legacy-progress",
      ownerUserId: "route-owner",
      displayName: "進捗確認キャラ",
    }));
    const progressApp = buildRoutes({ llm: new SlowStructureProvider() });
    const upgrade = progressApp.request(
      "/api/characters/route-legacy-progress/upgrade",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "route-v2-progress-001",
        },
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    const mid = await progressApp.request(
      "/api/characters/route-legacy-progress",
      { headers: authHeaders },
    );
    assert.equal(mid.status, 200);
    const midBody = await mid.json() as {
      character: {
        authoringProgress: {
          status: string;
          label: string;
          step: number;
          stepCount: number;
        } | null;
      };
    };
    assert.ok(midBody.character.authoringProgress);
    assert.equal(
      midBody.character.authoringProgress?.status,
      "generating_structure",
    );
    assert.match(
      midBody.character.authoringProgress?.label ?? "",
      /構造/,
    );
    assert.equal(midBody.character.authoringProgress?.stepCount, 5);
    const finished = await upgrade;
    assert.equal(finished.status, 200);
  });
});
