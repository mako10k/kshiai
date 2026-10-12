// R: Prepare three/four logical turn requests with durable identities and no unknown-send replay.
import { ReservedTurnRuntimeSchema, ReservedTurnNarrationSchema,
  isClosedRecoverableReservedRequest, validateReservedPlan, orderReservedActions, applyReservedTurnTrace, applyConsciousnessMemorySnapshot, failedReservedAdjudicationTrace,
  type ReservedTurnPromptRevision, type ReservedTurnRuntime, type ReservedTurnRequest, type ReservedTurnWorld, type ReservedTurnPlan } from "@kshiai/shared";
import { z, ZodError } from "zod";
import { ProviderJsonSyntaxError } from "../llm/provider-json.js";
import type { AwarenessJsonTransport } from "../llm/awareness-provider-contract.js";
import { reservedPlanSystemFor, reservedAdjudicationSystem, reservedAdjudicationUser, reservedNarrationSystem } from "../llm/reserved-turns.js";
import { withLlmUsageScope } from "../llm/llm-usage-context.js";
import { withLlmPhysicalCompletion, LlmPhysicalCompletionError } from "../llm/llm-physical-completion.js";
import { isLlmRateLimitResponse, providerRetryAfterMs } from "../llm/provider-errors.js";
import { requestDigest } from "./distributed-guard.js";
export type ReservedExecutionPort = {
  read(): Promise<ReservedTurnRuntime>;
  update(reduce: (runtime: ReservedTurnRuntime) => ReservedTurnRuntime): Promise<void>;
  account(reduce: (runtime: ReservedTurnRuntime) => ReservedTurnRuntime): Promise<void>;
};
export type ReservedPlannerFrame = { context: object; references: readonly { id: string; text: string }[] };
type Output = NonNullable<ReservedTurnRequest["output"]>;
class ReservedAdjudicationInvalidError extends Error {
  constructor(readonly diagnostic: string) { super("RESERVED_ADJUDICATION_INVALID"); }
}
class ReservedPlanInvalidError extends ReservedAdjudicationInvalidError {}
function invalidPlan(error: unknown): ReservedPlanInvalidError {
  if (error instanceof ZodError) return new ReservedPlanInvalidError(error.issues.map((issue) => `${issue.code}:${issue.path.join(".")}`).join("; "));
  if (error instanceof Error && /^(RESERVED_UNKNOWN_REFERENCE|CONSCIOUSNESS_MEMORY_RANK_(UNKNOWN|DUPLICATE))$/.test(error.message)) return new ReservedPlanInvalidError(error.message);
  throw error;
}
function recoverableRole(policy: ReservedTurnRuntime["policy"], role: ReservedTurnRequest["role"]): boolean {
  if (role === "character") return policy.revision === "reserved-turn-policy-v6";
  return role === "adjudication" && "maxAdjudicationCorrections" in policy;
}
function timedRole(policy: ReservedTurnRuntime["policy"], role: ReservedTurnRequest["role"]): boolean {
  return policy.revision === "reserved-turn-policy-v6" || (policy.revision === "reserved-turn-policy-v5" && role === "adjudication");
}
function invalidOutput(diagnostic: string, role: ReservedTurnRequest["role"]): ReservedAdjudicationInvalidError {
  return role === "character" ? new ReservedPlanInvalidError(diagnostic) : new ReservedAdjudicationInvalidError(diagnostic);
}
function requestFailure(error: unknown, limited: boolean): string {
  if (limited) return "RATE_LIMIT";
  if (error instanceof ReservedPlanInvalidError) return "PLAN_INVALID";
  return error instanceof ReservedAdjudicationInvalidError ? "ADJUDICATION_INVALID" : "REQUEST_FAILED";
}
const rejectedPlanFeedback = "計画の形式または記憶が不正なため、このターンの予約を受理できませんでした。前回の確定記憶を保持しました（RESERVED_PLAN_INVALID）。";
function invalidAdjudication(error: unknown): ReservedAdjudicationInvalidError {
  if (error instanceof ZodError) return new ReservedAdjudicationInvalidError(error.issues.map((issue) => `${issue.code}:${issue.path.join(".")}`).join("; "));
  if (error instanceof Error && /^RESERVED_TRACE_[A-Z_]+$/.test(error.message)) return new ReservedAdjudicationInvalidError(error.message);
  throw error;
}
function replayInvalidAdjudication(raw: string | null, validate: (raw: unknown) => Output, role: ReservedTurnRequest["role"] = "adjudication"): never {
  let parsed: unknown;
  try { parsed = JSON.parse(raw ?? ""); } catch { throw invalidOutput("INVALID_JSON", role); }
  validate(parsed);
  throw invalidOutput("INVALID_RESPONSE", role);
}
function closedInvalidAdjudication(request: ReservedTurnRequest): boolean {
  return request.role === "adjudication" && request.status === "failed" && request.failure === "ADJUDICATION_INVALID" && !request.physicalOutstanding && request.rawResponse !== null;
}
export async function executeReservedTurn(input: {
  battleId: string; start: ReservedTurnWorld; frames: { a: ReservedPlannerFrame; b: ReservedPlannerFrame }; assets: object;
  publicScene: string; narrationStyle?: string; port: ReservedExecutionPort;
  character: AwarenessJsonTransport; adjudication: AwarenessJsonTransport; narration: AwarenessJsonTransport;
  promptRevision?: ReservedTurnPromptRevision; now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const initial = ReservedTurnRuntimeSchema.parse(await input.port.read());
  const policy = initial.policy; const turn = initial.turn + 1;
  const promptRevision = input.promptRevision ?? (initial.policy.revision === "reserved-turn-policy-v6" ? "reserved-turn-prompt-v6" : initial.policy.revision === "reserved-turn-policy-v5" ? "reserved-turn-prompt-v5" : initial.policy.revision === "reserved-turn-policy-v4" ? "reserved-turn-prompt-v4" : "reserved-turn-prompt-v3");
  if (initial.status !== "active" || input.start.turn !== turn || turn > policy.maxTurns || now() >= initial.deadlineAt) throw new Error("RESERVED_TURN_BOUNDARY_INVALID");
  if (input.character.identity.provider !== policy.character.provider || input.character.identity.fastModel !== policy.character.model ||
      input.adjudication.identity.provider !== policy.adjudication.provider || input.adjudication.identity.engineModel !== policy.adjudication.model ||
      input.narration.identity.provider !== policy.narration.provider || input.narration.identity.fastModel !== policy.narration.model) throw new Error("RESERVED_MODEL_BINDING_MISMATCH");
  async function request(role: ReservedTurnRequest["role"], side: "a" | "b" | null, system: string, user: string, validate: (raw: unknown) => Output, correction?: { index: number; startedAt: number }): Promise<Output> {
    const logicalId = `${input.battleId}:turn:${turn}:${role}:${side ?? "both"}${correction?.index ? `:correction:${correction.index}` : ""}`;
    const digest = requestDigest({ system, user, role, policy });
    if (system.length + user.length > policy.inputCharacters) throw new Error("RESERVED_INPUT_LIMIT");
    const roleDeadlineMs = role === "adjudication" && policy.revision !== "reserved-turn-policy-v1" ? policy.adjudicationDeadlineMs : policy.deadlineMs;
    const persistedStart = policy.revision === "reserved-turn-policy-v6" ? initial.requests.find((r) => r.turn === turn && r.role === role && r.side === side)?.logicalStartedAt : undefined;
    const logicalStartedAt = persistedStart ?? correction?.startedAt ?? now();
    const logicalDeadlineAt = Math.min(initial.deadlineAt, logicalStartedAt + roleDeadlineMs);
    const softDeadlineMs = "softDurationMs" in policy ? role === "adjudication" ? policy.softAdjudicationDeadlineMs : policy.softDeadlineMs : null;
    if ("softDurationMs" in policy && now() >= initial.startedAt + policy.softDurationMs) {
      console.warn("[reserved-turns] soft-limit", { battleId: input.battleId, turn, scope: "battle", elapsedMs: now() - initial.startedAt, softLimitMs: policy.softDurationMs, hardLimitMs: policy.durationMs });
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = `${logicalId}:${attempt}`;
      const before = await input.port.read(); const existing = before.requests.find((r) => r.id === id);
      if (existing) {
        if (existing.inputDigest !== digest) throw new Error("RESERVED_INPUT_CONFLICT");
        if (existing.status === "prepared" && existing.output && !existing.physicalOutstanding) return existing.output;
        if (existing.status === "failed" && existing.failure === "RATE_LIMIT" && !existing.physicalOutstanding) continue;
        if (isClosedRecoverableReservedRequest(existing, policy)) replayInvalidAdjudication(existing.rawResponse, validate, role);
        throw new Error("RESERVED_SEND_NOT_REPLAYABLE");
      }
      const deadlineAt = "softDurationMs" in policy ? logicalDeadlineAt : Math.min(initial.deadlineAt, now() + roleDeadlineMs);
      await input.port.update((runtime) => {
        if (runtime.turn !== initial.turn || runtime.status !== "active" || now() >= deadlineAt || runtime.requests.some((r) => r.id === id)) throw new Error("RESERVED_RESERVATION_CONFLICT");
        if (runtime.requests.length + runtime.budget.physicalAttempts >= policy.maxPhysicalAttempts) throw new Error("RESERVED_ATTEMPT_LIMIT");
        return { ...runtime, requests: [...runtime.requests, { id, turn, role, side, inputDigest: digest, system, user,
          ...(timedRole(policy, role) ? { logicalStartedAt } : {}), status: "reserved", output: null, rawResponse: null, physicalOutstanding: true, failure: null }] };
      });
      const transport = role === "character" ? input.character : role === "adjudication" ? input.adjudication : input.narration;
      let closed = false;
      const send = withLlmPhysicalCompletion(() => withLlmUsageScope({ battleId: input.battleId, role: role === "character" ? "consciousness" : role, ...(side ? { side } : {}), receiptIds: [id] },
        () => transport.requestJson(system, user, { tier: role === "adjudication" ? "engine" : "fast", timeoutMs: Math.max(1, deadlineAt - now()),
          maxCompletionTokens: role === "adjudication" ? policy.adjudicationOutputTokens : policy.characterOutputTokens,
          label: `reserved-turns-v1:${role}`, responseFormat: { type: "json_object" } })));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const softTimer = softDeadlineMs === null ? undefined : setTimeout(() => {
        console.warn("[reserved-turns] soft-limit", { battleId: input.battleId, turn, scope: role, side, elapsedMs: now() - logicalStartedAt, softLimitMs: softDeadlineMs, hardLimitMs: roleDeadlineMs });
      }, Math.max(1, logicalStartedAt + softDeadlineMs - now()));
      const battleSoftTimer = !("softDurationMs" in policy) || now() >= initial.startedAt + policy.softDurationMs ? undefined : setTimeout(() => {
        console.warn("[reserved-turns] soft-limit", { battleId: input.battleId, turn, scope: "battle", elapsedMs: now() - initial.startedAt, softLimitMs: policy.softDurationMs, hardLimitMs: policy.durationMs });
      }, Math.max(1, initial.startedAt + policy.softDurationMs - now()));
      const processed = send.then(async (raw) => {
        closed = true;
        await input.port.account((runtime) => ({ ...runtime, requests: runtime.requests.map((r) => r.id === id ? { ...r, physicalOutstanding: false, rawResponse: JSON.stringify(raw) ?? "null" } : r) }));
        const output = validate(raw);
        await input.port.update((runtime) => {
          if (runtime.turn !== initial.turn || runtime.status !== "active" || now() >= deadlineAt) throw new Error("RESERVED_LATE_RESPONSE");
          return { ...runtime, requests: runtime.requests.map((r) => r.id === id ? { ...r, status: "prepared", output } : r) };
        });
        return output;
      }, async (error: unknown) => {
        // A received late rejection closes accounting only; unknown network termination stays outstanding.
        if (isLlmRateLimitResponse(error) || error instanceof LlmPhysicalCompletionError) {
          closed = true;
          await input.port.account((runtime) => ({ ...runtime, requests: runtime.requests.map((r) => r.id === id ? { ...r, physicalOutstanding: false } : r) }));
        }
        if (recoverableRole(policy, role) && error instanceof LlmPhysicalCompletionError && error.cause instanceof ProviderJsonSyntaxError) {
          const rawResponse = error.cause.rejectedText;
          await input.port.account((runtime) => ({ ...runtime, requests: runtime.requests.map((r) => r.id === id ? { ...r, rawResponse } : r) }));
          throw invalidOutput("INVALID_JSON", role);
        }
        throw error;
      });
      void processed.catch(() => undefined);
      try {
        return await Promise.race([processed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("RESERVED_DEADLINE")), Math.max(1, deadlineAt - now())); })]);
      } catch (error) {
        const limited = isLlmRateLimitResponse(error);
        await input.port.account((runtime) => ({ ...runtime, requests: runtime.requests.map((r) => r.id === id ? { ...r, status: "failed", physicalOutstanding: !(closed || limited || error instanceof LlmPhysicalCompletionError), failure: requestFailure(error, limited) } : r) }));
        if (!limited || attempt === 2) throw error;
        const delay = providerRetryAfterMs(error) ?? 250 * 2 ** attempt;
        if (now() + delay >= initial.deadlineAt) throw new Error("RESERVED_RETRY_DEADLINE");
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      } finally { if (timer) clearTimeout(timer); if (softTimer) clearTimeout(softTimer); if (battleSoftTimer) clearTimeout(battleSoftTimer); }
    }
    throw new Error("RESERVED_RATE_LIMIT_EXHAUSTED");
  }
  async function preparePlanFailure(side: "a" | "b", startedAt: number): Promise<Output> {
    const output = { role: "character" as const, plan: { actions: [], memory: initial.memories[side].map((_entry, index) => String(index + 1)) } };
    await input.port.update((runtime) => {
      if (runtime.turn !== initial.turn || runtime.status !== "active" || now() >= Math.min(initial.deadlineAt, startedAt + policy.deadlineMs)) throw new Error("RESERVED_LATE_RESPONSE");
      const target = [...runtime.requests].reverse().find((r) => r.turn === turn && r.role === "character" && r.side === side && isClosedRecoverableReservedRequest(r, policy) && r.id.includes(":correction:1:"));
      if (!target) throw new Error("RESERVED_CORRECTION_RECEIPT_REQUIRED");
      return { ...runtime, requests: runtime.requests.map((r) => r.id === target.id ? { ...r, status: "prepared", output, failure: "PLAN_FALLBACK" } : r) };
    });
    return output;
  }
  async function plan(side: "a" | "b"): Promise<ReservedTurnPlan> {
    const frame = input.frames[side];
    const user = JSON.stringify({ turn, side, ...frame, memory: initial.memories[side].map((entry, index) => ({ priority: String(index + 1), text: entry.text })), feedback: initial.feedback[side] });
    const startedAt = initial.requests.find((r) => r.turn === turn && r.role === "character" && r.side === side)?.logicalStartedAt ?? now();
    const validate = (raw: unknown): Output => {
      try { return { role: "character", plan: validateReservedPlan(raw, initial.memories[side], new Set(frame.references.map((r) => r.id)), `${input.battleId}:turn:${turn}:${side}`) }; }
      catch (error) { if (policy.revision === "reserved-turn-policy-v6") throw invalidPlan(error); throw error; }
    };
    let output: Output;
    try { output = await request("character", side, reservedPlanSystemFor(promptRevision), user, validate, { index: 0, startedAt }); }
    catch (error) {
      if (!(error instanceof ReservedPlanInvalidError) || policy.revision !== "reserved-turn-policy-v6") throw error;
      const correctionUser = JSON.stringify({ ...z.record(z.unknown()).parse(JSON.parse(user)), validationErrors: [error.diagnostic], retryInstruction: "必須memoryとactionsを含む完全なJSONを返し、上記エラーを修正する。記憶の保持は実在順位参照、全消去は明示[]。世界・記憶はまだ更新されていない。" });
      try { output = await request("character", side, reservedPlanSystemFor(promptRevision), correctionUser, validate, { index: policy.maxCharacterCorrections, startedAt }); }
      catch (correctedError) { if (!(correctedError instanceof ReservedPlanInvalidError)) throw correctedError; output = await preparePlanFailure(side, startedAt); }
    }
    if (output.role !== "character") throw new Error("RESERVED_PLAN_ROLE");
    return output.plan;
  }
  const outcomes = await Promise.allSettled([plan("a"), plan("b")]);
  const [a, b] = outcomes;
  if (a.status !== "fulfilled") throw a.reason;
  if (b.status !== "fulfilled") throw b.reason;
  const plans = { a: a.value, b: b.value };
  const preparedPlans = await input.port.read();
  const planFeedback = (side: "a" | "b") => preparedPlans.requests.some((r) => r.turn === turn && r.side === side && r.failure === "PLAN_FALLBACK") ? [rejectedPlanFeedback] : [];
  const order = orderReservedActions(turn, { a: input.start.actors.a.initiative, b: input.start.actors.b.initiative }, plans);
  const outputRevision = "maxAdjudicationCorrections" in policy ? "reserved-turn-output-v3" : policy.revision === "reserved-turn-policy-v4" ? "reserved-turn-output-v2" : "reserved-turn-output-v1";
  const judgeUser = reservedAdjudicationUser(input.start, order, { ...input.assets, observedReferences: { a: input.frames.a.references, b: input.frames.b.references } }, promptRevision);
  const judgeStartedAt = initial.requests.find((r) => r.turn === turn && r.role === "adjudication")?.logicalStartedAt ?? now();
  const validateJudge = (raw: unknown): Output => {
    try { return { role: "adjudication", trace: applyReservedTurnTrace(input.start, order, raw, outputRevision).trace }; }
    catch (error) { if ("maxAdjudicationCorrections" in policy) throw invalidAdjudication(error); throw error; }
  };
  async function judge(): Promise<Output> {
    try { return await request("adjudication", null, reservedAdjudicationSystem(promptRevision), judgeUser, validateJudge, { index: 0, startedAt: judgeStartedAt }); }
    catch (error) {
      if (!(error instanceof ReservedAdjudicationInvalidError) || !("maxAdjudicationCorrections" in policy)) throw error;
      const correctionUser = JSON.stringify({ ...z.record(z.unknown()).parse(JSON.parse(judgeUser)), validationErrors: [error.diagnostic], retryInstruction: "上記エラーを修正し、同じstate/orderに対する完全なJSON resultsを返す。正準世界はまだ更新されていない。" });
      try { return await request("adjudication", null, reservedAdjudicationSystem(promptRevision), correctionUser, validateJudge, { index: policy.maxAdjudicationCorrections, startedAt: judgeStartedAt }); }
      catch (correctedError) {
        if (!(correctedError instanceof ReservedAdjudicationInvalidError)) throw correctedError;
        const output = { role: "adjudication" as const, trace: failedReservedAdjudicationTrace(input.start, order) };
        await input.port.update((runtime) => {
          if (runtime.turn !== initial.turn || runtime.status !== "active" || now() >= Math.min(initial.deadlineAt, judgeStartedAt + policy.adjudicationDeadlineMs)) throw new Error("RESERVED_LATE_RESPONSE");
          const target = [...runtime.requests].reverse().find((r) => r.turn === turn && closedInvalidAdjudication(r) && r.id.includes(":correction:1:"));
          if (!target) throw new Error("RESERVED_CORRECTION_RECEIPT_REQUIRED");
          return { ...runtime, requests: runtime.requests.map((r) => r.id === target.id ? { ...r, status: "prepared", output, failure: "ADJUDICATION_FALLBACK" } : r) };
        });
        return output;
      }
    }
  }
  const judged = await judge();
  if (judged.role !== "adjudication") throw new Error("RESERVED_TRACE_ROLE");
  const resolved = applyReservedTurnTrace(input.start, order, judged.trace, outputRevision);
  const narrated = await request("narration", null, reservedNarrationSystem, JSON.stringify({ turn, scene: input.publicScene, style: input.narrationStyle, consequences: judged.trace.results.flatMap((r) => r.observations.public) }), (raw) => ({ role: "narration", narration: ReservedTurnNarrationSchema.parse(raw) }));
  if (narrated.role !== "narration") throw new Error("RESERVED_NARRATION_ROLE");
  const memories = { a: applyConsciousnessMemorySnapshot(initial.memories.a, plans.a.memory, `${input.battleId}:turn:${turn}:a`), b: applyConsciousnessMemorySnapshot(initial.memories.b, plans.b.memory, `${input.battleId}:turn:${turn}:b`) };
  return { turn, plans, state: resolved.state, trace: judged.trace, narration: narrated.narration, memories,
    feedback: { a: [...planFeedback("a"), ...judged.trace.results.flatMap((r) => r.observations.a)], b: [...planFeedback("b"), ...judged.trace.results.flatMap((r) => r.observations.b)] } };
}
