import { query } from "../db.js";
import { assetContentDigest } from "../repositories/asset-generations.js";
import {
  NARRATION_ATTEMPT_RETENTION_DAYS,
  NARRATION_PUBLIC_EVENT_RETENTION_DAYS,
} from "./narration-worker.js";

type JsonObject = Record<string, unknown>;
type AssetBindingValidation = "valid" | "mismatch" | "legacy_unknown";

function psycheReactionSummary(agent: unknown): JsonObject | null {
  const receipt = asObject(asObject(agent)?.reactionReceiptV1);
  if (!receipt) return null;
  const contributions = Array.isArray(receipt.contributions)
    ? receipt.contributions.flatMap((value) => {
        const contribution = asObject(value);
        const code = asString(contribution?.code);
        const dimension = asString(contribution?.dimension);
        return code && dimension ? [{ code, dimension }] : [];
      }).slice(0, 48)
    : [];
  const sourceEventIds = Array.isArray(receipt.sourceEventIds)
    ? receipt.sourceEventIds.filter((value): value is string => typeof value === "string")
    : [];
  return {
    schemaVersion: asNumber(receipt.schemaVersion),
    policyGeneration: asString(receipt.policyGeneration),
    turn: asNumber(receipt.turn),
    observerSide: asString(receipt.observerSide),
    route: asString(receipt.route),
    reason: asString(receipt.reason),
    sourceCount: sourceEventIds.length,
    contributions,
  };
}

function validateAssetManifest(manifest: unknown): Record<string, AssetBindingValidation> | null {
  const root = asObject(manifest);
  if (!root) return null;
  const characters = asObject(root.characters);
  const entries: Array<[string, JsonObject | null]> = [
    ["characterA", asObject(characters?.a)],
    ["characterB", asObject(characters?.b)],
    ["narrationStyle", asObject(root.narrationStyle)],
    ["battlefieldInstance", asObject(root.battlefield)],
    ["dialoguePipeline", asObject(root.dialoguePipeline)],
  ];
  return Object.fromEntries(entries.map(([name, binding]) => {
    const digest = binding?.contentDigest;
    if (typeof digest !== "string" || digest === "0".repeat(64)) {
      return [name, "legacy_unknown"];
    }
    return [
      name,
      assetContentDigest(binding?.snapshot) === digest ? "valid" : "mismatch",
    ];
  }));
}

type InternalBattleRow = {
  id: string;
  created_at: string | Date;
  updated_at: string | Date;
  state_json: unknown;
  observation_json: unknown | null;
};

export type InternalBattleObservationSummary = {
  battleId: string;
  createdAt: string;
  updatedAt: string;
  status: string | null;
  turn: number | null;
  turnLimit: number | null;
  sideAName: string | null;
  sideBName: string | null;
  winnerSide: string | null;
  finishReason: string | null;
  battlefieldName: string | null;
  observationRunId: string | null;
  observedAt: string | null;
};

export type CanonicalTurnProgression = {
  turn: number | null;
  temporalResolution: unknown | null;
  actions: unknown[];
  events: unknown[];
  consequenceReceipts: unknown[];
  sideAChange: unknown;
  sideBChange: unknown;
  worldImpact: unknown | null;
  canonicalTransition: unknown | null;
  pipelineTrace: unknown | null;
};

export type InternalObservationScope = "all" | "test";

export type InternalNarrationQueueEntry = {
  receiptId: string;
  sequence: number;
  phase: string;
  combatTurn: number | null;
  status: string;
  attemptCount: number;
  blockedBySequence: number | null;
  updatedAt: string;
  lease: { fencingToken: number; expiresAt: string; expired: boolean } | null;
  latestAttempt: {
    status: string;
    provider: string;
    model: string | null;
    route: string;
    httpAttempts: number;
    tokenCount: number | null;
    estimatedCostUsd: number | null;
    elapsedMs: number | null;
    fallbackReason: string | null;
  } | null;
};

function asObject(value: unknown): JsonObject | null {
  if (typeof value === "string") {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

const INTERNAL_PRIVATE_KEYS = new Set([
  "input",
  "narrationInput",
  "providerOutput",
  "acceptedOutput",
  "proposedAction",
  "rawOutput",
]);

function sanitizeInternalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeInternalValue);
  const object = asObject(value);
  if (!object) return value;
  return Object.fromEntries(Object.entries(object).flatMap(([key, nested]) =>
    INTERNAL_PRIVATE_KEYS.has(key)
      ? [[key, "[redacted]"]]
      : [[key, sanitizeInternalValue(nested)]]
  ));
}

function sanitizeInternalBattleState(state: JsonObject): JsonObject {
  const sanitized = sanitizeInternalValue(state) as JsonObject;
  for (const key of [
    "agentStateA",
    "agentStateB",
    "perceptionRegistryA",
    "perceptionRegistryB",
  ]) {
    if (key in sanitized) sanitized[key] = "[redacted]";
  }
  return sanitized;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nestedString(value: unknown, key: string): string | null {
  return asString(asObject(value)?.[key]);
}

function summaryFromRow(row: InternalBattleRow): InternalBattleObservationSummary {
  const state = asObject(row.state_json) ?? {};
  const observation = asObject(row.observation_json);
  return {
    battleId: row.id,
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
    status: asString(state.status),
    turn: asNumber(state.turn),
    turnLimit: asNumber(state.turnLimit),
    sideAName: nestedString(state.sideA, "displayName"),
    sideBName: nestedString(state.sideB, "displayName"),
    winnerSide: asString(state.winnerSide),
    finishReason: asString(state.finishReason),
    battlefieldName: nestedString(state.battlefield, "displayName"),
    observationRunId: asString(observation?.runId),
    observedAt: asString(observation?.observedAt),
  };
}

function boundedLimit(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(100, Math.trunc(value)));
}

export async function listInternalBattleObservations(
  limit = 30,
  scope: InternalObservationScope = "test",
): Promise<InternalBattleObservationSummary[]> {
  const realmFilter = scope === "test"
    ? `WHERE EXISTS (
         SELECT 1 FROM users owner
          WHERE owner.id = b.side_a_user_id
            AND owner.account_kind IN ('developer', 'test', 'e2e')
       )`
    : "";
  const result = await query<InternalBattleRow>(
    `SELECT b.id, b.created_at, b.updated_at, b.state_json,
       (SELECT be.payload_json
          FROM balance_events be
         WHERE be.kind = 'persistent_e2e_observation'
           AND be.battle_id = b.id
         ORDER BY be.id DESC
         LIMIT 1) AS observation_json
       FROM battles b
      ${realmFilter}
      ORDER BY b.updated_at DESC
      LIMIT $1`,
    [boundedLimit(limit)],
  );
  return result.rows.map(summaryFromRow);
}

export async function getInternalBattleObservation(
  battleId: string,
  scope: InternalObservationScope = "test",
): Promise<{
  summary: InternalBattleObservationSummary;
  observation: JsonObject | null;
  rawBattleState: JsonObject;
  canonicalTimeline: CanonicalTurnProgression[];
  canonicalCurrent: {
    assetManifest: unknown | null;
    assetManifestValidation: Record<string, AssetBindingValidation> | null;
    causalExecution: unknown | null;
    causalBucketCommit: unknown | null;
    causalEngineContinuation: unknown | null;
    causalLaterDecision: unknown | null;
    pendingEffects: unknown[];
    battleRevision: number | null;
    phaseReceipts: Array<{
      receiptId: string;
      sequence: number;
      phase: string;
      combatTurn: number | null;
      stateRevision: number;
      inputDigest: string | null;
    }>;
    psycheReaction: { a: JsonObject | null; b: JsonObject | null };
    semanticState: unknown | null;
    worldState: unknown | null;
    latestSemanticTransition: unknown | null;
    latestWorldTransition: unknown | null;
  };
  capabilities: {
    turnRecordCount: number;
    canonicalTransitionCount: number;
    pipelineTraceCount: number;
    temporalResolutionCount: number;
    hasCausalExecutionCheckpoint: boolean;
    perTurnCanonicalTransitions: "complete" | "partial" | "unavailable";
  };
  narrationQueue: InternalNarrationQueueEntry[];
  narrationRetention: {
    publicEventDays: number;
    attemptDays: number;
    prunedThroughSequence: number;
  };
} | null> {
  const realmFilter = scope === "test"
    ? `AND EXISTS (
         SELECT 1 FROM users owner
          WHERE owner.id = b.side_a_user_id
            AND owner.account_kind IN ('developer', 'test', 'e2e')
       )`
    : "";
  const result = await query<InternalBattleRow>(
    `SELECT b.id, b.created_at, b.updated_at, b.state_json,
       (SELECT be.payload_json
          FROM balance_events be
         WHERE be.kind = 'persistent_e2e_observation'
           AND be.battle_id = b.id
         ORDER BY be.id DESC
       LIMIT 1) AS observation_json
       FROM battles b
      WHERE b.id = $1
      ${realmFilter}`,
    [battleId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const persistedBattleState = asObject(row.state_json);
  if (!persistedBattleState) throw new Error("INTERNAL_BATTLE_STATE_INVALID");
  const rawBattleState = sanitizeInternalBattleState(persistedBattleState);
  const records = Array.isArray(rawBattleState.turnRecords)
    ? rawBattleState.turnRecords
    : [];
  const canonicalTimeline = records.flatMap((value) => {
    const record = asObject(value);
    if (!record) return [];
    return [{
      turn: asNumber(record.turn),
      temporalResolution: record.temporalResolution ?? null,
      actions: Array.isArray(record.actions) ? record.actions : [],
      events: Array.isArray(record.events) ? record.events : [],
      consequenceReceipts: Array.isArray(record.consequenceReceipts)
        ? record.consequenceReceipts
        : [],
      sideAChange: record.sideAChange ?? null,
      sideBChange: record.sideBChange ?? null,
      worldImpact: record.worldImpact ?? null,
      canonicalTransition: record.canonicalTransition ?? null,
      pipelineTrace: sanitizeInternalValue(record.pipelineTrace ?? null),
    }];
  });
  const canonicalTransitionCount = canonicalTimeline.filter(
    (record) => record.canonicalTransition !== null,
  ).length;
  const pipelineTraceCount = canonicalTimeline.filter(
    (record) => record.pipelineTrace !== null,
  ).length;
  const temporalResolutionCount = canonicalTimeline.filter(
    (record) => record.temporalResolution !== null,
  ).length;
  const narrationRows = await query<{
    receipt_id: string;
    sequence: number;
    phase: string;
    combat_turn: number | null;
    entry_status: string;
    attempt_count: number;
    updated_at: string | Date;
    fencing_token: number | null;
    expires_at: string | Date | null;
    attempt_status: string | null;
    provider: string | null;
    model: string | null;
    route: string | null;
    http_attempts: number | null;
    token_count: number | null;
    estimated_cost_usd: number | null;
    elapsed_ms: number | null;
    fallback_reason: string | null;
  }>(
    `SELECT entry.receipt_id, entry.sequence, entry.phase, entry.combat_turn,
            entry.status AS entry_status, entry.attempt_count, entry.updated_at,
            lease.fencing_token, lease.expires_at,
            attempt.status AS attempt_status, attempt.provider, attempt.model,
            attempt.route, attempt.http_attempts, attempt.token_count,
            attempt.estimated_cost_usd, attempt.elapsed_ms, attempt.fallback_reason
       FROM battle_narration_entries entry
       LEFT JOIN battle_narration_leases lease ON lease.battle_id = entry.battle_id
       LEFT JOIN battle_narration_attempts attempt
         ON attempt.attempt_id = entry.active_attempt_id
      WHERE entry.battle_id = $1
      ORDER BY entry.sequence`,
    [battleId],
  );
  const firstNonterminal = narrationRows.rows.find((entry) =>
    entry.entry_status === "queued" || entry.entry_status === "generating"
  )?.sequence ?? null;
  const observedAt = Date.now();
  const narrationQueue: InternalNarrationQueueEntry[] = narrationRows.rows.map((entry) => ({
    receiptId: entry.receipt_id,
    sequence: Number(entry.sequence),
    phase: entry.phase,
    combatTurn: entry.combat_turn === null ? null : Number(entry.combat_turn),
    status: entry.entry_status,
    attemptCount: Number(entry.attempt_count),
    blockedBySequence: firstNonterminal !== null && Number(entry.sequence) > Number(firstNonterminal)
      ? Number(firstNonterminal)
      : null,
    updatedAt: isoTimestamp(entry.updated_at),
    lease: entry.fencing_token === null || entry.expires_at === null ? null : {
      fencingToken: Number(entry.fencing_token),
      expiresAt: isoTimestamp(entry.expires_at),
      expired: new Date(entry.expires_at).getTime() <= observedAt,
    },
    latestAttempt: entry.attempt_status === null ? null : {
      status: entry.attempt_status,
      provider: entry.provider ?? "unavailable",
      model: entry.model,
      route: entry.route ?? "unavailable",
      httpAttempts: Number(entry.http_attempts ?? 0),
      tokenCount: entry.token_count === null ? null : Number(entry.token_count),
      estimatedCostUsd: entry.estimated_cost_usd === null
        ? null
        : Number(entry.estimated_cost_usd),
      elapsedMs: entry.elapsed_ms === null ? null : Number(entry.elapsed_ms),
      fallbackReason: entry.fallback_reason,
    },
  }));
  const retention = await query<{ pruned_through_sequence: number }>(
    `SELECT pruned_through_sequence FROM battle_narration_retention
      WHERE battle_id = $1`,
    [battleId],
  );
  return {
    summary: summaryFromRow(row),
    observation: asObject(row.observation_json),
    rawBattleState,
    canonicalTimeline,
    canonicalCurrent: {
      assetManifest: rawBattleState.assetManifest ?? null,
      assetManifestValidation: validateAssetManifest(rawBattleState.assetManifest),
      causalExecution: rawBattleState.causalExecution ?? null,
      causalBucketCommit: rawBattleState.causalBucketCommit ?? null,
      causalEngineContinuation: rawBattleState.causalEngineContinuation ?? null,
      causalLaterDecision: rawBattleState.causalLaterDecision ?? null,
      pendingEffects: Array.isArray(rawBattleState.pendingEffects)
        ? rawBattleState.pendingEffects
        : [],
      battleRevision: asNumber(rawBattleState.battleRevision),
      phaseReceipts: Array.isArray(rawBattleState.phaseReceipts)
        ? rawBattleState.phaseReceipts.flatMap((value) => {
            const receipt = asObject(value);
            const receiptId = asString(receipt?.id);
            const sequence = asNumber(receipt?.sequence);
            const phase = asString(receipt?.phase);
            const stateRevision = asNumber(receipt?.toRevision);
            if (!receiptId || sequence === null || !phase || stateRevision === null) return [];
            return [{
              receiptId,
              sequence,
              phase,
              combatTurn: asNumber(receipt?.combatTurn),
              stateRevision,
              inputDigest: asString(receipt?.narrationInputDigest),
            }];
          })
        : [],
      psycheReaction: {
        a: psycheReactionSummary(persistedBattleState.agentStateA),
        b: psycheReactionSummary(persistedBattleState.agentStateB),
      },
      semanticState: rawBattleState.semanticState ?? null,
      worldState: rawBattleState.worldState ?? null,
      latestSemanticTransition: rawBattleState.latestSemanticTransition ?? null,
      latestWorldTransition: rawBattleState.latestWorldTransition ?? null,
    },
    capabilities: {
      turnRecordCount: canonicalTimeline.length,
      canonicalTransitionCount,
      pipelineTraceCount,
      temporalResolutionCount,
      hasCausalExecutionCheckpoint: rawBattleState.causalExecution != null,
      perTurnCanonicalTransitions: canonicalTransitionCount === 0
        ? "unavailable"
        : canonicalTransitionCount === canonicalTimeline.length
          ? "complete"
          : "partial",
    },
    narrationQueue,
    narrationRetention: {
      publicEventDays: NARRATION_PUBLIC_EVENT_RETENTION_DAYS,
      attemptDays: NARRATION_ATTEMPT_RETENTION_DAYS,
      prunedThroughSequence: Number(retention.rows[0]?.pruned_through_sequence ?? 0),
    },
  };
}
