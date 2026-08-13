import {
  CharacterNarrativeCueV2Schema,
  CharacterObservableManifestationV2Schema,
  TurnObservationPacketSchema,
  type CharacterNarrativeCueV2,
  type CharacterObservableManifestationV2,
  type TurnEvent,
  type TurnObservationPacket,
} from "./battle.js";
import type { NarrationFocus } from "./narration-perspective.js";
import {
  PerceptionEvidenceSchema,
  type PerceptionAccess,
  type PerceptionEvidence,
} from "./perception.js";

function manifestationAccess(
  access: PerceptionAccess,
  description: string,
): PerceptionAccess {
  const { perceivedPhenomenon: _carrierPhenomenon, ...stableAccess } = access;
  if (access.currentAccess === "none") return stableAccess;
  return {
    ...stableAccess,
    perceivedPhenomenon: access.currentAccess === "clear"
      ? description
      : access.currentAccess === "coarse"
        ? "何らかの反応を捉えた"
        : "かすかな反応を捉えた",
  };
}

export function validateCharacterPsycheProjectionEvidenceV2(input: {
  packet: TurnObservationPacket;
  manifestations?: readonly CharacterObservableManifestationV2[];
  narrativeCues?: readonly CharacterNarrativeCueV2[];
}): {
  manifestations: CharacterObservableManifestationV2[];
  narrativeCues: CharacterNarrativeCueV2[];
} {
  const packet = TurnObservationPacketSchema.parse(input.packet);
  const allowedEventIds = new Set([
    ...packet.selfResult,
    ...packet.counterpartResult,
    ...packet.ambientChange,
  ].flatMap((item) => item.sourceEventIds));
  const sourceAllowed = (sourceEventIds: readonly string[]) =>
    sourceEventIds.length > 0 &&
    sourceEventIds.every((eventId) => allowedEventIds.has(eventId));
  return {
    manifestations: (input.manifestations ?? []).flatMap((candidate) => {
      const parsed = CharacterObservableManifestationV2Schema.safeParse(candidate);
      return parsed.success && sourceAllowed(parsed.data.sourceEventIds)
        ? [parsed.data]
        : [];
    }).slice(0, 2),
    narrativeCues: (input.narrativeCues ?? []).flatMap((candidate) => {
      const parsed = CharacterNarrativeCueV2Schema.safeParse(candidate);
      return parsed.success && sourceAllowed(parsed.data.sourceEventIds)
        ? [parsed.data]
        : [];
    }).slice(0, 2),
  };
}

/**
 * A private proposal becomes an event only when the same character actually
 * produced a compatible committed expression. No carrier means no event.
 */
export function commitCharacterObservableManifestationsV2(input: {
  turn: number;
  actorSide: "a" | "b";
  actorName: string;
  proposals: readonly CharacterObservableManifestationV2[];
  committedEvents: readonly TurnEvent[];
}): TurnEvent[] {
  const committedEventIds = new Set(
    input.committedEvents.flatMap((event) => event.id ? [event.id] : []),
  );
  const carrier = input.committedEvents.find((event) =>
    event.type === "utterance" &&
    event.actorSide === input.actorSide &&
    event.id &&
    event.utterance
  );
  if (!carrier?.id || !carrier.utterance) return [];
  const carrierEventId = carrier.id;
  const carrierUtterance = carrier.utterance;

  return input.proposals.flatMap((candidate, index) => {
    const parsed = CharacterObservableManifestationV2Schema.safeParse(candidate);
    if (!parsed.success || parsed.data.sourceEventIds.length === 0 ||
        !parsed.data.sourceEventIds.every((eventId) =>
          committedEventIds.has(eventId)
        )) {
      return [];
    }
    const needsVoice = parsed.data.modality === "voice";
    const carrierCompatible = needsVoice
      ? carrierUtterance.delivery === "spoken"
      : true;
    if (!carrierCompatible) return [];
    return [{
      id: `event.manifestation.${input.turn}.${input.actorSide}.${index + 1}`,
      type: "manifestation" as const,
      actorName: input.actorName,
      actorSide: input.actorSide,
      manifestation: {
        modality: parsed.data.modality,
        description: parsed.data.proposal,
        sourceEventIds: parsed.data.sourceEventIds,
        carrierEventId,
      },
      summary: `${input.actorName}が観測可能な反応を示した。`,
    } satisfies TurnEvent];
  }).slice(0, 2);
}

/** Copy only the already-resolved carrier access to the new committed cue. */
export function buildManifestationPerceptionEvidenceV2(input: {
  events: readonly TurnEvent[];
  carrierEvidence: readonly PerceptionEvidence[];
}): PerceptionEvidence[] {
  return input.events.flatMap((event) => {
    if (event.type !== "manifestation" || !event.id || !event.actorSide ||
        !event.manifestation) {
      return [];
    }
    const carrier = input.carrierEvidence.find((evidence) =>
      evidence.basisEventIds.includes(event.manifestation!.carrierEventId)
    );
    if (!carrier) return [];
    return [PerceptionEvidenceSchema.parse({
      evidenceId: `evidence.manifestation.${event.id.replace(/^event\./, "")}`,
      basisEventIds: [event.id],
      modality: event.manifestation.modality === "voice" ? "sound" : "vision",
      phenomenon: event.manifestation.description,
      source: {
        kind: "entity",
        entityId: `character.${event.actorSide}`,
      },
      accessBySide: {
        a: manifestationAccess(
          carrier.accessBySide.a,
          event.manifestation.description,
        ),
        b: manifestationAccess(
          carrier.accessBySide.b,
          event.manifestation.description,
        ),
      },
      publicAccess: manifestationAccess(
        carrier.publicAccess,
        event.manifestation.description,
      ),
    })];
  });
}

export function buildCommittedManifestationNarrativeCuesV2(
  events: readonly TurnEvent[],
): CharacterNarrativeCueV2[] {
  return events.flatMap((event) =>
    event.type === "manifestation" && event.id && event.manifestation
      ? [CharacterNarrativeCueV2Schema.parse({
          access: "external_observable",
          description: event.manifestation.description,
          sourceEventIds: [event.id],
        })]
      : []
  ).slice(0, 4);
}

export function selectCharacterNarrativeCuesV2(input: {
  side: "a" | "b";
  focus: NarrationFocus;
  proposedCues: readonly CharacterNarrativeCueV2[];
  committedEvents: readonly TurnEvent[];
  manifestationEvidence: readonly PerceptionEvidence[];
}): CharacterNarrativeCueV2[] {
  const committedEventIds = new Set(
    input.committedEvents.flatMap((event) => event.id ? [event.id] : []),
  );
  const visibleManifestationIds = new Set(
    input.manifestationEvidence.flatMap((evidence) =>
      evidence.publicAccess.currentAccess === "none"
        ? []
        : evidence.basisEventIds
    ),
  );
  const sideHasInnerAccess = input.focus === "both" ||
    (input.focus === "self" && input.side === "a") ||
    (input.focus === "foe" && input.side === "b");

  return input.proposedCues.flatMap((candidate) => {
    const parsed = CharacterNarrativeCueV2Schema.safeParse(candidate);
    if (!parsed.success || parsed.data.sourceEventIds.length === 0 ||
        !parsed.data.sourceEventIds.every((eventId) =>
          committedEventIds.has(eventId)
        )) {
      return [];
    }
    if (parsed.data.access === "external_observable") {
      return parsed.data.sourceEventIds.some((eventId) =>
        visibleManifestationIds.has(eventId)
      ) ? [parsed.data] : [];
    }
    if (parsed.data.access === "omniscient") {
      return input.focus === "both" ? [parsed.data] : [];
    }
    return sideHasInnerAccess ? [parsed.data] : [];
  }).slice(0, 2);
}
