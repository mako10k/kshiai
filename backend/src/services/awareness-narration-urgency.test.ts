// R: Verify meaningful confirmed capability changes bypass narration batching without making every world update urgent.
import assert from "node:assert/strict";
import { it } from "node:test";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";
import { awarenessNarrationUrgent } from "./awareness-narration-urgency.js";

it("keeps a normal movement or ordinary world revision batchable", () => {
  const { state } = validAwarenessBattleFixture("urgency-normal");
  const after = structuredClone(state);
  assert.ok(after.worldState);
  after.worldState.revision += 1;
  const actor = after.worldState.entities["character.a"];
  assert.ok(actor?.actorState);
  actor.actorState.posture = "crouched";
  assert.equal(awarenessNarrationUrgent(state, after), false);
});
for (const capability of ["consciousness", "speech", "vision"] as const) it(`flushes an actual ${capability} impairment without a speech event`, () => {
  const { state } = validAwarenessBattleFixture(`urgency-${capability}`);
  const after = structuredClone(state);
  const actor = after.worldState?.entities["character.a"];
  assert.ok(actor?.actorState);
  if (capability === "consciousness") actor.actorState.consciousness = "dazed";
  else actor.actorState[capability] = "blocked";
  assert.equal(awarenessNarrationUrgent(state, after), true);
});
