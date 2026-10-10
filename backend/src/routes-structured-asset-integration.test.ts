import { z } from "zod";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  defaultParameters,
  defaultBasicAttack,
  BattlePublicSchema,
  defaultDialoguePipelineSettings,
  AwarenessConsciousOutputSchema,
  AwarenessLatentOutputSchema,
  type BattlefieldPreset,
  type CharacterSheet,
  type NarrationStyle,
} from "@kshiai/shared";
import type { AwarenessProviderRoles } from "./llm/awareness-provider-factory.js";
import { currentAwarenessDispatchContext } from "./llm/awareness-dispatch-context.js";
import type { LlmProvider } from "./llm/types.js";

const directory = mkdtempSync(join(tmpdir(), "kshiai-asset-integration-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "routes.db");
process.env.LLM_PROVIDER = "mock";

const { closeDatabase, query } = await import("./db.js");
const { MockLlmProvider } = await import("./llm/mock.js");
const characterRepo = await import("./repositories/characters.js");
const characterAssetRepo = await import("./repositories/character-assets-v2.js");
const { createV3StageTrialCandidate, createV3StageTrialSource } = await import(
  "./fixtures/neva-v3.js"
);
const { prepareV3TrialCharacter } = await import(
  "./repositories/local-v3-trial-characters.js"
);
const battlefieldRepo = await import("./repositories/battlefields.js");
const battlefieldAssetRepo = await import("./repositories/battlefield-assets-v2.js");
const narrationRepo = await import("./repositories/narration-styles.js");
const narrationAssetRepo = await import(
  "./repositories/narration-style-assets-v2.js"
);
const battleRepo = await import("./repositories/battles.js");
const settingsRepo = await import("./repositories/dialogue-pipeline-settings.js");
const { buildImportedNarrationStyleEnvelopeV2 } = await import(
  "./services/narration-style-authoring-service.js"
);
const { buildRoutes } = await import("./routes.js");

const ownerId = "asset-integration-owner";
const opponentOwnerId = "asset-integration-opponent-owner";
const developerId = "asset-integration-developer";
const mineId = "asset-integration-mine";
const opponentId = "asset-integration-opponent";
const battlefieldId = "asset-integration-field";
const narrationStyleId = "asset-integration-style";
const sessionToken = "ses_asset_integration_acceptance";
const developerSessionToken = "ses_asset_integration_developer";
const authHeaders = { Cookie: `kshiai_session=${sessionToken}` };
const developerHeaders = {
  Cookie: `kshiai_session=${developerSessionToken}`,
};
const provider = new MockLlmProvider();
provider.prepareBattleEncounter = async function(
  input: Parameters<LlmProvider["prepareBattleEncounter"]>[0],
): ReturnType<LlmProvider["prepareBattleEncounter"]> {
  const guard = currentAwarenessDispatchContext();
  if (!guard) return MockLlmProvider.prototype.prepareBattleEncounter.call(this, input);
  return guard.run({ provider: guard.provider, model: guard.model,
    system: "test battle encounter system", user: JSON.stringify(input),
    options: { tier: "engine", timeoutMs: guard.limits.deadlineMs,
      maxCompletionTokens: guard.limits.outputTokens, label: "prepareBattleEncounter",
      retry: "none", responseFormat: { type: "json_object" } },
  }, async () => ({ result: await MockLlmProvider.prototype.prepareBattleEncounter.call(this, input), usage: null }));
};
const awarenessRoles: AwarenessProviderRoles = {
  consciousness: { identity: { provider: "openai", engineModel: "gpt-6-luna", fastModel: "gpt-6-luna" }, requestJson: async () => ({}) },
  models: {
    subconscious: async (input) => AwarenessLatentOutputSchema.parse({ state: { ...input.currentState, updatedTick: input.tick }, reflexDesires: [], affectiveDesires: [], reconsider: false, cancelThought: false }),
    conscious: async () => AwarenessConsciousOutputSchema.parse({ goal: null, thought: "", desires: [], influences: [] }),
  },
  adjudication: { identity: { provider: "xai", engineModel: "grok-test", fastModel: "grok-test" }, requestJson: async () => { throw new Error("unexpected transport call"); } },
  adjudicationProvider: provider,
  narration: { identity: { provider: "xai", engineModel: "grok-test", fastModel: "grok-test" }, narrateBatch: async () => [], narrateFrozenBatch: async () => [] },
};
Object.assign(provider, { awareness: awarenessRoles, awarenessBillingContracts: [] });
const app = buildRoutes({ llm: provider });

function character(input: {
  id: string;
  ownerUserId: string;
  displayName: string;
}): CharacterSheet {
  const now = "2026-08-14T00:00:00.000Z";
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    displayName: input.displayName,
    tags: ["integration-ready"],
    createdAt: now,
    updatedAt: now,
    appearance: { summary: `${input.displayName}の公開外見`, visualPrompt: `${input.displayName} portrait`, imageUrl: null },
    traits: ["慎重"], parameters: defaultParameters(), basicAttack: defaultBasicAttack(), skills: [], weapon: null, armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false }, narrativeBlurb: `${input.displayName}の公開プロフィール。`, visibility: "public",
  };
}

function battlefield(): BattlefieldPreset {
  const now = "2026-08-14T00:00:00.000Z";
  return {
    id: battlefieldId,
    ownerUserId: ownerId,
    isSystem: false,
    displayName: "統合固定戦場",
    category: "urban",
    tags: ["integration-ready"],
    createdAt: now,
    updatedAt: now,
    appearance: {
      summary: "公開用の静かな広場",
      visualPrompt: "quiet stone plaza",
      imageUrl: null,
    },
    terrainHints: ["石畳"],
    obstacleHints: ["噴水"],
    conditionHints: ["薄明"],
    baseCoefficients: { speed: 1.25 },
    narrativeBlurb: "薄明の石畳と噴水がある公開広場。",
  };
}

function narrationStyle(): NarrationStyle {
  const now = "2026-08-14T00:00:00.000Z";
  return {
    id: narrationStyleId,
    ownerUserId: ownerId,
    isSystem: false,
    displayName: "統合固定語り",
    description: "確定した出来事を静かに伝える公開説明。",
    instruction: "INTERNAL_STYLE_SECRET: 確定した動作だけを短文で語る。",
    perspective: "external",
    tags: ["integration-ready"],
    createdAt: now,
    updatedAt: now,
  };
}

async function idsFrom(response: Response, key: string): Promise<Set<string>> {
  const body = z.object({ [key]: z.array(z.object({ id: z.string() })) }).parse(await response.json());
  return new Set((body[key] ?? []).map((value) => value.id));
}

before(async () => {
  const now = "2026-08-14T00:00:00.000Z";
  await query(
    `INSERT INTO users (id, username, password_hash, account_kind, created_at)
     VALUES ($1, $2, 'x', 'general', $3),
            ($4, $5, 'x', 'general', $3),
            ($6, $6, 'x', 'developer', $3)`,
    [ownerId, ownerId, now, opponentOwnerId, opponentOwnerId, developerId],
  );
  await query(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4), ($5, $6, $3, $4)`,
    [
      sessionToken,
      ownerId,
      now,
      "2099-08-15T00:00:00.000Z",
      developerSessionToken,
      developerId,
    ],
  );
  const settings = defaultDialoguePipelineSettings();
  await settingsRepo.updateDialoguePipelineSettings({
    userId: ownerId,
    patch: { ...settings, schemaVersion: 3, contextProjectionMode: "compact", expectedRevision: 0 },
  });
  for (const input of [
    { id: mineId, ownerUserId: ownerId },
    { id: opponentId, ownerUserId: opponentOwnerId },
  ]) {
    const prepared = await prepareV3TrialCharacter({
      characterId: input.id,
      ownerUserId: input.ownerUserId,
      envelope: createV3StageTrialCandidate(),
      source: createV3StageTrialSource(),
    });
    assert.equal(prepared.status, "awaiting_owner_acceptance");
    assert.ok(prepared.candidateDigest);
    await characterAssetRepo.activateCharacterAuthoringAttempt({
      attemptId: prepared.attemptId,
      ownerUserId: input.ownerUserId,
      candidateDigest: prepared.candidateDigest,
    });
    await query("UPDATE characters SET owner_user_id = $2 WHERE id = $1", [input.id, input.ownerUserId]);
  }
  await battlefieldRepo.importPreset(battlefield());
  const readyStyle = narrationStyle();
  await narrationAssetRepo.activateImportedNarrationStyle({
    style: readyStyle,
    envelope: buildImportedNarrationStyleEnvelopeV2({
      style: readyStyle,
      attemptId: "asset-integration-style-import-v2",
    }),
  });
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("integrated structured asset cutover", () => {
  it("keeps selection, binding, replay, history, and deletion on immutable generations", async () => {
    const ownerSearch = await app.request(
      "/api/characters?selectable=true",
      { headers: authHeaders },
    );
    assert.equal(ownerSearch.status, 200);
    assert.deepEqual(await idsFrom(ownerSearch, "characters"), new Set([mineId]));

    const opponentSearch = await app.request(
      "/api/match/candidates",
      { headers: authHeaders },
    );
    assert.equal(opponentSearch.status, 200);
    assert.deepEqual(
      await idsFrom(opponentSearch, "candidates"),
      new Set([mineId, opponentId]),
    );

    for (const endpoint of ["/api/match/random", "/api/match/auto"]) {
      const response = await app.request(endpoint, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ myCharacterId: mineId }),
      });
      assert.equal(response.status, 200);
      assert.equal(
        (z.object({ opponent: z.object({ id: z.string() }) }).parse((await response.json()))).opponent.id,
        opponentId,
      );
    }

    const fieldSearch = await app.request(
      "/api/battlefields?selectable=true&q=統合固定戦場",
      { headers: authHeaders },
    );
    assert.equal(fieldSearch.status, 200);
    assert.deepEqual(
      await idsFrom(fieldSearch, "battlefields"),
      new Set([battlefieldId]),
    );
    const styleSelector = await app.request(
      "/api/narration-styles?selectable=true",
      { headers: authHeaders },
    );
    assert.equal(styleSelector.status, 200);
    assert.equal(
      (await idsFrom(styleSelector, "styles")).has(narrationStyleId),
      true,
    );

    const create = await app.request("/api/battles", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "asset-integration-battle-001",
      },
      body: JSON.stringify({
        myCharacterId: mineId,
        opponentCharacterId: opponentId,
        battlefieldMode: "preset",
        battlefieldPresetId: battlefieldId,
        narrationStyleId,
      }),
    });
    assert.equal(create.status, 200);
    const rawCreateBody: unknown = await create.json();
    const createBody = z.object({ battle: BattlePublicSchema.passthrough() }).passthrough().parse(rawCreateBody);
    const publicCreateJson = JSON.stringify(rawCreateBody);
    for (const forbidden of [
      "assetManifest",
      "compiledPolicyV2",
      "sourceDigest",
      "baseCoefficients",
      "INTERNAL_STYLE_SECRET",
    ]) {
      assert.equal(publicCreateJson.includes(forbidden), false);
    }

    const battleId = createBody.battle.id;
    const bound = await battleRepo.getBattle(battleId);
    assert.ok(bound?.assetManifest);
    assert.equal(bound.assetManifest.schemaVersion, 6);
    assert.equal(bound.assetManifest.consciousOutputContract, "unified-consciousness-v1");
    assert.equal(bound.assetManifest.consciousnessPolicy.revision, "unified-consciousness-policy-v2");
    assert.equal((await query<{ count: number }>("SELECT COUNT(*) AS count FROM battle_unified_consciousness WHERE battle_id=$1", [battleId])).rows[0]?.count, 1);
    assert.equal((await query<{ count: number }>("SELECT COUNT(*) AS count FROM battle_awareness_runtime WHERE battle_id=$1", [battleId])).rows[0]?.count, 0);
    assert.ok(bound.narrationStyle?.compiledPolicyV2);
    const boundManifestJson = JSON.stringify(bound.assetManifest);
    const boundBattlefieldJson = JSON.stringify(bound.battlefield);
    const boundNarrationJson = JSON.stringify(bound.narrationStyle);
    const boundPrologueInstruction =
      bound.narrationStyle.compiledPolicyV2.phases.prologue.instruction;

    const mineGeneration = await characterAssetRepo.getReadyCharacterGeneration(mineId);
    const opponentGeneration = await characterAssetRepo
      .getReadyCharacterGeneration(opponentId);
    const fieldGeneration = await battlefieldAssetRepo
      .getReadyBattlefieldGeneration(battlefieldId);
    const styleGeneration = await narrationAssetRepo
      .getReadyNarrationStyleGeneration(narrationStyleId);
    assert.ok(mineGeneration);
    assert.ok(opponentGeneration);
    assert.ok(fieldGeneration);
    assert.ok(styleGeneration);
    assert.equal(
      bound.assetManifest.characters.a.generationId,
      mineGeneration.generationId,
    );
    assert.equal(
      bound.assetManifest.characters.b.generationId,
      opponentGeneration.generationId,
    );
    assert.equal(
      bound.assetManifest.battlefield.presetGenerationId,
      fieldGeneration.generationId,
    );
    assert.equal(
      bound.assetManifest.narrationStyle.generationId,
      styleGeneration.generationId,
    );
    assert.equal(
      bound.assetManifest.dialoguePipeline.activationSource,
      "persisted_setting",
    );
    assert.equal(
      bound.assetManifest.dialoguePipeline.overrideDeployment,
      undefined,
    );
    assert.equal(
      bound.assetManifest.dialoguePipeline.snapshot.contextProjectionMode,
      "compact",
    );
    assert.equal(bound.assetManifest.dialoguePipeline.snapshot.revision, 1);

    const revisedCharacter = await characterAssetRepo.activateCharacterPortraitRevision({
      characterId: mineId,
      ownerUserId: ownerId,
      expectedGenerationId: mineGeneration.generationId,
      operationId: "asset-integration-character-revision",
      mediaId: "/api/media/characters/asset-integration-new.jpg",
      mediaRevisionId: "asset-integration-character-revision-2",
      sourceDigest: "a".repeat(64),
    });
    const revisedField = await battlefieldAssetRepo.activateBattlefieldImageRevision({
      battlefieldId,
      ownerUserId: ownerId,
      expectedGenerationId: fieldGeneration.generationId,
      operationId: "asset-integration-field-revision",
      mediaId: "/api/media/battlefields/asset-integration-new.jpg",
      mediaRevisionId: "asset-integration-field-revision-2",
    });
    const revisedStyleValue: NarrationStyle = {
      ...narrationStyle(),
      displayName: "統合改訂後語り",
      instruction: "REVISED_STYLE_SECRET: 改訂後の長文で語る。",
      updatedAt: "2026-08-14T01:00:00.000Z",
    };
    const revisedStyle = await narrationAssetRepo.activateImportedNarrationStyle({
      style: revisedStyleValue,
      envelope: buildImportedNarrationStyleEnvelopeV2({
        style: revisedStyleValue,
        attemptId: "asset-integration-style-revision-v2",
      }),
    });
    assert.notEqual(revisedCharacter.generation.generationId, mineGeneration.generationId);
    assert.notEqual(revisedField.generation.generationId, fieldGeneration.generationId);
    assert.notEqual(revisedStyle.generationId, styleGeneration.generationId);

    const afterRevisions = await battleRepo.getBattle(battleId);
    assert.equal(JSON.stringify(afterRevisions?.assetManifest), boundManifestJson);
    assert.equal(JSON.stringify(afterRevisions?.battlefield), boundBattlefieldJson);
    assert.equal(JSON.stringify(afterRevisions?.narrationStyle), boundNarrationJson);

    assert.ok(await characterRepo.softDeleteCharacter(mineId, ownerId));
    assert.equal(await battlefieldRepo.deletePreset(battlefieldId, ownerId), true);
    assert.equal(
      await narrationRepo.deleteUserNarrationStyle(narrationStyleId, ownerId),
      true,
    );

    const readAfterDeletion = await app.request(`/api/battles/${battleId}`, {
      headers: authHeaders,
    });
    assert.equal(readAfterDeletion.status, 200);
    const rawReadAfterDeletion: unknown = await readAfterDeletion.json();
    z.object({ battle: BattlePublicSchema.passthrough() }).parse(rawReadAfterDeletion);
    const wireBattleResponse = z.object({ battle: z.unknown() });
    assert.deepEqual(
      wireBattleResponse.parse(rawReadAfterDeletion).battle,
      wireBattleResponse.parse(rawCreateBody).battle,
    );

    const history = await app.request(
      "/api/battles?q=統合固定戦場&status=all",
      { headers: authHeaders },
    );
    assert.equal(history.status, 200);
    const historyBody = z.object({ battles: z.array(z.object({ id: z.string() })) }).parse(await history.json());
    assert.equal(historyBody.battles.some((item) => item.id === battleId), true);

    const advanceRequest = {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "asset-integration-advance-001",
      },
      body: JSON.stringify({}),
    };
    const advance = await app.request(`/api/battles/${battleId}/advance`, advanceRequest);
    assert.equal(advance.status, 200);
    const advanceBody = await advance.json();
    const replay = await app.request(`/api/battles/${battleId}/advance`, advanceRequest);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), advanceBody);

    const advanced = await battleRepo.getBattle(battleId);
    assert.equal(JSON.stringify(advanced?.assetManifest), boundManifestJson);
    const prologueReceipt = advanced?.phaseReceipts?.find(
      (receipt) => receipt.phase === "prologue",
    );
    const frozenInput = prologueReceipt?.narrationInput;
    assert.ok(frozenInput && "kind" in frozenInput);
    assert.equal(frozenInput.kind, "awareness-v5");
    assert.equal(frozenInput.system.includes(boundPrologueInstruction), true);
    assert.equal(JSON.stringify(frozenInput).includes("REVISED_STYLE_SECRET"), false);

    assert.equal(
      (await idsFrom(await app.request(
        "/api/characters?selectable=true&q=統合自キャラ",
        { headers: authHeaders },
      ), "characters")).has(mineId),
      false,
    );
    assert.equal(
      (await idsFrom(await app.request(
        "/api/battlefields?selectable=true&q=統合固定戦場",
        { headers: authHeaders },
      ), "battlefields")).has(battlefieldId),
      false,
    );
    assert.equal(
      (await idsFrom(await app.request(
        "/api/narration-styles?selectable=true",
        { headers: authHeaders },
      ), "styles")).has(narrationStyleId),
      false,
    );

    const internalObservation = await app.request(
      `/api/internal/observations/${battleId}`,
      { headers: authHeaders },
    );
    assert.equal(internalObservation.status, 404);
    const developerObservation = await app.request(
      `/api/internal/observations/${battleId}`,
      { headers: developerHeaders },
    );
    assert.equal(developerObservation.status, 200);
    const observationBody = z.object({ canonicalCurrent: z.object({ assetManifest: z.unknown() }), rawBattleState: z.object({ agentStateA: z.unknown(), phaseReceipts: z.array(z.object({ narrationInput: z.unknown() })) }) }).parse(await developerObservation.json());
    assert.equal(
      JSON.stringify(observationBody.canonicalCurrent.assetManifest),
      boundManifestJson,
    );
    assert.equal(observationBody.rawBattleState.agentStateA, "[redacted]");
    assert.equal(
      observationBody.rawBattleState.phaseReceipts[0]?.narrationInput,
      "[redacted]",
    );
    const rawExport = await app.request("/api/assets/export", {
      headers: authHeaders,
    });
    assert.equal(rawExport.status, 404);
  });

  it("freezes legacy character rows without appending V1 generations", async () => {
    const legacy = character({
      id: "asset-integration-legacy-character",
      ownerUserId: ownerId,
      displayName: "統合未更新キャラ",
    });
    await query(
      `INSERT INTO characters
        (id, owner_user_id, sheet_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        legacy.id,
        legacy.ownerUserId,
        JSON.stringify(legacy),
        legacy.createdAt,
        legacy.updatedAt,
      ],
    );

    await assert.rejects(
      () => characterRepo.updateCharacterVisibility(legacy.id, ownerId, "private"),
      /CHARACTER_V3_UPDATE_REQUIRED/,
    );
    await assert.rejects(
      () => characterRepo.softDeleteCharacter(legacy.id, ownerId),
      /CHARACTER_V3_UPDATE_REQUIRED/,
    );
    const generations = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM asset_generations
        WHERE asset_type = 'character' AND asset_id = $1`,
      [legacy.id],
    );
    assert.equal(Number(generations.rows[0]?.count ?? 0), 0);
    assert.equal(
      (await characterAssetRepo.getCharacterCompatibility(legacy.id)).status,
      "unsupported",
    );
  });
});
