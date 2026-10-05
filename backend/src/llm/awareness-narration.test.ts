// R: Verify narration batches retain receipt order, immutable speech, and fail-closed coverage.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwarenessLongMeasurementPolicy } from "@kshiai/shared";
import type { NarrationTurnView, AwarenessNarrationBatchOutput } from "@kshiai/shared";
import { TransportAwarenessNarrationProvider, type AwarenessNarrationReceiptInput } from "./awareness-narration.js";
import type { AwarenessJsonTransport, AwarenessRequestOptions } from "./awareness-provider-contract.js";

function receipt(id: string, turn: number): AwarenessNarrationReceiptInput {
  const view: NarrationTurnView = {
    schemaVersion: 1, turn, scene: "雨の路地",
    perception: { schemaVersion: 1, mode: "external", viewpointSide: null, resolvedFromFluid: false, references: [] },
    participantLabels: { a: "アオ", b: "クロ" }, profileAnchors: {}, sceneStateFacts: [], continuity: null,
    recognitionSubjects: [], events: [], actionBeats: [{ actorLabel: "アオ", actionName: "身構える", description: "姿勢を整える", outcomes: [] }],
    canonicalChange: { semantic: { status: "applied", changed: false }, world: { status: "applied", changed: false, operationKinds: [] } }, battlefield: null,
  };
  return { battleId: "battle", turnReceiptId: id, input: { view, characterSpeeches: [{ side: "a", speaker: "INTERNAL_CANONICAL_SECRET", displayLabel: "白い影", text: `まだ続く${turn}。` }] } };
}
function result(receipts: AwarenessNarrationReceiptInput[]): { receipts: Array<AwarenessNarrationBatchOutput["receipts"][number] & { phase: "combat" }> } {
  return { receipts: receipts.map((source) => ({
    phase: "combat" as const, battleId: source.battleId, turnReceiptId: source.turnReceiptId, turn: source.input.view.turn,
    narrator: ["白い影が構えを変える。", "雨が路地を濡らす。"],
    speeches: [{ sourceSide: "a", speaker: "白い影", text: source.input.characterSpeeches?.[0]?.text ?? "", afterNarratorLine: 0 }], recognitionUpdates: [],
  })) };
}
class FakeTransport implements AwarenessJsonTransport {
  readonly identity = { provider: "xai", engineModel: "grok-4.5", fastModel: "grok-4.3" };
  calls: Array<{ system: string; user: string; options: AwarenessRequestOptions }> = [];
  constructor(private readonly output: unknown) {}
  async requestJson(system: string, user: string, options: AwarenessRequestOptions): Promise<unknown> {
    this.calls.push({ system, user, options });
    return this.output;
  }
}

describe("awareness narration batch provider", () => {
  it("publishes three ordered receipt outputs from one capped Grok call", async () => {
    const inputs = [receipt("r1", 1), receipt("r2", 2), receipt("r3", 3)];
    const transport = new FakeTransport(result(inputs));
    const output = await new TransportAwarenessNarrationProvider(transport).narrateBatch(inputs, 9000);
    assert.deepEqual(output.map((item) => item.turnReceiptId), ["r1", "r2", "r3"]);
    assert.equal(transport.calls.length, 1);
    const call = transport.calls[0]!;
    assert.equal(call.options.timeoutMs, 9000);
    assert.equal(call.options.maxCompletionTokens, 1200);
    assert.equal(call.options.tier, "fast");
    assert.match(call.user, /## 確定receipt r1/);
    assert.equal(call.user.includes("INTERNAL_CANONICAL_SECRET"), false);
    assert.equal(output[1]?.narration.speeches[0]?.text, "まだ続く2。");
  });
  it("applies long measurement narration timeout only when explicitly bound", async () => {
    const inputs = [receipt("r1", 1)];
    const transport = new FakeTransport(result(inputs));
    await new TransportAwarenessNarrationProvider(transport, AwarenessLongMeasurementPolicy).narrateBatch(inputs);
    assert.equal(transport.calls[0]?.options.timeoutMs, 60000);
    assert.equal(transport.calls[0]?.options.maxCompletionTokens, 1200);
  });
  it("validates against the frozen dispatch source after callers mutate their inputs", async () => {
    const inputs = [receipt("r1", 1)];
    const original = result(inputs);
    const transport: AwarenessJsonTransport = {
      identity: { provider: "xai", engineModel: "grok-4.5", fastModel: "grok-4.3" },
      async requestJson() {
        inputs[0]!.turnReceiptId = "changed";
        inputs[0]!.input.characterSpeeches = [];
        return original;
      },
    };
    const output = await new TransportAwarenessNarrationProvider(transport).narrateBatch(inputs);
    assert.equal(output[0]?.turnReceiptId, "r1");
    assert.equal(output[0]?.narration.speeches[0]?.text, "まだ続く1。");
  });
  it("rejects missing receipt coverage without a second attempt", async () => {
    const inputs = [receipt("r1", 1), receipt("r2", 2)];
    const transport = new FakeTransport(result(inputs.slice(0, 1)));
    await assert.rejects(new TransportAwarenessNarrationProvider(transport).narrateBatch(inputs), /COVERAGE_MISMATCH/);
    assert.equal(transport.calls.length, 1);
  });
  it("rejects swapped identities and cross-receipt speech", async () => {
    const inputs = [receipt("r1", 1), receipt("r2", 2)];
    const swapped = result(inputs.reverse());
    inputs.reverse();
    await assert.rejects(new TransportAwarenessNarrationProvider(new FakeTransport(swapped)).narrateBatch(inputs), /IDENTITY_MISMATCH/);
    const altered = result(inputs);
    altered.receipts[0]!.speeches[0]!.text = "まだ続く2。";
    await assert.rejects(new TransportAwarenessNarrationProvider(new FakeTransport(altered)).narrateBatch(inputs), /SPEECH_SOURCE_MISMATCH/);
  });
  it("rejects duplicates, too-large batches, and expired deadlines before dispatch", async () => {
    const input = receipt("r1", 1);
    const transport = new FakeTransport(result([input]));
    const provider = new TransportAwarenessNarrationProvider(transport);
    await assert.rejects(provider.narrateBatch([input, input]), /DUPLICATE_RECEIPT/);
    await assert.rejects(provider.narrateBatch([input, input, input, input]), /BATCH_SIZE/);
    await assert.rejects(provider.narrateBatch([input], 0), /DEADLINE_INVALID/);
    assert.equal(transport.calls.length, 0);
  });
  it("rejects missing speech and unsupported recognition subjects", async () => {
    const inputs = [receipt("r1", 1)];
    const omitted = result(inputs);
    omitted.receipts[0]!.speeches = [];
    await assert.rejects(new TransportAwarenessNarrationProvider(new FakeTransport(omitted)).narrateBatch(inputs), /SPEECH_SOURCE_MISSING/);
    const recognition = result(inputs);
    recognition.receipts[0]!.recognitionUpdates = [{ subjectRef: "hidden", recognizedAs: "秘密", identityKnowledge: "identified", continuity: "same_entity" }];
    await assert.rejects(new TransportAwarenessNarrationProvider(new FakeTransport(recognition)).narrateBatch(inputs), /RECOGNITION_SOURCE_MISMATCH/);
  });
});
