// R: Verify only physically admitted awareness speech becomes canonical and perceptible evidence.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AwarenessDesire, BattleState, WorldActorState } from "@kshiai/shared";
import { commitAwarenessExpressions } from "./awareness-expression-commit.js";
import { validAwarenessBattleFixture } from "./awareness-test-fixture.js";

type Voice = Extract<AwarenessDesire, { resource: "voice" }>;
function voice(source: Voice["source"], speech: string): Voice {
  return { id: "PRIVATE_UNAWARE_TRIGGER_ID", source, strength: 0.8, startTick: 1, validUntilTick: 3, resource: "voice", speech };
}
function state() { return validAwarenessBattleFixture("awareness-expression-test").state; }
function actor(input: BattleState, side: "a" | "b"): WorldActorState {
  const value = input.worldState?.entities[`character.${side}`]?.actorState;
  if (!value) throw new Error("Expected fixture actor state");
  return value;
}
function utterances(input: BattleState) { return input.turnRecords?.at(-1)?.events.filter((event) => event.type === "utterance") ?? []; }
function heard(input: BattleState, side: "a" | "b", text: string): boolean {
  const frame = side === "a" ? input.perceptionFrameA : input.perceptionFrameB;
  return [frame?.self, frame?.counterpart, ...(frame?.others ?? [])].some((slot) => slot?.percepts.some((percept) => percept.modality === "sound" && percept.phenomenon.includes(text)));
}
function commit(input: BattleState, voices: { a: Voice | null; b: Voice | null }, tick = 1) {
  return commitAwarenessExpressions({ before: structuredClone(input), after: input, tick, voices, events: [], actions: [] });
}

describe("awareness physically committed expressions", () => {
  it("commits selected reflex and conscious speech exactly and lets the other observer hear it", () => {
    const input = state();
    const reflex = "あっ、まぶしい！";
    const conscious = "距離を保とう。";
    const result = commit(input, { a: voice("reflex", reflex), b: voice("conscious", conscious) });
    assert.deepEqual(result.characterSpeeches.map((speech) => ({ side: speech.side, text: speech.text })), [{ side: "a", text: reflex }, { side: "b", text: conscious }]);
    assert.deepEqual(utterances(result.state).map((event) => event.utterance?.text), [reflex, conscious]);
    assert.equal(heard(result.state, "b", reflex), true);
    assert.equal(heard(result.state, "a", conscious), true);
    assert.equal(JSON.stringify(result).includes("PRIVATE_UNAWARE_TRIGGER_ID"), false);
    assert.equal(JSON.stringify(result).includes('"strength":0.8'), false);
  });
  it("does not manufacture utterances, narrator sources or heard evidence when no voice was selected", () => {
    const input = state();
    const beforeFrameA = structuredClone(input.perceptionFrameA);
    const beforeFrameB = structuredClone(input.perceptionFrameB);
    const result = commit(input, { a: null, b: null });
    assert.deepEqual(utterances(result.state), []);
    assert.deepEqual(result.characterSpeeches, []);
    assert.deepEqual(result.state.perceptionFrameA, beforeFrameA);
    assert.deepEqual(result.state.perceptionFrameB, beforeFrameB);
  });
  it("suppresses physically blocked or absent voice and unconscious or incapacitated speakers", () => {
    for (const condition of ["blocked", "absent", "unconscious", "incapacitated"] as const) {
      const input = state();
      const physical = actor(input, "a");
      if (condition === "blocked" || condition === "absent") physical.speech = condition;
      else physical.consciousness = condition;
      const result = commit(input, { a: voice("subconscious", "この言葉は成立しない。"), b: null });
      assert.deepEqual(utterances(result.state), []);
      assert.deepEqual(result.characterSpeeches, []);
      assert.equal(heard(result.state, "b", "この言葉は成立しない。"), false);
    }
  });
  it("preserves canonical speech when the recipient cannot hear while withholding their sound percept", () => {
    const input = state();
    actor(input, "b").hearing = "blocked";
    const result = commit(input, { a: voice("conscious", "届かない言葉。"), b: null });
    assert.equal(utterances(result.state)[0]?.utterance?.text, "届かない言葉。");
    assert.equal(result.characterSpeeches[0]?.text, "届かない言葉。");
    assert.equal(heard(result.state, "b", "届かない言葉。"), false);
  });
  it("assigns distinct utterance event IDs across ticks of the same public turn", () => {
    const input = state();
    const first = commit(input, { a: voice("reflex", "あっ。"), b: null }, 1);
    const second = commit(first.state, { a: voice("conscious", "まだ動ける。"), b: null }, 2);
    assert.equal(first.state.turn, second.state.turn);
    const firstId = utterances(first.state)[0]?.id;
    const secondId = utterances(second.state)[0]?.id;
    assert.ok(firstId);
    assert.ok(secondId);
    assert.notEqual(firstId, secondId);
    assert.equal(second.state.turnRecords?.length, 2);
  });
});
