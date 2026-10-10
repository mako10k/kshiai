// R: Define private unified decisions independently of historical awareness state.
import { z } from "zod";
import { CharacterActionIntentSchema } from "./battle.js";
import { CharacterSelfProfileAnchorSchema } from "./profile-grounding.js";
import { CharacterPerceptionFrameSchema } from "./perception.js";
import { AwarenessAvailableActionSchema, AwarenessBudgetSnapshotSchema, AwarenessNormalPolicy, AwarenessPolicyV1Schema, type AwarenessPolicyV1 } from "./awareness-pipeline.js";
import { ConsciousnessMemorySchema, ConsciousnessMemoryOperationsSchema, consciousnessText, applyConsciousnessMemory } from "./consciousness-memory.js";
import { UnifiedConsciousnessPolicySchema, type UnifiedConsciousnessPolicy } from "./unified-consciousness-policy.js";
const id = z.string().min(1).max(220);
const tick = z.number().int().nonnegative();
export const UnifiedConsciousnessEventSchema = z.object({ id, text: consciousnessText(4000) }).strict();
export const UnifiedConsciousnessDecisionSchema = z.object({
  action: CharacterActionIntentSchema.nullable().optional(),
  speech: consciousnessText(400).nullable().optional(),
  memoryOperations: ConsciousnessMemoryOperationsSchema.optional(),
}).strict();
export type UnifiedConsciousnessDecision = z.infer<typeof UnifiedConsciousnessDecisionSchema>;
export const UnifiedConsciousnessInputSchema = z.object({
  side: z.enum(["a", "b"]), tick,
  character: CharacterSelfProfileAnchorSchema,
  characteristics: z.array(z.string()),
  perception: CharacterPerceptionFrameSchema,
  memory: ConsciousnessMemorySchema,
  events: z.array(UnifiedConsciousnessEventSchema).max(128),
  availableActions: z.array(AwarenessAvailableActionSchema),
  facts: z.array(z.object({ ref: id, content: z.string().min(1).max(4000) }).strict()),
  ongoingAction: z.string().nullable(),
}).strict().superRefine((input, context) => {
  if (input.side !== input.perception.observer.side) context.addIssue({ code: "custom", message: "Observer mismatch" });
  if (new Set(input.events.map((event) => event.id)).size !== input.events.length) context.addIssue({ code: "custom", message: "Duplicate event ID" });
  if (input.events.reduce((size, event) => size + Array.from(event.text).length, 0) > 16000) context.addIssue({ code: "custom", message: "Event capacity exceeded" });
});
export type UnifiedConsciousnessInput = z.infer<typeof UnifiedConsciousnessInputSchema>;
export const UnifiedConsciousnessSideSchema = z.object({
  memory: ConsciousnessMemorySchema, memoryRevision: tick, lastDecisionTick: tick.nullable(),
  perceptionDigest: z.string(), pendingEvents: z.array(UnifiedConsciousnessEventSchema).max(128),
  consumedEventIds: z.array(id), calls: tick.max(37),
}).strict();
export type UnifiedConsciousnessSide = z.infer<typeof UnifiedConsciousnessSideSchema>;
export const UnifiedConsciousnessPreparedSchema = z.object({
  id, side: z.enum(["a", "b"]), tick, worldRevision: tick, memoryRevision: tick,
  inputDigest: z.string().min(1), input: UnifiedConsciousnessInputSchema,
  status: z.enum(["reserved", "prepared", "applied", "failed"]),
  output: UnifiedConsciousnessDecisionSchema.nullable(),
  actionFailure: z.enum(["CONSCIOUSNESS_ACTION_UNKNOWN", "CONSCIOUSNESS_REFERENCE_UNKNOWN"]).optional(),
  physicalOutstanding: z.boolean(), failure: z.string().nullable(),
  deadlineAt: z.number().finite().nonnegative(),
}).strict().superRefine((decision, context) => {
  if (decision.side !== decision.input.side || decision.tick !== decision.input.tick) context.addIssue({ code: "custom", message: "Prepared input identity mismatch" });
  if ((decision.status === "prepared" || decision.status === "applied") && (decision.output === null || decision.physicalOutstanding)) context.addIssue({ code: "custom", message: "Usable decision requires a closed valid response" });
});
export type UnifiedConsciousnessPrepared = z.infer<typeof UnifiedConsciousnessPreparedSchema>;
export const UnifiedConsciousnessRuntimeSchema = z.object({
  pipeline: z.literal("unified-consciousness-v1"), policy: UnifiedConsciousnessPolicySchema,
  operatingPolicy: AwarenessPolicyV1Schema, budget: AwarenessBudgetSnapshotSchema, terminalAt: z.number().finite().nonnegative().nullable(),
  startedAt: z.number().finite().nonnegative(), deadlineAt: z.number().finite().nonnegative(),
  tick: tick.nullable(), status: z.enum(["active", "terminal", "incomplete"]),
  incompleteReason: z.string().nullable(),
  sides: z.object({ a: UnifiedConsciousnessSideSchema, b: UnifiedConsciousnessSideSchema }).strict(),
  decisions: z.array(UnifiedConsciousnessPreparedSchema).max(74),
}).strict().superRefine((runtime, context) => {
  if (runtime.deadlineAt !== runtime.startedAt + runtime.policy.durationMs) context.addIssue({ code: "custom", message: "Deadline binding mismatch" });
  if (new Set(runtime.decisions.map((decision) => decision.id)).size !== runtime.decisions.length) context.addIssue({ code: "custom", message: "Duplicate decision ID" });
  if ((runtime.status === "incomplete") !== (runtime.incompleteReason !== null)) context.addIssue({ code: "custom", message: "Incomplete reason mismatch" });
  for (const decision of runtime.decisions) {
    if (decision.actionFailure && (runtime.policy.revision !== "unified-consciousness-policy-v2" || decision.output === null ||
      decision.actionFailure !== unifiedActionFailure(decision.input, decision.output.action))) context.addIssue({ code: "custom", message: "Invalid failed-action receipt" });
  }
  for (const side of ["a", "b"] as const) {
    if (runtime.sides[side].calls !== runtime.decisions.filter((decision) => decision.side === side).length) context.addIssue({ code: "custom", message: "Call count mismatch" });
  }
});
export type UnifiedConsciousnessRuntime = z.infer<typeof UnifiedConsciousnessRuntimeSchema>;
export function initializeUnifiedConsciousness(policy: UnifiedConsciousnessPolicy, startedAt: number, operatingPolicy: AwarenessPolicyV1 = AwarenessNormalPolicy): UnifiedConsciousnessRuntime {
  const side = (): UnifiedConsciousnessSide => ({ memory: [], memoryRevision: 0, lastDecisionTick: null, perceptionDigest: "", pendingEvents: [], consumedEventIds: [], calls: 0 });
  return UnifiedConsciousnessRuntimeSchema.parse({ pipeline: "unified-consciousness-v1", policy,
    operatingPolicy, budget: { physicalAttempts: 0, physicalOutstanding: 0, reservedUsd: 0, settledUsd: 0, unknownAttemptIds: [], reservations: [] }, terminalAt: null,
    startedAt, deadlineAt: startedAt + policy.durationMs, tick: null, status: "active", incompleteReason: null,
    sides: { a: side(), b: side() }, decisions: [] });
}
export function shouldRunUnifiedConsciousness(side: UnifiedConsciousnessSide, atTick: number, policy: UnifiedConsciousnessPolicy): boolean {
  return side.lastDecisionTick === null || side.pendingEvents.length > 0 || atTick - side.lastDecisionTick >= policy.reassessmentTicks;
}
export function unifiedActionFailure(input: UnifiedConsciousnessInput, action: UnifiedConsciousnessDecision["action"]): "CONSCIOUSNESS_ACTION_UNKNOWN" | "CONSCIOUSNESS_REFERENCE_UNKNOWN" | null {
  if (action && !input.availableActions.some((option) => option.kind === action.kind &&
    (option.kind !== "skill" || (action.kind === "skill" && option.skillId === action.skillId)))) return "CONSCIOUSNESS_ACTION_UNKNOWN";
  const refs = new Set(input.facts.map((fact) => fact.ref));
  if (action?.kind === "free_action" && action.subjectRefs.some((ref) => !refs.has(ref))) return "CONSCIOUSNESS_REFERENCE_UNKNOWN";
  if (action && "instrumentRef" in action && action.instrumentRef && !refs.has(action.instrumentRef)) return "CONSCIOUSNESS_REFERENCE_UNKNOWN";
  return null;
}
export function validateUnifiedDecision(input: UnifiedConsciousnessInput, raw: unknown, decisionId: string, actionFeedback = false): UnifiedConsciousnessDecision {
  const output = UnifiedConsciousnessDecisionSchema.parse(raw);
  const failure = unifiedActionFailure(input, output.action);
  if (failure && !actionFeedback) throw new Error(failure);
  applyConsciousnessMemory(input.memory, output.memoryOperations ?? [], decisionId);
  return output;
}
function assertRequiredDecisions(next: UnifiedConsciousnessRuntime, atTick: number): void {
  for (const side of ["a", "b"] as const) {
    const decisions = next.decisions.filter((item) => item.tick === atTick && item.side === side);
    if (decisions.length > 1 || (shouldRunUnifiedConsciousness(next.sides[side], atTick, next.policy) && decisions.length !== 1)) throw new Error("CONSCIOUSNESS_BOUNDARY_NOT_READY");
  }
}
function appendActionFailureEvent(side: UnifiedConsciousnessSide, decision: UnifiedConsciousnessPrepared, policy: UnifiedConsciousnessPolicy): void {
  if (!decision.actionFailure) return;
  const reason = decision.actionFailure === "CONSCIOUSNESS_ACTION_UNKNOWN"
    ? "現在の候補にない行為または技を指定した" : "提示されていない対象・道具の参照を指定した";
  const event = { id: `${decision.id}:action-failed`, text: `行為は実行されなかった。${reason}（${decision.actionFailure}）。現在提示された候補と参照を使って次の行為を選ぶ。` };
  if (!side.pendingEvents.some((item) => item.id === event.id) && !side.consumedEventIds.includes(event.id)) side.pendingEvents.push(event);
  if (side.pendingEvents.length > policy.maxEvents || side.pendingEvents.reduce((size, item) => size + Array.from(item.text).length, 0) > policy.eventCharacters) throw new Error("CONSCIOUSNESS_EVENT_CAPACITY_EXCEEDED");
}
/** Only a world transaction may persist this reducer's result. */
export function applyUnifiedConsciousnessBoundary(runtime: UnifiedConsciousnessRuntime, atTick: number): UnifiedConsciousnessRuntime {
  if (!Number.isSafeInteger(atTick) || atTick < 0 || atTick > runtime.policy.maxTicks || runtime.status !== "active" || (runtime.tick !== null && atTick <= runtime.tick)) throw new Error("CONSCIOUSNESS_BOUNDARY_ALREADY_APPLIED");
  const next = UnifiedConsciousnessRuntimeSchema.parse(runtime);
  assertRequiredDecisions(next, atTick);
  for (const decision of next.decisions.filter((item) => item.tick === atTick)) {
    if (decision.status !== "prepared" || decision.output === null || decision.physicalOutstanding) throw new Error("CONSCIOUSNESS_BOUNDARY_NOT_READY");
    const side = next.sides[decision.side];
    if (side.memoryRevision !== decision.memoryRevision) throw new Error("CONSCIOUSNESS_MEMORY_REVISION_CONFLICT");
    side.memory = applyConsciousnessMemory(side.memory, decision.output.memoryOperations ?? [], decision.id);
    side.memoryRevision += 1;
    side.lastDecisionTick = atTick;
    const consumed = new Set(decision.input.events.map((event) => event.id));
    side.consumedEventIds.push(...consumed);
    side.pendingEvents = side.pendingEvents.filter((event) => !consumed.has(event.id));
    appendActionFailureEvent(side, decision, runtime.policy);
    decision.status = "applied";
  }
  next.tick = atTick;
  return UnifiedConsciousnessRuntimeSchema.parse(next);
}
