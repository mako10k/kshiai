import {
  CharacterCompilerCapabilitySetV1Schema,
  CharacterDeferredValueV1Schema,
  type CharacterCompilerCapabilitySetV1,
  type CharacterDeferredValueV1,
} from "@kshiai/shared";
import { validateCharacterMigrationDeferred } from "../../character-migration-deferred.js";
import type { CharacterSourceClaimV1 } from "./character-source-ledger.js";

const consciousSelf = { consumer: "character-conscious-self", version: 3 } as const;

/** A source claim can be deferred only when its complete meaning is optional now. */
export function registeredCharacterSourceDeferralV1(input: {
  claim: CharacterSourceClaimV1;
  requiredCapabilities: CharacterCompilerCapabilitySetV1 | null;
  reason: string;
  pendingExactCopyAvailable?: boolean;
}): CharacterDeferredValueV1 | null {
  const required = CharacterCompilerCapabilitySetV1Schema.safeParse(input.requiredCapabilities);
  if (!required.success || required.data.required.length === 0
    || !(input.claim.capsuleCopyAvailable || input.pendingExactCopyAvailable)
    || !input.claim.nonmaterialDiscardEligible
    || !input.claim.sourceClaimId.endsWith(":legacyMeaning")
    || typeof input.claim.original !== "object" || input.claim.original === null
    || !("fallbackActionRef" in input.claim.original)
    || input.claim.original.fallbackActionRef !== null
    || required.data.required.some((capability) =>
      capability.consumer === consciousSelf.consumer && capability.version === consciousSelf.version)) {
    return null;
  }
  const normId = input.claim.sourceClaimId.slice("actionNorms:".length, -":legacyMeaning".length);
  if (!input.claim.sourceClaimId.startsWith("actionNorms:") || !normId) return null;
  const parsed = CharacterDeferredValueV1Schema.safeParse({
    targetPath: `definition.consciousGuidance.${normId}`,
    reason: input.reason,
    candidateSourcePaths: ["definition.actionNorms"],
    requiringCapability: consciousSelf,
  });
  if (!parsed.success) return null;
  const checked = validateCharacterMigrationDeferred([parsed.data]);
  return checked.findings.length === 0 && checked.expanded.length === 1 ? parsed.data : null;
}
