import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BattleState, BattleTurnEngineContinuation } from "./battle.js";

type OpenStringIndex<T> = string extends keyof T ? true : false;
type IsAny<T> = 0 extends (1 & T) ? true : false;

const continuationIsClosed:
  OpenStringIndex<BattleTurnEngineContinuation> extends true ? never : true = true;
const worldStateIsNotAny:
  IsAny<NonNullable<BattleState["worldState"]>> extends true ? never : true = true;
const continuationFieldIsNotAny:
  IsAny<NonNullable<BattleState["causalEngineContinuation"]>> extends true ? never : true = true;
const liveWorldIsNotAny:
  IsAny<NonNullable<BattleState["latestWorldTransition"]>> extends true ? never : true = true;

describe("battle contract types", () => {
  it("keeps engine continuation closed and live world fields from becoming any", () => {
    assert.equal(continuationIsClosed, true);
    assert.equal(worldStateIsNotAny, true);
    assert.equal(continuationFieldIsNotAny, true);
    assert.equal(liveWorldIsNotAny, true);
  });
});
