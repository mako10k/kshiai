import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-auth-test-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "auth.db");

const auth = await import("./auth.js");
const { closeDatabase } = await import("./db.js");

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("asynchronous authentication persistence", () => {
  it("registers, verifies, and destroys a shared session", async () => {
    const user = await auth.registerUser("alice", "password-12345");
    assert.equal((await auth.verifyLogin("alice", "wrong-password")), null);
    assert.equal((await auth.verifyLogin("alice", "password-12345"))?.id, user.id);

    const token = await auth.createSession(user.id);
    assert.equal((await auth.userFromToken(token))?.id, user.id);
    await auth.destroySession(token);
    assert.equal(await auth.userFromToken(token), null);
  });

  it("maps a Supabase identity to one stable application user", async () => {
    const identity = {
      subject: "c98a95c8-61bb-41e7-b2e2-c54a058c518d",
      email: "fighter@example.test",
      displayName: "闘士",
    };
    const [first, second] = await Promise.all([
      auth.ensureSupabaseUser(identity),
      auth.ensureSupabaseUser(identity),
    ]);
    assert.equal(first.id, second.id);
    assert.equal(first.username, second.username);
    assert.match(first.username, /^闘士-/);
  });

  it("maps unique username violations to the stable domain error", async () => {
    await assert.rejects(
      auth.registerUser("alice", "another-password"),
      /USERNAME_TAKEN/,
    );
  });

  it("fails closed unless an administrator id or email is allow-listed", () => {
    assert.equal(
      auth.adminIdentityMatches({
        userId: "u1",
        email: "admin@example.test",
        allowedUserIds: [],
        allowedEmails: [],
      }),
      false,
    );
    assert.equal(
      auth.adminIdentityMatches({
        userId: "u1",
        email: "ADMIN@example.test",
        allowedUserIds: [],
        allowedEmails: ["admin@example.test"],
      }),
      true,
    );
  });
});
