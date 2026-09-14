import { z } from "zod";
import { CharacterDefinitionV3ObjectSchema } from "./character-definition-v3.js";
import type { CharacterSemanticMigrationOperationV1 } from "./character-semantic-change-set.js";
import { CharacterActionDefinitionV2Schema } from "./structured-character.js";

const IdSchema = z.string().min(1).max(160);
const v3 = CharacterDefinitionV3ObjectSchema.shape;

function uniqueTargetKeys<T extends { op: string }>(
  items: readonly T[],
  targetKey: (item: T) => string,
  context: z.RefinementCtx,
) {
  const keys = items.map(targetKey);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "operation target keys must be unique",
    });
  }
}

const ActionSemanticsSchema = CharacterActionDefinitionV2Schema.omit({ mechanics: true });
const InventorySemanticsSchema = v3.inventory.element.pick({
  id: true,
  name: true,
  kind: true,
  description: true,
});

export const CharacterReplaceIdentityV1Schema = z.object({
  op: z.literal("replace_identity"),
  value: v3.identity,
}).strict();

export const CharacterUpsertBackgroundV1Schema = z.object({
  op: z.literal("upsert_background"),
  value: v3.profileBackground.element,
}).strict();

export const CharacterRemoveBackgroundV1Schema = z.object({
  op: z.literal("remove_background"),
  id: IdSchema,
}).strict();

export const CharacterReplacePsycheDynamicsV1Schema = z.object({
  op: z.literal("replace_psyche_dynamics"),
  value: v3.psycheDisposition.shape.dynamics,
}).strict();

export const CharacterUpsertCoreNeedV1Schema = z.object({
  op: z.literal("upsert_core_need"),
  value: v3.psycheDisposition.shape.coreNeeds.element,
}).strict();

export const CharacterRemoveCoreNeedV1Schema = z.object({
  op: z.literal("remove_core_need"),
  id: IdSchema,
}).strict();

export const CharacterUpsertTendencyV1Schema = z.object({
  op: z.literal("upsert_tendency"),
  value: v3.psycheDisposition.shape.tendencies.element,
}).strict();

export const CharacterRemoveTendencyV1Schema = z.object({
  op: z.literal("remove_tendency"),
  id: IdSchema,
}).strict();

export const CharacterSetPsycheDescriptionV1Schema = z.object({
  op: z.literal("set_psyche_description"),
  value: v3.psycheDisposition.shape.description,
}).strict();

export const CharacterUpsertConsciousGuidanceV1Schema = z.object({
  op: z.literal("upsert_conscious_guidance"),
  value: v3.consciousGuidance.element,
}).strict();

export const CharacterRemoveConsciousGuidanceV1Schema = z.object({
  op: z.literal("remove_conscious_guidance"),
  id: IdSchema,
}).strict();

export const CharacterSetActionSemanticsV1Schema = z.object({
  op: z.literal("set_action_semantics"),
  value: ActionSemanticsSchema,
}).strict();

export const CharacterSetInventorySemanticsV1Schema = z.object({
  op: z.literal("set_inventory_semantics"),
  value: InventorySemanticsSchema,
}).strict();

export const CharacterUpsertActionNormV1Schema = z.object({
  op: z.literal("upsert_action_norm"),
  value: v3.actionNorms.element,
}).strict();

export const CharacterRemoveActionNormV1Schema = z.object({
  op: z.literal("remove_action_norm"),
  id: IdSchema,
}).strict();

export const CharacterUpsertMechanicalFallbackV1Schema = z.object({
  op: z.literal("upsert_mechanical_fallback"),
  value: v3.mechanicalConflictFallbacks.element,
}).strict();

export const CharacterRemoveMechanicalFallbackV1Schema = z.object({
  op: z.literal("remove_mechanical_fallback"),
  id: IdSchema,
}).strict();

export const CharacterUpsertRelationshipSeedV1Schema = z.object({
  op: z.literal("upsert_relationship_seed"),
  value: v3.relationshipSeeds.element,
}).strict();

export const CharacterRemoveRelationshipSeedV1Schema = z.object({
  op: z.literal("remove_relationship_seed"),
  id: IdSchema,
}).strict();

export const CharacterReplaceSpeechPolicyV1Schema = z.object({
  op: z.literal("replace_speech_policy"),
  value: v3.speechPolicy,
}).strict();

export const CharacterSetAppearanceSummaryV1Schema = z.object({
  op: z.literal("set_appearance_summary"),
  value: v3.appearance.shape.publicSummary,
}).strict();

export const CharacterUpsertAppearanceDetailV1Schema = z.object({
  op: z.literal("upsert_appearance_detail"),
  value: v3.appearance.shape.details.element,
}).strict();

export const CharacterRemoveAppearanceDetailV1Schema = z.object({
  op: z.literal("remove_appearance_detail"),
  id: IdSchema,
}).strict();

export const CharacterSetVisualPromptV1Schema = z.object({
  op: z.literal("set_visual_prompt"),
  value: v3.appearance.shape.visualPrompt,
}).strict();

export const CharacterSetExpressionNotesV1Schema = z.object({
  op: z.literal("set_expression_notes"),
  value: v3.expressionNotes,
}).strict();

export const CharacterCandidateOperationV1Schema = z.discriminatedUnion("op", [
  CharacterReplaceIdentityV1Schema,
  CharacterUpsertBackgroundV1Schema,
  CharacterRemoveBackgroundV1Schema,
  CharacterReplacePsycheDynamicsV1Schema,
  CharacterUpsertCoreNeedV1Schema,
  CharacterRemoveCoreNeedV1Schema,
  CharacterUpsertTendencyV1Schema,
  CharacterRemoveTendencyV1Schema,
  CharacterSetPsycheDescriptionV1Schema,
  CharacterUpsertConsciousGuidanceV1Schema,
  CharacterRemoveConsciousGuidanceV1Schema,
  CharacterSetActionSemanticsV1Schema,
  CharacterSetInventorySemanticsV1Schema,
  CharacterUpsertActionNormV1Schema,
  CharacterRemoveActionNormV1Schema,
  CharacterUpsertMechanicalFallbackV1Schema,
  CharacterRemoveMechanicalFallbackV1Schema,
  CharacterUpsertRelationshipSeedV1Schema,
  CharacterRemoveRelationshipSeedV1Schema,
  CharacterReplaceSpeechPolicyV1Schema,
  CharacterSetAppearanceSummaryV1Schema,
  CharacterUpsertAppearanceDetailV1Schema,
  CharacterRemoveAppearanceDetailV1Schema,
  CharacterSetVisualPromptV1Schema,
  CharacterSetExpressionNotesV1Schema,
]);

export type CharacterCandidateOperationV1 = z.infer<typeof CharacterCandidateOperationV1Schema>;

const skeletonOps = [
  "replace_identity",
  "upsert_background",
  "remove_background",
  "replace_psyche_dynamics",
  "upsert_core_need",
  "remove_core_need",
  "upsert_tendency",
  "remove_tendency",
  "set_psyche_description",
  "upsert_conscious_guidance",
  "remove_conscious_guidance",
  "set_action_semantics",
  "set_inventory_semantics",
  "upsert_action_norm",
  "upsert_mechanical_fallback",
  "upsert_relationship_seed",
] as const;

export function characterOperationTargetKeyV1(operation: CharacterCandidateOperationV1): string {
  switch (operation.op) {
    case "replace_identity":
      return "identity";
    case "upsert_background":
      return `profileBackground:${operation.value.id}`;
    case "remove_background":
      return `profileBackground:${operation.id}`;
    case "replace_psyche_dynamics":
      return "psycheDisposition:dynamics";
    case "upsert_core_need":
      return `psycheDisposition:coreNeeds:${operation.value.id}`;
    case "remove_core_need":
      return `psycheDisposition:coreNeeds:${operation.id}`;
    case "upsert_tendency":
      return `psycheDisposition:tendencies:${operation.value.id}`;
    case "remove_tendency":
      return `psycheDisposition:tendencies:${operation.id}`;
    case "set_psyche_description":
      return "psycheDisposition:description";
    case "upsert_conscious_guidance":
      return `consciousGuidance:${operation.value.id}`;
    case "remove_conscious_guidance":
      return `consciousGuidance:${operation.id}`;
    case "set_action_semantics":
      return `capabilities:actions:${operation.value.id}`;
    case "set_inventory_semantics":
      return `inventory:${operation.value.id}`;
    case "upsert_action_norm":
      return `actionNorms:${operation.value.id}`;
    case "remove_action_norm":
      return `actionNorms:${operation.id}`;
    case "upsert_mechanical_fallback":
      return `mechanicalConflictFallbacks:${operation.value.id}`;
    case "remove_mechanical_fallback":
      return `mechanicalConflictFallbacks:${operation.id}`;
    case "upsert_relationship_seed":
      return `relationshipSeeds:${operation.value.id}`;
    case "remove_relationship_seed":
      return `relationshipSeeds:${operation.id}`;
    case "replace_speech_policy":
      return "speechPolicy";
    case "set_appearance_summary":
      return "appearance:publicSummary";
    case "upsert_appearance_detail":
      return `appearance:details:${operation.value.id}`;
    case "remove_appearance_detail":
      return `appearance:details:${operation.id}`;
    case "set_visual_prompt":
      return "appearance:visualPrompt";
    case "set_expression_notes":
      return "expressionNotes";
  }
}

export const CharacterSkeletonPhaseOperationV1Schema = CharacterCandidateOperationV1Schema
  .superRefine((operation, context) => {
    if (!(skeletonOps as readonly string[]).includes(operation.op)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "operation is outside the skeleton phase union",
      });
    }
  });

export const SourceDispositionDecisionV1Schema = z.object({
  sourceClaimId: IdSchema,
  disposition: z.enum([
    "preserve",
    "transform",
    "split",
    "merge",
    "supersede",
    "discard-as-nonmaterial",
    "preserve-in-capsule",
  ]),
  targetClaimIds: z.array(IdSchema).max(12).superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetClaimIds must be unique",
      });
    }
  }),
  rationale: z.string().min(1).max(400),
}).strict();

const uniqueOperations = <Schema extends z.ZodType<CharacterCandidateOperationV1>>(schema: Schema) =>
  z.array(schema).min(1).max(8).superRefine((operations, context) => {
    uniqueTargetKeys(operations, characterOperationTargetKeyV1, context);
  });

function uniqueIds(minimum: number, maximum: number) {
  return z.array(IdSchema).min(minimum).max(maximum).superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ids must be unique",
      });
    }
  });
}

const clusterName = z.enum(["mechanics", "relationship-expression", "appearance"]);

export const CharacterSkeletonPayloadV1Schema = z.object({
  kind: z.literal("set_skeleton"),
  operations: uniqueOperations(CharacterSkeletonPhaseOperationV1Schema),
}).strict();

export const CharacterClusterPayloadV1Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("complete_cluster"),
    cluster: clusterName,
    operations: uniqueOperations(CharacterCandidateOperationV1Schema),
  }).strict(),
  z.object({
    kind: z.literal("repair_cluster"),
    cluster: clusterName,
    operations: uniqueOperations(CharacterCandidateOperationV1Schema),
  }).strict(),
]);

export const CharacterLedgerPayloadV1Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("classify_source_disposition"),
    decisions: z.array(SourceDispositionDecisionV1Schema).min(1).max(24).superRefine((decisions, context) => {
      const ids = decisions.map((decision) => decision.sourceClaimId);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "sourceClaimId values must be unique",
        });
      }
    }),
  }).strict(),
  z.object({
    kind: z.literal("propose_deferral"),
    obligationIds: uniqueIds(1, 24),
    resolution: z.enum(["generate-later", "derive-later", "owner-answer"]),
    reason: z.string().min(1).max(400),
  }).strict(),
  z.object({
    kind: z.literal("submit_lens_review"),
    lens: z.enum(["source-consistency", "cross-reference", "authority", "disclosure", "compiler"]),
    findingIds: uniqueIds(1, 24),
    verdict: z.enum(["pass", "repair-required"]),
  }).strict(),
]);

export const CharacterProposalPayloadV1Schema = z.union([
  CharacterSkeletonPayloadV1Schema,
  CharacterClusterPayloadV1Schema,
  CharacterLedgerPayloadV1Schema,
]);

export type CharacterProposalPayloadV1 = z.infer<typeof CharacterProposalPayloadV1Schema>;

export function bridgeCharacterMigrationOperationV1(
  operation: CharacterSemanticMigrationOperationV1,
): CharacterProposalPayloadV1 | null {
  if (operation.operation === "copy" && operation.provenance === "unchanged") {
    const sourceClaimId = operation.sourcePaths[0];
    if (!sourceClaimId) {
      return null;
    }
    return {
      kind: "classify_source_disposition",
      decisions: [{
        sourceClaimId,
        disposition: "preserve",
        targetClaimIds: [operation.targetPath],
        rationale: operation.explanation.slice(0, 400),
      }],
    };
  }
  if (operation.operation === "transform" && operation.provenance === "source_derived") {
    const sourceClaimId = operation.sourcePaths[0];
    if (!sourceClaimId) {
      return null;
    }
    return {
      kind: "classify_source_disposition",
      decisions: [{
        sourceClaimId,
        disposition: "transform",
        targetClaimIds: [operation.targetPath],
        rationale: operation.explanation.slice(0, 400),
      }],
    };
  }
  if (operation.operation === "retire_to_capsule" && operation.provenance === "retired") {
    const sourceClaimId = operation.sourcePaths[0] ?? operation.targetPath;
    return {
      kind: "classify_source_disposition",
      decisions: [{
        sourceClaimId,
        disposition: "preserve-in-capsule",
        targetClaimIds: [],
        rationale: operation.explanation.slice(0, 400),
      }],
    };
  }
  if (operation.operation === "defer" && operation.provenance === "deferred") {
    return {
      kind: "propose_deferral",
      obligationIds: [operation.targetPath],
      resolution: "generate-later",
      reason: operation.explanation.slice(0, 400),
    };
  }
  return null;
}

export const CHARACTER_AUTHORING_ADAPTER_IDENTITY_V1 = "character-semantic-authoring-v3" as const;
export const CHARACTER_SKELETON_PROPOSAL_SCHEMA_V1 = "character_authoring_skeleton_proposal_v1" as const;
export const CHARACTER_CLUSTER_PROPOSAL_SCHEMA_V1 = "character_authoring_cluster_proposal_v1" as const;
export const CHARACTER_LEDGER_PROPOSAL_SCHEMA_V1 = "character_authoring_ledger_proposal_v1" as const;
