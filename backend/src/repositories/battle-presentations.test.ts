import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "kshiai-presentation-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(tempDir, "test.db");

const { query } = await import("../db.js");
const { listBattlePresentations, saveBattlePresentation } =
  await import("./battle-presentations.js");

describe("battle presentation read model", () => {
  it("orders immutable receipt presentations and rejects digest drift", async () => {
    const now = new Date().toISOString();
    await query(
      `INSERT INTO battles
        (id, state_json, side_a_user_id, side_a_character_id,
         side_b_character_id, created_at, updated_at, revision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ["battle-presentation", "{}", "user-a", "char-a", "char-b", now, now, 0],
    );
    const digest = "a".repeat(64);
    await saveBattlePresentation({
      battleId: "battle-presentation",
      receiptId: "receipt-2",
      sequence: 2,
      phase: "combat",
      combatTurn: 1,
      inputDigest: digest,
      narrative: { turn: 1, narrator: ["second"], speeches: [] },
      createdAt: now,
    });
    await saveBattlePresentation({
      battleId: "battle-presentation",
      receiptId: "receipt-1",
      sequence: 1,
      phase: "prologue",
      combatTurn: null,
      inputDigest: digest,
      narrative: { turn: 0, narrator: ["first"], speeches: [] },
      createdAt: now,
    });
    assert.deepEqual(
      (await listBattlePresentations("battle-presentation"))
        .flatMap((block) => block.narrator),
      ["first", "second"],
    );
    await assert.rejects(
      saveBattlePresentation({
        battleId: "battle-presentation",
        receiptId: "receipt-1",
        sequence: 1,
        phase: "prologue",
        combatTurn: null,
        inputDigest: "b".repeat(64),
        narrative: { turn: 0, narrator: ["changed"], speeches: [] },
        createdAt: now,
      }),
      /PRESENTATION_DIGEST_CONFLICT/,
    );
  });
});
