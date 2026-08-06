import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ShadowCanonicalFactSchema,
  ShadowCanonicalPatchSchema,
  auditShadowCanonicalPatch,
  canonicalFactSlotKey,
  convertFreeActionToShadowPatch,
  convertMechanicalEvidenceToShadowPatch,
  convertSemanticTransitionToShadowPatch,
  convertWorldTransitionToShadowPatch,
  type CanonicalFactAuthority,
  type CanonicalFactRefLookup,
  type CanonicalFactSubsystem,
  type ShadowCanonicalFact,
} from "./battle-canonical-patch.js";
import {
  applyBattleWorldTransition,
  readBattleWorldPair,
  type BattleWorldTransition,
} from "./battle-world.js";
import { createBattleState, resolveTurn } from "./battle-engine.js";
import { defaultParameters, type CharacterSheet } from "./character.js";
import type { SemanticValue } from "./semantic-state.js";
import { applyTurnSemanticPatch } from "./semantic-state.js";

function sheet(id: string, displayName: string): CharacterSheet {
  const timestamp = "2026-08-06T00:00:00.000Z";
  return {
    id,
    ownerUserId: `owner-${id}`,
    displayName,
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    appearance: {
      summary: `${displayName}の姿`,
      visualPrompt: `${displayName} standing`,
    },
    traits: [],
    parameters: defaultParameters({
      hp: 100,
      maxHp: 100,
      mp: 30,
      maxMp: 30,
      stamina: 30,
      maxStamina: 30,
      atk: 12,
      def: 10,
      spd: 10,
    }),
    basicAttack: {
      name: `${displayName}の攻撃`,
      description: "近距離の相手へ働きかける。",
      targetParameter: "hp",
      scalingParameter: "atk",
      resistanceParameter: "def",
      power: 0.75,
      constraints: {
        reach: "near",
        requiresSight: false,
        mobility: "limited",
        requiresSpeech: false,
        requiresUsableHeldObject: false,
      },
    },
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: {
      canFight: true,
      irreversibleIncapacitated: false,
    },
    narrativeBlurb: `${displayName}のテスト設定`,
  };
}

function state() {
  return createBattleState({
    id: "battle-canonical-patch-poc",
    sideA: sheet("a", "アルファ"),
    sideB: sheet("b", "ベータ"),
    turnLimit: 20,
    prologuePending: false,
  });
}

function oldFact(input: {
  id: string;
  subjectRef: string;
  predicate: string;
  objectRef?: string;
  value?: SemanticValue;
  subsystem?: CanonicalFactSubsystem;
  authority?: CanonicalFactAuthority;
}): ShadowCanonicalFact {
  const subsystem = input.subsystem ?? "mechanical";
  const authority = input.authority ?? "deterministic_resolver";
  return ShadowCanonicalFactSchema.parse({
    id: input.id,
    subjectRef: input.subjectRef,
    predicate: input.predicate,
    ...(input.objectRef ? { objectRef: input.objectRef } : {}),
    ...(Object.hasOwn(input, "value") ? { value: input.value } : {}),
    validFrom: { turn: 0, revision: 0 },
    provenance: {
      subsystem,
      authority,
      sourceRef: `seed:${input.id}`,
      sourceEventRefs: [],
    },
  });
}

function lookup(facts: ShadowCanonicalFact[]): CanonicalFactRefLookup {
  return Object.fromEntries(facts.map((fact) => [
    canonicalFactSlotKey(fact),
    fact.id,
  ]));
}

describe("shadow canonical patch PoC", () => {
  it("converts deterministic mechanical evidence without gaining commit authority", () => {
    const before = state();
    const untouched = structuredClone(before);
    const resolved = resolveTurn({
      state: before,
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: [],
      sideBSkills: [],
    });
    const changed = resolved.mechanicalEvidence.filter((item) => item.delta !== 0);
    assert.ok(changed.length > 0);
    const existing = changed.map((item, index) => oldFact({
      id: `fact.mechanical.${index + 1}`,
      subjectRef: item.target.entityId,
      predicate: `parameter.${item.parameterKey}`,
      value: item.beforeValue,
    }));

    const converted = convertMechanicalEvidenceToShadowPatch({
      evidence: resolved.mechanicalEvidence,
      existingFactRefs: lookup(existing),
    });

    assert.equal(converted.status, "converted");
    if (converted.status !== "converted") return;
    assert.equal(converted.patch.mode, "shadow");
    assert.equal(converted.patch.assertions.length, changed.length);
    assert.equal(converted.patch.retractions.length, changed.length);
    assert.ok(converted.patch.assertions.every((fact) =>
      fact.provenance.authority === "deterministic_resolver"
    ));
    const audit = auditShadowCanonicalPatch({
      patch: converted.patch,
      context: {
        knownEntityRefs: ["character.a", "character.b"],
        existingFacts: existing,
      },
    });
    assert.equal(audit.verdict, "no_issue_found");
    assert.deepEqual(before, untouched);
  });

  it("converts an applied semantic fact update from authoritative before/after state", () => {
    const battle = state();
    assert.ok(battle.semanticState);
    const before = structuredClone(battle.semanticState);
    const patch = {
      baseRevision: before.revision,
      turn: 1,
      sourceEventIds: ["event.semantic"],
      operations: [{
        op: "replace" as const,
        path: "/entities/character.a/facts/visible_conditions",
        value: { bruised: "light" },
      }],
    };
    const applied = applyTurnSemanticPatch({
      state: before,
      patch,
      turn: 1,
      allowedSourceEventIds: new Set(["event.semantic"]),
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const existing = [oldFact({
      id: "fact.semantic.visible-conditions",
      subjectRef: "character.a",
      predicate: "semantic.visible_conditions",
      value: {},
      subsystem: "semantic",
      authority: "validated_semantic_transition",
    })];

    const converted = convertSemanticTransitionToShadowPatch({
      before,
      after: applied.state,
      patch,
      existingFactRefs: lookup(existing),
    });

    assert.equal(converted.status, "converted");
    if (converted.status !== "converted") return;
    assert.deepEqual(converted.patch.assertions[0]?.value, {
      bruised: "light",
    });
    assert.equal(
      converted.patch.assertions[0]?.provenance.authority,
      "validated_semantic_transition",
    );
    assert.equal(auditShadowCanonicalPatch({
      patch: converted.patch,
      context: {
        knownEntityRefs: Object.keys(before.entities),
        existingFacts: existing,
      },
    }).verdict, "no_issue_found");
  });

  it("converts an applied world placement update and preserves inverse references", () => {
    const battle = state();
    assert.ok(battle.worldState);
    const before = structuredClone(battle.worldState);
    before.areas["area.remote"] = {
      ...structuredClone(before.areas["area.1"]!),
      label: "遠隔区画",
    };
    const currentPlacement = before.entities["character.b"]!.placement;
    assert.equal(currentPlacement.type, "scene");
    if (currentPlacement.type !== "scene") return;
    const pair = readBattleWorldPair(before, "character.a", "character.b");
    assert.ok(pair);
    if (!pair) return;
    const transition: BattleWorldTransition = {
      baseRevision: before.revision,
      turn: 1,
      sourceEventIds: ["event.world"],
      operations: [{
        op: "set_placement",
        entityId: "character.b",
        placement: { type: "scene", areaId: "area.remote" },
      }, {
        op: "set_pair_relation",
        entityAId: "character.a",
        entityBId: "character.b",
        distance: "separate_area",
        sight: "blocked",
        sound: "partial",
        orientationA: pair.orientationA,
        orientationB: pair.orientationB,
      }],
    };
    const applied = applyBattleWorldTransition({
      state: before,
      transition,
      turn: 1,
      allowedSourceEventIds: new Set(["event.world"]),
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const existing = [
      oldFact({
        id: "fact.world.character-b-placement",
        subjectRef: "character.b",
        predicate: "world.placement",
        objectRef: currentPlacement.areaId,
        value: currentPlacement,
        subsystem: "world",
        authority: "validated_world_transition",
      }),
      ...[
        ["relation.distance", pair.distance],
        ["relation.sight", pair.sight],
        ["relation.sound", pair.sound],
        ["relation.first_orientation", pair.orientationA],
        ["relation.second_orientation", pair.orientationB],
      ].map(([predicate, value], index) => oldFact({
        id: `fact.world.pair-${index + 1}`,
        subjectRef: "character.a",
        predicate: String(predicate),
        objectRef: "character.b",
        value: String(value),
        subsystem: "world",
        authority: "validated_world_transition",
      })),
    ];

    const converted = convertWorldTransitionToShadowPatch({
      before,
      after: applied.state,
      transition,
      existingFactRefs: lookup(existing),
    });

    assert.equal(converted.status, "converted");
    if (converted.status !== "converted") return;
    assert.equal(converted.patch.assertions[0]?.objectRef, "area.remote");
    assert.deepEqual(converted.patch.assertions[0]?.value, {
      type: "scene",
      areaId: "area.remote",
    });
    assert.equal(auditShadowCanonicalPatch({
      patch: converted.patch,
      context: {
        knownEntityRefs: [
          ...Object.keys(before.entities),
          ...Object.keys(before.areas),
        ],
        existingFacts: existing,
      },
    }).verdict, "no_issue_found");
  });

  it("attributes an accepted free-action world result without changing its authority", () => {
    const battle = state();
    assert.ok(battle.worldState);
    const before = structuredClone(battle.worldState);
    const transition: BattleWorldTransition = {
      baseRevision: before.revision,
      turn: 1,
      sourceEventIds: ["event.free-action"],
      operations: [{
        op: "set_exposure",
        entityId: "character.a",
        exposure: "partially_concealed",
      }],
    };
    const applied = applyBattleWorldTransition({
      state: before,
      transition,
      turn: 1,
      allowedSourceEventIds: new Set(["event.free-action"]),
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const existing = [oldFact({
      id: "fact.world.character-a-exposure",
      subjectRef: "character.a",
      predicate: "entity.exposure",
      value: "exposed",
      subsystem: "world",
      authority: "validated_world_transition",
    })];

    const converted = convertFreeActionToShadowPatch({
      before,
      after: applied.state,
      transition,
      receipt: {
        actionId: "turn-1-action-a",
        actorSide: "a",
        intentText: "身を隠す",
        outcome: "accepted",
        reason: "accepted",
        subjectRef: "self",
        canonicalEntityId: "character.a",
        promotion: "not_needed",
        operationKinds: ["set_exposure"],
        summary: "アルファは物陰へ身を寄せた。",
      },
      existingFactRefs: lookup(existing),
    });

    assert.equal(converted.status, "converted");
    if (converted.status !== "converted") return;
    assert.equal(converted.patch.sourceRef, "free-action:turn-1-action-a");
    assert.equal(converted.patch.assertions[0]?.provenance.subsystem, "free_action");
    assert.equal(
      converted.patch.assertions[0]?.provenance.authority,
      "free_action_commit",
    );
  });

  it("returns indeterminate instead of inventing identity or missing prior facts", () => {
    const battle = state();
    const resolved = resolveTurn({
      state: battle,
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: [],
      sideBSkills: [],
    });
    assert.equal(convertMechanicalEvidenceToShadowPatch({
      evidence: resolved.mechanicalEvidence,
      existingFactRefs: {},
    }).status, "indeterminate");

    assert.ok(battle.worldState);
    const before = structuredClone(battle.worldState);
    const transition: BattleWorldTransition = {
      baseRevision: before.revision,
      turn: 1,
      sourceEventIds: [],
      operations: [{
        op: "add_area",
        areaId: "area.new",
        area: {
          label: "新規区画",
          illumination: "normal",
          noise: "normal",
          space: "open",
          movement: "open",
        },
      }],
    };
    const applied = applyBattleWorldTransition({
      state: before,
      transition,
      turn: 1,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const conversion = convertWorldTransitionToShadowPatch({
      before,
      after: applied.state,
      transition,
      existingFactRefs: {},
    });
    assert.equal(conversion.status, "indeterminate");
    if (conversion.status === "indeterminate") {
      assert.deepEqual(conversion.unsupportedOperationIndexes, [0]);
    }
  });

  it("detects bounded static audit defects and keeps incomplete scope distinct", () => {
    const existing = oldFact({
      id: "fact.character-a-active",
      subjectRef: "character.a",
      predicate: "entity.active",
      value: true,
      subsystem: "world",
      authority: "validated_world_transition",
    });
    const base = ShadowCanonicalPatchSchema.parse({
      schemaVersion: 1,
      mode: "shadow",
      sourceRef: "repair-probe",
      assertions: [{
        id: "fact.asserted-character-a-active",
        subjectRef: "character.a",
        predicate: "entity.active",
        value: false,
        validFrom: { turn: 1 },
        provenance: {
          subsystem: "world",
          authority: "deterministic_resolver",
          sourceRef: "repair-probe",
          sourceEventRefs: [],
        },
      }],
      retractions: [existing.id, "fact.missing"],
      causalLinks: [{
        sourceRef: "repair-probe",
        targetFactRef: existing.id,
        relation: "ended",
      }],
      touchedRefs: [],
    });

    const audited = auditShadowCanonicalPatch({
      patch: base,
      context: {
        knownEntityRefs: ["character.a"],
        existingFacts: [existing],
        maxPatchBytes: 10,
      },
    });

    assert.equal(audited.verdict, "issue_found");
    const codes = new Set(audited.issues.map((issue) => issue.code));
    for (const code of [
      "patch_too_large",
      "missing_retraction",
      "forbidden_state",
      "missing_causal_link",
      "incomplete_touched_refs",
      "authority_mismatch",
    ] as const) {
      assert.equal(codes.has(code), true, `missing ${code}`);
    }

    const cleanPatch = structuredClone(base);
    cleanPatch.assertions = [];
    cleanPatch.retractions = [];
    cleanPatch.causalLinks = [];
    cleanPatch.touchedRefs = [];
    const incomplete = auditShadowCanonicalPatch({
      patch: cleanPatch,
      context: {
        knownEntityRefs: ["character.a"],
        existingFacts: [existing],
        contextComplete: false,
      },
    });
    assert.equal(incomplete.verdict, "indeterminate");
    assert.deepEqual(
      incomplete.issues.map((issue) => issue.code),
      ["incomplete_context"],
    );
  });

  it("detects schema reference conflict and causal-target defects", () => {
    const invalidSchema = auditShadowCanonicalPatch({
      patch: { mode: "authoritative" },
      context: { knownEntityRefs: [], existingFacts: [] },
    });
    assert.equal(invalidSchema.verdict, "issue_found");
    assert.deepEqual(
      invalidSchema.issues.map((issue) => issue.code),
      ["invalid_schema"],
    );

    const patch = ShadowCanonicalPatchSchema.parse({
      schemaVersion: 1,
      mode: "shadow",
      sourceRef: "defect-probe",
      assertions: [
        {
          id: "fact.defect.1",
          subjectRef: "character.a",
          predicate: "combat.defending",
          value: true,
          validFrom: { turn: 1 },
          provenance: {
            subsystem: "mechanical",
            authority: "deterministic_resolver",
            sourceRef: "defect-probe",
            sourceEventRefs: [],
          },
        },
        {
          id: "fact.defect.2",
          subjectRef: "character.a",
          predicate: "combat.defending",
          value: false,
          validFrom: { turn: 1 },
          provenance: {
            subsystem: "mechanical",
            authority: "deterministic_resolver",
            sourceRef: "defect-probe",
            sourceEventRefs: [],
          },
        },
        {
          id: "fact.defect.3",
          subjectRef: "character.unknown",
          predicate: "combat.defending",
          value: true,
          validFrom: { turn: 1 },
          provenance: {
            subsystem: "mechanical",
            authority: "deterministic_resolver",
            sourceRef: "defect-probe",
            sourceEventRefs: [],
          },
        },
      ],
      retractions: [],
      causalLinks: [{
        sourceRef: "defect-probe",
        targetFactRef: "fact.defect.1",
        relation: "ended",
      }],
      touchedRefs: ["character.a", "character.unknown"],
    });
    const audit = auditShadowCanonicalPatch({
      patch,
      context: {
        knownEntityRefs: ["character.a"],
        existingFacts: [],
      },
    });
    assert.equal(audit.verdict, "issue_found");
    const codes = new Set(audit.issues.map((issue) => issue.code));
    assert.equal(codes.has("unknown_entity_reference"), true);
    assert.equal(codes.has("direct_conflict"), true);
    assert.equal(codes.has("invalid_causal_target"), true);
    assert.equal(codes.has("missing_causal_link"), true);
  });
});
