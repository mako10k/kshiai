import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-account-access-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "account-access.db");
process.env.ADMIN_EMAILS = "mako10k@mk10.org";

const access = await import("./account-access.js");
const { requireInternalObservability } = await import("./auth.js");
const { closeDatabase, getDb } = await import("./db.js");

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
    "2026-08-07T00:00:00.000Z",
  );
}

describe("account realm access", () => {
  it("fails unknown account kinds closed to the general realm", () => {
    assert.equal(access.normalizeAccountKind("unknown"), "general");
    assert.equal(access.accountRealm("general"), "general");
    assert.equal(access.accountRealm("developer"), "test");
    assert.equal(access.accountRealm("test"), "test");
    assert.equal(access.accountRealm("e2e"), "test");
  });

  it("isolates general and test realms while administrators can access both", async () => {
    insertUser({ id: "general", email: "general@example.test", kind: "general" });
    insertUser({ id: "developer", email: "developer@example.test", kind: "developer" });
    insertUser({ id: "test", email: "test@example.test", kind: "test" });
    insertUser({ id: "e2e", email: "e2e@example.test", kind: "e2e" });
    insertUser({ id: "admin", email: "mako10k@mk10.org", kind: "general" });

    const [general, developer, test, e2e, admin] = await Promise.all([
      access.getUserAccessProfile("general"),
      access.getUserAccessProfile("developer"),
      access.getUserAccessProfile("test"),
      access.getUserAccessProfile("e2e"),
      access.getUserAccessProfile("admin"),
    ]);
    assert.equal(general.isAdmin, false);
    assert.equal(admin.isAdmin, true);
    assert.equal(access.canAccessAccountKind(general, "e2e"), false);
    assert.equal(access.canAccessAccountKind(developer, "e2e"), true);
    assert.equal(access.canAccessAccountKind(test, "general"), false);
    assert.equal(access.canAccessAccountKind(test, "e2e"), true);
    assert.equal(access.canAccessAccountKind(e2e, "test"), true);
    assert.equal(access.canAccessAccountKind(admin, "e2e"), true);
    assert.equal(await access.canUserAccessOwner("general", "test"), false);
    assert.equal(await access.canUserAccessOwner("e2e", "test"), true);
    assert.equal(await access.canUserAccessOwner("admin", "e2e"), true);
    assert.equal(access.internalObservabilityRole(general), null);
    assert.equal(access.internalObservabilityRole(developer), "developer");
    assert.equal(access.internalObservabilityRole(test), "test");
    assert.equal(access.internalObservabilityRole(e2e), "e2e");
    assert.equal(access.internalObservabilityRole(admin), "admin");
  });

  it("hides internal observability from general users", async () => {
    insertUser({
      id: "general-guard",
      email: "general-guard@example.test",
      kind: "general",
    });
    insertUser({
      id: "developer-guard",
      email: "developer-guard@example.test",
      kind: "developer",
    });
    const app = new Hono();
    app.use("*", async (context, next) => {
      const id = context.req.header("x-test-user") ?? "general-guard";
      context.set("user", { id, username: id });
      await next();
    });
    app.get("/", requireInternalObservability, (context) =>
      context.json({ role: context.get("internalObservabilityRole") })
    );

    const hidden = await app.request("/", {
      headers: { "x-test-user": "general-guard" },
    });
    assert.equal(hidden.status, 404);
    assert.deepEqual(await hidden.json(), { error: "not_found" });

    const allowed = await app.request("/", {
      headers: { "x-test-user": "developer-guard" },
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { role: "developer" });
  });
});
