import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createBattleState,
  defaultParameters,
  type CharacterSheet,
} from "@kshiai/shared";
import { MockLlmProvider } from "../llm/mock.js";
import { reconcileSemanticState, toBattlePublic } from "./battle-service.js";

function sheet(id: string, name: string): CharacterSheet {
  const now = "2026-08-04T00:00:00.000Z";
  return {
    id,
    ownerUserId: "owner",
    displayName: name,
    tags: [],
    createdAt: now,
    updatedAt: now,
    appearance: { summary: `${name}の外見`, visualPrompt: "test" },
    traits: [],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "test",
  };
}

describe("public battle semantic projection", () => {
  it("exposes observable semantic state without mechanics or private agents", () => {
    const sideA = sheet("a", "A");
    const sideB = sheet("b", "B");
    const state = createBattleState({
      id: "public-semantic",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const publicState = toBattlePublic(state, sideA, null, sideB);
    assert.equal(
      publicState.semanticState?.snapshot.entities["character.a"]?.label,
      "A",
    );
    const json = JSON.stringify(publicState);
    assert.equal(json.includes("privateMemory"), false);
    assert.equal(json.includes("parameters"), false);
    assert.equal(json.includes("coefficients"), false);
  });

  it("keeps the committed state when a provider patch is invalid", async () => {
    const sideA = sheet("a", "A");
    const sideB = sheet("b", "B");
    const state = createBattleState({
      id: "invalid-semantic",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const llm = new MockLlmProvider();
    llm.reconcileTurnSemanticState = async () => ({
      patch: {
        baseRevision: 0,
        turn: 0,
        sourceEventIds: [],
        operations: [{ op: "remove", path: "/entities/character.a" }],
      },
    });
    const result = await reconcileSemanticState({
      llm,
      stateBeforeTurn: state,
      resolvedState: state,
      mine: sideA,
      opp: sideB,
      actions: [],
      events: [],
    });
    assert.equal(result.status, "rejected");
    assert.equal(result.state.semanticState, state.semanticState);
  });

  it("skips semantic mutation when the provider fails", async () => {
    const sideA = sheet("a", "A");
    const sideB = sheet("b", "B");
    const state = createBattleState({
      id: "failed-semantic",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const llm = new MockLlmProvider();
    llm.reconcileTurnSemanticState = async () => {
      throw new Error("provider unavailable");
    };
    const result = await reconcileSemanticState({
      llm,
      stateBeforeTurn: state,
      resolvedState: state,
      mine: sideA,
      opp: sideB,
      actions: [],
      events: [],
    });
    assert.equal(result.status, "skipped");
    assert.equal(result.state.semanticState, state.semanticState);
  });

  it("keeps only the latest transition and side-specific observations", async () => {
    const sideA = sheet("a", "A");
    const sideB = sheet("b", "B");
    const state = createBattleState({
      id: "latest-only-semantic",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const llm = new MockLlmProvider();
    llm.reconcileTurnSemanticState = async () => ({
      patch: {
        baseRevision: 0,
        turn: 0,
        sourceEventIds: [],
        operations: [{
          op: "add",
          path: "/entities/hidden_token.1",
          value: {
            kind: "object",
            label: "隠し札",
            location: { type: "held", side: "a" },
            active: true,
            createdTurn: 0,
            updatedTurn: 0,
            facts: { state: "concealed" },
            visibleTo: ["a"],
          },
        }],
      },
    });
    const result = await reconcileSemanticState({
      llm,
      stateBeforeTurn: state,
      resolvedState: state,
      mine: sideA,
      opp: sideB,
      actions: [],
      events: [],
    });
    assert.equal(result.status, "applied");
    assert.equal(result.state.latestSemanticTransition?.toRevision, 1);
    assert.ok(
      result.state.observationStateA?.snapshot.entities["hidden_token.1"],
    );
    assert.equal(
      result.state.observationStateB?.snapshot.entities["hidden_token.1"],
      undefined,
    );
    assert.equal(
      result.state.observationStatePublic?.snapshot.entities["hidden_token.1"],
      undefined,
    );
    assert.deepEqual(result.state.turnRecords, []);
    assert.equal(
      JSON.stringify(toBattlePublic(result.state, sideA, null, sideB))
        .includes("hidden_token"),
      false,
    );
  });
});
