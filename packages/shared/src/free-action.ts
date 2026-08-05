import { z } from "zod";
import {
  WorldCausalEnvelopeSchema,
  WorldDistanceSchema,
} from "./battle-world.js";

export const QualitativeNeedBandSchema = z.enum([
  "none",
  "low",
  "moderate",
  "high",
  "critical",
]);
export type QualitativeNeedBand = z.infer<typeof QualitativeNeedBandSchema>;

export const DecisionPrincipleSchema = z.object({
  id: z.string().min(1).max(80),
  statement: z.string().min(1).max(400),
  priority: z.number().int().min(0).max(100),
  force: z.enum(["preference", "commitment", "constraint"]),
}).strict();
export type DecisionPrinciple = z.infer<typeof DecisionPrincipleSchema>;

export const DecisionProfileSchema = z.object({
  defaultObjective: z.object({
    id: z.literal("victory"),
    statement: z.string().min(1).max(240),
    priority: z.number().int().min(0).max(100),
  }).strict(),
  principles: z.array(DecisionPrincipleSchema).max(8).default([]),
}).strict();
export type DecisionProfile = z.infer<typeof DecisionProfileSchema>;

export const TacticalNeedFrameSchema = z.object({
  survivalPressure: QualitativeNeedBandSchema,
  unprotectedIncomingRisk: z.union([
    QualitativeNeedBandSchema,
    z.literal("unknown"),
  ]),
  offenseAdequacy: z.enum([
    "insufficient",
    "marginal",
    "adequate",
    "unknown",
  ]),
  defenseAdequacy: z.enum([
    "insufficient",
    "marginal",
    "adequate",
    "unknown",
  ]),
  controlNeed: QualitativeNeedBandSchema,
  resourcePressure: QualitativeNeedBandSchema,
  timePressure: QualitativeNeedBandSchema,
  evidenceRefs: z.array(z.string().min(1).max(120)).max(12).default([]),
}).strict();
export type TacticalNeedFrame = z.infer<typeof TacticalNeedFrameSchema>;

const CompatibleActionKindSchema = z.enum([
  "basic_attack",
  "skill",
  "defend",
  "free_action",
]);

export const LatentAffordanceProjectionSchema = z.object({
  ref: z.string().min(1).max(120),
  perceivedAs: z.string().min(1).max(240),
  relation: z.string().min(1).max(240),
  certainty: z.enum(["clear", "coarse", "uncertain"]),
  possiblePreparations: z.array(z.object({
    description: z.string().min(1).max(240),
    setupTurns: z.number().int().min(0).max(3),
  }).strict()).max(4).default([]),
  possibleUses: z.array(z.object({
    description: z.string().min(1).max(240),
    compatibleActionKinds: z.array(CompatibleActionKindSchema).max(4),
    expectedCausalPotential: WorldCausalEnvelopeSchema,
  }).strict()).max(4).default([]),
}).strict();
export type LatentAffordanceProjection = z.infer<
  typeof LatentAffordanceProjectionSchema
>;

export const OpportunityChainSchema = z.object({
  id: z.string().min(1).max(120),
  objectiveHint: z.string().min(1).max(240),
  prerequisites: z.array(z.object({
    kind: z.literal("free_action"),
    description: z.string().min(1).max(240),
    subjectRef: z.string().min(1).max(120),
  }).strict()).max(3),
  continuation: z.object({
    actionKind: CompatibleActionKindSchema,
    instrumentRef: z.string().min(1).max(120).optional(),
    description: z.string().min(1).max(240),
  }).strict(),
  setupTurns: z.number().int().min(0).max(3),
  expectedProgress: z.string().min(1).max(240),
  expectedCausalPotential: WorldCausalEnvelopeSchema,
  risks: z.array(z.string().min(1).max(160)).max(4).default([]),
}).strict();
export type OpportunityChain = z.infer<typeof OpportunityChainSchema>;

export const FreeActionCanonicalRootSchema = z.object({
  ref: z.string().min(1).max(120),
  sourceRef: z.string().min(1).max(160),
  /** Minimal dispatch needed by the validator; interpretation remains open. */
  rootKind: z.enum(["object", "character", "scene"]).optional(),
  provenance: z.enum([
    "profile_appearance",
    "profile_equipment",
    "battlefield",
    "semantic_entity",
    "committed_event",
    "operation_result",
  ]),
  canonicalLabel: z.string().min(1).max(120).nullable(),
  description: z.string().min(1).max(600),
  existingEntityId: z.string().min(1).max(120).optional(),
  /** Server-only coarse physical reach from each actor to this root. */
  canonicalAccessByActor: z.object({
    a: WorldDistanceSchema.optional(),
    b: WorldDistanceSchema.optional(),
  }).strict().optional(),
  perceivedBy: z.object({
    a: z.string().min(1).max(240).optional(),
    b: z.string().min(1).max(240).optional(),
  }).strict(),
}).strict();
export type FreeActionCanonicalRoot = z.infer<
  typeof FreeActionCanonicalRootSchema
>;

/** Generic proposed state delta. The server owns the allowed path policy. */
export const FreeActionStateChangeSchema = z.object({
  target: z.enum(["subject", "actor", "counterpart"]),
  path: z.string().min(1).max(120),
  value: z.unknown(),
}).strict();
export type FreeActionStateChange = z.infer<
  typeof FreeActionStateChangeSchema
>;

export const FreeActionAdjudicationProposalSchema = z.object({
  actorSide: z.enum(["a", "b"]),
  outcome: z.enum(["possible", "impossible", "contested"]),
  interpretation: z.string().min(1).max(400),
  subject: z.object({
    rootRef: z.string().min(1).max(120),
    candidateKey: z.string().min(1).max(80),
    canonicalLabel: z.string().min(1).max(120).nullable(),
    description: z.string().min(1).max(600),
    portable: z.boolean(),
    usable: z.boolean(),
    knownOpenAspects: z.array(z.string().min(1).max(80)).max(8).default([]),
    causalEnvelope: WorldCausalEnvelopeSchema.default({}),
  }).strict().optional(),
  changes: z.array(FreeActionStateChangeSchema).max(8).default([]),
  successSummary: z.string().min(1).max(400),
  failureSummary: z.string().min(1).max(400),
}).strict();
export type FreeActionAdjudicationProposal = z.infer<
  typeof FreeActionAdjudicationProposalSchema
>;

export const FreeActionAdjudicationBatchSchema = z.object({
  proposals: z.array(FreeActionAdjudicationProposalSchema).max(2),
}).strict();
export type FreeActionAdjudicationBatch = z.infer<
  typeof FreeActionAdjudicationBatchSchema
>;

export const FreeActionResolutionReceiptSchema = z.object({
  actionId: z.string().min(1).max(120),
  actorSide: z.enum(["a", "b"]),
  intentText: z.string().min(1).max(600),
  outcome: z.enum(["accepted", "partial", "failed", "contested"]),
  reason: z.enum([
    "accepted",
    "adjudication_unavailable",
    "impossible",
    "contested",
    "invalid_proposal",
    "missing_canonical_root",
    "operation_rejected",
  ]),
  subjectRef: z.string().min(1).max(120).nullable(),
  canonicalEntityId: z.string().min(1).max(120).nullable(),
  promotion: z.enum([
    "not_needed",
    "promoted",
    "already_promoted",
    "rejected",
  ]),
  operationKinds: z.array(z.string().min(1).max(80)).max(12),
  summary: z.string().min(1).max(400),
}).strict();
export type FreeActionResolutionReceipt = z.infer<
  typeof FreeActionResolutionReceiptSchema
>;
