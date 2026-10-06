// R: Verify staged SSE smoke against real authenticated routes without provider work.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const directory = mkdtempSync(join(tmpdir(), "kshiai-auth-sse-"));
process.env.NODE_ENV = "test";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(directory, "smoke.db");
process.env.DATABASE_URL = "";
const { query, closeDatabase } = await import("../db.js");
const { MockLlmProvider } = await import("../llm/mock.js");
const { buildRoutes } = await import("../routes.js");
const { retainedCompatibilityFixture } = await import("./supabase-auth-smoke.js");
const { smokeAuthenticatedSse } = await import("./authenticated-sse-smoke.js");
const ownerUserId = "auth-sse-owner";
const fixture = retainedCompatibilityFixture({
  characterId: "auth-sse-character", ownerUserId,
  attemptId: "auth-sse-attempt", createdAt: new Date().toISOString(),
}).sheet;
let providerCalls = 0;
const llm = new Proxy(new MockLlmProvider(), {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== "function") return value;
    return () => { providerCalls += 1; throw new Error("UNEXPECTED_PROVIDER_CALL"); };
  },
});
const app = buildRoutes({ llm });
before(async () => {
  for (const id of [ownerUserId, "auth-sse-other"]) {
    await query("INSERT INTO users (id, username, password_hash, created_at) VALUES ($1,$1,'x',$2)",
      [id, new Date().toISOString()]);
    await query("INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES ($1,$2,$3,$4)",
      [`session-${id}`, id, new Date().toISOString(), new Date(Date.now() + 60_000).toISOString()]);
  }
});
after(async () => { await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });
async function assertClean() {
  for (const table of ["battles", "idempotency_keys", "battle_leases"]) {
    const result = await query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
    assert.equal(Number(result.rows[0]?.count), 0, table);
  }
  assert.equal(providerCalls, 0);
}
describe("authenticated staged SSE smoke", () => {
  it("streams a terminal error through actual routes, retains access checks and cleans state", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), "Bearer staged-token");
      assert.equal(headers.get("x-kshiai-origin"), "origin-token");
      const missing = await app.request("/api/battles/missing/advance/stream", {
        method: "POST", headers: { Cookie: `kshiai_session=session-${ownerUserId}`, "Idempotency-Key": "missing-auth-sse-proof" },
      });
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), { error: "not_found" });
      const denied = await app.request(String(url), {
        ...init, headers: { ...Object.fromEntries(headers), Cookie: "kshiai_session=session-auth-sse-other" },
      });
      assert.equal(denied.status, 403);
      headers.set("Cookie", `kshiai_session=session-${ownerUserId}`);
      return app.request(String(url), { ...init, headers });
    };
    await smokeAuthenticatedSse({ apiBaseUrl: "http://localhost", accessToken: "staged-token",
      originSecret: "origin-token", ownerUserId, fixture, fetchImpl });
    await assertClean();
  });
  it("cleans the isolated fixture when the transport fails", async () => {
    await assert.rejects(smokeAuthenticatedSse({ apiBaseUrl: "http://localhost", accessToken: "token",
      ownerUserId, fixture, fetchImpl: async () => new Response("failed", { status: 503 }) }), /503/);
    await assertClean();
  });
  it("rejects non-SSE responses rather than treating a JSON error as transport proof", async () => {
    await assert.rejects(smokeAuthenticatedSse({ apiBaseUrl: "http://localhost", accessToken: "token",
      ownerUserId, fixture, fetchImpl: async () => new Response('{}', {
        headers: { "content-type": "application/json" },
      }) }), /another content type/);
    await assertClean();
  });
});
