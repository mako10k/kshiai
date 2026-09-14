import {
  CharacterSemanticMigrationProviderReceiptV1Schema,
  type CharacterSemanticMigrationAttemptV1,
  type CharacterSemanticMigrationProviderRequestV1,
  type CharacterSemanticMigrationProviderReceiptV1,
} from "@kshiai/shared";
import { assetContentDigest } from "../repositories/asset-generations.js";
import {
  loadCharacterSemanticMigrationWork, recordCharacterSemanticMigrationProviderRequest,
  recordCharacterSemanticMigrationProviderReceipt,
} from "../repositories/character-semantic-migration.js";
import { type CharacterMigrationProviderPayload } from "./character-migration-prompts.js";
import { requireCharacterMigrationSourceReady } from "../repositories/character-migration-readiness.js";

export type CharacterMigrationProviderCall = CharacterMigrationProviderPayload & {
  providerRequestId: string;
  providerRoute: string;
  modelIdentity: string;
  kind: CharacterSemanticMigrationProviderRequestV1["kind"];
};

// This port is deliberately not mounted on an ordinary authoring/battle route.
// B5 exercises it with local doubles; a live invocation has its own authority gate.
export type CharacterMigrationProvider = (
  request: CharacterMigrationProviderCall,
) => Promise<CharacterSemanticMigrationProviderReceiptV1>;

export type CharacterMigrationRequestResult =
  | { status: "received"; request: CharacterSemanticMigrationProviderRequestV1;
    receipt: CharacterSemanticMigrationProviderReceiptV1; replayed: boolean }
  | { status: "pending"; providerRequestId: string; reason: string };

export async function requestCharacterMigrationStep(input: {
  attempt: CharacterSemanticMigrationAttemptV1;
  ordinal: number;
  kind: CharacterSemanticMigrationProviderRequestV1["kind"];
  payload: CharacterMigrationProviderPayload;
  provider: CharacterMigrationProvider;
}): Promise<CharacterMigrationRequestResult> {
  const { attempt, ordinal, kind, payload } = input;
  const work = await loadCharacterSemanticMigrationWork(attempt);
  if (!work) throw new Error("CHARACTER_MIGRATION_ATTEMPT_NOT_FOUND");
  await requireCharacterMigrationSourceReady(attempt);
  const previous = work.requests[ordinal - 2];
  const providerRequestId = `request-${assetContentDigest({
    attempt: attempt.migrationAttemptId, ordinal,
  }).slice(0, 32)}`;
  const requestDigest = ordinal === 1 ? attempt.initialRequestDigest :
    assetContentDigest({ providerRoute: attempt.providerRoute,
      modelIdentity: attempt.modelIdentity, kind, payload });
  const recorded = await recordCharacterSemanticMigrationProviderRequest({
    providerRequestId, migrationAttemptId: attempt.migrationAttemptId,
    parentProviderRequestId: previous?.request.providerRequestId ?? null,
    kind, requestDigest,
    createdAt: previous?.receipt?.finishedAt ?? attempt.createdAt,
  });
  if (recorded.request.ordinal !== ordinal) {
    throw new Error("CHARACTER_MIGRATION_REQUEST_SEQUENCE_DRIFT");
  }
  if (recorded.replayed) {
    const refreshed = await loadCharacterSemanticMigrationWork(attempt);
    const receipt = refreshed?.requests.find((entry) =>
      entry.request.providerRequestId === providerRequestId)?.receipt;
    return receipt ? { status: "received", request: recorded.request, receipt, replayed: true } :
      { status: "pending", providerRequestId,
        reason: "The previous provider outcome is unknown; do not resend this request." };
  }
  let receipt: CharacterSemanticMigrationProviderReceiptV1;
  try {
    receipt = CharacterSemanticMigrationProviderReceiptV1Schema.parse(await input.provider({
      ...payload, providerRequestId, providerRoute: attempt.providerRoute,
      modelIdentity: attempt.modelIdentity, kind,
    }));
  } catch {
    return { status: "pending", providerRequestId,
      reason: "No valid terminal receipt was returned. Accounting/outcome must be reconciled before any retry." };
  }
  // A storage failure after the call intentionally leaves a pending record;
  // it must not trigger a duplicate paid call or fabricated zero accounting.
  await recordCharacterSemanticMigrationProviderReceipt({ providerRequestId, receipt });
  return { status: "received", request: recorded.request, receipt, replayed: false };
}
