import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyTurnSemanticPatch,
  buildNarrationPerceptionView,
  buildSemanticObservationState,
  createBattleState,
  defaultParameters,
  resolveTurn,
  type CharacterSheet,
} from "@kshiai/shared";
import { buildGuardedNarrationCausalProjection } from "./battle-service.js";

function sheet(id: string, displayName: string): CharacterSheet {
  const timestamp = "2026-08-07T00:00:00.000Z";
  return {
    id,
    ownerUserId: `owner-${id}`,
    displayName,
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    appearance: { summary: `${displayName}の外見`, visualPrompt: "portrait" },
    traits: ["慎重"],
    parameters: defaultParameters({ hp: 100, maxHp: 100 }),
    skills: [{
      id: `skill-${id}`,
      name: `${displayName}の技`,
      description: "確実な一撃",
      costMp: 0,
      costStamina: 5,
      power: 1.1,
      kind: "attack",
    }],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "テスト用",
  };
}

function causalInput() {
  const sideA = sheet("a", "アオ");
  const sideB = sheet("b", "クロ");
  const before = createBattleState({
    id: "backend-causal-narration",
    sideA,
    sideB,
    turnLimit: 20,
    prologuePending: false,
  });
  const resolved = resolveTurn({
    state: before,
    playerAction: {
      actorSide: "a",
      kind: "skill",
      skillId: sideA.skills[0]!.id,
    },
    sideASkills: sideA.skills,
    sideBSkills: sideB.skills,
  });
  const sourceEvent = resolved.events.find((event) =>
    event.id && event.sourceActionId === resolved.actions[0]?.id
  );
  assert.ok(sourceEvent?.id);
  assert.ok(before.semanticState);
  const patch = {
    baseRevision: before.semanticState.revision,
    turn: resolved.state.turn,
    sourceEventIds: [sourceEvent.id],
    operations: [{
      op: "replace" as const,
      path: "/scene/summary",
      value: "一撃の余波が残る路地",
    }],
  };
  const applied = applyTurnSemanticPatch({
    state: before.semanticState,
    patch,
    turn: resolved.state.turn,
    allowedSourceEventIds: new Set(resolved.events.map((event) => event.id!)),
  });
  if (!applied.ok) assert.fail(applied.error.message);
  const publicObservation = buildSemanticObservationState({
    before: before.semanticState,
    after: applied.state,
    observer: "public",
    previousSnapshot: before.observationStatePublic?.snapshot,
  });
  const after = {
    ...resolved.state,
    semanticState: applied.state,
    observationStatePublic: publicObservation,
    latestSemanticTransition: {
      turn: resolved.state.turn,
      status: "applied" as const,
      fromRevision: before.semanticState.revision,
      toRevision: applied.state.revision,
      patch,
    },
  };
  const perception = buildNarrationPerceptionView({
    perspective: "external",
    focus: "external",
    sideALabel: "アオ",
    sideBLabel: "クロ",
    frameA: after.perceptionFrameA!,
    frameB: after.perceptionFrameB!,
    semanticState: after.semanticState,
    publicObservation,
  });
  return {
    before,
    after,
    actions: resolved.actions,
    events: resolved.events,
    mechanicalEvidence: resolved.mechanicalEvidence,
    mechanicalEvidenceStatus: "valid" as const,
    perception,
    participantLabels: { a: "アオ", b: "クロ" },
  };
}

describe("guarded narration causal projection wiring", () => {
  it("omits the projection in off mode without changing the turn", () => {
    const input = causalInput();
    const beforeSnapshot = structuredClone(input.after);
    const projection = buildGuardedNarrationCausalProjection({
      ...input,
      mode: "off",
    });

    assert.equal(projection, undefined);
    assert.deepEqual(input.after, beforeSnapshot);
  });

  it("builds one narrator-only projection in guarded mode", () => {
    const input = causalInput();
    const projection = buildGuardedNarrationCausalProjection({
      ...input,
      mode: "narration_guarded",
    });

    assert.ok(projection);
    assert.equal(projection.turn, input.after.turn);
    assert.equal(projection.causalChains.length, 2);
    assert.ok(projection.causalChains[0]!.mechanicalConsequences.length > 0);
    assert.deepEqual(projection.observedSemanticChangeKinds, ["scene"]);
  });

  it("falls back to the legacy narrator input when committed evidence is invalid", () => {
    const input = causalInput();
    const projection = buildGuardedNarrationCausalProjection({
      ...input,
      mode: "narration_guarded",
      mechanicalEvidenceStatus: "rejected",
    });

    assert.equal(projection, undefined);
  });
});
