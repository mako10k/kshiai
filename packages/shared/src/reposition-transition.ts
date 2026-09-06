import type { ActionReach } from "./character.js";
import type { ActionFeasibilityConstraints } from "./character.js";
import type { CharacterActionIntent, TurnEvent } from "./battle.js";
import {
  readBattleWorldPair,
  type BattleWorldOperation,
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

export function planRepositionTransition(input: {
  worldState: BattleWorldState;
  actorSide: "a" | "b";
  actorName: string;
  turn: number;
  correction: SpacingCorrection;
  desired: Pick<ActionFeasibilityConstraints, "reach" | "minReach">;
  topology?: readonly BattlefieldTopologyEdge[];
}): {
  operations: BattleWorldOperation[];
  event: TurnEvent;
  summaryKind: "area_hop" | "rank_change" | "noop";
} {
  const actorId = characterId(input.actorSide);
  const targetId = characterId(counterpartSide(input.actorSide));
  const actor = input.worldState.entities[actorId];
  const target = input.worldState.entities[targetId];
  const noopEvent: TurnEvent = {
    type: "reposition",
    actorName: input.actorName,
    actorSide: input.actorSide,
    summary: `${input.actorName} は間合いを変えようとしたが、動ける場所がなかった。`,
  };
  if (
    !actor ||
    actor.placement.type !== "scene" ||
    !target ||
    target.placement.type !== "scene"
  ) {
    return { operations: [], event: noopEvent, summaryKind: "noop" };
  }
  const pair = readBattleWorldPair(input.worldState, actorId, targetId);
  const away = input.correction === "open";
  const close = input.correction === "close" || input.correction === "localize";
  if (actor.placement.areaId !== target.placement.areaId) {
    if (!close && !away) {
      return { operations: [], event: noopEvent, summaryKind: "noop" };
    }
    const hop = nextHop({
      fromAreaId: actor.placement.areaId,
      targetAreaId: target.placement.areaId,
      topology: input.topology ?? [],
      away,
    });
    if (!hop) {
      return { operations: [], event: noopEvent, summaryKind: "noop" };
    }
    const sameArea = hop === target.placement.areaId;
    const operations: BattleWorldOperation[] = [
      {
        op: "set_placement",
        entityId: actorId,
        placement: { type: "scene", areaId: hop },
      },
      {
        op: "set_pair_relation",
        entityAId: actorId,
        entityBId: targetId,
        distance: sameArea ? "far" : "separate_area",
        sight: sameArea ? "clear" : "blocked",
        sound: sameArea ? "clear" : "partial",
        orientationA: "facing",
        orientationB: "facing",
      },
    ];
    return {
      operations,
      event: {
        type: "reposition",
        actorName: input.actorName,
        actorSide: input.actorSide,
        summary: sameArea
          ? `${input.actorName} は相手のいる場へ踏み込み、遠い間合いを取った。`
          : away
            ? `${input.actorName} は距離を取るように場を移した。`
            : `${input.actorName} は間合いを詰めるように場を移した。`,
      },
      summaryKind: "area_hop",
    };
  }

  const currentRank = pair ? inAreaDistanceRank(pair.distance) : null;
  if (currentRank === null) {
    return { operations: [], event: noopEvent, summaryKind: "noop" };
  }
  const minRank = reachMinRank(input.desired.minReach);
  const maxRank = reachMaxRank(input.desired.reach);
  let nextRank = currentRank;
  if (currentRank > maxRank) nextRank = currentRank - 1;
  else if (currentRank < minRank) nextRank = currentRank + 1;
  else if (away && currentRank < IN_AREA_RANK.far) nextRank = currentRank + 1;
  else if (close && currentRank > IN_AREA_RANK.contact) nextRank = currentRank - 1;
  if (nextRank === currentRank) {
    return { operations: [], event: noopEvent, summaryKind: "noop" };
  }
  const nextDistance = RANK_TO_DISTANCE[nextRank]!;
  return {
    operations: [{
      op: "set_pair_relation",
      entityAId: actorId,
      entityBId: targetId,
      distance: nextDistance,
      sight: pair?.sight === "blocked" ? "clear" : (pair?.sight ?? "clear"),
      sound: pair?.sound === "blocked" ? "clear" : (pair?.sound ?? "clear"),
      orientationA: pair?.orientationA ?? "facing",
      orientationB: pair?.orientationB ?? "facing",
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
