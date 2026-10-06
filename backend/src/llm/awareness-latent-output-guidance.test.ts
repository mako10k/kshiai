// R: Verify compact latent guidance preserves the full output schema and current-tick identity.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AwarenessLatentOutputSchema, AwarenessAcceptLatent, AwarenessInitialCharacterState } from "@kshiai/shared";
import { compactLatentOutputExample, renderLatentOutputBudget } from "./awareness-latent-output-guidance.js";

test("compact whole-output examples retain feelings, learned reactions and both desire sources", () => {
  for (const side of ["a", "b"] as const) {
    const output = AwarenessLatentOutputSchema.parse(compactLatentOutputExample(7, side));
    const accepted = AwarenessAcceptLatent(AwarenessInitialCharacterState(), output, 7);
    assert.equal(accepted.latentAcceptedTick, 7);
    assert.equal(accepted.latent.tendencies[0]?.cue, "手が上がる");
    assert.deepEqual(accepted.desires.map((desire) => desire.source), ["reflex", "subconscious"]);
    const next = AwarenessAcceptLatent(accepted, compactLatentOutputExample(8, side), 8);
    assert.equal(next.latentAcceptedTick, 8);
  }
  assert.notEqual(compactLatentOutputExample(7, "a").reflexDesires[0]?.id,
    compactLatentOutputExample(7, "b").reflexDesires[0]?.id);
});

test("budget guidance supplies an intact compact example without imposing state item caps", () => {
  const guidance = renderLatentOutputBudget({ tick: 7, side: "b", outputTokens: 600 });
  assert.match(guidance, /上限は600トークン/);
  assert.match(guidance, /必要な状態・反応傾向・意欲の意味は残し/);
  assert.match(guidance, /件数の上限ではない/);
  const example = guidance.split("\n").at(-1);
  assert.ok(example);
  const output = AwarenessLatentOutputSchema.parse(JSON.parse(example));
  assert.equal(output.state.updatedTick, 7);
  assert.equal(example.includes("\n"), false);
});
