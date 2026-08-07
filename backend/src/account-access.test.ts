import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-account-access-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "account-access.db");
process.env.ADMIN_EMAILS = "mako10k@mk10.org";

const access = await import("./account-access.js");
const { closeDatabase, getDb } = await import("./db.js");

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

function insertUser(input: {
  id: string;
  email: string;
  kind: "general" | "test" | "e2e";
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
    assert.equal(access.accountRealm("test"), "test");
    assert.equal(access.accountRealm("e2e"), "test");
  });

  it("isolates general and test realms while administrators can access both", async () => {
    insertUser({ id: "general", email: "general@example.test", kind: "general" });
    insertUser({ id: "test", email: "test@example.test", kind: "test" });
    insertUser({ id: "e2e", email: "e2e@example.test", kind: "e2e" });
    insertUser({ id: "admin", email: "mako10k@mk10.org", kind: "general" });

    const [general, test, e2e, admin] = await Promise.all([
      access.getUserAccessProfile("general"),
      access.getUserAccessProfile("test"),
      access.getUserAccessProfile("e2e"),
      access.getUserAccessProfile("admin"),
    ]);
    assert.equal(general.isAdmin, false);
    assert.equal(admin.isAdmin, true);
    assert.equal(access.canAccessAccountKind(general, "e2e"), false);
    assert.equal(access.canAccessAccountKind(test, "general"), false);
    assert.equal(access.canAccessAccountKind(test, "e2e"), true);
    assert.equal(access.canAccessAccountKind(e2e, "test"), true);
    assert.equal(access.canAccessAccountKind(admin, "e2e"), true);
    assert.equal(await access.canUserAccessOwner("general", "test"), false);
    assert.equal(await access.canUserAccessOwner("e2e", "test"), true);
    assert.equal(await access.canUserAccessOwner("admin", "e2e"), true);
  });
});
