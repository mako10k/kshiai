import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultParameters, defaultRecord, type CharacterSheet } from "@kshiai/shared";

const tempDir = mkdtempSync(join(tmpdir(), "kshiai-character-test-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(tempDir, "test.db");
process.env.ADMIN_EMAILS = "mako10k@mk10.org";
const repo = await import("./characters.js");
const draftRepo = await import("./character-drafts.js");
const { pickAutoMatchedOpponent } = await import("../services/battle-service.js");
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

  it("persists one owner-scoped review draft until confirm or discard", async () => {
    const first = sheet("draft-char-a", "user-a", "下書きA");
    await draftRepo.saveCharacterDraft({
      id: "draft-a",
      ownerUserId: "user-a",
      sheet: first,
      assistantMessage: "確認してください。",
      createdAt: first.createdAt,
      updatedAt: first.updatedAt,
    });
    assert.equal(
      (await draftRepo.getLatestCharacterDraft("user-a"))?.sheet.displayName,
      "下書きA",
    );
    assert.equal(await draftRepo.getCharacterDraft("draft-a", "user-b"), null);

    const second = sheet("draft-char-b", "user-a", "下書きB");
    await draftRepo.saveCharacterDraft({
      id: "draft-b",
      ownerUserId: "user-a",
      sheet: second,
      assistantMessage: "更新しました。",
      createdAt: second.createdAt,
      updatedAt: "2026-08-02T00:01:00.000Z",
    });
    assert.equal(await draftRepo.getCharacterDraft("draft-a", "user-a"), null);
    assert.equal(await draftRepo.deleteCharacterDraft("draft-b", "user-a"), true);
    assert.equal(await draftRepo.getLatestCharacterDraft("user-a"), null);
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
    assert.deepEqual(
      await repo.listOwnedCharacterReservedNames("user-a", "char-a"),
      [],
    );
  });

  it("keeps bounded pre-battle plans and reflections for each opponent", async () => {
    const first = await repo.saveOpponentBattleMemory({
      characterId: "char-a",
      opponentId: "char-b",
      preBattlePlan: "距離を取り、相手の癖を観察する。",
      postBattleReflection: "守りを崩す前に、間合いを測るべきだった。",
      battledAt: "2026-08-09T00:00:00.000Z",
    });
    assert.deepEqual(first, {
      preBattlePlan: "距離を取り、相手の癖を観察する。",
      postBattleReflection: "守りを崩す前に、間合いを測るべきだった。",
      battleCount: 1,
      lastBattleAt: "2026-08-09T00:00:00.000Z",
    });

    const second = await repo.saveOpponentBattleMemory({
      characterId: "char-a",
      opponentId: "char-b",
      postBattleReflection: "次は誘いを混ぜて反応を見る。",
      battledAt: "2026-08-09T01:00:00.000Z",
    });
    assert.equal(second?.battleCount, 2);
    assert.equal(second?.preBattlePlan, "距離を取り、相手の癖を観察する。");
    assert.equal(second?.postBattleReflection, "次は誘いを混ぜて反応を見る。");
    assert.equal(
      (await repo.getSheet("char-a"))?.opponentMemories?.["char-b"]?.lastBattleAt,
      "2026-08-09T01:00:00.000Z",
    );
  });

  it("auto-matches the nearest rating and combat profile", async () => {
    const far = sheet("char-far", "user-b", "遠い相手");
    far.record = { ...defaultRecord(), rating: 2100 };
    far.parameters.atk = 18;
    far.parameters.def = 5;
    await repo.saveSheet(far);

    const matched = await pickAutoMatchedOpponent("user-a", "char-a");
    assert.equal(matched?.id, "char-b");
  });

  it("centers active character ratings without compensating for deletion", async () => {
    const before = await repo.getRatingDisplayContext();
    assert.deepEqual(before.public, {
      ratingTotal: 5100,
      characterCount: 3,
    });

    const charABefore = await repo.getSheet("char-a");
    assert.ok(charABefore);
    const deleted = await repo.softDeleteCharacter("char-far", "user-b");
    assert.ok(deleted);

    const after = await repo.getRatingDisplayContext();
    assert.deepEqual(after.public, {
      ratingTotal: 3000,
      characterCount: 2,
    });
    assert.equal((await repo.getSheet("char-a"))?.record?.rating, 1500);

    const active = await Promise.all([
      repo.toPublicCharacterForViewer(charABefore!, "user-a", after),
      repo.toPublicCharacterForViewer(
        (await repo.getSheet("char-b"))!,
        "user-a",
        after,
      ),
    ]);
    const visibleAverage =
      active.reduce((total, character) => total + character.record.rating, 0) /
      active.length;
    assert.equal(visibleAverage, 1500);
  });

  it("isolates test characters and rating populations from general users", async () => {
    const db = getDb();
    const insertUser = db.prepare(
      `INSERT INTO users
        (id, username, password_hash, email, account_kind, created_at)
       VALUES (?, ?, 'x', ?, ?, ?)`,
    );
    insertUser.run(
      "user-e2e-a",
      "e2e-a",
      "e2e-a@example.test",
      "e2e",
      "2026-08-07T00:00:00.000Z",
    );
    insertUser.run(
      "user-e2e-b",
      "e2e-b",
      "e2e-b@example.test",
      "test",
      "2026-08-07T00:00:00.000Z",
    );
    insertUser.run(
      "user-admin",
      "admin",
      "mako10k@mk10.org",
      "general",
      "2026-08-07T00:00:00.000Z",
    );
    await repo.saveSheet(sheet("char-e2e-a", "user-e2e-a", "観測者"));
    await repo.saveSheet(sheet("char-e2e-b", "user-e2e-b", "対照役"));

    const generalIds = (await repo.listPlayableOpponentSheets("user-a"))
      .map((item) => item.id);
    const e2eIds = (await repo.listPlayableOpponentSheets("user-e2e-a"))
      .map((item) => item.id);
    const adminIds = (await repo.listPlayableOpponentSheets("user-admin"))
      .map((item) => item.id);
    assert.equal(generalIds.includes("char-e2e-b"), false);
    assert.equal(e2eIds.includes("char-b"), false);
    assert.equal(e2eIds.includes("char-e2e-b"), true);
    assert.equal(adminIds.includes("char-b"), true);
    assert.equal(adminIds.includes("char-e2e-b"), true);
    assert.equal(
      await repo.canViewCharacter("user-a", (await repo.getSheet("char-e2e-a"))!),
      false,
    );
    assert.deepEqual((await repo.getRatingDisplayContext("test")).public, {
      ratingTotal: 3000,
      characterCount: 2,
    });
    assert.deepEqual((await repo.getRatingDisplayContext("general")).public, {
      ratingTotal: 3000,
      characterCount: 2,
    });
  });
});
