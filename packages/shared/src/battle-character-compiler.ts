import { z } from "zod";
import {
  CharacterActionNormProgramV2Schema,
  CharacterRelationshipDescriptiveProjectionV2Schema,
  CharacterRelationshipResolutionV2Schema,
} from "./character-definition-rules.js";

const PsycheActivationSchema = z.number().int().min(0).max(1000);

/** Versioned, server-private inputs for the deterministic normal-turn policy. */
export const PsycheTraitProfileV1Schema = z.object({
  adverseSensitivity: PsycheActivationSchema,
  uncertaintySensitivity: PsycheActivationSchema,
  recoverySpeed: PsycheActivationSchema,
  irritationPersistence: PsycheActivationSchema,
  anxietyPersistence: PsycheActivationSchema,
  approachTendency: PsycheActivationSchema,
  withdrawalTendency: PsycheActivationSchema,
  impulseInhibition: PsycheActivationSchema,
  expressionRestraint: PsycheActivationSchema,
}).strict();
export type PsycheTraitProfileV1 = z.infer<typeof PsycheTraitProfileV1Schema>;

/** Frozen descriptive disposition for the private deep-psyche consumer. */
export const CharacterDeepPsycheStaticProjectionV2Schema = z.object({
  contractVersion: z.literal(2),
  background: z.array(z.object({
    id: z.string().min(1).max(120),
    text: z.string().min(1).max(600),
    selfAwareness: z.enum(["unaware", "partial", "aware"]),
  }).strict()).max(16),
  tendencies: z.array(z.object({
    id: z.string().min(1).max(120),
    tendency: z.string().min(1).max(600),
    manifestation: z.string().min(1).max(600),
    backgroundRefs: z.array(z.string().min(1).max(120)).max(6),
    selfAwareness: z.enum(["unaware", "partial", "aware"]),
  }).strict()).max(12),
  coreNeeds: z.array(z.object({
    id: z.string().min(1).max(120),
    text: z.string().min(1).max(600),
    selfAwareness: z.enum(["unaware", "partial", "aware"]),
  }).strict()).max(6),
  relationship: CharacterRelationshipDescriptiveProjectionV2Schema
    .nullable()
    .optional(),
}).strict();
export type CharacterDeepPsycheStaticProjectionV2 = z.infer<
  typeof CharacterDeepPsycheStaticProjectionV2Schema
>;

/** Frozen self-aware profile for conscious action and expression consumers. */
export const CharacterConsciousSelfStaticProjectionV2Schema = z.object({
  contractVersion: z.literal(2),
  displayName: z.string().min(1).max(48),
  background: z.array(z.string().min(1).max(600)).max(16),
  tendencies: z.array(z.string().min(1).max(600)).max(12),
  actionPrinciples: z.array(z.string().min(1).max(320)).max(12),
  speech: z.object({
    register: z.string().max(160),
    cadence: z.string().max(160),
    sentenceLength: z.enum(["short", "mixed", "long"]),
    vocabularyHabits: z.array(z.string().min(1).max(80)).max(12),
    examples: z.array(z.string().min(1).max(240)).max(2),
  }).strict(),
  relationship: CharacterRelationshipDescriptiveProjectionV2Schema
    .nullable()
    .optional(),
}).strict();
export type CharacterConsciousSelfStaticProjectionV2 = z.infer<
  typeof CharacterConsciousSelfStaticProjectionV2Schema
>;

/** Static character facts compiled separately for each narrator access mode. */
export const CharacterNarratorStaticProjectionV2Schema = z.object({
  contractVersion: z.literal(2),
  access: z.enum(["external", "self_inner", "omniscient"]),
  appearance: z.array(z.string().min(1).max(600)).max(12),
  innerBackground: z.array(z.string().min(1).max(600)).max(10),
  innerDisposition: z.array(z.string().min(1).max(600)).max(10),
  observablePatterns: z.array(z.string().min(1).max(600)).max(10),
  behaviorPrinciples: z.array(z.string().min(1).max(320)).max(10),
}).strict();
export type CharacterNarratorStaticProjectionV2 = z.infer<
  typeof CharacterNarratorStaticProjectionV2Schema
>;

export const CharacterNarratorProjectionSetV2Schema = z.object({
  external: CharacterNarratorStaticProjectionV2Schema,
  selfInner: CharacterNarratorStaticProjectionV2Schema,
  omniscient: CharacterNarratorStaticProjectionV2Schema,
}).strict();
export type CharacterNarratorProjectionSetV2 = z.infer<
  typeof CharacterNarratorProjectionSetV2Schema
>;

export const CharacterBattleCompilerInputsV2Schema = z.object({
  psycheTraits: PsycheTraitProfileV1Schema,
  deepPsyche: CharacterDeepPsycheStaticProjectionV2Schema,
  consciousSelf: CharacterConsciousSelfStaticProjectionV2Schema,
  narratorViews: CharacterNarratorProjectionSetV2Schema.optional(),
  /** Optional for immutable battles created before the P2 rule-compiler slice. */
  actionNorms: CharacterActionNormProgramV2Schema.optional(),
  /** Exact logical-target resolution frozen at battle creation. */
  relationship: CharacterRelationshipResolutionV2Schema.optional(),
}).strict();
export type CharacterBattleCompilerInputsV2 = z.infer<
  typeof CharacterBattleCompilerInputsV2Schema
>;

/** V3 uses existing asset snapshots but never passes old psyche free text. */
export const CharacterBattleCompilerInputsV3Schema =
  CharacterBattleCompilerInputsV2Schema.omit({ deepPsyche: true }).strict();
export type CharacterBattleCompilerInputsV3 = z.infer<
  typeof CharacterBattleCompilerInputsV3Schema
>;
