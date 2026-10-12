import { ReservedTurnPolicySchema, type ReservedTurnPolicy } from "./reserved-turn-policy.js";
export { ReservedTurnPolicySchema, ReservedTurnPromptRevisionSchema, type ReservedTurnPolicy, type ReservedTurnPromptRevision } from "./reserved-turn-policy.js";
import { AwarenessPolicyV1Schema, AwarenessBudgetSnapshotSchema, AwarenessNormalPolicy, type AwarenessPolicyV1 } from "./awareness-pipeline.js";
// R: Resolve one frozen parallel plan through an ordered, atomic canonical trace.
import { z } from "zod";
import { BattleWorldStateSchema, BattleWorldOperationSchema, applyBattleWorldTransition } from "./battle-world.js";
import { ConsciousnessMemorySchema, ConsciousnessMemorySnapshotSchema, consciousnessText, applyConsciousnessMemorySnapshot } from "./consciousness-memory.js";

const ordinal = z.number().int().nonnegative();
const sideSchema = z.enum(["a", "b"]);
const id = z.string().min(1).max(160);
export const ReservedActionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  intent: consciousnessText(600),
  targets: z.array(id).min(1).max(8),
  condition: consciousnessText(400).optional(),
}).strict();
export const ReservedTurnPlanSchema = z.object({
  actions: z.array(ReservedActionSchema).max(5),
  speech: consciousnessText(400).optional(),
  memory: ConsciousnessMemorySnapshotSchema,
}).strict().superRefine((plan, ctx) => {
  if (new Set(plan.actions.map((a) => a.id)).size !== plan.actions.length) ctx.addIssue({ code: "custom", message: "Duplicate reservation ID" });
});
export type ReservedTurnPlan = z.infer<typeof ReservedTurnPlanSchema>;
const resourcesSchema = z.object({
  hp: ordinal, maxHp: ordinal.positive(), mp: ordinal, maxMp: ordinal, stamina: ordinal, maxStamina: ordinal,
  initiative: z.number().finite(),
}).strict().superRefine((actor, ctx) => {
  if (actor.hp > actor.maxHp || actor.mp > actor.maxMp || actor.stamina > actor.maxStamina) ctx.addIssue({ code: "custom", message: "Resource exceeds capacity" });
});
export const ReservedTurnWorldSchema = z.object({
  revision: ordinal, turn: ordinal,
  actors: z.object({ a: resourcesSchema, b: resourcesSchema }).strict(),
  world: BattleWorldStateSchema,
}).strict();
export type ReservedTurnWorld = z.infer<typeof ReservedTurnWorldSchema>;
export const ReservedUpdateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resource"), side: sideSchema, resource: z.enum(["hp", "mp", "stamina"]), delta: z.number().int().min(-100000).max(100000).refine((n) => n !== 0) }).strict(),
  z.object({ kind: z.literal("world"), operation: BattleWorldOperationSchema }).strict(),
]);
const reservedActionResultBaseSchema = z.object({
  reservationId: id, side: sideSchema, baseRevision: ordinal,
  outcome: z.enum(["success", "partial", "failure", "cancelled"]),
  reason: consciousnessText(600),
  updates: z.array(ReservedUpdateSchema).max(24),
  observations: z.object({ a: z.array(consciousnessText(600)).max(8), b: z.array(consciousnessText(600)).max(8), public: z.array(consciousnessText(600)).max(8) }).strict(),
}).strict();
export const ReservedActionResultSchema = reservedActionResultBaseSchema.superRefine((result, ctx) => {
  if ((result.outcome === "success" || result.outcome === "partial") && result.updates.length === 0) ctx.addIssue({ code: "custom", message: "Successful attempt requires concrete consequences" });
  if (result.outcome === "cancelled" && result.updates.length !== 0) ctx.addIssue({ code: "custom", message: "Cancelled attempt cannot mutate world" });
});
export const ReservedTurnTraceSchema = z.object({ results: z.array(ReservedActionResultSchema).max(10) }).strict();
/** Output v2 permits information gained without a physical mutation. */
export const ReservedActionResultV2Schema = reservedActionResultBaseSchema.superRefine((result, ctx) => {
  if ((result.outcome === "success" || result.outcome === "partial") && result.updates.length === 0 &&
      !Object.values(result.observations).some((items) => items.length > 0)) {
    ctx.addIssue({ code: "custom", message: "Successful attempt requires concrete consequences or observations" });
  }
  if (result.outcome === "cancelled" && result.updates.length !== 0) ctx.addIssue({ code: "custom", message: "Cancelled attempt cannot mutate world" });
});
export const ReservedTurnTraceV2Schema = z.object({ results: z.array(ReservedActionResultV2Schema).max(10) }).strict();
export type ReservedTurnOutputRevision = "reserved-turn-output-v1" | "reserved-turn-output-v2";
export type ReservedTurnTrace = z.infer<typeof ReservedTurnTraceSchema>;
export type OrderedReservation = { side: "a" | "b"; reservationId: string; action: z.infer<typeof ReservedActionSchema> };
export function orderReservedActions(turn: number, initiative: { a: number; b: number }, plans: { a: ReservedTurnPlan; b: ReservedTurnPlan }): OrderedReservation[] {
  const first: "a" | "b" = initiative.a === initiative.b ? (turn % 2 === 1 ? "a" : "b") : initiative.a > initiative.b ? "a" : "b";
  const second: "a" | "b" = first === "a" ? "b" : "a";
  const ordered: OrderedReservation[] = [];
  for (let index = 0; index < 5; index += 1) {
    for (const side of [first, second]) {
      const action = plans[side].actions[index];
      if (action) ordered.push({ side, reservationId: `${side}:${action.id}`, action });
    }
  }
  return ordered;
}
export function validateReservedPlan(raw: unknown, memory: z.infer<typeof ConsciousnessMemorySchema>, references: ReadonlySet<string>, decisionId: string): ReservedTurnPlan {
  const plan = ReservedTurnPlanSchema.parse(raw);
  applyConsciousnessMemorySnapshot(memory, plan.memory, decisionId);
  if (plan.actions.some((action) => action.targets.some((target) => !references.has(target)))) throw new Error("RESERVED_UNKNOWN_REFERENCE");
  return plan;
}
function canAct(state: ReservedTurnWorld, side: "a" | "b"): boolean {
  const entity = state.world.entities[`character.${side}`];
  return state.actors[side].hp > 0 && !!entity?.active && entity.presence === "present" &&
    !["unconscious", "incapacitated"].includes(entity.actorState?.consciousness ?? "alert");
}
function applyReservationUpdates(state: ReservedTurnWorld, result: z.infer<typeof ReservedActionResultSchema>, turn: number) {
  const actors = { a: { ...state.actors.a }, b: { ...state.actors.b } };
  const worldOps: z.infer<typeof BattleWorldOperationSchema>[] = [];
  for (const update of result.updates) {
    if (update.kind === "world") { worldOps.push(update.operation); continue; }
    const actor = actors[update.side];
    const max = update.resource === "hp" ? actor.maxHp : update.resource === "mp" ? actor.maxMp : actor.maxStamina;
    const value = actor[update.resource] + update.delta;
    if (value < 0 || value > max) throw new Error("RESERVED_RESOURCE_RANGE");
    if (update.resource === "hp" && actor.hp === 0 && value > 0) throw new Error("RESERVED_DEFEAT_IRREVERSIBLE");
    actor[update.resource] = value;
  }
  const transition = applyBattleWorldTransition({ state: state.world, turn,
    transition: { baseRevision: state.world.revision, turn, sourceEventIds: [], operations: worldOps } });
  if (!transition.ok) throw new Error(`RESERVED_WORLD_${transition.error.code}`);
  return { actors, world: transition.state };
}
function effectSnapshot(state: ReservedTurnWorld): string {
  return JSON.stringify({ actors: state.actors, world: { ...state.world, revision: 0,
    entities: Object.fromEntries(Object.entries(state.world.entities).map(([id, entity]) => [id, { ...entity, updatedTurn: 0 }])),
    pairRelations: state.world.pairRelations.map((relation) => ({ ...relation, updatedTurn: 0 })),
  } });
}
function requiresPhysicalEffect(result: ReservedTurnTrace["results"][number], revision: ReservedTurnOutputRevision): boolean {
  return (result.outcome === "success" || result.outcome === "partial") &&
    (revision === "reserved-turn-output-v1" || result.updates.length > 0);
}
/** No mutation escapes this reducer until every receipt validates. */
export function applyReservedTurnTrace(start: ReservedTurnWorld, order: readonly OrderedReservation[], raw: unknown, outputRevision: ReservedTurnOutputRevision = "reserved-turn-output-v1"): { state: ReservedTurnWorld; trace: ReservedTurnTrace } {
  const trace = (outputRevision === "reserved-turn-output-v2" ? ReservedTurnTraceV2Schema : ReservedTurnTraceSchema).parse(raw);
  if (trace.results.length !== order.length) throw new Error("RESERVED_TRACE_INCOMPLETE");
  let state = ReservedTurnWorldSchema.parse(start);
  for (const [index, result] of trace.results.entries()) {
    const reservation = order[index];
    if (!reservation || result.reservationId !== reservation.reservationId || result.side !== reservation.side) throw new Error("RESERVED_TRACE_ORDER_MISMATCH");
    if (result.baseRevision !== state.revision) throw new Error("RESERVED_TRACE_REVISION_CONFLICT");
    if ((!canAct(state, result.side) || state.actors.a.hp === 0 || state.actors.b.hp === 0) && result.outcome !== "cancelled") throw new Error("RESERVED_INCAPACITATED_ACTION");
    const { actors, world } = applyReservationUpdates(state, result, start.turn);
    const next = ReservedTurnWorldSchema.parse({ ...state, revision: state.revision + 1, actors, world });
    if (requiresPhysicalEffect(result, outputRevision) && effectSnapshot(state) === effectSnapshot(next)) throw new Error("RESERVED_EFFECT_EMPTY");
    state = next;
  }
  return { state: { ...state, turn: start.turn + 1 }, trace };
}

export const ReservedTurnNarrationSchema = z.object({ lines: z.array(consciousnessText(600)).min(1).max(16) }).strict();
const requestOutputSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("character"), plan: ReservedTurnPlanSchema }).strict(),
  z.object({ role: z.literal("adjudication"), trace: ReservedTurnTraceV2Schema }).strict(),
  z.object({ role: z.literal("narration"), narration: ReservedTurnNarrationSchema }).strict(),
]);
export const ReservedTurnRequestSchema = z.object({
  id, turn: ordinal, role: z.enum(["character", "adjudication", "narration"]), side: sideSchema.nullable(),
  inputDigest: id, system: z.string().min(1), user: z.string().min(1),
  status: z.enum(["reserved", "prepared", "failed"]),
  output: requestOutputSchema.nullable(), rawResponse: z.string().nullable(), physicalOutstanding: z.boolean(), failure: z.string().nullable(),
}).strict().superRefine((request, ctx) => {
  if (request.output && request.output.role !== request.role) ctx.addIssue({ code: "custom", message: "Request role mismatch" });
  if (request.status === "prepared" && (!request.output || request.physicalOutstanding)) ctx.addIssue({ code: "custom", message: "Prepared response must be valid and physically closed" });
  if ((request.role === "character") !== (request.side !== null)) ctx.addIssue({ code: "custom", message: "Character request requires side" });
});
export type ReservedTurnRequest = z.infer<typeof ReservedTurnRequestSchema>;
export const ReservedTurnRuntimeSchema = z.object({
  pipeline: z.literal("reserved-turns-v1"), policy: ReservedTurnPolicySchema,
  operatingPolicy: AwarenessPolicyV1Schema, budget: AwarenessBudgetSnapshotSchema, terminalAt: ordinal.nullable(),
  startedAt: ordinal, deadlineAt: ordinal,
  turn: ordinal, status: z.enum(["active", "terminal", "incomplete"]), failure: z.string().nullable(),
  memories: z.object({ a: ConsciousnessMemorySchema, b: ConsciousnessMemorySchema }).strict(),
  feedback: z.object({ a: z.array(consciousnessText(600)).max(80), b: z.array(consciousnessText(600)).max(80) }).strict(),
  requests: z.array(ReservedTurnRequestSchema).max(500),
  lastTrace: ReservedTurnTraceV2Schema.nullable(),
}).strict().superRefine((runtime, ctx) => {
  // Policy is frozen with the output revision; old persisted traces retain v1 validation.
  if (runtime.policy.revision !== "reserved-turn-policy-v4") {
    const traces = [runtime.lastTrace, ...runtime.requests.flatMap((request) => request.output?.role === "adjudication" ? [request.output.trace] : [])];
    for (const trace of traces) {
      if (trace && !ReservedTurnTraceSchema.safeParse(trace).success) ctx.addIssue({ code: "custom", message: "Legacy policy requires reserved turn output v1" });
    }
  }
  if (new Set(runtime.requests.map((r) => r.id)).size !== runtime.requests.length) ctx.addIssue({ code: "custom", message: "Duplicate request" });
  if (runtime.deadlineAt !== runtime.startedAt + runtime.policy.durationMs) ctx.addIssue({ code: "custom", message: "Deadline mismatch" });
  if ((runtime.status === "incomplete") !== (runtime.failure !== null)) ctx.addIssue({ code: "custom", message: "Failure/status mismatch" });
});
export type ReservedTurnRuntime = z.infer<typeof ReservedTurnRuntimeSchema>;
export function initializeReservedTurns(policy: ReservedTurnPolicy, startedAt: number, operatingPolicy: AwarenessPolicyV1 = AwarenessNormalPolicy): ReservedTurnRuntime {
  return ReservedTurnRuntimeSchema.parse({ pipeline: "reserved-turns-v1", policy, operatingPolicy, terminalAt: null, budget: { physicalAttempts: 0, physicalOutstanding: 0, reservedUsd: 0, settledUsd: 0, unknownAttemptIds: [], reservations: [] }, startedAt, deadlineAt: startedAt + policy.durationMs,
    turn: 0, status: "active", failure: null, memories: { a: [], b: [] }, feedback: { a: [], b: [] }, requests: [], lastTrace: null });
}
