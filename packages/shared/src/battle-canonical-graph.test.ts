import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BattleStateCanonicalGraphView,
  CanonicalGraphPatchReadSchema,
  CanonicalGraphQueryResultSchema,
  CanonicalGraphSnapshotSchema,
  createCanonicalGraphProjectionAdapter,
} from "./battle-canonical-graph.js";
import type { ShadowCanonicalPatch } from "./battle-canonical-patch.js";
import {
  createConsistencyIssuePocEnvelope,
  registerConsistencyAlert,
} from "./battle-consistency-issue.js";
import {
  BattleStateProjectionAdapter,
  expandAdjudicationFacts,
  expandConsistencyFacts,
} from "./battle-projection.js";
import {
  buildBattleTurnRecord,
  createBattleState,
  resolveTurn,
} from "./battle-engine.js";
import { defaultParameters, type CharacterSheet } from "./character.js";
import type { BattleWorldEntity } from "./battle-world.js";

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
    }),
    basicAttack: {
      name: `${displayName}の攻撃`,
      description: "近くの相手へ働きかける。",
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
    narrativeBlurb: `${displayName}のテスト用設定`,
  };
}

function objectEntity(
  placement: BattleWorldEntity["placement"],
): BattleWorldEntity {
  return {
    kind: "object",
    active: true,
    presence: "present",
    placement,
    exposure: "exposed",
    actorState: null,
    objectState: {
      portable: placement.type === "held" || placement.type === "worn",
      usable: true,
      exclusiveUse: false,
      usableBy: [],
      cover: "none",
      blocksMovement: false,
      visionEffect: "none",
      hearingEffect: "none",
      mobilityEffect: "none",
    },
    objectProfile: {
      canonicalLabel: "検証用の杖",
      description: "保持関係と逆参照を検証するための杖。",
      sourceRef: "test.graph.tool",
      candidateKey: "graph-tool",
      provenance: "committed_event",
      knownOpenAspects: [],
      observerRefs: {},
      observerLabels: {},
      concretizations: [],
    },
    createdTurn: 1,
    updatedTurn: 1,
  };
}

function effectEntity(areaId: string): BattleWorldEntity {
  return {
    kind: "effect",
    active: true,
    presence: "present",
    placement: { type: "scene", areaId },
    exposure: "exposed",
    actorState: null,
    objectState: null,
    createdTurn: 1,
    updatedTurn: 1,
  };
}

function graphState() {
  const initial = createBattleState({
    id: "battle-canonical-graph-poc",
    sideA: sheet("a", "アルファ"),
    sideB: sheet("b", "ベータ"),
    turnLimit: 20,
    prologuePending: false,
  });
  const turn = resolveTurn({
    state: initial,
    playerAction: { actorSide: "a", kind: "basic_attack" },
    sideASkills: [],
    sideBSkills: [],
  });
  turn.state.turnRecords = [buildBattleTurnRecord({
    before: initial,
    after: turn.state,
    events: turn.events,
    actions: turn.actions,
  })];
  assert.ok(turn.state.worldState);
  const areaId = turn.state.worldState.entities["character.a"]?.placement.type ===
      "scene"
    ? turn.state.worldState.entities["character.a"].placement.areaId
    : "area.1";
  turn.state.worldState.entities["object.graph-tool"] = objectEntity({
    type: "held",
    holderId: "character.a",
  });
  turn.state.worldState.entities["effect.graph-smoke"] = effectEntity(areaId);
  return turn.state;
}

function factSemantics(facts: ReturnType<typeof expandConsistencyFacts>) {
  return facts.map(({ id: _id, ...fact }) => fact);
}

describe("BattleState canonical graph view PoC", () => {
  it("reconstructs one deterministic immutable graph snapshot", () => {
    const state = graphState();
    const original = structuredClone(state);
    const first = new BattleStateCanonicalGraphView({ state }).snapshot();
    const reordered = structuredClone(state);
    assert.ok(reordered.worldState);
    reordered.worldState.entities = Object.fromEntries(
      Object.entries(reordered.worldState.entities).reverse(),
    );
    reordered.worldState.areas = Object.fromEntries(
      Object.entries(reordered.worldState.areas).reverse(),
    );
    reordered.worldState.pairRelations.reverse();
    if (reordered.semanticState) {
      reordered.semanticState.entities = Object.fromEntries(
        Object.entries(reordered.semanticState.entities).reverse(),
      );
    }
    const second = new BattleStateCanonicalGraphView({
      state: reordered,
    }).snapshot();

    CanonicalGraphSnapshotSchema.parse(first);
    assert.deepEqual(second, first);
    assert.deepEqual(state, original);
    assert.equal(first.mode, "battle_state_graph_view");
    assert.ok(first.entities.some((entity) =>
      entity.id === "effect.graph-smoke" && entity.kind === "process"
    ));
  });

  it("retains mechanical character identity for pre-world legacy state", () => {
    const state = graphState();
    state.worldState = undefined;
    state.semanticState = undefined;
    const graph = new BattleStateCanonicalGraphView({ state });
    const snapshot = graph.snapshot();

    assert.ok(snapshot.entities.some((entity) =>
      entity.id === "character.a" && entity.kind === "character"
    ));
    assert.ok(snapshot.entities.some((entity) =>
      entity.id === "character.b" && entity.kind === "character"
    ));
    assert.ok(graph.factsForEntity("character.a").some((fact) =>
      fact.predicate === "combat.can_fight"
    ));
    const projection = createCanonicalGraphProjectionAdapter(graph)
      .buildAdjudicationSlice({
        proposalRefs: ["proposal.a"],
        temporalWindow: { fromTurn: 1, toTurn: state.turn },
      });
    assert.ok(expandAdjudicationFacts(projection.value).some((fact) =>
      fact.subjectRef === "character.a" && fact.predicate === "combat.can_fight"
    ));
  });

  it("indexes entity fact temporal causal process issue and rule access", () => {
    const state = graphState();
    const base = new BattleStateCanonicalGraphView({ state });
    const heldFact = base.factsForEntity("object.graph-tool", false)
      .find((fact) => fact.predicate === "held_by");
    assert.ok(heldFact);
    const issueReceipt = registerConsistencyAlert({
      envelope: createConsistencyIssuePocEnvelope(),
      alert: {
        schemaVersion: 1,
        alertRef: "alert:graph-poc-held-state",
        reporter: "adjudicator",
        turn: state.turn,
        involvedRefs: ["object.graph-tool", "character.a"],
        conflictingClaims: [heldFact.id],
        blocking: true,
        explanation: "保持状態はpatch監査と裁定で確認が必要。",
      },
      discoveredAtStage: "adjudication",
      classifiedBlocksPurposes: ["adjudication", "patch_audit"],
    });
    const graph = new BattleStateCanonicalGraphView({
      state,
      issueEnvelope: issueReceipt.envelope,
    });
    const query = graph.query({
      anchorRefs: ["character.a"],
      purpose: "adjudication",
      temporalWindow: { fromTurn: 1, toTurn: state.turn },
      maxDepth: 3,
      maxEntities: 32,
      maxFacts: 256,
    });

    CanonicalGraphQueryResultSchema.parse(query);
    assert.equal(query.mode, "server_only_graph_query");
    assert.ok(query.entityRefs.includes("object.graph-tool"));
    assert.ok(query.worldProcessRefs.includes("effect.graph-smoke"));
    assert.ok(query.facts.some((fact) => fact.id === heldFact.id));
    assert.ok(query.causalLinks.length > 0);
    assert.equal(query.issues.length, 1);
    assert.ok(query.ruleRefs.includes("battle.rule.world-reference-integrity-v1"));
    assert.ok(graph.factsAtTurn(state.turn).some((fact) =>
      fact.predicate === "combat.can_fight"
    ));
    assert.ok(graph.causalLinksForFact(query.causalLinks[0]!.targetFactRef).length > 0);
    const stats = graph.indexStats();
    assert.ok(stats.entities > 0);
    assert.ok(stats.facts > 0);
    assert.ok(stats.factSubjectBuckets > 0);
    assert.ok(stats.factObjectBuckets > 0);
    assert.ok(stats.temporalTurnBuckets > 0);
    assert.ok(stats.causalSourceBuckets > 0);
    assert.ok(stats.causalTargetBuckets > 0);
    assert.ok(stats.interactionSourceBuckets > 0);
    assert.equal(stats.worldProcesses, 1);
    assert.equal(stats.issues, 1);
    assert.ok(stats.rules > 0);
  });

  it("serves projection facts through the graph source with direct parity", () => {
    const state = graphState();
    const direct = new BattleStateProjectionAdapter(state);
    const graph = new BattleStateCanonicalGraphView({ state });
    const indexed = createCanonicalGraphProjectionAdapter(graph);
    const observationRequest = {
      observerRef: "character.a" as const,
      purpose: "character_decision" as const,
    };
    assert.deepEqual(
      indexed.buildObservationSlice(observationRequest),
      direct.buildObservationSlice(observationRequest),
    );
    const adjudicationRequest = {
      proposalRefs: ["proposal.a", "proposal.b"],
      temporalWindow: {
        fromTurn: 1,
        toTurn: state.turn,
        phase: "proposal" as const,
      },
    };
    const directAdjudication = direct.buildAdjudicationSlice(
      adjudicationRequest,
    );
    const indexedAdjudication = indexed.buildAdjudicationSlice(
      adjudicationRequest,
    );
    assert.deepEqual(
      expandAdjudicationFacts(indexedAdjudication.value),
      expandAdjudicationFacts(directAdjudication.value),
    );
    assert.deepEqual(indexedAdjudication.value.scope, directAdjudication.value.scope);
    const consistencyRequest = {
      anchorRefs: ["character.a", "object.graph-tool"],
      purpose: "patch_audit" as const,
      temporalWindow: {
        fromTurn: 1,
        toTurn: state.turn,
        phase: "post_commit" as const,
      },
    };
    const directConsistency = direct.buildConsistencySlice(consistencyRequest);
    const indexedConsistency = indexed.buildConsistencySlice(consistencyRequest);
    assert.deepEqual(
      factSemantics(expandConsistencyFacts(indexedConsistency.value)),
      factSemantics(expandConsistencyFacts(directConsistency.value)),
    );
    assert.deepEqual(indexedConsistency.value.scope, directConsistency.value.scope);
    assert.deepEqual(
      indexedConsistency.value.causalLinks,
      directConsistency.value.causalLinks,
    );
  });

  it("builds bounded direct inverse causal and issue context for a patch", () => {
    const state = graphState();
    const base = new BattleStateCanonicalGraphView({ state });
    const heldFact = base.factsForEntity("object.graph-tool", false)
      .find((fact) => fact.predicate === "held_by");
    assert.ok(heldFact);
    const issueReceipt = registerConsistencyAlert({
      envelope: createConsistencyIssuePocEnvelope(),
      alert: {
        schemaVersion: 1,
        alertRef: "alert:graph-poc-patch",
        reporter: "adjudicator",
        turn: state.turn,
        involvedRefs: ["object.graph-tool"],
        conflictingClaims: [heldFact.id],
        blocking: true,
        explanation: "patch対象の既存保持factを確認する。",
      },
      discoveredAtStage: "adjudication",
      classifiedBlocksPurposes: ["patch_audit"],
    });
    const graph = new BattleStateCanonicalGraphView({
      state,
      issueEnvelope: issueReceipt.envelope,
    });
    const patch: ShadowCanonicalPatch = {
      schemaVersion: 1,
      mode: "shadow",
      sourceRef: "action:graph-poc-transfer",
      assertions: [{
        id: "fact:graph-poc-held-by-b",
        subjectRef: "object.graph-tool",
        predicate: "held_by",
        objectRef: "character.b",
        validFrom: { turn: state.turn },
        provenance: {
          subsystem: "world",
          authority: "validated_world_transition",
          sourceRef: "action:graph-poc-transfer",
          sourceEventRefs: [],
        },
      }],
      retractions: [heldFact.id],
      causalLinks: [],
      touchedRefs: ["object.graph-tool", "character.a", "character.b"],
    };
    const read = graph.readPatch(patch);

    CanonicalGraphPatchReadSchema.parse(read);
    assert.ok(read.directFacts.some((fact) => fact.id === heldFact.id));
    assert.ok(read.inverseFacts.some((fact) => fact.id === heldFact.id));
    assert.deepEqual(read.retractionFacts.map((fact) => fact.id), [heldFact.id]);
    assert.ok(read.assertionSlotFacts.some((fact) =>
      fact.subjectRef === "object.graph-tool" && fact.predicate === "held_by"
    ));
    assert.ok(read.recentCausalFacts.some((fact) => fact.source === "event"));
    assert.ok(read.causalLinks.length > 0);
    assert.deepEqual(read.missingRetractionFactRefs, []);
    assert.equal(read.issues.length, 1);
    assert.equal(read.sourceMutated, false);
  });

  it("does not alter BattleState or deterministic resolution", () => {
    const state = graphState();
    const original = structuredClone(state);
    const graph = new BattleStateCanonicalGraphView({ state });
    graph.query({
      anchorRefs: ["character.a"],
      purpose: "world_process",
    });
    createCanonicalGraphProjectionAdapter(graph).buildConsistencySlice({
      anchorRefs: ["character.a"],
      purpose: "world_process",
    });
    assert.deepEqual(state, original);

    const withoutGraph = resolveTurn({
      state: structuredClone(state),
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: [],
      sideBSkills: [],
    });
    const withGraph = resolveTurn({
      state: graph.legacyStateSnapshot(),
      playerAction: { actorSide: "a", kind: "basic_attack" },
      sideASkills: [],
      sideBSkills: [],
    });
    assert.deepEqual(withGraph.actions, withoutGraph.actions);
    assert.deepEqual(withGraph.events, withoutGraph.events);
    assert.deepEqual(withGraph.state.sideA.parameters, withoutGraph.state.sideA.parameters);
    assert.deepEqual(withGraph.state.sideB.parameters, withoutGraph.state.sideB.parameters);
  });
});
