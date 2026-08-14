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

  it("excludes unsupported characters from every selector route", async () => {
    const ownedResponse = await app.request(
      "/api/characters?selectable=true&limit=20",
      { headers: authHeaders },
    );
    assert.equal(ownedResponse.status, 200);
    const owned = await ownedResponse.json() as {
      characters: Array<{ id: string; selectable: boolean }>;
    };
    assert.deepEqual(
      owned.characters.map((character) => character.id),
      ["route-ready-mine"],
    );
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
    assert.equal(
      ((await randomResponse.json()) as { opponent: { id: string } }).opponent.id,
      "route-ready-opponent",
    );

    const autoResponse = await app.request("/api/match/auto", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ myCharacterId: "route-ready-mine" }),
    });
    assert.equal(autoResponse.status, 200);
    assert.equal(
      ((await autoResponse.json()) as { opponent: { id: string } }).opponent.id,
      "route-ready-opponent",
    );
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
});
