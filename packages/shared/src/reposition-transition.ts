import type { ActionReach } from "./character.js";
import type { ActionFeasibilityConstraints } from "./character.js";
import type { CharacterActionIntent, TurnEvent } from "./battle.js";
import {
  readBattleWorldPair,
  type BattleWorldOperation,
  type BattleWorldPairView,
  type BattleWorldState,
  type WorldDistance,
} from "./battle-world.js";

const IN_AREA_RANK: Record<"contact" | "near" | "medium" | "far", number> = {
  contact: 0,
  near: 1,
  medium: 2,
  far: 3,
};

const RANK_TO_DISTANCE = ["contact", "near", "medium", "far"] as const;

export type SpacingRelation =
  | "in_band"
  | "too_close"
  | "too_far"
  | "unlocalized"
  | "unavailable";

export type SpacingCorrection = "none" | "close" | "open" | "localize";

export type SpacingPacket = {
  perceivedDistance: "contact" | "near" | "mid" | "far" | "unknown";
  lastRequired?: { min?: ActionReach; max: ActionReach; actionName: string };
  relation: SpacingRelation;
  correction: SpacingCorrection;
};

export type BattlefieldTopologyEdge = {
  fromAreaId: string;
  toAreaId: string;
  movement?: string;
};

function characterId(side: "a" | "b"): `character.${"a" | "b"}` {
  return `character.${side}`;
}

function counterpartSide(side: "a" | "b"): "a" | "b" {
  return side === "a" ? "b" : "a";
}

export function reachMaxRank(reach: ActionReach): number {
  if (reach === "same_area") return IN_AREA_RANK.far;
  return IN_AREA_RANK[reach];
}

export function reachMinRank(minReach?: ActionReach | null): number {
  if (!minReach || minReach === "same_area") return IN_AREA_RANK.contact;
  return IN_AREA_RANK[minReach];
}

export function inAreaDistanceRank(distance: WorldDistance): number | null {
  if (distance === "contact" || distance === "near" ||
      distance === "medium" || distance === "far") {
    return IN_AREA_RANK[distance];
  }
  return null;
}

export function spacingForConstraints(input: {
  worldState?: BattleWorldState;
  actorSide: "a" | "b";
  unlocalized: boolean;
  constraints: Pick<ActionFeasibilityConstraints, "reach" | "minReach">;
}): Pick<SpacingPacket, "relation" | "correction"> {
  if (input.unlocalized) {
    return { relation: "unlocalized", correction: "localize" };
  }
  if (!input.worldState) {
    return { relation: "unavailable", correction: "none" };
  }
  const pair = readBattleWorldPair(
    input.worldState,
    characterId(input.actorSide),
    characterId(counterpartSide(input.actorSide)),
  );
  if (!pair || pair.distance === "out_of_scene") {
    return { relation: "unavailable", correction: "none" };
  }
  if (pair.distance === "separate_area") {
    return { relation: "too_far", correction: "close" };
  }
  const rank = inAreaDistanceRank(pair.distance);
  if (rank === null) {
    return { relation: "unavailable", correction: "none" };
  }
  if (rank > reachMaxRank(input.constraints.reach)) {
    return { relation: "too_far", correction: "close" };
  }
  if (rank < reachMinRank(input.constraints.minReach)) {
    return { relation: "too_close", correction: "open" };
  }
  return { relation: "in_band", correction: "none" };
}

export function constraintsFromIntent(
  _intent: CharacterActionIntent,
  fallback: Pick<ActionFeasibilityConstraints, "reach" | "minReach">,
): Pick<ActionFeasibilityConstraints, "reach" | "minReach"> {
  return fallback;
}

function adjacentAreas(
  fromAreaId: string,
  topology: readonly BattlefieldTopologyEdge[],
): string[] {
  const next: string[] = [];
  for (const edge of topology) {
    if (edge.movement === "blocked") continue;
    if (edge.fromAreaId === fromAreaId) next.push(edge.toAreaId);
    if (edge.toAreaId === fromAreaId) next.push(edge.fromAreaId);
  }
  return [...new Set(next)];
}

function nextHop(input: {
  fromAreaId: string;
  targetAreaId: string;
  topology: readonly BattlefieldTopologyEdge[];
  away: boolean;
}): string | null {
  const neighbors = adjacentAreas(input.fromAreaId, input.topology);
  if (neighbors.length === 0) return null;
  if (input.fromAreaId === input.targetAreaId) {
    return input.away ? neighbors[0] ?? null : null;
  }
  const visited = new Set<string>([input.fromAreaId]);
  const queue: Array<{ areaId: string; firstHop: string }> = neighbors.map(
    (areaId) => ({ areaId, firstHop: areaId }),
  );
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.areaId === input.targetAreaId) {
      return input.away
        ? neighbors.find((areaId) => areaId !== current.firstHop) ?? null
        : current.firstHop;
    }
    if (visited.has(current.areaId)) continue;
    visited.add(current.areaId);
    for (const neighbor of adjacentAreas(current.areaId, input.topology)) {
      if (!visited.has(neighbor)) {
        queue.push({ areaId: neighbor, firstHop: current.firstHop });
      }
    }
  }
  return input.away ? neighbors[0] ?? null : neighbors[0] ?? null;
}

type RepositionPlan = {
  operations: BattleWorldOperation[];
  event: TurnEvent;
  summaryKind: "area_hop" | "rank_change" | "noop";
};

function repositionNoop(actorName: string, actorSide: "a" | "b"): RepositionPlan {
  return {
    operations: [],
    event: {
      type: "reposition",
      actorName,
      actorSide,
      summary: `${actorName} は間合いを変えようとしたが、動ける場所がなかった。`,
    },
    summaryKind: "noop",
  };
}

function planCrossAreaHop(input: {
  actorId: `character.${"a" | "b"}`;
  targetId: `character.${"a" | "b"}`;
  actorAreaId: string;
  targetAreaId: string;
  actorName: string;
  actorSide: "a" | "b";
  away: boolean;
  close: boolean;
  topology: readonly BattlefieldTopologyEdge[];
}): RepositionPlan {
  if (!input.close && !input.away) {
    return repositionNoop(input.actorName, input.actorSide);
  }
  const hop = nextHop({
    fromAreaId: input.actorAreaId,
    targetAreaId: input.targetAreaId,
    topology: input.topology,
    away: input.away,
  });
  if (!hop) {
    return repositionNoop(input.actorName, input.actorSide);
  }
  const sameArea = hop === input.targetAreaId;
  return {
    operations: [
      {
        op: "set_placement",
        entityId: input.actorId,
        placement: { type: "scene", areaId: hop },
      },
      {
        op: "set_pair_relation",
        entityAId: input.actorId,
        entityBId: input.targetId,
        distance: sameArea ? "far" : "separate_area",
        sight: sameArea ? "clear" : "blocked",
        sound: sameArea ? "clear" : "partial",
        orientationA: "facing",
        orientationB: "facing",
      },
    ],
    event: {
      type: "reposition",
      actorName: input.actorName,
      actorSide: input.actorSide,
      summary: sameArea
        ? `${input.actorName} は相手のいる場へ踏み込み、遠い間合いを取った。`
        : input.away
          ? `${input.actorName} は距離を取るように場を移した。`
          : `${input.actorName} は間合いを詰めるように場を移した。`,
    },
    summaryKind: "area_hop",
  };
}

function nextInAreaRank(
  currentRank: number,
  desired: Pick<ActionFeasibilityConstraints, "reach" | "minReach">,
  away: boolean,
  close: boolean,
): number {
  if (currentRank > reachMaxRank(desired.reach)) return currentRank - 1;
  if (currentRank < reachMinRank(desired.minReach)) return currentRank + 1;
  if (away && currentRank < IN_AREA_RANK.far) return currentRank + 1;
  if (close && currentRank > IN_AREA_RANK.contact) return currentRank - 1;
  return currentRank;
}

function planInAreaRankChange(input: {
  actorId: `character.${"a" | "b"}`;
  targetId: `character.${"a" | "b"}`;
  actorName: string;
  actorSide: "a" | "b";
  pair: BattleWorldPairView | null;
  away: boolean;
  close: boolean;
  desired: Pick<ActionFeasibilityConstraints, "reach" | "minReach">;
}): RepositionPlan {
  const currentRank = input.pair ? inAreaDistanceRank(input.pair.distance) : null;
  if (currentRank === null) {
    return repositionNoop(input.actorName, input.actorSide);
  }
  const nextRank = nextInAreaRank(
    currentRank,
    input.desired,
    input.away,
    input.close,
  );
  if (nextRank === currentRank) {
    return repositionNoop(input.actorName, input.actorSide);
  }
  const nextDistance = RANK_TO_DISTANCE[nextRank]!;
  return {
    operations: [{
      op: "set_pair_relation",
      entityAId: input.actorId,
      entityBId: input.targetId,
      distance: nextDistance,
      sight: input.pair?.sight === "blocked" ? "clear" : (input.pair?.sight ?? "clear"),
      sound: input.pair?.sound === "blocked" ? "clear" : (input.pair?.sound ?? "clear"),
      orientationA: input.pair?.orientationA ?? "facing",
      orientationB: input.pair?.orientationB ?? "facing",
    }],
    event: {
      type: "reposition",
      actorName: input.actorName,
      actorSide: input.actorSide,
      summary: nextRank < currentRank
        ? `${input.actorName} は間合いを詰めた。`
        : `${input.actorName} は間合いを広げた。`,
    },
    summaryKind: "rank_change",
  };
}

export function planRepositionTransition(input: {
  worldState: BattleWorldState;
  actorSide: "a" | "b";
  actorName: string;
  turn: number;
  correction: SpacingCorrection;
  desired: Pick<ActionFeasibilityConstraints, "reach" | "minReach">;
  topology?: readonly BattlefieldTopologyEdge[];
}): RepositionPlan {
  const actorId = characterId(input.actorSide);
  const targetId = characterId(counterpartSide(input.actorSide));
  const actor = input.worldState.entities[actorId];
  const target = input.worldState.entities[targetId];
  if (
    !actor ||
    actor.placement.type !== "scene" ||
    !target ||
    target.placement.type !== "scene"
  ) {
    return repositionNoop(input.actorName, input.actorSide);
  }
  const away = input.correction === "open";
  const close = input.correction === "close" || input.correction === "localize";
  if (actor.placement.areaId !== target.placement.areaId) {
    return planCrossAreaHop({
      actorId,
      targetId,
      actorAreaId: actor.placement.areaId,
      targetAreaId: target.placement.areaId,
      actorName: input.actorName,
      actorSide: input.actorSide,
      away,
      close,
      topology: input.topology ?? [],
    });
  }
  return planInAreaRankChange({
    actorId,
    targetId,
    actorName: input.actorName,
    actorSide: input.actorSide,
    pair: readBattleWorldPair(input.worldState, actorId, targetId),
    away,
    close,
    desired: input.desired,
  });
}
