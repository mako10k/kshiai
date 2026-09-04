import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  CHARACTER_FOCUS_POLICY_V1,
  defaultParameters,
  type CharacterSheet,
} from "@kshiai/shared";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-create-idempotency-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "create.db");
process.env.CHARACTER_FOCUS_SHADOW_MODE = "shadow";

const { closeDatabase, query } = await import("../db.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const { ensureSystemNarrationStyles } = await import(
  "../repositories/narration-styles.js"
);
const { startBattle } = await import("./battle-service.js");
const characterRepo = await import("../repositories/characters.js");
const assetGenerationRepo = await import("../repositories/asset-generations.js");
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
      await characterRepo.saveSheet(character);
    }
    await ensureSystemNarrationStyles();
    const provider = new MockLlmProvider();
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
    const storedState = JSON.parse(stored.rows[0]!.state_json) as {
      assetManifest?: {
        rules?: { characterFocus?: string };
        dialoguePipeline?: {
          generationId?: string;
          contentDigest?: string;
          activationSource?: string;
          overrideDeployment?: unknown;
          snapshot?: {
            contextProjectionMode?: string;
            revision?: number;
          };
        };
        characters?: {
          a?: {
            generationId?: string;
            compilerInputsV2?: {
              psycheTraits?: { adverseSensitivity?: number };
              deepPsyche?: unknown;
              consciousSelf?: unknown;
              narratorViews?: {
                external?: { access?: string };
                selfInner?: { access?: string };
                omniscient?: { access?: string };
              };
            };
          };
        };
      };
    };
    assert.equal(
      storedState.assetManifest?.rules?.characterFocus,
      CHARACTER_FOCUS_POLICY_V1,
    );
    assert.equal(
      storedState.assetManifest?.dialoguePipeline?.activationSource,
      "default",
    );
    assert.equal(
      storedState.assetManifest?.dialoguePipeline?.overrideDeployment,
      undefined,
    );
    assert.equal(
      storedState.assetManifest?.dialoguePipeline?.snapshot
        ?.contextProjectionMode,
      "legacy",
    );
    assert.equal(
      storedState.assetManifest?.dialoguePipeline?.snapshot?.revision,
      0,
    );
    assert.match(
      storedState.assetManifest?.dialoguePipeline?.generationId ?? "",
      /^dialogue-pipeline:global:g1:/,
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
      /^character:create-a:g1:/,
    );
    assert.equal(
      storedState.assetManifest?.characters?.a?.compilerInputsV2
        ?.psycheTraits?.adverseSensitivity,
      500,
    );
    assert.ok(storedState.assetManifest?.characters?.a?.compilerInputsV2?.deepPsyche);
    assert.ok(storedState.assetManifest?.characters?.a?.compilerInputsV2?.consciousSelf);
    assert.equal(
      storedState.assetManifest?.characters?.a?.compilerInputsV2?.narratorViews
        ?.external?.access,
      "external",
    );
    assert.equal(
      storedState.assetManifest?.characters?.a?.compilerInputsV2?.narratorViews
        ?.selfInner?.access,
      "self_inner",
    );
    assert.equal(
      storedState.assetManifest?.characters?.a?.compilerInputsV2?.narratorViews
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
          expectedRevision: 0,
          enabled: true,
          conversationHistoryLimit: 12,
          contextProjectionMode: "compact",
          recentExchangeLimit: 4,
          relevantMemoryLimit: 1,
          psychologyGuidance: "保存された compact 設定を新規バトルにだけ適用する。",
        },
      });
    assert.equal(savedSettings?.revision, 1);
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
    const persistedState = JSON.parse(
      persistedStored.rows[0]!.state_json,
    ) as typeof storedState;
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
      1,
    );
    const originalAfterSettingsChange = await query<{ state_json: string }>(
      "SELECT state_json FROM battles WHERE id = $1",
      [input.battleId],
    );
    const originalStateAfterSettingsChange = JSON.parse(
      originalAfterSettingsChange.rows[0]!.state_json,
    ) as typeof storedState;
    assert.equal(
      JSON.stringify(
        originalStateAfterSettingsChange.assetManifest?.dialoguePipeline,
      ),
      originalDialogueBinding,
    );

    const exhaustedProvider = new MockLlmProvider();
    exhaustedProvider.prepareBattleEncounter = async () => {
      throw new Error("PROVIDER_OPERATION_CEILING_EXHAUSTED");
    };
    const exhaustedBattleId = "btl_provider_ceiling_fixture";
    await assert.rejects(
      startBattle({
        ...input,
        battleId: exhaustedBattleId,
        llm: exhaustedProvider,
      }),
      /PROVIDER_OPERATION_CEILING_EXHAUSTED/,
    );
    const exhaustedCount = await query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM battles WHERE id = $1",
      [exhaustedBattleId],
    );
    assert.equal(Number(exhaustedCount.rows[0]?.count), 0);
  });
});
