import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  NARRATION_PROMPT_COMPILER_V2,
  defaultParameters,
  type CharacterSheet,
  type NarrationStyle,
} from "@kshiai/shared";

const directory = mkdtempSync(join(tmpdir(), "kshiai-narration-routes-v2-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "routes.db");
process.env.LLM_PROVIDER = "mock";

const { closeDatabase, query } = await import("./db.js");
const { MockLlmProvider } = await import("./llm/mock.js");
const characterRepo = await import("./repositories/characters.js");
const narrationRepo = await import("./repositories/narration-styles.js");
const narrationAssetRepo = await import(
  "./repositories/narration-style-assets-v2.js"
);
const battleRepo = await import("./repositories/battles.js");
const { buildImportedNarrationStyleEnvelopeV2 } = await import(
  "./services/narration-style-authoring-service.js"
);
const { buildNarrationStyleGenerationCandidate } = await import(
  "./services/narration-style-authoring-service.js"
);
const { buildRoutes } = await import("./routes.js");
const { drainCharacterAuthoringJobs } = await import(
  "./services/character-authoring-jobs.js"
);

class NarrationStructureFailureProvider extends MockLlmProvider {
  override async generateNarrationDefinitionV2(): Promise<never> {
    throw new Error("PROVIDER_NARRATION_STRUCTURE_FAILURE");
  }
}

const llm = new MockLlmProvider();
const failureLlm = new NarrationStructureFailureProvider();
const app = buildRoutes({ llm });
const failureApp = buildRoutes({ llm: failureLlm });
const sessionToken = "ses_structured_narration_route_acceptance";
const authHeaders = { Cookie: `kshiai_session=${sessionToken}` };

async function drainAuthoring(
  provider: typeof llm,
): Promise<void> {
  await drainCharacterAuthoringJobs({ llm: provider, workerId: "ns-route-test" });
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

function style(id: string, displayName: string): NarrationStyle {
  const now = "2026-08-14T00:00:00.000Z";
  return {
    id,
    ownerUserId: "narration-route-owner",
    isSystem: false,
    displayName,
    description: `${displayName}の公開説明。`,
    instruction: "短文で、確定した出来事だけを落ち着いて語る。",
    perspective: "external",
    tags: ["fixture"],
    createdAt: now,
    updatedAt: now,
  };
}

async function insertLegacyStyle(value: NarrationStyle): Promise<void> {
  await query(
    `INSERT INTO narration_styles
      (id, owner_user_id, is_system, sheet_json, created_at, updated_at)
     VALUES ($1, $2, FALSE, $3, $4, $5)`,
    [
      value.id,
      value.ownerUserId,
      JSON.stringify(value),
      value.createdAt,
      value.updatedAt,
    ],
  );
}

async function generationCount(narrationStyleId: string): Promise<number> {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM asset_generations
      WHERE asset_type = 'narration-style' AND asset_id = $1`,
    [narrationStyleId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

before(async () => {
  const now = "2026-08-14T00:00:00.000Z";
  await query(
    `INSERT INTO users (id, username, password_hash, created_at)
     VALUES ($1, $2, 'x', $3), ($4, $5, 'x', $3)`,
    [
      "narration-route-owner",
      "narration-route-owner",
      now,
      "narration-route-opponent",
      "narration-route-opponent",
    ],
  );
  await query(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionToken, "narration-route-owner", now, "2099-08-15T00:00:00.000Z"],
  );
  await characterRepo.saveSheet(sheet({
    id: "narration-route-mine",
    ownerUserId: "narration-route-owner",
    displayName: "語り検証自キャラ",
  }));
  await characterRepo.saveSheet(sheet({
    id: "narration-route-opponent",
    ownerUserId: "narration-route-opponent",
    displayName: "語り検証相手",
  }));
  await insertLegacyStyle(style("narration-route-legacy", "未更新スタイル"));
  await insertLegacyStyle(style("narration-route-unsupported", "選べないスタイル"));
  await insertLegacyStyle(style("narration-route-expiry", "期限切れスタイル"));
  const ready = style("narration-route-ready", "準備済みスタイル");
  await narrationAssetRepo.activateImportedNarrationStyle({
    style: ready,
    envelope: buildImportedNarrationStyleEnvelopeV2({
      style: ready,
      attemptId: "route-ready-import-v2",
    }),
  });
  const drift = style("narration-route-drift", "並行更新スタイル");
  await narrationAssetRepo.activateImportedNarrationStyle({
    style: drift,
    envelope: buildImportedNarrationStyleEnvelopeV2({
      style: drift,
      attemptId: "route-drift-import-v2",
    }),
  });
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("structured narration route acceptance", () => {
  it("records structure failure without exposing a partial style", async () => {
    const response = await failureApp.request("/api/narration-styles/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "narration-failure-001",
      },
      body: JSON.stringify({ prompt: "途中失敗する語り口" }),
    });
    assert.equal(response.status, 202);
    assert.ok(((await response.json()) as { attemptId: string }).attemptId);
    await drainAuthoring(failureLlm);
    const attempt = await query<{
      narration_style_id: string;
      status: string;
      candidate_json: unknown | null;
    }>(
      `SELECT narration_style_id, status, candidate_json
         FROM narration_style_authoring_attempts
        WHERE owner_user_id = $1 AND idempotency_key = $2`,
      ["narration-route-owner", "narration-create:narration-failure-001"],
    );
    assert.equal(attempt.rows[0]?.status, "failed");
    assert.equal(attempt.rows[0]?.candidate_json, null);
    const styleId = attempt.rows[0]?.narration_style_id;
    assert.ok(styleId);
    assert.equal(await narrationRepo.getNarrationStyle(styleId), null);
    assert.equal(await generationCount(styleId), 0);
  });

  it("keeps legacy styles manageable but outside selectors and direct binding", async () => {
    const management = await app.request("/api/narration-styles", {
      headers: authHeaders,
    });
    assert.equal(management.status, 200);
    const body = (await management.json()) as {
      styles: Array<{
        id: string;
        selectable: boolean;
        compatibility: { status: string };
        upgradeAction: { targetSchemaVersion: number } | null;
        instruction?: string;
      }>;
    };
    const legacy = body.styles.find((value) => value.id === "narration-route-legacy");
    assert.equal(legacy?.selectable, false);
    assert.equal(legacy?.compatibility.status, "unsupported");
    assert.equal(legacy?.upgradeAction?.targetSchemaVersion, 2);
    assert.equal("instruction" in (legacy ?? {}), false);

    const selectable = await app.request("/api/narration-styles?selectable=true", {
      headers: authHeaders,
    });
    const ids = new Set(((await selectable.json()) as {
      styles: Array<{ id: string }>;
    }).styles.map((value) => value.id));
    assert.equal(ids.has("narration-route-ready"), true);
    assert.equal(ids.has("narration-route-legacy"), false);

    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      const battle = await app.request("/api/battles", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "Idempotency-Key": "narration-unsupported-battle-001",
        },
        body: JSON.stringify({
          myCharacterId: "narration-route-mine",
          opponentCharacterId: "narration-route-opponent",
          narrationStyleId: "narration-route-unsupported",
        }),
      });
      assert.equal(battle.status, 409);
      assert.equal(
        ((await battle.json()) as { error: string }).error,
        "narration_style_upgrade_required",
      );
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(await generationCount("narration-route-unsupported"), 0);
  });

  it("creates and upgrades only after owner confirmation with idempotent readback", async () => {
    const create = await app.request("/api/narration-styles/generate", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "narration-create-001",
      },
      body: JSON.stringify({ prompt: "短文の熱いラジオ実況" }),
    });
    assert.equal(create.status, 202);
    const createdAttemptId = await acceptedAttemptId(create);
    await drainAuthoring(llm);
    const createdReview = await app.request(
      `/api/narration-style-drafts/${createdAttemptId}`,
      { headers: authHeaders },
    );
    assert.equal(createdReview.status, 200);
    const createdDraft = (await createdReview.json()) as {
      attemptId: string;
      assetId: string;
      candidate: { id: string; description: string; instruction?: string } | null;
      definition: { phases: Record<string, unknown>; voice: { register: string } } | null;
    };
    assert.ok(createdDraft.candidate);
    assert.equal(createdDraft.definition?.voice.register, "broadcast");
    assert.deepEqual(Object.keys(createdDraft.definition?.phases ?? {}), [
      "prologue",
      "action",
      "impact",
      "release",
      "judgment",
      "aftermath",
    ]);
    assert.equal("instruction" in createdDraft.candidate, false);
    assert.equal(
      await narrationRepo.getNarrationStyle(createdDraft.assetId),
      null,
    );
    const confirmed = await app.request(
      `/api/narration-styles/${createdDraft.attemptId}/confirm`,
      { method: "POST", headers: authHeaders },
    );
    assert.equal(confirmed.status, 200);
    const replay = await app.request(
      `/api/narration-styles/${createdDraft.attemptId}/confirm`,
      { method: "POST", headers: authHeaders },
    );
    assert.equal(replay.status, 200);
    assert.equal(await generationCount(createdDraft.assetId), 1);

    const upgrade = await app.request(
      "/api/narration-styles/narration-route-legacy/upgrade",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Idempotency-Key": "narration-upgrade-001",
        },
      },
    );
    assert.equal(upgrade.status, 202);
    const upgradeAttemptId = await acceptedAttemptId(upgrade);
    await drainAuthoring(llm);
    assert.equal(
      (await narrationAssetRepo.getNarrationStyleCompatibility(
        "narration-route-legacy",
      )).status,
      "upgrading",
    );
    assert.equal(
      await narrationAssetRepo.getReadyNarrationStyleGeneration(
        "narration-route-legacy",
      ),
      null,
    );
    const listed = await app.request("/api/narration-styles", {
      headers: authHeaders,
    });
    const listedBody = await listed.json() as {
      styles: Array<{
        id: string;
        reviewState: string | null;
        reviewAttemptId: string | null;
      }>;
    };
    const marked = listedBody.styles.find((item) => item.id === "narration-route-legacy");
    assert.equal(marked?.reviewState, "awaiting_acceptance");
    assert.equal(marked?.reviewAttemptId, upgradeAttemptId);
    const upgraded = await app.request(
      `/api/narration-styles/${upgradeAttemptId}/confirm`,
      { method: "POST", headers: authHeaders },
    );
    assert.equal(upgraded.status, 200);
    assert.equal(
      (await narrationAssetRepo.getNarrationStyleCompatibility(
        "narration-route-legacy",
      )).status,
      "ready",
    );
  });

  it("binds the exact ready generation and never appends one at battle start", async () => {
    const ready = await narrationAssetRepo.getReadyNarrationStyleGeneration(
      "narration-route-ready",
    );
    assert.ok(ready);
    const beforeCount = await generationCount("narration-route-ready");
    const response = await app.request("/api/battles", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "narration-ready-battle-001",
      },
      body: JSON.stringify({
        myCharacterId: "narration-route-mine",
        opponentCharacterId: "narration-route-opponent",
        narrationStyleId: "narration-route-ready",
      }),
    });
    assert.equal(response.status, 200);
    const battleId = ((await response.json()) as { battle: { id: string } }).battle.id;
    const state = await battleRepo.getBattle(battleId);
    assert.ok(state?.assetManifest);
    assert.equal(state.assetManifest.narrationStyle.generationId, ready.generationId);
    assert.equal(state.assetManifest.narrationStyle.contentDigest, ready.contentDigest);
    assert.equal(
      state.assetManifest.rules.narrationStyleRules,
      NARRATION_PROMPT_COMPILER_V2,
    );
    assert.equal(
      state.narrationStyle?.compiledPolicyV2?.compilerContract,
      NARRATION_PROMPT_COMPILER_V2,
    );
    assert.notEqual(
      state.narrationStyle?.compiledPolicyV2?.phases.prologue.instruction,
      state.narrationStyle?.compiledPolicyV2?.phases.aftermath.instruction,
    );
    assert.equal(await generationCount("narration-route-ready"), beforeCount);
  });

  it("persists expiry and rejects a candidate after current-pointer drift", async () => {
    const provider = new MockLlmProvider();
    const expiryStyle = (await narrationRepo.getNarrationStyle(
      "narration-route-expiry",
    ))!;
    const expirySource = `${expiryStyle.description}\n${expiryStyle.instruction}`;
    const expiryAttempt = await narrationAssetRepo
      .beginNarrationStyleAuthoringAttempt({
        ownerUserId: "narration-route-owner",
        narrationStyleId: expiryStyle.id,
        kind: "upgrade",
        idempotencyKey: "narration-expiry-direct-001",
        requestDigest: "expiry-request",
        sourceText: expirySource,
        sourceDigest: "expiry-source",
      });
    const expiryCandidate = await buildNarrationStyleGenerationCandidate({
      llm: provider,
      attemptId: expiryAttempt.attempt.attemptId,
      narrationStyleId: expiryStyle.id,
      ownerUserId: "narration-route-owner",
      sourceText: expirySource,
      sourceKind: "upgrade_description",
      generated: expiryStyle,
      existing: expiryStyle,
    });
    await narrationAssetRepo.saveNarrationStyleAuthoringCandidate({
      attemptId: expiryAttempt.attempt.attemptId,
      ownerUserId: "narration-route-owner",
      envelope: expiryCandidate.envelope,
      assistantMessage: "expiry fixture",
    });
    await query(
      `UPDATE narration_style_authoring_attempts SET expires_at = $2
        WHERE attempt_id = $1`,
      [expiryAttempt.attempt.attemptId, "2000-01-01T00:00:00.000Z"],
    );
    await assert.rejects(
      narrationAssetRepo.activateNarrationStyleAuthoringAttempt({
        attemptId: expiryAttempt.attempt.attemptId,
        ownerUserId: "narration-route-owner",
      }),
      /AUTHORING_ATTEMPT_EXPIRED/,
    );
    assert.equal(
      (await narrationAssetRepo.getNarrationStyleAuthoringAttempt(
        expiryAttempt.attempt.attemptId,
        "narration-route-owner",
      ))?.status,
      "expired",
    );
    assert.equal(
      (await narrationAssetRepo.getNarrationStyleCompatibility(
        expiryStyle.id,
      )).status,
      "upgrade_failed",
    );
    assert.equal(await generationCount(expiryStyle.id), 0);

    const driftStyle = (await narrationRepo.getNarrationStyle(
      "narration-route-drift",
    ))!;
    const driftAttempt = await narrationAssetRepo
      .beginNarrationStyleAuthoringAttempt({
        ownerUserId: "narration-route-owner",
        narrationStyleId: driftStyle.id,
        kind: "revision",
        idempotencyKey: "narration-drift-direct-001",
        requestDigest: "drift-request",
        sourceText: "より簡潔にする",
        sourceDigest: "drift-source",
      });
    const driftCandidate = await buildNarrationStyleGenerationCandidate({
      llm: provider,
      attemptId: driftAttempt.attempt.attemptId,
      narrationStyleId: driftStyle.id,
      ownerUserId: "narration-route-owner",
      sourceText: "より簡潔にする",
      sourceKind: "revision_instruction",
      generated: {
        ...driftStyle,
        instruction: "より簡潔に語る。",
      },
      existing: driftStyle,
    });
    await narrationAssetRepo.saveNarrationStyleAuthoringCandidate({
      attemptId: driftAttempt.attempt.attemptId,
      ownerUserId: "narration-route-owner",
      envelope: driftCandidate.envelope,
      assistantMessage: "drift fixture",
    });
    const concurrent = {
      ...driftStyle,
      displayName: "並行更新後スタイル",
      instruction: "並行更新で分析的に語る。",
      updatedAt: "2026-08-14T01:00:00.000Z",
    };
    await narrationAssetRepo.activateImportedNarrationStyle({
      style: concurrent,
      envelope: buildImportedNarrationStyleEnvelopeV2({
        style: concurrent,
        attemptId: "route-drift-concurrent-v2",
      }),
    });
    const countAfterConcurrent = await generationCount(driftStyle.id);
    await assert.rejects(
      narrationAssetRepo.activateNarrationStyleAuthoringAttempt({
        attemptId: driftAttempt.attempt.attemptId,
        ownerUserId: "narration-route-owner",
      }),
      /ASSET_CURRENT_GENERATION_DRIFT/,
    );
    assert.equal(await generationCount(driftStyle.id), countAfterConcurrent);
  });
});
