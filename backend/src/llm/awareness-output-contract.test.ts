// R: Verify output guidance distinguishes option data from strict intent objects without widening the contract.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CharacterActionIntentSchema, AwarenessDesireSchema } from "@kshiai/shared";
import { AwarenessActionIntentExamples, renderAwarenessOutputContract } from "./awareness-output-contract.js";
describe("existing awareness output contract guidance", () => {
  it("uses schema-valid examples for every supported action kind", () => {
    assert.deepEqual(AwarenessActionIntentExamples.map((example) => CharacterActionIntentSchema.parse(example).kind),
      ["basic_attack", "skill", "defend", "rest", "wait", "reposition", "free_action", "reflect"]);
  });
  it("explains why string actions and copied legal-option objects are invalid", () => {
    const guidance = renderAwarenessOutputContract("subconscious");
    assert.match(guidance, /文字列ではなく/); assert.match(guidance, /name、target/); assert.match(guidance, /subjectRefs/);
    const desire = { id: "d", source: "reflex", strength: 0.8, startTick: 1, validUntilTick: 2, resource: "body" };
    assert.equal(AwarenessDesireSchema.safeParse({ ...desire, action: "defend" }).success, false);
    assert.equal(AwarenessDesireSchema.safeParse({ ...desire, action: { kind: "defend", name: "構える", target: { kind: "self", perceivedAs: "自分" } } }).success, false);
    assert.equal(AwarenessDesireSchema.safeParse({ ...desire, action: { kind: "defend" } }).success, true);
  });
  it("retains latent ambiguity while separating conscious thought and source roles", () => {
    assert.match(renderAwarenessOutputContract("subconscious"), /感覚と感情は曖昧なままでよい/);
    assert.match(renderAwarenessOutputContract("subconscious"), /affectiveDesiresのsourceはsubconscious/);
    assert.match(renderAwarenessOutputContract("conscious"), /desiresのsourceはconscious/);
    assert.match(renderAwarenessOutputContract("conscious"), /明確な思考はthought/);
  });
});
