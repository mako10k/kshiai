// R: Verify role routing, private projection boundaries, and strict awareness response validation.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AwarenessLongMeasurementPolicy, AwarenessNormalPolicy, AwarenessObservedPolicy,
  AwarenessConsciousInputSchema, AwarenessLatentInputSchema, CharacterSelfProfileAnchorSchema,
  type AwarenessLatentOutput,
} from "@kshiai/shared";
import { prepareAwarenessRequest } from "./awareness-request.js";
import { TransportAwarenessProvider } from "./awareness-provider.js";
import type { AwarenessJsonTransport, AwarenessRequestOptions } from "./awareness-provider-contract.js";

function perception() {
  return {
    schemaVersion: 1, observer: { side: "a", self: "self" }, turn: 1, revision: 1,
    self: { subject: { kind: "self" }, currentAccess: "clear", identityKnowledge: "identified", perceivedAs: "自分", percepts: [] },
    counterpart: { subject: { kind: "counterpart" }, currentAccess: "none", identityKnowledge: "unknown", perceivedAs: "見えない", percepts: [] },
    others: [], qualitativeChanges: [], reserveCues: [],
    latestDiff: { fromRevision: 0, toRevision: 1, addedOrUpdatedPerceptIds: [], removedPerceptIds: [] },
  };
}
const context = {
  character: CharacterSelfProfileAnchorSchema.parse({ schemaVersion: 1, displayName: "A", identity: {}, tags: [], appearanceSummary: "人物", traits: ["慎重"], narrativeBlurb: "", basicAction: { name: "身構える", description: "姿勢を整える" }, skills: [], equipment: { weapon: null, armor: null } }),
  characteristics: ["慎重"], training: [], facts: [], availableActions: [],
};
const latentInput = () => AwarenessLatentInputSchema.parse({
  ...context, side: "a", tick: 1, perception: perception(),
  currentState: { updatedTick: 0, sensations: [], emotions: [{ id: "emotion", feeling: "隠れた原因の内部記述", awareness: 0.1 }], tendencies: [], feltProjection: "なんだか落ち着かない" },
  stimuli: [{ id: "light", content: "まぶしい" }], influences: [{ id: "calm", content: "少し落ち着こう" }],
});
const latentOutput = (): AwarenessLatentOutput => ({
  state: { updatedTick: 1, sensations: [], emotions: [
    { id: "e1", feeling: "いや、でも近づきたい", awareness: 0.1 },
  ], tendencies: [], feltProjection: "なんだかいや" },
  reflexDesires: [], affectiveDesires: [], reconsider: false, cancelThought: false,
});
class FakeTransport implements AwarenessJsonTransport {
  readonly calls: Array<{ system: string; user: string; options: AwarenessRequestOptions }> = [];
  constructor(readonly identity: AwarenessJsonTransport["identity"], private readonly result: unknown) {}
  async requestJson(system: string, user: string, options: AwarenessRequestOptions): Promise<unknown> {
    this.calls.push({ system, user, options });
    return this.result;
  }
}
function transports(latentResult: unknown = latentOutput(), consciousResult: unknown = { goal: null, thought: "距離を保とう", desires: [], influences: [{ id: "c", content: "息を整えよう" }] }) {
  return {
    latent: new FakeTransport({ provider: "openai", engineModel: "gpt-6-luna", fastModel: "gpt-6-luna" }, latentResult),
    conscious: new FakeTransport({ provider: "xai", engineModel: "grok-4.5", fastModel: "grok-4.3" }, consciousResult),
  };
}

describe("awareness role provider", () => {
  it("updates reflex and affect in one Luna call with prose and the accepted cap", async () => {
    const { latent, conscious } = transports();
    const output = await new TransportAwarenessProvider(latent, conscious).subconscious(latentInput());
    assert.deepEqual(output, latentOutput());
    assert.equal(latent.calls.length, 1);
    assert.equal(conscious.calls.length, 0);
    const call = latent.calls[0]!;
    assert.deepEqual(call, prepareAwarenessRequest({ role: "subconscious", input: latentInput() }));
    assert.match(call.user, /## 今回の知覚/);
    assert.match(call.user, /まぶしい/);
    assert.match(call.system, /反射と感情由来の意欲を分離/);
    assert.match(call.system, /矛盾を解消せず/);
    assert.equal(call.user.includes('"history"'), false);
    assert.deepEqual(call.options, { tier: "fast", timeoutMs: 5000, maxCompletionTokens: 600, label: "awareness-v5:subconscious", responseFormat: { type: "json_object" } });
  });

  it("passes the bound long measurement deadlines to both transports without changing caps", async () => {
    const { latent, conscious } = transports();
    const policy = structuredClone(AwarenessLongMeasurementPolicy);
    const provider = new TransportAwarenessProvider(latent, conscious, policy);
    policy.roles.subconscious.deadlineMs = 5000;
    await provider.subconscious(latentInput());
    const input = AwarenessConsciousInputSchema.parse({ ...context, side: "a", sourceTick: 1, perception: perception(),
      feltProjection: "落ち着かない", consciousState: { goal: null, thought: "", updatedTick: null } });
    await provider.conscious(input);
    assert.equal(latent.calls[0]?.options.timeoutMs, 60000);
    assert.equal(latent.calls[0]?.options.maxCompletionTokens, 600);
    assert.equal(conscious.calls[0]?.options.timeoutMs, 90000);
    assert.equal(conscious.calls[0]?.options.maxCompletionTokens, 1500);
  });
  it("uses each battle policy instead of the application's current default", async () => {
    const { latent, conscious } = transports();
    const provider = new TransportAwarenessProvider(latent, conscious, AwarenessNormalPolicy);
    const input = latentInput();
    await provider.subconscious(input, "awareness-prompt-v1", AwarenessObservedPolicy);
    await provider.subconscious(input, "awareness-prompt-v2", AwarenessNormalPolicy);
    assert.equal(latent.calls[0]?.options.timeoutMs, 5000);
    assert.equal(latent.calls[1]?.options.timeoutMs, 60000);
    const thought = AwarenessConsciousInputSchema.parse({ ...context, side: "a", sourceTick: 1, perception: perception(), feltProjection: "", consciousState: { goal: null, thought: "", updatedTick: null } });
    await provider.conscious(thought, "awareness-prompt-v1", AwarenessObservedPolicy);
    await provider.conscious(thought, "awareness-prompt-v2", AwarenessNormalPolicy);
    assert.equal(conscious.calls[0]?.options.timeoutMs, 15000);
    assert.equal(conscious.calls[1]?.options.timeoutMs, 90000);
  });
  it("passes only owner-facing feelings to Grok, preserving frozen sourceTick", async () => {
    const { latent, conscious } = transports();
    const input = AwarenessConsciousInputSchema.parse({
      ...context, side: "a", sourceTick: 1, perception: perception(),
      feltProjection: latentInput().currentState.feltProjection,
      consciousState: { goal: null, thought: "", updatedTick: null },
    });
    const output = await new TransportAwarenessProvider(latent, conscious).conscious(input);
    assert.equal(output.influences[0]?.content, "息を整えよう");
    assert.equal(latent.calls.length, 0);
    const call = conscious.calls[0]!;
    assert.deepEqual(call, prepareAwarenessRequest({ role: "conscious", input }));
    assert.match(call.user, /なんだか落ち着かない/);
    assert.equal(call.user.includes("隠れた原因の内部記述"), false);
    assert.equal(call.user.includes("currentState"), false);
    assert.equal(call.options.tier, "engine");
    assert.equal(call.options.timeoutMs, 15000);
    assert.equal(call.options.maxCompletionTokens, 1500);
  });

  it("dispatches the selected immutable prompt revision and rejects unknown revisions before transport", async () => {
    const { latent, conscious } = transports();
    const provider = new TransportAwarenessProvider(latent, conscious);
    const input = latentInput();
    await provider.subconscious(input, "awareness-prompt-v1");
    await provider.subconscious(input, "awareness-prompt-v2");
    assert.deepEqual(latent.calls[0], prepareAwarenessRequest({ role: "subconscious", input }, undefined, "awareness-prompt-v1"));
    assert.deepEqual(latent.calls[1], prepareAwarenessRequest({ role: "subconscious", input }, undefined, "awareness-prompt-v2"));
    const thought = AwarenessConsciousInputSchema.parse({ ...context, side: "a", sourceTick: 1, perception: perception(),
      feltProjection: "落ち着かない", consciousState: { goal: null, thought: "", updatedTick: null } });
    await provider.conscious(thought, "awareness-prompt-v1");
    assert.deepEqual(conscious.calls[0], prepareAwarenessRequest({ role: "conscious", input: thought }, undefined, "awareness-prompt-v1"));
    await assert.rejects(provider.subconscious(input, "unknown"), /REVISION_UNSUPPORTED/);
    assert.equal(latent.calls.length, 2);
  });
  it("rejects unexpected output and never repairs or falls back automatically", async () => {
    const { latent, conscious } = transports({ ...latentOutput(), unexpected: "world mutation" });
    await assert.rejects(new TransportAwarenessProvider(latent, conscious).subconscious(latentInput()));
    assert.equal(latent.calls.length, 1);
    assert.equal(conscious.calls.length, 0);
  });

  it("rejects a stale latent output tick", async () => {
    const output = latentOutput();
    output.state.updatedTick = 0;
    const { latent, conscious } = transports(output);
    await assert.rejects(new TransportAwarenessProvider(latent, conscious).subconscious(latentInput()), /TICK_MISMATCH/);
  });

  it("rejects implicit cross-provider routes", () => {
    const { latent, conscious } = transports();
    const invalid = new FakeTransport({ provider: "xai", engineModel: "grok-4.3", fastModel: "grok-4.3" }, {});
    assert.throws(() => new TransportAwarenessProvider(invalid, conscious), /LATENT_ROUTE/);
    assert.throws(() => new TransportAwarenessProvider(latent, new FakeTransport({ provider: "openai", engineModel: "gpt-6-luna", fastModel: "gpt-6-luna" }, {})), /CONSCIOUS_ROUTE/);
  });
});
