import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BattlePolicyOptionSchema,
  selectPolicyIdsByPerspective,
} from "./battle.js";

describe("battle policy perspectives", () => {
  const options = [
    ["a1", "initiative"],
    ["a2", "initiative"],
    ["b1", "risk"],
    ["b2", "risk"],
  ].map(([id, perspectiveId]) => BattlePolicyOptionSchema.parse({
    id,
    perspectiveId,
    perspectiveTitle: perspectiveId,
    title: id,
    when: "いつでも",
    then: "任せる",
  }));

  it("keeps at most one selected choice per perspective", () => {
    assert.deepEqual(
      selectPolicyIdsByPerspective(options, ["a2", "a1", "b2"]),
      ["a1", "b2"],
    );
  });

  it("preserves an empty selection as unspecified", () => {
    assert.deepEqual(selectPolicyIdsByPerspective(options, []), []);
  });
});
