import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-e2e-session-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(temporaryDirectory, "e2e-session.db");
process.env.ADMIN_EMAILS = "mako10k@mk10.org";

const { closeDatabase, getDb } = await import("../db.js");
const { E2E_ACCOUNT_EMAILS } = await import("../e2e-observer.js");
const {
  canMintE2eSession,
  listE2eSessionAudits,
  mintE2eSession,
} = await import("./e2e-session.js");

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

describe("e2e session mint", () => {
  it("allows only administrators and developers to mint", () => {
    assert.equal(canMintE2eSession({ isAdmin: true, accountKind: "general" }), true);
    assert.equal(canMintE2eSession({ isAdmin: false, accountKind: "developer" }), true);
    assert.equal(canMintE2eSession({ isAdmin: false, accountKind: "general" }), false);
    assert.equal(canMintE2eSession({ isAdmin: false, accountKind: "test" }), false);
    assert.equal(canMintE2eSession({ isAdmin: false, accountKind: "e2e" }), false);
  });

  it("rotates a new password, keeps the fixture identity, and writes a non-secret audit", async () => {
    insertUser({
      id: "usr_e2e_observer",
      email: E2E_ACCOUNT_EMAILS.observer,
      kind: "e2e",
    });
    const passwords: string[] = [];
    const first = await mintE2eSession({
      operatorUserId: "usr_admin",
      target: "observer",
      now: "2026-08-16T03:00:00.000Z",
      rotatePassword: async (_email, password) => {
        passwords.push(password);
      },
    });
    const second = await mintE2eSession({
      operatorUserId: "usr_admin",
      target: "observer",
      now: "2026-08-16T03:01:00.000Z",
      rotatePassword: async (_email, password) => {
        passwords.push(password);
      },
    });
    assert.equal(first.email, E2E_ACCOUNT_EMAILS.observer);
    assert.equal(first.accountKind, "e2e");
    assert.notEqual(first.password, second.password);
    assert.equal(passwords[0], first.password);
    assert.equal(passwords[1], second.password);
    assert.match(first.password, /^E2E-[0-9a-f-]{36}-9a!$/);

    const audits = await listE2eSessionAudits();
    assert.equal(audits.length, 2);
    assert.deepEqual(audits[0]?.payload, {
      target: "observer",
      operatorUserId: "usr_admin",
    });
    assert.equal("password" in audits[0]!.payload, false);
    assert.doesNotMatch(JSON.stringify(audits), /E2E-[0-9a-f-]{36}-9a!/);
  });

  it("fails closed when the fixture application user is missing", async () => {
    await assert.rejects(
      () => mintE2eSession({
        operatorUserId: "usr_admin",
        target: "opponent",
        rotatePassword: async () => {
          throw new Error("rotate must not run");
        },
      }),
      /E2E_SESSION_FIXTURE_MISSING/,
    );
  });
});
