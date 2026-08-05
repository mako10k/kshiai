import {
  CommittedMechanicalEvidenceSetSchema,
  PerceptionEvidenceSetSchema,
  type BattleSemanticState,
  type CommittedMechanicalEvidence,
  type PerceptionEvidence,
  type QuantizedMechanicalEvidence,
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
 * Project only quantized cues with a structurally matching committed event to
 * the reviewed v10 prompt. Raw values never cross this boundary.
 */
export function buildPromptMechanicalEvidence(input: {
  evidence: QuantizedMechanicalEvidence[];
  events: TurnEvent[];
}): PerceptionPromptInput["mechanicalEvidence"] {
  const eventById = new Map(
    input.events.flatMap((event) => event.id ? [[event.id, event] as const] : []),
  );
  return input.evidence.flatMap((item) => {
    const event = item.basisEventIds
      .map((eventId) => eventById.get(eventId))
      .find((candidate) =>
        candidate !== undefined &&
        candidate.targetSides?.includes(item.target.side) &&
        eventMechanicsMatch(candidate, item.change)
      );
    if (!event?.id) return [];
    const { change } = item;
    const impact =
      event.type === "damage" &&
      item.actorSide !== null &&
      item.actorSide !== item.target.side;
    return [{
      eventId: event.id,
      kind: change.outcome === "none" || change.outcome === "immune"
        ? "no_effect" as const
        : impact
          ? "impact" as const
          : change.direction === "gain"
            ? "recovery" as const
            : item.actorSide === item.target.side
              ? "exertion" as const
              : "impact" as const,
      actorSide: item.actorSide,
      targetSides: [item.target.side],
      parameterClass: change.parameterClass,
      direction: change.direction,
      absoluteBand: change.absoluteBand,
      relativeBand: change.relativeBand,
      outcome: change.outcome,
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
    if (item.revokesSubjectAccess === true) {
      if (item.basisEventIds.length === 0 || item.source.kind === "ambient") {
        issues.push(
          `${item.evidenceId}: subject access revocation requires a committed non-ambient source`,
        );
      }
      if (
        item.accessBySide.a.currentAccess !== "none" &&
        item.accessBySide.b.currentAccess !== "none"
      ) {
        issues.push(
          `${item.evidenceId}: subject access revocation requires a side with no access`,
        );
      }
    }
  }
  return issues.length > 0
    ? rejected(issues)
    : { status: "valid", evidence: parsed.data, issues: [] };
}

function eventMechanicsMatch(
  event: TurnEvent,
  change: QuantizedMechanicalEvidence["change"],
): boolean {
  if (event.parameterKey) {
    if (event.parameterKey !== change.parameterKey) return false;
    return change.direction === "unchanged" ||
      event.parameterDirection === change.direction;
  }
  if (change.parameterKey === "hp") {
    if (event.type === "damage") {
      return change.direction === "loss" || change.direction === "unchanged";
    }
    if (event.type === "heal") {
      return change.direction === "gain" || change.direction === "unchanged";
    }
  }
  return event.type === "rest" &&
    change.direction === "gain" &&
    (change.parameterKey === "mp" || change.parameterKey === "stamina");
}

function rejected<T>(issues: string[]): EvidenceValidationResult<T> {
  return { status: "rejected", evidence: [], issues };
}
