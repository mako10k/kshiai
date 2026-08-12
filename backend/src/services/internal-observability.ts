import { query } from "../db.js";
import { assetContentDigest } from "../repositories/asset-generations.js";

type JsonObject = Record<string, unknown>;
type AssetBindingValidation = "valid" | "mismatch" | "legacy_unknown";

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
  sideAChange: unknown;
  sideBChange: unknown;
  worldImpact: unknown | null;
  canonicalTransition: unknown | null;
  pipelineTrace: unknown | null;
};

export type InternalObservationScope = "all" | "test";

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
  const rawBattleState = asObject(row.state_json);
  if (!rawBattleState) throw new Error("INTERNAL_BATTLE_STATE_INVALID");
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
      sideAChange: record.sideAChange ?? null,
      sideBChange: record.sideBChange ?? null,
      worldImpact: record.worldImpact ?? null,
      canonicalTransition: record.canonicalTransition ?? null,
      pipelineTrace: record.pipelineTrace ?? null,
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
  };
}
