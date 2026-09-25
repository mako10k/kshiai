import { isDeepStrictEqual } from "node:util";
import { CharacterDefinitionV2Schema, CharacterActionNormV3Schema,
  type CharacterActionNormV2, type CharacterCompilerCapabilitySetV1, type CharacterDefinitionV3,
  type MigrationPreservationCapsuleV1, type ProposalProvenanceV1,
  type SourceDispositionDecisionV1 } from "@kshiai/shared";

/** Frozen source fragments stay server-side; projections select individual claims. */
export type CharacterSourceClaimV1 = Readonly<{
  sourceClaimId: string;
  targetClaimId: string;
  original: unknown;
  expectedCopy: unknown;
  capsuleCopyAvailable: boolean;
  capsuleEntryPresent: boolean;
  nonmaterialDiscardEligible: boolean;
}>;

export function splitCharacterV2NormV1(norm: CharacterActionNormV2) {
  const { selfAwareness, response, ...rest } = norm;
  const { statement, fallbackActionRef, ...selection } = response;
  const executable = { ...rest, response: selection };
  return { executable, legacyMeaning: { statement, selfAwareness, fallbackActionRef },
    compatible: CharacterActionNormV3Schema.safeParse(executable) };
}

export function characterClaimValueV1(candidate: CharacterDefinitionV3, claimId: string): unknown {
  const exactValues: Record<string, unknown> = {
    "psycheDisposition:dynamicsVersion": candidate.psycheDisposition.dynamicsVersion,
    "psycheDisposition:dynamics": candidate.psycheDisposition.dynamics,
    "psycheDisposition:description": candidate.psycheDisposition.description,
    "appearance:publicSummary": candidate.appearance.publicSummary,
    "appearance:visualPrompt": candidate.appearance.visualPrompt,
    "appearance:portrait": candidate.appearance.portrait,
  };
  if (Object.prototype.hasOwnProperty.call(exactValues, claimId)) return exactValues[claimId];
  const collections = [
    ["actionNorms:", candidate.actionNorms],
    ["consciousGuidance:", candidate.consciousGuidance],
    ["mechanicalConflictFallbacks:", candidate.mechanicalConflictFallbacks],
    ["inventory:", candidate.inventory],
    ["profileBackground:", candidate.profileBackground],
    ["psycheDisposition:coreNeeds:", candidate.psycheDisposition.coreNeeds],
    ["psycheDisposition:tendencies:", candidate.psycheDisposition.tendencies],
    ["relationshipSeeds:", candidate.relationshipSeeds],
    ["appearance:details:", candidate.appearance.details],
  ] as const;
  const collection = collections.find(([prefix]) => claimId.startsWith(prefix));
  if (collection) {
    const [prefix, entries] = collection;
    return entries.find((entry) => entry.id === claimId.slice(prefix.length));
  }
  if (claimId.startsWith("capabilities:actions:")) {
    const id = claimId.slice("capabilities:actions:".length);
    return candidate.capabilities.basicAction.id === id
      ? candidate.capabilities.basicAction
      : candidate.capabilities.skills.find((entry) => entry.id === id);
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
  pendingExactCopyAvailable = false,
): boolean {
  if (decision.sourceClaimId !== claim.sourceClaimId) return false;
  const immediate = immediateDispositionResult(candidate, claim, decision, pendingExactCopyAvailable);
  if (immediate !== undefined) return immediate;
  if (decision.targetClaimIds.length === 0) return false;
  const targetsAreProvenanced = decision.targetClaimIds.every((targetClaimId) =>
    characterClaimValueV1(candidate, targetClaimId) !== undefined
      && provenance.some((entry) => entry.targetClaimId === targetClaimId
        && entry.sourceClaimIds.includes(claim.sourceClaimId)
        && entry.method !== "generated"),
  );
  if (!targetsAreProvenanced) return false;
  return legacyMeaningDispositionSatisfied(candidate, claim, decision);
}

function immediateDispositionResult(candidate: CharacterDefinitionV3, claim: CharacterSourceClaimV1,
  decision: SourceDispositionDecisionV1, pendingExactCopyAvailable: boolean): boolean | undefined {
  if (decision.disposition === "preserve") return decision.targetClaimIds.length === 1
    && decision.targetClaimIds[0] === claim.targetClaimId && characterSourceCopyMatchesV1(candidate, claim);
  if (decision.disposition === "preserve-in-capsule") {
    return decision.targetClaimIds.length === 0 && claim.capsuleCopyAvailable;
  }
  if (decision.disposition === "discard-as-nonmaterial") return decision.targetClaimIds.length === 0
    && decision.rationale.trim().length > 0 && (claim.capsuleCopyAvailable || pendingExactCopyAvailable)
    && claim.nonmaterialDiscardEligible;
  return undefined;
}

function legacyMeaningDispositionSatisfied(candidate: CharacterDefinitionV3, claim: CharacterSourceClaimV1,
  decision: SourceDispositionDecisionV1): boolean {
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

function addCharacterMigrationClaims(source: ReturnType<typeof CharacterDefinitionV2Schema.parse>,
  exact: (claimId: string, value: unknown, expectedCopy?: unknown) => void) {
  exact("schemaVersion", source.schemaVersion, 3);
  exact("identity", source.identity);
  exact("appearance:publicSummary", source.appearance.publicSummary);
  for (const detail of source.appearance.details) exact(`appearance:details:${detail.id}`, detail);
  exact("appearance:visualPrompt", source.appearance.visualPrompt);
  exact("appearance:portrait", source.appearance.portrait);
  for (const background of source.profileBackground) exact(`profileBackground:${background.id}`, background);
  exact("psycheDisposition:dynamicsVersion", source.psycheDisposition.dynamicsVersion);
  exact("psycheDisposition:dynamics", source.psycheDisposition.dynamics);
  for (const need of source.psycheDisposition.coreNeeds) exact(`psycheDisposition:coreNeeds:${need.id}`, need);
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
}

function inferCharacterMigrationDispositions(candidate: CharacterDefinitionV3, claims: readonly CharacterSourceClaimV1[]) {
  const sourceDispositions = new Map<string, SourceDispositionDecisionV1>();
  const provenance = new Map<string, readonly ProposalProvenanceV1[]>();
  for (const claim of claims) {
    const matches = characterSourceCopyMatchesV1(candidate, claim);
    if (!matches && !claim.capsuleCopyAvailable) continue;
    if (claim.capsuleCopyAvailable && !matches) {
      sourceDispositions.set(claim.sourceClaimId, { sourceClaimId: claim.sourceClaimId,
        disposition: "preserve-in-capsule", targetClaimIds: [],
        rationale: "Server-verified exact copy in the frozen migration preservation capsule." });
      continue;
    }
    const transformsVersion = claim.sourceClaimId === "schemaVersion";
    sourceDispositions.set(claim.sourceClaimId, { sourceClaimId: claim.sourceClaimId,
      disposition: transformsVersion ? "transform" : "preserve", targetClaimIds: [claim.targetClaimId],
      rationale: transformsVersion ? "Accepted V2-to-V3 version transition."
        : "Server-verified exact copy from frozen V2 source." });
    provenance.set(claim.targetClaimId, [{ targetClaimId: claim.targetClaimId,
      sourceClaimIds: [claim.sourceClaimId], method: transformsVersion ? "derived" : "preserved" }]);
  }
  return { sourceDispositions, provenance };
}

export function buildCharacterMigrationSourceLedgerV1(
  definition: unknown,
  candidate: CharacterDefinitionV3,
  capsule: MigrationPreservationCapsuleV1 | null = null,
  requiredCapabilities: CharacterCompilerCapabilitySetV1 | null = null,
) {
  const source = CharacterDefinitionV2Schema.parse(definition);
  const claims: CharacterSourceClaimV1[] = [];
  const consciousSelfRequired = !requiredCapabilities || requiredCapabilities.required.some((capability) =>
    capability.consumer === "character-conscious-self" && capability.version === 3);
  const addClaim = (claim: Omit<CharacterSourceClaimV1, "capsuleCopyAvailable" | "capsuleEntryPresent" | "nonmaterialDiscardEligible">) => {
    const legacy = claim.original as { fallbackActionRef?: unknown } | null;
    claims.push({ ...claim, capsuleCopyAvailable: capsule?.entries.some((entry) =>
      entry.sourcePath === claim.sourceClaimId && isDeepStrictEqual(entry.value, claim.original)) ?? false,
    capsuleEntryPresent: capsule?.entries.some((entry) => entry.sourcePath === claim.sourceClaimId) ?? false,
    nonmaterialDiscardEligible: !consciousSelfRequired
      && claim.sourceClaimId.startsWith("actionNorms:")
      && claim.sourceClaimId.endsWith(":legacyMeaning")
      && typeof legacy === "object" && legacy !== null
      && legacy.fallbackActionRef === null });
  };
  const exact = (claimId: string, value: unknown, expectedCopy: unknown = value) =>
    addClaim({ sourceClaimId: claimId, targetClaimId: claimId, original: value, expectedCopy });
  addCharacterMigrationClaims(source, exact);
  const { sourceDispositions, provenance } = inferCharacterMigrationDispositions(candidate, claims);
  return { claims, sourceDispositions, provenance };
}
