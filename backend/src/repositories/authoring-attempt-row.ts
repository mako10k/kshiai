import {
  AssetAuthoringAttemptKindSchema,
  AssetAuthoringAttemptStatusSchema,
  AssetCompatibilitySchema,
  type AssetAuthoringAttemptKind,
  type AssetAuthoringAttemptStatus,
  type AssetCompatibility,
} from "@kshiai/shared";
import type { AssetGeneration } from "./asset-generations.js";

export type AuthoringAttemptRow = {
  attempt_id: string;
  owner_user_id: string;
  kind: string;
  idempotency_key: string;
  request_digest: string;
  source_text: string | null;
  source_digest: string;
  expected_generation_id: string | null;
  expected_content_digest: string | null;
  status: string;
  candidate_json: unknown | null;
  candidate_digest: string | null;
  assistant_message: string;
  error_code: string | null;
  result_generation_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  expires_at: string | Date;
};

export function isoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function parseAuthoringAttemptBase(row: AuthoringAttemptRow): {
  attemptId: string;
  ownerUserId: string;
  kind: AssetAuthoringAttemptKind;
  idempotencyKey: string;
  requestDigest: string;
  sourceText: string | null;
  sourceDigest: string;
  expectedGenerationId: string | null;
  expectedContentDigest: string | null;
  status: AssetAuthoringAttemptStatus;
  rawCandidate: unknown | null;
  candidateDigest: string | null;
  assistantMessage: string;
  errorCode: string | null;
  resultGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
} {
  const rawCandidate = typeof row.candidate_json === "string"
    ? JSON.parse(row.candidate_json)
    : row.candidate_json;
  return {
    attemptId: row.attempt_id,
    ownerUserId: row.owner_user_id,
    kind: AssetAuthoringAttemptKindSchema.parse(row.kind),
    idempotencyKey: row.idempotency_key,
    requestDigest: row.request_digest,
    sourceText: row.source_text,
    sourceDigest: row.source_digest,
    expectedGenerationId: row.expected_generation_id,
    expectedContentDigest: row.expected_content_digest,
    status: AssetAuthoringAttemptStatusSchema.parse(row.status),
    rawCandidate: rawCandidate ?? null,
    candidateDigest: row.candidate_digest,
    assistantMessage: row.assistant_message,
    errorCode: row.error_code,
    resultGenerationId: row.result_generation_id,
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
    expiresAt: isoTimestamp(row.expires_at),
  };
}

export function projectAssetCompatibility(input: {
  state: {
    compatibility_status: string;
    current_generation_id: string | null;
    reason_code: string | null;
  } | undefined;
  current: AssetGeneration | null;
  readinessReason: (content: unknown) => string | null;
}): AssetCompatibility {
  const current = input.current;
  if (!input.state) {
    return AssetCompatibilitySchema.parse({
      status: "unsupported",
      schemaVersion: current?.schemaVersion ?? null,
      currentGenerationId: current?.generationId ?? null,
      reasonCode: "legacy_schema",
    });
  }
  const row = input.state;
  if (row.compatibility_status === "ready" &&
      (!current || current.schemaVersion !== 2 ||
       current.generationId !== row.current_generation_id)) {
    return AssetCompatibilitySchema.parse({
      status: "unsupported",
      schemaVersion: current?.schemaVersion ?? null,
      currentGenerationId: current?.generationId ?? null,
      reasonCode: "state_pointer_mismatch",
    });
  }
  if (row.compatibility_status === "ready" && current) {
    const reasonCode = input.readinessReason(current.content);
    if (reasonCode) {
      return AssetCompatibilitySchema.parse({
        status: "unsupported",
        schemaVersion: current.schemaVersion,
        currentGenerationId: current.generationId,
        reasonCode,
      });
    }
  }
  return AssetCompatibilitySchema.parse({
    status: row.compatibility_status,
    schemaVersion: current?.schemaVersion ?? null,
    currentGenerationId: current?.generationId ?? row.current_generation_id,
    reasonCode: row.reason_code,
  });
}
