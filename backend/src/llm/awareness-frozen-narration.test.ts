// R: Verify immutable narration material, phase contracts, and exact dispatch coverage.
import { AwarenessLongMeasurementPolicy } from "@kshiai/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwarenessFrozenNarrationSchema, prepareAwarenessFrozenNarrationRequest, validateAwarenessFrozenNarrationResults, type AwarenessFrozenNarration } from "./awareness-frozen-narration.js";
import { freezeAwarenessNarration } from "./awareness-narration-phase.js";
import { TransportAwarenessNarrationProvider } from "./awareness-narration.js";
import type { AwarenessJsonTransport } from "./awareness-provider-contract.js";

function material(phase: AwarenessFrozenNarration["phase"] = "combat"): AwarenessFrozenNarration {
  return AwarenessFrozenNarrationSchema.parse({ kind: "awareness-v5", phase, battleId: "battle", turnReceiptId: "receipt", turn: phase === "prologue" ? 0 : 1, system: "確定資料から実況する", user: "白い姿が身構えた", urgent: phase !== "combat", sourceSpeeches: phase === "judgment" ? [] : [{ side: "a", text: "待て。" }], recognitionRefs: [], judgmentVerdict: phase === "judgment" ? "判定は引き分け。" : null });
}
function raw(source: AwarenessFrozenNarration) {
  const identity = { phase: source.phase, battleId: source.battleId, turnReceiptId: source.turnReceiptId, turn: source.turn };
  if (source.phase === "judgment") return { receipts: [{ ...identity, before: ["雨が静まる。"], after: [] }] };
  const speeches = [{ sourceSide: "a", speaker: "白い姿", text: "待て。", afterNarratorLine: 0 }];
  if (source.phase === "aftermath") return { receipts: [{ ...identity, before: ["静けさが戻る。"], after: [], speeches, recognitionUpdates: [] }] };
  return { receipts: [{ ...identity, narrator: source.phase === "prologue" ? ["開幕。", "雨の路地。", "白い影。", "黒い影。"] : ["白い姿が構える。", "雨が降る。"], speeches, recognitionUpdates: [] }] };
}

describe("awareness frozen narration", () => {
  it("dispatches the exact prepared material for every phase without another interpretation call", async () => {
    for (const phase of ["combat", "prologue", "aftermath", "judgment"] as const) {
      const source = material(phase);
      let calls = 0;
      const transport: AwarenessJsonTransport = { identity: { provider: "xai", engineModel: "grok-4.5", fastModel: "grok-4.3" }, async requestJson(system, user, options) {
        calls++;
        assert.deepEqual({ system, user, options }, prepareAwarenessFrozenNarrationRequest([source], 9000));
        return raw(source);
      } };
      const result = await new TransportAwarenessNarrationProvider(transport).narrateFrozenBatch([source], 9000);
      assert.equal(result[0]?.phase, phase);
      assert.equal(calls, 1);
    }
  });
  it("uses the bound long narration deadline and preserves a shorter absolute deadline", async () => {
    const source = material();
    const prepared = prepareAwarenessFrozenNarrationRequest([source], undefined, undefined, AwarenessLongMeasurementPolicy);
    assert.equal(prepared.options.timeoutMs, 60000); assert.equal(prepared.options.maxCompletionTokens, 1200);
    assert.equal(prepareAwarenessFrozenNarrationRequest([source], 45000, undefined, AwarenessLongMeasurementPolicy).options.timeoutMs, 45000);
    const transport: AwarenessJsonTransport = { identity: { provider: "xai", engineModel: "grok-engine", fastModel: "grok-fast" },
      async requestJson(system, user, options) { assert.deepEqual({ system, user, options }, prepared); return raw(source); } };
    await new TransportAwarenessNarrationProvider(transport, AwarenessLongMeasurementPolicy).narrateFrozenBatch([source]);
  });
  it("applies a receipt-bound policy override without changing a shared provider's default", async () => {
    const source = material();
    const timeouts: number[] = [];
    const transport: AwarenessJsonTransport = { identity: { provider: "xai", engineModel: "grok-engine", fastModel: "grok-fast" },
      async requestJson(_system, _user, options) { timeouts.push(options.timeoutMs); return raw(source); } };
    const provider = new TransportAwarenessNarrationProvider(transport);
    await provider.narrateFrozenBatch([source], undefined, undefined, AwarenessLongMeasurementPolicy);
    await provider.narrateFrozenBatch([source]);
    assert.deepEqual(timeouts, [60000, 15000]);
  });
  it("rejects mixed phases and batching noncombat phases", () => {
    assert.throws(() => prepareAwarenessFrozenNarrationRequest([material(), material("judgment")]), /BATCH_INVALID/);
    assert.throws(() => prepareAwarenessFrozenNarrationRequest([material("prologue"), { ...material("prologue"), turnReceiptId: "another" }]), /BATCH_INVALID/);
  });
  it("keeps canonical verdict separate from generated framing", () => {
    const source = material("judgment");
    const prepared = prepareAwarenessFrozenNarrationRequest([source]);
    assert.equal(prepared.user.includes(source.judgmentVerdict!), false);
    const result = validateAwarenessFrozenNarrationResults([source], raw(source));
    assert.equal(result[0]?.phase, "judgment");
    assert.throws(() => validateAwarenessFrozenNarrationResults([source], { receipts: [{ phase: "judgment", battleId: "battle", turnReceiptId: "receipt", turn: 1, before: [], after: [], winnerSide: "a" }] }));
  });
  it("freezes typed prologue sources without canonical speaker names", () => {
    const frozen = freezeAwarenessNarration({ phase: "prologue", input: { scene: "雨の路地", sideAName: "白い姿", sideBName: "黒い姿", profileAnchors: {}, characterSpeeches: [{ side: "a", speaker: "CANONICAL_SECRET", displayLabel: "白い声", text: "待て。" }] } }, { battleId: "battle", turnReceiptId: "receipt" });
    assert.equal(frozen.phase, "prologue");
    assert.equal(frozen.turn, 0);
    assert.equal(frozen.user.includes("CANONICAL_SECRET"), false);
    assert.deepEqual(frozen.sourceSpeeches, [{ side: "a", text: "待て。" }]);
  });
});
