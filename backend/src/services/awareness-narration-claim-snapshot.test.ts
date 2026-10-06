// R: Reproduce statement-level interleaving without replacing atomic receipt provenance checks.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwarenessInitialize, AwarenessFrozenNarrationSchema, BattleStateSchema } from "@kshiai/shared";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";
import { captureAwarenessNarrationClaimSnapshot, type AwarenessNarrationClaimReadPort, type AwarenessNarrationClaimSnapshot } from "./awareness-narration-claim-snapshot.js";
import { materialFromEntry } from "./awareness-narration-worker-material.js";
import type { Entry } from "./awareness-narration-worker-contract.js";
import { requestDigest } from "./distributed-guard.js";

const now = Date.parse("2026-10-06T00:00:00Z");
function version(count: number): AwarenessNarrationClaimSnapshot {
  const battleId = "statement-snapshot";
  const { state } = validAwarenessBattleFixture(battleId);
  const materials = Array.from({ length: count }, (_, index) => AwarenessFrozenNarrationSchema.parse({
    kind: "awareness-v5", phase: "combat", battleId, turnReceiptId: `${battleId}:phase:${index + 1}`, turn: index + 1,
    system: "確定出来事を実況", user: "両者が身構えた", urgent: false, sourceSpeeches: [], recognitionRefs: [], judgmentVerdict: null,
  }));
  const entries: Entry[] = materials.map((material, index) => ({ battle_id: battleId, receipt_id: material.turnReceiptId,
    sequence: index + 1, phase: "combat", combat_turn: index + 1, input_json: material,
    input_digest: requestDigest(material), status: "queued",
    active_attempt_id: null, attempt_count: 0, created_at: new Date(now).toISOString() }));
  const battle = BattleStateSchema.parse({ ...state, battleRevision: count, phaseReceiptSequence: count,
    phaseReceipts: entries.map((entry, index) => ({ schemaVersion: 1, id: entry.receipt_id, sequence: entry.sequence,
      operationId: `operation-${entry.sequence}`, phase: entry.phase, combatTurn: entry.combat_turn, fromRevision: index,
      toRevision: index + 1, committedAt: entry.created_at, narrationInput: materials[index], narrationInputDigest: entry.input_digest })) });
  return { entries, battle, runtime: { battleId, revision: count, fencingToken: 1, updatedAt: new Date(now).toISOString(),
    runtime: AwarenessInitialize({ startedAt: now, promptRevision: "test", outputRevision: "test" }) } };
}
function assertProvenance(snapshot: AwarenessNarrationClaimSnapshot) {
  for (const entry of snapshot.entries) {
    const material = materialFromEntry(entry);
    const receipt = snapshot.battle.phaseReceipts?.find((candidate) => candidate.id === entry.receipt_id);
    assert.ok(receipt);
    assert.equal(receipt.phase, entry.phase);
    assert.equal(receipt.narrationInputDigest, entry.input_digest);
    assert.equal(requestDigest(receipt.narrationInput), requestDigest(material));
    assert.deepEqual(receipt.narrationInput, material);
    assert.ok(Number.isFinite(Date.parse(receipt.committedAt)));
  }
}
describe("narration claim statement read order", () => {
  it("captures old entries before an interleaved atomic commit and validates them against the newer battle", async () => {
    let stored = version(1);
    const committed = version(2);
    const reads: string[] = [];
    let firstStatement = true;
    const commitBetweenStatements = () => {
      if (firstStatement) { firstStatement = false; stored = committed; }
    };
    const port: AwarenessNarrationClaimReadPort = {
      async readEntries() { reads.push("entries"); const rows = stored.entries; commitBetweenStatements(); return rows; },
      async readBattle() { reads.push("battle"); const battle = stored.battle; commitBetweenStatements(); return battle; },
      async readRuntime() { reads.push("runtime"); return stored.runtime; },
    };
    const captured = await captureAwarenessNarrationClaimSnapshot(port);
    assert.ok(captured);
    assertProvenance(captured);
    assert.deepEqual(reads, ["entries", "battle", "runtime"]);
    assert.equal(captured.entries.length, 1);
    assert.equal(captured.battle.phaseReceipts?.length, 2);
  });
  it("includes a newly committed receipt when its atomic commit precedes entry capture", async () => {
    const stored = version(2);
    const captured = await captureAwarenessNarrationClaimSnapshot({ readEntries: async () => stored.entries,
      readBattle: async () => stored.battle, readRuntime: async () => stored.runtime });
    assert.ok(captured);
    assert.equal(captured.entries.length, 2);
    assertProvenance(captured);
  });
  it("leaves a receipt arriving after an empty capture for the next capture", async () => {
    let stored = version(0);
    const port: AwarenessNarrationClaimReadPort = { async readEntries() { const rows = stored.entries; stored = version(1); return rows; },
      readBattle: async () => stored.battle, readRuntime: async () => stored.runtime };
    const first = await captureAwarenessNarrationClaimSnapshot(port);
    assert.ok(first); assert.deepEqual(first.entries, []);
    const second = await captureAwarenessNarrationClaimSnapshot(port);
    assert.ok(second); assert.equal(second.entries.length, 1);
    assertProvenance(second);
  });
  it("preserves missing battle acknowledgement and missing runtime errors even for empty entries", async () => {
    let runtimeReads = 0;
    assert.equal(await captureAwarenessNarrationClaimSnapshot({ readEntries: async () => [], readBattle: async () => null,
      readRuntime: async () => { runtimeReads++; return null; } }), null);
    assert.equal(runtimeReads, 0);
    await assert.rejects(captureAwarenessNarrationClaimSnapshot({ readEntries: async () => [],
      readBattle: async () => version(0).battle, readRuntime: async () => null }), /AWARENESS_RUNTIME_NOT_FOUND/);
  });
  it("does not repair or discard a corrupted material before the strict material validator sees it", async () => {
    const stored = version(1);
    const original = stored.entries[0]; assert.ok(original);
    const corrupted: Entry = { ...original, input_json: { kind: "awareness-v5", invalid: true } };
    const captured = await captureAwarenessNarrationClaimSnapshot({ readEntries: async () => [corrupted],
      readBattle: async () => stored.battle, readRuntime: async () => stored.runtime });
    assert.ok(captured);
    assert.equal(captured.entries[0], corrupted);
    assert.throws(() => materialFromEntry(corrupted));
  });
});
