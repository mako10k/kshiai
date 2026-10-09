/** R: Persist a complete focused candidate under the command's owner and source binding. */
import { z } from "zod";
import { createHash } from "node:crypto";
import { CharacterDefinitionV3Schema, CharacterGenerationEnvelopeV3Schema,
  defaultCharacterDisclosurePolicyV2, characterV3ProfileDefinitionV2,
  CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3 } from "@kshiai/shared";
import { LegacyCharacterStructuralReviewV1Schema, type CharacterCorrectionPredecessorV1 }
  from "../services/semantic-authoring/character-review-correction-source.js";
import { decodeUnresolvedCharacterRevisionSourceV1 }
  from "../services/semantic-authoring/character-revision-scope-source.js";
import { CharacterRevisionScopeResolutionV1Schema }
  from "../services/semantic-authoring/character-revision-scope.js";
import { createCharacterSemanticAuthoringAdapterV3 }
  from "../services/semantic-authoring/adapters/character-v3.js";
import type { DatabaseConnection } from "../db.js";
import { assetContentDigest } from "./asset-generations.js";
import { FocusedCharacterCompleteReviewV1Schema } from "../services/semantic-authoring/adapters/character-profile-work.js";

type FocusedCandidateRow = { result_json: unknown; candidate_json: unknown;
    candidate_digest: string | null; source_digest: string; run_id: string; mode: string;
    source_asset_id: string; source_generation_id: string | null; source_content_digest: string;
    policy_identity: string; adapter_identity: string; source_json: unknown; resolved_source_json: unknown; source_text: string;
    expected_current_generation_id: string | null; expected_generation_id: string | null;
    character_id: string; kind: string };
const focusedPredecessorResultSchema = z.object({ kind: z.literal("ready_for_review"), runId: z.string(), attemptId: z.string(),
    sourceIdentity: z.object({ assetId: z.string(), generationId: z.string().nullable(), contentDigest: z.string() }),
    policyIdentity: z.string(), adapterIdentity: z.string(), finalCandidate: z.unknown(),
    finalCandidateDigest: z.string(), reconciliationReceiptIdentity: z.string(),
    compilerReceiptIdentity: z.string(), disclosureReceiptIdentity: z.string(),
    obligationCoverage: z.object({ resolvedRequiredObligationCount: z.number().int().min(0),
      requiredObligationCount: z.number().int().min(0) }),
    expectedCurrentGenerationId: z.string().nullable(),
  });
type FocusedPredecessorResult = z.infer<typeof focusedPredecessorResultSchema>;

function decodeStoredJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function assertFocusedResultBinding(row: FocusedCandidateRow, result: FocusedPredecessorResult,
  source: unknown, attemptId: string) {
  if (result.runId !== row.run_id || result.attemptId !== attemptId
    || result.policyIdentity !== row.policy_identity || result.adapterIdentity !== row.adapter_identity
    || result.sourceIdentity.assetId !== row.source_asset_id || row.source_asset_id !== row.character_id
    || result.sourceIdentity.generationId !== row.source_generation_id
    || result.sourceIdentity.contentDigest !== row.source_content_digest
    || assetContentDigest(source) !== row.source_content_digest
    || result.expectedCurrentGenerationId !== row.expected_current_generation_id
    || row.expected_current_generation_id !== row.expected_generation_id
    || result.obligationCoverage.requiredObligationCount <= 0
    || result.obligationCoverage.resolvedRequiredObligationCount !== result.obligationCoverage.requiredObligationCount) {
    throw new Error("CORRECTION_PREDECESSOR_BINDING_MISMATCH");
  }
}

function assertCompletePredecessorBinding(row: FocusedCandidateRow, result: FocusedPredecessorResult,
  complete: z.infer<typeof FocusedCharacterCompleteReviewV1Schema>, attemptId: string) {
    const candidate = typeof row.candidate_json === "string" ? JSON.parse(row.candidate_json) : row.candidate_json;
    if (row.policy_identity !== "character_complete_review_policy_v2"
      || row.adapter_identity !== "character-complete-review-adapter-v1"
      || result.reconciliationReceiptIdentity !== "character-reconciliation-v1"
      || result.compilerReceiptIdentity !== "character-compiler-v3"
      || result.disclosureReceiptIdentity !== "character-public-profile-claims-v1"
      || complete.envelope.provenance.attemptId !== attemptId
      || complete.envelope.provenance.sourceDigest !== row.source_digest
      || complete.mode !== row.mode || row.kind !== (row.mode === "create" ? "create" : "revision")
      || complete.candidateDigest !== result.finalCandidateDigest
      || complete.candidateDigest !== row.candidate_digest
      || assetContentDigest(candidate) !== complete.candidateDigest) {
      throw new Error("CORRECTION_PREDECESSOR_BINDING_MISMATCH");
    }
}

type DecodedStructuralSource = ReturnType<ReturnType<typeof createCharacterSemanticAuthoringAdapterV3>["decodeFrozenSource"]>;
function assertLegacySourceBinding(row: FocusedCandidateRow, result: FocusedPredecessorResult,
  decoded: DecodedStructuralSource): asserts decoded is Extract<DecodedStructuralSource, { accepted: true }> {
    if (!decoded.accepted || (decoded.value.kind !== "create" && decoded.value.kind !== "revise")
      || decoded.value.kind !== row.mode || decoded.value.naturalText !== row.source_text || row.kind !== (row.mode === "create" ? "create" : "revision")
      || row.policy_identity !== "semantic_authoring_policy_v1"
      || row.adapter_identity !== "character-semantic-authoring-v3"
      || row.candidate_json !== null || row.candidate_digest !== null
      || createHash("sha256").update(JSON.stringify(result.finalCandidate)).digest("hex") !== result.finalCandidateDigest) {
      throw new Error("CORRECTION_PREDECESSOR_BINDING_MISMATCH");
    }
}

async function readLegacyPredecessorGeneration(connection: DatabaseConnection, row: FocusedCandidateRow,
  decoded: Extract<DecodedStructuralSource, { accepted: true }>) {
    let previous: z.infer<typeof CharacterGenerationEnvelopeV3Schema> | null = null;
    if (row.mode === "revise") {
      if (!row.source_generation_id || row.source_generation_id !== row.expected_generation_id) {
        throw new Error("CORRECTION_PREDECESSOR_BINDING_MISMATCH");
      }
      const generation = await connection.query<{ content_json: unknown }>(
        `SELECT content_json FROM asset_generations WHERE generation_id = $1 AND asset_id = $2
          AND asset_type = 'character'`, [row.source_generation_id, row.character_id]);
      const content = generation.rows[0]?.content_json;
      previous = CharacterGenerationEnvelopeV3Schema.parse(typeof content === "string" ? JSON.parse(content) : content);
      if (decoded.value.kind !== "revise" || assetContentDigest(decoded.value.definition) !== assetContentDigest(previous.definition)) {
        throw new Error("CORRECTION_PREDECESSOR_BINDING_MISMATCH");
      }
    } else if (row.source_generation_id !== null || row.expected_generation_id !== null) {
      throw new Error("CORRECTION_PREDECESSOR_BINDING_MISMATCH");
    }
    return previous;
}

async function readLegacyPredecessor(connection: DatabaseConnection, row: FocusedCandidateRow,
  result: FocusedPredecessorResult, source: unknown, attemptId: string): Promise<CharacterCorrectionPredecessorV1> {
    const pending = decodeUnresolvedCharacterRevisionSourceV1(source);
    const resolution = pending ? CharacterRevisionScopeResolutionV1Schema.parse(
      typeof row.resolved_source_json === "string" ? JSON.parse(row.resolved_source_json) : row.resolved_source_json) : null;
    if (pending && (!resolution || !pending.naturalText.includes(resolution.sourceQuote))) {
      throw new Error("CORRECTION_PREDECESSOR_BINDING_MISMATCH");
    }
    const structuralSource = pending && resolution ? { kind: "revise", definition: pending.definition,
      naturalText: pending.naturalText, requestedCluster: resolution.requestedCluster } : source;
    const decoded = createCharacterSemanticAuthoringAdapterV3().decodeFrozenSource(structuralSource);
    assertLegacySourceBinding(row, result, decoded);
    const definition = CharacterDefinitionV3Schema.parse(result.finalCandidate);
    const previous = await readLegacyPredecessorGeneration(connection, row, decoded);
    return LegacyCharacterStructuralReviewV1Schema.parse({
      kind: "legacy_character_structural_review_v1", mode: row.mode, attemptId, sourceDigest: row.source_digest,
      definition, definitionDigest: assetContentDigest(definition), candidateDigest: result.finalCandidateDigest,
      reconciliationReceiptIdentity: result.reconciliationReceiptIdentity,
      compilerReceiptIdentity: result.compilerReceiptIdentity, disclosureReceiptIdentity: result.disclosureReceiptIdentity,
      disclosurePolicy: previous?.disclosurePolicy
        ?? defaultCharacterDisclosurePolicyV2(characterV3ProfileDefinitionV2(definition)),
      compilerCompatibility: previous?.compilerCompatibility ?? CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3.required,
    });
}

export async function readCompleteFocusedCharacterReview(connection: DatabaseConnection,
  attemptId: string, ownerUserId: string) {
  const found = await connection.query<FocusedCandidateRow>(
    `SELECT p.result_json, p.source_json, p.resolved_source_json, a.source_text, a.candidate_json, a.candidate_digest, a.source_digest,
      a.character_id, a.kind, a.expected_generation_id, r.run_id, r.mode, r.source_asset_id,
      r.source_generation_id, r.source_content_digest, r.policy_identity, r.adapter_identity,
      r.expected_current_generation_id
      FROM character_authoring_attempts a JOIN semantic_authoring_runs r ON r.attempt_id = a.attempt_id
      JOIN character_focused_authoring_payloads p ON p.run_id = r.run_id
      WHERE a.attempt_id = $1 AND a.owner_user_id = $2 AND r.owner_user_id = $2
        AND r.family = 'character' AND a.status = 'awaiting_owner_acceptance' AND r.status = 'ready_for_review'`,
    [attemptId, ownerUserId]);
  const row = found.rows[0];
  if (!row) throw new Error("CORRECTION_PREDECESSOR_NOT_READY");
  const result = focusedPredecessorResultSchema.parse(decodeStoredJson(row.result_json));
  const source = decodeStoredJson(row.source_json);
  assertFocusedResultBinding(row, result, source, attemptId);
  const parsedComplete = FocusedCharacterCompleteReviewV1Schema.safeParse(result.finalCandidate);
  let complete: CharacterCorrectionPredecessorV1;
  if (parsedComplete.success) {
    complete = parsedComplete.data;
    assertCompletePredecessorBinding(row, result, complete, attemptId);
  } else {
    complete = await readLegacyPredecessor(connection, row, result, source, attemptId);
  }
  return { complete, runId: row.run_id };
}

export async function saveCompleteFocusedCharacterCandidate(connection: DatabaseConnection,
  input: { attemptId: string; ownerUserId: string; mode: string; candidate: unknown;
    candidateDigest: string; updatedAt: string }) {
  const complete = FocusedCharacterCompleteReviewV1Schema.parse(input.candidate);
  const found = await connection.query<{ source_digest: string; kind: string; status: string }>(
    `SELECT source_digest, kind, status FROM character_authoring_attempts
      WHERE attempt_id = $1 AND owner_user_id = $2`, [input.attemptId, input.ownerUserId]);
  const attempt = z.object({ source_digest: z.string(), kind: z.string(), status: z.string() })
    .parse(found.rows[0]);
  if (complete.envelope.provenance.attemptId !== input.attemptId
    || complete.envelope.provenance.sourceDigest !== attempt.source_digest
    || complete.mode !== input.mode
    || attempt.kind !== (complete.mode === "create" ? "create" : "revision")
    || complete.candidateDigest !== input.candidateDigest
    || assetContentDigest(complete.envelope) !== input.candidateDigest) {
    throw new Error("AUTHORING_CANDIDATE_PROVENANCE_MISMATCH");
  }
  const saved = await connection.query(`UPDATE character_authoring_attempts
    SET candidate_json = $3, candidate_digest = $4, assistant_message = $5,
      status = 'awaiting_owner_acceptance', error_code = NULL, updated_at = $6
    WHERE attempt_id = $1 AND owner_user_id = $2
      AND status NOT IN ('succeeded', 'discarded', 'expired', 'failed')`,
  [input.attemptId, input.ownerUserId, JSON.stringify(complete.envelope), input.candidateDigest,
    complete.assistantMessage, input.updatedAt]);
  if (saved.rowCount !== 1) throw new Error("AUTHORING_ATTEMPT_TERMINAL");
}
