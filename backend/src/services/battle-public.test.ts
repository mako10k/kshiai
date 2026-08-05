import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createBattleState,
  defaultParameters,
  resolveTurn,
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
    assert.equal(json.includes("worldState"), false);
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
      mechanicalEvidence: [],
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
    const resolved = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: [],
      sideBSkills: [],
    });
    const result = await reconcileSemanticState({
      llm,
      stateBeforeTurn: state,
      resolvedState: resolved.state,
      mine: sideA,
      opp: sideB,
      actions: resolved.actions,
      events: resolved.events,
      mechanicalEvidence: resolved.mechanicalEvidence,
    });
    assert.equal(result.status, "skipped");
    assert.equal(result.state.semanticState, state.semanticState);
    assert.equal(result.mechanicalEvidenceStatus, "valid");
    assert.ok(result.mechanicalEvidence.length > 0);
    assert.equal(
      result.quantizedMechanicalEvidence.length,
      result.mechanicalEvidence.length,
    );
    assert.equal(
      JSON.stringify(result.quantizedMechanicalEvidence).includes("beforeValue"),
      false,
    );
    assert.deepEqual(
      result.reserveEvidenceA.map((cue) => cue.parameterKey),
      ["hp", "mp", "stamina", "focus"],
    );
    assert.deepEqual(
      result.reserveEvidenceB.map((cue) => cue.parameterKey),
      ["hp", "mp", "stamina", "focus"],
    );
    assert.equal(result.sensoryEvidenceStatus, "unavailable");
    assert.deepEqual(result.sensoryEvidence, []);
    assert.equal(result.state.perceptionFrameA?.self.currentAccess, "clear");
    assert.equal(result.state.perceptionFrameB?.self.currentAccess, "clear");
    assert.equal(
      result.state.perceptionFrameA?.counterpart.identityKnowledge,
      "unknown",
    );
    assert.ok(
      (result.state.perceptionFrameA?.qualitativeChanges.length ?? 0) > 0,
    );
    assert.equal(result.state.perceptionFrameA?.reserveCues.length, 4);
    assert.equal(result.state.perceptionFrameB?.reserveCues.length, 4);
    assert.deepEqual(result.state.perceptionRegistryA?.contacts, []);
    assert.deepEqual(result.state.perceptionRegistryB?.contacts, []);
  });

  it("freezes side-specific frames and keeps unknown source ids registry-private", async () => {
    const sideA = sheet("a", "A");
    const sideB = sheet("b", "B");
    const state = createBattleState({
      id: "projected-perception",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const resolved = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: [],
      sideBSkills: [],
    });
    const basisEvent = resolved.events.find((event) =>
      event.id && event.targetSides?.includes("b")
    );
    assert.ok(basisEvent?.id);
    const llm = new MockLlmProvider();
    llm.reconcileTurnSemanticState = async (input) => ({
      patch: {
        baseRevision: input.before.revision,
        turn: input.turn,
        sourceEventIds: input.events.flatMap((event) => event.id ? [event.id] : []),
        operations: [],
      },
      worldPatchStatus: "valid",
      sensoryEvidenceStatus: "valid",
      sensoryEvidence: [{
        evidenceId: "evidence.hidden.impact",
        basisEventIds: [basisEvent.id!],
        modality: "sound",
        phenomenon: "暗がりから鈍い衝突音が響く",
        source: { kind: "entity", entityId: "character.b" },
        accessBySide: {
          a: {
            currentAccess: "trace",
            identityKnowledge: "unknown",
            perceivedAs: "正体不明の衝突音",
            direction: "front",
            distance: "mid",
            occurrenceCertainty: "certain",
            attributionCertainty: "unknown",
          },
          b: {
            currentAccess: "clear",
            identityKnowledge: "identified",
            perceivedAs: "自分自身への衝撃",
            direction: "front",
            distance: "contact",
            occurrenceCertainty: "certain",
            attributionCertainty: "certain",
          },
        },
        publicAccess: {
          currentAccess: "trace",
          identityKnowledge: "unknown",
          perceivedAs: "鈍い衝突音",
          direction: "unknown",
          distance: "mid",
          occurrenceCertainty: "certain",
          attributionCertainty: "unknown",
        },
      }],
    });
    const result = await reconcileSemanticState({
      llm,
      stateBeforeTurn: state,
      resolvedState: resolved.state,
      mine: sideA,
      opp: sideB,
      actions: resolved.actions,
      events: resolved.events,
      mechanicalEvidence: resolved.mechanicalEvidence,
    });

    assert.equal(result.status, "applied");
    assert.equal(result.state.perceptionFrameA?.counterpart.currentAccess, "none");
    assert.equal(
      result.state.perceptionFrameA?.others[0]?.subject.kind,
      "contact",
    );
    assert.equal(result.state.perceptionRegistryA?.contacts.length, 1);
    assert.equal(result.state.perceptionFrameB?.self.percepts.length, 1);
    assert.equal(Object.isFrozen(result.state.perceptionFrameA), true);
    assert.equal(
      JSON.stringify(result.state.perceptionFrameA).includes("character.b"),
      false,
    );
    const publicJson = JSON.stringify(
      toBattlePublic(result.state, sideA, null, sideB),
    );
    assert.equal(publicJson.includes("perceptionFrame"), false);
    assert.equal(publicJson.includes("perceptionRegistry"), false);
  });

  it("preserves previous registries when projection falls back to engine cues", async () => {
    const sideA = sheet("a", "A");
    const sideB = sheet("b", "B");
    const state = createBattleState({
      id: "projection-fallback",
      sideA,
      sideB,
      turnLimit: 20,
      prologuePending: false,
    });
    const priorContact = {
      contactId: "contact.a.1",
      currentAccess: "trace" as const,
      identityKnowledge: "unknown" as const,
      identifiedRef: null,
      perceivedAs: "遠方の気配",
      salience: "noticeable" as const,
      lastObservedTurn: 0,
      sourceSet: [{ kind: "event" as const, eventId: "event.prior" }],
    };
    state.perceptionRegistryA = {
      schemaVersion: 1,
      observerSide: "a",
      nextContactSequence: 2,
      contacts: [priorContact],
    };
    const resolved = resolveTurn({
      state,
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: [],
      sideBSkills: [],
    });
    const llm = new MockLlmProvider();
    llm.reconcileTurnSemanticState = async (input) => ({
      patch: {
        baseRevision: input.before.revision,
        turn: input.turn,
        sourceEventIds: [],
        operations: [],
      },
      worldPatchStatus: "valid",
      // Force sensory validation failure so projection still uses engine cues.
      sensoryEvidenceStatus: "valid",
      sensoryEvidence: [{
        evidenceId: "evidence.bad",
        basisEventIds: ["missing.event"],
        modality: "sound",
        phenomenon: "無効な証拠",
        source: { kind: "ambient" },
        accessBySide: {
          a: {
            currentAccess: "trace",
            identityKnowledge: "unknown",
            perceivedAs: "無効",
            direction: "unknown",
            distance: "mid",
            occurrenceCertainty: "certain",
            attributionCertainty: "unknown",
          },
          b: {
            currentAccess: "none",
            identityKnowledge: "unknown",
            perceivedAs: "知覚できない",
            direction: "unknown",
            distance: "unknown",
            occurrenceCertainty: "unknown",
            attributionCertainty: "unknown",
          },
        },
        publicAccess: {
          currentAccess: "none",
          identityKnowledge: "unknown",
          perceivedAs: "知覚できない",
          direction: "unknown",
          distance: "unknown",
          occurrenceCertainty: "unknown",
          attributionCertainty: "unknown",
        },
      }],
    });
    const result = await reconcileSemanticState({
      llm,
      stateBeforeTurn: state,
      resolvedState: resolved.state,
      mine: sideA,
      opp: sideB,
      actions: resolved.actions,
      events: resolved.events,
      mechanicalEvidence: resolved.mechanicalEvidence,
    });
    assert.equal(result.sensoryEvidenceStatus, "rejected");
    assert.deepEqual(result.sensoryEvidence, []);
    assert.equal(result.state.perceptionFrameA?.self.currentAccess, "clear");
    assert.ok(
      (result.state.perceptionFrameA?.qualitativeChanges.length ?? 0) >= 0,
    );
    assert.equal(
      result.state.perceptionRegistryA?.contacts[0]?.contactId,
      "contact.a.1",
    );
    assert.equal(
      JSON.stringify(result.state.perceptionFrameA).includes("sourceSet"),
      false,
    );
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
      mechanicalEvidence: [],
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
