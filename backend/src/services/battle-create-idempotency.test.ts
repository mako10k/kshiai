import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  CHARACTER_FOCUS_POLICY_V1,
  BattleStateSchema,
  defaultParameters,
  defaultBasicAttack,
  type CharacterSheet,
} from "@kshiai/shared";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-create-idempotency-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "create.db");
process.env.CHARACTER_FOCUS_SHADOW_MODE = "shadow";

const { saveHistoricalCharacterFixture } = await import("../testing/historical-character-fixtures.js");
const { closeDatabase, query } = await import("../db.js");
const { createOfflineAwarenessProvider } = await import("../testing/offline-awareness-provider.js");
const { buildV3CharacterEnvelopeFixture } = await import("../testing/v3-character-envelope-fixture.js");
const { createConsciousFixture } = await import("./conscious-agency.fixtures.js");
const { createFallbackLlmProvider } = await import("../llm/fallback.js");
const { ensureSystemNarrationStyles } = await import(
  "../repositories/narration-styles.js"
);
const { startBattle } = await import("./battle-service.js");
const assetGenerationRepo = await import("../testing/historical-asset-generations.js");
const dialoguePipelineRepo = await import(
  "../repositories/dialogue-pipeline-settings.js"
);

function sheet(id: string, displayName: string): CharacterSheet {
  const now = "2026-08-12T00:00:00.000Z";
  return {
    id,
    ownerUserId: "create-owner",
    displayName,
    tags: [],
    createdAt: now,
    updatedAt: now,
    appearance: { summary: displayName, visualPrompt: "test" },
    traits: [],
    parameters: defaultParameters(),
    basicAttack: defaultBasicAttack(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "test",
  };
}

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("battle create idempotency", () => {
  it("reads back one deterministic battle without repeating encounter LLM work", async () => {
    const now = "2026-08-12T00:00:00.000Z";
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      ["create-owner", "create-owner", "hash", now],
    );
    const sideA = sheet("create-a", "A");
    const sideB = sheet("create-b", "B");
    for (const character of [sideA, sideB]) {
      await saveHistoricalCharacterFixture(character);
      await assetGenerationRepo.createAssetGeneration({ assetType: "character", assetId: character.id,
        schemaVersion: 3, content: buildV3CharacterEnvelopeFixture(character) });
    }
    await ensureSystemNarrationStyles();
    const readySettings = await dialoguePipelineRepo.updateDialoguePipelineSettings({
      userId: "create-owner", patch: { ...createConsciousFixture().settings, schemaVersion: 3, expectedRevision: 0 },
    });
    assert.equal(readySettings?.revision, 1);
    const provider = createOfflineAwarenessProvider();
    const original = provider.prepareBattleEncounter.bind(provider);
    let encounterCalls = 0;
    provider.prepareBattleEncounter = async (input) => {
      encounterCalls += 1;
      return original(input);
    };
    const input = {
      userId: "create-owner",
      battleId: "btl_deterministic_create_fixture",
      myCharacterId: sideA.id,
      opponentCharacterId: sideB.id,
      battlefieldMode: "random" as const,
      llm: provider,
    };

    const first = await startBattle(input);
    const replay = await startBattle(input);
    assert.equal(first.id, input.battleId);
    assert.equal(replay.id, first.id);
    assert.equal(encounterCalls, 1);
    const count = await query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM battles WHERE id = $1",
      [input.battleId],
    );
    assert.equal(Number(count.rows[0]?.count), 1);
    const stored = await query<{ state_json: string }>(
      "SELECT state_json FROM battles WHERE id = $1",
      [input.battleId],
    );
    const storedState = BattleStateSchema.parse(JSON.parse(stored.rows[0]!.state_json));
    assert.equal(storedState.assetManifest?.schemaVersion, 5);
    assert.ok(storedState.assetManifest?.schemaVersion === 5);
    assert.equal(
      storedState.assetManifest?.rules?.characterFocus,
      CHARACTER_FOCUS_POLICY_V1,
    );
    assert.deepEqual(storedState.encounterContext?.sourceReceipt, {
      source: "provider",
      failureReason: null,
      providerRoutes: [],
    });
    assert.equal(
      storedState.assetManifest?.dialoguePipeline?.activationSource,
      "persisted_setting",
    );
    assert.equal(
      storedState.assetManifest?.dialoguePipeline?.overrideDeployment,
      undefined,
    );
    assert.equal(
      storedState.assetManifest?.dialoguePipeline?.snapshot
        ?.contextProjectionMode,
      "compact",
    );
    assert.equal(
      storedState.assetManifest?.dialoguePipeline?.snapshot?.revision,
      1,
    );
    assert.match(
      storedState.assetManifest?.dialoguePipeline?.generationId ?? "",
      /^dialogue-pipeline:global:g[1-9][0-9]*:/,
    );
    assert.match(
      storedState.assetManifest?.dialoguePipeline?.contentDigest ?? "",
      /^[a-f0-9]{64}$/,
    );
    const boundDialogueGeneration = await assetGenerationRepo
      .getAssetGeneration(
        storedState.assetManifest?.dialoguePipeline?.generationId ?? "",
      );
    assert.equal(
      boundDialogueGeneration?.contentDigest,
      storedState.assetManifest?.dialoguePipeline?.contentDigest,
    );
    assert.deepEqual(
      boundDialogueGeneration?.content,
      storedState.assetManifest?.dialoguePipeline?.snapshot,
    );
    assert.match(
      storedState.assetManifest?.characters?.a?.generationId ?? "",
      /^character:create-a:g2:/,
    );
    assert.equal(
      storedState.assetManifest?.characters?.a?.compilerInputsV4
        ?.psycheTraits?.adverseSensitivity,
      500,
    );
    assert.equal("deepPsyche" in storedState.assetManifest.characters.a.compilerInputsV4, false);
    assert.ok(storedState.assetManifest?.characters?.a?.compilerInputsV4?.consciousSelf);
    assert.equal(
      storedState.assetManifest?.characters?.a?.compilerInputsV4?.narratorViews
        ?.external?.access,
      "external",
    );
    assert.equal(
      storedState.assetManifest?.characters?.a?.compilerInputsV4?.narratorViews
        ?.selfInner?.access,
      "self_inner",
    );
    assert.equal(
      storedState.assetManifest?.characters?.a?.compilerInputsV4?.narratorViews
        ?.omniscient?.access,
      "omniscient",
    );

    const originalDialogueBinding = JSON.stringify(
      storedState.assetManifest?.dialoguePipeline,
    );
    const savedSettings = await dialoguePipelineRepo
      .updateDialoguePipelineSettings({
        userId: "create-owner",
        patch: {
          expectedRevision: 1,
          enabled: true,
          conversationHistoryLimit: 12,
          contextProjectionMode: "compact",
          recentExchangeLimit: 4,
          relevantMemoryLimit: 1,
          psychologyGuidance: "保存された compact 設定を新規バトルにだけ適用する。",
        },
      });
    assert.equal(savedSettings?.revision, 2);
    const persistedBattleId = "btl_persisted_dialogue_fixture";
    await startBattle({
      ...input,
      battleId: persistedBattleId,
    });
    assert.equal(encounterCalls, 2);
    const persistedStored = await query<{ state_json: string }>(
      "SELECT state_json FROM battles WHERE id = $1",
      [persistedBattleId],
    );
    const persistedState = BattleStateSchema.parse(JSON.parse(persistedStored.rows[0]!.state_json));
    assert.equal(
      persistedState.assetManifest?.dialoguePipeline?.activationSource,
      "persisted_setting",
    );
    assert.equal(
      persistedState.assetManifest?.dialoguePipeline?.snapshot
        ?.contextProjectionMode,
      "compact",
    );
    assert.equal(
      persistedState.assetManifest?.dialoguePipeline?.snapshot?.revision,
      2,
    );
    const originalAfterSettingsChange = await query<{ state_json: string }>(
      "SELECT state_json FROM battles WHERE id = $1",
      [input.battleId],
    );
    const originalStateAfterSettingsChange = BattleStateSchema.parse(JSON.parse(originalAfterSettingsChange.rows[0]!.state_json));
    assert.equal(
      JSON.stringify(
        originalStateAfterSettingsChange.assetManifest?.dialoguePipeline,
      ),
      originalDialogueBinding,
    );

    assert.ok(storedState.assetManifest.battlefield.assetId);
    const failureInput = { ...input, battlefieldMode: "preset" as const,
      battlefieldPresetId: storedState.assetManifest.battlefield.assetId };
    // Current awareness creation fails closed: no deterministic encounter or
    // automatic route fallback is accepted as a newly created canonical battle.
    for (const [suffix, failure] of [
      ["timeout", "timeout:prepareBattleEncounter:1000ms"],
      ["ceiling", "PROVIDER_OPERATION_CEILING_EXHAUSTED"],
    ]) {
      const failed = createOfflineAwarenessProvider({ encounter: async () => { throw new Error(failure); } });
      const battleId = `btl_creation_failure_${suffix}`;
      await assert.rejects(startBattle({ ...failureInput, battleId, llm: failed }), (error: unknown) =>
        error instanceof Error && error.message === failure);
      assert.equal(failed.encounterDispatches, 1);
      await assert.rejects(startBattle({ ...failureInput, battleId, llm: failed }), /AWARENESS_CREATION_FAILED/);
      assert.equal(failed.encounterDispatches, 1);
      const count = await query<{ count: number }>("SELECT COUNT(*) AS count FROM battles WHERE id = $1", [battleId]);
      assert.equal(Number(count.rows[0]?.count), 0);
    }
    const primary = createOfflineAwarenessProvider({ encounter: async () => { throw new Error("getaddrinfo ENOTFOUND"); } });
    const secondary = createOfflineAwarenessProvider();
    const routed = createFallbackLlmProvider([primary, secondary], 60_000);
    const routedId = "btl_encounter_route_rejected";
    await assert.rejects(startBattle({ ...input, battleId: routedId, llm: routed }), /getaddrinfo ENOTFOUND/);
    assert.equal(primary.encounterDispatches, 1);
    assert.equal(secondary.encounterDispatches, 0);
    const routedCount = await query<{ count: number }>("SELECT COUNT(*) AS count FROM battles WHERE id = $1", [routedId]);
    assert.equal(Number(routedCount.rows[0]?.count), 0);
  });
});
