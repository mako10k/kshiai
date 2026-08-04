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
    state.perceptionRegistryA = {
      schemaVersion: 1,
      observerSide: "a",
      nextContactSequence: 2,
      contacts: [{
        contactId: "contact.a.1",
        currentAccess: "trace",
        identityKnowledge: "unknown",
        identifiedRef: null,
        perceivedAs: "暗がりの人影",
        salience: "prominent",
        lastObservedTurn: 0,
        sourceSet: [{ kind: "entity", entityId: "hidden.enemy.1" }],
      }],
    };
    state.perceptionRegistryB = {
      schemaVersion: 1,
      observerSide: "b",
      nextContactSequence: 1,
      contacts: [],
    };
    const publicState = toBattlePublic(state, sideA, null, sideB);
    assert.equal(
      publicState.semanticState?.snapshot.entities["character.a"]?.label,
      "A",
    );
    const json = JSON.stringify(publicState);
    assert.equal(json.includes("privateMemory"), false);
    assert.equal(json.includes("parameters"), false);
    assert.equal(json.includes("coefficients"), false);
    assert.equal(json.includes("perceptionRegistry"), false);
    assert.equal(json.includes("hidden.enemy.1"), false);
  });

  it("centers settled ratings independently for each visible track", () => {
    const sideA = sheet("a", "A");
    const sideB = sheet("b", "B");
    const state = createBattleState({
      id: "rating-display",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const snapA = {
      characterId: "a",
      before: 1400,
      after: 1410,
      delta: 10,
      provisionalBefore: true,
      provisionalAfter: true,
      gamesPlayedBefore: 0,
    };
    const snapB = {
      characterId: "b",
      before: 1400,
      after: 1390,
      delta: -10,
      provisionalBefore: true,
      provisionalAfter: true,
      gamesPlayedBefore: 0,
    };
    const publicState = toBattlePublic(
      {
        ...state,
        status: "finished",
        ratingSettlement: {
          applied: true,
          voided: false,
          ranked: true,
          sameOwner: false,
          sideA: snapA,
          sideB: snapB,
          overall: {
            sideA: { ...snapA, before: 1500, after: 1510 },
            sideB: { ...snapB, before: 1500, after: 1490 },
          },
          public: { sideA: snapA, sideB: snapB },
        },
      },
      sideA,
      null,
      sideB,
      {
        public: { ratingTotal: 2800, characterCount: 2 },
        overall: { ratingTotal: 3200, characterCount: 2 },
      },
    );
    assert.equal(publicState.ratingSettlement?.public?.sideA.before, 1500);
    assert.equal(publicState.ratingSettlement?.public?.sideA.after, 1510);
    assert.equal(publicState.ratingSettlement?.overall?.sideA.before, 1400);
    assert.equal(publicState.ratingSettlement?.overall?.sideA.after, 1410);
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
