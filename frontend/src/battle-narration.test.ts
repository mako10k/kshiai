import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  narrationStateFromSnapshot,
  reduceNarrationEvent,
} from "./battle-narration.js";

describe("battle narration reducer", () => {
  it("replaces one receipt and ignores at-least-once duplicates", () => {
    const initial = narrationStateFromSnapshot({
      battleId: "battle-1",
      cursor: "cursor-1",
      reset: true,
      entries: [{
        turnReceiptId: "receipt-1",
        sequence: 1,
        phase: "combat",
        combatTurn: 1,
        status: "queued",
        narrative: null,
      }],
    });
    const event = {
      eventId: "event-2",
      cursor: "cursor-2",
      type: "narration" as const,
      entry: {
        turnReceiptId: "receipt-1",
        sequence: 1,
        phase: "combat" as const,
        combatTurn: 1,
        status: "completed" as const,
        narrative: { turn: 1, narrator: ["terminal"], speeches: [] },
      },
    };
    const completed = reduceNarrationEvent(initial, event);
    assert.equal(completed.entries.length, 1);
    assert.equal(completed.entries[0]?.status, "completed");
    assert.equal(reduceNarrationEvent(completed, event), completed);
  });

  it("orders successor receipts even when events arrive out of order", () => {
    const initial = narrationStateFromSnapshot({
      battleId: "battle-1",
      cursor: null,
      reset: true,
      entries: [],
    });
    const second = reduceNarrationEvent(initial, {
      eventId: "event-2",
      cursor: "cursor-2",
      type: "narration",
      entry: {
        turnReceiptId: "receipt-2",
        sequence: 2,
        phase: "judgment",
        combatTurn: 1,
        status: "queued",
        narrative: null,
      },
    });
    const first = reduceNarrationEvent(second, {
      eventId: "event-1",
      cursor: "cursor-1",
      type: "narration",
      entry: {
        turnReceiptId: "receipt-1",
        sequence: 1,
        phase: "combat",
        combatTurn: 1,
        status: "queued",
        narrative: null,
      },
    });
    assert.deepEqual(first.entries.map((entry) => entry.sequence), [1, 2]);
  });
});
