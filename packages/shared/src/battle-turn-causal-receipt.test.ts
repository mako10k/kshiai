import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBattleTurnCausalReceipt,
  buildNarrationCausalProjection,
  type BuildBattleTurnCausalReceiptInput,
} from "./battle-turn-causal-receipt.js";
import { createBattleState, resolveTurn } from "./battle-engine.js";
import { defaultParameters, type CharacterSheet } from "./character.js";
import {
  applyTurnSemanticPatch,
  buildSemanticObservationState,
  type TurnSemanticPatch,
} from "./semantic-state.js";
import type {
  CharacterPerceptionFrame,
  NarrationPerceptionView,
} from "./perception.js";

function sheet(id: string, name: string): CharacterSheet {
  const timestamp = "2026-08-07T00:00:00.000Z";
  return {
    id,
    ownerUserId: `owner-${id}`,
    displayName: name,
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    appearance: { summary: `${name}の外見`, visualPrompt: `${name} portrait` },
    traits: ["勇敢"],
    parameters: defaultParameters({ hp: 100, maxHp: 100 }),
    skills: [{
      id: `slash-${id}`,
      name: `${name}の斬撃`,
      description: "剣で斬りつける",
      costMp: 0,
      costStamina: 5,
      power: 1.2,
      kind: "attack",
    }],
    weapon: {
      name: "剣",
      description: "鉄の剣",
      atkBonus: 0,
      defBonus: 0,
      magBonus: 0,
    },
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "テスト用",
  };
}

function fixture(): {
  input: BuildBattleTurnCausalReceiptInput;
  publicObservation: NonNullable<
    BuildBattleTurnCausalReceiptInput["after"]["observationStatePublic"]
  >;
} {
  const sideA = sheet("a", "アオ");
  const sideB = sheet("b", "クロ");
  const before = createBattleState({
    id: "causal-receipt",
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
    sideABasicAttack: sideA.basicAttack,
    sideBBasicAttack: sideB.basicAttack,
  });
  const sourceEvent = resolved.events.find((event) =>
    event.id && event.sourceActionId === resolved.actions[0]?.id
  );
  assert.ok(sourceEvent?.id);
  assert.ok(before.semanticState);
  const patch: TurnSemanticPatch = {
    baseRevision: before.semanticState.revision,
    turn: resolved.state.turn,
    sourceEventIds: [sourceEvent.id],
    operations: [{
      op: "replace",
      path: "/scene/summary",
      value: "斬撃の余波が残る路地",
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
  return {
    input: {
      turn: after.turn,
      before,
      after,
      actions: resolved.actions,
      events: resolved.events,
      mechanicalEvidence: resolved.mechanicalEvidence,
      mechanicalEvidenceStatus: "valid",
      semanticTransition: after.latestSemanticTransition,
    },
    publicObservation,
  };
}

function receipt(input: BuildBattleTurnCausalReceiptInput) {
  const result = buildBattleTurnCausalReceipt(input);
  if (!result.ok) assert.fail(JSON.stringify(result.issues));
  return result.receipt;
}

const externalView: NarrationPerceptionView = {
  schemaVersion: 1,
  mode: "external",
  viewpointSide: null,
  resolvedFromFluid: false,
  references: [],
};

const omniscientView: NarrationPerceptionView = {
  schemaVersion: 1,
  mode: "omniscient",
  viewpointSide: null,
  resolvedFromFluid: false,
  references: [],
};

describe("battle turn causal receipt", () => {
  it("assembles explicit action, event, mechanics, semantic, and carry-forward owners", () => {
    const { input } = fixture();
    const built = receipt(input);

    assert.equal(built.turn, 1);
    assert.equal(built.actions.length, 2);
    assert.equal(built.actions[0]?.requested?.kind, "skill");
    assert.equal(built.actions[0]?.effective.kind, "skill");
    assert.equal(built.actions[0]?.resolution.status, "known");
    assert.ok(built.actions[0]!.events.length > 0);
    assert.ok(built.actions[0]!.mechanicalEvidence.length > 0);
    assert.equal(built.semantic.status, "applied");
    assert.deepEqual(built.semantic.acceptedChange?.sourceActionIds, [
      built.actions[0]!.actionId,
    ]);
    assert.equal(built.semantic.acceptedChange?.operations.length, 1);
    assert.equal(built.carryForward.length, 2);
    assert.ok(built.carryForward[0]!.after.reserveCues.length > 0);
    assert.equal(Object.isFrozen(built), true);
    assert.equal(Object.isFrozen(built.actions[0]), true);
  });

  it("keeps absent links unknown and never mines an event summary", () => {
    const { input } = fixture();
    const actionId = input.actions[0]!.id;
    const event = input.events.find((candidate) =>
      candidate.id && candidate.sourceActionId === actionId
    );
    assert.ok(event?.id);
    const events = input.events.map((candidate) =>
      candidate.id === event.id
        ? {
            ...candidate,
            sourceActionId: undefined,
            summary: `${actionId} が原因だと自由文だけが主張する`,
          }
        : candidate
    );
    const mechanicalEvidence = input.mechanicalEvidence.map((evidence) =>
      evidence.basisEventIds.includes(event.id!)
        ? { ...evidence, sourceActionId: null }
        : evidence
    );
    const built = receipt({ ...input, events, mechanicalEvidence });

    assert.ok(built.unlinkedEvents.some((candidate) => candidate.id === event.id));
    assert.ok(
      built.unlinkedMechanicalEvidence.some((evidence) =>
        evidence.basisEventIds.includes(event.id!)
      ),
    );
    assert.ok(
      !built.actions[0]!.events.some((candidate) => candidate.id === event.id),
    );
    assert.deepEqual(built.semantic.acceptedChange?.sourceActionIds, []);
    assert.deepEqual(
      built.semantic.acceptedChange?.unattributedSourceEventIds,
      [event.id],
    );
  });

  it("rejects dangling links and non-valid mechanical evidence", () => {
    const { input } = fixture();
    const dangling = buildBattleTurnCausalReceipt({
      ...input,
      events: input.events.map((event, index) =>
        index === 0 ? { ...event, sourceActionId: "missing-action" } : event
      ),
    });
    assert.equal(dangling.ok, false);
    if (dangling.ok) assert.fail("dangling receipt unexpectedly succeeded");
    assert.ok(dangling.issues.some((issue) => issue.code === "dangling_link"));

    const rejected = buildBattleTurnCausalReceipt({
      ...input,
      mechanicalEvidenceStatus: "rejected",
    });
    assert.equal(rejected.ok, false);
    if (rejected.ok) assert.fail("rejected evidence unexpectedly succeeded");
    assert.ok(
      rejected.issues.some((issue) => issue.code === "uncommitted_evidence"),
    );
  });

  it("rejects an applied patch that cannot reproduce committed semantic state", () => {
    const { input } = fixture();
    const invalid = buildBattleTurnCausalReceipt({
      ...input,
      semanticTransition: {
        ...input.semanticTransition,
        patch: {
          baseRevision: input.before.semanticState!.revision,
          turn: input.turn,
          sourceEventIds: [],
          operations: [{
            op: "replace",
            path: "/revision",
            value: 99,
          }],
        },
      },
    });
    assert.equal(invalid.ok, false);
    if (invalid.ok) assert.fail("protected patch unexpectedly succeeded");
    assert.ok(
      invalid.issues.some((issue) =>
        issue.code === "invalid_semantic_transition"
      ),
    );
  });
});

describe("narration causal projection", () => {
  it("projects external causal structure without IDs, raw values, or semantic paths", () => {
    const { input, publicObservation } = fixture();
    const built = receipt(input);
    const projection = buildNarrationCausalProjection({
      receipt: built,
      perception: externalView,
      participantLabels: { a: "アオ", b: "クロ" },
      publicObservation,
    });
    const serialized = JSON.stringify(projection);

    assert.equal(projection.causalChains.length, 2);
    assert.ok(projection.causalChains[0]!.mechanicalConsequences.length > 0);
    assert.deepEqual(projection.observedSemanticChangeKinds, ["scene"]);
    assert.equal(projection.continuingConditions.length, 2);
    assert.ok(projection.continuingConditions[0]!.reserveCues.length > 0);
    for (const forbidden of [
      built.actions[0]!.actionId,
      built.actions[0]!.events[0]!.id!,
      built.actions[0]!.mechanicalEvidence[0]!.evidenceId,
      "character.a",
      "/scene/summary",
      "beforeValue",
      "afterValue",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    assert.equal(Object.isFrozen(projection), true);
  });

  it("attributes accepted semantic change only in an exact omniscient chain", () => {
    const { input } = fixture();
    const built = receipt(input);
    const projection = buildNarrationCausalProjection({
      receipt: built,
      perception: omniscientView,
      participantLabels: { a: "アオ", b: "クロ" },
    });
    const attributed = projection.causalChains.filter(
      (chain) => chain.semanticChangeKinds.length > 0,
    );

    assert.equal(attributed.length, 1);
    assert.deepEqual(attributed[0]!.semanticChangeKinds, ["scene"]);
    assert.deepEqual(projection.observedSemanticChangeKinds, []);
  });

  it("keeps character-limited changes observed but causally unassigned", () => {
    const { input } = fixture();
    const built = receipt(input);
    const baseFrame = input.before.perceptionFrameA!;
    const frame: CharacterPerceptionFrame = {
      ...baseFrame,
      qualitativeChanges: [{
        parameterKey: "hp",
        parameterClass: "vitality",
        direction: "loss",
        absoluteBand: "solid",
        relativeBand: "light",
        outcome: "effective",
        sourceKnowledge: "unknown",
        targetKnowledge: "self",
      }],
    };
    const selfView: NarrationPerceptionView = {
      schemaVersion: 1,
      mode: "self",
      viewpointSide: "a",
      viewpointSubject: "self",
      resolvedFromFluid: false,
      frame,
      references: [],
    };
    const projection = buildNarrationCausalProjection({
      receipt: built,
      perception: selfView,
      participantLabels: { a: "自分", b: "相手" },
    });

    assert.equal(projection.causalChains.length, 1);
    assert.equal(projection.causalChains[0]!.actorLabel, "自分");
    assert.deepEqual(projection.causalChains[0]!.events, []);
    assert.deepEqual(projection.causalChains[0]!.mechanicalConsequences, []);
    assert.deepEqual(projection.observedConsequences, frame.qualitativeChanges);
    assert.deepEqual(projection.observedSemanticChangeKinds, []);
    assert.equal(projection.continuingConditions.length, 1);
    assert.equal(projection.continuingConditions[0]!.participantLabel, "自分");
  });
});
