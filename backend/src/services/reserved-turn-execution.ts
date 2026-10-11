// R: Prepare three/four logical turn requests with durable identities and no unknown-send replay.
import { ReservedTurnRuntimeSchema, ReservedTurnTraceSchema, ReservedTurnNarrationSchema,
  validateReservedPlan, orderReservedActions, applyReservedTurnTrace, applyConsciousnessMemorySnapshot,
  type ReservedTurnRuntime, type ReservedTurnRequest, type ReservedTurnWorld, type ReservedTurnPlan } from "@kshiai/shared";
import type { AwarenessJsonTransport } from "../llm/awareness-provider-contract.js";
import { reservedPlanSystem, reservedAdjudicationSystem, reservedAdjudicationUser, reservedNarrationSystem } from "../llm/reserved-turns.js";
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
export async function executeReservedTurn(input: {
  battleId: string; start: ReservedTurnWorld; frames: { a: ReservedPlannerFrame; b: ReservedPlannerFrame }; assets: object;
  publicScene: string; narrationStyle?: string; port: ReservedExecutionPort;
  character: AwarenessJsonTransport; adjudication: AwarenessJsonTransport; narration: AwarenessJsonTransport;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const initial = ReservedTurnRuntimeSchema.parse(await input.port.read());
  const policy = initial.policy; const turn = initial.turn + 1;
  if (initial.status !== "active" || input.start.turn !== turn || turn > policy.maxTurns || now() >= initial.deadlineAt) throw new Error("RESERVED_TURN_BOUNDARY_INVALID");
  if (input.character.identity.provider !== policy.character.provider || input.character.identity.fastModel !== policy.character.model ||
      input.adjudication.identity.provider !== policy.adjudication.provider || input.adjudication.identity.engineModel !== policy.adjudication.model ||
      input.narration.identity.provider !== policy.narration.provider || input.narration.identity.fastModel !== policy.narration.model) throw new Error("RESERVED_MODEL_BINDING_MISMATCH");
  async function request(role: ReservedTurnRequest["role"], side: "a" | "b" | null, system: string, user: string, validate: (raw: unknown) => Output): Promise<Output> {
    const logicalId = `${input.battleId}:turn:${turn}:${role}:${side ?? "both"}`;
    const digest = requestDigest({ system, user, role, policy });
    if (system.length + user.length > policy.inputCharacters) throw new Error("RESERVED_INPUT_LIMIT");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = `${logicalId}:${attempt}`;
      const before = await input.port.read(); const existing = before.requests.find((r) => r.id === id);
      if (existing) {
        if (existing.inputDigest !== digest) throw new Error("RESERVED_INPUT_CONFLICT");
        if (existing.status === "prepared" && existing.output && !existing.physicalOutstanding) return existing.output;
        if (existing.status === "failed" && existing.failure === "RATE_LIMIT" && !existing.physicalOutstanding) continue;
        throw new Error("RESERVED_SEND_NOT_REPLAYABLE");
      }
      const deadlineAt = Math.min(initial.deadlineAt, now() + policy.deadlineMs);
      await input.port.update((runtime) => {
        if (runtime.turn !== initial.turn || runtime.status !== "active" || now() >= deadlineAt || runtime.requests.some((r) => r.id === id)) throw new Error("RESERVED_RESERVATION_CONFLICT");
        if (runtime.requests.length + runtime.budget.physicalAttempts >= policy.maxPhysicalAttempts) throw new Error("RESERVED_ATTEMPT_LIMIT");
        return { ...runtime, requests: [...runtime.requests, { id, turn, role, side, inputDigest: digest, system, user,
          status: "reserved", output: null, rawResponse: null, physicalOutstanding: true, failure: null }] };
      });
      const transport = role === "character" ? input.character : role === "adjudication" ? input.adjudication : input.narration;
      let closed = false;
      const send = withLlmPhysicalCompletion(() => withLlmUsageScope({ battleId: input.battleId, role: role === "character" ? "consciousness" : role, ...(side ? { side } : {}), receiptIds: [id] },
        () => transport.requestJson(system, user, { tier: role === "adjudication" ? "engine" : "fast", timeoutMs: Math.max(1, deadlineAt - now()),
          maxCompletionTokens: role === "adjudication" ? policy.adjudicationOutputTokens : policy.characterOutputTokens,
          label: `reserved-turns-v1:${role}`, responseFormat: { type: "json_object" } })));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const processed = send.then(async (raw) => {
        closed = true;
        await input.port.account((runtime) => ({ ...runtime, requests: runtime.requests.map((r) => r.id === id ? { ...r, physicalOutstanding: false, rawResponse: JSON.stringify(raw) ?? "null" } : r) }));
        const output = validate(raw);
        await input.port.update((runtime) => {
          if (runtime.turn !== initial.turn || runtime.status !== "active" || now() >= deadlineAt) throw new Error("RESERVED_LATE_RESPONSE");
          return { ...runtime, requests: runtime.requests.map((r) => r.id === id ? { ...r, status: "prepared", output } : r) };
        });
        return output;
      });
      void processed.catch(() => undefined);
      try {
        return await Promise.race([processed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("RESERVED_DEADLINE")), Math.max(1, deadlineAt - now())); })]);
      } catch (error) {
        const limited = isLlmRateLimitResponse(error);
        await input.port.account((runtime) => ({ ...runtime, requests: runtime.requests.map((r) => r.id === id ? { ...r, status: "failed", physicalOutstanding: !(closed || limited || error instanceof LlmPhysicalCompletionError), failure: limited ? "RATE_LIMIT" : "REQUEST_FAILED" } : r) }));
        if (!limited || attempt === 2) throw error;
        const delay = providerRetryAfterMs(error) ?? 250 * 2 ** attempt;
        if (now() + delay >= initial.deadlineAt) throw new Error("RESERVED_RETRY_DEADLINE");
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      } finally { if (timer) clearTimeout(timer); }
    }
    throw new Error("RESERVED_RATE_LIMIT_EXHAUSTED");
  }
  async function plan(side: "a" | "b"): Promise<ReservedTurnPlan> {
    const frame = input.frames[side];
    const user = JSON.stringify({ turn, side, ...frame, memory: initial.memories[side].map((entry, index) => ({ priority: String(index + 1), text: entry.text })), feedback: initial.feedback[side] });
    const output = await request("character", side, reservedPlanSystem, user, (raw) => ({ role: "character", plan: validateReservedPlan(raw, initial.memories[side], new Set(frame.references.map((r) => r.id)), `${input.battleId}:turn:${turn}:${side}`) }));
    if (output.role !== "character") throw new Error("RESERVED_PLAN_ROLE");
    return output.plan;
  }
  const outcomes = await Promise.allSettled([plan("a"), plan("b")]);
  const [a, b] = outcomes;
  if (a.status !== "fulfilled") throw a.reason;
  if (b.status !== "fulfilled") throw b.reason;
  const plans = { a: a.value, b: b.value };
  const order = orderReservedActions(turn, { a: input.start.actors.a.initiative, b: input.start.actors.b.initiative }, plans);
  const judged = await request("adjudication", null, reservedAdjudicationSystem(), reservedAdjudicationUser(input.start, order, { ...input.assets, observedReferences: { a: input.frames.a.references, b: input.frames.b.references } }), (raw) => ({ role: "adjudication", trace: applyReservedTurnTrace(input.start, order, ReservedTurnTraceSchema.parse(raw)).trace }));
  if (judged.role !== "adjudication") throw new Error("RESERVED_TRACE_ROLE");
  const resolved = applyReservedTurnTrace(input.start, order, judged.trace);
  const narrated = await request("narration", null, reservedNarrationSystem, JSON.stringify({ turn, scene: input.publicScene, style: input.narrationStyle, consequences: judged.trace.results.flatMap((r) => r.observations.public) }), (raw) => ({ role: "narration", narration: ReservedTurnNarrationSchema.parse(raw) }));
  if (narrated.role !== "narration") throw new Error("RESERVED_NARRATION_ROLE");
  const memories = { a: applyConsciousnessMemorySnapshot(initial.memories.a, plans.a.memory, `${input.battleId}:turn:${turn}:a`), b: applyConsciousnessMemorySnapshot(initial.memories.b, plans.b.memory, `${input.battleId}:turn:${turn}:b`) };
  return { turn, plans, state: resolved.state, trace: judged.trace, narration: narrated.narration, memories,
    feedback: { a: judged.trace.results.flatMap((r) => r.observations.a), b: judged.trace.results.flatMap((r) => r.observations.b) } };
}
