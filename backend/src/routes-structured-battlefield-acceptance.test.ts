import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  BATTLEFIELD_INSTANCE_COMPILER_V2,
  defaultParameters,
  type BattlefieldImageBriefV2,
  type BattlefieldInstance,
  type BattlefieldPreset,
  type CharacterSheet,
} from "@kshiai/shared";

const directory = mkdtempSync(join(tmpdir(), "kshiai-battlefield-routes-v2-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "routes.db");
process.env.LLM_PROVIDER = "mock";

const { closeDatabase, query } = await import("./db.js");
const { MockLlmProvider } = await import("./llm/mock.js");
const characterRepo = await import("./repositories/characters.js");
const battlefieldRepo = await import("./repositories/battlefields.js");
const battlefieldAssetRepo = await import(
  "./repositories/battlefield-assets-v2.js"
);
const battleRepo = await import("./repositories/battles.js");
const { drainCharacterAuthoringJobs } = await import(
  "./services/character-authoring-jobs.js"
);
const { buildRoutes } = await import("./routes.js");

class BattlefieldAcceptanceProvider extends MockLlmProvider {
  concretizeCalls = 0;

  override async concretizeBattlefield(input: {
    preset: BattlefieldPreset | null;
    random: boolean;
  }): Promise<BattlefieldInstance> {
    this.concretizeCalls += 1;
    return super.concretizeBattlefield(input);
  }
}

class BattlefieldStructureFailureProvider extends MockLlmProvider {
  override async generateBattlefieldDefinitionV2(): Promise<never> {
    throw new Error("PROVIDER_BATTLEFIELD_STRUCTURE_FAILURE");
  }
}

const llm = new BattlefieldAcceptanceProvider();
let generatedImageCalls = 0;
let lastImageBrief: BattlefieldImageBriefV2 | undefined;
const app = buildRoutes({
  llm,
  generateBattlefieldImage: async (
    preset,
    _extra,
    _provider,
    revisionId,
    imageBrief,
  ) => {
    generatedImageCalls += 1;
    lastImageBrief = imageBrief;
    return {
      url: `/api/media/battlefields/${preset.id}.${revisionId}.jpg`,
      previousUrl: null,
      note: "fixture battlefield image generated",
      ok: true,
    };
  },
});
const failureLlm = new BattlefieldStructureFailureProvider();
const failureApp = buildRoutes({
  llm: failureLlm,
});

const sessionToken = "ses_structured_battlefield_route_acceptance";
const authHeaders = {
  Cookie: `kshiai_session=${sessionToken}`,
};

async function drainAuthoring(
  provider: BattlefieldAcceptanceProvider | BattlefieldStructureFailureProvider,
): Promise<void> {
  await drainCharacterAuthoringJobs({ llm: provider, workerId: "bf-route-test" });
}

async function acceptedAttemptId(response: Response): Promise<string> {
  const body = (await response.json()) as {
    attemptId?: string;
    draft?: { id: string };
  };
  const attemptId = body.attemptId ?? body.draft?.id;
  assert.ok(attemptId);
  return attemptId;
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
      imageUrl: null,
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

function battlefield(input: {
  id: string;
  displayName: string;
}): BattlefieldPreset {
  const now = "2026-08-14T00:00:00.000Z";
  return {
    id: input.id,
    ownerUserId: "route-owner",
    isSystem: false,
    displayName: input.displayName,
    category: "ruins",
    tags: ["fixture"],
    createdAt: now,
    updatedAt: now,
    appearance: {
      summary: `${input.displayName}の石造遺跡`,
      visualPrompt: `${input.displayName}, stone ruins`,
      imageUrl: null,
    },
    terrainHints: ["石床", "高台"],
    obstacleHints: ["崩れた柱"],
    conditionHints: ["薄明かり"],
    baseCoefficients: { damage: 1, earth: 1.1 },
    narrativeBlurb: `${input.displayName}には崩れた柱と薄明かりがある。`,
  };
}

async function insertLegacyBattlefield(preset: BattlefieldPreset): Promise<void> {
  await query(
    `INSERT INTO battlefields
      (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
     VALUES ($1, $2, FALSE, $3, $4, $5)`,
    [
      preset.id,
      preset.ownerUserId,
      JSON.stringify(preset),
      preset.createdAt,
      preset.updatedAt,
    ],
  );
}

async function generationCount(battlefieldId: string): Promise<number> {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM asset_generations
      WHERE asset_type = 'battlefield-preset' AND asset_id = $1`,
    [battlefieldId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

before(async () => {
  const now = "2026-08-14T00:00:00.000Z";
  await query(
    `INSERT INTO users (id, username, password_hash, created_at)
     VALUES ($1, $2, 'x', $3), ($4, $5, 'x', $3)`,
    ["route-owner", "route-owner", now, "route-opponent", "route-opponent"],
  );
  await query(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionToken, "route-owner", now, "2099-08-15T00:00:00.000Z"],
  );
  await characterRepo.saveSheet(sheet({
    id: "route-battlefield-mine",
    ownerUserId: "route-owner",
    displayName: "戦場検証自キャラ",
  }));
  await characterRepo.saveSheet(sheet({
    id: "route-battlefield-opponent",
    ownerUserId: "route-opponent",
    displayName: "戦場検証相手",
  }));
  await insertLegacyBattlefield(battlefield({
    id: "route-legacy-field",
    displayName: "未更新の遺跡",
  }));
  await insertLegacyBattlefield(battlefield({
    id: "route-expiry-field",
    displayName: "期限切れ候補の遺跡",
  }));
  await battlefieldRepo.importPreset(battlefield({
    id: "route-ready-field",
    displayName: "準備済みの遺跡",
  }));
  await battlefieldRepo.importPreset(battlefield({
    id: "route-drift-field",
    displayName: "並行更新の遺跡",
  }));
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("structured battlefield route acceptance", () => {
  it("records structure-stage failure without exposing a partial battlefield", async () => {
    const response = await failureApp.request("/api/battlefields/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "battlefield-failure-001",
      },
      body: JSON.stringify({ prompt: "途中失敗する戦場" }),
    });
    assert.equal(response.status, 202);
    const accepted = await response.json() as { attemptId: string };
    assert.ok(accepted.attemptId);
    await drainAuthoring(failureLlm);
    const attempt = await query<{
      battlefield_id: string;
      status: string;
      candidate_json: unknown | null;
    }>(
      `SELECT battlefield_id, status, candidate_json
         FROM battlefield_authoring_attempts
        WHERE owner_user_id = $1 AND idempotency_key = $2`,
      ["route-owner", "battlefield-create:battlefield-failure-001"],
    );
    assert.equal(attempt.rows[0]?.status, "failed");
    assert.equal(attempt.rows[0]?.candidate_json, null);
    const battlefieldId = attempt.rows[0]?.battlefield_id;
    assert.ok(battlefieldId);
    assert.equal(await battlefieldRepo.getPreset(battlefieldId), null);
    assert.equal(await generationCount(battlefieldId), 0);
  });

  it("keeps legacy battlefields visible to management but out of every match binding", async () => {
    const management = await app.request("/api/battlefields", {
      headers: authHeaders,
    });
    assert.equal(management.status, 200);
    const managed = (await management.json()) as {
      battlefields: Array<{
        id: string;
        selectable: boolean;
        compatibility: { status: string };
        upgradeAction: { targetSchemaVersion: number } | null;
      }>;
    };
    const legacy = managed.battlefields.find(
      (candidate) => candidate.id === "route-legacy-field",
    );
    assert.equal(legacy?.selectable, false);
    assert.equal(legacy?.compatibility.status, "unsupported");
    assert.equal(legacy?.upgradeAction?.targetSchemaVersion, 2);

    const selectable = await app.request("/api/battlefields?selectable=true", {
      headers: authHeaders,
    });
    const selectableIds = new Set(
      ((await selectable.json()) as {
        battlefields: Array<{ id: string; selectable: boolean }>;
      }).battlefields.map((candidate) => candidate.id),
    );
    assert.equal(selectableIds.has("route-ready-field"), true);
    assert.equal(selectableIds.has("route-legacy-field"), false);

    const policies = await app.request("/api/match/policies", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        myCharacterId: "route-battlefield-mine",
        opponentCharacterId: "route-battlefield-opponent",
        battlefieldPresetId: "route-legacy-field",
        battlefieldMode: "preset",
      }),
    });
    assert.equal(policies.status, 400);
    assert.equal(
      ((await policies.json()) as { error: string }).error,
      "battlefield_upgrade_required",
    );

    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      const battle = await app.request("/api/battles", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "Idempotency-Key": "legacy-field-battle-001",
        },
        body: JSON.stringify({
          myCharacterId: "route-battlefield-mine",
          opponentCharacterId: "route-battlefield-opponent",
          battlefieldPresetId: "route-legacy-field",
          battlefieldMode: "preset",
        }),
      });
      assert.equal(battle.status, 409);
      assert.equal(
        ((await battle.json()) as { error: string }).error,
        "battlefield_upgrade_required",
      );
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(await generationCount("route-legacy-field"), 0);
  });

  it("upgrades a legacy battlefield only after explicit owner confirmation", async () => {
    const upgrade = await app.request(
      "/api/battlefields/route-legacy-field/upgrade",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "legacy-field-upgrade-001",
        },
      },
    );
    assert.equal(upgrade.status, 202);
    const attemptId = await acceptedAttemptId(upgrade);
    await drainAuthoring(llm);
    assert.equal(
      (await battlefieldAssetRepo.getBattlefieldCompatibility(
        "route-legacy-field",
      )).status,
      "upgrading",
    );
    assert.equal(
      await battlefieldAssetRepo.getReadyBattlefieldGeneration(
        "route-legacy-field",
      ),
      null,
    );

    const beforeConfirm = await app.request(
      "/api/battlefields?selectable=true",
      { headers: authHeaders },
    );
    assert.equal(
      ((await beforeConfirm.json()) as {
        battlefields: Array<{ id: string }>;
      }).battlefields.some((candidate) => candidate.id === "route-legacy-field"),
      false,
    );

    const confirmed = await app.request(`/api/battlefields/${attemptId}/confirm`, {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(confirmed.status, 200);
    const confirmedBody = (await confirmed.json()) as {
      battlefield: {
        id: string;
        selectable: boolean;
        compatibility: { status: string };
      };
    };
    assert.equal(confirmedBody.battlefield.id, "route-legacy-field");
    assert.equal(confirmedBody.battlefield.selectable, true);
    assert.equal(confirmedBody.battlefield.compatibility.status, "ready");
    assert.equal(
      (await battlefieldAssetRepo.getReadyBattlefieldGeneration(
        "route-legacy-field",
      ))?.generation,
      1,
    );
  });

  it("returns a compare review and list mark for an awaiting battlefield upgrade", async () => {
    await insertLegacyBattlefield(battlefield({
      id: "route-review-field",
      displayName: "比較用旧戦場",
    }));
    const upgrade = await app.request(
      "/api/battlefields/route-review-field/upgrade",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "review-field-upgrade-001",
        },
      },
    );
    assert.equal(upgrade.status, 202);
    const attemptId = await acceptedAttemptId(upgrade);
    await drainAuthoring(llm);
    const review = await app.request(`/api/battlefield-drafts/${attemptId}`, {
      headers: authHeaders,
    });
    assert.equal(review.status, 200);
    const body = await review.json() as {
      family: string;
      kind: string;
      canAccept: boolean;
      current: { displayName: string } | null;
      candidate: { displayName: string } | null;
    };
    assert.equal(body.family, "battlefield");
    assert.equal(body.kind, "upgrade");
    assert.equal(body.canAccept, true);
    assert.equal(body.current?.displayName, "比較用旧戦場");
    assert.ok(body.candidate?.displayName);
    const listed = await app.request("/api/battlefields", { headers: authHeaders });
    const listedBody = await listed.json() as {
      battlefields: Array<{
        id: string;
        reviewState: string | null;
        reviewAttemptId: string | null;
      }>;
    };
    const marked = listedBody.battlefields.find((item) => item.id === "route-review-field");
    assert.equal(marked?.reviewState, "awaiting_acceptance");
    assert.equal(marked?.reviewAttemptId, attemptId);
    await app.request(`/api/battlefield-drafts/${attemptId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
  });

  it("expires an upgrade candidate without creating or selecting a generation", async () => {
    const upgrade = await app.request(
      "/api/battlefields/route-expiry-field/upgrade",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "expiry-field-upgrade-001",
        },
      },
    );
    assert.equal(upgrade.status, 202);
    const attemptId = await acceptedAttemptId(upgrade);
    await drainAuthoring(llm);
    await query(
      `UPDATE battlefield_authoring_attempts
          SET expires_at = $1
        WHERE attempt_id = $2`,
      ["2000-01-01T00:00:00.000Z", attemptId],
    );

    const confirmed = await app.request(`/api/battlefields/${attemptId}/confirm`, {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(confirmed.status, 409);
    assert.equal(
      ((await confirmed.json()) as { message: string }).message,
      "AUTHORING_ATTEMPT_EXPIRED",
    );
    assert.equal(await generationCount("route-expiry-field"), 0);
    assert.equal(
      (await battlefieldAssetRepo.getBattlefieldCompatibility(
        "route-expiry-field",
      )).status,
      "upgrade_failed",
    );
    assert.equal(
      (await battlefieldAssetRepo.getBattlefieldAuthoringAttempt(
        attemptId,
        "route-owner",
      ))?.status,
      "expired",
    );
  });

  it("rejects a stale revision candidate after concurrent current-pointer drift", async () => {
    const before = await battlefieldAssetRepo.getReadyBattlefieldGeneration(
      "route-drift-field",
    );
    assert.equal(before?.generation, 1);
    const revision = await app.request(
      "/api/battlefields/route-drift-field/chat",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "Idempotency-Key": "drift-field-revision-001",
        },
        body: JSON.stringify({ message: "候補だけを作る" }),
      },
    );
    assert.equal(revision.status, 202);
    const attemptId = await acceptedAttemptId(revision);
    await drainAuthoring(llm);
    const currentPreset = await battlefieldRepo.getPreset("route-drift-field");
    assert.ok(currentPreset);
    await battlefieldRepo.importPreset({
      ...currentPreset,
      narrativeBlurb: "別の並行操作が先に確定した。",
      updatedAt: "2026-08-14T00:01:00.000Z",
    });
    const concurrent = await battlefieldAssetRepo.getReadyBattlefieldGeneration(
      "route-drift-field",
    );
    assert.equal(concurrent?.generation, 2);

    const confirmed = await app.request(`/api/battlefields/${attemptId}/confirm`, {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(confirmed.status, 409);
    assert.equal(
      ((await confirmed.json()) as { message: string }).message,
      "ASSET_CURRENT_GENERATION_DRIFT",
    );
    assert.equal(await generationCount("route-drift-field"), 2);
    assert.equal(
      (await battlefieldAssetRepo.getReadyBattlefieldGeneration(
        "route-drift-field",
      ))?.generationId,
      concurrent?.generationId,
    );
    await app.request(`/api/battlefield-drafts/${attemptId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
  });

  it("commits create revision and image changes only as confirmed immutable generations", async () => {
    const createHeaders = {
      ...authHeaders,
      "Content-Type": "application/json",
      "Idempotency-Key": "battlefield-create-001",
    };
    const generated = await app.request("/api/battlefields/generate", {
      method: "POST",
      headers: createHeaders,
      body: JSON.stringify({ prompt: "風の通る円形闘技場", category: "arena" }),
    });
    assert.equal(generated.status, 202);
    const attemptId = await acceptedAttemptId(generated);
    await drainAuthoring(llm);
    const review = await app.request(`/api/battlefield-drafts/${attemptId}`, {
      headers: authHeaders,
    });
    assert.equal(review.status, 200);
    const reviewBody = (await review.json()) as {
      assetId: string;
      canAccept: boolean;
      candidate: { id: string } | null;
    };
    assert.equal(reviewBody.canAccept, true);
    const battlefieldId = reviewBody.assetId;
    assert.ok(reviewBody.candidate);
    assert.equal(await battlefieldRepo.getPreset(battlefieldId), null);
    assert.equal(await generationCount(battlefieldId), 0);

    const replayed = await app.request("/api/battlefields/generate", {
      method: "POST",
      headers: createHeaders,
      body: JSON.stringify({ prompt: "風の通る円形闘技場", category: "arena" }),
    });
    assert.equal(replayed.status, 200);
    assert.equal(
      ((await replayed.json()) as { draft: { id: string } }).draft.id,
      attemptId,
    );

    const adjusted = await app.request(`/api/battlefield-drafts/${attemptId}/chat`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "高台を目立たせてください" }),
    });
    assert.equal(adjusted.status, 202);
    await drainAuthoring(llm);
    assert.equal(await generationCount(battlefieldId), 0);

    const confirmed = await app.request(`/api/battlefields/${attemptId}/confirm`, {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(confirmed.status, 200);
    const first = await battlefieldAssetRepo.getReadyBattlefieldGeneration(
      battlefieldId,
    );
    assert.equal(first?.generation, 1);
    assert.ok((first?.content as {
      definition?: { evolutionAffordances?: unknown[] };
    }).definition?.evolutionAffordances?.length);
    assert.ok(await battlefieldRepo.getPreset(battlefieldId));

    const revision = await app.request(`/api/battlefields/${battlefieldId}/chat`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "battlefield-revision-001",
      },
      body: JSON.stringify({ message: "薄い霧を加えてください" }),
    });
    assert.equal(revision.status, 202);
    const revisionAttemptId = await acceptedAttemptId(revision);
    await drainAuthoring(llm);
    assert.equal(
      (await battlefieldAssetRepo.getReadyBattlefieldGeneration(battlefieldId))
        ?.generationId,
      first?.generationId,
    );

    const revisionConfirmed = await app.request(
      `/api/battlefields/${revisionAttemptId}/confirm`,
      { method: "POST", headers: authHeaders },
    );
    assert.equal(revisionConfirmed.status, 200);
    const second = await battlefieldAssetRepo.getReadyBattlefieldGeneration(
      battlefieldId,
    );
    assert.equal(second?.generation, 2);

    const imageHeaders = {
      ...authHeaders,
      "Content-Type": "application/json",
      "Idempotency-Key": "battlefield-image-001",
    };
    const image = await app.request(`/api/battlefields/${battlefieldId}/image`, {
      method: "POST",
      headers: imageHeaders,
      body: JSON.stringify({ extra: "夕暮れ" }),
    });
    assert.equal(image.status, 200);
    assert.equal(generatedImageCalls, 1);
    assert.equal(lastImageBrief?.contractVersion, 2);
    const third = await battlefieldAssetRepo.getReadyBattlefieldGeneration(
      battlefieldId,
    );
    assert.equal(third?.generation, 3);

    const replayedImage = await app.request(
      `/api/battlefields/${battlefieldId}/image`,
      {
        method: "POST",
        headers: imageHeaders,
        body: JSON.stringify({ extra: "夕暮れ" }),
      },
    );
    assert.equal(replayedImage.status, 200);
    assert.equal(generatedImageCalls, 1);
    assert.equal(
      (await battlefieldAssetRepo.getReadyBattlefieldGeneration(battlefieldId))
        ?.generationId,
      third?.generationId,
    );
  });

  it("binds an exact preset revision and deterministic compiler without mutating it", async () => {
    const before = await battlefieldAssetRepo.getReadyBattlefieldGeneration(
      "route-ready-field",
    );
    assert.ok(before);
    const generationsBefore = await generationCount("route-ready-field");
    const response = await app.request("/api/battles", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "ready-field-battle-001",
      },
      body: JSON.stringify({
        myCharacterId: "route-battlefield-mine",
        opponentCharacterId: "route-battlefield-opponent",
        battlefieldPresetId: "route-ready-field",
        battlefieldMode: "preset",
      }),
    });
    assert.equal(response.status, 200);
    const battleId = ((await response.json()) as { battle: { id: string } })
      .battle.id;
    const state = await battleRepo.getBattle(battleId);
    assert.ok(state?.assetManifest);
    assert.equal(
      state.assetManifest.battlefield.presetGenerationId,
      before.generationId,
    );
    assert.equal(
      state.assetManifest.battlefield.presetContentDigest,
      before.contentDigest,
    );
    assert.equal(
      state.assetManifest.rules.battlefieldDefinitionRules,
      BATTLEFIELD_INSTANCE_COMPILER_V2,
    );
    assert.equal(
      state.assetManifest.battlefield.snapshot.compilerContract,
      BATTLEFIELD_INSTANCE_COMPILER_V2,
    );
    assert.equal(state.assetManifest.battlefield.snapshot.sourcePresetId,
      "route-ready-field");
    assert.equal(llm.concretizeCalls, 0);
    assert.equal(await generationCount("route-ready-field"), generationsBefore);
    assert.equal(
      (await battlefieldAssetRepo.getReadyBattlefieldGeneration(
        "route-ready-field",
      ))?.generationId,
      before.generationId,
    );

    const copied = await app.request(
      "/api/battlefields/route-ready-field/copy",
      { method: "POST", headers: authHeaders },
    );
    assert.equal(copied.status, 200);
    const copiedId = ((await copied.json()) as {
      battlefield: { id: string };
    }).battlefield.id;
    assert.equal(
      (await battlefieldAssetRepo.getReadyBattlefieldGeneration(copiedId))
        ?.generation,
      1,
    );

  });
});
