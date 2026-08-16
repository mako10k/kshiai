import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-e2e-session-route-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "routes.db");
process.env.ADMIN_EMAILS = "mako10k@mk10.org";

const { closeDatabase, getDb } = await import("./db.js");
const { requireE2eSessionOperator } = await import("./auth.js");
const { E2E_ACCOUNT_EMAILS } = await import("./e2e-observer.js");
const { mintE2eSession } = await import("./services/e2e-session.js");

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

function insertUser(input: {
  id: string;
  email: string;
  kind: "general" | "developer" | "test" | "e2e";
}): void {
  getDb().prepare(
    `INSERT INTO users
      (id, username, password_hash, email, account_kind, created_at)
     VALUES (?, ?, 'x', ?, ?, ?)`,
  ).run(
    input.id,
    input.id,
    input.email,
    input.kind,
    "2026-08-16T00:00:00.000Z",
  );
}

describe("e2e session route guard", () => {
  it("hides mint from general, test, and e2e callers", async () => {
    insertUser({ id: "general", email: "general@example.test", kind: "general" });
    insertUser({ id: "test", email: "test@example.test", kind: "test" });
    insertUser({ id: "e2e", email: E2E_ACCOUNT_EMAILS.observer, kind: "e2e" });
    insertUser({ id: "developer", email: "developer@example.test", kind: "developer" });
    insertUser({ id: "admin", email: "mako10k@mk10.org", kind: "general" });

    const app = new Hono();
    app.use("*", async (context, next) => {
      const id = context.req.header("x-test-user") ?? "general";
      context.set("user", { id, username: id, displayName: id });
      await next();
    });
    app.post("/", requireE2eSessionOperator, async (context) => {
      const session = await mintE2eSession({
        operatorUserId: context.get("user").id,
        target: "observer",
        rotatePassword: async () => undefined,
      });
      return context.json({ email: session.email, accountKind: session.accountKind });
    });

    for (const id of ["general", "test", "e2e"]) {
      const hidden = await app.request("/", {
        method: "POST",
        headers: { "x-test-user": id },
      });
      assert.equal(hidden.status, 404, id);
      assert.deepEqual(await hidden.json(), { error: "not_found" });
    }

    const allowed = await app.request("/", {
      method: "POST",
      headers: { "x-test-user": "developer" },
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), {
      email: E2E_ACCOUNT_EMAILS.observer,
      accountKind: "e2e",
    });
  });
});
