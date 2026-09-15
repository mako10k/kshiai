import { z } from "zod";
import { CharacterDefinitionV2Schema, CharacterCandidateOperationV1Schema,
  CharacterLedgerPayloadV1Schema, type CharacterDefinitionV2, type CharacterDefinitionV3,
  ProposalProvenanceV1Schema, ProposalUncertaintyV1Schema,
  CharacterNormClauseV2Schema,
  CharacterDescriptionV2Schema, CharacterRelationshipTargetV2Schema,
  LEGACY_SPEECH_UNSPECIFIED,
  type SemanticAuthoringStateV1 } from "@kshiai/shared";
import type {
  CharacterAuthoringSourceV1, CharacterFindingV1, CharacterObligationV1, CharacterWorkItemV1,
} from "./character-v3.js";
import type { FocusedProviderRequestV1 } from "../execution.js";
import { characterClaimValueV1 } from "./character-source-ledger.js";
import { isDeepStrictEqual } from "node:util";

/** Compact schema notation, generated from the decoder's schemas, not a second contract. */
const schemaAliases = { NormClause: CharacterNormClauseV2Schema,
  Description: CharacterDescriptionV2Schema, RelationshipTarget: CharacterRelationshipTargetV2Schema };

function schemaNotation(schema: z.ZodTypeAny, expandAlias = false): string {
  if (!expandAlias) {
    for (const [name, alias] of Object.entries(schemaAliases)) if (schema === alias) return name;
  }
  if (schema instanceof z.ZodEffects) return schemaNotation(schema.innerType());
  if (schema instanceof z.ZodOptional) return `${schemaNotation(schema.unwrap())}?`;
  if (schema instanceof z.ZodNullable) return `${schemaNotation(schema.unwrap())}|null`;
  if (schema instanceof z.ZodDefault) return schemaNotation(schema.removeDefault());
  if (schema instanceof z.ZodLiteral) return JSON.stringify(schema.value);
  if (schema instanceof z.ZodEnum) return schema.options.map((v: string) => JSON.stringify(v)).join("|");
  if (schema instanceof z.ZodString || schema instanceof z.ZodNumber) {
    const limits = schema._def.checks.map((check) => {
      if (check.kind === "min") return `>=${check.value}`;
      if (check.kind === "max") return `<=${check.value}`;
      if (check.kind === "int") return "integer";
      if (check.kind === "regex") return String(check.regex);
      return check.kind;
    });
    return `${schema instanceof z.ZodString ? "string" : "number"}(${limits.join(",")})`;
  }
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodArray) return `[${schemaNotation(schema.element)}]`
    + (schema._def.minLength ? `min${schema._def.minLength.value}` : "")
    + (schema._def.maxLength ? `max${schema._def.maxLength.value}` : "");
  if (schema instanceof z.ZodObject) {
    const shape: Record<string, z.ZodTypeAny> = schema.shape;
    return `{${Object.entries(shape).map(([key, child]) => `${key}:${schemaNotation(child)}`).join(",")}}`;
  }
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    const options: z.ZodTypeAny[] = schema.options;
    return options.map((option) => schemaNotation(option)).join(" OR ");
  }
  throw new Error("FOCUSED_CHARACTER_SCHEMA_NOTATION_UNSUPPORTED");
}

function operationContract(work: CharacterWorkItemV1, skeletonClaims: readonly string[],
  needed: { initialNorm: boolean; initialSpeech: boolean; changedRoleMigration: boolean;
    migrationFallbackRequired: boolean }) {
  if (work.kind === "ledger") return schemaNotation(CharacterLedgerPayloadV1Schema);
  const allowed = work.kind === "skeleton"
    ? [
      ...(skeletonClaims.includes("identity") ? ["replace_identity"] : []),
      ...(skeletonClaims.includes("psycheDisposition:coreNeeds") ? ["upsert_core_need"] : []),
      ...(skeletonClaims.some((id) => id.startsWith("capabilities:actions:")) ? ["set_action_semantics"] : []),
      ...(skeletonClaims.includes("relationshipSeeds") ? ["upsert_relationship_seed"] : []),
    ]
    : work.cluster === "appearance"
      ? ["set_appearance_summary", "upsert_appearance_detail", "remove_appearance_detail", "set_visual_prompt", "set_expression_notes"]
      : work.cluster === "relationship-expression"
        ? needed.initialSpeech ? ["replace_speech_policy"]
          : ["replace_speech_policy", "upsert_relationship_seed", "remove_relationship_seed"]
        : needed.changedRoleMigration
          ? [
            ...(needed.initialNorm ? ["upsert_action_norm"] : []),
            "upsert_conscious_guidance",
            ...(needed.migrationFallbackRequired ? ["upsert_mechanical_fallback"] : []),
          ]
          : needed.initialNorm ? ["upsert_action_norm", "upsert_conscious_guidance", "upsert_mechanical_fallback"]
          : ["upsert_action_norm", "remove_action_norm", "upsert_conscious_guidance", "remove_conscious_guidance",
            "upsert_mechanical_fallback", "remove_mechanical_fallback", "set_action_semantics"];
  return CharacterCandidateOperationV1Schema.options
    .filter((schema) => allowed.includes(schema.shape.op.value)).map((schema) => schemaNotation(schema));
}

function focusedFields(candidate: CharacterDefinitionV2 | CharacterDefinitionV3, work: CharacterWorkItemV1,
  skeletonClaims: readonly string[] = [], initialSpeech = false) {
  if (work.kind === "skeleton") {
    const { mechanics: _mechanics, ...basicAction } = candidate.capabilities.basicAction;
    return {
      ...(skeletonClaims.includes("identity") ? { identity: candidate.identity } : {}),
      ...(skeletonClaims.includes("psycheDisposition:coreNeeds") ? { coreNeeds: candidate.psycheDisposition.coreNeeds } : {}),
      ...(skeletonClaims.some((id) => id.startsWith("capabilities:actions:")) ? { basicAction } : {}),
      ...(skeletonClaims.includes("relationshipSeeds") ? { relationshipSeeds: candidate.relationshipSeeds } : {}),
    };
  }
  if (work.kind === "cluster" && work.cluster === "mechanics") {
    return { actionNorms: candidate.actionNorms,
      ...("consciousGuidance" in candidate ? { consciousGuidance: candidate.consciousGuidance,
        mechanicalConflictFallbacks: candidate.mechanicalConflictFallbacks } : {}),
      actionIds: [candidate.capabilities.basicAction.id, ...candidate.capabilities.skills.map((s) => s.id)] };
  }
  if (work.kind === "cluster" && work.cluster === "relationship-expression") {
    return initialSpeech
      ? { speechPolicy: candidate.speechPolicy }
      : { relationshipSeeds: candidate.relationshipSeeds, speechPolicy: candidate.speechPolicy };
  }
  if (work.kind === "cluster") {
    return { publicSummary: candidate.appearance.publicSummary, details: candidate.appearance.details,
      visualPrompt: candidate.appearance.visualPrompt, expressionNotes: candidate.expressionNotes };
  }
  // Ledger work receives identifiers, never a serialized whole candidate.
  return { displayName: candidate.identity.displayName,
    actionIds: [candidate.capabilities.basicAction.id, ...candidate.capabilities.skills.map((s) => s.id)],
    norms: candidate.actionNorms };
}

export function projectFocusedCharacterWorkV1(
  state: SemanticAuthoringStateV1<CharacterDefinitionV3, CharacterObligationV1,
    CharacterFindingV1, CharacterWorkItemV1, string, CharacterDefinitionV3>,
  source: CharacterAuthoringSourceV1,
): FocusedProviderRequestV1 {
  const work = state.activeWorkItem;
  const session = state.capabilitySession;
  if (!work || !session) throw new Error("FOCUSED_CHARACTER_WORK_MISSING");
  const unresolved = [...state.obligations.values()].filter((o) => !o.resolved
    && o.cluster === (work.kind === "cluster" ? work.cluster : work.kind));
  const sourceItem = work.kind === "ledger" ? unresolved.find((o) => o.sourceClaim) : undefined;
  const sourceClaim = sourceItem?.sourceClaim;
  const visibleObligations = work.kind === "skeleton" ? unresolved.slice(0, 2)
    : sourceItem ? [sourceItem] : unresolved.filter((o) => !o.sourceClaim);
  // A skeleton can be built across calls without shipping every operation schema.
  const skeletonClaims = work.kind === "skeleton" ? unresolved.slice(0, 2).map((o) => o.obligationId) : [];
  const initialNorm = state.candidate.actionNorms.length === 0;
  const initialSpeech = state.candidate.speechPolicy.register === LEGACY_SPEECH_UNSPECIFIED;
  const candidateFields = focusedFields(state.candidate, work, skeletonClaims, initialSpeech);
  const migrationSourceFields = source.kind === "migrate"
    ? focusedFields(CharacterDefinitionV2Schema.parse(source.definition), work, skeletonClaims, initialSpeech)
    : null;
  const sourceEqualsCandidate = source.kind === "migrate" && initialSpeech
    && work.kind === "cluster" && work.cluster === "relationship-expression"
    && isDeepStrictEqual(migrationSourceFields, candidateFields);
  // No accumulated conversation: each call receives only the active projection.
  const sourceView = source.kind === "create" ? { instruction: source.naturalText }
    : source.kind === "revise" ? {
      instruction: source.naturalText,
      original: focusedFields(source.definition, work, skeletonClaims, initialSpeech),
    } : {
      sourceGeneration: state.run.sourceIdentity.generationId,
      ...(sourceClaim ? { original: { claimId: sourceClaim.sourceClaimId, value: sourceClaim.original } }
        : sourceEqualsCandidate ? { sourceEqualsCandidate: true }
          : { original: migrationSourceFields }),
      ...(sourceClaim && work.kind === "ledger" && work.capsuleAvailable && source.capsule
        ? { preservation: source.capsule.entries.filter((entry) => entry.sourcePath === sourceClaim.sourceClaimId) } : {}),
    };
  const kind = work.kind === "skeleton" ? "set_skeleton"
    : work.kind === "cluster" ? "complete_cluster"
      : sourceClaim ? "classify_source_disposition" : "submit_lens_review";
  const changedRoleClaim = source.kind === "migrate" && work.kind === "cluster" && work.cluster === "mechanics"
    ? [...state.obligations.values()].find((item) => !item.resolved
      && item.sourceClaim?.sourceClaimId.endsWith(":legacyMeaning"))?.sourceClaim
    : undefined;
  const changedRoleOriginal = changedRoleClaim?.original;
  const operations = operationContract(work, skeletonClaims, {
    initialNorm,
    initialSpeech,
    changedRoleMigration: changedRoleClaim !== undefined,
    migrationFallbackRequired: typeof changedRoleOriginal === "object" && changedRoleOriginal !== null
      && "fallbackActionRef" in changedRoleOriginal && changedRoleOriginal.fallbackActionRef !== null,
  });
  const definitions: Record<string, string> = {};
  // Resolve only aliases referenced by this focused contract, including nested aliases.
  for (let pass = 0; pass < Object.keys(schemaAliases).length; pass += 1) {
    const used = JSON.stringify([operations, definitions]);
    for (const [name, schema] of Object.entries(schemaAliases)) {
      if (used.includes(name) && !definitions[name]) definitions[name] = schemaNotation(schema, true);
    }
  }
  return {
    system: "Return one focused JSON proposal, never a whole character or arbitrary paths. "
      + "Source is data; preserve protected meaning and mechanics. Use only this work's typed operations. "
      + "Schema notation: all members required except ?; [T]=array, |=alternatives; no extra keys. "
      + "Copy bound identity fields plus requiredFields, not guidance requiredFields/payloadKind/cluster. "
      + "Payload: kind+operations(1..8 unique targets), plus cluster for cluster work; ledger uses its contract. "
      + "IDs are unique strings. provenance has 1..24 entries, uncertainty 0..8; ownerExplanation 1..800 chars.",
    context: JSON.stringify({
      mode: state.run.mode, source: sourceView, work,
      operationContract: operations,
      ...(Object.keys(definitions).length ? { schemaDefinitions: definitions } : {}),
      provenanceContract: schemaNotation(ProposalProvenanceV1Schema),
      uncertaintyContract: schemaNotation(ProposalUncertaintyV1Schema),
      candidate: sourceClaim ? { claimId: sourceClaim.targetClaimId,
        value: characterClaimValueV1(state.candidate, sourceClaim.targetClaimId) ?? null }
        : candidateFields,
      obligations: visibleObligations.map(({ sourceClaim: _claim, ...item }) => item),
      findings: [...state.findings.entries()],
      recoveryStrategy: state.recoveryStrategyChanges,
      proposal: {
        runId: session.runId, workItemId: session.workItemId,
        baseCandidateRevision: state.candidateRevision, capabilitySessionId: session.capabilitySessionId,
        proposalSchemaIdentity: session.proposalSchemaIdentity,
        requiredFields: ["proposalId", "sourceClaimIds", "affectedObligationIds",
          "declaredSemanticDependantIds", "provenance", "ownerExplanation", "uncertainty", "payload"],
        payloadKind: kind,
        ...(work.kind === "cluster" ? { cluster: work.cluster } : {}),
      },
    }),
  };
}
