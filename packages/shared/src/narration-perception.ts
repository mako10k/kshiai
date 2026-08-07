import type { NarrativeBlock } from "./narrative.js";
import type { TurnEvent } from "./battle.js";
import type { BattlefieldInstance } from "./battlefield.js";
import type { BattleSceneStateFact } from "./battle-world.js";
import type {
  BattleSemanticEntity,
  BattleSemanticState,
  SemanticObservationState,
} from "./semantic-state.js";
import type {
  BattleSide,
  CharacterPerceptionFrame,
  NarrationControlReference,
  NarrationPerceptionView,
  NarrationReferenceRelation,
  ObserverContactRegistry,
  PerceptionSlot,
} from "./perception.js";
import { NarrationPerceptionViewSchema } from "./perception.js";
import type {
  NarrationFocus,
  NarrationPerspective,
} from "./narration-perspective.js";
import type { NarrationCausalProjection } from "./battle-turn-causal-receipt.js";
import {
  selectNarratorRenderingProfileAnchors,
  type NarratorRenderingProfileAnchor,
  type NarratorRenderingProfileAnchors,
} from "./profile-grounding.js";
import {
  selectNarratorContinuityForFocus,
  type BattleNarratorContinuity,
  type NarratorContinuityView,
  type NarratorRecognitionSubject,
} from "./battle-social.js";

export type NarrationPerceptionProjectionInput = {
  perspective: NarrationPerspective;
  focus: NarrationFocus;
  sideALabel: string;
  sideBLabel: string;
  frameA: CharacterPerceptionFrame;
  frameB: CharacterPerceptionFrame;
  semanticState: BattleSemanticState;
  publicObservation: SemanticObservationState;
};

export type NarrationIdentifierCatalogInput = {
  perspective: NarrationPerspective;
  focus: NarrationFocus;
  sideALabel: string;
  sideBLabel: string;
  semanticState?: BattleSemanticState;
  publicObservation?: SemanticObservationState;
  frameA?: CharacterPerceptionFrame;
  frameB?: CharacterPerceptionFrame;
  registryA?: ObserverContactRegistry;
  registryB?: ObserverContactRegistry;
  view?: NarrationPerceptionView;
};

type ResolvedNarrationMode =
  | "self"
  | "opponent"
  | "omniscient"
  | "external";

function resolvedMode(
  perspective: NarrationPerspective,
  focus: NarrationFocus,
): { mode: ResolvedNarrationMode; resolvedFromFluid: boolean } {
  if (perspective !== "fluid") {
    return {
      mode: perspective === "foe" ? "opponent" : perspective,
      resolvedFromFluid: false,
    };
  }
  return {
    mode: focus === "foe"
      ? "opponent"
      : focus === "both"
        ? "omniscient"
        : focus,
    resolvedFromFluid: true,
  };
}

function genericEntityLabel(entity: BattleSemanticEntity): string {
  switch (entity.kind) {
    case "character":
      return "人物";
    case "object":
      return "物体";
    case "terrain":
      return "地形";
    case "effect":
      return "現象";
    case "other":
      return "存在";
  }
}

function safeLabel(
  controlId: string,
  candidate: string | null | undefined,
  fallback: string,
): string {
  const label = candidate?.trim() || fallback;
  return label === controlId || label.includes(controlId) ? fallback : label;
}

function opaqueReaderSubjectRef(entityId: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const character of entityId) {
    const code = character.codePointAt(0) ?? 0;
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `reader.${(first >>> 0).toString(16).padStart(8, "0")}${
    (second >>> 0).toString(16).padStart(8, "0")
  }`;
}

function entityRelation(
  entityId: string,
  entity: BattleSemanticEntity,
): NarrationReferenceRelation {
  if (entityId === "character.a") return "self";
  if (entityId === "character.b") return "opponent";
  return entity.kind === "character" ? "other" : "environment";
}

function addControlReference(
  references: Map<string, NarrationControlReference>,
  reference: NarrationControlReference,
): void {
  if (!references.has(reference.controlId)) {
    references.set(reference.controlId, reference);
  }
}

function relationForSlot(
  slot: PerceptionSlot,
  fallback: NarrationReferenceRelation,
): NarrationReferenceRelation {
  switch (slot.subject.kind) {
    case "self":
      return "self";
    case "counterpart":
      return "opponent";
    case "identified":
      return "other";
    case "contact":
      return "contact";
    case "ambient":
      return "environment";
    default:
      return fallback;
  }
}

function frameReferences(input: {
  frame: CharacterPerceptionFrame;
  viewpointSubject: "self" | "opponent";
  viewpointLabel: string;
  counterpartControlId: "self" | "opponent";
  counterpartLabel: string;
}): NarrationControlReference[] {
  const references = new Map<string, NarrationControlReference>();
  addControlReference(references, {
    controlId: input.viewpointSubject,
    renderLabel: safeLabel(
      input.viewpointSubject,
      input.viewpointLabel,
      input.viewpointSubject === "self" ? "自分自身" : "相手側の人物",
    ),
    relation: "self",
  });
  addControlReference(references, {
    controlId: input.counterpartControlId,
    renderLabel: safeLabel(
      input.counterpartControlId,
      input.counterpartLabel,
      "知覚できない相手",
    ),
    relation: "opponent",
  });

  const slots = [
    input.frame.self,
    input.frame.counterpart,
    ...input.frame.others,
  ];
  for (const slot of slots) {
    const relation = relationForSlot(slot, "other");
    if (slot.subject.kind === "identified") {
      addControlReference(references, {
        controlId: slot.subject.perceptionRef,
        renderLabel: safeLabel(
          slot.subject.perceptionRef,
          slot.perceivedAs,
          "判別できる存在",
        ),
        relation,
      });
    } else if (slot.subject.kind === "contact") {
      addControlReference(references, {
        controlId: slot.subject.contactId,
        renderLabel: safeLabel(
          slot.subject.contactId,
          slot.perceivedAs,
          "正体不明の気配",
        ),
        relation: "contact",
      });
    }
    for (const percept of slot.percepts) {
      addControlReference(references, {
        controlId: percept.perceptId,
        renderLabel: safeLabel(
          percept.perceptId,
          percept.phenomenon,
          "感じ取った現象",
        ),
        relation,
      });
    }
  }
  for (const perceptId of input.frame.latestDiff.removedPerceptIds) {
    addControlReference(references, {
      controlId: perceptId,
      renderLabel: "消えた知覚",
      relation: "other",
    });
  }
  return [...references.values()];
}

function omniscientReferences(input: {
  semanticState: BattleSemanticState;
  sideALabel: string;
  sideBLabel: string;
}): NarrationControlReference[] {
  return Object.entries(input.semanticState.entities).map(([controlId, entity]) => ({
    controlId,
    renderLabel: safeLabel(
      controlId,
      controlId === "character.a"
        ? input.sideALabel
        : controlId === "character.b"
          ? input.sideBLabel
          : entity.label,
      genericEntityLabel(entity),
    ),
    relation: entityRelation(controlId, entity),
  }));
}

function externalReferences(input: {
  publicObservation: SemanticObservationState;
  sideALabel: string;
  sideBLabel: string;
}): Array<{
  subjectRef: string;
  renderLabel: string;
  relation: NarrationReferenceRelation;
}> {
  return Object.entries(input.publicObservation.snapshot.entities).flatMap(
    ([entityId, entity]) => {
      const renderLabel = safeLabel(
        entityId,
        entityId === "character.a"
          ? input.sideALabel
          : entityId === "character.b"
            ? input.sideBLabel
            : entity.label,
        genericEntityLabel(entity),
      );
      const relation = entityRelation(entityId, entity);
      return [{
        subjectRef: opaqueReaderSubjectRef(entityId),
        renderLabel,
        relation,
      }];
    },
  );
}

/** Derive the narrator's information view without performing another LLM call. */
export function buildNarrationPerceptionView(
  input: NarrationPerceptionProjectionInput,
): NarrationPerceptionView {
  const resolved = resolvedMode(input.perspective, input.focus);
  if (resolved.mode === "self") {
    return NarrationPerceptionViewSchema.parse({
      schemaVersion: 1,
      mode: "self",
      viewpointSide: "a",
      viewpointSubject: "self",
      resolvedFromFluid: resolved.resolvedFromFluid,
      frame: input.frameA,
      references: frameReferences({
        frame: input.frameA,
        viewpointSubject: "self",
        viewpointLabel: input.sideALabel,
        counterpartControlId: "opponent",
        counterpartLabel: counterpartRenderLabel(
          input.frameA.counterpart,
          input.sideBLabel,
        ),
      }),
    });
  }
  if (resolved.mode === "opponent") {
    return NarrationPerceptionViewSchema.parse({
      schemaVersion: 1,
      mode: "opponent",
      viewpointSide: "b",
      viewpointSubject: "opponent",
      resolvedFromFluid: resolved.resolvedFromFluid,
      frame: input.frameB,
      references: frameReferences({
        frame: input.frameB,
        viewpointSubject: "opponent",
        viewpointLabel: input.sideBLabel,
        counterpartControlId: "self",
        counterpartLabel: counterpartRenderLabel(
          input.frameB.counterpart,
          input.sideALabel,
        ),
      }),
    });
  }
  if (resolved.mode === "omniscient") {
    return NarrationPerceptionViewSchema.parse({
      schemaVersion: 1,
      mode: "omniscient",
      viewpointSide: null,
      resolvedFromFluid: resolved.resolvedFromFluid,
      references: omniscientReferences(input),
    });
  }
  return NarrationPerceptionViewSchema.parse({
    schemaVersion: 1,
    mode: "external",
    viewpointSide: null,
    resolvedFromFluid: resolved.resolvedFromFluid,
    references: externalReferences(input),
  });
}

/** Stable, view-owned subjects that the existing narrator call may recognize. */
export function narratorRecognitionSubjects(
  view: NarrationPerceptionView,
): NarratorRecognitionSubject[] {
  if (view.mode === "external") {
    return view.references.flatMap((reference) =>
      reference.subjectRef
        ? [{
            subjectRef: reference.subjectRef,
            perceivedAs: reference.renderLabel,
            relation: reference.relation,
            identityKnowledge: "identified" as const,
            continuity: "same_entity" as const,
          }]
        : []
    ).slice(0, 16);
  }
  if (view.mode === "omniscient") {
    return view.references.map((reference) => ({
      subjectRef: reference.controlId,
      perceivedAs: reference.renderLabel,
      relation: reference.relation,
      identityKnowledge: "identified",
      continuity: "same_entity",
    }));
  }
  const referenceById = new Map(
    view.references.map((reference) => [reference.controlId, reference]),
  );
  const counterpartRef = view.mode === "self" ? "opponent" : "self";
  const selfRef = view.mode === "self" ? "self" : "opponent";
  const subjects: NarratorRecognitionSubject[] = [];
  const push = (subject: NarratorRecognitionSubject) => {
    if (!subjects.some((candidate) => candidate.subjectRef === subject.subjectRef)) {
      subjects.push(subject);
    }
  };
  const selfReference = referenceById.get(selfRef);
  if (selfReference) {
    push({
      subjectRef: selfRef,
      perceivedAs: selfReference.renderLabel,
      relation: "self",
      identityKnowledge: "identified",
      continuity: "same_entity",
    });
  }
  const counterpartReference = referenceById.get(counterpartRef);
  if (counterpartReference) {
    push({
      subjectRef: counterpartRef,
      perceivedAs: counterpartReference.renderLabel,
      relation: "opponent",
      identityKnowledge: view.frame.counterpart.identityKnowledge,
      continuity: view.frame.counterpart.apparentIdentity?.continuity ??
        (view.frame.counterpart.identityKnowledge === "identified"
          ? "same_entity"
          : "possibly_same_entity"),
    });
  }
  for (const slot of view.frame.others) {
    if (slot.subject.kind === "identified") {
      push({
        subjectRef: slot.subject.perceptionRef,
        perceivedAs: slot.perceivedAs,
        relation: "other",
        identityKnowledge: "identified",
        continuity: slot.apparentIdentity?.continuity ?? "same_entity",
      });
    } else if (slot.subject.kind === "contact") {
      push({
        subjectRef: slot.subject.contactId,
        perceivedAs: slot.perceivedAs,
        relation: "contact",
        identityKnowledge: slot.identityKnowledge,
        continuity: slot.apparentIdentity?.continuity ?? "possibly_same_entity",
      });
    }
  }
  return subjects.slice(0, 16);
}

function counterpartRenderLabel(
  slot: CharacterPerceptionFrame["counterpart"],
  canonicalLabel: string,
): string {
  const apparent = slot.apparentIdentity;
  if (
    slot.currentAccess !== "none" &&
    apparent &&
    apparent.continuity !== "same_entity"
  ) {
    return apparent.identity ?? apparent.form;
  }
  if (slot.identityKnowledge === "identified") return canonicalLabel;
  return apparent?.identity ?? slot.perceivedAs;
}

function registryLabelForEntity(
  registry: ObserverContactRegistry | undefined,
  entityId: string,
): string | null {
  const match = registry?.contacts.find((entry) =>
    entry.sourceSet.some((source) =>
      source.kind === "entity" && source.entityId === entityId
    )
  );
  return match?.perceivedAs ?? null;
}

function identifiedSlotLabel(
  frame: CharacterPerceptionFrame | undefined,
  entityId: string,
): string | null {
  const slot = frame?.others.find((candidate) =>
    candidate.subject.kind === "identified" &&
    candidate.subject.perceptionRef === entityId
  );
  return slot?.perceivedAs ?? null;
}

function characterLimitedCanonicalLabel(input: {
  entityId: string;
  entity: BattleSemanticEntity;
  viewpointSide: BattleSide;
  sideALabel: string;
  sideBLabel: string;
  frame?: CharacterPerceptionFrame;
  registry?: ObserverContactRegistry;
}): string {
  const ownId = `character.${input.viewpointSide}`;
  const counterpartId = input.viewpointSide === "a"
    ? "character.b"
    : "character.a";
  if (input.entityId === ownId) {
    return input.viewpointSide === "a" ? input.sideALabel : input.sideBLabel;
  }
  if (input.entityId === counterpartId) {
    const canonicalLabel = input.viewpointSide === "a"
      ? input.sideBLabel
      : input.sideALabel;
    return input.frame
      ? counterpartRenderLabel(input.frame.counterpart, canonicalLabel)
      : "知覚できない相手";
  }
  return identifiedSlotLabel(input.frame, input.entityId) ??
    registryLabelForEntity(input.registry, input.entityId) ??
    (input.entity.kind === "character" ? "判別できない人物" : "知覚できない存在");
}

/**
 * Server-only repair catalog. It may contain IDs intentionally omitted from the
 * narrator view, but maps those IDs only to labels safe for the selected view.
 */
export function buildNarrationIdentifierCatalog(
  input: NarrationIdentifierCatalogInput,
): NarrationControlReference[] {
  const resolved = resolvedMode(input.perspective, input.focus);
  const references = new Map<string, NarrationControlReference>();
  if (input.view && input.view.mode !== "external") {
    for (const reference of input.view.references) {
      addControlReference(references, reference);
    }
  }

  const frame = resolved.mode === "self"
    ? input.frameA
    : resolved.mode === "opponent"
      ? input.frameB
      : undefined;
  const registry = resolved.mode === "self"
    ? input.registryA
    : resolved.mode === "opponent"
      ? input.registryB
      : undefined;
  const viewpointSide = resolved.mode === "self"
    ? "a"
    : resolved.mode === "opponent"
      ? "b"
      : null;

  for (const [entityId, entity] of Object.entries(input.semanticState?.entities ?? {})) {
    const candidate = resolved.mode === "omniscient"
      ? entityId === "character.a"
        ? input.sideALabel
        : entityId === "character.b"
          ? input.sideBLabel
          : entity.label
      : viewpointSide
        ? characterLimitedCanonicalLabel({
            entityId,
            entity,
            viewpointSide,
            sideALabel: input.sideALabel,
            sideBLabel: input.sideBLabel,
            frame,
            registry,
          })
        : input.publicObservation?.snapshot.entities[entityId]
          ? entityId === "character.a"
            ? input.sideALabel
            : entityId === "character.b"
              ? input.sideBLabel
              : input.publicObservation.snapshot.entities[entityId]!.label
          : "知覚できない存在";
    addControlReference(references, {
      controlId: entityId,
      renderLabel: safeLabel(entityId, candidate, genericEntityLabel(entity)),
      relation: entityRelation(entityId, entity),
    });
  }

  const registries = resolved.mode === "omniscient"
    ? [input.registryA, input.registryB]
    : resolved.mode === "external"
      ? [input.registryA, input.registryB]
      : [registry];
  for (const sourceRegistry of registries) {
    for (const contact of sourceRegistry?.contacts ?? []) {
      addControlReference(references, {
        controlId: contact.contactId,
        renderLabel: resolved.mode === "external"
          ? "正体不明の気配"
          : safeLabel(contact.contactId, contact.perceivedAs, "正体不明の気配"),
        relation: "contact",
      });
    }
  }
  return [...references.values()];
}

/** Replace literal control-ID occurrences with their safe render labels. */
export function repairNarrationIdentifierText(
  text: string,
  catalog: readonly NarrationControlReference[],
): string {
  let repaired = text;
  for (const reference of [...catalog].sort(
    (a, b) => b.controlId.length - a.controlId.length,
  )) {
    if (reference.controlId === reference.renderLabel) continue;
    repaired = repaired.replaceAll(reference.controlId, reference.renderLabel);
  }
  return repaired;
}

/** Repair both narrator paragraphs and dialogue, including speaker fields. */
export function repairNarrativeBlockIdentifiers(
  block: NarrativeBlock,
  catalog: readonly NarrationControlReference[],
): NarrativeBlock {
  return {
    ...block,
    narrator: block.narrator.map((line) =>
      repairNarrationIdentifierText(line, catalog)
    ),
    speeches: block.speeches.map((speech) => ({
      ...speech,
      speaker: repairNarrationIdentifierText(speech.speaker, catalog),
      text: repairNarrationIdentifierText(speech.text, catalog),
    })),
  };
}

export type NarrationTurnSourceActionBeat = {
  actionId: string;
  actorSide: BattleSide;
  actorName: string;
  actionName: string;
  description: string;
  outcomes: string[];
};

export type NarrationTurnViewActionBeat = {
  actorLabel: string;
  actionName: string;
  description: string;
  outcomes: string[];
};

/** Complete, ephemeral input boundary for the existing narrator call. */
export type NarrationTurnView = {
  schemaVersion: 1;
  turn: number;
  scene: string;
  perception: NarrationPerceptionView;
  participantLabels: {
    a: string;
    b: string;
  };
  /** Presentation-only constraints selected for this narrator perspective. */
  profileAnchors: NarratorRenderingProfileAnchors;
  /** ID-free current object placements derived from canonical world state. */
  sceneStateFacts: BattleSceneStateFact[];
  /** Bounded display continuity; never a source of character cognition. */
  continuity: NarratorContinuityView | null;
  /** Stable subjects whose narrator-only recognition may be updated in this call. */
  recognitionSubjects: NarratorRecognitionSubject[];
  events: Array<{ summary: string }>;
  actionBeats: NarrationTurnViewActionBeat[];
  /** Present only for the guarded causal-narration consumer. */
  causalProjection?: NarrationCausalProjection;
  battlefield: {
    displayName: string;
    terrain?: string;
    obstacles: string[];
  } | null;
};

export type NarrationTurnViewInput = {
  turn: number;
  scene: string;
  perspective: NarrationPerspective;
  focus: NarrationFocus;
  sideALabel: string;
  sideBLabel: string;
  profileAnchorA: NarratorRenderingProfileAnchor;
  profileAnchorB: NarratorRenderingProfileAnchor;
  sceneStateFacts?: readonly BattleSceneStateFact[];
  perception: NarrationPerceptionView;
  semanticState: BattleSemanticState;
  publicObservation: SemanticObservationState;
  frameA: CharacterPerceptionFrame;
  frameB: CharacterPerceptionFrame;
  registryA?: ObserverContactRegistry;
  registryB?: ObserverContactRegistry;
  events: readonly TurnEvent[];
  actionBeats: readonly NarrationTurnSourceActionBeat[];
  causalProjection?: NarrationCausalProjection;
  battlefield?: BattlefieldInstance | null;
  narratorContinuity?: BattleNarratorContinuity | null;
};

function controlLabel(
  view: NarrationPerceptionView,
  controlId: string,
): string | null {
  if (view.mode === "external") return null;
  return view.references.find((reference) =>
    reference.controlId === controlId
  )?.renderLabel ?? null;
}

/** Resolve public speaker labels from the selected view, never canonical IDs. */
export function narrationParticipantLabels(
  view: NarrationPerceptionView,
): { a: string; b: string } {
  if (view.mode === "self" || view.mode === "opponent") {
    return {
      a: controlLabel(view, "self") ?? "自分側の人物",
      b: controlLabel(view, "opponent") ?? "相手側の人物",
    };
  }
  if (view.mode === "omniscient") {
    return {
      a: controlLabel(view, "character.a") ?? "一方の人物",
      b: controlLabel(view, "character.b") ?? "もう一方の人物",
    };
  }
  return {
    a: view.references.find((reference) => reference.relation === "self")
      ?.renderLabel ?? "一方の人物",
    b: view.references.find((reference) => reference.relation === "opponent")
      ?.renderLabel ?? "もう一方の人物",
  };
}

function sanitizeNarrationSourceText(input: {
  text: string;
  source: NarrationTurnViewInput;
  catalog: readonly NarrationControlReference[];
  participants: { a: string; b: string };
}): string {
  let safe = repairNarrationIdentifierText(input.text, input.catalog);
  const replacements = new Map<string, string>([
    [input.source.sideALabel, input.participants.a],
    [input.source.sideBLabel, input.participants.b],
  ]);
  const labelById = new Map(
    input.catalog.map((reference) => [
      reference.controlId,
      reference.renderLabel,
    ]),
  );
  for (const [entityId, entity] of Object.entries(
    input.source.semanticState.entities,
  )) {
    const replacement = labelById.get(entityId);
    if (replacement) replacements.set(entity.label, replacement);
  }
  for (const [token, replacement] of [...replacements].sort(
    ([a], [b]) => b.length - a.length,
  )) {
    if (!token || token === replacement) continue;
    safe = safe.replaceAll(token, replacement);
  }
  return safe;
}

function characterPerceptEvents(
  frame: CharacterPerceptionFrame,
): Array<{ summary: string }> {
  const seen = new Set<string>();
  return [frame.self, frame.counterpart, ...frame.others].flatMap((slot) =>
    slot.percepts.flatMap((percept) => {
      const summary = percept.phenomenon.trim();
      if (!summary || seen.has(summary)) return [];
      seen.add(summary);
      return [{ summary }];
    })
  );
}

function deepFreezeNarrationView<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreezeNarrationView(child);
  }
  return value;
}

/**
 * Build the narrator's sole world/event input. Character-limited modes receive
 * only their own action descriptions plus their frozen perceived phenomena.
 */
export function buildNarrationTurnView(
  input: NarrationTurnViewInput,
): NarrationTurnView {
  const participants = narrationParticipantLabels(input.perception);
  const catalog = buildNarrationIdentifierCatalog({
    perspective: input.perspective,
    focus: input.focus,
    sideALabel: input.sideALabel,
    sideBLabel: input.sideBLabel,
    semanticState: input.semanticState,
    publicObservation: input.publicObservation,
    frameA: input.frameA,
    frameB: input.frameB,
    registryA: input.registryA,
    registryB: input.registryB,
    view: input.perception,
  });
  const sanitize = (text: string) => sanitizeNarrationSourceText({
    text,
    source: input,
    catalog,
    participants,
  });
  const characterSide = input.perception.mode === "self"
    ? "a"
    : input.perception.mode === "opponent"
      ? "b"
      : null;
  const frame = characterSide === "a"
    ? input.frameA
    : characterSide === "b"
      ? input.frameB
      : null;
  const actionBeats = input.actionBeats
    .filter((beat) => characterSide === null || beat.actorSide === characterSide)
    .map((beat) => ({
      actorLabel: participants[beat.actorSide],
      actionName: sanitize(beat.actionName),
      description: sanitize(beat.description),
      outcomes: characterSide === null
        ? beat.outcomes.map(sanitize)
        : [],
    }));
  return deepFreezeNarrationView(structuredClone({
    schemaVersion: 1,
    turn: input.turn,
    scene: sanitize(input.scene),
    perception: input.perception,
    participantLabels: participants,
    profileAnchors: selectNarratorRenderingProfileAnchors({
      mode: input.perception.mode,
      sideA: input.profileAnchorA,
      sideB: input.profileAnchorB,
    }),
    sceneStateFacts: input.sceneStateFacts?.map((fact) => ({
      itemLabel: sanitize(fact.itemLabel),
      statement: sanitize(fact.statement),
    })) ?? [],
    continuity: input.narratorContinuity
      ? selectNarratorContinuityForFocus({
          continuity: input.narratorContinuity,
          focus: input.focus,
        })
      : null,
    recognitionSubjects: narratorRecognitionSubjects(input.perception),
    events: frame
      ? characterPerceptEvents(frame)
      : input.events.map((event) => ({ summary: sanitize(event.summary) })),
    actionBeats,
    ...(input.causalProjection
      ? { causalProjection: input.causalProjection }
      : {}),
    battlefield: frame || !input.battlefield
      ? null
      : {
          displayName: sanitize(input.battlefield.displayName),
          ...(input.battlefield.terrain
            ? { terrain: sanitize(input.battlefield.terrain) }
            : {}),
          obstacles: (input.battlefield.obstacles ?? []).slice(0, 4).map(sanitize),
        },
  }));
}
