// R: Prepare one synchronous A/B decision barrier with durable no-resend identities.
import { UnifiedConsciousnessInputSchema, UnifiedConsciousnessRuntimeSchema, shouldRunUnifiedConsciousness, validateUnifiedDecision, unifiedActionFailure,
  type UnifiedConsciousnessInput, type UnifiedConsciousnessRuntime, type UnifiedConsciousnessDecision } from "@kshiai/shared";
import { prepareUnifiedConsciousnessRequest } from "../llm/unified-consciousness.js";
import type { AwarenessJsonTransport } from "../llm/awareness-provider-contract.js";
import { withLlmUsageScope } from "../llm/llm-usage-context.js";
import { withLlmPhysicalCompletion, LlmPhysicalCompletionError } from "../llm/llm-physical-completion.js";
import { requestDigest } from "./distributed-guard.js";
export type UnifiedExecutionPort = {
  read(): Promise<UnifiedConsciousnessRuntime>;
  update(reduce: (runtime: UnifiedConsciousnessRuntime) => UnifiedConsciousnessRuntime): Promise<void>;
  account(reduce: (runtime: UnifiedConsciousnessRuntime) => UnifiedConsciousnessRuntime): Promise<void>;
};
export type UnifiedPreparedBoundary = {
  tick: number;
  selected: { a: { body: { action: NonNullable<UnifiedConsciousnessDecision["action"]> } | null; voice: { speech: string } | null };
    b: { body: { action: NonNullable<UnifiedConsciousnessDecision["action"]> } | null; voice: { speech: string } | null } };
};
function selected(output?: UnifiedConsciousnessDecision | null, actionFailure?: string): UnifiedPreparedBoundary["selected"]["a"] {
  return { body: output?.action && !actionFailure ? { action: output.action } : null, voice: output?.speech ? { speech: output.speech } : null };
}
export async function prepareUnifiedBoundary(input: {
  battleId: string; tick: number; worldRevision: number; port: UnifiedExecutionPort;
  frames: { a: UnifiedConsciousnessInput; b: UnifiedConsciousnessInput };
  transport: AwarenessJsonTransport; now?: () => number;
}): Promise<UnifiedPreparedBoundary> {
  const now = input.now ?? Date.now;
  const initial = await input.port.read();
  if (initial.status !== "active" || now() >= initial.deadlineAt || input.tick > initial.policy.maxTicks ||
    (initial.tick !== null && input.tick <= initial.tick)) throw new Error("CONSCIOUSNESS_BOUNDARY_INVALID");
  if (input.transport.identity.provider !== initial.policy.model.provider || input.transport.identity.fastModel !== initial.policy.model.model) throw new Error("CONSCIOUSNESS_MODEL_BINDING_MISMATCH");
  async function prepareSide(side: "a" | "b"): Promise<UnifiedConsciousnessDecision | null> {
    const before = await input.port.read();
    const id = `${input.battleId}:consciousness:${side}:${input.tick}`;
    const existing = before.decisions.find((item) => item.id === id);
    if (existing) {
      if (existing.worldRevision !== input.worldRevision || existing.memoryRevision !== before.sides[side].memoryRevision) throw new Error("CONSCIOUSNESS_PREPARED_INPUT_CONFLICT");
      if (existing.status === "prepared" && existing.output && !existing.physicalOutstanding && now() < existing.deadlineAt) return existing.output;
      throw new Error("CONSCIOUSNESS_SEND_NOT_REPLAYABLE");
    }
    if (!shouldRunUnifiedConsciousness(before.sides[side], input.tick, before.policy)) return null;
    const frame = UnifiedConsciousnessInputSchema.parse({ ...input.frames[side], side, tick: input.tick, memory: before.sides[side].memory,
      events: before.sides[side].pendingEvents });
    const request = prepareUnifiedConsciousnessRequest(frame, before.policy);
    const deadlineAt = Math.min(now() + before.policy.deadlineMs, before.deadlineAt);
    const digest = requestDigest({ provider: before.policy.model.provider, model: before.policy.model.model, ...request });
    await input.port.update((runtime) => {
      if (runtime.status !== "active" || now() >= deadlineAt || runtime.decisions.some((item) => item.id === id) ||
        runtime.sides[side].memoryRevision !== before.sides[side].memoryRevision) throw new Error("CONSCIOUSNESS_RESERVATION_CONFLICT");
      if (runtime.decisions.length >= runtime.policy.maxCalls || runtime.sides[side].calls >= runtime.policy.maxCallsPerSide ||
        runtime.decisions.length + runtime.budget.physicalAttempts >= runtime.policy.maxPhysicalAttempts ||
        runtime.decisions.filter((item) => item.physicalOutstanding).length + runtime.budget.physicalOutstanding >= runtime.policy.maxPhysicalConcurrent ||
        runtime.decisions.some((item) => item.side === side && item.physicalOutstanding)) throw new Error("CONSCIOUSNESS_BUDGET_EXCEEDED");
      return UnifiedConsciousnessRuntimeSchema.parse({ ...runtime, sides: { ...runtime.sides, [side]: { ...runtime.sides[side], calls: runtime.sides[side].calls + 1 } },
        decisions: [...runtime.decisions, { id, side, tick: input.tick, worldRevision: input.worldRevision, memoryRevision: before.sides[side].memoryRevision,
          inputDigest: digest, input: frame, status: "reserved", output: null, physicalOutstanding: true, failure: null, deadlineAt }] });
    });
    const updateReceipt = (physicalClosed: boolean, failure: string) => input.port.account((runtime) => ({
      ...runtime, decisions: runtime.decisions.map((item) => item.id !== id ? item : {
        ...item, physicalOutstanding: item.physicalOutstanding && !physicalClosed,
        failure, status: "failed" as const,
      }),
    }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const requestPromise = withLlmPhysicalCompletion(() => withLlmUsageScope({ battleId: input.battleId, role: "consciousness", side, tick: input.tick, receiptIds: [id] },
      () => input.transport.requestJson(request.system, request.user, { ...request.options, timeoutMs: Math.max(1, deadlineAt - now()) })));
    const processed = requestPromise.then(async (raw) => {
      let output: UnifiedConsciousnessDecision;
      try { output = validateUnifiedDecision(frame, raw, id, before.policy.revision === "unified-consciousness-policy-v2"); }
      catch (error) { await updateReceipt(true, "CONSCIOUSNESS_OUTPUT_INVALID"); throw error; }
      const actionFailure = before.policy.revision === "unified-consciousness-policy-v2" ? unifiedActionFailure(frame, output.action) : null;
      // Persist first, then require the current world lease before making it usable.
      await input.port.account((runtime) => ({ ...runtime, decisions: runtime.decisions.map((item) => item.id === id ? { ...item, physicalOutstanding: false } : item) }));
      await input.port.update((runtime) => {
        if (runtime.status !== "active" || now() >= deadlineAt || runtime.decisions.find((item) => item.id === id)?.status !== "reserved") throw new Error("CONSCIOUSNESS_LATE_RESPONSE");
        return { ...runtime, decisions: runtime.decisions.map((item) => item.id === id ? { ...item, status: "prepared", output, ...(actionFailure ? { actionFailure } : {}) } : item) };
      });
      return output;
    }, async (error: unknown) => {
      await updateReceipt(error instanceof LlmPhysicalCompletionError, "CONSCIOUSNESS_PROVIDER_FAILED");
      throw error;
    });
    // Attach a rejection observer even if the boundary timeout wins the race.
    void processed.catch(() => undefined);
    try {
      return await Promise.race([processed, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("CONSCIOUSNESS_DEADLINE")), Math.max(1, deadlineAt - now()));
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  const outcomes = await Promise.allSettled([prepareSide("a"), prepareSide("b")]);
  const failed = outcomes.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
  const a = outcomes[0]; const b = outcomes[1];
  if (!a || !b || a.status !== "fulfilled" || b.status !== "fulfilled") throw new Error("CONSCIOUSNESS_BOUNDARY_NOT_READY");
  const prepared = await input.port.read();
  const failure = (side: "a" | "b") => prepared.decisions.find((item) => item.tick === input.tick && item.side === side)?.actionFailure;
  return { tick: input.tick, selected: { a: selected(a.value, failure("a")), b: selected(b.value, failure("b")) } };
}
