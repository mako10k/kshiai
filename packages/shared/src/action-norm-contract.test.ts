import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CharacterActionNormV3Schema, type CharacterActionNormV3 } from "./character-definition-v3.js";
import { CharacterActionNormV2Schema, type CharacterActionNormV2 } from "./structured-character.js";

type InvalidNorm<T extends { response: unknown }> = Omit<T, "force" | "response"> & {
  force: "constraint"; response: Omit<T["response"], "disposition"> & { disposition: "prefer" };
};
const v3Mismatch: InvalidNorm<CharacterActionNormV3> extends CharacterActionNormV3 ? true : false = false;
const v2Mismatch: InvalidNorm<CharacterActionNormV2> extends CharacterActionNormV2 ? true : false = false;
const original: CharacterActionNormV3 = {
  id: "original-norm", when: { match: "all", clauses: [{ kind: "always", operator: "is", value: "true" }] },
  response: { disposition: "forbid", actionRefs: ["original-action"], actionKinds: [], tacticTags: [] },
  priority: 37, force: "constraint", exceptions: [], description: null,
};
describe("action norm force contracts", () => {
  it("preserves the selected disposition and rejects incompatible force", () => {
    assert.deepEqual(CharacterActionNormV3Schema.parse(original), original);
    assert.deepEqual([v3Mismatch, v2Mismatch], [false, false]);
    assert.equal(CharacterActionNormV3Schema.safeParse({ ...original, force: "preference" }).success, false);
    assert.equal(CharacterActionNormV3Schema.safeParse({ ...original, response: { ...original.response, disposition: "prefer" } }).success, false);
    assert.equal(CharacterActionNormV3Schema.safeParse({ ...original, response: { ...original.response, actionRefs: [] } }).success, false);
    const v2 = { ...original, selfAwareness: "aware", response: { ...original.response, statement: "生成元の規範", fallbackActionRef: null } };
    assert.deepEqual(CharacterActionNormV2Schema.parse(v2), v2);
    assert.equal(CharacterActionNormV2Schema.safeParse({ ...v2, force: "commitment" }).success, false);
  });
});
