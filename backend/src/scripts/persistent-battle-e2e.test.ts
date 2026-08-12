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
  authorizeObservationProviderBudget,
  generateEphemeralPassword,
  parseBattleAdvanceStream,
  persistSanitizedObservation,
  projectObservationProviderOperations,
  resolveObservationRunId,
  validateProductionApiUrl,
} = persistentE2eModule;
const { closeDatabase, query } = await import("../db.js");

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("persistent battle E2E runner", () => {
  it("requires an exact operator approval and rejects an over-budget observation", () => {
    const projected = projectObservationProviderOperations(12);
    assert.deepEqual(projected, {
      encounter: 1,
      characterExpression: 24,
      deepPsyche: 0,
      environment: 12,
      narration: 14,
      referee: 1,
      total: 52,
    });
    assert.throws(() => authorizeObservationProviderBudget({
      runId: "run-1",
      approvedRunId: "run-2",
      ceiling: 52,
      projected,
    }), /exactly match/);
    assert.throws(() => authorizeObservationProviderBudget({
      runId: "run-1",
      approvedRunId: "run-1",
      ceiling: 51,
      projected,
    }), /exceed ceiling/);
    authorizeObservationProviderBudget({
      runId: "run-1",
      approvedRunId: "run-1",
      ceiling: 52,
      projected,
    });
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
