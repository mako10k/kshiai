import type { Parameters, ParamKey } from "./character.js";
import {
  QuantizedMechanicalEvidenceSetSchema,
  ServerOnlyReserveCueSchema,
  parameterClassFor,
  type BattleSide,
  type CommittedMechanicalEvidence,
  type MagnitudeBand,
  type QuantizedMechanicalEvidence,
  type ReserveBand,
  type ServerOnlyReserveCue,
} from "./perception.js";

const ABSOLUTE_REFERENCES: Record<ParamKey, number> = {
  hp: 110,
  maxHp: 110,
  mp: 45,
  maxMp: 45,
  stamina: 50,
  maxStamina: 50,
  atk: 14,
  def: 13,
  spd: 13,
  mag: 13,
  res: 13,
  focus: 12,
  luck: 12,
};

export function quantizeCommittedMechanicalEvidence(
  evidence: readonly CommittedMechanicalEvidence[],
): QuantizedMechanicalEvidence[] {
  return QuantizedMechanicalEvidenceSetSchema.parse(evidence.map((item) => {
    const direction = item.delta < 0
      ? "loss" as const
      : item.delta > 0
        ? "gain" as const
        : "unchanged" as const;
    return {
      evidenceId: item.evidenceId,
      turn: item.turn,
      sourceActionId: item.sourceActionId,
      basisEventIds: item.basisEventIds,
      actorSide: item.actorSide,
      target: item.target,
      change: {
        parameterKey: item.parameterKey,
        parameterClass: parameterClassFor(item.parameterKey),
        direction,
        absoluteBand: magnitudeBand(
          Math.abs(item.delta) / ABSOLUTE_REFERENCES[item.parameterKey],
        ),
        relativeBand: magnitudeBand(
          Math.abs(item.delta) /
            Math.max(
              1,
              item.relativeReferenceBeforeValue,
              item.relativeReferenceAfterValue,
            ),
        ),
        outcome: mechanicalOutcome(item),
      },
    };
  }));
}

export function buildServerOnlyReserveCues(input: {
  side: BattleSide;
  parameters: Parameters;
  baseParameters?: Parameters;
}): ServerOnlyReserveCue[] {
  return ([
    ["hp", "maxHp"],
    ["mp", "maxMp"],
    ["stamina", "maxStamina"],
    ["focus", null],
  ] as const).map(([parameterKey, maximumKey]) => {
    const current = Math.max(0, input.parameters[parameterKey] ?? 0);
    const maximum = maximumKey === null
      ? Math.max(
          1,
          input.baseParameters?.focus ?? ABSOLUTE_REFERENCES.focus,
        )
      : Math.max(1, input.parameters[maximumKey] ?? 1);
    return ServerOnlyReserveCueSchema.parse({
      side: input.side,
      targetEntityId: `character.${input.side}`,
      parameterKey,
      absoluteBand: reserveBand(
        current / ABSOLUTE_REFERENCES[parameterKey],
      ),
      relativeBand: reserveBand(current / maximum),
    });
  });
}

function mechanicalOutcome(
  evidence: CommittedMechanicalEvidence,
): QuantizedMechanicalEvidence["change"]["outcome"] {
  if (evidence.delta === 0) {
    return evidence.attemptedDelta < 0 ? "immune" : "none";
  }
  if (
    evidence.parameterKey === "hp" &&
    evidence.delta < 0 &&
    evidence.afterValue <= 0
  ) {
    return Math.abs(evidence.attemptedDelta) > Math.abs(evidence.delta)
      ? "overkill"
      : "incapacitated";
  }
  return "effective";
}

function magnitudeBand(ratio: number): MagnitudeBand {
  if (ratio <= 0) return "none";
  if (ratio <= 0.03) return "trace";
  if (ratio <= 0.08) return "light";
  if (ratio <= 0.18) return "solid";
  if (ratio <= 0.35) return "heavy";
  return "extreme";
}

function reserveBand(ratio: number): ReserveBand {
  if (ratio <= 0) return "empty";
  if (ratio <= 0.15) return "critical";
  if (ratio <= 0.35) return "low";
  if (ratio <= 0.6) return "taxed";
  if (ratio <= 0.85) return "ready";
  return "full";
}
