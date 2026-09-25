import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { CharacterCompilerCompatibilityV1Schema, CharacterDeferredValueV1Schema,
  CharacterDefinitionV3Schema, type CharacterAuthoringReview,
  isCharacterBattleMechanicsCapabilitySetV3,
  type CharacterDefinitionV3, type SemanticAuthoringRunV1 } from "@kshiai/shared";
import { query, withTransaction, type DatabaseConnection } from "../db.js";
import type { LlmProvider } from "../llm/types.js";
import { assetContentDigest, getCurrentAssetGeneration } from "../repositories/asset-generations.js";
import { assertFamilyAuthoringFence, finishFamilyAuthoringJobInTransaction,
  type AuthoringExecutionFence } from "../repositories/family-authoring-jobs.js";
import * as runs from "../repositories/semantic-authoring.js";
import { createCharacterSemanticAuthoringAdapterV3,
  type CharacterAuthoringSourceV1, type CharacterMigrationReviewCandidateV1 } from "./semantic-authoring/adapters/character-v3.js";
import { buildCharacterMigrationSourceLedgerV1 } from "./semantic-authoring/adapters/character-source-ledger.js";
import { projectFocusedCharacterWorkV1 } from "./semantic-authoring/adapters/character-context.js";
import { createDurableSemanticAuthoringExecutionV1 } from "./semantic-authoring/durable-execution.js";
import { executeSemanticAuthoringV1 } from "./semantic-authoring/execution.js";
import { semanticAuthoringExecutionPolicyV1 } from "./semantic-authoring/execution-policy.js";
import { decodeUnresolvedCharacterRevisionSourceV1,
  type UnresolvedCharacterRevisionSourceV1 } from "./semantic-authoring/character-revision-scope-source.js";
import { CharacterRevisionScopeResolutionV1Schema,
  resolveCharacterRevisionScopeV1 } from "./semantic-authoring/character-revision-scope.js";

export type CharacterFocusedRegistrationSourceV1 =
  CharacterAuthoringSourceV1 | UnresolvedCharacterRevisionSourceV1;

/** Attach a frozen V3 execution to an existing queued owner command, in its transaction. */
export async function registerCharacterFocusedAuthoringV3(connection: DatabaseConnection, input: {
  attemptId: string;
  ownerUserId: string;
  characterId: string;
  sourceGenerationId: string | null;
  expectedCurrentGenerationId: string | null;
  source: CharacterFocusedRegistrationSourceV1;
  pricingIdentity: string;
  createdAt: string;
  predecessorRunId?: string;
  commandId?: string;
}) {
  const adapter = createCharacterSemanticAuthoringAdapterV3();
  const decoded = adapter.decodeFrozenSource(input.source);
  const pendingScope = decodeUnresolvedCharacterRevisionSourceV1(input.source);
  if ((!decoded.accepted && !pendingScope)
    || (decoded.accepted && decoded.value.kind === "revise" && !decoded.value.naturalText?.trim())) {
    throw new Error("FOCUSED_CHARACTER_SOURCE_INVALID");
  }
  const source = pendingScope ?? (decoded.accepted ? decoded.value : null);
  if (!source) throw new Error("FOCUSED_CHARACTER_SOURCE_INVALID");
  if (source.kind === "migrate" &&
    !isCharacterBattleMechanicsCapabilitySetV3(source.requiredCapabilities)) {
    throw new Error("FOCUSED_CHARACTER_CAPABILITY_SET_INVALID");
  }
  const attempt = await connection.query<{ owner_user_id: string; character_id: string; status: string;
    kind: string; expected_generation_id: string | null; source_text: string | null }>(
    `SELECT owner_user_id, character_id, status, kind, expected_generation_id, source_text
      FROM character_authoring_attempts WHERE attempt_id = $1`,
    [input.attemptId],
  );
  if (attempt.rows[0]?.owner_user_id !== input.ownerUserId
    || attempt.rows[0]?.character_id !== input.characterId
    || attempt.rows[0]?.status !== "pending_structure") throw new Error("FOCUSED_CHARACTER_COMMAND_MISMATCH");
  const command = attempt.rows[0];
  const expectedKind = source.kind === "create" ? "create"
    : source.kind === "revise" || source.kind === "revise_pending_scope" ? "revision" : "upgrade";
  if (command.kind !== expectedKind
    || command.expected_generation_id !== input.expectedCurrentGenerationId
    || input.sourceGenerationId !== input.expectedCurrentGenerationId
    || (source.kind !== "migrate" && command.source_text !== source.naturalText)) {
    throw new Error("FOCUSED_CHARACTER_COMMAND_MISMATCH");
  }
  if (source.kind === "migrate" && source.capsule
    && (source.capsule.migrationAttemptId !== input.attemptId
      || source.capsule.sourceGenerationId !== input.sourceGenerationId
      || source.capsule.targetGenerationId === input.sourceGenerationId)) {
    throw new Error("FOCUSED_CHARACTER_CAPSULE_IDENTITY_MISMATCH");
  }
  if (source.kind !== "create") {
    const generation = await connection.query<{ content_json: unknown; schema_version: number }>(
      `SELECT content_json, schema_version FROM asset_generations
        WHERE generation_id = $1 AND asset_type = 'character' AND asset_id = $2`,
      [input.sourceGenerationId, input.characterId]);
    const stored = generation.rows[0];
    const content = stored && z.object({ definition: z.unknown() }).safeParse(
      typeof stored.content_json === "string" ? JSON.parse(stored.content_json) : stored.content_json);
    if (!stored || Number(stored.schema_version) !== (source.kind === "migrate" ? 2 : 3)
      || !content?.success || assetContentDigest(content.data.definition) !== assetContentDigest(source.definition)) {
      throw new Error("FOCUSED_CHARACTER_SOURCE_GENERATION_MISMATCH");
    }
  }
  const runId = randomUUID();
  const run: Omit<SemanticAuthoringRunV1, "executionFence"> = {
    runId, attemptId: input.attemptId, family: "character",
    mode: source.kind === "revise_pending_scope" ? "revise" : source.kind,
    ownerUserId: input.ownerUserId,
    sourceIdentity: { assetId: input.characterId, generationId: input.sourceGenerationId,
      contentDigest: assetContentDigest(source) },
    targetContract: { family: "character", version: 3 }, adapterIdentity: adapter.identity,
    policyIdentity: "semantic_authoring_policy_v1", pricingIdentity: input.pricingIdentity,
    tokenEstimatorIdentity: "utf8-byte-upper-bound-v1",
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
  if (existing.status !== "pending") {
    if (existing.status === "claimed") {
      await runs.recoverSemanticAuthoringProcessLossV1({ runId,
        recoveryOwnerId: input.executionFence.workerId, recoveredAt: new Date().toISOString() });
      await withTransaction(async (connection) => {
        await assertFamilyAuthoringFence(connection, "character", input.attemptId, input.executionFence);
        await connection.query(`UPDATE character_authoring_attempts SET status = 'failed',
          error_code = 'process_or_lease_lost' WHERE attempt_id = $1 AND owner_user_id = $2`,
        [input.attemptId, input.ownerUserId]);
        await finishFamilyAuthoringJobInTransaction(connection, "character", input.attemptId,
          "completed", input.executionFence);
      });
      return "failed";
    }
    return existing.status === "ready_for_review" ? "completed" : "failed";
  }
  const claimed = await runs.claimSemanticAuthoringRunV1(runId, input.executionFence.workerId,
    new Date().toISOString());
  if (!claimed.accepted) return "failed";
  const run = claimed.value;
  const persistence = createDurableSemanticAuthoringExecutionV1<
    CharacterDefinitionV3 | CharacterMigrationReviewCandidateV1, string>({
    run, familyPayloadRef: `character-focused:${runId}`,
    async persistFamilyResult(connection, result) {
      await assertFamilyAuthoringFence(connection, "character", input.attemptId, input.executionFence);
      const now = new Date().toISOString();
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
      await finishFamilyAuthoringJobInTransaction(connection, "character", input.attemptId,
        "completed", input.executionFence);
    },
  });
  const failBeforeDispatch = async (code: string,
    category: "technical_failure" | "trusted_state_corrupt" | "resource_exhausted" | "provider_transport_unavailable",
    transportReason?: "policy_disallows_recovery" | "no_admissible_recovery_basis") => {
    const latest = await runs.getSemanticAuthoringRunV1(runId);
    const accounting = latest?.accounting ?? run.accounting;
    await persistence.finish({ kind: "failed", runId, attemptId: run.attemptId,
      sourceIdentity: run.sourceIdentity, policyIdentity: run.policyIdentity, adapterIdentity: run.adapterIdentity,
      accounting, receipt: { category, ...(transportReason ? { transportReason } : {}), accounting,
        relevantFindingKeys: [code], sourceIdentity: run.sourceIdentity } });
    return "failed" as const;
  };
  const provider = input.llm.semanticAuthoringProvider;
  if (!provider || provider.pricingIdentity !== run.pricingIdentity
    || provider.tokenEstimatorIdentity !== run.tokenEstimatorIdentity) {
    return failBeforeDispatch("provider_identity", "technical_failure");
  }
  const stored = await query<{ source_json: unknown; resolved_source_json: unknown | null }>(
    `SELECT source_json, resolved_source_json FROM character_focused_authoring_payloads
      WHERE run_id = $1`, [runId]);
  const raw = stored.rows[0]?.source_json;
  let source: unknown;
  try { source = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { return failBeforeDispatch("source_decode", "trusted_state_corrupt"); }
  const current = await getCurrentAssetGeneration("character", existing.sourceIdentity.assetId);
  if ((current?.generationId ?? null) !== existing.expectedCurrentGenerationId) {
    return failBeforeDispatch("pointer_drift", "trusted_state_corrupt");
  }
  const pendingScope = decodeUnresolvedCharacterRevisionSourceV1(source);
  if (pendingScope) {
    if (assetContentDigest(pendingScope) !== existing.sourceIdentity.contentDigest) {
      return failBeforeDispatch("source_drift", "trusted_state_corrupt");
    }
    let resolution: unknown = stored.rows[0]?.resolved_source_json;
    if (resolution === null) {
      const scopeOutcome = await resolveCharacterRevisionScopeV1({
        naturalText: pendingScope.naturalText, provider,
        policy: semanticAuthoringExecutionPolicyV1(provider.pricingIdentity),
        accounting: run.accounting, persistence,
      });
      if (scopeOutcome.status === "lost_ownership") return "failed";
      if (scopeOutcome.status === "failed") {
        return failBeforeDispatch(scopeOutcome.reason, scopeOutcome.category,
          scopeOutcome.category === "provider_transport_unavailable"
            ? provider.transportPolicy.maxRecoveriesPerWorkItem === 0
              ? "policy_disallows_recovery" : "no_admissible_recovery_basis"
            : undefined);
      }
      const frozen = await query<{ run_id: string }>(`UPDATE character_focused_authoring_payloads
        SET resolved_source_json = $2 WHERE run_id = $1 AND resolved_source_json IS NULL
          AND EXISTS (SELECT 1 FROM semantic_authoring_runs
            WHERE run_id = $1 AND status = 'claimed' AND fence_owner_id = $3 AND fencing_token = $4)
        RETURNING run_id`, [runId, JSON.stringify(scopeOutcome.resolution),
        run.executionFence.ownerId, run.executionFence.fencingToken]);
      if (frozen.rowCount !== 1) return "failed";
      resolution = scopeOutcome.resolution;
    }
    let parsedResolution: unknown;
    try { parsedResolution = typeof resolution === "string" ? JSON.parse(resolution) : resolution; }
    catch { return failBeforeDispatch("scope_decode", "trusted_state_corrupt"); }
    const validated = CharacterRevisionScopeResolutionV1Schema.safeParse(parsedResolution);
    if (!validated.success || !pendingScope.naturalText.includes(validated.data.sourceQuote)) {
      return failBeforeDispatch("scope_drift", "trusted_state_corrupt");
    }
    source = { kind: "revise", definition: pendingScope.definition,
      naturalText: pendingScope.naturalText, requestedCluster: validated.data.requestedCluster };
    const afterScope = await getCurrentAssetGeneration("character", existing.sourceIdentity.assetId);
    if ((afterScope?.generationId ?? null) !== existing.expectedCurrentGenerationId) {
      return failBeforeDispatch("pointer_drift", "trusted_state_corrupt");
    }
  }
  const adapter = createCharacterSemanticAuthoringAdapterV3();
  const decoded = adapter.decodeFrozenSource(source);
  if (!decoded.accepted || (!pendingScope
    && assetContentDigest(decoded.value) !== existing.sourceIdentity.contentDigest)) {
    return failBeforeDispatch("source_drift", "trusted_state_corrupt");
  }
  const accountedRun = await runs.getSemanticAuthoringRunV1(runId);
  if (!accountedRun || accountedRun.status !== "claimed") return "failed";
  const outcome = await executeSemanticAuthoringV1({
    adapter, run, frozenSource: decoded.value,
    policy: semanticAuthoringExecutionPolicyV1(provider.pricingIdentity), provider, persistence,
    initialAccounting: accountedRun.accounting,
    project: projectFocusedCharacterWorkV1,
    issues: {
      revisionMismatch: { key: "kernel:revision", finding: { code: "revision", explanation: "Stale proposal revision" } },
      proposalRejected: { key: "kernel:proposal", finding: { code: "proposal", explanation: "Invalid JSON or proposal schema; resubmit only the current focused work" } },
      referenceCheckFailed: { key: "kernel:reference", finding: { code: "reference", explanation: "Unknown proposal reference" } },
    },
  });
  return outcome.status === "saved" && outcome.result.kind === "ready_for_review" ? "completed" : "failed";
}

/** Owner-only inspection of the stored terminal payload; never grants activation. */
export async function readCharacterFocusedAuthoringReviewV3(attemptId: string, ownerUserId: string): Promise<{
  sourceRetryAvailable: boolean;
  semanticCandidateReview: CharacterAuthoringReview["semanticCandidateReview"];
} | null> {
  const found = await query<{ status: string; source_json: unknown;
    resolved_source_json: unknown | null; result_json: unknown }>(
    `SELECT r.status, p.source_json, p.resolved_source_json, p.result_json FROM semantic_authoring_runs r
      JOIN character_focused_authoring_payloads p ON p.run_id = r.run_id
      WHERE r.attempt_id = $1 AND r.owner_user_id = $2`, [attemptId, ownerUserId]);
  const row = found.rows[0];
  if (!row) return null;
  const migrationReviewCandidate = z.object({ kind: z.literal("migration_review_candidate_v1"),
    definition: CharacterDefinitionV3Schema, deferredValues: z.array(CharacterDeferredValueV1Schema),
    compatibility: CharacterCompilerCompatibilityV1Schema.nullable(),
    pendingPreservation: z.array(z.object({ sourceClaimId: z.string(), originalValue: z.unknown(),
      contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
      disposition: z.enum(["discard-as-nonmaterial", "defer"]), rationale: z.string() }).strict()),
  }).strict();
  const ready = z.object({ kind: z.literal("ready_for_review"),
    finalCandidate: z.union([CharacterDefinitionV3Schema, migrationReviewCandidate]),
    sourceLedger: z.object({ sourceDispositions: z.array(z.object({
      sourceClaimId: z.string(), disposition: z.string(), rationale: z.string(),
    }).passthrough()) }).passthrough().optional() })
    .safeParse(typeof row.result_json === "string" ? JSON.parse(row.result_json) : row.result_json);
  if (!ready.success) return { sourceRetryAvailable: row.status === "failed", semanticCandidateReview: null };
  const parsedMigrationCandidate = migrationReviewCandidate.safeParse(ready.data.finalCandidate);
  const migrationCandidate = parsedMigrationCandidate.success ? parsedMigrationCandidate.data : null;
  const definition = CharacterDefinitionV3Schema.parse(
    migrationCandidate?.definition ?? ready.data.finalCandidate);
  const raw = typeof row.source_json === "string" ? JSON.parse(row.source_json) : row.source_json;
  const pending = decodeUnresolvedCharacterRevisionSourceV1(raw);
  const resolutionRaw = row.resolved_source_json;
  const resolution = pending && resolutionRaw !== null
    ? CharacterRevisionScopeResolutionV1Schema.safeParse(
      typeof resolutionRaw === "string" ? JSON.parse(resolutionRaw) : resolutionRaw)
    : null;
  const sourceInput = pending && resolution?.success
    ? { kind: "revise", definition: pending.definition, naturalText: pending.naturalText,
      requestedCluster: resolution.data.requestedCluster }
    : raw;
  const decoded = createCharacterSemanticAuthoringAdapterV3().decodeFrozenSource(sourceInput);
  if (!decoded.accepted) throw new Error("FOCUSED_CHARACTER_SOURCE_INVALID");
  const source = decoded.value.kind === "migrate" || decoded.value.kind === "create"
    ? {}
    : decoded.value.definition;
  const sourceFields = new Map(Object.entries(z.record(z.unknown()).parse(source)));
  const sourceClaims = decoded.value.kind === "migrate"
    ? new Map(buildCharacterMigrationSourceLedgerV1(decoded.value.definition, definition,
      decoded.value.capsule, decoded.value.requiredCapabilities ?? null).claims
      .map((claim) => [claim.sourceClaimId, claim]))
    : new Map<string, ReturnType<typeof buildCharacterMigrationSourceLedgerV1>["claims"][number]>();
  const pendingCopies = new Map(migrationCandidate?.pendingPreservation.map((entry) =>
    [entry.sourceClaimId, entry]) ?? []);
  const pendingCopyVerified = (sourceClaimId: string) => {
    const claim = sourceClaims.get(sourceClaimId);
    const copy = pendingCopies.get(sourceClaimId);
    return Boolean(claim && copy && isDeepStrictEqual(copy.originalValue, claim.original)
      && copy.contentDigest === assetContentDigest(claim.original));
  };
  const sourceDispositions = decoded.value.kind === "migrate"
    ? (ready.data.sourceLedger?.sourceDispositions ?? []).map((decision) => ({
      sourceClaimId: decision.sourceClaimId,
      disposition: decision.disposition,
      rationale: decision.rationale,
      capsuleCopyVerified: decision.disposition === "discard-as-nonmaterial"
        || decision.disposition === "preserve-in-capsule"
        ? sourceClaims.get(decision.sourceClaimId)?.capsuleCopyAvailable === true : null,
      pendingCopyVerified: decision.disposition === "discard-as-nonmaterial"
        ? pendingCopyVerified(decision.sourceClaimId) : null,
    }))
    : [];
  const labels: Record<string, string> = { schemaVersion: "定義版", identity: "人物設定",
    profileBackground: "背景", psycheDisposition: "心理傾向", capabilities: "能力・行動",
    relationshipSeeds: "関係性", speechPolicy: "話し方", appearance: "外見",
    expressionNotes: "表現上の注記", actionNorms: "行動規範", consciousGuidance: "意識的な指針",
    mechanicalConflictFallbacks: "機械的な競合時の代替", inventory: "所持品",
    initialLoadout: "初期装備", combat: "戦闘設定" };
  return { sourceRetryAvailable: false, semanticCandidateReview: {
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
    compatibility: migrationCandidate?.compatibility ? {
      status: migrationCandidate.compatibility.status,
      deferred: migrationCandidate.compatibility.deferred.map((entry) => ({
        capability: `${entry.capability.consumer}@${entry.capability.version}`,
        targetPaths: entry.targetPaths,
      })),
      blocked: migrationCandidate.compatibility.blocked.map((entry) => ({
        capability: `${entry.capability.consumer}@${entry.capability.version}`,
        reasonCode: entry.reasonCode,
      })),
    } : null,
    limitation: "構造化候補を保存しました。意味・公開範囲の検証と最終採用の接続は未完了です。現在の世代は変更していません。",
  } };
}
