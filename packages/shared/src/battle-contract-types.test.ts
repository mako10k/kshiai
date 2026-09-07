import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  BattleState,
  BattleTurnEngineContinuation,
  BattleTurnPipelineTrace,
} from "./battle.js";

type OpenStringIndex<T> = string extends keyof T ? true : false;
type IsAny<T> = 0 extends (1 & T) ? true : false;

const continuationIsClosed:
  OpenStringIndex<BattleTurnEngineContinuation> extends true ? never : true = true;
const battleStateIsClosed:
  OpenStringIndex<BattleState> extends true ? never : true = true;
const worldStateIsNotAny:
  IsAny<NonNullable<BattleState["worldState"]>> extends true ? never : true = true;
const continuationFieldIsNotAny:
  IsAny<NonNullable<BattleState["causalEngineContinuation"]>> extends true ? never : true = true;
const liveWorldIsNotAny:
  IsAny<NonNullable<BattleState["latestWorldTransition"]>> extends true ? never : true = true;
const sceneBeatIsNotAny:
  IsAny<NonNullable<BattleState["sceneBeat"]>> extends true ? never : true = true;
const perceptionFrameAIsNotAny:
  IsAny<NonNullable<BattleState["perceptionFrameA"]>> extends true ? never : true = true;
const perceptionFrameBIsNotAny:
  IsAny<NonNullable<BattleState["perceptionFrameB"]>> extends true ? never : true = true;
type CharacterAgentTrace = NonNullable<
  BattleTurnPipelineTrace["characterAgents"]
>["a"];
type DeepPsycheTrace = NonNullable<BattleTurnPipelineTrace["deepPsyche"]>["a"];
const characterAgentAcceptedOutputIsNotAny:
  IsAny<CharacterAgentTrace["acceptedOutput"]> extends true ? never : true = true;
const deepPsycheProviderOutputIsNotAny:
  IsAny<DeepPsycheTrace["providerOutput"]> extends true ? never : true = true;

describe("battle contract types", () => {
  it("keeps Battle state and continuation contracts closed", () => {
    assert.equal(continuationIsClosed, true);
    assert.equal(battleStateIsClosed, true);
    assert.equal(worldStateIsNotAny, true);
    assert.equal(continuationFieldIsNotAny, true);
    assert.equal(liveWorldIsNotAny, true);
    assert.equal(sceneBeatIsNotAny, true);
    assert.equal(perceptionFrameAIsNotAny, true);
    assert.equal(perceptionFrameBIsNotAny, true);
    assert.equal(characterAgentAcceptedOutputIsNotAny, true);
    assert.equal(deepPsycheProviderOutputIsNotAny, true);
  });
});
