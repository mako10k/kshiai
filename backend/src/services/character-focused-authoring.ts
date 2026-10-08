/** R: Connect owner character authoring commands to their frozen, fenced semantic runs. */
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3,
  CharacterCompilerCompatibilityV1Schema, CharacterDeferredValueV1Schema,
  CharacterDefinitionV3Schema, CharacterGenerationEnvelopeV3Schema, type CharacterAuthoringReview,
  isCharacterBattleMechanicsCapabilitySetV3,
  projectCharacterCompilerCompatibilityV1,
  type CharacterDefinitionV3, type SemanticAuthoringRunV1, type SemanticAuthoringPolicyV1,
  type SourceDispositionDecisionV1 } from "@kshiai/shared";
import { query, withTransaction, type DatabaseConnection } from "../db.js";
import type { LlmProvider } from "../llm/types.js";
import { assetContentDigest, getCurrentAssetGeneration, getAssetGeneration } from "../repositories/asset-generations.js";
import { saveCompleteFocusedCharacterCandidate, readCompleteFocusedCharacterReview } from "../repositories/character-focused-candidate.js";
import { decodeCharacterReviewCorrectionSourceV1, correctionStructuralSource,
  correctionPredecessorDefinition, correctionPredecessorDisclosure, correctionPredecessorCompatibility,
  type CharacterReviewCorrectionSourceV1, type CompleteCharacterSourceV1 }
  from "./semantic-authoring/character-review-correction-source.js";
import { COMPLETE_CHARACTER_ADAPTER_V1, createCompleteCharacterAdapterV1,
  projectCompleteCharacterWorkV1 } from "./semantic-authoring/adapters/character-complete.js";
import { FocusedCharacterCompleteReviewV1Schema,
  type FocusedCharacterCompleteReviewV1 } from "./semantic-authoring/adapters/character-profile-work.js";
import { assertFamilyAuthoringFence, finishFamilyAuthoringJobInTransaction,
  type AuthoringExecutionFence } from "../repositories/family-authoring-jobs.js";
import * as runs from "../repositories/semantic-authoring.js";
import { insertOwnerNotification } from "../repositories/owner-notifications.js";
import { fixedCandidateOwnerReview } from "./character-authoring-candidate.js";
import { createCharacterSemanticAuthoringAdapterV3,
  type CharacterAuthoringSourceV1, type CharacterMigrationReviewCandidateV1 } from "./semantic-authoring/adapters/character-v3.js";
import { buildCharacterMigrationSourceLedgerV1,
  characterSourceDispositionSatisfiedV1 } from "./semantic-authoring/adapters/character-source-ledger.js";
import { projectFocusedCharacterWorkV1 } from "./semantic-authoring/adapters/character-context.js";
import { createDurableSemanticAuthoringExecutionV1 } from "./semantic-authoring/durable-execution.js";
import { executeSemanticAuthoringV1, type FocusedProviderTransportV1,
  type SemanticAuthoringExecutionPersistenceV1 } from "./semantic-authoring/execution.js";
import { characterAuthoringExecutionPolicyV2, frozenCharacterAuthoringExecutionPolicyV1 } from "./semantic-authoring/execution-policy.js";
import { decodeUnresolvedCharacterRevisionSourceV1,
  type UnresolvedCharacterRevisionSourceV1 } from "./semantic-authoring/character-revision-scope-source.js";
import { CharacterRevisionScopeResolutionV1Schema,
  resolveCharacterRevisionScopeV1 } from "./semantic-authoring/character-revision-scope.js";

export type CharacterFocusedRegistrationSourceV1 =
  CompleteCharacterSourceV1 | UnresolvedCharacterRevisionSourceV1;

type CharacterFocusedRegistrationInput = Readonly<{
  attemptId: string; ownerUserId: string; characterId: string; sourceGenerationId: string | null;
  expectedCurrentGenerationId: string | null; source: CharacterFocusedRegistrationSourceV1;
  pricingIdentity: string; createdAt: string; predecessorRunId?: string; commandId?: string;
}>;

function decodeRegistrationSource(input: CharacterFocusedRegistrationInput) {
  const adapter = createCharacterSemanticAuthoringAdapterV3();
  const decoded = adapter.decodeFrozenSource(input.source);
  const pendingScope = decodeUnresolvedCharacterRevisionSourceV1(input.source);
  const correction = decodeCharacterReviewCorrectionSourceV1(input.source);
  if ((!decoded.accepted && !pendingScope && !correction)
    || (decoded.accepted && decoded.value.kind === "revise" && !decoded.value.naturalText?.trim())) {
    throw new Error("FOCUSED_CHARACTER_SOURCE_INVALID");
  }
  const source = correction ?? pendingScope ?? (decoded.accepted ? decoded.value : null);
  if (!source) throw new Error("FOCUSED_CHARACTER_SOURCE_INVALID");
  if (source.kind === "migrate" && !isCharacterBattleMechanicsCapabilitySetV3(source.requiredCapabilities)) {
    throw new Error("FOCUSED_CHARACTER_CAPABILITY_SET_INVALID");
  }
  return { adapter, source };
}

async function assertRegistrationCommand(connection: DatabaseConnection,
  input: CharacterFocusedRegistrationInput, source: CharacterFocusedRegistrationSourceV1) {
  const attempt = await connection.query<{ owner_user_id: string; character_id: string; status: string;
    kind: string; expected_generation_id: string | null; source_text: string | null }>(
    `SELECT owner_user_id, character_id, status, kind, expected_generation_id, source_text
      FROM character_authoring_attempts WHERE attempt_id = $1`, [input.attemptId]);
  const command = attempt.rows[0];
  if (command?.owner_user_id !== input.ownerUserId || command.character_id !== input.characterId
    || command.status !== "pending_structure") throw new Error("FOCUSED_CHARACTER_COMMAND_MISMATCH");
  const expectedKind = source.kind === "review_candidate_correction"
    ? source.predecessorCandidate.mode === "create" ? "create" : "revision"
    : source.kind === "create" ? "create"
    : source.kind === "revise" || source.kind === "revise_pending_scope" ? "revision" : "upgrade";
  if (command.kind !== expectedKind || command.expected_generation_id !== input.expectedCurrentGenerationId
    || input.sourceGenerationId !== input.expectedCurrentGenerationId
    || (source.kind !== "migrate" && command.source_text !== source.naturalText)) {
    throw new Error("FOCUSED_CHARACTER_COMMAND_MISMATCH");
  }
}

function assertCapsuleIdentity(input: CharacterFocusedRegistrationInput,
  source: CharacterFocusedRegistrationSourceV1) {
  if (source.kind === "migrate" && source.capsule
    && (source.capsule.migrationAttemptId !== input.attemptId
      || source.capsule.sourceGenerationId !== input.sourceGenerationId
      || source.capsule.targetGenerationId === input.sourceGenerationId)) {
    throw new Error("FOCUSED_CHARACTER_CAPSULE_IDENTITY_MISMATCH");
  }
}

async function assertRegistrationSourceGeneration(connection: DatabaseConnection,
  input: CharacterFocusedRegistrationInput, source: CharacterFocusedRegistrationSourceV1) {
  if (source.kind === "create") return;
  if (source.kind === "review_candidate_correction") {
    const frozen = await readCompleteFocusedCharacterReview(connection, source.predecessorAttemptId, input.ownerUserId);
    if (assetContentDigest(frozen.complete) !== assetContentDigest(source.predecessorCandidate)) {
      throw new Error("CORRECTION_PREDECESSOR_BINDING_MISMATCH");
    }
    if (frozen.runId !== input.predecessorRunId) {
      // A retry's parent is the failed correction run, while its immutable review source stays the same.
      const retryParent = await connection.query<{ source_content_digest: string }>(
        `SELECT source_content_digest FROM semantic_authoring_runs WHERE run_id = $1
          AND owner_user_id = $2 AND source_asset_id = $3 AND family = 'character' AND status = 'failed'`,
        [input.predecessorRunId, input.ownerUserId, input.characterId]);
      if (retryParent.rows[0]?.source_content_digest !== assetContentDigest(source)) {
        throw new Error("CORRECTION_PREDECESSOR_BINDING_MISMATCH");
      }
    }
    return;
  }
  const generation = await connection.query<{ content_json: unknown; schema_version: number }>(
    `SELECT content_json, schema_version FROM asset_generations
      WHERE generation_id = $1 AND asset_type = 'character' AND asset_id = $2`,
    [input.sourceGenerationId, input.characterId]);
  const stored = generation.rows[0];
  const content = stored && z.object({ definition: z.unknown() }).safeParse(
    typeof stored.content_json === "string" ? JSON.parse(stored.content_json) : stored.content_json);
  const expectedVersion = source.kind === "migrate" ? 2 : 3;
  if (!stored || Number(stored.schema_version) !== expectedVersion || !content?.success
    || assetContentDigest(content.data.definition) !== assetContentDigest(source.definition)) {
    throw new Error("FOCUSED_CHARACTER_SOURCE_GENERATION_MISMATCH");
  }
}

/** Attach a frozen V3 execution to an existing queued owner command, in its transaction. */
export async function registerCharacterFocusedAuthoringV3(connection: DatabaseConnection,
  input: CharacterFocusedRegistrationInput) {
  const { adapter, source } = decodeRegistrationSource(input);
  await assertRegistrationCommand(connection, input, source);
  assertCapsuleIdentity(input, source);
  await assertRegistrationSourceGeneration(connection, input, source);
  const runId = randomUUID();
  const mode = source.kind === "review_candidate_correction" ? source.predecessorCandidate.mode
    : source.kind === "revise_pending_scope" ? "revise" : source.kind;
  const policy = characterAuthoringExecutionPolicyV2(mode, input.pricingIdentity);
  const run: Omit<SemanticAuthoringRunV1, "executionFence"> = {
    runId, attemptId: input.attemptId, family: "character",
    mode,
    ownerUserId: input.ownerUserId,
    sourceIdentity: { assetId: input.characterId, generationId: input.sourceGenerationId,
      contentDigest: assetContentDigest(source) },
    targetContract: { family: "character", version: 3 },
    adapterIdentity: policy.identity === "character_complete_review_policy_v2"
      ? COMPLETE_CHARACTER_ADAPTER_V1 : adapter.identity,
    policyIdentity: policy.identity, pricingIdentity: policy.pricingIdentity,
    tokenEstimatorIdentity: policy.tokenEstimatorIdentity,
    expectedCurrentGenerationId: input.expectedCurrentGenerationId,
  };
  await runs.insertPendingSemanticAuthoringRunV1({
    run, sourcePayloadRef: `character-focused:${runId}`, predecessorRunId: input.predecessorRunId ?? null,
    createdAt: input.createdAt,
  }, connection);
  await connection.query(
    `INSERT INTO character_focused_authoring_payloads (run_id, source_json, created_at) VALUES ($1, $2, $3)`,
    [runId, JSON.stringify(source), input.createdAt],
  );
  if (input.commandId) {
    await connection.query(`INSERT INTO semantic_authoring_commands
      (owner_user_id, command_id, run_id, created_at) VALUES ($1, $2, $3, $4)`,
    [input.ownerUserId, input.commandId, runId, input.createdAt]);
  }
  return run;
}

type StoredFocusedRun = NonNullable<Awaited<ReturnType<typeof runs.getSemanticAuthoringRunV1>>>;
type ClaimedFocusedRun = Extract<Awaited<ReturnType<typeof runs.claimSemanticAuthoringRunV1>>,
  { accepted: true }>["value"];

async function terminalExistingFocusedRun(existing: StoredFocusedRun,
  input: { attemptId: string; ownerUserId: string; executionFence: AuthoringExecutionFence }) {
  if (existing.status === "pending") return null;
  if (existing.status !== "claimed") return existing.status === "ready_for_review" ? "completed" as const : "failed" as const;
  await runs.recoverSemanticAuthoringProcessLossV1({ runId: existing.runId,
    recoveryOwnerId: input.executionFence.workerId, recoveredAt: new Date().toISOString() });
  await withTransaction(async (connection) => {
    await assertFamilyAuthoringFence(connection, "character", input.attemptId, input.executionFence);
    await connection.query(`UPDATE character_authoring_attempts SET status = 'failed',
      error_code = 'process_or_lease_lost' WHERE attempt_id = $1 AND owner_user_id = $2`,
    [input.attemptId, input.ownerUserId]);
    await insertOwnerNotification(connection, {
      ownerUserId: input.ownerUserId, kind: "authoring_failed", attemptId: input.attemptId,
      characterId: existing.sourceIdentity.assetId,
      attemptKind: existing.mode === "migrate" ? "upgrade" : existing.mode === "revise" ? "revision" : "create",
      createdAt: new Date().toISOString(),
    });
    await finishFamilyAuthoringJobInTransaction(connection, "character", input.attemptId,
      "completed", input.executionFence);
  });
  return "failed" as const;
}

type FailFocusedBeforeDispatch = (code: string,
  category: "technical_failure" | "trusted_state_corrupt" | "resource_exhausted"
    | "provider_transport_unavailable",
  transportReason?: "policy_disallows_recovery" | "no_admissible_recovery_basis") => Promise<"failed">;

async function resolvePendingRevisionSource(input: {
  pending: UnresolvedCharacterRevisionSourceV1; storedResolution: unknown | null;
  run: ClaimedFocusedRun; provider: FocusedProviderTransportV1;
  persistence: SemanticAuthoringExecutionPersistenceV1<CharacterDefinitionV3
    | CharacterMigrationReviewCandidateV1 | FocusedCharacterCompleteReviewV1, string>;
  fail: FailFocusedBeforeDispatch;
}) {
  let resolution: unknown = input.storedResolution;
  if (resolution === null) {
    const scopeOutcome = await resolveCharacterRevisionScopeV1({ naturalText: input.pending.naturalText,
      provider: input.provider, policy: frozenCharacterAuthoringExecutionPolicyV1(input.run),
      accounting: input.run.accounting, persistence: input.persistence });
    if (scopeOutcome.status === "lost_ownership") return { accepted: false as const, result: "failed" as const };
    if (scopeOutcome.status === "failed") return { accepted: false as const,
      result: await input.fail(scopeOutcome.reason, scopeOutcome.category,
        scopeOutcome.category === "provider_transport_unavailable"
          ? input.provider.transportPolicy.maxRecoveriesPerWorkItem === 0
            ? "policy_disallows_recovery" : "no_admissible_recovery_basis" : undefined) };
    const frozen = await query<{ run_id: string }>(`UPDATE character_focused_authoring_payloads
      SET resolved_source_json = $2 WHERE run_id = $1 AND resolved_source_json IS NULL
        AND EXISTS (SELECT 1 FROM semantic_authoring_runs
          WHERE run_id = $1 AND status = 'claimed' AND fence_owner_id = $3 AND fencing_token = $4)
      RETURNING run_id`, [input.run.runId, JSON.stringify(scopeOutcome.resolution),
      input.run.executionFence.ownerId, input.run.executionFence.fencingToken]);
    if (frozen.rowCount !== 1) return { accepted: false as const, result: "failed" as const };
    resolution = scopeOutcome.resolution;
  }
  let parsedResolution: unknown;
  try { parsedResolution = typeof resolution === "string" ? JSON.parse(resolution) : resolution; }
  catch { return { accepted: false as const,
    result: await input.fail("scope_decode", "trusted_state_corrupt") }; }
  const validated = CharacterRevisionScopeResolutionV1Schema.safeParse(parsedResolution);
  if (!validated.success || !input.pending.naturalText.includes(validated.data.sourceQuote)) {
    return { accepted: false as const, result: await input.fail("scope_drift", "trusted_state_corrupt") };
  }
  return { accepted: true as const, source: { kind: "revise" as const,
    definition: input.pending.definition, naturalText: input.pending.naturalText,
    requestedCluster: validated.data.requestedCluster } };
}

function createFocusedPersistence(runId: string, run: ClaimedFocusedRun,
  input: { attemptId: string; ownerUserId: string; executionFence: AuthoringExecutionFence }) {
  return createDurableSemanticAuthoringExecutionV1<
    CharacterDefinitionV3 | CharacterMigrationReviewCandidateV1 | FocusedCharacterCompleteReviewV1, string>({
    run, familyPayloadRef: `character-focused:${runId}`,
    async persistFamilyResult(connection, result) {
      await assertFamilyAuthoringFence(connection, "character", input.attemptId, input.executionFence);
      const now = new Date().toISOString();
      if (result.kind === "ready_for_review" && run.adapterIdentity === COMPLETE_CHARACTER_ADAPTER_V1) {
        await saveCompleteFocusedCharacterCandidate(connection, {
          attemptId: input.attemptId, ownerUserId: input.ownerUserId, mode: run.mode,
          candidate: result.finalCandidate, candidateDigest: result.finalCandidateDigest, updatedAt: now,
        });
      }
      const written = await connection.query(`UPDATE character_focused_authoring_payloads
        SET result_json = $2, finished_at = $3 WHERE run_id = $1 AND result_json IS NULL`,
      [runId, JSON.stringify(result), now]);
      if (written.rowCount !== 1) throw new Error("FOCUSED_CHARACTER_RESULT_ALREADY_WRITTEN");
      await connection.query(`UPDATE character_authoring_attempts
        SET status = $3, error_code = $4, updated_at = $5
        WHERE attempt_id = $1 AND owner_user_id = $2`,
      [input.attemptId, input.ownerUserId,
        result.kind === "ready_for_review" ? "awaiting_owner_acceptance" : "failed",
        result.kind === "failed" ? result.receipt.category
          : result.kind === "needs_owner_answer" ? "AUTHORING_OWNER_ANSWER_REQUIRED" : null, now]);
      await insertOwnerNotification(connection, {
        ownerUserId: input.ownerUserId,
        kind: result.kind === "ready_for_review" ? "authoring_ready" : "authoring_failed",
        attemptId: input.attemptId, characterId: run.sourceIdentity.assetId,
        attemptKind: run.mode === "migrate" ? "upgrade" : run.mode === "revise" ? "revision" : "create",
        createdAt: now,
      });
      await finishFamilyAuthoringJobInTransaction(connection, "character", input.attemptId,
        "completed", input.executionFence);
    },
  });
}

async function failFocusedBeforeDispatch(input: { runId: string; run: ClaimedFocusedRun;
  persistence: SemanticAuthoringExecutionPersistenceV1<CharacterDefinitionV3
    | CharacterMigrationReviewCandidateV1 | FocusedCharacterCompleteReviewV1, string>; code: string;
  category: "technical_failure" | "trusted_state_corrupt" | "resource_exhausted"
    | "provider_transport_unavailable";
  transportReason?: "policy_disallows_recovery" | "no_admissible_recovery_basis" }) {
  const latest = await runs.getSemanticAuthoringRunV1(input.runId);
  const accounting = latest?.accounting ?? input.run.accounting;
  await input.persistence.finish({ kind: "failed", runId: input.runId, attemptId: input.run.attemptId,
    sourceIdentity: input.run.sourceIdentity, policyIdentity: input.run.policyIdentity,
    adapterIdentity: input.run.adapterIdentity, accounting,
    receipt: { category: input.category,
      ...(input.transportReason ? { transportReason: input.transportReason } : {}), accounting,
      relevantFindingKeys: [input.code], sourceIdentity: input.run.sourceIdentity } });
  return "failed" as const;
}

async function resolvePendingExecutionSource(input: { pending: UnresolvedCharacterRevisionSourceV1;
  storedResolution: unknown | null; existing: StoredFocusedRun; run: ClaimedFocusedRun;
  provider: FocusedProviderTransportV1;
  persistence: SemanticAuthoringExecutionPersistenceV1<CharacterDefinitionV3
    | CharacterMigrationReviewCandidateV1 | FocusedCharacterCompleteReviewV1, string>; fail: FailFocusedBeforeDispatch }) {
  if (assetContentDigest(input.pending) !== input.existing.sourceIdentity.contentDigest) {
    return { accepted: false as const, result: await input.fail("source_drift", "trusted_state_corrupt") };
  }
  const resolved = await resolvePendingRevisionSource({ pending: input.pending,
    storedResolution: input.storedResolution, run: input.run, provider: input.provider,
    persistence: input.persistence, fail: input.fail });
  if (!resolved.accepted) return resolved;
  const current = await getCurrentAssetGeneration("character", input.existing.sourceIdentity.assetId);
  if ((current?.generationId ?? null) !== input.existing.expectedCurrentGenerationId) {
    return { accepted: false as const, result: await input.fail("pointer_drift", "trusted_state_corrupt") };
  }
  return resolved;
}

async function loadFocusedExecutionSource(input: { runId: string; existing: StoredFocusedRun;
  run: ClaimedFocusedRun; provider: FocusedProviderTransportV1;
  persistence: SemanticAuthoringExecutionPersistenceV1<CharacterDefinitionV3
    | CharacterMigrationReviewCandidateV1 | FocusedCharacterCompleteReviewV1, string>; fail: FailFocusedBeforeDispatch }) {
  const stored = await query<{ source_json: unknown; resolved_source_json: unknown | null }>(
    `SELECT source_json, resolved_source_json FROM character_focused_authoring_payloads WHERE run_id = $1`,
    [input.runId]);
  const raw = stored.rows[0]?.source_json;
  let source: unknown;
  try { source = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { return { accepted: false as const, result: await input.fail("source_decode", "trusted_state_corrupt") }; }
  const current = await getCurrentAssetGeneration("character", input.existing.sourceIdentity.assetId);
  if ((current?.generationId ?? null) !== input.existing.expectedCurrentGenerationId) {
    return { accepted: false as const, result: await input.fail("pointer_drift", "trusted_state_corrupt") };
  }
  const correction = decodeCharacterReviewCorrectionSourceV1(source);
  if (correction) {
    if (assetContentDigest(correction) !== input.existing.sourceIdentity.contentDigest
      || correction.requestedCluster !== null) {
      return { accepted: false as const, result: await input.fail("source_drift", "trusted_state_corrupt") };
    }
    const resolved = await resolvePendingRevisionSource({
      pending: { kind: "revise_pending_scope", definition: correctionPredecessorDefinition(correction.predecessorCandidate),
        naturalText: correction.naturalText }, storedResolution: stored.rows[0]?.resolved_source_json ?? null,
      run: input.run, provider: input.provider, persistence: input.persistence, fail: input.fail,
    });
    if (!resolved.accepted) return resolved;
    const pointer = await getCurrentAssetGeneration("character", input.existing.sourceIdentity.assetId);
    if ((pointer?.generationId ?? null) !== input.existing.expectedCurrentGenerationId) {
      return { accepted: false as const, result: await input.fail("pointer_drift", "trusted_state_corrupt") };
    }
    return { accepted: true as const, adapter: createCharacterSemanticAuthoringAdapterV3(),
      source: { ...correction, requestedCluster: resolved.source.requestedCluster } };
  }
  const pendingScope = decodeUnresolvedCharacterRevisionSourceV1(source);
  if (pendingScope) {
    const resolved = await resolvePendingExecutionSource({ pending: pendingScope,
      storedResolution: stored.rows[0]?.resolved_source_json ?? null, existing: input.existing,
      run: input.run, provider: input.provider, persistence: input.persistence, fail: input.fail });
    if (!resolved.accepted) return resolved;
    source = resolved.source;
  }
  const adapter = createCharacterSemanticAuthoringAdapterV3();
  const decoded = adapter.decodeFrozenSource(source);
  if (!decoded.accepted || (!pendingScope
    && assetContentDigest(decoded.value) !== input.existing.sourceIdentity.contentDigest)) {
    return { accepted: false as const, result: await input.fail("source_drift", "trusted_state_corrupt") };
  }
  return { accepted: true as const, adapter, source: decoded.value };
}

async function completeExecutionAdapter(run: ClaimedFocusedRun, source: CompleteCharacterSourceV1,
  executionFence: AuthoringExecutionFence) {
  const attempt = await withTransaction(async (connection) => {
    await assertFamilyAuthoringFence(connection, "character", run.attemptId, executionFence);
    const found = await connection.query<{ source_digest: string; source_text: string; kind: string }>(
      `SELECT source_digest, source_text, kind FROM character_authoring_attempts
        WHERE attempt_id = $1 AND owner_user_id = $2 AND character_id = $3`,
      [run.attemptId, run.ownerUserId, run.sourceIdentity.assetId]);
    return z.object({ source_digest: z.string().regex(/^[a-f0-9]{64}$/),
      source_text: z.string(), kind: z.string() }).parse(found.rows[0]);
  });
  const mode = source.kind === "review_candidate_correction" ? source.predecessorCandidate.mode : source.kind;
  if (source.kind === "migrate" || run.mode !== mode
    || attempt.kind !== (mode === "create" ? "create" : "revision")
    || source.naturalText !== attempt.source_text) throw new Error("FOCUSED_CHARACTER_COMMAND_MISMATCH");
  if (source.kind === "review_candidate_correction") {
    await withTransaction(async (connection) => {
      await assertFamilyAuthoringFence(connection, "character", run.attemptId, executionFence);
      const frozen = await readCompleteFocusedCharacterReview(connection, source.predecessorAttemptId, run.ownerUserId);
      if (assetContentDigest(frozen.complete) !== assetContentDigest(source.predecessorCandidate)) {
        throw new Error("CORRECTION_PREDECESSOR_BINDING_MISMATCH");
      }
    });
    return createCompleteCharacterAdapterV1({ attemptId: run.attemptId, sourceDigest: attempt.source_digest,
      revisionDisclosurePolicy: correctionPredecessorDisclosure(source.predecessorCandidate),
      compilerCompatibility: correctionPredecessorCompatibility(source.predecessorCandidate) });
  }
  const generation = source.kind === "revise" && run.sourceIdentity.generationId
    ? await getAssetGeneration(run.sourceIdentity.generationId) : null;
  const previous = generation ? CharacterGenerationEnvelopeV3Schema.parse(generation.content) : null;
  if (source.kind === "revise" && (!generation || !previous
    || generation.assetType !== "character" || generation.assetId !== run.sourceIdentity.assetId
    || assetContentDigest(previous.definition) !== assetContentDigest(source.definition))) {
    throw new Error("FOCUSED_CHARACTER_SOURCE_GENERATION_MISMATCH");
  }
  return createCompleteCharacterAdapterV1({ attemptId: run.attemptId,
    sourceDigest: attempt.source_digest, revisionDisclosurePolicy: previous?.disclosurePolicy ?? null,
    compilerCompatibility: CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3.required });
}

export async function runCharacterFocusedAuthoringJobV3(input: {
  llm: LlmProvider;
  attemptId: string;
  ownerUserId: string;
  executionFence: AuthoringExecutionFence;
}): Promise<"completed" | "failed" | null> {
  const found = await query<{ run_id: string }>(
    `SELECT run_id FROM semantic_authoring_runs WHERE attempt_id = $1 AND owner_user_id = $2`,
    [input.attemptId, input.ownerUserId],
  );
  const runId = found.rows[0]?.run_id;
  if (!runId) return null; // This command belongs to the unchanged legacy route.
  const existing = await runs.getSemanticAuthoringRunV1(runId);
  if (!existing) throw new Error("FOCUSED_CHARACTER_RUN_MISSING");
  const terminal = await terminalExistingFocusedRun(existing, input);
  if (terminal) return terminal;
  const claimed = await runs.claimSemanticAuthoringRunV1(runId, input.executionFence.workerId,
    new Date().toISOString());
  if (!claimed.accepted) return "failed";
  const run = claimed.value;
  const persistence = createFocusedPersistence(runId, run, input);
  const fail = async (code: string,
    category: "technical_failure" | "trusted_state_corrupt" | "resource_exhausted" | "provider_transport_unavailable",
    transportReason?: "policy_disallows_recovery" | "no_admissible_recovery_basis") =>
    failFocusedBeforeDispatch({ runId, run, persistence, code, category, transportReason });
  const provider = input.llm.semanticAuthoringProvider;
  if (!provider || provider.pricingIdentity !== run.pricingIdentity
    || provider.tokenEstimatorIdentity !== run.tokenEstimatorIdentity) {
    return fail("provider_identity", "technical_failure");
  }
  // Validate the recorded allowance before revision-scope dispatch can reserve/send.
  let policy: SemanticAuthoringPolicyV1;
  try {
    policy = frozenCharacterAuthoringExecutionPolicyV1(run);
  } catch {
    return fail("policy_identity", "trusted_state_corrupt");
  }
  const completeRun = policy.identity === "character_complete_review_policy_v2";
  if (run.adapterIdentity !== (completeRun ? COMPLETE_CHARACTER_ADAPTER_V1
    : createCharacterSemanticAuthoringAdapterV3().identity)) {
    return fail("adapter_identity", "trusted_state_corrupt");
  }
  const loaded = await loadFocusedExecutionSource({ runId, existing, run, provider, persistence, fail });
  if (!loaded.accepted) return loaded.result;
  let completeAdapter: Awaited<ReturnType<typeof completeExecutionAdapter>> | null = null;
  if (completeRun) {
    try { completeAdapter = await completeExecutionAdapter(run, loaded.source, input.executionFence); }
    catch { return fail("complete_source_binding", "trusted_state_corrupt"); }
  }
  const accountedRun = await runs.getSemanticAuthoringRunV1(runId);
  if (!accountedRun || accountedRun.status !== "claimed") return "failed";
  // Project the actual running phase under the family fence; reads only observe it.
  await withTransaction(async (connection) => {
    await assertFamilyAuthoringFence(connection, "character", input.attemptId, input.executionFence);
    await connection.query(`UPDATE character_authoring_attempts
      SET status = 'generating_structure', updated_at = $3
      WHERE attempt_id = $1 AND owner_user_id = $2 AND status = 'pending_structure'`,
    [input.attemptId, input.ownerUserId, new Date().toISOString()]);
  });
  const issues = {
    revisionMismatch: { key: "kernel:revision", finding: { code: "revision", explanation: "Stale proposal revision" } },
    proposalRejected: { key: "kernel:proposal", finding: { code: "proposal", explanation: "Invalid JSON or proposal schema; resubmit only the current focused work" } },
    referenceCheckFailed: { key: "kernel:reference", finding: { code: "reference", explanation: "Unknown proposal reference" } },
  };
  const outcome = completeAdapter ? await executeSemanticAuthoringV1({
    adapter: completeAdapter, run, frozenSource: loaded.source, policy, provider, persistence,
    initialAccounting: accountedRun.accounting, project: projectCompleteCharacterWorkV1, issues,
  }) : await executeSemanticAuthoringV1({
    adapter: loaded.adapter, run, frozenSource: correctionStructuralSource(loaded.source),
    policy, provider, persistence,
    initialAccounting: accountedRun.accounting,
    project: projectFocusedCharacterWorkV1,
    issues,
  });
  return outcome.status === "saved" && outcome.result.kind === "ready_for_review" ? "completed" : "failed";
}

const migrationReviewCandidateSchema = z.object({ kind: z.literal("migration_review_candidate_v1"),
  definition: CharacterDefinitionV3Schema, deferredValues: z.array(CharacterDeferredValueV1Schema),
  compatibility: CharacterCompilerCompatibilityV1Schema.nullable(),
  pendingPreservation: z.array(z.object({ sourceClaimId: z.string(), originalValue: z.unknown(),
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    disposition: z.enum(["discard-as-nonmaterial", "defer"]), rationale: z.string() }).strict()),
}).strict();

const focusedReadyReviewSchema = z.object({ kind: z.literal("ready_for_review"),
  finalCandidate: z.union([CharacterDefinitionV3Schema, migrationReviewCandidateSchema,
    FocusedCharacterCompleteReviewV1Schema]),
  finalCandidateDigest: z.string().regex(/^[a-f0-9]{64}$/),
  expectedCurrentGenerationId: z.string().nullable(),
  sourceLedger: z.object({ sourceDispositions: z.array(z.object({
    sourceClaimId: z.string(), disposition: z.enum(["preserve", "transform", "split", "merge",
      "supersede", "discard-as-nonmaterial", "preserve-in-capsule"]),
    targetClaimIds: z.array(z.string()), rationale: z.string(),
  }).strict()), provenance: z.array(z.object({
    targetClaimId: z.string(), sourceClaimIds: z.array(z.string()),
    method: z.enum(["preserved", "derived", "generated"]),
  }).strict()) }).strict().optional(),
});

function decodeFocusedReviewSource(row: { source_json: unknown; resolved_source_json: unknown | null }) {
  const raw = typeof row.source_json === "string" ? JSON.parse(row.source_json) : row.source_json;
  const pending = decodeUnresolvedCharacterRevisionSourceV1(raw);
  const resolution = pending && row.resolved_source_json !== null
    ? CharacterRevisionScopeResolutionV1Schema.safeParse(typeof row.resolved_source_json === "string"
      ? JSON.parse(row.resolved_source_json) : row.resolved_source_json) : null;
  return pending && resolution?.success
    ? { kind: "revise" as const, definition: pending.definition, naturalText: pending.naturalText,
      requestedCluster: resolution.data.requestedCluster }
    : raw;
}

function migrationReviewDetails(input: {
  decoded: CharacterAuthoringSourceV1; definition: CharacterDefinitionV3;
  migrationCandidate: z.infer<typeof migrationReviewCandidateSchema> | null;
  sourceDispositions: readonly { sourceClaimId: string; disposition: string; rationale: string }[];
}) {
  const sourceClaims = input.decoded.kind === "migrate"
    ? new Map(buildCharacterMigrationSourceLedgerV1(input.decoded.definition, input.definition,
      input.decoded.capsule, input.decoded.requiredCapabilities ?? null).claims
      .map((claim) => [claim.sourceClaimId, claim]))
    : new Map<string, ReturnType<typeof buildCharacterMigrationSourceLedgerV1>["claims"][number]>();
  const pendingCopies = new Map(input.migrationCandidate?.pendingPreservation.map((entry) =>
    [entry.sourceClaimId, entry]) ?? []);
  const pendingCopyVerified = (sourceClaimId: string) => {
    const claim = sourceClaims.get(sourceClaimId);
    const copy = pendingCopies.get(sourceClaimId);
    return Boolean(claim && copy && isDeepStrictEqual(copy.originalValue, claim.original)
      && copy.contentDigest === assetContentDigest(claim.original));
  };
  const dispositions = input.decoded.kind === "migrate" ? input.sourceDispositions.map((decision) => ({
    sourceClaimId: decision.sourceClaimId, disposition: decision.disposition, rationale: decision.rationale,
    capsuleCopyVerified: decision.disposition === "discard-as-nonmaterial"
      || decision.disposition === "preserve-in-capsule"
      ? sourceClaims.get(decision.sourceClaimId)?.capsuleCopyAvailable === true : null,
    pendingCopyVerified: decision.disposition === "discard-as-nonmaterial"
      ? pendingCopyVerified(decision.sourceClaimId) : null,
  })) : [];
  return { dispositions, pendingCopyVerified };
}

function migrationCompatibilityReview(candidate: z.infer<typeof migrationReviewCandidateSchema> | null) {
  if (!candidate?.compatibility) return null;
  return { status: candidate.compatibility.status,
    deferred: candidate.compatibility.deferred.map((entry) => ({
      capability: `${entry.capability.consumer}@${entry.capability.version}`, targetPaths: entry.targetPaths })),
    blocked: candidate.compatibility.blocked.map((entry) => ({
      capability: `${entry.capability.consumer}@${entry.capability.version}`, reasonCode: entry.reasonCode })),
  };
}

export type CharacterFocusedMigrationActivationV3 = Readonly<{
  definition: CharacterDefinitionV3;
  deferredValues: z.infer<typeof CharacterDeferredValueV1Schema>[];
  candidateDigest: string;
  expectedCurrentGenerationId: string;
  adapterIdentity: string;
}>;

/**
 * Revalidate the exact terminal migration candidate at the owner-acceptance
 * boundary. This read grants no acceptance and performs no pointer mutation.
 */
type FocusedMigrationRow = {
  status: string; mode: string; adapter_identity: string;
  expected_current_generation_id: string | null; source_content_digest: string;
  source_json: unknown; resolved_source_json: unknown | null; result_json: unknown;
};

function activationMigrationSource(row: FocusedMigrationRow) {
  const sourceInput = decodeFocusedReviewSource(row);
  const decoded = createCharacterSemanticAuthoringAdapterV3().decodeFrozenSource(sourceInput);
  if (!decoded.accepted || decoded.value.kind !== "migrate"
    || !isCharacterBattleMechanicsCapabilitySetV3(decoded.value.requiredCapabilities)
    || assetContentDigest(decoded.value) !== row.source_content_digest) {
    throw new Error("FOCUSED_CHARACTER_MIGRATION_SOURCE_MISMATCH");
  }
  return decoded.value;
}

function assertMigrationSourceAccounting(
  source: ReturnType<typeof activationMigrationSource>,
  definition: z.infer<typeof CharacterDefinitionV3Schema>,
  ready: z.infer<typeof focusedReadyReviewSchema>,
): void {
  const ledger = buildCharacterMigrationSourceLedgerV1(
    source.definition,
    definition,
    source.capsule,
    source.requiredCapabilities ?? null,
  );
  const decisions = new Map<string, SourceDispositionDecisionV1>(
    (ready.sourceLedger?.sourceDispositions ?? [])
      .map((decision) => [decision.sourceClaimId, decision]),
  );
  const provenance = ready.sourceLedger?.provenance ?? [];
  if (ledger.claims.some((claim) => {
    const decision = decisions.get(claim.sourceClaimId);
    return !decision || !characterSourceDispositionSatisfiedV1(
      definition,
      claim,
      decision,
      provenance,
    );
  })) {
    throw new Error("FOCUSED_CHARACTER_MIGRATION_SOURCE_ACCOUNTING_INVALID");
  }
}

export async function readCharacterFocusedMigrationActivationV3(
  attemptId: string,
  ownerUserId: string,
  connection?: DatabaseConnection,
): Promise<CharacterFocusedMigrationActivationV3 | null> {
  const execute = connection
    ? connection.query.bind(connection)
    : query;
  const found = await execute<{ status: string; mode: string; adapter_identity: string;
    expected_current_generation_id: string | null; source_content_digest: string;
    source_json: unknown; resolved_source_json: unknown | null; result_json: unknown }>(
    `SELECT r.status, r.mode, r.adapter_identity, r.expected_current_generation_id,
            r.source_content_digest, p.source_json, p.resolved_source_json, p.result_json
       FROM semantic_authoring_runs r
       JOIN character_focused_authoring_payloads p ON p.run_id = r.run_id
      WHERE r.attempt_id = $1 AND r.owner_user_id = $2`,
    [attemptId, ownerUserId],
  );
  const row = found.rows[0];
  if (!row) return null;
  if (row.status !== "ready_for_review" || row.mode !== "migrate") {
    throw new Error("FOCUSED_CHARACTER_MIGRATION_NOT_READY");
  }
  const ready = focusedReadyReviewSchema.parse(
    typeof row.result_json === "string" ? JSON.parse(row.result_json) : row.result_json,
  );
  if (!row.expected_current_generation_id
    || ready.expectedCurrentGenerationId !== row.expected_current_generation_id) {
    throw new Error("FOCUSED_CHARACTER_MIGRATION_POINTER_IDENTITY_MISMATCH");
  }
  const source = activationMigrationSource(row);
  const candidateDigest = createHash("sha256")
    .update(JSON.stringify(ready.finalCandidate)).digest("hex");
  if (candidateDigest !== ready.finalCandidateDigest) {
    throw new Error("FOCUSED_CHARACTER_MIGRATION_CANDIDATE_DIGEST_MISMATCH");
  }
  const wrapped = migrationReviewCandidateSchema.safeParse(ready.finalCandidate);
  const definition = CharacterDefinitionV3Schema.parse(
    wrapped.success ? wrapped.data.definition : ready.finalCandidate,
  );
  const deferredValues = wrapped.success ? wrapped.data.deferredValues : [];
  if (wrapped.success && wrapped.data.pendingPreservation.length > 0) {
    throw new Error("FOCUSED_CHARACTER_MIGRATION_PRESERVATION_PENDING");
  }
  const compatibility = projectCharacterCompilerCompatibilityV1({
    required: CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3,
    available: CHARACTER_BATTLE_MECHANICS_CAPABILITY_SET_V3.required,
    deferredValues,
    blocked: [],
  });
  if (compatibility.status !== "ready") {
    throw new Error("FOCUSED_CHARACTER_MIGRATION_CONSUMER_BLOCKED");
  }
  assertMigrationSourceAccounting(source, definition, ready);
  return {
    definition,
    deferredValues,
    candidateDigest,
    expectedCurrentGenerationId: row.expected_current_generation_id,
    adapterIdentity: row.adapter_identity,
  };
}

function reviewSourceFields(source: CharacterAuthoringSourceV1) {
  if (source.kind === "migrate" || source.kind === "create") return new Map<string, unknown>();
  return new Map(Object.entries(source.definition));
}

/** Owner-only inspection of the stored terminal payload; never grants activation. */
export async function readCharacterFocusedAuthoringReviewV3(attemptId: string, ownerUserId: string): Promise<{
  sourceRetryAvailable: boolean;
  correctionSource: { kind: "complete" | "legacy_structural"; candidateDigest: string } | null;
  semanticCandidateReview: CharacterAuthoringReview["semanticCandidateReview"];
} | null> {
  const found = await query<{ attempt_status: string; mode: string; status: string; source_generation_id: string | null; source_json: unknown;
    resolved_source_json: unknown | null; result_json: unknown }>(
    `SELECT a.status AS attempt_status, r.mode, r.status, r.source_generation_id, p.source_json, p.resolved_source_json, p.result_json FROM semantic_authoring_runs r
      JOIN character_focused_authoring_payloads p ON p.run_id = r.run_id
      JOIN character_authoring_attempts a ON a.attempt_id = r.attempt_id AND a.owner_user_id = r.owner_user_id
      WHERE r.attempt_id = $1 AND r.owner_user_id = $2`, [attemptId, ownerUserId]);
  const row = found.rows[0];
  if (!row) return null;
  const ready = focusedReadyReviewSchema.safeParse(
    typeof row.result_json === "string" ? JSON.parse(row.result_json) : row.result_json);
  if (!ready.success) return { sourceRetryAvailable: row.status === "failed", semanticCandidateReview: null, correctionSource: null };
  const correctionSource = row.status === "ready_for_review" && row.attempt_status === "awaiting_owner_acceptance"
    && row.mode !== "migrate" ? await withTransaction(async connection => {
      const frozen = await readCompleteFocusedCharacterReview(connection, attemptId, ownerUserId);
      return { kind: frozen.complete.kind === "character_complete_review_v1" ? "complete" as const : "legacy_structural" as const,
        candidateDigest: frozen.complete.candidateDigest };
    }) : null;
  const complete = FocusedCharacterCompleteReviewV1Schema.safeParse(ready.data.finalCandidate);
  if (complete.success) {
    if (ready.data.finalCandidateDigest !== complete.data.candidateDigest
      || complete.data.envelope.provenance.attemptId !== attemptId) {
      throw new Error("FOCUSED_CHARACTER_COMPLETE_REVIEW_BINDING_MISMATCH");
    }
    const correction = decodeCharacterReviewCorrectionSourceV1(
      typeof row.source_json === "string" ? JSON.parse(row.source_json) : row.source_json);
    if (correction) {
      if (correction.predecessorCandidate.mode !== complete.data.mode) throw new Error("FOCUSED_CHARACTER_SOURCE_INVALID");
      const review = fixedCandidateOwnerReview(complete.data.envelope, correction.naturalText,
        { kind: "revision", currentCandidate: correction.predecessorCandidate.kind === "character_complete_review_v1"
          ? correction.predecessorCandidate.envelope : correction.predecessorCandidate.definition });
      return { sourceRetryAvailable: false, correctionSource, semanticCandidateReview: review.semanticCandidateReview ?? null };
    }
    const source = createCharacterSemanticAuthoringAdapterV3().decodeFrozenSource(decodeFocusedReviewSource(row));
    if (!source.accepted || source.value.kind === "migrate" || source.value.kind !== complete.data.mode) {
      throw new Error("FOCUSED_CHARACTER_SOURCE_INVALID");
    }
    const previous = row.source_generation_id ? await getAssetGeneration(row.source_generation_id) : null;
    const review = fixedCandidateOwnerReview(complete.data.envelope, source.value.naturalText ?? null,
      { kind: complete.data.mode === "create" ? "create" : "revision", currentCandidate: previous?.content ?? null });
    return { sourceRetryAvailable: false, correctionSource, semanticCandidateReview: review.semanticCandidateReview ?? null };
  }
  const parsedMigrationCandidate = migrationReviewCandidateSchema.safeParse(ready.data.finalCandidate);
  const migrationCandidate = parsedMigrationCandidate.success ? parsedMigrationCandidate.data : null;
  const definition = CharacterDefinitionV3Schema.parse(
    migrationCandidate?.definition ?? ready.data.finalCandidate);
  const sourceInput = decodeFocusedReviewSource(row);
  const decoded = createCharacterSemanticAuthoringAdapterV3().decodeFrozenSource(sourceInput);
  if (!decoded.accepted) throw new Error("FOCUSED_CHARACTER_SOURCE_INVALID");
  const sourceFields = reviewSourceFields(decoded.value);
  const { dispositions: sourceDispositions, pendingCopyVerified } = migrationReviewDetails({
    decoded: decoded.value, definition, migrationCandidate,
    sourceDispositions: ready.data.sourceLedger?.sourceDispositions ?? [],
  });
  const labels: Record<string, string> = { schemaVersion: "定義版", identity: "人物設定",
    profileBackground: "背景", psycheDisposition: "心理傾向", capabilities: "能力・行動",
    relationshipSeeds: "関係性", speechPolicy: "話し方", appearance: "外見",
    expressionNotes: "表現上の注記", actionNorms: "行動規範", consciousGuidance: "意識的な指針",
    mechanicalConflictFallbacks: "機械的な競合時の代替", inventory: "所持品",
    initialLoadout: "初期装備", combat: "戦闘設定" };
  return { sourceRetryAvailable: false, correctionSource, semanticCandidateReview: {
    schemaVersion: 3,
    fields: Object.entries(definition).map(([key, value]) => ({
      key, label: labels[key] ?? key,
      source: sourceFields.has(key) ? JSON.stringify(sourceFields.get(key), null, 2) : null,
      candidate: JSON.stringify(value, null, 2),
    })),
    sourceDispositions,
    pendingPreservation: migrationCandidate?.pendingPreservation.map((entry) => ({
      sourceClaimId: entry.sourceClaimId,
      disposition: entry.disposition,
      rationale: entry.rationale,
      exactSourceCopyVerified: pendingCopyVerified(entry.sourceClaimId),
    })) ?? [],
    deferredValues: migrationCandidate?.deferredValues.map((value) => ({
      targetPath: value.targetPath,
      reason: value.reason,
      candidateSourcePaths: value.candidateSourcePaths,
      requiringCapability: `${value.requiringCapability.consumer}@${value.requiringCapability.version}`,
    })) ?? [],
    compatibility: migrationCompatibilityReview(migrationCandidate),
    limitation: correctionSource?.kind === "legacy_structural"
      ? "旧構造候補はプロフィールとclaim検証が未完了です。明示的な調整で新しい試行を開始できます。現在の世代は変更していません。"
      : "構造化候補を保存しました。意味・公開範囲の検証と最終採用の接続は未完了です。現在の世代は変更していません。",
  } };
}
