import { isDeepStrictEqual } from "node:util";
import { CharacterDefinitionV2Schema, CharacterActionNormV3Schema,
  type CharacterActionNormV2, type CharacterDefinitionV3,
  type MigrationPreservationCapsuleV1, type ProposalProvenanceV1,
  type SourceDispositionDecisionV1 } from "@kshiai/shared";

/** Frozen source fragments stay server-side; projections select individual claims. */
export type CharacterSourceClaimV1 = Readonly<{
  sourceClaimId: string;
  targetClaimId: string;
  original: unknown;
  expectedCopy: unknown;
  capsuleCopyAvailable: boolean;
}>;

export function splitCharacterV2NormV1(norm: CharacterActionNormV2) {
  const { selfAwareness, response, ...rest } = norm;
  const { statement, fallbackActionRef, ...selection } = response;
  const executable = { ...rest, response: selection };
  return { executable, legacyMeaning: { statement, selfAwareness, fallbackActionRef },
    compatible: CharacterActionNormV3Schema.safeParse(executable) };
}

export function characterClaimValueV1(candidate: CharacterDefinitionV3, claimId: string): unknown {
  if (claimId.startsWith("actionNorms:")) {
    return candidate.actionNorms.find((norm) => norm.id === claimId.slice("actionNorms:".length));
  }
  if (claimId.startsWith("consciousGuidance:")) {
    return candidate.consciousGuidance.find((entry) =>
      entry.id === claimId.slice("consciousGuidance:".length));
  }
  if (claimId.startsWith("mechanicalConflictFallbacks:")) {
    return candidate.mechanicalConflictFallbacks.find((entry) =>
      entry.id === claimId.slice("mechanicalConflictFallbacks:".length));
  }
  if (claimId.startsWith("capabilities:actions:")) {
    const id = claimId.slice("capabilities:actions:".length);
    return candidate.capabilities.basicAction.id === id
      ? candidate.capabilities.basicAction
      : candidate.capabilities.skills.find((entry) => entry.id === id);
  }
  if (claimId.startsWith("inventory:")) {
    return candidate.inventory.find((entry) => entry.id === claimId.slice("inventory:".length));
  }
  if (claimId.startsWith("profileBackground:")) {
    return candidate.profileBackground.find((entry) =>
      entry.id === claimId.slice("profileBackground:".length));
  }
  if (claimId.startsWith("psycheDisposition:coreNeeds:")) {
    return candidate.psycheDisposition.coreNeeds.find((entry) =>
      entry.id === claimId.slice("psycheDisposition:coreNeeds:".length));
  }
  if (claimId.startsWith("psycheDisposition:tendencies:")) {
    return candidate.psycheDisposition.tendencies.find((entry) =>
      entry.id === claimId.slice("psycheDisposition:tendencies:".length));
  }
  if (claimId === "psycheDisposition:dynamicsVersion") return candidate.psycheDisposition.dynamicsVersion;
  if (claimId === "psycheDisposition:dynamics") return candidate.psycheDisposition.dynamics;
  if (claimId === "psycheDisposition:description") return candidate.psycheDisposition.description;
  if (claimId.startsWith("relationshipSeeds:")) {
    return candidate.relationshipSeeds.find((entry) =>
      entry.id === claimId.slice("relationshipSeeds:".length));
  }
  if (claimId === "appearance:publicSummary") return candidate.appearance.publicSummary;
  if (claimId === "appearance:visualPrompt") return candidate.appearance.visualPrompt;
  if (claimId === "appearance:portrait") return candidate.appearance.portrait;
  if (claimId.startsWith("appearance:details:")) {
    return candidate.appearance.details.find((entry) =>
      entry.id === claimId.slice("appearance:details:".length));
  }
  return Object.entries(candidate).find(([key]) => key === claimId)?.[1];
}

export function characterSourceCopyMatchesV1(candidate: CharacterDefinitionV3, claim: CharacterSourceClaimV1) {
  return isDeepStrictEqual(characterClaimValueV1(candidate, claim.targetClaimId), claim.expectedCopy);
}

export function characterSourceDispositionSatisfiedV1(
  candidate: CharacterDefinitionV3,
  claim: CharacterSourceClaimV1,
  decision: SourceDispositionDecisionV1,
  provenance: readonly ProposalProvenanceV1[],
): boolean {
  if (decision.sourceClaimId !== claim.sourceClaimId) return false;
  if (decision.disposition === "preserve") {
    return decision.targetClaimIds.length === 1
      && decision.targetClaimIds[0] === claim.targetClaimId
      && characterSourceCopyMatchesV1(candidate, claim);
  }
  if (decision.disposition === "preserve-in-capsule") {
    return decision.targetClaimIds.length === 0 && claim.capsuleCopyAvailable;
  }
  if (decision.disposition === "discard-as-nonmaterial") return false;
  if (decision.targetClaimIds.length === 0) return false;
  const targetsAreProvenanced = decision.targetClaimIds.every((targetClaimId) =>
    characterClaimValueV1(candidate, targetClaimId) !== undefined
      && provenance.some((entry) => entry.targetClaimId === targetClaimId
        && entry.sourceClaimIds.includes(claim.sourceClaimId)
        && entry.method !== "generated"),
  );
  if (!targetsAreProvenanced) return false;
  if (!claim.sourceClaimId.endsWith(":legacyMeaning")) return true;
  if (typeof claim.original !== "object" || claim.original === null) return false;
  const legacy = claim.original as { statement?: unknown; selfAwareness?: unknown; fallbackActionRef?: unknown };
  const guidanceMatches = decision.targetClaimIds.some((targetClaimId) => {
    const target = characterClaimValueV1(candidate, targetClaimId);
    return targetClaimId.startsWith("consciousGuidance:")
      && typeof target === "object" && target !== null
      && "statement" in target && target.statement === legacy.statement
      && "selfAwareness" in target && target.selfAwareness === legacy.selfAwareness;
  });
  if (!guidanceMatches) return false;
  if (legacy.fallbackActionRef == null) return true;
  return decision.targetClaimIds.some((targetClaimId) => {
    const target = characterClaimValueV1(candidate, targetClaimId);
    return targetClaimId.startsWith("mechanicalConflictFallbacks:")
      && typeof target === "object" && target !== null
      && "orderedActionRefs" in target && Array.isArray(target.orderedActionRefs)
      && target.orderedActionRefs.includes(legacy.fallbackActionRef);
  });
}

export function buildCharacterMigrationSourceLedgerV1(
  definition: unknown,
  candidate: CharacterDefinitionV3,
  capsule: MigrationPreservationCapsuleV1 | null = null,
) {
  const source = CharacterDefinitionV2Schema.parse(definition);
  const claims: CharacterSourceClaimV1[] = [];
  const addClaim = (claim: Omit<CharacterSourceClaimV1, "capsuleCopyAvailable">) => {
    claims.push({ ...claim, capsuleCopyAvailable: capsule?.entries.some((entry) =>
      entry.sourcePath === claim.sourceClaimId && isDeepStrictEqual(entry.value, claim.original)) ?? false });
  };
  const exact = (claimId: string, value: unknown, expectedCopy: unknown = value) =>
    addClaim({ sourceClaimId: claimId, targetClaimId: claimId, original: value, expectedCopy });
  exact("schemaVersion", source.schemaVersion, 3);
  exact("identity", source.identity);
  exact("appearance:publicSummary", source.appearance.publicSummary);
  for (const detail of source.appearance.details) exact(`appearance:details:${detail.id}`, detail);
  exact("appearance:visualPrompt", source.appearance.visualPrompt);
  exact("appearance:portrait", source.appearance.portrait);
  for (const background of source.profileBackground) exact(`profileBackground:${background.id}`, background);
  exact("psycheDisposition:dynamicsVersion", source.psycheDisposition.dynamicsVersion);
  exact("psycheDisposition:dynamics", source.psycheDisposition.dynamics);
  for (const need of source.psycheDisposition.coreNeeds) {
    exact(`psycheDisposition:coreNeeds:${need.id}`, need);
  }
  for (const tendency of source.psycheDisposition.tendencies) {
    exact(`psycheDisposition:tendencies:${tendency.id}`, tendency);
  }
  exact("psycheDisposition:description", source.psycheDisposition.description);
  for (const norm of source.actionNorms) {
    const split = splitCharacterV2NormV1(norm);
    exact(`actionNorms:${norm.id}`, split.executable);
    exact(`actionNorms:${norm.id}:legacyMeaning`, split.legacyMeaning);
  }
  exact("speechPolicy", source.speechPolicy);
  for (const relationship of source.relationshipSeeds) exact(`relationshipSeeds:${relationship.id}`, relationship);
  exact("combat", source.combat);
  exact(`capabilities:actions:${source.capabilities.basicAction.id}`, source.capabilities.basicAction);
  for (const skill of source.capabilities.skills) exact(`capabilities:actions:${skill.id}`, skill);
  for (const item of source.inventory) exact(`inventory:${item.id}`, item);
  exact("initialLoadout", source.initialLoadout);
  exact("expressionNotes", source.expressionNotes);
  const sourceDispositions = new Map<string, SourceDispositionDecisionV1>();
  const provenance = new Map<string, readonly ProposalProvenanceV1[]>();
  for (const claim of claims) {
    if (!characterSourceCopyMatchesV1(candidate, claim) && !claim.capsuleCopyAvailable) continue;
    if (claim.capsuleCopyAvailable && !characterSourceCopyMatchesV1(candidate, claim)) {
      sourceDispositions.set(claim.sourceClaimId, {
        sourceClaimId: claim.sourceClaimId,
        disposition: "preserve-in-capsule",
        targetClaimIds: [],
        rationale: "Server-verified exact copy in the frozen migration preservation capsule.",
      });
      continue;
    }
    sourceDispositions.set(claim.sourceClaimId, {
      sourceClaimId: claim.sourceClaimId,
      disposition: claim.sourceClaimId === "schemaVersion" ? "transform" : "preserve",
      targetClaimIds: [claim.targetClaimId],
      rationale: claim.sourceClaimId === "schemaVersion"
        ? "Accepted V2-to-V3 version transition." : "Server-verified exact copy from frozen V2 source.",
    });
    provenance.set(claim.targetClaimId, [{ targetClaimId: claim.targetClaimId,
      sourceClaimIds: [claim.sourceClaimId], method: claim.sourceClaimId === "schemaVersion" ? "derived" : "preserved" }]);
  }
  return { claims, sourceDispositions, provenance };
}
