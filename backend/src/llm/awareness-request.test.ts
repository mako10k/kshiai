// R: Verify deterministic complete awareness request preparation and observer validation.
import { createHash } from "node:crypto";
import { renderAwarenessOutputContract } from "./awareness-output-contract.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwarenessLongMeasurementPolicy, AwarenessConsciousInputSchema, AwarenessLatentInputSchema, CharacterSelfProfileAnchorSchema } from "@kshiai/shared";
import { prepareAwarenessRequest } from "./awareness-request.js";

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
describe("awareness request preparation", () => {
  it("includes complete system instructions and deterministically rendered data before dispatch", () => {
    const input = latentInput();
    const first = prepareAwarenessRequest({ role: "subconscious", input });
    const second = prepareAwarenessRequest({ role: "subconscious", input });
    assert.deepEqual(first, second);
    assert.match(first.system, /反射と感情由来の意欲を分離/);
    assert.match(first.user, /まぶしい/);
    assert.equal(first.options.maxCompletionTokens, 600);
    input.stimuli[0]!.content = "変化した刺激";
    assert.equal(first.user.includes("変化した刺激"), false);
  });
  it("prepares the exact long-policy latent timeout while preserving default input content", () => {
    const input = latentInput();
    const normal = prepareAwarenessRequest({ role: "subconscious", input });
    const long = prepareAwarenessRequest({ role: "subconscious", input }, AwarenessLongMeasurementPolicy);
    assert.equal(normal.options.timeoutMs, 5000); assert.equal(long.options.timeoutMs, 60000);
    assert.equal(long.options.maxCompletionTokens, normal.options.maxCompletionTokens);
    assert.equal(long.system, normal.system); assert.equal(long.user, normal.user);
  });
  it("executes the latest output guidance for historical and current prompt identities", () => {
    const input = latentInput();
    const current = prepareAwarenessRequest({ role: "subconscious", input });
    const conscious = AwarenessConsciousInputSchema.parse({ ...context, side: "a", sourceTick: 1, perception: perception(),
      feltProjection: "なんだか落ち着かない", consciousState: { goal: null, thought: "", updatedTick: null } });
    const currentThought = prepareAwarenessRequest({ role: "conscious", input: conscious });
    for (const revision of ["awareness-prompt-v1", "awareness-prompt-v2", "awareness-prompt-v3", "awareness-prompt-v4"]) {
      const historical = prepareAwarenessRequest({ role: "subconscious", input }, undefined, revision);
      assert.deepEqual(historical, current);
      assert.equal(historical.system.split(renderAwarenessOutputContract("subconscious")).length, 2);
      assert.equal(createHash("sha256").update(historical.user).digest("hex"), "3509d17863c38b4d3fddf55e77b2b545eb0e0af7ed8aa76c1e628a27c642d90f");
      const historicalThought = prepareAwarenessRequest({ role: "conscious", input: conscious }, undefined, revision);
      assert.deepEqual(historicalThought, currentThought);
      assert.equal(historicalThought.system.split(renderAwarenessOutputContract("conscious")).length, 2);
    }
    assert.throws(() => prepareAwarenessRequest({ role: "subconscious", input }, undefined, "awareness-prompt-v99"), /REVISION_UNSUPPORTED/);
  });
  it("guides fresh conscious desire identities for both owners and frozen source ticks in every prompt revision", () => {
    const prefixes = new Set<string>();
    for (const side of ["a", "b"] as const) {
      for (const sourceTick of [10, 11]) {
        const input = AwarenessConsciousInputSchema.parse({ ...context, side, sourceTick,
          perception: { ...perception(), observer: { side, self: "self" } },
          feltProjection: "身構えたい", consciousState: { goal: "待つ", thought: "前の考え", updatedTick: sourceTick - 1 } });
        const expected = prepareAwarenessRequest({ role: "conscious", input });
        const prefix = `conscious.${side}.t${sourceTick}`;
        prefixes.add(prefix);
        assert.ok(expected.system.includes(`${prefix}.1、${prefix}.2`));
        assert.ok(expected.system.includes(`役割conscious、本人side=${side}、凍結されたsourceTick=${sourceTick}`));
        assert.ok(expected.system.includes(`startTickはこの入力のsourceTick=${sourceTick}`));
        assert.match(expected.system, /bodyとvoiceを合わせて連番を進め/);
        assert.match(expected.system, /固定の例示ID、受理済み思考や以前の返答に出た意欲IDを再利用しない/);
        assert.match(expected.system, /返答時点の現在tickへ進めない/);
        for (const revision of ["awareness-prompt-v1", "awareness-prompt-v2", "awareness-prompt-v3", "awareness-prompt-v4"]) {
          assert.deepEqual(prepareAwarenessRequest({ role: "conscious", input }, undefined, revision), expected);
        }
        assert.deepEqual(prepareAwarenessRequest({ role: "conscious", input }), expected);
        assert.equal(expected.options.maxCompletionTokens, 1500);
        assert.deepEqual(expected.options.responseFormat, { type: "json_object" });
      }
    }
    assert.equal(prefixes.size, 4);
    assert.equal(prepareAwarenessRequest({ role: "subconscious", input: latentInput() }).system.includes("今回の新規意欲ID"), false);
  });
  it("rejects observer mismatch before producing a request", () => {
    const input = latentInput();
    input.side = "b";
    assert.throws(() => prepareAwarenessRequest({ role: "subconscious", input }));
  });
  it("prepares conscious input from owner projection with the accepted cap", () => {
    const input = AwarenessConsciousInputSchema.parse({
      ...context, side: "a", sourceTick: 1, perception: perception(),
      feltProjection: "なんだか落ち着かない", consciousState: { goal: null, thought: "", updatedTick: null },
    });
    const prepared = prepareAwarenessRequest({ role: "conscious", input });
    assert.equal(prepared.options.maxCompletionTokens, 1500);
    assert.equal(prepared.options.timeoutMs, 15000);
    assert.equal(prepared.options.tier, "engine");
    assert.match(prepared.user, /なんだか落ち着かない/);
    assert.equal(prepared.user.includes("隠れた原因の内部記述"), false);
  });
});
