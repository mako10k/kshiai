import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultParameters, defaultRecord, type CharacterSheet } from "@kshiai/shared";

const tempDir = mkdtempSync(join(tmpdir(), "kshiai-character-test-"));
process.env.DATABASE_PATH = join(tempDir, "test.db");
const repo = await import("./characters.js");
const { getDb } = await import("../db.js");

after(() => rmSync(tempDir, { recursive: true, force: true }));

function sheet(id: string, ownerUserId: string, displayName: string): CharacterSheet {
  const now = "2026-08-02T00:00:00.000Z";
  return {
    id,
    ownerUserId,
    displayName,
    identity: {
      realName: `${displayName} 本名`,
      nicknames: [displayName],
      selfNames: ["私"],
      epithets: [],
      gender: "女性",
      age: "25",
    },
    tags: [],
    createdAt: now,
    updatedAt: now,
    appearance: { summary: `${displayName}の姿`, visualPrompt: displayName },
    traits: ["勇敢"],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: `${displayName}の紹介`,
    record: defaultRecord(),
  };
}

describe("owner-scoped character generation references", () => {
  it("never returns another user's character from search or direct lookup", async () => {
    const db = getDb();
    const insertUser = db.prepare(
      `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, 'x', ?)`,
    );
    insertUser.run("user-a", "alice", "2026-08-02T00:00:00.000Z");
    insertUser.run("user-b", "bob", "2026-08-02T00:00:00.000Z");
    await repo.saveSheet(sheet("char-a", "user-a", "楓"));
    await repo.saveSheet(sheet("char-b", "user-b", "比堂"));

    assert.deepEqual(
      (await repo.searchOwnedCharacterReferences("user-a", "")).map((item) => item.id),
      ["char-a"],
    );
    assert.equal(await repo.getOwnedCharacterReference("user-a", "char-b"), null);
    assert.equal((await repo.getOwnedCharacterReference("user-a", "char-a"))?.identity.realName, "楓 本名");
  });

  it("lists all active identifying names for owner-scoped uniqueness checks", async () => {
    assert.deepEqual(await repo.listOwnedCharacterReservedNames("user-a"), [
      "楓",
      "楓 本名",
    ]);
    assert.deepEqual(await repo.listOwnedCharacterReservedNames("user-b"), [
      "比堂",
      "比堂 本名",
    ]);
  });
});
