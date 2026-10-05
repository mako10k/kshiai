// R: Persist nullable provider usage observations and read immutable physical attempt identities.
import { z } from "zod";
import { query } from "../db.js";
import type { LlmUsageScope } from "../llm/llm-usage-context.js";
const token = z.number().int().nonnegative().nullable();
export const LlmResponseDiagnosticsSchema = z.object({
  finishReason: z.string().max(120).nullable(),
  contentLength: z.number().int().nonnegative().nullable(),
  contentEmpty: z.boolean().nullable(),
}).strict();
export type LlmResponseDiagnostics = z.infer<typeof LlmResponseDiagnosticsSchema>;
export const LlmUsageAttemptSchema = z.object({
  id: z.string().min(1), callId: z.string().min(1), attemptOrdinal: z.number().int().positive(),
  provider: z.string().min(1), requestedModel: z.string().min(1), responseModel: z.string().nullable(), requestId: z.string().nullable(),
  battleId: z.string().nullable(), role: z.string().nullable(), side: z.enum(["a", "b"]).nullable(), tick: z.number().int().nonnegative().nullable(), receiptIds: z.array(z.string()),
  startedAt: z.number().finite().nonnegative(), finishedAt: z.number().finite().nonnegative().nullable(), elapsedMs: z.number().finite().nonnegative().nullable(),
  status: z.enum(["started", "completed", "failed", "timeout"]), errorClass: z.string().nullable(),
  promptTokens: token, completionTokens: token, totalTokens: token, cachedTokens: token, reasoningTokens: token,
  rawUsage: z.record(z.unknown()).nullable(),
  responseDiagnostics: LlmResponseDiagnosticsSchema.nullable().optional(),
}).strict();
export type LlmUsageAttempt = z.infer<typeof LlmUsageAttemptSchema>;
export type FinishLlmUsageAttemptInput = { id: string; status: "completed" | "failed" | "timeout"; finishedAt: number; elapsedMs?: number; responseModel?: string | null; requestId?: string | null; usage?: unknown; errorClass?: string | null; responseDiagnostics?: LlmResponseDiagnostics | null };
function count(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
export function observedLlmUsage(raw: unknown): Pick<LlmUsageAttempt, "promptTokens" | "completionTokens" | "totalTokens" | "cachedTokens" | "reasoningTokens" | "rawUsage"> {
  const object = z.record(z.unknown()).safeParse(raw);
  const value = object.success ? object.data : null;
  const promptDetails = z.record(z.unknown()).safeParse(value?.prompt_tokens_details);
  const completionDetails = z.record(z.unknown()).safeParse(value?.completion_tokens_details);
  return { promptTokens: count(value?.prompt_tokens), completionTokens: count(value?.completion_tokens), totalTokens: count(value?.total_tokens),
    cachedTokens: count(promptDetails.success ? promptDetails.data.cached_tokens : null), reasoningTokens: count(completionDetails.success ? completionDetails.data.reasoning_tokens : null),
    rawUsage: value ? JSON.parse(JSON.stringify(value)) : null };
}
export async function startLlmUsageAttempt(input: { callId: string; attemptOrdinal: number; provider: string; requestedModel: string; startedAt: number; scope?: Readonly<LlmUsageScope> }): Promise<string> {
  const id = `${input.callId}:${input.attemptOrdinal}`;
  const scope = input.scope;
  const snapshot = LlmUsageAttemptSchema.parse({ ...observedLlmUsage(null), id, callId: input.callId, attemptOrdinal: input.attemptOrdinal,
    provider: input.provider, requestedModel: input.requestedModel, responseModel: null, requestId: null,
    battleId: scope?.battleId ?? null, role: scope?.role ?? null, side: scope?.side ?? null, tick: scope?.tick ?? null, receiptIds: scope?.receiptIds ?? [],
    startedAt: input.startedAt, finishedAt: null, elapsedMs: null, status: "started", errorClass: null, responseDiagnostics: null });
  await query(`INSERT INTO llm_usage_attempts(id,call_id,attempt_ordinal,battle_id,provider,requested_model,started_at,snapshot_json)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id,input.callId,input.attemptOrdinal,snapshot.battleId,input.provider,input.requestedModel,new Date(input.startedAt).toISOString(),JSON.stringify(snapshot)]);
  return id;
}
function validateFinishInput(input: FinishLlmUsageAttemptInput, before: LlmUsageAttempt): void {
  if (input.elapsedMs !== undefined && (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0)) throw new Error("LLM_USAGE_DURATION_INVALID");
  if (input.elapsedMs === undefined && input.finishedAt < before.startedAt) throw new Error("LLM_USAGE_TIME_INVALID");
}

function finishedSnapshot(input: FinishLlmUsageAttemptInput, before: LlmUsageAttempt): LlmUsageAttempt {
  validateFinishInput(input, before);
  return LlmUsageAttemptSchema.parse({ ...before, ...observedLlmUsage(input.usage), status: input.status,
    finishedAt: input.finishedAt, elapsedMs: input.elapsedMs ?? input.finishedAt - before.startedAt, responseModel: input.responseModel ?? null,
    requestId: input.requestId ?? null, errorClass: input.errorClass ?? null, responseDiagnostics: input.responseDiagnostics ?? null });
}

export async function finishLlmUsageAttempt(input: FinishLlmUsageAttemptInput): Promise<void> {
  const found = await query<{ snapshot_json: string }>("SELECT snapshot_json FROM llm_usage_attempts WHERE id=$1", [input.id]);
  const row = found.rows[0];
  if (!row) throw new Error("LLM_USAGE_ATTEMPT_MISSING");
  const before = LlmUsageAttemptSchema.parse(JSON.parse(row.snapshot_json));
  const snapshot = finishedSnapshot(input, before);
  const saved = await query("UPDATE llm_usage_attempts SET finished_at=$2,snapshot_json=$3 WHERE id=$1 AND finished_at IS NULL", [input.id,new Date(input.finishedAt).toISOString(),JSON.stringify(snapshot)]);
  if (saved.rowCount !== 1) throw new Error("LLM_USAGE_ATTEMPT_ALREADY_FINISHED");
}
export async function listLlmUsageAttempts(filter: { battleId?: string; callId?: string } = {}): Promise<LlmUsageAttempt[]> {
  const predicates: string[] = [];
  const parameters: string[] = [];
  if (filter.battleId !== undefined) { parameters.push(filter.battleId); predicates.push(`battle_id=$${parameters.length}`); }
  if (filter.callId !== undefined) { parameters.push(filter.callId); predicates.push(`call_id=$${parameters.length}`); }
  const rows = await query<{ snapshot_json: string }>(`SELECT snapshot_json FROM llm_usage_attempts${predicates.length ? ` WHERE ${predicates.join(" AND ")}` : ""} ORDER BY started_at,id`, parameters);
  return rows.rows.map((row) => LlmUsageAttemptSchema.parse(JSON.parse(row.snapshot_json)));
}
