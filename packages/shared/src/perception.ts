import { z } from "zod";
import { ParamKeySchema } from "./character.js";
import { SemanticIdSchema } from "./semantic-state.js";

export const PERCEPTION_LIMITS = {
  maxMechanicalEvidencePerTurn: 64,
  maxEvidencePerTurn: 32,
  maxBasisEventIds: 16,
  maxPerceptsPerFrame: 32,
  maxOtherSlotsPerFrame: 30,
  maxQualitativeChangesPerFrame: 32,
  maxReserveCuesPerFrame: 12,
  maxContactRegistryEntries: 64,
  maxSourceRefsPerContact: 8,
  maxNarrationReferences: 128,
  maxFrameBytes: 48 * 1024,
  maxRegistryBytes: 64 * 1024,
} as const;

export const BattleSideSchema = z.enum(["a", "b"]);
export type BattleSide = z.infer<typeof BattleSideSchema>;

export const SensoryModalitySchema = z.enum([
  "vision",
  "sound",
  "smell",
  "touch",
  "proprioception",
  "atmosphere",
  "other",
]);
export type SensoryModality = z.infer<typeof SensoryModalitySchema>;

export const CurrentAccessSchema = z.enum([
  "none",
  "trace",
  "coarse",
  "clear",
]);
export type CurrentAccess = z.infer<typeof CurrentAccessSchema>;

export const IdentityKnowledgeSchema = z.enum([
  "unknown",
  "suspected",
  "identified",
]);
export type IdentityKnowledge = z.infer<typeof IdentityKnowledgeSchema>;

export const PerceptionCertaintySchema = z.enum([
  "unknown",
  "possible",
  "probable",
  "certain",
]);
export type PerceptionCertainty = z.infer<typeof PerceptionCertaintySchema>;

/** Observer-local appearance and identity belief; never canonical identity. */
export const ApparentIdentityBeliefSchema = z.object({
  form: z.string().min(1).max(400),
  identity: z.string().min(1).max(240).nullable(),
  confidence: PerceptionCertaintySchema,
  continuity: z.enum([
    "same_entity",
    "possibly_same_entity",
    "unlinked",
  ]),
}).strict();
export type ApparentIdentityBelief = z.infer<
  typeof ApparentIdentityBeliefSchema
>;

export const PerceptionDirectionSchema = z.enum([
  "unknown",
  "front",
  "front_right",
  "right",
  "back_right",
  "back",
  "back_left",
  "left",
  "front_left",
  "above",
  "below",
  "around",
]);
export type PerceptionDirection = z.infer<typeof PerceptionDirectionSchema>;

export const PerceptionDistanceSchema = z.enum([
  "unknown",
  "contact",
  "near",
  "mid",
  "far",
]);
export type PerceptionDistance = z.infer<typeof PerceptionDistanceSchema>;

export const PerceptionSalienceSchema = z.enum([
  "background",
  "noticeable",
  "prominent",
  "urgent",
]);
export type PerceptionSalience = z.infer<typeof PerceptionSalienceSchema>;

export const PerceptionAccessSchema = z.object({
  currentAccess: CurrentAccessSchema,
  identityKnowledge: IdentityKnowledgeSchema,
  perceivedAs: z.string().min(1).max(240),
  /** Observer-specific sensory rendering; omitted when the shared wording is safe. */
  perceivedPhenomenon: z.string().min(1).max(400).optional(),
  apparentIdentity: ApparentIdentityBeliefSchema.optional(),
  direction: PerceptionDirectionSchema.default("unknown"),
  distance: PerceptionDistanceSchema.default("unknown"),
  occurrenceCertainty: PerceptionCertaintySchema,
  attributionCertainty: PerceptionCertaintySchema,
}).strict();
export type PerceptionAccess = z.infer<typeof PerceptionAccessSchema>;

/** Server-only source authority. Never embed this in a character-facing frame. */
export const ServerOnlyPerceptionSourceRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("entity"),
    entityId: SemanticIdSchema,
  }).strict(),
  z.object({
    kind: z.literal("event"),
    eventId: SemanticIdSchema,
  }).strict(),
  z.object({
    kind: z.literal("ambient"),
  }).strict(),
]);
export type ServerOnlyPerceptionSourceRef = z.infer<
  typeof ServerOnlyPerceptionSourceRefSchema
>;

/** Validated sensory evidence produced before observer-specific projection. */
export const PerceptionEvidenceSchema = z.object({
  evidenceId: SemanticIdSchema,
  basisEventIds: z
    .array(SemanticIdSchema)
    .max(PERCEPTION_LIMITS.maxBasisEventIds)
    .default([]),
  modality: SensoryModalitySchema,
  phenomenon: z.string().min(1).max(400),
  source: ServerOnlyPerceptionSourceRefSchema,
  /** Explicit all-modality subject loss, not merely an unheard/unseen cue. */
  revokesSubjectAccess: z.boolean().optional(),
  accessBySide: z.object({
    a: PerceptionAccessSchema,
    b: PerceptionAccessSchema,
  }).strict(),
  publicAccess: PerceptionAccessSchema,
}).strict();
export type PerceptionEvidence = z.infer<typeof PerceptionEvidenceSchema>;

export const PerceptionEvidenceSetSchema = z
  .array(PerceptionEvidenceSchema)
  .max(PERCEPTION_LIMITS.maxEvidencePerTurn)
  .refine(
    (evidence) => unique(evidence.map((item) => item.evidenceId)),
    "duplicate perception evidence id",
  );
export type PerceptionEvidenceSet = z.infer<typeof PerceptionEvidenceSetSchema>;

/**
 * Exact, server-only mechanics committed by the deterministic turn resolver.
 * Raw values must be projected to qualitative cues before any LLM call.
 */
export const CommittedMechanicalEvidenceSchema = z.object({
  evidenceId: SemanticIdSchema,
  turn: z.number().int().nonnegative(),
  sourceActionId: SemanticIdSchema.nullable(),
  basisEventIds: z
    .array(SemanticIdSchema)
    .max(PERCEPTION_LIMITS.maxBasisEventIds),
  actorSide: BattleSideSchema.nullable(),
  target: z.object({
    side: BattleSideSchema,
    entityId: SemanticIdSchema,
  }).strict(),
  parameterKey: ParamKeySchema,
  attemptedDelta: z.number().finite(),
  beforeValue: z.number().finite(),
  afterValue: z.number().finite(),
  delta: z.number().finite(),
  relativeReferenceBeforeValue: z.number().finite().nonnegative(),
  relativeReferenceAfterValue: z.number().finite().nonnegative(),
}).strict().superRefine((evidence, ctx) => {
  if (evidence.sourceActionId === null && evidence.basisEventIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["basisEventIds"],
      message: "mechanical evidence must reference an action or event",
    });
  }
  if (evidence.target.entityId !== `character.${evidence.target.side}`) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["target", "entityId"],
      message: "mechanical evidence target must match its committed character side",
    });
  }
  if (evidence.attemptedDelta === 0 && evidence.delta === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["attemptedDelta"],
      message: "mechanical evidence must describe an attempted or committed change",
    });
  }
  const expectedDelta = evidence.afterValue - evidence.beforeValue;
  if (Math.abs(expectedDelta - evidence.delta) > 1e-9) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["delta"],
      message: "mechanical evidence delta must equal afterValue - beforeValue",
    });
  }
  if (
    evidence.delta !== 0 &&
    evidence.attemptedDelta !== 0 &&
    Math.sign(evidence.delta) !== Math.sign(evidence.attemptedDelta)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["delta"],
      message: "mechanical evidence cannot reverse the attempted direction",
    });
  }
  if (
    evidence.attemptedDelta !== 0 &&
    Math.abs(evidence.delta) - Math.abs(evidence.attemptedDelta) > 1e-9
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["delta"],
      message: "mechanical evidence cannot exceed the attempted magnitude",
    });
  }
});
export type CommittedMechanicalEvidence = z.infer<
  typeof CommittedMechanicalEvidenceSchema
>;

export const CommittedMechanicalEvidenceSetSchema = z
  .array(CommittedMechanicalEvidenceSchema)
  .max(PERCEPTION_LIMITS.maxMechanicalEvidencePerTurn)
  .refine(
    (evidence) => unique(evidence.map((item) => item.evidenceId)),
    "duplicate committed mechanical evidence id",
  );
export type CommittedMechanicalEvidenceSet = z.infer<
  typeof CommittedMechanicalEvidenceSetSchema
>;

export const MagnitudeBandSchema = z.enum([
  "none",
  "trace",
  "light",
  "solid",
  "heavy",
  "extreme",
]);
export type MagnitudeBand = z.infer<typeof MagnitudeBandSchema>;

export const ReserveBandSchema = z.enum([
  "empty",
  "critical",
  "low",
  "taxed",
  "ready",
  "full",
]);
export type ReserveBand = z.infer<typeof ReserveBandSchema>;

export const ParameterClassSchema = z.enum([
  "vitality",
  "stamina",
  "focus",
  "other",
]);
export type ParameterClass = z.infer<typeof ParameterClassSchema>;

const qualitativeMechanicalChangeShape = {
  parameterKey: ParamKeySchema,
  parameterClass: ParameterClassSchema,
  direction: z.enum(["loss", "gain", "unchanged"]),
  absoluteBand: MagnitudeBandSchema,
  relativeBand: z.union([
    MagnitudeBandSchema,
    z.literal("not_applicable"),
  ]),
  outcome: z.enum([
    "none",
    "effective",
    "immune",
    "incapacitated",
    "overkill",
  ]),
} as const;

export const QualitativeMechanicalChangeSchema = z
  .object(qualitativeMechanicalChangeShape)
  .strict()
  .superRefine(validateQualitativeMechanicalChange);
export type QualitativeMechanicalChange = z.infer<
  typeof QualitativeMechanicalChangeSchema
>;

/** Raw-free server evidence retained until observer-relative projection. */
export const QuantizedMechanicalEvidenceSchema = z.object({
  evidenceId: SemanticIdSchema,
  turn: z.number().int().nonnegative(),
  sourceActionId: SemanticIdSchema.nullable(),
  basisEventIds: z
    .array(SemanticIdSchema)
    .max(PERCEPTION_LIMITS.maxBasisEventIds),
  actorSide: BattleSideSchema.nullable(),
  target: z.object({
    side: BattleSideSchema,
    entityId: SemanticIdSchema,
  }).strict(),
  change: QualitativeMechanicalChangeSchema,
}).strict().superRefine((evidence, ctx) => {
  if (evidence.sourceActionId === null && evidence.basisEventIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["basisEventIds"],
      message: "quantized evidence must reference an action or event",
    });
  }
  if (evidence.target.entityId !== `character.${evidence.target.side}`) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["target", "entityId"],
      message: "quantized evidence target must match its character side",
    });
  }
});
export type QuantizedMechanicalEvidence = z.infer<
  typeof QuantizedMechanicalEvidenceSchema
>;

export const QuantizedMechanicalEvidenceSetSchema = z
  .array(QuantizedMechanicalEvidenceSchema)
  .max(PERCEPTION_LIMITS.maxMechanicalEvidencePerTurn)
  .refine(
    (evidence) => unique(evidence.map((item) => item.evidenceId)),
    "duplicate quantized mechanical evidence id",
  );

export const PerceivedSourceKnowledgeSchema = z.enum([
  "self",
  "identified",
  "contact",
  "ambient",
  "unknown",
]);
export type PerceivedSourceKnowledge = z.infer<
  typeof PerceivedSourceKnowledgeSchema
>;

export const PerceivedTargetKnowledgeSchema = z.enum([
  "self",
  "identified",
  "contact",
  "unknown",
]);
export type PerceivedTargetKnowledge = z.infer<
  typeof PerceivedTargetKnowledgeSchema
>;

export const QuantizedChangeSchema = z.object({
  ...qualitativeMechanicalChangeShape,
  sourceKnowledge: PerceivedSourceKnowledgeSchema,
  targetKnowledge: PerceivedTargetKnowledgeSchema,
}).strict().superRefine(validateQualitativeMechanicalChange);
export type QuantizedChange = z.infer<typeof QuantizedChangeSchema>;

function validateQualitativeMechanicalChange(
  change: {
    parameterKey: z.infer<typeof ParamKeySchema>;
    parameterClass: ParameterClass;
    direction: "loss" | "gain" | "unchanged";
    absoluteBand: MagnitudeBand;
    relativeBand: MagnitudeBand | "not_applicable";
    outcome: "none" | "effective" | "immune" | "incapacitated" | "overkill";
  },
  ctx: z.RefinementCtx,
): void {
  const expectedClass = parameterClassFor(change.parameterKey);
  if (change.parameterClass !== expectedClass) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["parameterClass"],
      message: `${change.parameterKey} must use parameter class ${expectedClass}`,
    });
  }

  if (change.direction === "unchanged") {
    if (change.absoluteBand !== "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["absoluteBand"],
        message: "unchanged effects must use the none absolute band",
      });
    }
    if (!["none", "not_applicable"].includes(change.relativeBand)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["relativeBand"],
        message: "unchanged effects must use none or not_applicable",
      });
    }
    if (!["none", "immune"].includes(change.outcome)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outcome"],
        message: "unchanged effects must use none or immune outcome",
      });
    }
    return;
  }

  if (change.absoluteBand === "none") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["absoluteBand"],
      message: "a changed value cannot use the none absolute band",
    });
  }
  if (["none", "immune"].includes(change.outcome)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["outcome"],
      message: "a changed value must use an effective terminal outcome",
    });
  }
}

export const ObserverContactIdSchema = z
  .string()
  .max(40)
  .regex(/^contact\.(a|b)\.[1-9][0-9]*$/);
export type ObserverContactId = z.infer<typeof ObserverContactIdSchema>;

export const PerceivedSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("self") }).strict(),
  z.object({ kind: z.literal("counterpart") }).strict(),
  z.object({
    kind: z.literal("identified"),
    perceptionRef: SemanticIdSchema,
  }).strict(),
  z.object({
    kind: z.literal("contact"),
    contactId: ObserverContactIdSchema,
  }).strict(),
  z.object({ kind: z.literal("ambient") }).strict(),
]);
export type PerceivedSubject = z.infer<typeof PerceivedSubjectSchema>;

export const PerceptSchema = z.object({
  perceptId: SemanticIdSchema,
  modality: SensoryModalitySchema,
  phenomenon: z.string().min(1).max(400),
  direction: PerceptionDirectionSchema.default("unknown"),
  distance: PerceptionDistanceSchema.default("unknown"),
  salience: PerceptionSalienceSchema,
  occurrenceCertainty: PerceptionCertaintySchema,
  attributionCertainty: PerceptionCertaintySchema,
}).strict();
export type Percept = z.infer<typeof PerceptSchema>;

export const PerceptionSlotSchema = z.object({
  subject: PerceivedSubjectSchema,
  currentAccess: CurrentAccessSchema,
  identityKnowledge: IdentityKnowledgeSchema,
  perceivedAs: z.string().min(1).max(240),
  apparentIdentity: ApparentIdentityBeliefSchema.optional(),
  percepts: z.array(PerceptSchema).max(PERCEPTION_LIMITS.maxPerceptsPerFrame),
}).strict().superRefine((slot, ctx) => {
  if (
    (slot.subject.kind === "self" || slot.subject.kind === "identified") &&
    slot.identityKnowledge !== "identified"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identityKnowledge"],
      message: `${slot.subject.kind} subjects must be identified`,
    });
  }
  if (
    (slot.subject.kind === "contact" || slot.subject.kind === "ambient") &&
    slot.identityKnowledge === "identified"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identityKnowledge"],
      message: `${slot.subject.kind} subjects cannot carry identified knowledge`,
    });
  }
  if (slot.currentAccess === "none" && slot.percepts.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["percepts"],
      message: "an inaccessible subject cannot have current percepts",
    });
  }
});
export type PerceptionSlot = z.infer<typeof PerceptionSlotSchema>;

export const ReserveParameterKeySchema = z.enum([
  "hp",
  "mp",
  "stamina",
  "focus",
]);
export type ReserveParameterKey = z.infer<typeof ReserveParameterKeySchema>;

/** Raw-free server reserve for deterministic self projection. */
export const ServerOnlyReserveCueSchema = z.object({
  side: BattleSideSchema,
  targetEntityId: SemanticIdSchema,
  parameterKey: ReserveParameterKeySchema,
  absoluteBand: ReserveBandSchema,
  relativeBand: ReserveBandSchema,
}).strict().superRefine((cue, ctx) => {
  if (cue.targetEntityId !== `character.${cue.side}`) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["targetEntityId"],
      message: "reserve target must match its character side",
    });
  }
});
export type ServerOnlyReserveCue = z.infer<
  typeof ServerOnlyReserveCueSchema
>;

export const ResourceReserveCueSchema = z.object({
  subject: PerceivedSubjectSchema,
  parameterKey: ReserveParameterKeySchema,
  absoluteBand: ReserveBandSchema,
  relativeBand: ReserveBandSchema,
  certainty: PerceptionCertaintySchema,
}).strict();
export type ResourceReserveCue = z.infer<typeof ResourceReserveCueSchema>;

export const PerceptionDiffSchema = z.object({
  fromRevision: z.number().int().nonnegative(),
  toRevision: z.number().int().nonnegative(),
  addedOrUpdatedPerceptIds: z
    .array(SemanticIdSchema)
    .max(PERCEPTION_LIMITS.maxPerceptsPerFrame)
    .default([]),
  removedPerceptIds: z
    .array(SemanticIdSchema)
    .max(PERCEPTION_LIMITS.maxPerceptsPerFrame)
    .default([]),
}).strict().superRefine((diff, ctx) => {
  if (diff.fromRevision > diff.toRevision) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fromRevision"],
      message: "perception diff revision order is invalid",
    });
  }
  if (!unique(diff.addedOrUpdatedPerceptIds)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["addedOrUpdatedPerceptIds"],
      message: "duplicate added or updated percept id",
    });
  }
  if (!unique(diff.removedPerceptIds)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["removedPerceptIds"],
      message: "duplicate removed percept id",
    });
  }
});
export type PerceptionDiff = z.infer<typeof PerceptionDiffSchema>;

export const CharacterPerceptionFrameSchema = z.object({
  schemaVersion: z.literal(1),
  observer: z.object({
    side: BattleSideSchema,
    self: z.literal("self"),
  }).strict(),
  turn: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  self: PerceptionSlotSchema,
  counterpart: PerceptionSlotSchema,
  others: z
    .array(PerceptionSlotSchema)
    .max(PERCEPTION_LIMITS.maxOtherSlotsPerFrame)
    .default([]),
  qualitativeChanges: z
    .array(QuantizedChangeSchema)
    .max(PERCEPTION_LIMITS.maxQualitativeChangesPerFrame)
    .default([]),
  reserveCues: z
    .array(ResourceReserveCueSchema)
    .max(PERCEPTION_LIMITS.maxReserveCuesPerFrame)
    .default([]),
  latestDiff: PerceptionDiffSchema,
}).strict().superRefine((frame, ctx) => {
  if (frame.self.subject.kind !== "self") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["self", "subject", "kind"],
      message: "the self slot must use the self subject",
    });
  }
  if (frame.self.identityKnowledge !== "identified") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["self", "identityKnowledge"],
      message: "self must always be identified",
    });
  }
  if (frame.self.currentAccess === "none") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["self", "currentAccess"],
      message: "self must remain accessible through proprioception",
    });
  }
  if (frame.counterpart.subject.kind !== "counterpart") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["counterpart", "subject", "kind"],
      message: "the counterpart slot must use the counterpart subject",
    });
  }
  if (frame.latestDiff.toRevision !== frame.revision) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["latestDiff", "toRevision"],
      message: "perception diff must end at the frame revision",
    });
  }

  const slots = [frame.self, frame.counterpart, ...frame.others];
  const perceptIds = slots.flatMap((slot) =>
    slot.percepts.map((percept) => percept.perceptId)
  );
  if (perceptIds.length > PERCEPTION_LIMITS.maxPerceptsPerFrame) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["others"],
      message: "perception frame exceeds total percept limit",
    });
  }
  if (!unique(perceptIds)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "duplicate percept id in frame",
    });
  }

  const contactIds = slots.flatMap((slot) =>
    slot.subject.kind === "contact" ? [slot.subject.contactId] : []
  );
  if (!unique(contactIds)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["others"],
      message: "duplicate contact slot in frame",
    });
  }
  for (const contactId of contactIds) {
    if (contactSide(contactId) !== frame.observer.side) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["others"],
        message: "contact id must be scoped to the observing side",
      });
    }
  }
  if (utf8Bytes(frame) > PERCEPTION_LIMITS.maxFrameBytes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "perception frame exceeds byte limit",
    });
  }
});
export type CharacterPerceptionFrame = z.infer<
  typeof CharacterPerceptionFrameSchema
>;

export const CharacterPerceptionFrameASchema = CharacterPerceptionFrameSchema
  .refine((frame) => frame.observer.side === "a", {
    path: ["observer", "side"],
    message: "side A frame must use observer side a",
  });
export const CharacterPerceptionFrameBSchema = CharacterPerceptionFrameSchema
  .refine((frame) => frame.observer.side === "b", {
    path: ["observer", "side"],
    message: "side B frame must use observer side b",
  });

/** Server-only authority used to continue anonymous contacts across turns. */
export const ContactSourceRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("entity"),
    entityId: SemanticIdSchema,
  }).strict(),
  z.object({
    kind: z.literal("event"),
    eventId: SemanticIdSchema,
  }).strict(),
  z.object({
    kind: z.literal("evidence"),
    evidenceId: SemanticIdSchema,
  }).strict(),
]);
export type ContactSourceRef = z.infer<typeof ContactSourceRefSchema>;

export const ObserverContactRegistryEntrySchema = z.object({
  contactId: ObserverContactIdSchema,
  currentAccess: CurrentAccessSchema,
  identityKnowledge: IdentityKnowledgeSchema,
  identifiedRef: SemanticIdSchema.nullable().default(null),
  perceivedAs: z.string().min(1).max(240),
  apparentIdentity: ApparentIdentityBeliefSchema.optional(),
  salience: PerceptionSalienceSchema,
  lastObservedTurn: z.number().int().nonnegative(),
  sourceSet: z
    .array(ContactSourceRefSchema)
    .min(1)
    .max(PERCEPTION_LIMITS.maxSourceRefsPerContact),
}).strict().superRefine((entry, ctx) => {
  if (
    entry.identityKnowledge === "identified" &&
    entry.identifiedRef === null
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identifiedRef"],
      message: "identified contacts require an identified reference",
    });
  }
  if (
    entry.identityKnowledge !== "identified" &&
    entry.identifiedRef !== null
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identifiedRef"],
      message: "unknown or suspected contacts cannot expose an identified reference",
    });
  }
  const sourceKeys = entry.sourceSet.map(contactSourceKey);
  if (!unique(sourceKeys)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceSet"],
      message: "duplicate contact source reference",
    });
  }
});
export type ObserverContactRegistryEntry = z.infer<
  typeof ObserverContactRegistryEntrySchema
>;

export const ObserverContactRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  observerSide: BattleSideSchema,
  nextContactSequence: z.number().int().positive(),
  contacts: z
    .array(ObserverContactRegistryEntrySchema)
    .max(PERCEPTION_LIMITS.maxContactRegistryEntries)
    .default([]),
}).strict().superRefine((registry, ctx) => {
  const contactIds = registry.contacts.map((entry) => entry.contactId);
  if (!unique(contactIds)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contacts"],
      message: "duplicate contact registry id",
    });
  }

  let maximumSequence = 0;
  for (const [index, entry] of registry.contacts.entries()) {
    if (contactSide(entry.contactId) !== registry.observerSide) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contacts", index, "contactId"],
        message: "contact id must be scoped to the registry observer",
      });
    }
    maximumSequence = Math.max(maximumSequence, contactSequence(entry.contactId));
  }
  if (registry.nextContactSequence <= maximumSequence) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nextContactSequence"],
      message: "next contact sequence must exceed every retained contact id",
    });
  }
  if (utf8Bytes(registry) > PERCEPTION_LIMITS.maxRegistryBytes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "contact registry exceeds byte limit",
    });
  }
});
export type ObserverContactRegistry = z.infer<
  typeof ObserverContactRegistrySchema
>;

export const ObserverContactRegistryASchema = ObserverContactRegistrySchema
  .refine((registry) => registry.observerSide === "a", {
    path: ["observerSide"],
    message: "side A registry must use observer side a",
  });
export const ObserverContactRegistryBSchema = ObserverContactRegistrySchema
  .refine((registry) => registry.observerSide === "b", {
    path: ["observerSide"],
    message: "side B registry must use observer side b",
  });

export const NarrationReferenceRelationSchema = z.enum([
  "self",
  "opponent",
  "other",
  "environment",
  "contact",
]);
export type NarrationReferenceRelation = z.infer<
  typeof NarrationReferenceRelationSchema
>;

export const NarrationControlReferenceSchema = z.object({
  controlId: SemanticIdSchema,
  renderLabel: z.string().min(1).max(240),
  relation: NarrationReferenceRelationSchema,
}).strict();
export type NarrationControlReference = z.infer<
  typeof NarrationControlReferenceSchema
>;

export const ExternalNarrationReferenceSchema = z.object({
  /** Opaque narrator-only continuity key; never a canonical entity ID. */
  subjectRef: z.string().min(1).max(160).optional(),
  renderLabel: z.string().min(1).max(240),
  relation: NarrationReferenceRelationSchema,
}).strict();
export type ExternalNarrationReference = z.infer<
  typeof ExternalNarrationReferenceSchema
>;

const CharacterNarrationPerceptionViewSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["self", "opponent"]),
  viewpointSide: BattleSideSchema,
  viewpointSubject: z.enum(["self", "opponent"]),
  resolvedFromFluid: z.boolean().default(false),
  frame: CharacterPerceptionFrameSchema,
  references: z
    .array(NarrationControlReferenceSchema)
    .max(PERCEPTION_LIMITS.maxNarrationReferences),
}).strict();

const OmniscientNarrationPerceptionViewSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("omniscient"),
  viewpointSide: z.null(),
  resolvedFromFluid: z.boolean().default(false),
  references: z
    .array(NarrationControlReferenceSchema)
    .max(PERCEPTION_LIMITS.maxNarrationReferences),
}).strict();

const ExternalNarrationPerceptionViewSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("external"),
  viewpointSide: z.null(),
  resolvedFromFluid: z.boolean().default(false),
  references: z
    .array(ExternalNarrationReferenceSchema)
    .max(PERCEPTION_LIMITS.maxNarrationReferences),
}).strict();

/** Ephemeral narrator input. It is derived per perspective and never persisted. */
export const NarrationPerceptionViewSchema = z.discriminatedUnion("mode", [
  CharacterNarrationPerceptionViewSchema,
  OmniscientNarrationPerceptionViewSchema,
  ExternalNarrationPerceptionViewSchema,
]).superRefine((view, ctx) => {
  if (
    (view.mode === "self" || view.mode === "opponent") &&
    view.frame.observer.side !== view.viewpointSide
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["frame", "observer", "side"],
      message: "character narration frame must match the viewpoint side",
    });
  }
  if (view.mode === "self" && (
    view.viewpointSide !== "a" || view.viewpointSubject !== "self"
  )) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["viewpointSubject"],
      message: "self narration must explicitly use side A as self",
    });
  }
  if (view.mode === "opponent" && (
    view.viewpointSide !== "b" || view.viewpointSubject !== "opponent"
  )) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["viewpointSubject"],
      message: "opponent narration must explicitly use side B as opponent",
    });
  }
});
export type NarrationPerceptionView = z.infer<
  typeof NarrationPerceptionViewSchema
>;

export function parameterClassFor(
  parameterKey: z.infer<typeof ParamKeySchema>,
): ParameterClass {
  if (parameterKey === "hp" || parameterKey === "maxHp") return "vitality";
  if (parameterKey === "stamina" || parameterKey === "maxStamina") {
    return "stamina";
  }
  if (["mp", "maxMp", "focus"].includes(parameterKey)) return "focus";
  return "other";
}

function contactSide(contactId: string): BattleSide | null {
  const match = /^contact\.(a|b)\./.exec(contactId);
  return match?.[1] === "a" || match?.[1] === "b" ? match[1] : null;
}

function contactSequence(contactId: string): number {
  const sequence = Number(contactId.split(".").at(-1));
  return Number.isSafeInteger(sequence) ? sequence : 0;
}

function contactSourceKey(source: ContactSourceRef): string {
  if (source.kind === "entity") return `entity:${source.entityId}`;
  if (source.kind === "event") return `event:${source.eventId}`;
  return `evidence:${source.evidenceId}`;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function utf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
