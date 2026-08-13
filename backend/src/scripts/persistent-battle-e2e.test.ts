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
  authorizeObservationProviderBudget,
  generateEphemeralPassword,
  parseBattleAdvanceStream,
  persistSanitizedObservation,
  projectObservationProviderOperations,
  resolveObservationRunId,
  validateProductionApiUrl,
  verifyProviderOperationLedger,
} = persistentE2eModule;
const { closeDatabase, query } = await import("../db.js");

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("persistent battle E2E runner", () => {
  it("classifies every observation provider operation under one revision", () => {
    assert.equal(
      OBSERVATION_PROVIDER_OPERATION_TAXONOMY_REVISION,
      "battle-provider-operations-v1",
    );
    assert.deepEqual(OBSERVATION_PROVIDER_OPERATION_LAYERS, {
      concretizeBattlefield: "encounter",
      prepareBattleEncounter: "encounter",
      adjudicateFreeActions: "environment",
      proposeSituation: "environment",
      reconcileTurnSemanticState: "environment",
      proposeHappening: "environment",
      advanceCharacterPsycheCompact: "deepPsyche",
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
    });
  });

  it("requires an exact operator approval and rejects an over-budget observation", () => {
    const projected = projectObservationProviderOperations(12);
    assert.deepEqual(projected, {
      encounter: 2,
      characterExpression: 44,
      deepPsyche: 4,
      environment: 20,
      narration: 14,
      referee: 1,
      total: 85,
    });
    assert.throws(() => authorizeObservationProviderBudget({
      runId: "run-1",
      approvedRunId: "run-2",
      ceiling: 85,
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
      ceiling: 85,
      projected,
    });
  });

  it("accepts only a terminal reconciled physical-attempt ledger", () => {
    const ledger: Parameters<typeof verifyProviderOperationLedger>[0]["ledger"] = {
      runId: "run-ledger",
      battleId: "battle-ledger",
      battleObservationRunId: "run-ledger",
      taxonomyRevision: "battle-provider-operations-v1",
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

  it("rejects an SSE error without a done event", () => {
    assert.throws(
      () => parseBattleAdvanceStream(
        "data: {\"type\":\"error\",\"message\":\"BATTLE_BUSY\"}\n\n",
      ),
      /BATTLE_BUSY/,
    );
  });
});
