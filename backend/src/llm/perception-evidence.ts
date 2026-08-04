import {
  CommittedMechanicalEvidenceSetSchema,
  PerceptionEvidenceSetSchema,
  parameterClassFor,
  type BattleSemanticState,
  type CommittedMechanicalEvidence,
  type PerceptionEvidence,
  type ResolvedBattleAction,
  type TurnEvent,
} from "@kshiai/shared";
import type { PerceptionPromptInput } from "./perception-prompt-strategy.js";

export type EvidenceValidationStatus = "valid" | "rejected" | "unavailable";

export type EvidenceValidationResult<T> = {
  status: EvidenceValidationStatus;
  evidence: T[];
  issues: string[];
};

export function validateCommittedMechanicalEvidence(input: {
  raw: unknown;
  turn: number;
  before: BattleSemanticState;
  actions: ResolvedBattleAction[];
  events: TurnEvent[];
}): EvidenceValidationResult<CommittedMechanicalEvidence> {
  const parsed = CommittedMechanicalEvidenceSetSchema.safeParse(input.raw);
  if (!parsed.success) {
    return rejected(parsed.error.issues.map((issue) =>
      `${issue.path.join(".") || "mechanicalEvidence"}: ${issue.message}`
    ));
  }
  const actionById = new Map(input.actions.map((action) => [action.id, action]));
  const eventIds = new Set(
    input.events.flatMap((event) => event.id ? [event.id] : []),
  );
  const issues: string[] = [];
  for (const item of parsed.data) {
    if (item.turn !== input.turn) {
      issues.push(`${item.evidenceId}: turn is not the committed turn`);
    }
    if (item.sourceActionId !== null) {
      const action = actionById.get(item.sourceActionId);
      if (!action) {
        issues.push(`${item.evidenceId}: source action is not committed`);
      } else if (action.actorSide !== item.actorSide) {
        issues.push(`${item.evidenceId}: actor side disagrees with source action`);
      }
    } else if (item.actorSide !== null) {
      issues.push(`${item.evidenceId}: actor side requires a source action`);
    }
    for (const eventId of item.basisEventIds) {
      if (!eventIds.has(eventId)) {
        issues.push(`${item.evidenceId}: basis event ${eventId} is not committed`);
      }
    }
    const target = input.before.entities[item.target.entityId];
    if (!target || target.kind !== "character") {
      issues.push(`${item.evidenceId}: target entity is not a committed character`);
    }
  }
  return issues.length > 0
    ? rejected(issues)
    : { status: "valid", evidence: parsed.data, issues: [] };
}

/**
 * Project only structured, event-intensity-backed cues for the reviewed v10
 * prompt. Full absolute/relative thresholding is intentionally owned by
 * T_QUALITATIVE_CUES; raw values never cross this boundary.
 */
export function buildPromptMechanicalEvidence(input: {
  evidence: CommittedMechanicalEvidence[];
  events: TurnEvent[];
}): PerceptionPromptInput["mechanicalEvidence"] {
  const eventById = new Map(
    input.events.flatMap((event) => event.id ? [[event.id, event] as const] : []),
  );
  return input.evidence.flatMap((item) => {
    const event = item.basisEventIds
      .map((eventId) => eventById.get(eventId))
      .find((candidate) =>
        candidate?.intensity !== undefined &&
        candidate.targetSides?.includes(item.target.side) &&
        eventMechanicsMatch(candidate, item.parameterKey, item.delta)
      );
    if (!event?.id || !event.intensity) return [];
    const parameterClass = parameterClassFor(item.parameterKey);
    const direction = item.delta < 0 ? "loss" as const : "gain" as const;
    const impact =
      direction === "loss" &&
      parameterClass === "vitality" &&
      item.actorSide !== null &&
      item.actorSide !== item.target.side;
    return [{
      eventId: event.id,
      kind: impact
        ? "impact" as const
        : direction === "gain"
          ? "recovery" as const
          : item.actorSide === item.target.side
            ? "exertion" as const
            : "impact" as const,
      actorSide: item.actorSide,
      targetSides: [item.target.side],
      parameterClass,
      direction,
      absoluteBand: absoluteBandFor(event.intensity),
      relativeBand: "not_applicable" as const,
      outcome:
        item.parameterKey === "hp" && item.afterValue <= 0
          ? "incapacitated" as const
          : "effective" as const,
      handFeelRequired: impact,
    }];
  });
}

export function validateSensoryEvidence(input: {
  raw: unknown;
  before: BattleSemanticState;
  events: TurnEvent[];
  providerStatus?: EvidenceValidationStatus;
}): EvidenceValidationResult<PerceptionEvidence> {
  if (input.providerStatus === "unavailable" || input.raw === undefined) {
    return input.providerStatus === "valid"
      ? rejected(["provider marked a missing sensory evidence section valid"])
      : { status: "unavailable", evidence: [], issues: [] };
  }
  if (input.providerStatus === "rejected") {
    return rejected(["provider rejected the sensory evidence section"]);
  }
  const parsed = PerceptionEvidenceSetSchema.safeParse(input.raw);
  if (!parsed.success) {
    return rejected(parsed.error.issues.map((issue) =>
      `${issue.path.join(".") || "sensoryEvidence"}: ${issue.message}`
    ));
  }
  const eventIds = new Set(
    input.events.flatMap((event) => event.id ? [event.id] : []),
  );
  const issues: string[] = [];
  for (const item of parsed.data) {
    for (const eventId of item.basisEventIds) {
      if (!eventIds.has(eventId)) {
        issues.push(`${item.evidenceId}: basis event ${eventId} is not committed`);
      }
    }
    if (item.source.kind === "event") {
      if (!eventIds.has(item.source.eventId)) {
        issues.push(`${item.evidenceId}: source event is not committed`);
      } else if (!item.basisEventIds.includes(item.source.eventId)) {
        issues.push(`${item.evidenceId}: source event must also be a basis event`);
      }
    }
    if (
      item.source.kind === "entity" &&
      !input.before.entities[item.source.entityId]
    ) {
      issues.push(`${item.evidenceId}: source entity is not in the committed world`);
    }
  }
  return issues.length > 0
    ? rejected(issues)
    : { status: "valid", evidence: parsed.data, issues: [] };
}

function eventMechanicsMatch(
  event: TurnEvent,
  parameterKey: CommittedMechanicalEvidence["parameterKey"],
  delta: number,
): boolean {
  if (parameterKey !== "hp") return false;
  if (delta < 0) return event.type === "damage";
  return event.type === "heal" || event.type === "rest";
}

function absoluteBandFor(
  intensity: NonNullable<TurnEvent["intensity"]>,
): "light" | "solid" | "heavy" | "extreme" {
  switch (intensity) {
    case "minor":
      return "light";
    case "moderate":
      return "solid";
    case "heavy":
      return "heavy";
    case "critical":
      return "extreme";
  }
}

function rejected<T>(issues: string[]): EvidenceValidationResult<T> {
  return { status: "rejected", evidence: [], issues };
}
