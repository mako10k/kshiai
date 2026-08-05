import {
  clampCoefficient,
  type Situation,
} from "./battle.js";
import {
  type BattleWorldState,
  type WorldActorState,
  type WorldObjectState,
} from "./battle-world.js";

export type BattleCausalSource = {
  kind: "area" | "entity";
  sourceId: string;
  channels: Array<
    "cover" | "hearing" | "mobility" | "space" | "vision"
  >;
};

export type BattleActorCausalContext = {
  actorSide: "a" | "b";
  actorEntityId: "character.a" | "character.b";
  effectiveActorState: WorldActorState | null;
  cover: WorldObjectState["cover"];
  damageDealtMultiplier: number;
  damageReceivedMultiplier: number;
  healingMultiplier: number;
  speedMultiplier: number;
  /** Server-only causal receipt. Projection code must not copy these IDs. */
  sources: BattleCausalSource[];
};

const COVER_RANK: Record<WorldObjectState["cover"], number> = {
  none: 0,
  partial: 1,
  full: 2,
};

const SENSORY_RANK = {
  none: 0,
  impair: 1,
  block: 2,
} as const;

const MOBILITY_EFFECT_RANK = {
  none: 0,
  hinder: 1,
  immobilize: 2,
} as const;

const ACTOR_MOBILITY_RANK: Record<WorldActorState["mobility"], number> = {
  mobile: 0,
  hindered: 1,
  immobilized: 2,
};

const ACTOR_SENSE_RANK: Record<WorldActorState["vision"], number> = {
  normal: 0,
  impaired: 1,
  blocked: 2,
  absent: 3,
};

function actorEntityId(side: "a" | "b"): "character.a" | "character.b" {
  return `character.${side}`;
}

function strongestCover(
  current: WorldObjectState["cover"],
  candidate: WorldObjectState["cover"],
): WorldObjectState["cover"] {
  return COVER_RANK[candidate] > COVER_RANK[current] ? candidate : current;
}

function strongestActorSense(
  current: WorldActorState["vision"],
  candidate: WorldActorState["vision"],
): WorldActorState["vision"] {
  return ACTOR_SENSE_RANK[candidate] > ACTOR_SENSE_RANK[current]
    ? candidate
    : current;
}

function strongestActorMobility(
  current: WorldActorState["mobility"],
  candidate: WorldActorState["mobility"],
): WorldActorState["mobility"] {
  return ACTOR_MOBILITY_RANK[candidate] > ACTOR_MOBILITY_RANK[current]
    ? candidate
    : current;
}

function sensoryActorValue(
  effect: WorldObjectState["visionEffect"],
): WorldActorState["vision"] {
  if (effect === "block") return "blocked";
  if (effect === "impair") return "impaired";
  return "normal";
}

function mobilityActorValue(
  effect: WorldObjectState["mobilityEffect"],
): WorldActorState["mobility"] {
  if (effect === "immobilize") return "immobilized";
  if (effect === "hinder") return "hindered";
  return "mobile";
}

function directTargetId(
  placement: BattleWorldState["entities"][string]["placement"],
): string | null {
  if (placement.type === "held") return placement.holderId;
  if (placement.type === "worn") return placement.wearerId;
  if (placement.type === "attached") return placement.anchorId;
  return null;
}

function multiplierForActorState(state: WorldActorState): number {
  let multiplier = 1;
  if (state.consciousness === "dazed") multiplier *= 0.85;
  if (state.consciousness === "unconscious") multiplier *= 0.5;
  if (state.consciousness === "incapacitated") multiplier *= 0.25;
  if (state.mobility === "hindered") multiplier *= 0.9;
  if (state.mobility === "immobilized") multiplier *= 0.75;
  if (state.restraint === "partially_restrained") multiplier *= 0.9;
  if (state.restraint === "restrained") multiplier *= 0.75;
  if (state.posture === "prone") multiplier *= 0.9;
  if (state.vision === "impaired") multiplier *= 0.95;
  if (state.vision === "blocked" || state.vision === "absent") {
    multiplier *= 0.85;
  }
  if (state.mentalClarity === "confused") multiplier *= 0.9;
  if (state.mentalClarity === "delirious") multiplier *= 0.75;
  if (state.agency === "compelled") multiplier *= 0.9;
  if (state.agency === "uncontrolled") multiplier *= 0.75;
  return Math.max(0.25, multiplier);
}

function speedMultiplierForActorState(state: WorldActorState): number {
  let multiplier = 1;
  if (state.consciousness === "dazed") multiplier *= 0.8;
  if (state.mobility === "hindered") multiplier *= 0.75;
  if (state.mobility === "immobilized") multiplier *= 0.25;
  if (state.restraint === "partially_restrained") multiplier *= 0.8;
  if (state.restraint === "restrained") multiplier *= 0.4;
  if (state.posture === "prone") multiplier *= 0.75;
  if (state.mentalClarity === "confused") multiplier *= 0.9;
  if (state.mentalClarity === "delirious") multiplier *= 0.7;
  return Math.max(0.25, multiplier);
}

function appendSource(
  sources: BattleCausalSource[],
  source: BattleCausalSource,
): void {
  const current = sources.find((item) =>
    item.kind === source.kind && item.sourceId === source.sourceId
  );
  if (!current) {
    sources.push(source);
    return;
  }
  current.channels = [...new Set([...current.channels, ...source.channels])]
    .sort();
}

/**
 * Derives the mechanically effective actor state from canonical structured data.
 * No semantic fact strings, narrator text, or observer beliefs are interpreted.
 */
export function deriveBattleActorCausality(input: {
  worldState?: BattleWorldState;
  actorSide: "a" | "b";
}): BattleActorCausalContext {
  const id = actorEntityId(input.actorSide);
  const actor = input.worldState?.entities[id];
  if (!input.worldState || !actor?.actorState) {
    return {
      actorSide: input.actorSide,
      actorEntityId: id,
      effectiveActorState: actor?.actorState ?? null,
      cover: "none",
      damageDealtMultiplier: 1,
      damageReceivedMultiplier: 1,
      healingMultiplier: 1,
      speedMultiplier: 1,
      sources: [],
    };
  }

  const effective: WorldActorState = structuredClone(actor.actorState);
  const sources: BattleCausalSource[] = [];
  let cover: WorldObjectState["cover"] = "none";
  let spaceMultiplier = 1;
  const actorAreaId = actor.placement.type === "scene"
    ? actor.placement.areaId
    : null;
  const area = actorAreaId ? input.worldState.areas[actorAreaId] : null;
  if (area) {
    const channels: BattleCausalSource["channels"] = [];
    if (area.illumination === "dim" || area.illumination === "dark") {
      effective.vision = strongestActorSense(effective.vision, "impaired");
      channels.push("vision");
    }
    if (area.noise === "loud") {
      effective.hearing = strongestActorSense(effective.hearing, "impaired");
      channels.push("hearing");
    } else if (area.noise === "overwhelming") {
      effective.hearing = strongestActorSense(effective.hearing, "blocked");
      channels.push("hearing");
    }
    if (area.movement === "restricted") {
      effective.mobility = strongestActorMobility(effective.mobility, "hindered");
      channels.push("mobility");
    } else if (area.movement === "blocked") {
      effective.mobility = strongestActorMobility(
        effective.mobility,
        "immobilized",
      );
      channels.push("mobility");
    }
    if (area.space === "confined") {
      spaceMultiplier = 0.95;
      channels.push("space");
    } else if (area.space === "crowded") {
      spaceMultiplier = 0.9;
      channels.push("space");
    }
    if (channels.length > 0) {
      appendSource(sources, { kind: "area", sourceId: actorAreaId!, channels });
    }
  }

  for (const [entityId, entity] of Object.entries(input.worldState.entities)) {
    if (
      entityId === id ||
      !entity.active ||
      entity.presence !== "present" ||
      !entity.objectState
    ) {
      continue;
    }
    const direct = directTargetId(entity.placement) === id;
    const areaWide = actorAreaId !== null &&
      entity.placement.type === "scene" &&
      entity.placement.areaId === actorAreaId &&
      (entity.kind === "terrain" || entity.kind === "effect");
    if (!direct && !areaWide) continue;

    const channels: BattleCausalSource["channels"] = [];
    const objectState = entity.objectState;
    if (direct && COVER_RANK[objectState.cover] > COVER_RANK[cover]) {
      cover = strongestCover(cover, objectState.cover);
      channels.push("cover");
    }
    if (SENSORY_RANK[objectState.visionEffect] > 0) {
      effective.vision = strongestActorSense(
        effective.vision,
        sensoryActorValue(objectState.visionEffect),
      );
      channels.push("vision");
    }
    if (SENSORY_RANK[objectState.hearingEffect] > 0) {
      effective.hearing = strongestActorSense(
        effective.hearing,
        sensoryActorValue(objectState.hearingEffect),
      );
      channels.push("hearing");
    }
    if (MOBILITY_EFFECT_RANK[objectState.mobilityEffect] > 0) {
      effective.mobility = strongestActorMobility(
        effective.mobility,
        mobilityActorValue(objectState.mobilityEffect),
      );
      channels.push("mobility");
    }
    if (objectState.blocksMovement) {
      effective.mobility = strongestActorMobility(
        effective.mobility,
        "immobilized",
      );
      channels.push("mobility");
    }
    if (channels.length > 0) {
      appendSource(sources, { kind: "entity", sourceId: entityId, channels });
    }
  }

  const effectiveness = multiplierForActorState(effective) * spaceMultiplier;
  const damageReceivedMultiplier = cover === "full"
    ? 0.5
    : cover === "partial"
      ? 0.75
      : 1;
  const healingMultiplier = effective.mentalClarity === "delirious"
    ? 0.8
    : effective.consciousness === "dazed"
      ? 0.9
      : 1;
  return {
    actorSide: input.actorSide,
    actorEntityId: id,
    effectiveActorState: effective,
    cover,
    damageDealtMultiplier: Math.max(0.25, effectiveness),
    damageReceivedMultiplier,
    healingMultiplier,
    speedMultiplier: speedMultiplierForActorState(effective) * spaceMultiplier,
    sources: sources.sort((a, b) =>
      a.kind.localeCompare(b.kind) || a.sourceId.localeCompare(b.sourceId)
    ),
  };
}

/** Applies server-owned causal coefficients for one actor-target resolution. */
export function applyBattleCausalCoefficients(input: {
  situation: Situation;
  worldState?: BattleWorldState;
  actorSide: "a" | "b";
  targetSide: "a" | "b";
}): Situation {
  if (!input.worldState) return input.situation;
  const actor = deriveBattleActorCausality({
    worldState: input.worldState,
    actorSide: input.actorSide,
  });
  const target = deriveBattleActorCausality({
    worldState: input.worldState,
    actorSide: input.targetSide,
  });
  const baseDamage = input.situation.coefficients.damage ?? 1;
  const baseHeal = input.situation.coefficients.heal ?? 1;
  const baseSpeed = input.situation.coefficients.spd ?? 1;
  return {
    ...input.situation,
    coefficients: {
      ...input.situation.coefficients,
      damage: clampCoefficient(
        baseDamage *
          actor.damageDealtMultiplier *
          target.damageReceivedMultiplier,
      ),
      heal: clampCoefficient(baseHeal * actor.healingMultiplier),
      spd: clampCoefficient(baseSpeed * actor.speedMultiplier),
    },
  };
}
