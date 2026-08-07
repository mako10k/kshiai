import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.E2E_ALLOWED_HOSTS = "kshiai.mk10.org,release.example.test";
const {
  generateEphemeralPassword,
  parseBattleAdvanceStream,
  validateProductionApiUrl,
} = await import("./persistent-battle-e2e.js");

describe("persistent battle E2E runner", () => {
  it("generates a strong ephemeral password within the Supabase limit", () => {
    const password = generateEphemeralPassword();
    assert.ok(Buffer.byteLength(password, "utf8") <= 72);
    assert.match(password, /^E2E-[0-9a-f-]{36}-9a!$/);
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
