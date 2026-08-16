import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { battleProgressText, battleStoryBlocks } from "./battle-screen.js";

describe("battle screen model", () => {
  it("uses narration entries as the only story when any exist", () => {
    const blocks = battleStoryBlocks({
      entries: [{
        turnReceiptId: "r1",
        sequence: 1,
        phase: "combat",
        combatTurn: 3,
        status: "completed",
        narrative: { turn: 3, narrator: ["新しく届いた語り"], speeches: [] },
      }],
      legacyLog: [{ turn: 1, narrator: ["古いログ"], speeches: [] }],
    });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.key, "r1");
    assert.equal(blocks[0]?.heading, "戦闘");
    assert.equal(blocks[0]?.heading.includes("ターン"), false);
    assert.equal(blocks[0]?.narrative?.narrator[0], "新しく届いた語り");
  });

  it("falls back to the snapshot log only before the narration stream has entries", () => {
    const blocks = battleStoryBlocks({
      entries: [],
      legacyLog: [{ turn: 0, narrator: ["開幕。雨が石畳を叩く。"], speeches: [] }],
    });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.heading, "プロローグ");
    assert.equal(blocks[0]?.streaming, false);
  });

  it("keeps pending narration in the story instead of mixing snapshot log", () => {
    const blocks = battleStoryBlocks({
      entries: [{
        turnReceiptId: "r2",
        sequence: 2,
        phase: "combat",
        combatTurn: 4,
        status: "generating",
        narrative: null,
      }],
      legacyLog: [{ turn: 4, narrator: ["スナップショット側"], speeches: [] }],
    });
    assert.equal(blocks[0]?.streaming, true);
    assert.equal(blocks[0]?.pendingText, "語りを生成しています…");
    assert.equal(blocks[0]?.narrative, null);
  });

  it("names progress from pause, advance phase, or the idle auto-advance state", () => {
    assert.equal(battleProgressText({
      paused: true,
      error: null,
      busy: false,
      phase: null,
    }), "一時停止中");
    assert.equal(battleProgressText({
      paused: false,
      error: null,
      busy: true,
      phase: "agents",
    }), "キャラの反応を紡いでいます…");
    assert.equal(battleProgressText({
      paused: false,
      error: null,
      busy: false,
      phase: null,
    }), "自動進行中");
    assert.equal(battleProgressText({
      paused: false,
      error: "ADVANCE_OPERATION_CONFLICT",
      busy: false,
      phase: null,
    }), "進行できませんでした");
  });
});
