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
  generateEphemeralPassword,
  parseBattleAdvanceStream,
  persistSanitizedObservation,
  resolveObservationRunId,
  validateProductionApiUrl,
} = persistentE2eModule;
const { closeDatabase, query } = await import("../db.js");

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("persistent battle E2E runner", () => {
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
