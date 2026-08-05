import { z } from "zod";
import type { CharacterSheet } from "./character.js";
import type { CharacterAgentState } from "./battle.js";
import {
  CurrentAccessSchema,
  IdentityKnowledgeSchema,
  type CharacterPerceptionFrame,
} from "./perception.js";

export const NarratorRecognitionContinuitySchema = z.enum([
  "same_entity",
  "possibly_same_entity",
  "unlinked",
]);
export type NarratorRecognitionContinuity = z.infer<
  typeof NarratorRecognitionContinuitySchema
>;

export const NarratorRecognitionUpdateSchema = z.object({
  subjectRef: z.string().min(1).max(160),
  recognizedAs: z.string().min(1).max(120),
  identityKnowledge: IdentityKnowledgeSchema,
  continuity: NarratorRecognitionContinuitySchema,
}).strict();
export type NarratorRecognitionUpdate = z.infer<
  typeof NarratorRecognitionUpdateSchema
>;

export const NarratorRecognitionSchema = NarratorRecognitionUpdateSchema.extend({
  lastConfirmedTurn: z.number().int().nonnegative(),
}).strict();
export type NarratorRecognition = z.infer<typeof NarratorRecognitionSchema>;

export const NarratorRecognitionSubjectSchema = z.object({
  subjectRef: z.string().min(1).max(160),
  perceivedAs: z.string().min(1).max(240),
  relation: z.enum(["self", "opponent", "other", "contact", "environment"]),
  identityKnowledge: IdentityKnowledgeSchema,
  continuity: NarratorRecognitionContinuitySchema,
}).strict();
export type NarratorRecognitionSubject = z.infer<
  typeof NarratorRecognitionSubjectSchema
>;

export const BattleParticipantReferenceSchema = z.object({
  officialDisplayName: z.string().min(1),
  battleLabel: z.string().min(1).max(40),
}).strict();
export type BattleParticipantReference = z.infer<
  typeof BattleParticipantReferenceSchema
>;

export const BattleSocialViewSchema = z.object({
  observerSide: z.enum(["a", "b"]),
  counterpartSide: z.enum(["a", "b"]),
  relationshipLabel: z.string().min(1).max(120),
  counterpartAddress: z.string().min(1).max(40),
  selfReference: z.string().min(1).max(40).nullable(),
  initialIdentityKnowledge: IdentityKnowledgeSchema,
}).strict().superRefine((view, ctx) => {
  if (view.observerSide === view.counterpartSide) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["counterpartSide"],
      message: "counterpartSide must differ from observerSide",
    });
  }
});
export type BattleSocialView = z.infer<typeof BattleSocialViewSchema>;

export const BattleEncounterContextSchema = z.object({
  schemaVersion: z.literal(1),
  participants: z.object({
    a: BattleParticipantReferenceSchema,
    b: BattleParticipantReferenceSchema,
  }).strict(),
  social: z.object({
    a: BattleSocialViewSchema,
    b: BattleSocialViewSchema,
  }).strict(),
  openingSummary: z.string().max(400),
}).strict().superRefine((context, ctx) => {
  const normalizedLabelA = context.participants.a.battleLabel
    .normalize("NFKC")
    .toLocaleLowerCase("ja");
  const normalizedLabelB = context.participants.b.battleLabel
    .normalize("NFKC")
    .toLocaleLowerCase("ja");
  if (
    normalizedLabelA === normalizedLabelB
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["participants", "b", "battleLabel"],
      message: "battle labels must be unique",
    });
  }
  if (
    context.social.a.observerSide !== "a" ||
    context.social.a.counterpartSide !== "b"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["social", "a"],
      message: "social.a must describe A observing B",
    });
  }
  if (
    context.social.b.observerSide !== "b" ||
    context.social.b.counterpartSide !== "a"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["social", "b"],
      message: "social.b must describe B observing A",
    });
  }
});
export type BattleEncounterContext = z.infer<
  typeof BattleEncounterContextSchema
>;

export type BattleEncounterProposal = {
  participants?: {
    a?: { battleLabel?: string };
    b?: { battleLabel?: string };
  };
  social?: {
    a?: {
      relationshipLabel?: string;
      counterpartAddress?: string;
      selfReference?: string | null;
    };
    b?: {
      relationshipLabel?: string;
      counterpartAddress?: string;
      selfReference?: string | null;
    };
  };
  openingSummary?: string;
};

function boundedText(
  candidate: unknown,
  fallback: string,
  maximum: number,
): string {
  if (typeof candidate !== "string") return fallback;
  const normalized = candidate.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, maximum) : fallback;
}

function defaultBattleLabel(sheet: CharacterSheet): string {
  return boundedText(
    sheet.identity?.nicknames[0] ?? sheet.displayName,
    sheet.displayName,
    24,
  );
}

function distinctBattleLabels(a: string, b: string): [string, string] {
  const normalizedA = a.normalize("NFKC").toLocaleLowerCase("ja");
  const normalizedB = b.normalize("NFKC").toLocaleLowerCase("ja");
  if (normalizedA !== normalizedB) return [a, b];
  return [
    boundedText(`${a}（A）`, "Side A", 40),
    boundedText(`${b}（B）`, "Side B", 40),
  ];
}

function permittedSelfReference(
  sheet: CharacterSheet,
  candidate: unknown,
): string | null {
  const permitted = sheet.identity?.selfNames ?? [];
  if (typeof candidate === "string") {
    const normalized = candidate.trim();
    if (permitted.includes(normalized)) return normalized;
  }
  return permitted[0] ?? null;
}

/**
 * Build a frozen battle-scoped social directory. LLM text is advisory: formal
 * names and initial recognition for a selected matchup remain server-owned.
 */
export function buildBattleEncounterContext(input: {
  sideA: CharacterSheet;
  sideB: CharacterSheet;
  priorMatchSummary?: string | null;
  proposal?: BattleEncounterProposal | null;
}): BattleEncounterContext {
  const fallbackA = defaultBattleLabel(input.sideA);
  const fallbackB = defaultBattleLabel(input.sideB);
  const proposedA = boundedText(
    input.proposal?.participants?.a?.battleLabel,
    fallbackA,
    24,
  );
  const proposedB = boundedText(
    input.proposal?.participants?.b?.battleLabel,
    fallbackB,
    24,
  );
  const [battleLabelA, battleLabelB] = distinctBattleLabels(
    proposedA,
    proposedB,
  );
  const relationshipFallback = input.priorMatchSummary
    ? "以前の対戦を知る相手"
    : "今回対峙する相手";
  return BattleEncounterContextSchema.parse({
    schemaVersion: 1,
    participants: {
      a: {
        officialDisplayName: input.sideA.displayName,
        battleLabel: battleLabelA,
      },
      b: {
        officialDisplayName: input.sideB.displayName,
        battleLabel: battleLabelB,
      },
    },
    social: {
      a: {
        observerSide: "a",
        counterpartSide: "b",
        relationshipLabel: boundedText(
          input.proposal?.social?.a?.relationshipLabel,
          relationshipFallback,
          120,
        ),
        counterpartAddress: boundedText(
          input.proposal?.social?.a?.counterpartAddress,
          battleLabelB,
          40,
        ),
        selfReference: permittedSelfReference(
          input.sideA,
          input.proposal?.social?.a?.selfReference,
        ),
        initialIdentityKnowledge: "identified",
      },
      b: {
        observerSide: "b",
        counterpartSide: "a",
        relationshipLabel: boundedText(
          input.proposal?.social?.b?.relationshipLabel,
          relationshipFallback,
          120,
        ),
        counterpartAddress: boundedText(
          input.proposal?.social?.b?.counterpartAddress,
          battleLabelA,
          40,
        ),
        selfReference: permittedSelfReference(
          input.sideB,
          input.proposal?.social?.b?.selfReference,
        ),
        initialIdentityKnowledge: "identified",
      },
    },
    openingSummary: boundedText(
      input.proposal?.openingSummary,
      input.priorMatchSummary
        ? `以前の対戦を踏まえ、${battleLabelA}と${battleLabelB}が再び対峙する。`
        : `${battleLabelA}と${battleLabelB}が互いを認識して対峙する。`,
      400,
    ),
  });
}

/** Deterministic social directory for saved battles without full profiles. */
export function buildLegacyBattleEncounterContext(input: {
  sideAName: string;
  sideBName: string;
  selfReferenceA?: string | null;
  selfReferenceB?: string | null;
  priorMatchSummary?: string | null;
}): BattleEncounterContext {
  const [battleLabelA, battleLabelB] = distinctBattleLabels(
    boundedText(input.sideAName, "Side A", 24),
    boundedText(input.sideBName, "Side B", 24),
  );
  const relationshipLabel = input.priorMatchSummary
    ? "以前の対戦を知る相手"
    : "今回対峙する相手";
  return BattleEncounterContextSchema.parse({
    schemaVersion: 1,
    participants: {
      a: { officialDisplayName: input.sideAName, battleLabel: battleLabelA },
      b: { officialDisplayName: input.sideBName, battleLabel: battleLabelB },
    },
    social: {
      a: {
        observerSide: "a",
        counterpartSide: "b",
        relationshipLabel,
        counterpartAddress: battleLabelB,
        selfReference: input.selfReferenceA ?? null,
        initialIdentityKnowledge: "identified",
      },
      b: {
        observerSide: "b",
        counterpartSide: "a",
        relationshipLabel,
        counterpartAddress: battleLabelA,
        selfReference: input.selfReferenceB ?? null,
        initialIdentityKnowledge: "identified",
      },
    },
    openingSummary: input.priorMatchSummary
      ? `以前の対戦を踏まえ、${battleLabelA}と${battleLabelB}が再び対峙する。`
      : `${battleLabelA}と${battleLabelB}が互いを認識して対峙する。`,
  });
}

export const NarratorReaderContinuitySchema = z.object({
  participantLabels: z.object({
    a: z.string().min(1).max(40),
    b: z.string().min(1).max(40),
  }).strict(),
  disclosedTerms: z.array(z.string().min(1).max(120)).max(12).default([]),
  recognitions: z.array(NarratorRecognitionSchema).max(16).default([]),
}).strict();

export const NarratorPerspectiveContinuitySchema = z.object({
  viewpointSide: z.enum(["a", "b"]),
  turn: z.number().int().nonnegative(),
  selfLabel: z.string().min(1).max(40),
  counterpartLabel: z.string().min(1).max(120),
  relationshipLabel: z.string().min(1).max(120),
  counterpartAddress: z.string().min(1).max(40),
  selfReference: z.string().min(1).max(40).nullable(),
  currentAccess: CurrentAccessSchema,
  identityKnowledge: IdentityKnowledgeSchema,
  perceivedAs: z.string().min(1).max(400),
  currentAttention: z.array(z.string().min(1).max(240)).max(6).default([]),
  unresolvedThreads: z.array(z.string().min(1).max(240)).max(6).default([]),
  lastInteriorBeat: z.string().min(1).max(400).nullable().default(null),
  recentPresentationTerms: z.array(z.string().min(1).max(120)).max(8).default([]),
  recognitions: z.array(NarratorRecognitionSchema).max(16).default([]),
}).strict();
export type NarratorPerspectiveContinuity = z.infer<
  typeof NarratorPerspectiveContinuitySchema
>;

export const BattleNarratorContinuitySchema = z.object({
  schemaVersion: z.literal(1),
  reader: NarratorReaderContinuitySchema,
  a: NarratorPerspectiveContinuitySchema,
  b: NarratorPerspectiveContinuitySchema,
}).strict();
export type BattleNarratorContinuity = z.infer<
  typeof BattleNarratorContinuitySchema
>;

export const NarratorContinuityViewSchema = z.object({
  reader: NarratorReaderContinuitySchema,
  perspectives: z.array(NarratorPerspectiveContinuitySchema).max(2),
}).strict();
export type NarratorContinuityView = z.infer<
  typeof NarratorContinuityViewSchema
>;

export function selectNarratorContinuityForFocus(input: {
  continuity: BattleNarratorContinuity;
  focus: "self" | "foe" | "external" | "both";
}): NarratorContinuityView {
  return NarratorContinuityViewSchema.parse({
    reader: input.continuity.reader,
    perspectives: input.focus === "self"
      ? [input.continuity.a]
      : input.focus === "foe"
        ? [input.continuity.b]
        : input.focus === "both"
          ? [input.continuity.a, input.continuity.b]
          : [],
  });
}

function uniqueRecent(
  values: Array<string | null | undefined>,
  limit: number,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.reverse()) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.unshift(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

function interiorBeat(
  agent: CharacterAgentState | null | undefined,
): string | null {
  const interior = agent?.interior;
  if (interior) {
    return [
      interior.primaryEmotion,
      interior.concealedEmotion
        ? `表に出さない感情: ${interior.concealedEmotion}`
        : null,
      interior.unspokenIntent
        ? `口にしない意図: ${interior.unspokenIntent}`
        : null,
      interior.currentConcern ? `懸念: ${interior.currentConcern}` : null,
    ].filter(Boolean).join(" / ").slice(0, 400) || null;
  }
  return [agent?.emotion, agent?.currentGoal]
    .filter(Boolean)
    .join(" / ")
    .slice(0, 400) || null;
}

function perspectiveContinuity(input: {
  side: "a" | "b";
  turn: number;
  encounter: BattleEncounterContext;
  frame: CharacterPerceptionFrame;
  agent?: CharacterAgentState | null;
  previous?: NarratorPerspectiveContinuity | null;
}): NarratorPerspectiveContinuity {
  const participant = input.encounter.participants[input.side];
  const social = input.encounter.social[input.side];
  const stableCounterpart = input.encounter.participants[social.counterpartSide];
  const selfSubjectRef = input.side === "a" ? "self" : "opponent";
  const counterpartSubjectRef = input.side === "a" ? "opponent" : "self";
  const previousRecognitions = input.previous?.recognitions ?? [];
  const previousCounterpart = previousRecognitions.find((recognition) =>
    recognition.subjectRef === counterpartSubjectRef
  );
  const apparentContinuity = input.frame.counterpart.apparentIdentity?.continuity;
  const counterpartContinuity = apparentContinuity ??
    (input.frame.counterpart.identityKnowledge === "identified"
      ? "same_entity"
      : previousCounterpart?.continuity ?? "possibly_same_entity");
  const rememberedIdentity = previousCounterpart?.identityKnowledge ===
      "identified" &&
    previousCounterpart.continuity === "same_entity" &&
    counterpartContinuity !== "unlinked";
  const narratorIdentityKnowledge = rememberedIdentity
    ? "identified" as const
    : input.frame.counterpart.identityKnowledge;
  const counterpartConfirmed = narratorIdentityKnowledge === "identified" &&
    counterpartContinuity === "same_entity";
  const baselineRecognitions: NarratorRecognition[] = [{
    subjectRef: selfSubjectRef,
    recognizedAs: participant.battleLabel,
    identityKnowledge: "identified",
    continuity: "same_entity",
    lastConfirmedTurn: input.turn,
  }, {
    subjectRef: counterpartSubjectRef,
    recognizedAs: counterpartConfirmed
      ? stableCounterpart.battleLabel
      : previousCounterpart?.recognizedAs ?? input.frame.counterpart.perceivedAs,
    identityKnowledge: narratorIdentityKnowledge,
    continuity: counterpartContinuity,
    lastConfirmedTurn: counterpartConfirmed &&
        input.frame.counterpart.currentAccess !== "none"
      ? input.turn
      : previousCounterpart?.lastConfirmedTurn ?? input.turn,
  }];
  const recognitions = mergeNarratorRecognitions(
    previousRecognitions,
    baselineRecognitions,
  );
  const percepts = [
    ...input.frame.counterpart.percepts,
    ...input.frame.others.flatMap((slot) => slot.percepts),
  ].map((percept) => percept.phenomenon);
  return NarratorPerspectiveContinuitySchema.parse({
    viewpointSide: input.side,
    turn: input.turn,
    selfLabel: participant.battleLabel,
    counterpartLabel: input.frame.counterpart.identityKnowledge === "identified"
      ? stableCounterpart.battleLabel
      : input.frame.counterpart.perceivedAs,
    relationshipLabel: social.relationshipLabel,
    counterpartAddress: social.counterpartAddress,
    selfReference: social.selfReference,
    currentAccess: input.frame.counterpart.currentAccess,
    identityKnowledge: input.frame.counterpart.identityKnowledge,
    perceivedAs: input.frame.counterpart.perceivedAs,
    currentAttention: uniqueRecent([
      ...(input.previous?.currentAttention ?? []),
      ...percepts,
      input.agent?.interior?.currentConcern,
    ], 6),
    unresolvedThreads: uniqueRecent([
      ...(input.previous?.unresolvedThreads ?? []),
      ...(input.agent?.beliefs ?? []),
      input.agent?.interior?.unspokenIntent,
    ], 6),
    lastInteriorBeat: interiorBeat(input.agent),
    recentPresentationTerms: uniqueRecent([
      ...(input.previous?.recentPresentationTerms ?? []),
      input.frame.counterpart.perceivedAs,
      social.counterpartAddress,
    ], 8),
    recognitions,
  });
}

function mergeNarratorRecognitions(
  previous: readonly NarratorRecognition[],
  incoming: readonly NarratorRecognition[],
): NarratorRecognition[] {
  const merged = new Map<string, NarratorRecognition>();
  for (const recognition of previous) {
    merged.set(recognition.subjectRef, structuredClone(recognition));
  }
  for (const recognition of incoming) {
    merged.set(recognition.subjectRef, structuredClone(recognition));
  }
  return [...merged.values()].slice(-16);
}

export function applyBattleNarratorRecognitionUpdates(input: {
  continuity: BattleNarratorContinuity;
  target: "reader" | "a" | "b";
  turn: number;
  allowedSubjectRefs: readonly string[];
  updates: readonly NarratorRecognitionUpdate[];
}): BattleNarratorContinuity {
  const allowed = new Set(input.allowedSubjectRefs);
  const current = input.target === "reader"
    ? input.continuity.reader.recognitions
    : input.continuity[input.target].recognitions;
  const merged = new Map(
    current.map((recognition) => [
      recognition.subjectRef,
      structuredClone(recognition),
    ]),
  );
  for (const update of input.updates.slice(0, 16)) {
    const parsed = NarratorRecognitionUpdateSchema.safeParse(update);
    if (!parsed.success || !allowed.has(parsed.data.subjectRef)) continue;
    const previous = merged.get(parsed.data.subjectRef);
    const preserveKnownIdentity = previous?.identityKnowledge === "identified" &&
      previous.continuity === "same_entity" &&
      parsed.data.continuity !== "unlinked";
    const identityKnowledge = preserveKnownIdentity
      ? "identified" as const
      : parsed.data.identityKnowledge;
    const recognizedAs = preserveKnownIdentity
      ? previous.recognizedAs
      : parsed.data.recognizedAs;
    merged.set(parsed.data.subjectRef, {
      ...parsed.data,
      recognizedAs,
      identityKnowledge,
      lastConfirmedTurn: identityKnowledge === "identified" &&
          parsed.data.continuity === "same_entity"
        ? input.turn
        : previous?.lastConfirmedTurn ?? input.turn,
    });
  }
  const recognitions = [...merged.values()].slice(-16);
  const next = input.target === "reader"
    ? {
        ...input.continuity,
        reader: { ...input.continuity.reader, recognitions },
      }
    : {
        ...input.continuity,
        [input.target]: { ...input.continuity[input.target], recognitions },
      };
  return BattleNarratorContinuitySchema.parse(next);
}

/** Refresh both subjective narrator records regardless of the rendered focus. */
export function updateBattleNarratorContinuity(input: {
  turn: number;
  encounter: BattleEncounterContext;
  frameA: CharacterPerceptionFrame;
  frameB: CharacterPerceptionFrame;
  agentStateA?: CharacterAgentState | null;
  agentStateB?: CharacterAgentState | null;
  previous?: BattleNarratorContinuity | null;
}): BattleNarratorContinuity {
  const disclosedTerms = uniqueRecent([
    ...(input.previous?.reader.disclosedTerms ?? []),
    input.encounter.openingSummary,
    input.encounter.participants.a.officialDisplayName !==
        input.encounter.participants.a.battleLabel
      ? `${input.encounter.participants.a.battleLabel}（正式表示名：${input.encounter.participants.a.officialDisplayName}）`
      : null,
    input.encounter.participants.b.officialDisplayName !==
        input.encounter.participants.b.battleLabel
      ? `${input.encounter.participants.b.battleLabel}（正式表示名：${input.encounter.participants.b.officialDisplayName}）`
      : null,
  ], 12);
  return BattleNarratorContinuitySchema.parse({
    schemaVersion: 1,
    reader: {
      participantLabels: {
        a: input.encounter.participants.a.battleLabel,
        b: input.encounter.participants.b.battleLabel,
      },
      disclosedTerms,
      recognitions: mergeNarratorRecognitions(
        input.previous?.reader.recognitions ?? [],
        [{
          subjectRef: "character.a",
          recognizedAs: input.encounter.participants.a.battleLabel,
          identityKnowledge: "identified",
          continuity: "same_entity",
          lastConfirmedTurn: input.turn,
        }, {
          subjectRef: "character.b",
          recognizedAs: input.encounter.participants.b.battleLabel,
          identityKnowledge: "identified",
          continuity: "same_entity",
          lastConfirmedTurn: input.turn,
        }],
      ),
    },
    a: perspectiveContinuity({
      side: "a",
      turn: input.turn,
      encounter: input.encounter,
      frame: input.frameA,
      agent: input.agentStateA,
      previous: input.previous?.a,
    }),
    b: perspectiveContinuity({
      side: "b",
      turn: input.turn,
      encounter: input.encounter,
      frame: input.frameB,
      agent: input.agentStateB,
      previous: input.previous?.b,
    }),
  });
}
