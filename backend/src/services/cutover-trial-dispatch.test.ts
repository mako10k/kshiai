// R: Verify trial dispatch admits only the exact bound V4 battle before outbox writes.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  CharacterGenerationEnvelopeV3Schema,
  type CharacterSheet,
} from "@kshiai/shared";

const directory = mkdtempSync(join(tmpdir(), "kshiai-cutover-trial-dispatch-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "cutover-trial-dispatch.db");
process.env.LLM_PROVIDER = "mock";

const { config } = await import("../config.js");
const { closeDatabase, query } = await import("../db.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const providerAccounting = await import("../llm/provider-accounting.js");
const characterRepo = await import("../repositories/characters.js");
const generationRepo = await import("../repositories/asset-generations.js");
const settingsRepo = await import("../repositories/dialogue-pipeline-settings.js");
const { ensureSystemNarrationStyles } = await import(
  "../repositories/narration-styles.js"
);
const {
  initializeCutoverControl,
  recordStoppedBarrier,
  reserveCutoverOperation,
  settleCutoverOperation,
  startCutoverOperation,
  transitionCutoverControl,
} = await import("../repositories/cutover-control.js");
const { buildImportedCharacterEnvelopeV2 } = await import(
  "./character-authoring-service.js"
);
const { createConsciousFixture } = await import(
  "./conscious-agency.fixtures.js"
);
const {
  cutoverRequestDigest,
  resolveCutoverNarrationTaskOperation,
  runCutoverOperation,
  withCutoverBattleOperation,
  withCutoverBattleCreation,
} = await import("./cutover-admission.js");
const { startBattle } = await import("./battle-service.js");
const { dispatchPendingNarrationTasks } = await import(
  "./narration-task-dispatch.js"
);
const { enqueueNarration } = await import("./narration-worker.js");

function envelopeV3(sheet: CharacterSheet) {
  const source = buildImportedCharacterEnvelopeV2({
    sheet,
    attemptId: `cutover-trial-${sheet.id}`,
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
  rmSync(directory, { recursive: true, force: true });
});

describe("configured trial narration dispatch", () => {
  it("delivers only the exact bound V4 battle and leaves old outbox untouched", async (t) => {
    const fixture = createConsciousFixture();
    fixture.opp.visibility = "public";
    await query(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ($1, $2, 'test', $3)",
      ["trial-owner", "trial-owner", "2026-09-30T07:00:00.000Z"],
    );
    fixture.mine.ownerUserId = "trial-owner";
    fixture.opp.ownerUserId = "trial-owner";
    await characterRepo.saveSheet(fixture.mine);
    await characterRepo.saveSheet(fixture.opp);
    const generationA = await generationRepo.createAssetGeneration({
      assetType: "character",
      assetId: fixture.mine.id,
      schemaVersion: 3,
      content: envelopeV3(fixture.mine),
    });
    const generationB = await generationRepo.createAssetGeneration({
      assetType: "character",
      assetId: fixture.opp.id,
      schemaVersion: 3,
      content: envelopeV3(fixture.opp),
    });
    await ensureSystemNarrationStyles();
    await settingsRepo.updateDialoguePipelineSettings({
      userId: "trial-owner",
      patch: { ...fixture.settings, schemaVersion: 3, expectedRevision: 0 },
    });
    const trialBattleId = "cutover-trial-v4-battle";
    await startBattle({
      userId: "trial-owner",
      battleId: trialBattleId,
      myCharacterId: fixture.mine.id,
      opponentCharacterId: fixture.opp.id,
      battlefieldMode: "random",
      llm: new MockLlmProvider(),
    });
    await enqueueNarration({
      battleId: trialBattleId,
      receiptId: `${trialBattleId}:trial-dispatch`,
      sequence: 1000,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "trial" },
      inputDigest: "e".repeat(64),
    });

    const now = "2026-09-30T07:05:00.000Z";
    await query(
      `INSERT INTO battles
        (id, state_json, side_a_user_id, side_a_character_id,
         side_b_character_id, created_at, updated_at, revision)
       VALUES ('old-unrelated-battle', '{}', 'trial-owner', 'a', 'b', $1, $1, 0)`,
      [now],
    );
    await enqueueNarration({
      battleId: "old-unrelated-battle",
      receiptId: "old-unrelated-battle:phase:1",
      sequence: 1,
      phase: "combat",
      combatTurn: 1,
      frozenInput: { scene: "old" },
      inputDigest: "d".repeat(64),
      now,
    });

    const cutoverId = "trial-dispatch-cutover";
    const artifactId = "trial-dispatch-artifact";
    const backgroundKind = "narration-dispatch" as const;
    const requestDigest = cutoverRequestDigest({
      backgroundKind,
      battleId: trialBattleId,
    });
    const providerRequestDigest = cutoverRequestDigest({
      operation: "narrateTurn",
      provider: "fake",
      model: "fake-fast",
      battleId: trialBattleId,
    });
    const providerRunId = "trial-provider-run";
    await providerAccounting.createProviderOperationRun({
      runId: providerRunId,
      observerUserId: "trial-owner",
      approvedAttemptCeiling: 2,
      projectedOperations: { narration: 2 },
    });
    await query(
      "UPDATE battles SET observation_run_id = $2 WHERE id = $1",
      [trialBattleId, providerRunId],
    );
    await providerAccounting.bindProviderOperationRun({
      runId: providerRunId,
      observerUserId: "trial-owner",
      battleId: trialBattleId,
    });
    const prospectiveBattleId = "cutover-prospective-v4-battle";
    const prospectiveProviderRunId = "trial-prospective-provider-run";
    await providerAccounting.createProviderOperationRun({
      runId: prospectiveProviderRunId,
      observerUserId: "trial-owner",
      approvedAttemptCeiling: 1,
      projectedOperations: { encounter: 1 },
    });
    await providerAccounting.bindProviderOperationRun({
      runId: prospectiveProviderRunId,
      observerUserId: "trial-owner",
      battleId: prospectiveBattleId,
    });
    await initializeCutoverControl({
      phase: "closed",
      operationId: "initialize-trial-dispatch",
      operatorId: "operator",
      policy: {
        cutoverId,
        artifactId,
        ownerUserId: "trial-owner",
        ownerCandidates: [
          { attemptId: "candidate-a", candidateDigest: "a".repeat(64) },
          { attemptId: "candidate-b", candidateDigest: "b".repeat(64) },
        ],
        trialBindings: null,
        taskBattleIds: [trialBattleId],
        stageAcceptance: {
          health: null,
          postgres: null,
          email: null,
          google: null,
          ownership: null,
          r2: null,
          sse: null,
          directProtection: null,
        },
        productionReceipt: null,
      },
    });
    const stopped = await recordStoppedBarrier({
      cutoverId,
      artifactId,
      expectedRevision: 1,
      operationId: "record-trial-dispatch-barrier",
      operatorId: "operator",
      providerAccountingReceiptId: "provider-accounting-stopped",
    });
    assert.equal(stopped.kind, "recorded");
    const ownerCandidates = [
      { attemptId: "candidate-a", candidateDigest: "a".repeat(64), generationId: generationA.generationId,
        characterId: fixture.mine.id },
      { attemptId: "candidate-b", candidateDigest: "b".repeat(64), generationId: generationB.generationId,
        characterId: fixture.opp.id },
    ] as const;
    for (const [index, candidate] of ownerCandidates.entries()) {
      await query(
        `INSERT INTO character_authoring_attempts
          (attempt_id, owner_user_id, character_id, kind, idempotency_key,
           request_digest, source_text, source_digest, status, candidate_json,
           candidate_digest, assistant_message, error_code, result_generation_id,
           created_at, updated_at, expires_at)
         VALUES ($1, 'trial-owner', $2, 'revision', $3, $4, NULL, $5,
           'succeeded', '{}', $6, '', NULL, $7, $8, $8, $9)`,
        [candidate.attemptId, candidate.characterId, `candidate-key-${index}`,
          cutoverRequestDigest(`candidate-request-${index}`),
          cutoverRequestDigest(`candidate-source-${index}`), candidate.candidateDigest,
          candidate.generationId, now, "2099-01-01T00:00:00.000Z"],
      );
    }
    const confirmationReceiptIds: [string, string] = ["", ""];
    for (const [index, candidate] of ownerCandidates.entries()) {
      const confirmation = await reserveCutoverOperation({
        cutoverId,
        artifactId,
        controlRevision: 2,
        bindingOperationId: `confirm-${candidate.attemptId}`,
        reservationAttemptId: `confirm-reservation-${candidate.attemptId}`,
        requestDigest: cutoverRequestDigest({ candidateDigest: candidate.candidateDigest }),
        actorId: "trial-owner",
        kind: "http",
        method: "POST",
        path: `/api/characters/${candidate.attemptId}/confirm`,
        ownerAttemptId: candidate.attemptId,
        candidateDigest: candidate.candidateDigest,
      });
      assert.equal(confirmation.kind, "reserved");
      if (confirmation.kind !== "reserved") return;
      assert.equal((await startCutoverOperation({
        cutoverId,
        artifactId,
        permitId: confirmation.permit.permitId,
      })).kind, "started");
      assert.equal((await settleCutoverOperation({
        cutoverId,
        artifactId,
        permitId: confirmation.permit.permitId,
        outcome: "settled",
        resultDigest: cutoverRequestDigest({ generationId: candidate.generationId }),
      })).state, "settled");
      confirmationReceiptIds[index] = confirmation.permit.permitId;
    }
    const trialBindings = {
      generationIds: [generationA.generationId, generationB.generationId] as [string, string],
      ownerConfirmationReceiptIds: confirmationReceiptIds,
      cutoverReadbackReceiptId: "cutover-readback",
      stoppedBarrierReceiptId: "provider-accounting-stopped",
      requests: [
        {
          bindingOperationId: "trial-narration-task",
          kind: "task" as const,
          method: "POST",
          path: "/api/internal/narration/task",
          requestDigest: cutoverRequestDigest({
            taskKind: "narration",
            battleId: trialBattleId,
          }),
          battleId: trialBattleId,
          backgroundKind: "narration",
          maximumReservations: 1,
        },
        {
          bindingOperationId: "trial-battle-create",
          kind: "http" as const,
          method: "POST",
          path: "/api/battles",
          requestDigest: cutoverRequestDigest({ battleId: prospectiveBattleId }),
          battleId: prospectiveBattleId,
          maximumReservations: 1,
        },
        {
          bindingOperationId: "trial-provider-encounter",
          kind: "provider" as const,
          method: "PROVIDER",
          path: "prepareBattleEncounter",
          requestDigest: cutoverRequestDigest({
            operation: "prepareBattleEncounter",
            provider: "fake",
            model: "fake-fast",
            battleId: prospectiveBattleId,
          }),
          battleId: prospectiveBattleId,
          maximumReservations: 1,
        },
        {
          bindingOperationId: "trial-narration-dispatch",
          kind: "background" as const,
          method: "BACKGROUND",
          path: backgroundKind,
          requestDigest,
          battleId: trialBattleId,
          backgroundKind,
          maximumReservations: 1,
        },
        {
          bindingOperationId: "trial-provider-narration",
          kind: "provider" as const,
          method: "PROVIDER",
          path: "narrateTurn",
          requestDigest: providerRequestDigest,
          battleId: trialBattleId,
          maximumReservations: 1,
        },
      ],
    };
    const transitioned = await transitionCutoverControl({
      cutoverId,
      artifactId,
      expectedRevision: 2,
      operationId: "open-trial-dispatch",
      operatorId: "operator",
      toPhase: "trial",
      trialBindings,
    });
    assert.equal(transitioned.kind, "transitioned");
    config.cutover = { cutoverId, artifactId };

    let taskCallbacks = 0;
    const futureTaskOperation = await resolveCutoverNarrationTaskOperation({
      battleId: trialBattleId,
      deliveryOperationId: "task:future-outbox:7",
      requestDigest: cutoverRequestDigest({
        battleId: trialBattleId,
        receiptId: "future-receipt",
        outboxId: "future-outbox",
        deliveryGeneration: 7,
      }),
    });
    assert.equal(await runCutoverOperation(futureTaskOperation, async () => {
      taskCallbacks += 1;
      return "processed";
    }), "processed");
    await assert.rejects(
      runCutoverOperation(
        await resolveCutoverNarrationTaskOperation({
          battleId: trialBattleId,
          deliveryOperationId: "task:future-outbox:8",
          requestDigest: cutoverRequestDigest({
            battleId: trialBattleId,
            receiptId: "future-receipt-retry",
            outboxId: "future-outbox",
            deliveryGeneration: 8,
          }),
        }),
        async () => {
          taskCallbacks += 1;
          return "must-not-run";
        },
      ),
      /cutover_unavailable/,
    );
    await assert.rejects(
      resolveCutoverNarrationTaskOperation({
        battleId: "old-unrelated-battle",
        deliveryOperationId: "task:old-outbox:1",
        requestDigest: cutoverRequestDigest({ battleId: "old-unrelated-battle" }),
      }),
      /cutover_unavailable/,
    );
    assert.equal(taskCallbacks, 1);

    const prospectiveContext = {
      runId: prospectiveProviderRunId,
      battleId: prospectiveBattleId,
    };
    let prospectiveProviderCalls = 0;
    const executeProspectiveProvider = () => providerAccounting.withProviderOperationContext(
      prospectiveContext,
      () => providerAccounting.executeProviderOperationAttempt({
        logicalCallId: "trial-prospective-provider",
        attemptOrdinal: 1,
        operation: "prepareBattleEncounter",
        provider: "fake",
        model: "fake-fast",
        action: async () => {
          prospectiveProviderCalls += 1;
          return "prospective-provider-result";
        },
      }),
    );
    await assert.rejects(executeProspectiveProvider(), /cutover_unavailable/);
    const createPermit = await reserveCutoverOperation({
      cutoverId,
      artifactId,
      controlRevision: transitioned.control.revision,
      bindingOperationId: "trial-battle-create",
      reservationAttemptId: "trial-battle-create-reservation",
      requestDigest: cutoverRequestDigest({ battleId: prospectiveBattleId }),
      actorId: "trial-owner",
      kind: "http",
      method: "POST",
      path: "/api/battles",
      battleId: prospectiveBattleId,
    });
    assert.equal(createPermit.kind, "reserved");
    if (createPermit.kind !== "reserved") return;
    assert.equal((await startCutoverOperation({
      cutoverId,
      artifactId,
      permitId: createPermit.permit.permitId,
    })).kind, "started");
    await assert.rejects(
      withCutoverBattleCreation({
        battleId: prospectiveBattleId,
        ownerUserId: "trial-owner",
        generationIds: [generationB.generationId, generationA.generationId],
      }, executeProspectiveProvider),
      /cutover_unavailable/,
    );
    assert.equal(await withCutoverBattleCreation({
      battleId: prospectiveBattleId,
      ownerUserId: "trial-owner",
      generationIds: [generationA.generationId, generationB.generationId],
    }, executeProspectiveProvider), "prospective-provider-result");
    assert.equal(prospectiveProviderCalls, 1);
    await settleCutoverOperation({
      cutoverId,
      artifactId,
      permitId: createPermit.permit.permitId,
      outcome: "settled",
      resultDigest: cutoverRequestDigest({ battleId: prospectiveBattleId }),
    });

    Object.assign(config.narrationTaskQueue, {
      configured: true,
      project: "project",
      location: "location",
      queue: "narration",
      targetUrl: "https://example.invalid/narration",
      serviceAccountEmail: "worker@example.invalid",
      audience: "https://example.invalid/narration",
    });
    const taskBodies: string[] = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
      if (String(input).startsWith("http://metadata.google.internal/")) {
        return Response.json({ access_token: "token" });
      }
      taskBodies.push(String(init?.body));
      return new Response(null, { status: 409 });
    });

    assert.deepEqual(await dispatchPendingNarrationTasks(20), {
      delivered: 1,
      failed: 0,
    });
    assert.equal(taskBodies.length, 1);
    const rows = await query<{
      battle_id: string;
      status: string;
      delivery_attempts: number;
    }>(
      `SELECT battle_id, status, delivery_attempts
         FROM battle_narration_outbox
        WHERE battle_id IN ($1, $2)
        ORDER BY battle_id`,
      [trialBattleId, "old-unrelated-battle"],
    );
    const byBattle = new Map(rows.rows.map((row) => [row.battle_id, row]));
    assert.equal(byBattle.get(trialBattleId)?.status, "dispatched");
    assert.equal(byBattle.get(trialBattleId)?.delivery_attempts, 1);
    assert.deepEqual(byBattle.get("old-unrelated-battle"), {
      battle_id: "old-unrelated-battle",
      status: "pending",
      delivery_attempts: 0,
    });

    let providerCalls = 0;
    const providerContext = { runId: providerRunId, battleId: trialBattleId };
    const executeSavedBattleProvider = () => providerAccounting.executeProviderOperationAttempt({
      logicalCallId: "trial-provider-logical-1",
      attemptOrdinal: 1,
      operation: "narrateTurn",
      provider: "fake",
      model: "fake-fast",
      action: async () => {
        providerCalls += 1;
        return "provider-result";
      },
    });
    await assert.rejects(executeSavedBattleProvider(), /cutover_unavailable/);
    assert.equal(
      await withCutoverBattleOperation(trialBattleId, executeSavedBattleProvider),
      "provider-result",
    );
    await assert.rejects(
      providerAccounting.withProviderOperationContext(
        providerContext,
        () => providerAccounting.executeProviderOperationAttempt({
          logicalCallId: "trial-provider-logical-2",
          attemptOrdinal: 1,
          operation: "narrateTurn",
          provider: "fake",
          model: "fake-fast",
          action: async () => {
            providerCalls += 1;
            return "must-not-send";
          },
        }),
      ),
      /cutover_unavailable/,
    );
    assert.equal(providerCalls, 1);
    assert.equal(
      (await providerAccounting.readProviderOperationRun(providerRunId))
        .reservedAttempts,
      0,
    );
  });
});
