// R: Verify V3 generation binding across real SQLite battle operations.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CharacterGenerationEnvelopeV3Schema,
  BattleAssetManifestV4Schema,
  CharacterActionNormProgramV3Schema,
  type BattleState,
  resolveTurn,
  resolveNextBattleTurnBucket,
  prepareSequentialBattleTurnInitiative,
  materializeBattleStateAtBucketBoundary,
  type CharacterSheet,
} from "@kshiai/shared";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-v3-battle-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "v3-battle.db");

const { saveHistoricalCharacterFixture } = await import("../testing/historical-character-fixtures.js");
const { closeDatabase, query, withTransaction } = await import("../db.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const generationRepo = await import("../testing/historical-asset-generations.js");
const settingsRepo = await import("../repositories/dialogue-pipeline-settings.js");
const { ensureSystemNarrationStyles } = await import("../repositories/narration-styles.js");
const { createConsciousFixture } = await import("./conscious-agency.fixtures.js");
const { startBattle, advanceTurn, applyReflectMemoryWrites, advanceCharacterAgents } = await import("./battle-service.js");
const { buildRoutes } = await import("../routes.js");
const { assertConsciousBinding } = await import("../llm/conscious-agency.js");
const { processNextNarration, createLlmNarrationGenerator } = await import("./narration-worker.js");
const { getBattle } = await import("../repositories/battles.js");
const { buildImportedCharacterEnvelopeV2 } = await import("./character-authoring-service.js");

function envelopeV3(sheet: CharacterSheet) {
  const source = buildImportedCharacterEnvelopeV2({
    sheet,
    attemptId: `v3-battle-${sheet.id}`,
  });
  const { schemaVersion: _schemaVersion, actionNorms: _actionNorms, ...stable } =
    source.definition;
  return CharacterGenerationEnvelopeV3Schema.parse({
    ...source,
    definitionSchema: { family: "character", version: 3 },
    definition: {
      ...stable,
      schemaVersion: 3,
      actionNorms: [],
      consciousGuidance: [],
      mechanicalConflictFallbacks: [],
    },
    compilerCompatibility: [
      { consumer: "character-profile", version: 2 },
      { consumer: "battle-mechanics", version: 3 },
      { consumer: "psyche-trait-profile", version: 1 },
      { consumer: "character-conscious-self", version: 3 },
      { consumer: "character-action-norms", version: 3 },
      { consumer: "character-mechanical-conflict-fallback", version: 1 },
      { consumer: "character-relationship", version: 2 },
    ],
    deferredValues: { contractVersion: 1, values: [] },
  });
}

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("ADR-0039 V3 character battle binding", () => {
  it("creates an all-V3 battle and keeps exact character generations after pointer changes and reload", async () => {
    const fixture = createConsciousFixture();
    fixture.opp.visibility = "public";
    await query(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ($1, $2, $3, $4)",
      ["inventory-owner", "v3-battle-owner", "test", new Date().toISOString()],
    );
    await saveHistoricalCharacterFixture(fixture.mine);
    await saveHistoricalCharacterFixture(fixture.opp);
    const previousA = await generationRepo.getCurrentAssetGeneration("character", fixture.mine.id);
    const previousB = await generationRepo.getCurrentAssetGeneration("character", fixture.opp.id);
    assert.ok(previousA);
    assert.ok(previousB);

    const v3A = await generationRepo.createAssetGeneration({
      assetType: "character",
      assetId: fixture.mine.id,
      schemaVersion: 3,
      content: envelopeV3(fixture.mine),
    });
    const v3B = await generationRepo.createAssetGeneration({
      assetType: "character",
      assetId: fixture.opp.id,
      schemaVersion: 3,
      content: envelopeV3(fixture.opp),
    });
    assert.equal(
      (await generationRepo.getCurrentAssetGeneration("character", fixture.mine.id))?.generationId,
      v3A.generationId,
    );
    assert.equal(
      (await generationRepo.getCurrentAssetGeneration("character", fixture.opp.id))?.generationId,
      v3B.generationId,
    );
    await ensureSystemNarrationStyles();
    await settingsRepo.updateDialoguePipelineSettings({
      userId: "inventory-owner",
      patch: { ...fixture.settings, schemaVersion: 3, expectedRevision: 0 },
    });

    const llm = new MockLlmProvider();
    llm.advanceCharacterPsyche = async () => { throw new Error("Unexpected V4 psyche call"); };
    let consciousCalls = 0;
    const originalAgent = llm.advanceCharacterAgent.bind(llm);
    llm.advanceCharacterAgent = async (input) => {
      assert.equal(input.contextMode, "compact");
      assert.equal(input.contractVersion, 3);
      consciousCalls += 1;
      return originalAgent(input);
    };
    const created = await startBattle({
      userId: "inventory-owner",
      battleId: "v3-battle-bound",
      myCharacterId: fixture.mine.id,
      opponentCharacterId: fixture.opp.id,
      battlefieldMode: "random",
      llm,
    });
    const bound = await getBattle(created.id);
    assert.equal(bound?.assetManifest?.schemaVersion, 4);
    assert.equal(bound.assetManifest.characters.a.generationId, v3A.generationId);
    assert.equal(bound.assetManifest.characters.b.generationId, v3B.generationId);
    assert.equal(bound.assetManifest.characters.a.contentDigest, v3A.contentDigest);
    assert.equal(bound.assetManifest.characters.b.contentDigest, v3B.contentDigest);
    assert.equal(bound.assetManifest.characters.a.basicAttackSource.kind, "character_generation_v3");
    assert.equal(bound.assetManifest.characters.b.basicAttackSource.kind, "character_generation_v3");

    await query("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
      ["ses_v4_binding", "inventory-owner", new Date().toISOString(), "2099-01-01T00:00:00.000Z"]);
    const app = buildRoutes({ llm });
    const headers = { Cookie: "kshiai_session=ses_v4_binding" };
    const own = await app.request("/api/characters?selectable=true&limit=1", { headers });
    assert.equal(own.status, 200);
    const ownBody = await own.json();
    assert.equal(ownBody.total, 1);
    assert.equal(ownBody.characters.length, 1);
    for (const endpoint of ["random", "auto"]) {
      const response = await app.request(`/api/match/${endpoint}`, { method: "POST",
        headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({myCharacterId: fixture.mine.id}) });
      assert.equal(response.status, 200, await response.text());
    }

    await withTransaction(async (connection) => {
      await generationRepo.activateAssetGeneration(connection, previousA, v3A.generationId);
      await generationRepo.activateAssetGeneration(connection, previousB, v3B.generationId);
    });
    await advanceTurn({
      userId: "inventory-owner",
      battleId: created.id,
      operationId: "v3-battle-first-turn",
      llm,
    });
    const resumed = await getBattle(created.id);
    assert.equal(resumed?.assetManifest?.schemaVersion, 4);
    assert.deepEqual(resumed.assetManifest.characters, bound.assetManifest.characters);

    assert.ok(resumed);
    assert.equal(BattleAssetManifestV4Schema.safeParse({
      ...resumed.assetManifest,
      rules: { ...resumed.assetManifest.rules, characterDefinitionRules: "character-definition-rules-v2" },
    }).success, false);
    assert.equal(BattleAssetManifestV4Schema.safeParse({
      ...resumed.assetManifest,
      characters: { ...resumed.assetManifest.characters, a: {
        ...resumed.assetManifest.characters.a,
        snapshot: { ...resumed.assetManifest.characters.a.snapshot, id: "different-character" },
      } },
    }).success, false);
    assert.throws(() => assertConsciousBinding(resumed, { ...fixture.settings, revision: (resumed.dialoguePipelineSnapshot?.revision ?? 0) + 1 }), /BATTLE_CONTRACT_MISMATCH/);
    const firstReplay = await advanceTurn({
      userId: "inventory-owner", battleId: created.id,
      operationId: "v3-battle-first-turn", llm,
    });
    assert.equal(firstReplay.turn, resumed.turn);
    assert.equal((await getBattle(created.id))?.battleRevision, resumed.battleRevision);

    for (const [endpoint, key] of [["advance", "v4-http-binding-0001"], ["advance/stream", "v4-sse-binding-0001"], ["action", "v4-action-binding-0001"]]) {
      const response = await app.request(`/api/battles/${created.id}/${endpoint}`, {
        method: "POST", headers: { ...headers, "Idempotency-Key": key },
      });
      const body = await response.text();
      assert.equal(response.status, 200, body);
      if (endpoint === "advance/stream") assert.ok(body.includes('"type":"done"'), body);
      const after = await getBattle(created.id);
      assert.ok(after);
      assert.deepEqual(after.assetManifest, bound.assetManifest);
      const revision = after.battleRevision;
      const replay = await app.request(`/api/battles/${created.id}/${endpoint}`, {
        method: "POST", headers: { ...headers, "Idempotency-Key": key },
      });
      assert.equal(replay.status, 200, await replay.text());
      assert.equal((await getBattle(created.id))?.battleRevision, revision);
    }
    const read = await app.request(`/api/battles/${created.id}`, { headers });
    assert.equal(read.status, 200);
    assert.ok(consciousCalls >= 4);
    const advanced = await getBattle(created.id);
    assert.ok(advanced?.agentStateA?.consciousAgencyV1?.upperGoal);
    assert.ok((advanced.turnRecords?.length ?? 0) > 0);

    const action = advanced.turnRecords?.flatMap((record) => record.actions)[0];
    assert.ok(action);
    const reflected = applyReflectMemoryWrites(advanced, [{
      ...action, actorSide: "a", kind: "reflect", executed: true,
      reflectionAnalysis: "frozen-reflect-analysis", reflectionGuideline: "must-not-replace-goal",
    }]);
    assert.deepEqual(reflected.agentStateA?.consciousAgencyV1, advanced.agentStateA.consciousAgencyV1);
    assert.equal(reflected.agentStateA?.currentGoal, advanced.agentStateA.currentGoal);
    assert.ok(reflected.agentStateA?.battleVolatileMemory?.includes("frozen-reflect-analysis"));

    const conflicted = structuredClone(bound);
    const manifest = BattleAssetManifestV4Schema.parse(conflicted.assetManifest);
    const basicRef = manifest.characters.a.compilerInputsV4.actionNorms.actionCatalog.find((entry) => entry.actionKind === "basic_action")?.actionRef;
    assert.ok(basicRef);
    manifest.characters.a.compilerInputsV4.actionNorms = CharacterActionNormProgramV3Schema.parse({
      ...manifest.characters.a.compilerInputsV4.actionNorms,
      norms: ["allow_only", "forbid"].map((disposition, index) => ({
        id: `conflict-${index}`, when: { match: "all", clauses: [{ kind: "always", operator: "is", value: "true" }] },
        response: { disposition, actionRefs: [basicRef], actionKinds: [], tacticTags: [] },
        priority: 90 - index, force: "constraint", exceptions: [],
      })),
    });
    manifest.characters.a.compilerInputsV4.mechanicalConflictFallbacks.entries = [];
    conflicted.assetManifest = manifest;
    const forcedState = structuredClone(conflicted);
    forcedState.prologuePending = false;
    forcedState.supervisor = { ...forcedState.supervisor, passiveTurns: 2, quietTurns: 0,
      turnsSinceHappening: 0, lastHpA: null, lastHpB: null, happenings: 0, recentHappenings: [] };
    const forced = resolveTurn({ state: forcedState,
      sideASkills: manifest.characters.a.snapshot.skills, sideBSkills: manifest.characters.b.snapshot.skills,
      sideABasicAttack: manifest.characters.a.snapshot.basicAttack, sideBBasicAttack: manifest.characters.b.snapshot.basicAttack,
      sideANormConstraint: { allowedActionKeys: [], fallback: { kind: "wait" } },
    });
    const forcedA = forced.actions.find((action) => action.actorSide === "a");
    assert.equal(forcedA?.kind, "wait");
    assert.equal(forcedA?.selection?.sourceLayer, "character_norm_fallback");
    const checkpointState = structuredClone(forcedState);
    assert.ok(checkpointState.supervisor);
    checkpointState.supervisor.passiveTurns = 0;
    checkpointState.plannedActionA = { kind: "basic_attack" };
    checkpointState.plannedActionB = { kind: "basic_attack" };
    checkpointState.sideA.parameters.spd = 20;
    checkpointState.sideB.parameters.spd = 5;
    const prepared = prepareSequentialBattleTurnInitiative({ state: checkpointState,
      sideASkills: manifest.characters.a.snapshot.skills, sideBSkills: manifest.characters.b.snapshot.skills,
      sideABasicAttack: manifest.characters.a.snapshot.basicAttack, sideBBasicAttack: manifest.characters.b.snapshot.basicAttack,
      tieDrawSample: 0,
    });
    assert.ok(prepared);
    const common = { state: checkpointState,
      sideASkills: manifest.characters.a.snapshot.skills, sideBSkills: manifest.characters.b.snapshot.skills,
      sideABasicAttack: manifest.characters.a.snapshot.basicAttack, sideBBasicAttack: manifest.characters.b.snapshot.basicAttack,
      temporalResolutionOverride: prepared.temporalResolution,
    };
    const firstBucket = resolveNextBattleTurnBucket({ ...common,
      resolveNormConstraint: (effectiveState) => {
        assert.equal(effectiveState.turn, prepared.turn);
        assert.deepEqual(effectiveState.sideA.parameters, prepared.sideA.parameters);
        return undefined;
      },
    });
    assert.ok(firstBucket.engineContinuation);
    const checkpointBoundary = materializeBattleStateAtBucketBoundary({ state: checkpointState, continuation: firstBucket.engineContinuation });
    const resumedBucket = resolveNextBattleTurnBucket({ ...common, state: checkpointBoundary,
      engineContinuation: firstBucket.engineContinuation,
      resolveNormConstraint: (effectiveState, side) => {
        assert.equal(effectiveState.turn, firstBucket.engineContinuation?.turn);
        return side === "b" ? { allowedActionKeys: [], fallback: { kind: "wait" } } : undefined;
      },
    });
    const resumedB = resumedBucket.actions.find((action) => action.actorSide === "b");
    assert.equal(resumedB?.kind, "wait");
    assert.equal(resumedB?.selection?.sourceLayer, "character_norm_fallback");
    const callsBeforeConflict = consciousCalls;
    const conflictResult = await advanceCharacterAgents({ llm, before: conflicted, after: structuredClone(conflicted),
      mine: manifest.characters.a.snapshot, opp: manifest.characters.b.snapshot,
      events: [], actions: [], activeSides: ["a"], phase: "turn",
      dialoguePipeline: { ...fixture.settings, revision: manifest.dialoguePipeline.snapshot.revision },
    });
    assert.equal(consciousCalls, callsBeforeConflict);
    const conflictTrace = conflictResult.state.turnRecords?.at(-1)?.pipelineTrace?.characterDefinitionRules?.a.actionNorm;
    assert.equal(conflictTrace?.status, "character_norm_conflict");
    assert.equal(conflictTrace?.contractVersion, 3);
    assert.ok(conflictTrace && "conflict" in conflictTrace && conflictTrace.conflict);

    await saveHistoricalCharacterFixture({ ...fixture.mine, displayName: "MUTATED_CURRENT_NAME" });
    let finalState: BattleState = advanced;
    for (let step = 0; step < 120 && (finalState.status !== "finished" || finalState.aftermathPending); step += 1) {
      await advanceTurn({ userId: "inventory-owner", battleId: created.id,
        operationId: `v4-binding-completion-${step}`, llm });
      const next = await getBattle(created.id);
      assert.ok(next);
      assert.deepEqual(next.assetManifest, bound.assetManifest);
      finalState = next;
    }
    assert.equal(finalState.status, "finished");
    assert.equal(finalState.aftermathPending, false);
    assert.equal(finalState.sideA.displayName, bound.sideA.displayName);
    const frozenEntries = await query<{ input_json: string | object }>(
      "SELECT input_json FROM battle_narration_entries WHERE battle_id = $1 ORDER BY sequence", [created.id]);
    assert.ok(frozenEntries.rows.length > 0);
    const expectedInputs = frozenEntries.rows.map((row) => typeof row.input_json === "string" ? JSON.parse(row.input_json) : row.input_json);
    assert.equal(JSON.stringify(expectedInputs).includes("MUTATED_CURRENT_NAME"), false);
    const generator = createLlmNarrationGenerator(llm);
    let workerCalls = 0;
    for (let step = 0; step < expectedInputs.length; step += 1) {
      const result = await processNextNarration({ battleId: created.id, ownerId: "v4-binding-worker",
        generator: async (raw, context) => {
          assert.ok(expectedInputs.some((candidate) => JSON.stringify(candidate) === JSON.stringify(raw)));
          workerCalls += 1;
          return generator(raw, context);
        },
      });
      assert.equal(result, "completed");
    }
    assert.ok(workerCalls > 0);
    for (const endpoint of [`/api/battles/${created.id}`, `/api/characters/${fixture.mine.id}/battles`, `/api/battles/${created.id}/narration`, `/api/battles/${created.id}/narration/events`]) {
      const response = await app.request(endpoint, { headers });
      assert.equal(response.status, 200, await response.text());
    }


    const legacySelect = await app.request("/api/characters?selectable=true", { headers });
    const legacyBody = await legacySelect.json();
    assert.equal(legacyBody.total, 0);
    const managed = await app.request("/api/characters", { headers });
    assert.ok((await managed.json()).characters.some((row: { id: string }) => row.id === fixture.mine.id));
    const blockedCreate = await app.request("/api/battles", { method: "POST", headers: {
      ...headers, "Content-Type": "application/json", "Idempotency-Key": "v2-new-blocked" },
      body: JSON.stringify({ myCharacterId: fixture.mine.id, opponentCharacterId: fixture.opp.id }) });
    assert.equal(blockedCreate.status, 409);

    await withTransaction(async (connection) => {
      await generationRepo.activateAssetGeneration(connection, v3A, previousA.generationId);
      await generationRepo.activateAssetGeneration(connection, v3B, previousB.generationId);
    });
    const createBody = { myCharacterId: fixture.mine.id, opponentCharacterId: fixture.opp.id };
    const createHeaders = { ...headers, "Content-Type": "application/json", "Idempotency-Key": "vt110-cutover-create" };
    const oldCreate = await app.request("/api/battles", { method: "POST", headers: createHeaders, body: JSON.stringify(createBody) });
    assert.equal(oldCreate.status, 200);
    const oldCreated = await oldCreate.json();
    const discardedId: string = oldCreated.battle.id;
    for (const endpoint of ["advance", "advance/stream", "action"]) {
      const response = await app.request(`/api/battles/${discardedId}/${endpoint}`, { method: "POST",
        headers: { ...headers, "Idempotency-Key": `vt110-old-${endpoint.replaceAll("/", "-")}` } });
      assert.equal(response.status, 200, await response.text());
    }
    const { planBattleCutover, discardBattleCutover } = await import("../repositories/battle-cutover.js");
    const plan = await planBattleCutover({ cutoverId: "vt110-real-route", cutoverAt: new Date(Date.now() + 1000).toISOString() });
    assert.deepEqual(plan.targets.map((target) => target.id), [discardedId]);
    assert.ok(plan.finished.some((row) => row.id === created.id));
    const discard = await discardBattleCutover({ plan, operatorId: "local-test", stopped: true, recoverySnapshotIdentity: "temporary-fixture" });
    assert.equal(discard.kind, "discarded");
    assert.equal(await getBattle(discardedId), null);
    for (const endpoint of ["", "/narration", "/narration/events", "/narration/follow", "/narration/receipt"]) {
      const response = await app.request(`/api/battles/${discardedId}${endpoint}`, { headers });
      assert.equal(response.status, 404, await response.text());
    }
    for (const endpoint of ["advance", "advance/stream", "action"]) {
      const response = await app.request(`/api/battles/${discardedId}/${endpoint}`, { method: "POST",
        headers: { ...headers, "Idempotency-Key": `vt110-old-${endpoint.replaceAll("/", "-")}` } });
      assert.equal(response.status, 404, await response.text());
    }
    const replayCreate = await app.request("/api/battles", { method: "POST", headers: createHeaders, body: JSON.stringify(createBody) });
    assert.equal(replayCreate.status, 404);
    await assert.rejects(advanceTurn({userId: "inventory-owner", battleId: discardedId, operationId: "old-operation", llm}), /BATTLE_NOT_FOUND/);
    assert.equal(await processNextNarration({battleId: discardedId, ownerId: "late-worker", generator: async () => {throw new Error("MUST_NOT_CALL_PROVIDER");}}), "acknowledged");
    const retained = await app.request(`/api/battles/${created.id}`, { headers });
    assert.equal(retained.status, 200);
    const listed = await app.request("/api/battles", { headers });
    const history = await listed.json();
    assert.equal(history.battles.some((row: { id: string }) => row.id === discardedId), false);
    assert.equal(history.battles.some((row: { id: string }) => row.id === created.id), true);
    // Return opponent to V2 to exercise mixed-generation rejection below.
    await withTransaction((connection) => generationRepo.activateAssetGeneration(connection, previousB, v3B.generationId));
    await assert.rejects(
      startBattle({
        userId: "inventory-owner",
        battleId: "v3-battle-mixed-rejected",
        myCharacterId: fixture.mine.id,
        opponentCharacterId: fixture.opp.id,
        battlefieldMode: "random",
        llm,
      }),
      /OPPONENT_CHARACTER_V3_CAPABILITY_BLOCKED/,
    );
  });
});
