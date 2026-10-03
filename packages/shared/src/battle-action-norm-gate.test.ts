// R: Verify character norms constrain every engine action substitution.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gateBattleActionByNorms } from "./battle-action-norm-gate.js";

describe("engine character norm gate", () => {
  it("retains a legal exact skill and rejects a different skill", () => {
    const constraint = { allowedActionKeys: ["skill:allowed"], fallback: { kind: "skill" as const, skillId: "allowed" } };
    assert.equal(gateBattleActionByNorms({ actorSide: "a", kind: "skill", skillId: "allowed" }, constraint).replaced, false);
    assert.deepEqual(gateBattleActionByNorms({ actorSide: "b", kind: "skill", skillId: "forbidden" }, constraint), {
      action: { actorSide: "b", kind: "skill", skillId: "allowed" }, replaced: true,
    });
  });
  it("uses the recorded wait fallback for an unresolved empty set", () => {
    assert.deepEqual(gateBattleActionByNorms({ actorSide: "a", kind: "basic_attack" }, {
      allowedActionKeys: [], fallback: { kind: "wait" },
    }), { action: { actorSide: "a", kind: "wait" }, replaced: true });
  });
  it("preserves existing action semantics when no V4 norm constraint is supplied", () => {
    const action = { actorSide: "a" as const, kind: "basic_attack" as const };
    assert.equal(gateBattleActionByNorms(action, undefined).action, action);
  });
});
