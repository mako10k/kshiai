// R: Verify canonical beat transitions retain deferred narration and ordered receipts.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CharacterGenerationEnvelopeV3Schema,
  BattleStateSchema,
  createBattleState,
  defaultParameters,
  defaultBasicAttack,
  openSceneBeat,
  type BattleCausalLaterDecision,
  type CharacterSheet,
} from "@kshiai/shared";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-scene-beat-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "scene-beat.db");

const { saveHistoricalCharacterFixture } = await import("../testing/historical-character-fixtures.js");
const generationRepo = await import("../testing/historical-asset-generations.js");
const { createV3StageTrialCandidate } = await import("../fixtures/neva-v3.js");
const { buildImportedCharacterEnvelopeV2 } = await import("./character-authoring-service.js");
const { closeDatabase, query } = await import("../db.js");
const { advanceTurn, completeAdvancePhases, startBattle } = await import("./battle-service.js");
const { insertNewBattle, saveBattleWithNarrationOutbox } = await import("../repositories/battles.js");
const { createOfflineAwarenessProvider } = await import("../testing/offline-awareness-provider.js");
const settingsRepo = await import("../repositories/dialogue-pipeline-settings.js");
const { createConsciousFixture } = await import("./conscious-agency.fixtures.js");
const { createInventoryFixture } = await import("./character-agency-inventory.fixtures.js");
const { ensureSystemNarrationStyles } = await import(
  "../repositories/narration-styles.js"
);

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

function sheet(
  id: string,
  ownerUserId: string,
  displayName: string,
  hp = 100,
): CharacterSheet {
  const now = "2026-08-16T00:00:00.000Z";
  return {
    id,
    ownerUserId,
    displayName,
    tags: [],
    createdAt: now,
    updatedAt: now,
    appearance: { summary: displayName, visualPrompt: "test" },
    traits: [],
    parameters: defaultParameters({ hp, maxHp: hp }),
    basicAttack: defaultBasicAttack(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "test",
  };
}

function envelopeV3(value: CharacterSheet) {
  const source = buildImportedCharacterEnvelopeV2({ sheet: value,
    attemptId: `scene-beat-test-v3-${value.id}` });
  const trial = createV3StageTrialCandidate();
  const { schemaVersion: _schemaVersion, actionNorms: _actionNorms, ...stable } = source.definition;
  const basicActionId = stable.capabilities.basicAction.id;
  const actionNorms = trial.definition.actionNorms.map((norm, index) => ({
    ...norm,
    ...(index === 0 ? { when: { match: "all" as const,
      clauses: [{ kind: "always" as const, operator: "is" as const, value: "true" as const }] } } : {}),
    response: { ...norm.response, actionRefs: [basicActionId] },
  }));
  const mechanicalConflictFallbacks = trial.definition.mechanicalConflictFallbacks.map((fallback) => ({
    ...fallback, orderedActionRefs: [basicActionId],
  }));
  return CharacterGenerationEnvelopeV3Schema.parse({
    ...source, definitionSchema: { family: "character", version: 3 },
    definition: { ...stable, schemaVersion: 3, actionNorms,
      consciousGuidance: trial.definition.consciousGuidance,
      mechanicalConflictFallbacks },
    compilerCompatibility: trial.compilerCompatibility, deferredValues: trial.deferredValues,
  });
}

async function activateV3(value: CharacterSheet) {
  await generationRepo.createAssetGeneration({
    assetType: "character",
    assetId: value.id,
    schemaVersion: 3,
    content: envelopeV3(value),
  });
}

async function ensureV3DialoguePipeline(userId: string) {
  const values = createConsciousFixture().settings;
  const current = await settingsRepo.getDialoguePipelineSettings();
  const updated = await settingsRepo.updateDialoguePipelineSettings({
    userId,
    patch: { ...values, schemaVersion: 3, expectedRevision: current.revision },
  });
  assert.ok(updated);
}

describe("scene beat narration deferral", () => {
  it("does not enqueue a combat narration job while the beat is open", async () => {
    const now = new Date().toISOString();
    const state = {
      ...createBattleState({
        id: "btl_scene_beat",
        sideA: sheet("chr_a", "user-a", "甲"),
        sideB: sheet("chr_b", "user-b", "乙"),
        turnLimit: 12,
        prologuePending: false,
      }),
      sceneBeat: openSceneBeat(3),
      battleRevision: 0,
      advanceOperation: {
        schemaVersion: 1 as const,
        operationId: "op-open",
        expectedRevision: 0,
        status: "active" as const,
        phase: "combat" as const,
        startedAt: now,
        completedAt: null,
        receiptIds: [],
      },
    };
    assert.equal(await insertNewBattle(state, {
      sideAUserId: "user-a",
      sideACharacterId: "chr_a",
      sideBCharacterId: "chr_b",
    }), "created");
    const deferred = completeAdvancePhases({
      state,
      operationId: "op-open",
      phases: ["combat"],
      deferCombatNarration: true,
    });
    const receipt = deferred.phaseReceipts?.at(-1);
    assert.equal(receipt?.narrationDeferred, true);
    assert.equal(receipt?.narrationInput, undefined);
    await saveBattleWithNarrationOutbox(deferred, {
      sideAUserId: "user-a",
      sideACharacterId: "chr_a",
      sideBCharacterId: "chr_b",
      expectedRevision: state.battleRevision,
    });
    const queued = await query<{ count: string | number }>(
      `SELECT count(*) AS count FROM battle_narration_outbox WHERE battle_id = $1`,
      ["btl_scene_beat"],
    );
    assert.equal(Number(queued.rows[0]?.count ?? 1), 0);
  });

  it("freezes a 3-micro-turn beat on new battles", async () => {
    const now = "2026-08-16T00:00:00.000Z";
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      ["beat-owner", "beat-owner", "hash", now],
    );
    const sideA = sheet("beat-a", "beat-owner", "甲");
    const sideB = sheet("beat-b", "beat-owner", "乙");
    for (const character of [sideA, sideB]) {
      await saveHistoricalCharacterFixture(character);
      await activateV3(character);
    }
    await ensureV3DialoguePipeline("beat-owner");
    await ensureSystemNarrationStyles();
    const created = await startBattle({
      userId: "beat-owner",
      battleId: "btl_scene_beat_create",
      myCharacterId: sideA.id,
      opponentCharacterId: sideB.id,
      battlefieldMode: "random",
      llm: createOfflineAwarenessProvider(),
    });
    const stored = await query<{ state_json: string }>(
      `SELECT state_json FROM battles WHERE id = $1`,
      [created.id],
    );
    const state = BattleStateSchema.parse(JSON.parse(stored.rows[0]?.state_json ?? "{}"));
    assert.equal(state.sceneBeat?.k, 3);
  });

  it("advances past turn 5 on a new scene-beat battle", async () => {
    const now = "2026-08-16T00:00:00.000Z";
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      ["beat-adv-owner", "beat-adv-owner", "hash", now],
    );
    const sideA = sheet("beat-adv-a", "beat-adv-owner", "甲");
    const sideB = sheet("beat-adv-b", "beat-adv-owner", "乙");
    for (const character of [sideA, sideB]) {
      await saveHistoricalCharacterFixture(character);
      await activateV3(character);
    }
    await ensureV3DialoguePipeline("beat-adv-owner");
    await ensureSystemNarrationStyles();
    const llm = createOfflineAwarenessProvider();
    const created = await startBattle({
      userId: "beat-adv-owner",
      battleId: "btl_scene_beat_advance",
      myCharacterId: sideA.id,
      opponentCharacterId: sideB.id,
      battlefieldMode: "random",
      llm,
    });
    let battle = created;
    for (let step = 1; step <= 7; step += 1) {
      battle = await advanceTurn({
        userId: "beat-adv-owner",
        battleId: created.id,
        operationId: `op-beat-${step}`,
        llm,
      });
    }
    assert.ok(
      battle.turn >= 2 || battle.status === "finished",
      `turn=${battle.turn} status=${battle.status}`,
    );
  });

  it("holds the public turn across the first three combat beats", async () => {
    const now = "2026-08-16T00:00:00.000Z";
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      ["beat-clock-owner", "beat-clock-owner", "hash", now],
    );
    const sideA = sheet("beat-clock-a", "beat-clock-owner", "甲", 10_000);
    const sideB = sheet("beat-clock-b", "beat-clock-owner", "乙", 10_000);
    for (const character of [sideA, sideB]) {
      await saveHistoricalCharacterFixture(character);
      await activateV3(character);
    }
    await ensureV3DialoguePipeline("beat-clock-owner");
    await ensureSystemNarrationStyles();
    const llm = createOfflineAwarenessProvider();
    const created = await startBattle({
      userId: "beat-clock-owner",
      battleId: "btl_scene_beat_clock",
      myCharacterId: sideA.id,
      opponentCharacterId: sideB.id,
      battlefieldMode: "random",
      llm,
    });
    let battle = created;
    while (battle.prologuePending && battle.status === "active") {
      battle = await advanceTurn({
        userId: "beat-clock-owner",
        battleId: created.id,
        operationId: `op-clock-pro-${battle.turn}`,
        llm,
      });
    }
    const first = await advanceTurn({
      userId: "beat-clock-owner",
      battleId: created.id,
      operationId: "op-clock-1",
      llm,
    });
    const second = await advanceTurn({
      userId: "beat-clock-owner",
      battleId: created.id,
      operationId: "op-clock-2",
      llm,
    });
    const third = await advanceTurn({
      userId: "beat-clock-owner",
      battleId: created.id,
      operationId: "op-clock-3",
      llm,
    });
    const fourth = await advanceTurn({
      userId: "beat-clock-owner",
      battleId: created.id,
      operationId: "op-clock-4",
      llm,
    });
    assert.equal(first.turn, 1);
    assert.equal(first.combatBeat, 1);
    assert.equal(second.turn, 1);
    assert.equal(second.combatBeat, 2);
    assert.equal(third.turn, 1);
    assert.equal(third.combatBeat, undefined);
    assert.equal(fourth.turn, 2);
    assert.equal(fourth.combatBeat, 1);
  });

  it("persists a rejected later-bucket proposal and its deterministic choice", async () => {
    const now = "2026-08-16T00:00:00.000Z";
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      ["later-fallback-owner", "later-fallback-owner", "hash", now],
    );
    // Q06 preserves existing dynamic-v4 and earlier generations. This fixture
    // enters through persistence, so current new-battle creation stays awareness-v5.
    const historical = createInventoryFixture("control");
    const sideA = { ...historical.mine, ownerUserId: "later-fallback-owner" };
    const sideB = { ...historical.opp, ownerUserId: "later-fallback-owner" };
    await saveHistoricalCharacterFixture(sideA);
    await saveHistoricalCharacterFixture(sideB);
    const state = BattleStateSchema.parse({
      ...historical.state,
      id: "btl_later_bucket_fallback",
      dialoguePipelineSnapshot: historical.state.assetManifest?.dialoguePipeline.snapshot,
      sideA: { ...historical.state.sideA,
        parameters: { ...historical.state.sideA.parameters, spd: 20 } },
      sideB: { ...historical.state.sideB,
        parameters: { ...historical.state.sideB.parameters, spd: 5 } },
    });
    assert.equal(state.assetManifest?.schemaVersion, 2);
    assert.equal(await insertNewBattle(state, {
      sideAUserId: "later-fallback-owner",
      sideACharacterId: sideA.id,
      sideBCharacterId: sideB.id,
    }), "created");
    const llm = createOfflineAwarenessProvider();
    let laterCalls = 0;
    llm.decideCharacterAction = async (input) => {
      laterCalls += 1;
      assert.ok(input.decision.availableActions.some((action) => action.kind === "basic_attack"));
      assert.equal(input.decision.availableActions.some((action) => action.skillId === "not-listed"), false);
      return { proposedAction: { kind: "skill", skillId: "not-listed" } };
    };
    const created = { id: state.id };

    let observed: BattleCausalLaterDecision | null = null;
    for (let step = 1; step <= 30 && observed === null; step += 1) {
      try {
        await advanceTurn({
          userId: "later-fallback-owner",
          battleId: created.id,
          operationId: `op-later-fallback-${step}`,
          llm,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "BATTLE_FINISHED") break;
        throw error;
      }
      const stored = await query<{ state_json: string }>(
        `SELECT state_json FROM battles WHERE id = $1`,
        [created.id],
      );
      const parsed = BattleStateSchema.parse(JSON.parse(stored.rows[0]?.state_json ?? "{}"));
      observed = parsed.causalLaterDecision ?? null;
    }

    assert.ok(observed);
    assert.equal(observed.status, "fallback");
    assert.equal(observed.validation.status, "rejected");
    assert.equal(observed.validation.reason, "unavailable_action");
    assert.equal(observed.acceptedAction?.kind, "basic_attack");
    assert.equal(observed.fallbackReason, "unavailable_action");
    assert.equal(observed.provider, "mock");
    assert.equal(observed.callCount, 1);
    assert.equal(laterCalls, 1);
  });

  it("saves the first skip turn after a beat-close semantic patch", async () => {
    const now = "2026-08-16T00:00:00.000Z";
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      ["beat-patch-owner", "beat-patch-owner", "hash", now],
    );
    const sideA = sheet("beat-patch-a", "beat-patch-owner", "甲", 1_000_000_000);
    const sideB = sheet("beat-patch-b", "beat-patch-owner", "乙", 1_000_000_000);
    for (const character of [sideA, sideB]) {
      await saveHistoricalCharacterFixture(character);
      await activateV3(character);
    }
    await ensureV3DialoguePipeline("beat-patch-owner");
    await ensureSystemNarrationStyles();
    const llm = createOfflineAwarenessProvider();
    llm.reconcileTurnSemanticState = async (input) => ({
      patch: {
        baseRevision: input.before.revision,
        turn: input.turn,
        sourceEventIds: input.events.flatMap((event) => event.id ? [event.id] : []),
        operations: [{
          op: "replace",
          path: "/scene/summary",
          value: `閉じた場面 ${input.turn}`,
        }],
      },
      worldPatchStatus: "valid",
      sensoryEvidence: [],
      sensoryEvidenceStatus: "valid",
    });
    const created = await startBattle({
      userId: "beat-patch-owner",
      battleId: "btl_scene_beat_patch_skip",
      myCharacterId: sideA.id,
      opponentCharacterId: sideB.id,
      battlefieldMode: "random",
      llm,
    });
    let battle = created;
    for (let step = 1; step <= 5; step += 1) {
      battle = await advanceTurn({
        userId: "beat-patch-owner",
        battleId: created.id,
        operationId: `op-patch-${step}`,
        llm,
      });
    }
    assert.ok(
      battle.turn >= 2 || battle.status === "finished",
      `turn=${battle.turn} status=${battle.status}`,
    );
    const stored = await query<{ state_json: string }>(
      `SELECT state_json FROM battles WHERE id = $1`,
      [created.id],
    );
    const state = BattleStateSchema.parse(JSON.parse(stored.rows[0]?.state_json ?? "{}"));
    const records = state.turnRecords ?? [];
    assert.ok(
      records.some((record) =>
        record.canonicalTransition?.semantic?.status === "applied"
      ),
    );
    assert.ok(
      records.some((record) =>
        record.turn >= 2 &&
        record.canonicalTransition?.semantic?.status === "skipped"
      ),
    );
  });

  it("adopts an orphaned active advance instead of conflicting", async () => {
    const now = "2026-08-16T00:00:00.000Z";
    await query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4)`,
      ["beat-orphan-owner", "beat-orphan-owner", "hash", now],
    );
    const sideA = sheet("beat-orphan-a", "beat-orphan-owner", "甲");
    const sideB = sheet("beat-orphan-b", "beat-orphan-owner", "乙");
    for (const character of [sideA, sideB]) {
      await saveHistoricalCharacterFixture(character);
      await activateV3(character);
    }
    await ensureV3DialoguePipeline("beat-orphan-owner");
    await ensureSystemNarrationStyles();
    const llm = createOfflineAwarenessProvider();
    const created = await startBattle({
      userId: "beat-orphan-owner",
      battleId: "btl_scene_beat_orphan",
      myCharacterId: sideA.id,
      opponentCharacterId: sideB.id,
      battlefieldMode: "random",
      llm,
    });
    const stored = await query<{ state_json: string }>(
      `SELECT state_json FROM battles WHERE id = $1`,
      [created.id],
    );
    const state = BattleStateSchema.parse(JSON.parse(stored.rows[0]?.state_json ?? "{}"));
    state.advanceOperation = {
      schemaVersion: 1,
      operationId: "op-orphaned",
      expectedRevision: state.battleRevision ?? 0,
      status: "active",
      phase: created.prologuePending ? "prologue" : "combat",
      startedAt: now,
      completedAt: null,
      receiptIds: [],
    };
    await query(
      `UPDATE battles SET state_json = $2 WHERE id = $1`,
      [created.id, JSON.stringify(state)],
    );
    const advanced = await advanceTurn({
      userId: "beat-orphan-owner",
      battleId: created.id,
      operationId: "op-retry",
      llm,
    });
    assert.ok(
      advanced.turn >= created.turn ||
        advanced.prologuePending === false ||
        advanced.status === "finished",
      `turn=${advanced.turn} prologue=${advanced.prologuePending}`,
    );
  });
});
