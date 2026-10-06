import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-persistent-e2e-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "observations.db");
process.env.E2E_ALLOWED_HOSTS = "kshiai.mk10.org,release.example.test";
const persistentE2eModule: typeof import("./persistent-battle-e2e.js") =
  await import("./persistent-battle-e2e.js");
const assertSanitizedObservation: typeof persistentE2eModule.assertSanitizedObservation =
  persistentE2eModule.assertSanitizedObservation;
const {
  OBSERVATION_PROVIDER_OPERATION_LAYERS,
  OBSERVATION_PROVIDER_OPERATION_TAXONOMY_REVISION,
  assertPublicNarrationOrder,
  assertObservedBackendIdentity,
  authorizeObservationProviderBudget,
  generateEphemeralPassword,
  parseBattleAdvanceStream,
  persistSanitizedObservation,
  projectObservationProviderOperations,
  reconcileSparseNarrationProjection,
  resolveObservationRunId,
  validateProductionApiUrl,
  verifyProviderOperationLedger,
} = persistentE2eModule;
const { advanceBattleWithBusyRetry } = await import("./persistent-battle-e2e-advance.js");
const { closeDatabase, query } = await import("../db.js");

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("persistent battle E2E runner", () => {
  it("rejects a successful health response from a different backend revision", () => {
    assert.doesNotThrow(() => assertObservedBackendIdentity(
      { ok: true, revision: "kshiai-api-00131-test" },
      "kshiai-api-00131-test",
    ));
    assert.throws(() => assertObservedBackendIdentity(
      { ok: true, revision: "kshiai-api-00130-old" },
      "kshiai-api-00131-test",
    ), /revision mismatch/);
  });
  it("classifies every observation provider operation under one revision", () => {
    assert.equal(
      OBSERVATION_PROVIDER_OPERATION_TAXONOMY_REVISION,
      "battle-provider-operations-v3",
    );
    assert.deepEqual(OBSERVATION_PROVIDER_OPERATION_LAYERS, {
      concretizeBattlefield: "encounter",
      prepareBattleEncounter: "encounter",
      adjudicateFreeActions: "environment",
      proposeSituation: "environment",
      reconcileTurnSemanticState: "environment",
      proposeHappening: "environment",
      advanceCharacterPsycheCompact: "deepPsyche",
      advanceCharacterPsycheCompactRepair: "deepPsyche",
      advanceCharacterPsyche: "deepPsyche",
      advanceCharacterAgentCompact: "characterExpression",
      advanceCharacterAgent: "characterExpression",
      decideCharacterAction: "characterExpression",
      chooseNarrationFocus: "narration",
      narratePrologue: "narration",
      narrateTurn: "narration",
      narrateJudgment: "narration",
      narrateAftermath: "narration",
      referee: "referee",
      "awareness-v5:subconscious": "deepPsyche",
      "awareness-v5:conscious": "characterExpression",
      "awareness-v5:narration-frozen": "narration",
      "awareness-v5:narration-batch": "narration",
    });
  });

  it("requires an exact operator approval and rejects an over-budget observation", () => {
    const projected = projectObservationProviderOperations(12);
    assert.deepEqual(projected, {
      encounter: 2,
      characterExpression: 44,
      deepPsyche: 8,
      environment: 20,
      narration: 14,
      referee: 1,
      total: 89,
    });
    assert.throws(() => authorizeObservationProviderBudget({
      runId: "run-1",
      approvedRunId: "run-2",
      ceiling: 89,
      projected,
    }), /exactly match/);
    assert.throws(() => authorizeObservationProviderBudget({
      runId: "run-1",
      approvedRunId: "run-1",
      ceiling: 84,
      projected,
    }), /exceed ceiling/);
    authorizeObservationProviderBudget({
      runId: "run-1",
      approvedRunId: "run-1",
      ceiling: 89,
      projected,
    });
  });

  it("accepts only a terminal reconciled physical-attempt ledger", () => {
    const ledger: Parameters<typeof verifyProviderOperationLedger>[0]["ledger"] = {
      runId: "run-ledger",
      battleId: "battle-ledger",
      battleObservationRunId: "run-ledger",
      taxonomyRevision: "battle-provider-operations-v3",
      approvedAttemptCeiling: 5,
      reservedAttempts: 3,
      status: "active",
      attempts: [
        {
          layer: "encounter",
          operation: "prepareBattleEncounter",
          status: "succeeded",
          count: 1,
          tokenCount: 20,
          estimatedCostUsd: null,
        },
        {
          layer: "narration",
          operation: "narrateTurn",
          status: "succeeded",
          count: 2,
          tokenCount: null,
          estimatedCostUsd: null,
        },
      ],
    };
    assert.deepEqual(verifyProviderOperationLedger({
      ledger,
      runId: "run-ledger",
      battleId: "battle-ledger",
      ceiling: 5,
      narrationProviderOperations: 2,
    }), {
      byLayer: {
        encounter: 1,
        characterExpression: 0,
        deepPsyche: 0,
        environment: 0,
        narration: 2,
        referee: 0,
      },
      total: 3,
      tokenCount: null,
      estimatedCostUsd: null,
    });
    assert.throws(() => verifyProviderOperationLedger({
      ledger,
      runId: "run-ledger",
      battleId: "battle-ledger",
      ceiling: 5,
      narrationProviderOperations: 1,
    }), /Narration accounting mismatch/);
    assert.throws(() => verifyProviderOperationLedger({
      ledger: {
        ...ledger,
        attempts: [{ ...ledger.attempts[0]!, status: "reserved" }],
      },
      runId: "run-ledger",
      battleId: "battle-ledger",
      ceiling: 5,
      narrationProviderOperations: 0,
    }), /unresolved attempts/);
  });

  it("generates a strong ephemeral password within the Supabase limit", () => {
    const password = generateEphemeralPassword();
    assert.ok(Buffer.byteLength(password, "utf8") <= 72);
    assert.match(password, /^E2E-[0-9a-f-]{36}-9a!$/);
  });

  it("accepts only a bounded portable observation run ID", () => {
    assert.equal(resolveObservationRunId("github-31152391771-2"), "github-31152391771-2");
    assert.throws(() => resolveObservationRunId("contains a space"), /bounded portable/);
    assert.throws(() => resolveObservationRunId(`x${"y".repeat(128)}`), /bounded portable/);
  });

  it("validates and durably records a sanitized observation", async () => {
    const observation = {
      schemaVersion: 1,
      runId: "github-test-1",
      observedAt: "2026-08-07T00:00:00.000Z",
      target: { revision: "kshiai-api-test" },
      accounts: { crossAccount: true },
      visibility: {
        testRealmSharing: "passed",
        generalCharacterLeakage: "not_observed",
      },
      battle: {
        id: "btl-persistent-observation-test",
        status: "finished",
        log: [{ turn: 1, narrator: ["完了"] }],
      },
      narrationConvergence: {
        terminalReceiptCount: 1,
        orderedProjection: "passed",
        oneAttemptPerReceipt: "passed",
        liveGenerations: 0,
      },
      historyVisibility: "passed",
    };
    assertSanitizedObservation(observation, "kshiai-api-test");
    await persistSanitizedObservation(observation);
    const stored = await query<{ payload_json: string | typeof observation }>(
      `SELECT payload_json FROM balance_events
       WHERE kind = $1 AND battle_id = $2`,
      ["persistent_e2e_observation", observation.battle.id],
    );
    const payload = typeof stored.rows[0]?.payload_json === "string"
      ? JSON.parse(stored.rows[0].payload_json)
      : stored.rows[0]?.payload_json;
    assert.equal(payload?.runId, observation.runId);
    assert.throws(
      () => assertSanitizedObservation({ ...observation, accessToken: "secret" }, "kshiai-api-test"),
      /Forbidden observation key/,
    );
  });

  it("accepts only an explicitly allowed HTTPS origin", () => {
    assert.equal(
      validateProductionApiUrl("https://kshiai.mk10.org"),
      "https://kshiai.mk10.org",
    );
    assert.throws(
      () => validateProductionApiUrl("https://kshiai.mk10.org/api"),
      /HTTPS origin/,
    );
    assert.throws(
      () => validateProductionApiUrl("https://other.example.test"),
      /not allowed/,
    );
  });

  it("takes the authoritative done battle from an SSE response", () => {
    const battle = parseBattleAdvanceStream([
      ": stream-open",
      "data: {\"type\":\"phase\",\"phase\":\"resolving\"}",
      "data: {\"type\":\"done\",\"battle\":{" +
        "\"id\":\"btl-e2e\",\"status\":\"finished\",\"turn\":1,\"turnLimit\":20," +
        "\"sideA\":{\"characterId\":\"a\",\"displayName\":\"A\",\"canFight\":true}," +
        "\"sideB\":{\"characterId\":\"b\",\"displayName\":\"B\",\"canFight\":false}," +
        "\"policies\":[],\"policySummary\":\"\",\"opponentPolicySummary\":\"\"," +
        "\"scene\":\"路地\",\"situationNotes\":\"\",\"log\":[]," +
        "\"availableActions\":[],\"winnerSide\":\"a\",\"finishReason\":\"incapacitated\"}}",
      "",
    ].join("\n"));
    assert.equal(battle.id, "btl-e2e");
    assert.equal(battle.status, "finished");
  });

  it("accepts sparse strictly increasing narration sequences from a completed beat", () => {
    assertPublicNarrationOrder([1, 2, 3, 6, 7, 10]);
    assert.throws(() => assertPublicNarrationOrder([1, 2, 2]), /unique/);
    assert.throws(() => assertPublicNarrationOrder([1, 3, 2]), /strictly increasing/);
    assert.throws(() => assertPublicNarrationOrder([]), /empty/);
    reconcileSparseNarrationProjection({
      narrationSequences: [1, 2, 3, 6],
      receipts: [
        { sequence: 1 },
        { sequence: 2 },
        { sequence: 3 },
        { sequence: 4, narrationDeferred: true },
        { sequence: 5, narrationDeferred: true },
        { sequence: 6 },
      ],
    });
    assert.throws(() => reconcileSparseNarrationProjection({
      narrationSequences: [1, 2, 3],
      receipts: [
        { sequence: 1 },
        { sequence: 2, narrationDeferred: true },
        { sequence: 3 },
      ],
    }), /Deferred phase receipt has a narration row/);
    assert.throws(() => reconcileSparseNarrationProjection({
      narrationSequences: [1, 3],
      receipts: [
        { sequence: 1 },
        { sequence: 2 },
        { sequence: 3 },
      ],
    }), /missing a narration row/);
  });

  it("rejects an SSE error without a done event", () => {
    assert.throws(
      () => parseBattleAdvanceStream(
        "data: {\"type\":\"error\",\"message\":\"BATTLE_BUSY\"}\n\n",
      ),
      /BATTLE_BUSY/,
    );
  });

  it("retries only explicit SSE BATTLE_BUSY with the same idempotency key", async () => {
    let calls = 0;
    const keys: string[] = [];
    const battle = await advanceBattleWithBusyRetry({
      idempotencyKey: "same-key",
      request: async ({ idempotencyKey }) => {
        calls += 1;
        keys.push(idempotencyKey);
        return new Response(calls === 1
          ? "data: {\"type\":\"error\",\"message\":\"BATTLE_BUSY\"}\n\n"
          : "data: {\"type\":\"done\",\"battle\":{\"id\":\"btl-e2e\",\"status\":\"finished\",\"turn\":1,\"turnLimit\":20,\"sideA\":{\"characterId\":\"a\",\"displayName\":\"A\",\"canFight\":true},\"sideB\":{\"characterId\":\"b\",\"displayName\":\"B\",\"canFight\":false},\"policies\":[],\"policySummary\":\"\",\"opponentPolicySummary\":\"\",\"scene\":\"路地\",\"situationNotes\":\"\",\"log\":[],\"availableActions\":[],\"winnerSide\":\"a\",\"finishReason\":\"incapacitated\"}}\n\n", { headers: { "content-type": "text/event-stream" } });
      },
      now: (() => { let current = 0; return () => current; })(),
      wait: async () => undefined,
    });
    assert.equal(calls, 2);
    assert.deepEqual(keys, ["same-key", "same-key"]);
    assert.equal(battle.id, "btl-e2e");
  });

  it("fails immediately for non-busy and ambiguous SSE outcomes", async () => {
    let calls = 0;
    await assert.rejects(() => advanceBattleWithBusyRetry({
      idempotencyKey: "nonbusy",
      request: async () => { calls += 1; return new Response("data: {\"type\":\"error\",\"message\":\"PROVIDER_FAILED\"}\n\n", { headers: { "content-type": "text/event-stream" } }); },
      wait: async () => { throw new Error("must not wait"); },
    }), /PROVIDER_FAILED/);
    assert.equal(calls, 1);
    await assert.rejects(() => advanceBattleWithBusyRetry({
      idempotencyKey: "ambiguous",
      request: async () => new Response("data: {\"type\":\"error\",\"message\":\"BATTLE_BUSY\"}\ndata: {\"type\":\"error\",\"message\":\"PROVIDER_FAILED\"}\n", { headers: { "content-type": "text/event-stream" } }),
      wait: async () => { throw new Error("must not wait"); },
    }), /Ambiguous/);
    const doneEvent = `data: ${JSON.stringify({
      type: "done",
      battle: {
        id: "btl-duplicate",
        status: "finished",
        turn: 1,
        turnLimit: 20,
        sideA: { characterId: "a", displayName: "A", canFight: true },
        sideB: { characterId: "b", displayName: "B", canFight: false },
        policies: [], policySummary: "", opponentPolicySummary: "", scene: "路地",
        situationNotes: "", log: [], availableActions: [], winnerSide: "a", finishReason: "incapacitated",
      },
    })}`;
    await assert.rejects(() => advanceBattleWithBusyRetry({
      idempotencyKey: "duplicate-done",
      request: async () => new Response(`${doneEvent}\n${doneEvent}\n`, { headers: { "content-type": "text/event-stream" } }),
      wait: async () => { throw new Error("must not wait"); },
    }), /Ambiguous/);
    for (const body of [
      `${doneEvent}\ndata: {"type":"error","message":"BATTLE_BUSY"}\n`,
      'data: {"type":"error","message":5}\n',
      'data: {broken\n',
    ]) {
      let attempts = 0;
      await assert.rejects(() => advanceBattleWithBusyRetry({
        idempotencyKey: "invalid-outcome",
        request: async () => {
          attempts += 1;
          return new Response(body, { headers: { "content-type": "text/event-stream" } });
        },
        wait: async () => { throw new Error("must not wait"); },
      }), /Ambiguous|Malformed/);
      assert.equal(attempts, 1);
    }
  });

  it("never retries a busy error after an execution progress event", async () => {
    let calls = 0;
    await assert.rejects(() => advanceBattleWithBusyRetry({
      idempotencyKey: "progress-before-busy",
      request: async () => {
        calls += 1;
        return new Response(
          'data: {"type":"phase","phase":"resolving"}\ndata: {"type":"error","message":"BATTLE_BUSY"}\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      },
      wait: async () => { throw new Error("must not wait"); },
    }), /Ambiguous/);
    assert.equal(calls, 1);
  });

  it("counts requests and waits against the absolute busy deadline", async () => {
    let current = 0;
    let calls = 0;
    await assert.rejects(() => advanceBattleWithBusyRetry({
      idempotencyKey: "deadline",
      deadlineMs: 100,
      now: () => current,
      request: async ({ timeoutMs }) => { calls += 1; assert.equal(timeoutMs, 100); current += 60; return new Response("data: {\"type\":\"error\",\"message\":\"BATTLE_BUSY\"}\n\n", { headers: { "content-type": "text/event-stream" } }); },
      wait: async (delayMs) => { current += delayMs; },
    }), /deadline exceeded/);
    assert.equal(calls, 1);
    assert.equal(current, 100);
  });

  it("bounds persistent contention without advancing the request identity", async () => {
    let calls = 0;
    const delays: number[] = [];
    await assert.rejects(() => advanceBattleWithBusyRetry({
      idempotencyKey: "still-busy",
      now: () => 0,
      request: async ({ idempotencyKey }) => {
        calls += 1;
        assert.equal(idempotencyKey, "still-busy");
        return new Response('data: {"type":"error","message":"BATTLE_BUSY"}\n', {
          headers: { "content-type": "text/event-stream" },
        });
      },
      wait: async (delay) => { delays.push(delay); },
    }), /retry limit exceeded/);
    assert.equal(calls, 9);
    assert.deepEqual(delays, [250, 500, 1000, 2000, 2000, 2000, 2000, 2000]);
  });
});
