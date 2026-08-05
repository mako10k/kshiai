import {
  BattleWorldEntitySchema,
  FreeActionAdjudicationBatchSchema,
  FreeActionAdjudicationProposalSchema,
  FreeActionResolutionReceiptSchema,
  WorldExposureSchema,
  WorldPlacementSchema,
  applyBattleWorldTransition,
  readBattleWorldPair,
  type BattleState,
  type BattleWorldEntity,
  type BattleWorldOperation,
  type CharacterActionIntent,
  type CharacterPerceptionFrame,
  type CharacterSheet,
  type DecisionProfile,
  type FreeActionAdjudicationBatch,
  type FreeActionAdjudicationProposal,
  type FreeActionCanonicalRoot,
  type FreeActionResolutionReceipt,
  type LatentAffordanceProjection,
  type OpportunityChain,
  type ResolvedBattleAction,
  type TacticalNeedFrame,
  type TurnEvent,
  type WorldCausalEnvelope,
  type WorldDistance,
} from "@kshiai/shared";
import type { LlmProvider } from "../llm/types.js";

type BattleSide = "a" | "b";

export type FreeActionTurnPreparation = {
  roots: FreeActionCanonicalRoot[];
  affordances: Record<BattleSide, LatentAffordanceProjection[]>;
  adjudication: FreeActionAdjudicationBatch | null;
};

function otherSide(side: BattleSide): BattleSide {
  return side === "a" ? "b" : "a";
}

function actorId(side: BattleSide): `character.${BattleSide}` {
  return `character.${side}`;
}

function canonicalDistanceBetweenSides(
  state: BattleState,
  observer: BattleSide,
  subject: BattleSide,
) {
  if (observer === subject) return "contact" as const;
  return state.worldState
    ? readBattleWorldPair(
        state.worldState,
        actorId(observer),
        actorId(subject),
      )?.distance ?? "out_of_scene" as const
    : "out_of_scene" as const;
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function profileForSide(
  side: BattleSide,
  mine: CharacterSheet,
  opp: CharacterSheet,
): CharacterSheet {
  return side === "a" ? mine : opp;
}

function frameForSide(
  state: BattleState,
  side: BattleSide,
): CharacterPerceptionFrame | undefined {
  return side === "a" ? state.perceptionFrameA : state.perceptionFrameB;
}

function observedEntityLabel(
  frame: CharacterPerceptionFrame | undefined,
  entityId: string,
): string | null {
  const slot = frame?.others.find((candidate) =>
    candidate.subject.kind === "identified" &&
    candidate.subject.perceptionRef === entityId &&
    candidate.currentAccess !== "none"
  );
  return slot?.perceivedAs ?? null;
}

function sameVisibleArea(
  state: BattleState,
  side: BattleSide,
  entityId: string,
): boolean {
  const world = state.worldState;
  if (!world) return false;
  const actor = world.entities[actorId(side)];
  const entity = world.entities[entityId];
  if (
    !actor ||
    !entity ||
    !entity.active ||
    entity.presence !== "present" ||
    ["hidden", "invisible"].includes(entity.exposure)
  ) {
    return false;
  }
  if (
    entity.placement.type === "held" ||
    entity.placement.type === "worn"
  ) {
    return entity.placement.type === "held"
      ? entity.placement.holderId === actorId(side)
      : entity.placement.wearerId === actorId(side);
  }
  return actor.placement.type === "scene" &&
    entity.placement.type === "scene" &&
    actor.placement.areaId === entity.placement.areaId;
}

function worldRootRefs(input: {
  state: BattleState;
  entityId: string;
  entity: BattleWorldEntity;
  canonicalLabel: string | null;
  description: string;
  provenance: FreeActionCanonicalRoot["provenance"];
}): FreeActionCanonicalRoot[] {
  const profile = input.entity.objectProfile;
  const observerRefs = profile?.observerRefs ?? {};
  const refs: Array<{ ref: string; side?: BattleSide }> = [
    ...(observerRefs.a ? [{ ref: observerRefs.a, side: "a" as const }] : []),
    ...(observerRefs.b ? [{ ref: observerRefs.b, side: "b" as const }] : []),
  ];
  if (refs.length === 0) refs.push({ ref: `entity:${input.entityId}` });
  return refs.map(({ ref, side }) => {
    const perceivedBy: FreeActionCanonicalRoot["perceivedBy"] = {};
    for (const observer of ["a", "b"] as const) {
      if (side && observer !== side) continue;
      const cached = profile?.observerLabels[observer];
      const perceived = cached ?? observedEntityLabel(
        frameForSide(input.state, observer),
        input.entityId,
      );
      if (perceived) perceivedBy[observer] = perceived;
      else if (sameVisibleArea(input.state, observer, input.entityId)) {
        perceivedBy[observer] = input.canonicalLabel ?? "目に入る物体";
      }
    }
    return {
      ref,
      sourceRef: profile?.sourceRef ?? `semantic:${input.entityId}`,
      rootKind: "object" as const,
      provenance: profile?.provenance ?? input.provenance,
      canonicalLabel: profile?.canonicalLabel ?? input.canonicalLabel,
      description: profile?.description ?? input.description,
      existingEntityId: input.entityId,
      canonicalAccessByActor: {
        a: canonicalDistanceToEntity(input.state, "a", input.entityId),
        b: canonicalDistanceToEntity(input.state, "b", input.entityId),
      },
      perceivedBy,
    };
  });
}

function canonicalDistanceToEntity(
  state: BattleState,
  side: BattleSide,
  entityId: string,
): WorldDistance {
  const world = state.worldState;
  const entity = world?.entities[entityId];
  const actor = world?.entities[actorId(side)];
  if (!world || !entity || !actor || entity.presence !== "present") {
    return "out_of_scene";
  }
  if (entityId === actorId(side)) return "contact";
  const direct = readBattleWorldPair(world, actorId(side), entityId);
  if (direct) return direct.distance;
  if (entity.placement.type === "held") {
    if (entity.placement.holderId === actorId(side)) return "contact";
    return readBattleWorldPair(
      world,
      actorId(side),
      entity.placement.holderId,
    )?.distance ?? "out_of_scene";
  }
  if (entity.placement.type === "worn") {
    if (entity.placement.wearerId === actorId(side)) return "contact";
    return readBattleWorldPair(
      world,
      actorId(side),
      entity.placement.wearerId,
    )?.distance ?? "out_of_scene";
  }
  if (
    entity.placement.type === "scene" &&
    actor.placement.type === "scene"
  ) {
    return entity.placement.areaId === actor.placement.areaId
      ? "near"
      : "separate_area";
  }
  return "out_of_scene";
}

/** Build server-only roots and observer labels without promoting anything. */
export function buildFreeActionCanonicalRoots(input: {
  state: BattleState;
  mine: CharacterSheet;
  opp: CharacterSheet;
}): FreeActionCanonicalRoot[] {
  const roots: FreeActionCanonicalRoot[] = [];
  for (const side of ["a", "b"] as const) {
    const sheet = profileForSide(side, input.mine, input.opp);
    const observerFrame = frameForSide(input.state, side);
    roots.push({
      ref: `actor:${side}:self`,
      sourceRef: `world:character.${side}`,
      rootKind: "character",
      provenance: "semantic_entity",
      canonicalLabel: sheet.displayName,
      description: `${sheet.displayName}本人。`,
      existingEntityId: actorId(side),
      canonicalAccessByActor: {
        a: canonicalDistanceBetweenSides(input.state, "a", side),
        b: canonicalDistanceBetweenSides(input.state, "b", side),
      },
      perceivedBy: { [side]: "自分" },
    });
    if (
      observerFrame &&
      ["coarse", "clear"].includes(observerFrame.counterpart.currentAccess)
    ) {
      roots.push({
        ref: `actor:${side}:counterpart`,
        sourceRef: `world:character.${otherSide(side)}`,
        rootKind: "character",
        provenance: "semantic_entity",
        canonicalLabel: profileForSide(
          otherSide(side),
          input.mine,
          input.opp,
        ).displayName,
        description: "現在対峙している相手本人。",
        existingEntityId: actorId(otherSide(side)),
        canonicalAccessByActor: {
          [side]: canonicalDistanceBetweenSides(
            input.state,
            side,
            otherSide(side),
          ),
        },
        perceivedBy: { [side]: observerFrame.counterpart.perceivedAs },
      });
    }
    const counterpartFrame = frameForSide(input.state, otherSide(side));
    const counterpartCanSee = ["coarse", "clear"].includes(
      counterpartFrame?.counterpart.currentAccess ?? "none",
    );
    roots.push({
      ref: `profile:${side}:appearance`,
      sourceRef: `profile:${side}:appearance`,
      rootKind: "object",
      provenance: "profile_appearance",
      canonicalLabel: null,
      description: sheet.appearance.summary.slice(0, 600),
      canonicalAccessByActor: {
        a: canonicalDistanceBetweenSides(input.state, "a", side),
        b: canonicalDistanceBetweenSides(input.state, "b", side),
      },
      perceivedBy: {
        [side]: "自分が身につけている物",
        ...(counterpartCanSee
          ? { [otherSide(side)]: counterpartFrame!.counterpart.perceivedAs }
          : {}),
      },
    });
    for (const [slot, equipment] of [
      ["weapon", sheet.weapon],
      ["armor", sheet.armor],
    ] as const) {
      if (!equipment) continue;
      const sourceRef = `profile:${side}:${slot}`;
      const promoted = Object.entries(input.state.worldState?.entities ?? {})
        .find(([, entity]) => entity.objectProfile?.sourceRef === sourceRef);
      if (promoted) {
        roots.push(...worldRootRefs({
          state: input.state,
          entityId: promoted[0],
          entity: promoted[1],
          canonicalLabel: equipment.name,
          description: equipment.description,
          provenance: "profile_equipment",
        }));
        continue;
      }
      roots.push({
        ref: sourceRef,
        sourceRef,
        rootKind: "object",
        provenance: "profile_equipment",
        canonicalLabel: equipment.name,
        description: equipment.description.slice(0, 600),
        canonicalAccessByActor: {
          a: canonicalDistanceBetweenSides(input.state, "a", side),
          b: canonicalDistanceBetweenSides(input.state, "b", side),
        },
        perceivedBy: {
          [side]: equipment.name,
          ...(counterpartCanSee
            ? { [otherSide(side)]: equipment.name }
            : {}),
        },
      });
    }
  }
  for (const [entityId, entity] of Object.entries(
    input.state.worldState?.entities ?? {},
  )) {
    if (entity.kind === "character" || !entity.objectState) continue;
    if (entity.objectProfile?.provenance === "profile_equipment") continue;
    const semantic = input.state.semanticState?.entities[entityId];
    roots.push(...worldRootRefs({
      state: input.state,
      entityId,
      entity,
      canonicalLabel: semantic?.label ?? entity.objectProfile?.canonicalLabel ?? null,
      description: semantic?.label ?? entity.objectProfile?.description ?? "場面内の物体",
      provenance: semantic?.facts.source === "battlefield_obstacle"
        ? "battlefield"
        : "semantic_entity",
    }));
  }
  return roots.slice(0, 48);
}

function equipmentEnvelope(
  root: FreeActionCanonicalRoot,
  mine: CharacterSheet,
  opp: CharacterSheet,
): WorldCausalEnvelope {
  const match = /^profile:(a|b):(weapon|armor)$/.exec(root.sourceRef);
  if (!match) return {};
  const sheet = match[1] === "a" ? mine : opp;
  const equipment = match[2] === "weapon" ? sheet.weapon : sheet.armor;
  if (!equipment) return {};
  return {
    ...(equipment.atkBonus > 0
      ? { damage: equipment.atkBonus >= 6 ? "moderate" as const : "minor" as const }
      : {}),
    ...(equipment.defBonus > 0
      ? { defense: equipment.defBonus >= 6 ? "moderate" as const : "minor" as const }
      : {}),
  };
}

function relationForRoot(
  state: BattleState,
  side: BattleSide,
  root: FreeActionCanonicalRoot,
): string {
  const entity = root.existingEntityId
    ? state.worldState?.entities[root.existingEntityId]
    : null;
  if (!entity) return root.sourceRef.startsWith(`profile:${side}:`)
    ? "自分のプロフィール上、身につけている"
    : "現在知覚している場面内";
  if (entity.placement.type === "held") {
    return entity.placement.holderId === actorId(side)
      ? "自分が手に持っている"
      : "別の人物が手に持っている";
  }
  if (entity.placement.type === "worn") {
    return entity.placement.wearerId === actorId(side)
      ? "自分が身につけている"
      : "別の人物が身につけている";
  }
  return entity.placement.type === "scene"
    ? "現在の場面内にある"
    : "現在は直接扱えない";
}

export function buildLatentAffordances(input: {
  state: BattleState;
  mine: CharacterSheet;
  opp: CharacterSheet;
  side: BattleSide;
  roots?: FreeActionCanonicalRoot[];
}): LatentAffordanceProjection[] {
  const roots = input.roots ?? buildFreeActionCanonicalRoots(input);
  return roots.flatMap((root) => {
    const perceivedAs = root.perceivedBy[input.side];
    if (!perceivedAs) return [];
    const entity = root.existingEntityId
      ? input.state.worldState?.entities[root.existingEntityId]
      : null;
    const controlled = entity && (
      (entity.placement.type === "held" &&
        entity.placement.holderId === actorId(input.side)) ||
      (entity.placement.type === "worn" &&
        entity.placement.wearerId === actorId(input.side))
    );
    const envelope = entity?.objectState?.causalEnvelope ??
      equipmentEnvelope(root, input.mine, input.opp);
    const isObject = (root.rootKind ?? "object") === "object";
    const speculative = isObject && Object.keys(envelope).length === 0 &&
      ["battlefield", "semantic_entity"].includes(root.provenance)
      ? { damage: "minor" as const, defense: "minor" as const }
      : isObject
        ? envelope
        : { control: "minor" as const };
    return [{
      ref: root.ref,
      perceivedAs,
      relation: relationForRoot(input.state, input.side, root),
      certainty: root.provenance === "profile_appearance"
        ? "coarse" as const
        : "clear" as const,
      possiblePreparations: !isObject
        ? [{ description: `${perceivedAs}へ直接働きかける`, setupTurns: 0 }]
        : controlled
        ? [{ description: `${perceivedAs}を使えるよう構える`, setupTurns: 0 }]
        : [{ description: `${perceivedAs}へ働きかけ、使える状態を試みる`, setupTurns: 1 }],
      possibleUses: [{
        description: Object.keys(speculative).length > 0
          ? `${perceivedAs}を攻撃または防御の補助に使える可能性がある`
          : `${perceivedAs}を場面操作に使える可能性がある`,
        compatibleActionKinds: isObject
          ? [
              "free_action" as const,
              ...(speculative.damage ? ["basic_attack" as const, "skill" as const] : []),
              ...(speculative.defense ? ["defend" as const] : []),
            ]
          : ["free_action" as const],
        expectedCausalPotential: speculative,
      }],
    }];
  }).slice(0, 16);
}

export function buildOpportunityChains(
  affordances: LatentAffordanceProjection[],
): OpportunityChain[] {
  return affordances.flatMap((affordance) => {
    const potential = affordance.possibleUses[0]?.expectedCausalPotential ?? {};
    const setupTurns = affordance.possiblePreparations[0]?.setupTurns ?? 1;
    const prerequisite = setupTurns > 0
      ? [{
          kind: "free_action" as const,
          description: affordance.possiblePreparations[0]?.description ??
            `${affordance.perceivedAs}を準備する`,
          subjectRef: affordance.ref,
        }]
      : [];
    return [
      ...(potential.damage
        ? [{
            id: `opportunity:${affordance.ref}:attack`,
            objectiveHint: "素の攻撃を補う",
            prerequisites: prerequisite,
            continuation: {
              actionKind: "basic_attack" as const,
              instrumentRef: affordance.ref,
              description: `${affordance.perceivedAs}を通常攻撃の補助に使う`,
            },
            setupTurns,
            expectedProgress: "通常攻撃の効果を定性的に補う可能性がある",
            expectedCausalPotential: potential,
            risks: setupTurns > 0 ? ["準備中は直接攻撃できない"] : [],
          }]
        : []),
      ...(potential.defense
        ? [{
            id: `opportunity:${affordance.ref}:defend`,
            objectiveHint: "次の被影響を抑える",
            prerequisites: prerequisite,
            continuation: {
              actionKind: "defend" as const,
              instrumentRef: affordance.ref,
              description: `${affordance.perceivedAs}を防御の補助に使う`,
            },
            setupTurns,
            expectedProgress: "防御時の被影響を定性的に抑える可能性がある",
            expectedCausalPotential: potential,
            risks: setupTurns > 0 ? ["準備に一手を使う"] : [],
          }]
        : []),
    ];
  }).slice(0, 12);
}

function needBandFromReserve(value: string | undefined): TacticalNeedFrame["survivalPressure"] {
  if (value === "empty") return "critical";
  if (value === "critical") return "critical";
  if (value === "low") return "high";
  if (value === "taxed") return "moderate";
  if (value === "ready") return "low";
  return "none";
}

export function buildTacticalNeedFrame(input: {
  frame: CharacterPerceptionFrame;
  turnsRemaining: number;
}): TacticalNeedFrame {
  const hp = input.frame.reserveCues.find((cue) =>
    cue.subject.kind === "self" && cue.parameterKey === "hp"
  );
  const survivalPressure = needBandFromReserve(hp?.relativeBand);
  const recentSelfLoss = [...input.frame.qualitativeChanges].reverse().find((change) =>
    change.targetKnowledge === "self" &&
    change.parameterKey === "hp" &&
    change.direction === "loss"
  );
  const recentOwnOffense = [...input.frame.qualitativeChanges].reverse().find((change) =>
    change.sourceKnowledge === "self" &&
    change.targetKnowledge === "identified" &&
    change.parameterKey === "hp"
  );
  const resourcePressure = input.frame.reserveCues
    .filter((cue) =>
      cue.subject.kind === "self" &&
      ["mp", "stamina", "focus"].includes(cue.parameterKey)
    )
    .reduce<TacticalNeedFrame["resourcePressure"]>((current, cue) => {
      const candidate = needBandFromReserve(cue.relativeBand);
      const rank = ["none", "low", "moderate", "high", "critical"];
      return rank.indexOf(candidate) > rank.indexOf(current) ? candidate : current;
    }, "none");
  const evidenceRefs = [
    ...(hp ? [`reserve:${hp.parameterKey}:${hp.relativeBand}`] : []),
    ...(recentSelfLoss
      ? [`received:${recentSelfLoss.absoluteBand}:${recentSelfLoss.outcome}`]
      : []),
    ...(recentOwnOffense
      ? [`offense:${recentOwnOffense.absoluteBand}:${recentOwnOffense.outcome}`]
      : []),
  ];
  return {
    survivalPressure,
    unprotectedIncomingRisk: recentSelfLoss
      ? recentSelfLoss.absoluteBand === "extreme"
        ? "critical"
        : recentSelfLoss.absoluteBand === "heavy"
          ? "high"
          : recentSelfLoss.absoluteBand === "solid"
            ? "moderate"
            : "low"
      : "unknown",
    offenseAdequacy: !recentOwnOffense
      ? "unknown"
      : ["none", "immune"].includes(recentOwnOffense.outcome) ||
          ["none", "trace", "light"].includes(recentOwnOffense.absoluteBand)
        ? "insufficient"
        : recentOwnOffense.absoluteBand === "solid"
          ? "marginal"
          : "adequate",
    defenseAdequacy: survivalPressure === "critical" || survivalPressure === "high"
      ? "insufficient"
      : recentSelfLoss
        ? "marginal"
        : "unknown",
    controlNeed: "low",
    resourcePressure,
    timePressure: input.turnsRemaining <= 1
      ? "critical"
      : input.turnsRemaining <= 3
        ? "high"
        : input.turnsRemaining <= 6
          ? "moderate"
          : "low",
    evidenceRefs,
  };
}

export function decisionProfileForSheet(sheet: CharacterSheet): DecisionProfile {
  return sheet.decisionProfile ?? {
    defaultObjective: {
      id: "victory",
      statement: "この対戦に勝つ",
      priority: 70,
    },
    principles: sheet.traits.slice(0, 6).map((trait, index) => ({
      id: `trait.${index + 1}`,
      statement: trait,
      priority: 55,
      force: "preference" as const,
    })),
  };
}

function capabilityEvidence(sheet: CharacterSheet): string[] {
  return [
    ...sheet.traits,
    sheet.basicAttack
      ? `${sheet.basicAttack.name}: ${sheet.basicAttack.description}`
      : null,
    ...sheet.skills.map((skill) => `${skill.name}: ${skill.description}`),
    sheet.weapon
      ? `${sheet.weapon.name}: ${sheet.weapon.description}`
      : null,
    sheet.armor
      ? `${sheet.armor.name}: ${sheet.armor.description}`
      : null,
  ].filter((value): value is string => Boolean(value)).slice(0, 16);
}

export async function prepareFreeActionsForTurn(input: {
  llm: LlmProvider;
  state: BattleState;
  mine: CharacterSheet;
  opp: CharacterSheet;
}): Promise<FreeActionTurnPreparation> {
  const roots = buildFreeActionCanonicalRoots(input);
  const affordances = {
    a: buildLatentAffordances({ ...input, side: "a", roots }),
    b: buildLatentAffordances({ ...input, side: "b", roots }),
  };
  const intents = ([
    ["a", input.state.plannedActionA],
    ["b", input.state.plannedActionB],
  ] as const).flatMap(([actorSide, intent]) =>
    intent?.kind === "free_action"
      ? [{ actorSide, intent, perceivedAffordances: affordances[actorSide] }]
      : []
  );
  if (intents.length === 0) return { roots, affordances, adjudication: null };
  try {
    const result = await input.llm.adjudicateFreeActions({
      turn: input.state.turn + 1,
      scene: input.state.situation.scene,
      actors: {
        a: {
          displayName: input.mine.displayName,
          capabilityEvidence: capabilityEvidence(input.mine),
        },
        b: {
          displayName: input.opp.displayName,
          capabilityEvidence: capabilityEvidence(input.opp),
        },
      },
      intents,
      canonicalRoots: roots,
    });
    const parsed = FreeActionAdjudicationBatchSchema.safeParse(result);
    return {
      roots,
      affordances,
      adjudication: parsed.success ? parsed.data : null,
    };
  } catch (error) {
    console.warn(
      "[battle] free-action adjudication unavailable",
      error instanceof Error ? error.message : error,
    );
    return { roots, affordances, adjudication: null };
  }
}

function initialPlacement(
  state: BattleState,
  side: BattleSide,
  root: FreeActionCanonicalRoot,
  candidateKey: string,
) {
  if (root.sourceRef === `profile:${side}:weapon`) {
    return { type: "held" as const, holderId: actorId(side) };
  }
  if (root.sourceRef.startsWith("profile:")) {
    const owner = root.sourceRef.split(":")[1] as BattleSide;
    return {
      type: "worn" as const,
      wearerId: actorId(owner),
      slot: candidateKey.slice(0, 80),
    };
  }
  const actor = state.worldState?.entities[actorId(side)];
  return actor?.placement.type === "scene"
    ? { type: "scene" as const, areaId: actor.placement.areaId }
    : { type: "absent" as const };
}

function promotedEntity(input: {
  state: BattleState;
  side: BattleSide;
  proposal: FreeActionAdjudicationProposal;
  root: FreeActionCanonicalRoot;
  observerLabel: string;
}): Omit<BattleWorldEntity, "createdTurn" | "updatedTurn"> | null {
  const subject = input.proposal.subject;
  if (!subject) return null;
  const placement = initialPlacement(
    input.state,
    input.side,
    input.root,
    subject.candidateKey,
  );
  return BattleWorldEntitySchema.omit({
    createdTurn: true,
    updatedTurn: true,
  }).parse({
    kind: "object",
    active: true,
    presence: placement.type === "absent" ? "absent" : "present",
    placement,
    exposure: "exposed",
    actorState: null,
    objectState: {
      portable: subject.portable,
      usable: subject.usable,
      exclusiveUse: true,
      usableBy: [],
      cover: "none",
      blocksMovement: false,
      visionEffect: "none",
      hearingEffect: "none",
      mobilityEffect: "none",
      causalEnvelope: subject.causalEnvelope,
    },
    objectProfile: {
      canonicalLabel: subject.canonicalLabel,
      description: subject.description,
      sourceRef: input.root.sourceRef,
      candidateKey: subject.candidateKey,
      provenance: input.root.provenance,
      knownOpenAspects: subject.knownOpenAspects,
      observerRefs: { [input.side]: input.root.ref },
      observerLabels: { [input.side]: input.observerLabel },
      concretizations: [],
    },
  });
}

function translateChange(input: {
  state: BattleState;
  side: BattleSide;
  subjectEntityId: string;
  change: FreeActionAdjudicationProposal["changes"][number];
}): BattleWorldOperation | null {
  const targetId = input.change.target === "subject"
    ? input.subjectEntityId
    : input.change.target === "actor"
      ? actorId(input.side)
      : actorId(otherSide(input.side));
  if (input.change.path === "/placement" && input.change.target === "subject") {
    const placement = WorldPlacementSchema.safeParse(input.change.value);
    if (!placement.success) return null;
    if (
      placement.data.type === "held" &&
      placement.data.holderId !== actorId(input.side)
    ) return null;
    if (
      placement.data.type === "worn" &&
      placement.data.wearerId !== actorId(input.side)
    ) return null;
    if (
      placement.data.type === "scene" &&
      !input.state.worldState?.areas[placement.data.areaId]
    ) return null;
    return { op: "set_placement", entityId: targetId, placement: placement.data };
  }
  if (input.change.path === "/exposure") {
    const exposure = WorldExposureSchema.safeParse(input.change.value);
    return exposure.success
      ? { op: "set_exposure", entityId: targetId, exposure: exposure.data }
      : null;
  }
  if (
    input.change.path === "/actorState/restraint" &&
    input.state.worldState?.entities[targetId]?.actorState
  ) {
    const restraint = input.change.value;
    if (![
      "free",
      "partially_restrained",
      "restrained",
    ].includes(String(restraint))) return null;
    const current = input.state.worldState?.entities[targetId]?.actorState?.restraint;
    if (current === "free" && restraint === "restrained") return null;
    return {
      op: "set_actor_state",
      entityId: targetId,
      changes: { restraint: restraint as "free" | "partially_restrained" | "restrained" },
    };
  }
  if (
    input.change.path === "/actorState/posture" &&
    input.state.worldState?.entities[targetId]?.actorState
  ) {
    const posture = input.change.value;
    if (![
      "standing",
      "crouched",
      "prone",
      "airborne",
      "other",
    ].includes(String(posture))) return null;
    return {
      op: "set_actor_state",
      entityId: targetId,
      changes: { posture: posture as "standing" | "crouched" | "prone" | "airborne" | "other" },
    };
  }
  if (
    input.change.path === "/objectState/cover" &&
    input.change.target === "subject" &&
    ["none", "partial", "full"].includes(String(input.change.value))
  ) {
    return {
      op: "set_object_state",
      entityId: targetId,
      changes: { cover: input.change.value as "none" | "partial" | "full" },
    };
  }
  return null;
}

function updateActionFailure(
  actions: ResolvedBattleAction[],
  side: BattleSide,
  reason: "free_action_unavailable" | "free_action_impossible" |
    "free_action_contested" | "free_action_rejected",
): void {
  const action = actions.find((candidate) => candidate.actorSide === side);
  if (!action || action.kind !== "free_action") return;
  action.resolution = {
    requested: action.resolution?.requested ?? {
      kind: "free_action",
      description: action.description ?? "自由な試み",
      ...(action.desiredOutcome ? { desiredOutcome: action.desiredOutcome } : {}),
      ...(action.subjectRefs ? { subjectRefs: action.subjectRefs } : {}),
      ...(action.opportunityId ? { opportunityId: action.opportunityId } : {}),
    },
    outcome: "failed",
    reason,
  };
}

function receipt(input: FreeActionResolutionReceipt): FreeActionResolutionReceipt {
  return FreeActionResolutionReceiptSchema.parse(input);
}

export function commitFreeActionAdjudications(input: {
  beforeState: BattleState;
  resolvedState: BattleState;
  actions: ResolvedBattleAction[];
  events: TurnEvent[];
  preparation: FreeActionTurnPreparation;
}): {
  state: BattleState;
  actions: ResolvedBattleAction[];
  events: TurnEvent[];
} {
  let state = structuredClone(input.resolvedState);
  const actions = structuredClone(input.actions);
  const events = structuredClone(input.events);
  const receipts: FreeActionResolutionReceipt[] = [];
  const proposals = new Map<BattleSide, FreeActionAdjudicationProposal>();
  for (const raw of input.preparation.adjudication?.proposals ?? []) {
    const parsed = FreeActionAdjudicationProposalSchema.safeParse(raw);
    if (parsed.success && !proposals.has(parsed.data.actorSide)) {
      proposals.set(parsed.data.actorSide, parsed.data);
    }
  }
  const actionBySide = new Map(
    actions.filter((action) => action.kind === "free_action")
      .map((action) => [action.actorSide, action] as const),
  );
  const simultaneous = state.latestTemporalResolution?.buckets
    .filter((bucket) => bucket.simultaneous)
    .some((bucket) => {
      const roots = bucket.actorSides.flatMap((side) => {
        const action = actionBySide.get(side);
        const proposal = proposals.get(side);
        return action?.executed && proposal?.subject
          ? [proposal.subject.rootRef]
          : [];
      });
      return new Set(roots).size < roots.length;
    }) ?? false;
  const order = state.latestTemporalResolution?.buckets
    .flatMap((bucket) => bucket.actorSides) ?? ["a", "b"];
  for (const side of order) {
    const action = actionBySide.get(side);
    if (!action || !action.executed) continue;
    const intentText = action.description ?? "自由な試み";
    const proposal = proposals.get(side);
    if (!proposal) {
      updateActionFailure(actions, side, "free_action_unavailable");
      receipts.push(receipt({
        actionId: action.id,
        actorSide: side,
        intentText,
        outcome: "failed",
        reason: "adjudication_unavailable",
        subjectRef: null,
        canonicalEntityId: null,
        promotion: "rejected",
        operationKinds: [],
        summary: "自由行動の現実判定を確定できなかった。",
      }));
      continue;
    }
    const root = proposal.subject
      ? input.preparation.roots.find((candidate) =>
          candidate.ref === proposal.subject!.rootRef
        )
      : null;
    if (proposal.subject && !root) {
      updateActionFailure(actions, side, "free_action_rejected");
      receipts.push(receipt({
        actionId: action.id,
        actorSide: side,
        intentText,
        outcome: "failed",
        reason: "missing_canonical_root",
        subjectRef: proposal.subject.rootRef,
        canonicalEntityId: null,
        promotion: "rejected",
        operationKinds: [],
        summary: proposal.failureSummary,
      }));
      continue;
    }
    if (
      root?.canonicalLabel &&
      proposal.subject?.canonicalLabel !== root.canonicalLabel
    ) {
      updateActionFailure(actions, side, "free_action_rejected");
      receipts.push(receipt({
        actionId: action.id,
        actorSide: side,
        intentText,
        outcome: "failed",
        reason: "invalid_proposal",
        subjectRef: root.ref,
        canonicalEntityId: root.existingEntityId ?? null,
        promotion: "rejected",
        operationKinds: [],
        summary: proposal.failureSummary,
      }));
      continue;
    }
    if (simultaneous && proposal.subject) {
      const competing = [...proposals.entries()].some(([other, candidate]) =>
        other !== side &&
        actionBySide.get(other)?.executed &&
        candidate.subject?.rootRef === proposal.subject?.rootRef
      );
      if (competing) {
        updateActionFailure(actions, side, "free_action_contested");
        receipts.push(receipt({
          actionId: action.id,
          actorSide: side,
          intentText,
          outcome: "contested",
          reason: "contested",
          subjectRef: proposal.subject.rootRef,
          canonicalEntityId: root?.existingEntityId ?? null,
          promotion: root?.existingEntityId ? "not_needed" : "rejected",
          operationKinds: [],
          summary: "同時に同じ対象へ働きかけたため、排他的な操作は成立しなかった。",
        }));
        continue;
      }
    }
    if (!root || !proposal.subject) {
      updateActionFailure(actions, side, "free_action_impossible");
      receipts.push(receipt({
        actionId: action.id,
        actorSide: side,
        intentText,
        outcome: "failed",
        reason: "impossible",
        subjectRef: null,
        canonicalEntityId: null,
        promotion: "rejected",
        operationKinds: [],
        summary: proposal.failureSummary,
      }));
      continue;
    }
    const existingPromotion = Object.entries(state.worldState?.entities ?? {})
      .find(([, entity]) =>
        entity.objectProfile?.sourceRef === root.sourceRef &&
        entity.objectProfile.candidateKey === proposal.subject?.candidateKey
      );
    const subjectEntityId = root.existingEntityId ?? existingPromotion?.[0] ??
      `object.free.${side}.${simpleHash(`${root.sourceRef}:${proposal.subject.candidateKey}`)}`;
    const operations: BattleWorldOperation[] = [];
    let promotion: FreeActionResolutionReceipt["promotion"] = "not_needed";
    const rootKind = root.rootKind ?? "object";
    if (!root.existingEntityId && rootKind !== "object") {
      updateActionFailure(actions, side, "free_action_rejected");
      receipts.push(receipt({
        actionId: action.id,
        actorSide: side,
        intentText,
        outcome: "failed",
        reason: "invalid_proposal",
        subjectRef: root.ref,
        canonicalEntityId: null,
        promotion: "rejected",
        operationKinds: [],
        summary: proposal.failureSummary,
      }));
      continue;
    }
    if (!root.existingEntityId && !existingPromotion) {
      const perceived = input.preparation.affordances[side].find((candidate) =>
        candidate.ref === root.ref
      )?.perceivedAs ?? "対象";
      const entity = promotedEntity({
        state,
        side,
        proposal,
        root,
        observerLabel: perceived,
      });
      if (!entity) {
        updateActionFailure(actions, side, "free_action_rejected");
        continue;
      }
      operations.push({ op: "add_entity", entityId: subjectEntityId, entity });
      promotion = "promoted";
    } else if (!root.existingEntityId && existingPromotion) {
      promotion = "already_promoted";
    }
    const currentProfile = rootKind === "object"
      ? state.worldState?.entities[subjectEntityId]?.objectProfile
      : null;
    if (
      currentProfile &&
      !currentProfile.canonicalLabel &&
      proposal.subject.canonicalLabel
    ) {
      operations.push({
        op: "concretize_object",
        entityId: subjectEntityId,
        canonicalLabel: proposal.subject.canonicalLabel,
        statement: proposal.subject.description,
        resolvedAspects: ["identity"],
        remainingOpenAspects: proposal.subject.knownOpenAspects.filter((item) =>
          item !== "identity"
        ),
        evidenceRefs: [root.sourceRef],
      });
    }
    if (rootKind === "object") {
      operations.push({
        op: "set_object_state",
        entityId: subjectEntityId,
        changes: {
          portable: proposal.subject.portable,
          usable: proposal.subject.usable,
          causalEnvelope: proposal.subject.causalEnvelope,
        },
      });
    }
    if (proposal.outcome === "possible") {
      const translated = proposal.changes.map((change) =>
        translateChange({ state, side, subjectEntityId, change })
      );
      if (translated.some((operation) => operation === null)) {
        updateActionFailure(actions, side, "free_action_rejected");
        receipts.push(receipt({
          actionId: action.id,
          actorSide: side,
          intentText,
          outcome: "failed",
          reason: "invalid_proposal",
          subjectRef: root.ref,
          canonicalEntityId: root.existingEntityId ?? null,
          promotion: "rejected",
          operationKinds: [],
          summary: proposal.failureSummary,
        }));
        continue;
      }
      operations.push(...translated.filter((operation): operation is BattleWorldOperation =>
        operation !== null
      ));
    }
    const sourceEventIds = events.flatMap((event) =>
      event.sourceActionId === action.id && event.id ? [event.id] : []
    );
    const beforeRevision = state.worldState?.revision ?? 0;
    const applied = state.worldState
      ? applyBattleWorldTransition({
          state: state.worldState,
          transition: {
            baseRevision: state.worldState.revision,
            turn: state.turn,
            sourceEventIds,
            operations,
          },
          turn: state.turn,
          allowedSourceEventIds: new Set(events.flatMap((event) =>
            event.id ? [event.id] : []
          )),
        })
      : null;
    if (!applied?.ok) {
      updateActionFailure(actions, side, "free_action_rejected");
      receipts.push(receipt({
        actionId: action.id,
        actorSide: side,
        intentText,
        outcome: "failed",
        reason: "operation_rejected",
        subjectRef: root.ref,
        canonicalEntityId: root.existingEntityId ?? null,
        promotion: "rejected",
        operationKinds: [],
        summary: proposal.failureSummary,
      }));
      continue;
    }
    state = {
      ...state,
      worldState: applied.state,
      latestWorldTransition: {
        turn: state.turn,
        status: applied.changed ? "applied" : "skipped",
        fromRevision: beforeRevision,
        toRevision: applied.state.revision,
        transition: applied.changed
          ? {
              baseRevision: beforeRevision,
              turn: state.turn,
              sourceEventIds,
              operations,
            }
          : null,
      },
    };
    const succeeded = proposal.outcome === "possible";
    if (!succeeded) updateActionFailure(actions, side, "free_action_impossible");
    const summary = succeeded ? proposal.successSummary : proposal.failureSummary;
    events.push({
      id: `turn-${state.turn}-free-action-${side}`,
      type: "free_action",
      actorName: side === "a" ? state.sideA.displayName : state.sideB.displayName,
      actorSide: side,
      targetSides: [side],
      sourceActionId: action.id,
      summary,
    });
    receipts.push(receipt({
      actionId: action.id,
      actorSide: side,
      intentText,
      outcome: succeeded ? "accepted" : "failed",
      reason: succeeded ? "accepted" : "impossible",
      subjectRef: root.ref,
      canonicalEntityId: subjectEntityId,
      promotion,
      operationKinds: operations.map((operation) => operation.op),
      summary,
    }));
  }
  for (const resolvedReceipt of receipts) {
    const side = resolvedReceipt.actorSide;
    const finalEventId = `turn-${state.turn}-free-action-${side}`;
    const proposal = proposals.get(side);
    const root = proposal?.subject
      ? input.preparation.roots.find((candidate) =>
          candidate.ref === proposal.subject!.rootRef
        )
      : null;
    const affectsCounterpart = proposal?.changes.some((change) =>
      change.target === "counterpart"
    ) || root?.existingEntityId === actorId(otherSide(side));
    const finalEvent: TurnEvent = {
      id: finalEventId,
      type: "free_action",
      actorName: side === "a"
        ? state.sideA.displayName
        : state.sideB.displayName,
      actorSide: side,
      targetSides: affectsCounterpart ? [side, otherSide(side)] : [side],
      sourceActionId: resolvedReceipt.actionId,
      summary: resolvedReceipt.summary,
    };
    const existingIndex = events.findIndex((event) => event.id === finalEventId);
    if (existingIndex >= 0) events[existingIndex] = finalEvent;
    else events.push(finalEvent);
  }
  state.latestFreeActionReceipts = receipts;
  return { state, actions, events };
}
