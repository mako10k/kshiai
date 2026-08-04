import type { TurnEvent } from "./battle.js";
import type { BattleSemanticState } from "./semantic-state.js";
import {
  CharacterPerceptionFrameASchema,
  CharacterPerceptionFrameBSchema,
  ObserverContactRegistryASchema,
  ObserverContactRegistryBSchema,
  PERCEPTION_LIMITS,
  type BattleSide,
  type CharacterPerceptionFrame,
  type ContactSourceRef,
  type CurrentAccess,
  type IdentityKnowledge,
  type ObserverContactRegistry,
  type ObserverContactRegistryEntry,
  type PerceivedSourceKnowledge,
  type PerceivedTargetKnowledge,
  type PerceptionAccess,
  type PerceptionEvidence,
  type PerceptionSalience,
  type PerceptionSlot,
  type Percept,
  type QuantizedChange,
  type QuantizedMechanicalEvidence,
  type ResourceReserveCue,
  type ServerOnlyReserveCue,
} from "./perception.js";

type EvidenceObservation = {
  evidence: PerceptionEvidence;
  access: PerceptionAccess;
  percept: Percept;
};

type SourceGroup = {
  key: string;
  sourceSet: ContactSourceRef[];
  entityId: string | null;
  observations: EvidenceObservation[];
  access: CurrentAccess;
  identity: IdentityKnowledge;
  perceivedAs: string;
  salience: PerceptionSalience;
};

export type ObserverPerceptionProjectionInput = {
  observerSide: BattleSide;
  turn: number;
  semanticState: BattleSemanticState;
  events: readonly TurnEvent[];
  quantizedMechanicalEvidence: readonly QuantizedMechanicalEvidence[];
  reserveEvidence: readonly ServerOnlyReserveCue[];
  sensoryEvidence: readonly PerceptionEvidence[];
  previousFrame?: CharacterPerceptionFrame;
  previousRegistry?: ObserverContactRegistry;
  legacyCounterpartIdentified?: boolean;
};

export type ObserverPerceptionProjection = {
  frame: CharacterPerceptionFrame;
  registry: ObserverContactRegistry;
};

const ACCESS_RANK: Record<CurrentAccess, number> = {
  none: 0,
  trace: 1,
  coarse: 2,
  clear: 3,
};

const IDENTITY_RANK: Record<IdentityKnowledge, number> = {
  unknown: 0,
  suspected: 1,
  identified: 2,
};

const SALIENCE_RANK: Record<PerceptionSalience, number> = {
  background: 0,
  noticeable: 1,
  prominent: 2,
  urgent: 3,
};

/**
 * Deterministically projects one observer's bounded frame and private registry.
 * Canonical source references remain in the registry and never enter the frame.
 */
export function projectObserverPerception(
  input: ObserverPerceptionProjectionInput,
): ObserverPerceptionProjection {
  const counterpartSide = otherSide(input.observerSide);
  const previousRegistry = normalizeRegistry(
    input.observerSide,
    input.previousRegistry,
  );
  const contacts: ObserverContactRegistryEntry[] = previousRegistry.contacts
    .map((entry) => ({
      ...entry,
      currentAccess: "none" as const,
      sourceSet: entry.sourceSet.map((source) => ({ ...source })),
    }));
  let nextContactSequence = previousRegistry.nextContactSequence;
  const accessible = input.sensoryEvidence
    .map((evidence) => observationFor(input, evidence))
    .filter((observation): observation is EvidenceObservation =>
      observation !== null
    );
  const ambientObservations = accessible.filter(
    ({ evidence }) => evidence.source.kind === "ambient",
  );
  const groups = coalesceAmbiguousGroups(groupBySource(accessible.filter(
    ({ evidence }) => evidence.source.kind !== "ambient",
  )));
  const previousByGroup = new Map<string, ObserverContactRegistryEntry>();
  for (const group of groups) {
    const matching = previousRegistry.contacts.filter((entry) =>
      sameSourceSet(entry.sourceSet, group.sourceSet)
    );
    const previous = group.identity === "identified"
      ? matching.find((entry) => entry.identityKnowledge !== "identified") ??
        matching[0]
      : matching.find((entry) => entry.identityKnowledge !== "identified");
    if (previous) previousByGroup.set(group.key, previous);
  }
  const reservedContactIds = new Set(
    [...previousByGroup.values()].map((entry) => entry.contactId),
  );
  const contactObservations = new Map<string, EvidenceObservation[]>();
  const directSelf: EvidenceObservation[] = [];
  const directCounterpart: EvidenceObservation[] = [];
  const directOthers = new Map<string, EvidenceObservation[]>();
  let directCounterpartIdentity: IdentityKnowledge = "unknown";
  const previousCounterpartIdentity = strongestIdentity(
    input.previousFrame?.counterpart.identityKnowledge ?? "unknown",
    input.legacyCounterpartIdentified ? "identified" : "unknown",
  );

  for (const group of groups) {
    const previous = previousByGroup.get(group.key);
    let identity = strongestIdentity(
      group.identity,
      previous?.identityKnowledge ?? "unknown",
    );
    if (identity === "identified" && group.entityId === null) {
      identity = "suspected";
    }

    if (group.entityId === `character.${input.observerSide}`) {
      directSelf.push(...group.observations);
      updateMatchedRegistry(
        contacts,
        previous,
        group,
        "identified",
        group.entityId,
        input.turn,
      );
      continue;
    }
    if (
      group.entityId === `character.${counterpartSide}` &&
      identity !== "unknown"
    ) {
      directCounterpart.push(...group.observations);
      directCounterpartIdentity = strongestIdentity(
        directCounterpartIdentity,
        identity,
      );
      updateMatchedRegistry(
        contacts,
        previous,
        group,
        identity,
        identity === "identified" ? group.entityId : null,
        input.turn,
      );
      continue;
    }
    if (group.entityId !== null && identity === "identified") {
      directOthers.set(group.entityId, [
        ...(directOthers.get(group.entityId) ?? []),
        ...group.observations,
      ]);
      updateMatchedRegistry(
        contacts,
        previous,
        group,
        identity,
        group.entityId,
        input.turn,
      );
      continue;
    }

    let entry = previous
      ? contacts.find((candidate) => candidate.contactId === previous.contactId)
      : undefined;
    if (!entry) {
      if (contacts.length >= PERCEPTION_LIMITS.maxContactRegistryEntries) {
        const eviction = chooseEviction(contacts, reservedContactIds);
        if (eviction === null) {
          ambientObservations.push(...group.observations);
          continue;
        }
        contacts.splice(eviction, 1);
      }
      entry = {
        contactId: `contact.${input.observerSide}.${nextContactSequence}`,
        currentAccess: group.access,
        identityKnowledge: identity,
        identifiedRef: null,
        perceivedAs: group.perceivedAs,
        salience: group.salience,
        lastObservedTurn: input.turn,
        sourceSet: group.sourceSet,
      };
      nextContactSequence += 1;
      contacts.push(entry);
    } else {
      entry.currentAccess = group.access;
      entry.identityKnowledge = strongestIdentity(
        entry.identityKnowledge,
        identity,
      );
      entry.identifiedRef = null;
      entry.perceivedAs = group.perceivedAs;
      entry.salience = group.salience;
      entry.lastObservedTurn = input.turn;
    }
    reservedContactIds.add(entry.contactId);
    contactObservations.set(entry.contactId, group.observations);
  }

  contacts.sort((a, b) =>
    contactSequence(a.contactId) - contactSequence(b.contactId)
  );
  const registry = registrySchema(input.observerSide).parse({
    schemaVersion: 1,
    observerSide: input.observerSide,
    nextContactSequence,
    contacts,
  });

  const self = buildSelfSlot(directSelf);
  const counterpartIdentity = strongestIdentity(
    previousCounterpartIdentity,
    directCounterpartIdentity,
  );
  const counterpart = buildCounterpartSlot({
    observations: directCounterpart,
    identity: counterpartIdentity,
    label: input.semanticState.entities[`character.${counterpartSide}`]?.label ??
      "相手",
  });
  const otherSlots = buildOtherSlots({
    observerSide: input.observerSide,
    counterpartSide,
    registry,
    contactObservations,
    directOthers,
    ambientObservations,
  });
  const qualitativeChanges = projectQualitativeChanges({
    observerSide: input.observerSide,
    counterpart,
    registry,
    sensoryEvidence: input.sensoryEvidence,
    evidence: input.quantizedMechanicalEvidence,
  });
  const reserveCues = projectReserveCues(
    input.observerSide,
    input.reserveEvidence,
  );
  const latestDiff = perceptionDiff(
    input.previousFrame,
    input.semanticState.revision,
    [self, counterpart, ...otherSlots],
  );
  const frame = frameSchema(input.observerSide).parse({
    schemaVersion: 1,
    observer: { side: input.observerSide, self: "self" },
    turn: input.turn,
    revision: input.semanticState.revision,
    self,
    counterpart,
    others: otherSlots,
    qualitativeChanges,
    reserveCues,
    latestDiff,
  });
  return { frame: deepFreeze(frame), registry };
}

/** Engine-only fallback used when full projection itself fails. */
export function buildMinimalObserverPerception(
  input: Omit<ObserverPerceptionProjectionInput, "sensoryEvidence" | "events">,
): ObserverPerceptionProjection {
  const counterpartSide = otherSide(input.observerSide);
  const registry = normalizeRegistry(input.observerSide, input.previousRegistry);
  const self = buildSelfSlot([]);
  const identity = strongestIdentity(
    input.previousFrame?.counterpart.identityKnowledge ?? "unknown",
    input.legacyCounterpartIdentified ? "identified" : "unknown",
  );
  const counterpart = buildCounterpartSlot({
    observations: [],
    identity,
    label: input.semanticState.entities[`character.${counterpartSide}`]?.label ??
      "相手",
  });
  const frame = frameSchema(input.observerSide).parse({
    schemaVersion: 1,
    observer: { side: input.observerSide, self: "self" },
    turn: input.turn,
    revision: input.semanticState.revision,
    self,
    counterpart,
    others: [],
    qualitativeChanges: projectQualitativeChanges({
      observerSide: input.observerSide,
      counterpart,
      registry,
      sensoryEvidence: [],
      evidence: input.quantizedMechanicalEvidence,
    }),
    reserveCues: projectReserveCues(
      input.observerSide,
      input.reserveEvidence,
    ),
    latestDiff: perceptionDiff(
      input.previousFrame,
      input.semanticState.revision,
      [self, counterpart],
    ),
  });
  return { frame: deepFreeze(frame), registry };
}

function observationFor(
  input: ObserverPerceptionProjectionInput,
  evidence: PerceptionEvidence,
): EvidenceObservation | null {
  const access = observerSafeAccess(
    input,
    evidence,
    evidence.accessBySide[input.observerSide],
  );
  if (access.currentAccess === "none") return null;
  return {
    evidence,
    access,
    percept: {
      perceptId: observerPerceptId(input.observerSide, evidence.evidenceId),
      modality: evidence.modality,
      phenomenon: observerSafeText(
        input,
      evidence,
      access,
      evidence.phenomenon,
      "何かの気配を感じる",
      400,
      ),
      direction: access.direction,
      distance: access.distance,
      salience: salienceForEvidence(input, evidence, access),
      occurrenceCertainty: access.occurrenceCertainty,
      attributionCertainty: access.attributionCertainty,
    },
  };
}

function salienceForEvidence(
  input: ObserverPerceptionProjectionInput,
  evidence: PerceptionEvidence,
  access: PerceptionAccess,
): PerceptionSalience {
  let salience: PerceptionSalience = access.currentAccess === "clear"
    ? "prominent"
    : access.currentAccess === "coarse"
      ? "noticeable"
      : "background";
  const basis = new Set(evidence.basisEventIds);
  for (const event of input.events) {
    if (!event.id || !basis.has(event.id)) continue;
    salience = strongestSalience(
      salience,
      event.intensity === "critical"
        ? "urgent"
        : event.intensity === "heavy"
          ? "prominent"
          : event.intensity === "moderate"
            ? "noticeable"
            : "background",
    );
  }
  for (const mechanical of input.quantizedMechanicalEvidence) {
    if (!mechanical.basisEventIds.some((eventId) => basis.has(eventId))) continue;
    const { change } = mechanical;
    salience = strongestSalience(
      salience,
      change.outcome === "incapacitated" || change.outcome === "overkill" ||
          change.absoluteBand === "extreme" || change.relativeBand === "extreme"
        ? "urgent"
        : change.absoluteBand === "heavy" || change.relativeBand === "heavy"
          ? "prominent"
          : change.absoluteBand === "solid" || change.relativeBand === "solid"
            ? "noticeable"
            : "background",
    );
  }
  return salience;
}

function groupBySource(observations: EvidenceObservation[]): SourceGroup[] {
  const grouped = new Map<string, {
    sourceSet: ContactSourceRef[];
    entityId: string | null;
    observations: EvidenceObservation[];
  }>();
  for (const observation of observations) {
    const sourceSet = sourceSetFor(observation.evidence);
    const key = sourceSetKey(sourceSet);
    const existing = grouped.get(key);
    if (existing) {
      existing.observations.push(observation);
    } else {
      grouped.set(key, {
        sourceSet,
        entityId: observation.evidence.source.kind === "entity"
          ? observation.evidence.source.entityId
          : null,
        observations: [observation],
      });
    }
  }
  return [...grouped.entries()].map(([key, group]) => {
    const observations = [...group.observations].sort((a, b) =>
      a.evidence.evidenceId.localeCompare(b.evidence.evidenceId)
    );
    const best = [...observations].sort(compareObservations)[0]!;
    return {
      key,
      sourceSet: group.sourceSet,
      entityId: group.entityId,
      observations,
      access: observations.reduce(
        (value, item) => strongestAccess(value, item.access.currentAccess),
        "none" as CurrentAccess,
      ),
      identity: observations.reduce(
        (value, item) => strongestIdentity(value, item.access.identityKnowledge),
        "unknown" as IdentityKnowledge,
      ),
      perceivedAs: best.access.perceivedAs,
      salience: observations.reduce(
        (value, item) => strongestSalience(value, item.percept.salience),
        "background" as PerceptionSalience,
      ),
    };
  }).sort((a, b) => {
    const salience = SALIENCE_RANK[b.salience] - SALIENCE_RANK[a.salience];
    return salience !== 0 ? salience : a.key.localeCompare(b.key);
  });
}

function coalesceAmbiguousGroups(groups: SourceGroup[]): SourceGroup[] {
  const merged: SourceGroup[] = [];
  const groupIndexByAmbiguity = new Map<string, number>();
  for (const group of groups) {
    const ambiguityKey = ambiguityKeyFor(group);
    const existingIndex = ambiguityKey === null
      ? undefined
      : groupIndexByAmbiguity.get(ambiguityKey);
    const existing = existingIndex === undefined
      ? undefined
      : merged[existingIndex];
    const combinedSources = existing
      ? uniqueSources([...existing.sourceSet, ...group.sourceSet])
      : group.sourceSet;
    if (
      existing &&
      combinedSources.length <= PERCEPTION_LIMITS.maxSourceRefsPerContact
    ) {
      const observations = [...existing.observations, ...group.observations]
        .sort((a, b) =>
          a.evidence.evidenceId.localeCompare(b.evidence.evidenceId)
        );
      const best = [...observations].sort(compareObservations)[0]!;
      existing.key = sourceSetKey(combinedSources);
      existing.sourceSet = combinedSources;
      existing.entityId = null;
      existing.observations = observations;
      existing.access = strongestAccess(existing.access, group.access);
      existing.identity = "unknown";
      existing.perceivedAs = best.access.perceivedAs;
      existing.salience = strongestSalience(existing.salience, group.salience);
      continue;
    }
    const index = merged.push({
      ...group,
      sourceSet: group.sourceSet.map((source) => ({ ...source })),
      observations: [...group.observations],
    }) - 1;
    if (ambiguityKey !== null && existingIndex === undefined) {
      groupIndexByAmbiguity.set(ambiguityKey, index);
    }
  }
  return merged.sort((a, b) => {
    const salience = SALIENCE_RANK[b.salience] - SALIENCE_RANK[a.salience];
    return salience !== 0 ? salience : a.key.localeCompare(b.key);
  });
}

function ambiguityKeyFor(group: SourceGroup): string | null {
  if (
    group.identity !== "unknown" ||
    group.observations.some(({ access }) =>
      access.attributionCertainty !== "unknown"
    )
  ) {
    return null;
  }
  const basisEventIds = [...new Set(group.observations.flatMap(
    ({ evidence }) => evidence.basisEventIds,
  ))].sort();
  if (basisEventIds.length === 0) return null;
  const accessSignatures = [...new Set(group.observations.map(({ access }) =>
    [
      access.currentAccess,
      access.perceivedAs,
      access.direction,
      access.distance,
      access.occurrenceCertainty,
    ].join(":"),
  ))].sort();
  return `${basisEventIds.join(",")}|${accessSignatures.join(",")}`;
}

function uniqueSources(sources: ContactSourceRef[]): ContactSourceRef[] {
  return [...new Map(sources.map((source) => [
    contactSourceKey(source),
    source,
  ])).values()].sort((a, b) =>
    contactSourceKey(a).localeCompare(contactSourceKey(b))
  );
}

function updateMatchedRegistry(
  contacts: ObserverContactRegistryEntry[],
  previous: ObserverContactRegistryEntry | undefined,
  group: SourceGroup,
  identity: IdentityKnowledge,
  identifiedRef: string | null,
  turn: number,
): void {
  if (!previous) return;
  const entry = contacts.find((candidate) =>
    candidate.contactId === previous.contactId
  );
  if (!entry) return;
  entry.currentAccess = group.access;
  entry.identityKnowledge = strongestIdentity(entry.identityKnowledge, identity);
  entry.identifiedRef = entry.identityKnowledge === "identified"
    ? identifiedRef ?? entry.identifiedRef
    : null;
  entry.perceivedAs = group.perceivedAs;
  entry.salience = group.salience;
  entry.lastObservedTurn = turn;
  if (entry.identityKnowledge === "identified") {
    for (let index = contacts.length - 1; index >= 0; index -= 1) {
      const candidate = contacts[index]!;
      if (candidate.contactId === entry.contactId) continue;
      if (
        sameSourceSet(candidate.sourceSet, entry.sourceSet) ||
        (entry.identifiedRef !== null &&
          candidate.identifiedRef === entry.identifiedRef)
      ) {
        contacts.splice(index, 1);
      }
    }
  }
}

function observerSafeAccess(
  input: ObserverPerceptionProjectionInput,
  evidence: PerceptionEvidence,
  access: PerceptionAccess,
): PerceptionAccess {
  return {
    ...access,
    perceivedAs: observerSafeText(
      input,
      evidence,
      access,
      access.perceivedAs,
      "正体不明の存在",
      240,
    ),
  };
}

function observerSafeText(
  input: ObserverPerceptionProjectionInput,
  evidence: PerceptionEvidence,
  access: PerceptionAccess,
  text: string,
  fallback: string,
  maxLength: number,
): string {
  const replacements = new Map<string, string>();
  replacements.set(evidence.evidenceId, "知覚");
  for (const eventId of evidence.basisEventIds) {
    replacements.set(eventId, "出来事");
  }
  if (evidence.source.kind === "event") {
    replacements.set(evidence.source.eventId, "出来事");
  }
  if (evidence.source.kind === "entity") {
    const entity = input.semanticState.entities[evidence.source.entityId];
    const isSelf = evidence.source.entityId ===
      `character.${input.observerSide}`;
    const identityHidden = !isSelf && access.identityKnowledge !== "identified";
    const safeSubject = isSelf
      ? "自分自身"
      : identityHidden
        ? "正体不明の存在"
        : entity?.label ?? "同定した存在";
    replacements.set(evidence.source.entityId, safeSubject);
    if (identityHidden) {
      if (entity?.label) replacements.set(entity.label, safeSubject);
      if (entity?.location.type === "scene") {
        replacements.set(entity.location.area, "どこか");
      }
      if (entity?.location.type === "attached") {
        replacements.set(entity.location.entityId, "何かの近く");
      }
    }
  }
  let safe = text;
  for (const [token, replacement] of [...replacements].sort(
    ([a], [b]) => b.length - a.length,
  )) {
    safe = safe.replaceAll(token, replacement);
  }
  return (safe.trim() || fallback).slice(0, maxLength);
}

function buildSelfSlot(observations: EvidenceObservation[]): PerceptionSlot {
  return {
    subject: { kind: "self" },
    currentAccess: "clear",
    identityKnowledge: "identified",
    perceivedAs: "自分自身",
    percepts: observations.map(({ percept }) => percept),
  };
}

function buildCounterpartSlot(input: {
  observations: EvidenceObservation[];
  identity: IdentityKnowledge;
  label: string;
}): PerceptionSlot {
  const observations = [...input.observations].sort((a, b) =>
    a.evidence.evidenceId.localeCompare(b.evidence.evidenceId)
  );
  const access = observations.reduce(
    (value, item) => strongestAccess(value, item.access.currentAccess),
    "none" as CurrentAccess,
  );
  const best = [...observations].sort(compareObservations)[0];
  return {
    subject: { kind: "counterpart" },
    currentAccess: access,
    identityKnowledge: input.identity,
    perceivedAs: best?.access.perceivedAs ?? (
      input.identity === "identified"
        ? `${input.label}だと知っているが、現在は知覚できない`
        : input.identity === "suspected"
          ? "相手らしい存在を知っているが、現在は判別できない"
          : "知覚できない"
    ),
    percepts: observations.map(({ percept }) => percept),
  };
}

function buildOtherSlots(input: {
  observerSide: BattleSide;
  counterpartSide: BattleSide;
  registry: ObserverContactRegistry;
  contactObservations: Map<string, EvidenceObservation[]>;
  directOthers: Map<string, EvidenceObservation[]>;
  ambientObservations: EvidenceObservation[];
}): PerceptionSlot[] {
  const slots: PerceptionSlot[] = [];
  const directIds = new Set(input.directOthers.keys());
  for (const [entityId, observations] of input.directOthers) {
    const ordered = [...observations].sort((a, b) =>
      a.evidence.evidenceId.localeCompare(b.evidence.evidenceId)
    );
    const best = [...ordered].sort(compareObservations)[0]!;
    slots.push({
      subject: { kind: "identified", perceptionRef: entityId },
      currentAccess: ordered.reduce(
        (value, item) => strongestAccess(value, item.access.currentAccess),
        "none" as CurrentAccess,
      ),
      identityKnowledge: "identified",
      perceivedAs: best.access.perceivedAs,
      percepts: ordered.map(({ percept }) => percept),
    });
  }
  for (const entry of input.registry.contacts) {
    if (
      entry.identifiedRef === `character.${input.observerSide}` ||
      entry.identifiedRef === `character.${input.counterpartSide}` ||
      (entry.identifiedRef !== null && directIds.has(entry.identifiedRef))
    ) {
      continue;
    }
    const observations = input.contactObservations.get(entry.contactId) ?? [];
    const percepts = observations.map(({ percept }) => percept);
    const lostLabel = entry.identityKnowledge === "identified"
      ? `${entry.perceivedAs}（現在は知覚できない）`
      : `${entry.perceivedAs}の気配（現在は知覚できない）`;
    slots.push({
      subject: entry.identityKnowledge === "identified" && entry.identifiedRef
        ? { kind: "identified", perceptionRef: entry.identifiedRef }
        : { kind: "contact", contactId: entry.contactId },
      currentAccess: entry.currentAccess,
      identityKnowledge: entry.identityKnowledge,
      perceivedAs: entry.currentAccess === "none"
        ? boundedLabel(lostLabel)
        : entry.perceivedAs,
      percepts,
    });
  }
  if (input.ambientObservations.length > 0) {
    const observations = [...input.ambientObservations].sort((a, b) =>
      a.evidence.evidenceId.localeCompare(b.evidence.evidenceId)
    );
    const best = [...observations].sort(compareObservations)[0]!;
    const identity = observations.reduce(
      (value, item) => strongestIdentity(value, item.access.identityKnowledge),
      "unknown" as IdentityKnowledge,
    );
    slots.push({
      subject: { kind: "ambient" },
      currentAccess: observations.reduce(
        (value, item) => strongestAccess(value, item.access.currentAccess),
        "none" as CurrentAccess,
      ),
      identityKnowledge: identity === "identified" ? "suspected" : identity,
      perceivedAs: best.access.perceivedAs,
      percepts: observations.map(({ percept }) => percept),
    });
  }
  return slots.sort(compareSlots).slice(0, PERCEPTION_LIMITS.maxOtherSlotsPerFrame);
}

function projectQualitativeChanges(input: {
  observerSide: BattleSide;
  counterpart: PerceptionSlot;
  registry: ObserverContactRegistry;
  sensoryEvidence: readonly PerceptionEvidence[];
  evidence: readonly QuantizedMechanicalEvidence[];
}): QuantizedChange[] {
  const counterpartSide = otherSide(input.observerSide);
  const counterpartKnowledge = sideKnowledge(
    counterpartSide,
    input.observerSide,
    input.counterpart,
    input.registry,
  );
  return input.evidence.flatMap((evidence) => {
    const sensoryAccess = input.sensoryEvidence.some((sensory) =>
      sensory.accessBySide[input.observerSide].currentAccess !== "none" &&
      sensory.basisEventIds.some((eventId) =>
        evidence.basisEventIds.includes(eventId)
      )
    );
    if (
      evidence.target.side !== input.observerSide &&
      evidence.actorSide !== input.observerSide &&
      !sensoryAccess
    ) {
      return [];
    }
    const sourceKnowledge: PerceivedSourceKnowledge = evidence.actorSide === null
      ? "ambient"
      : evidence.actorSide === input.observerSide
        ? "self"
        : counterpartKnowledge;
    const targetKnowledge: PerceivedTargetKnowledge =
      evidence.target.side === input.observerSide
        ? "self"
        : counterpartKnowledge === "ambient"
          ? "unknown"
          : counterpartKnowledge;
    return [{
      ...evidence.change,
      sourceKnowledge,
      targetKnowledge,
    }];
  }).slice(0, PERCEPTION_LIMITS.maxQualitativeChangesPerFrame);
}

function projectReserveCues(
  observerSide: BattleSide,
  evidence: readonly ServerOnlyReserveCue[],
): ResourceReserveCue[] {
  return evidence
    .filter((cue) =>
      cue.side === observerSide &&
      cue.targetEntityId === `character.${observerSide}`
    )
    .map((cue) => ({
      subject: { kind: "self" as const },
      parameterKey: cue.parameterKey,
      absoluteBand: cue.absoluteBand,
      relativeBand: cue.relativeBand,
      certainty: "certain" as const,
    }))
    .slice(0, PERCEPTION_LIMITS.maxReserveCuesPerFrame);
}

function sideKnowledge(
  side: BattleSide,
  observerSide: BattleSide,
  counterpart: PerceptionSlot,
  registry: ObserverContactRegistry,
): PerceivedSourceKnowledge {
  if (side === observerSide) return "self";
  const source = { kind: "entity" as const, entityId: `character.${side}` };
  const contact = registry.contacts.find((entry) =>
    entry.currentAccess !== "none" &&
    entry.identityKnowledge !== "identified" &&
    entry.sourceSet.some((candidate) =>
      contactSourceKey(candidate) === contactSourceKey(source)
    )
  );
  if (contact) return "contact";
  return counterpart.currentAccess !== "none" &&
      counterpart.identityKnowledge === "identified"
    ? "identified"
    : "unknown";
}

function perceptionDiff(
  previous: CharacterPerceptionFrame | undefined,
  revision: number,
  slots: PerceptionSlot[],
) {
  const before = new Map(
    framePercepts(previous).map((percept) => [percept.perceptId, percept]),
  );
  const after = framePerceptsFromSlots(slots);
  const afterIds = new Set(after.map((percept) => percept.perceptId));
  return {
    fromRevision: previous?.revision ?? revision,
    toRevision: revision,
    addedOrUpdatedPerceptIds: after
      .filter((percept) =>
        JSON.stringify(before.get(percept.perceptId)) !== JSON.stringify(percept)
      )
      .map((percept) => percept.perceptId),
    removedPerceptIds: [...before.keys()].filter((id) => !afterIds.has(id)),
  };
}

function framePercepts(frame: CharacterPerceptionFrame | undefined): Percept[] {
  return frame
    ? framePerceptsFromSlots([frame.self, frame.counterpart, ...frame.others])
    : [];
}

function framePerceptsFromSlots(slots: PerceptionSlot[]): Percept[] {
  return slots.flatMap((slot) => slot.percepts);
}

function sourceSetFor(evidence: PerceptionEvidence): ContactSourceRef[] {
  if (evidence.source.kind === "entity") {
    return [{ kind: "entity", entityId: evidence.source.entityId }];
  }
  if (evidence.source.kind === "event") {
    return [{ kind: "event", eventId: evidence.source.eventId }];
  }
  return [{ kind: "evidence", evidenceId: evidence.evidenceId }];
}

function normalizeRegistry(
  side: BattleSide,
  registry: ObserverContactRegistry | undefined,
): ObserverContactRegistry {
  return registrySchema(side).parse(registry ?? {
    schemaVersion: 1,
    observerSide: side,
    nextContactSequence: 1,
    contacts: [],
  });
}

function frameSchema(side: BattleSide) {
  return side === "a"
    ? CharacterPerceptionFrameASchema
    : CharacterPerceptionFrameBSchema;
}

function registrySchema(side: BattleSide) {
  return side === "a"
    ? ObserverContactRegistryASchema
    : ObserverContactRegistryBSchema;
}

function chooseEviction(
  contacts: ObserverContactRegistryEntry[],
  reservedContactIds: Set<string>,
): number | null {
  const candidates = contacts
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) =>
      entry.currentAccess === "none" &&
      entry.identityKnowledge !== "identified" &&
      !reservedContactIds.has(entry.contactId)
    )
    .sort((a, b) => {
      const salience = SALIENCE_RANK[a.entry.salience] -
        SALIENCE_RANK[b.entry.salience];
      if (salience !== 0) return salience;
      const turn = a.entry.lastObservedTurn - b.entry.lastObservedTurn;
      return turn !== 0
        ? turn
        : contactSequence(a.entry.contactId) - contactSequence(b.entry.contactId);
    });
  return candidates[0]?.index ?? null;
}

function compareObservations(
  a: EvidenceObservation,
  b: EvidenceObservation,
): number {
  const access = ACCESS_RANK[b.access.currentAccess] -
    ACCESS_RANK[a.access.currentAccess];
  if (access !== 0) return access;
  const identity = IDENTITY_RANK[b.access.identityKnowledge] -
    IDENTITY_RANK[a.access.identityKnowledge];
  if (identity !== 0) return identity;
  const salience = SALIENCE_RANK[b.percept.salience] -
    SALIENCE_RANK[a.percept.salience];
  return salience !== 0
    ? salience
    : a.evidence.evidenceId.localeCompare(b.evidence.evidenceId);
}

function compareSlots(a: PerceptionSlot, b: PerceptionSlot): number {
  const access = ACCESS_RANK[b.currentAccess] - ACCESS_RANK[a.currentAccess];
  if (access !== 0) return access;
  const identity = IDENTITY_RANK[b.identityKnowledge] -
    IDENTITY_RANK[a.identityKnowledge];
  if (identity !== 0) return identity;
  const salience = Math.max(
    -1,
    ...b.percepts.map((percept) => SALIENCE_RANK[percept.salience]),
  ) - Math.max(
    -1,
    ...a.percepts.map((percept) => SALIENCE_RANK[percept.salience]),
  );
  return salience !== 0
    ? salience
    : slotKey(a).localeCompare(slotKey(b));
}

function slotKey(slot: PerceptionSlot): string {
  switch (slot.subject.kind) {
    case "identified":
      return `identified:${slot.subject.perceptionRef}`;
    case "contact":
      return `contact:${slot.subject.contactId}`;
    default:
      return slot.subject.kind;
  }
}

function sameSourceSet(
  a: readonly ContactSourceRef[],
  b: readonly ContactSourceRef[],
): boolean {
  return sourceSetKey(a) === sourceSetKey(b);
}

function sourceSetKey(sourceSet: readonly ContactSourceRef[]): string {
  return sourceSet.map(contactSourceKey).sort().join("|");
}

function contactSourceKey(source: ContactSourceRef): string {
  if (source.kind === "entity") return `entity:${source.entityId}`;
  if (source.kind === "event") return `event:${source.eventId}`;
  return `evidence:${source.evidenceId}`;
}

function contactSequence(contactId: string): number {
  return Number(contactId.split(".").at(-1) ?? 0);
}

function observerPerceptId(side: BattleSide, evidenceId: string): string {
  let hash = 14_695_981_039_346_656_037n;
  for (let index = 0; index < evidenceId.length; index += 1) {
    hash ^= BigInt(evidenceId.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
  }
  return `percept.${side}.${hash.toString(36)}`;
}

function strongestAccess(a: CurrentAccess, b: CurrentAccess): CurrentAccess {
  return ACCESS_RANK[a] >= ACCESS_RANK[b] ? a : b;
}

function strongestIdentity(
  a: IdentityKnowledge,
  b: IdentityKnowledge,
): IdentityKnowledge {
  return IDENTITY_RANK[a] >= IDENTITY_RANK[b] ? a : b;
}

function strongestSalience(
  a: PerceptionSalience,
  b: PerceptionSalience,
): PerceptionSalience {
  return SALIENCE_RANK[a] >= SALIENCE_RANK[b] ? a : b;
}

function otherSide(side: BattleSide): BattleSide {
  return side === "a" ? "b" : "a";
}

function boundedLabel(label: string): string {
  return label.slice(0, 240);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
