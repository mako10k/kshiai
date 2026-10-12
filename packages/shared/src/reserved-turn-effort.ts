// R: Apply frozen action costs and effort receipts before each subsequent reservation.
import { z } from "zod";
import { ActionEffortPolicyV1Schema, repeatedActionStaminaCost } from "./action-effort-policy.js";
import { SkillSchema, type Skill } from "./character.js";
import { ReservedEffortStateSchema, ReservedTurnTraceV4Schema, applyReservedTurnTrace,
  type OrderedReservation, type ReservedTurnWorld, type ReservedTurnTrace } from "./reserved-turns.js";

const actorContextSchema = z.object({ policy: ActionEffortPolicyV1Schema, skills: z.array(SkillSchema), defense: z.number().finite() }).strict();
export const ReservedEffortContextSchema = z.object({ state: ReservedEffortStateSchema,
  actors: z.object({ a: actorContextSchema, b: actorContextSchema }).strict() }).strict();
export type ReservedEffortContext = z.infer<typeof ReservedEffortContextSchema>;
type Result = z.infer<typeof ReservedTurnTraceV4Schema>["results"][number];
type ActorContext = z.infer<typeof actorContextSchema>;
type Mechanics = Extract<OrderedReservation["action"], { mechanics: object }>["mechanics"];
type Cost = { count: number; requested: number; stamina: number; mp: number; affordable: boolean; attempted: boolean };
function verifyAttempt(action: OrderedReservation, proposed: Result, state: ReservedTurnWorld): Mechanics {
  if (proposed.reservationId !== action.reservationId || proposed.side !== action.side || !("mechanics" in action.action)) throw new Error("RESERVED_TRACE_ORDER_MISMATCH");
  if (!proposed.attempted && (proposed.outcome === "success" || proposed.outcome === "partial" || proposed.updates.length)) throw new Error("RESERVED_TRACE_UNATTEMPTED_UPDATES");
  const penalty = proposed.penalty;
  if (penalty && (action.action.mechanics.kind !== "free_action" || penalty.baseWorldRevision !== state.world.revision || !action.action.intent.includes(penalty.actionQuote))) throw new Error("RESERVED_TRACE_PENALTY_BINDING");
  return action.action.mechanics;
}
function skillAffordable(mechanics: Mechanics, skill: Skill | undefined, available: ReservedTurnWorld["actors"]["a"], repeat: number): boolean {
  if (mechanics.kind !== "skill") return true;
  return !!skill && skill.costMp <= available.mp && skill.costStamina <= Math.max(0, available.stamina - repeat);
}
function incomingAttack(attempted: boolean, action: OrderedReservation, mechanics: Mechanics, skill: Skill | undefined): boolean {
  return attempted && action.action.targets.includes("opponent") && (mechanics.kind === "basic_attack" || skill?.kind === "attack" || skill?.kind === "magic");
}
function actionCost(input: { state: ReservedTurnWorld; action: OrderedReservation; proposed: Result; mechanics: Mechanics; actor: ActorContext; own: ReservedEffortContext["state"]["a"]; skill: Skill | undefined }): Cost {
  const { state, action, proposed, mechanics, actor, own, skill } = input;
  const key = mechanics.kind === "skill" ? `skill:${mechanics.skillId}` : mechanics.kind;
  const count = own.key === key ? own.count + 1 : 1;
  const repeat = repeatedActionStaminaCost({ kind: mechanics.kind, repeatCount: count, policy: actor.policy });
  const stamina = skill?.costStamina ?? (mechanics.kind === "basic_attack" ? 3 : 0);
  const mp = skill?.costMp ?? 0;
  const available = state.actors[action.side];
  const affordable = skillAffordable(mechanics, skill, available, repeat);
  const attempted = proposed.attempted && affordable && proposed.outcome !== "cancelled";
  const penalty = proposed.penalty?.kind === "extra_stamina" ? actor.policy.freeActionPenalty.extraStamina[proposed.penalty.level] : 0;
  const requested = attempted ? stamina + repeat + penalty : 0;
  return { count, requested, stamina: Math.min(requested, available.stamina), mp: attempted ? mp : 0, affordable, attempted };
}
function costUpdates(input: { proposed: Result; action: OrderedReservation; mechanics: Mechanics; cost: Cost }) {
  const { proposed, action, mechanics, cost } = input;
  const ordinary = ["skill", "basic_attack", "reflect"].includes(mechanics.kind);
  const penalty = proposed.penalty;
  const selected = penalty?.kind === "execution_limit" ? (penalty.execution === "not_executed" ? [] : proposed.updates.filter((_update, index) => penalty.appliedChangeIndexes.includes(index))) : proposed.updates;
  let updates = selected.filter((update) => !(update.kind === "resource" && update.side === action.side && update.delta < 0 &&
    (update.resource === "mp" && mechanics.kind === "skill" || update.resource === "stamina" && (ordinary || proposed.penalty?.kind === "extra_stamina"))));
  if (!cost.attempted) updates = [];
  if (cost.stamina) updates.push({ kind: "resource", side: action.side, resource: "stamina", delta: -cost.stamina });
  if (cost.mp) updates.push({ kind: "resource", side: action.side, resource: "mp", delta: -cost.mp });
  return updates;
}
function costedResult(input: { proposed: Result; action: OrderedReservation; mechanics: Mechanics; cost: Cost; state: ReservedTurnWorld; skill: Skill | undefined }): ReservedTurnTrace["results"][number] {
  const { proposed, action, mechanics, cost, state, skill } = input;
  const reason = cost.affordable ? proposed.reason : !skill && mechanics.kind === "skill" ? "指定された技は本人の既知の技ではありません（RESERVED_UNKNOWN_SKILL）。" : "技に必要な資源が不足しています（RESERVED_RESOURCE_RANGE）。";
  return { reservationId: action.reservationId, side: action.side, baseRevision: state.revision,
    outcome: !cost.affordable ? "failure" : proposed.penalty?.kind === "execution_limit" ? (proposed.penalty.execution === "not_executed" ? "failure" : "partial") : proposed.outcome, reason, updates: costUpdates(input),
    observations: cost.affordable ? proposed.observations : { a: action.side === "a" ? [reason] : [], b: action.side === "b" ? [reason] : [], public: [] } };
}
function commitEffort(input: { result: ReservedTurnTrace["results"][number]; proposed: Result; action: OrderedReservation; mechanics: Mechanics; actor: ActorContext; skill: Skill | undefined; cost: Cost; effort: ReservedEffortContext["state"] }): Result {
  const { result, proposed, action, mechanics, actor, skill, cost, effort } = input;
  const attempted = cost.attempted && !result.reason.includes("（RESERVED_");
  const target = action.side === "a" ? "b" : "a";
  const attack = incomingAttack(attempted, action, mechanics, skill);
  const consumedExposure = attack && effort[target].exposure !== null;
  if (attack) effort[target].exposure = null;
  if (attempted) {
    effort[action.side].key = mechanics.kind === "skill" ? `skill:${mechanics.skillId}` : mechanics.kind;
    effort[action.side].count = cost.count;
  }
  if (attempted && proposed.penalty?.kind === "defense_exposure") effort[action.side].exposure = { actionId: action.reservationId,
    reduction: actor.policy.freeActionPenalty.defenseReduction[proposed.penalty.level], reason: proposed.penalty.reason };
  const penalty = proposed.penalty?.kind === "execution_limit" ? { ...proposed.penalty, appliedChangeIndexes: result.updates.map((_update, index) => index) } : proposed.penalty;
  return { ...result, attempted, penalty: attempted ? penalty : null,
    effortApplied: { requestedStamina: attempted ? cost.requested : 0, paidStamina: attempted ? cost.stamina : 0,
      unpaidStamina: attempted ? cost.requested - cost.stamina : 0, paidMp: attempted ? cost.mp : 0, consumedExposure } };
}
export function applyReservedEffortTrace(start: ReservedTurnWorld, order: readonly OrderedReservation[], raw: unknown, context: ReservedEffortContext) {
  const wire = ReservedTurnTraceV4Schema.parse(raw);
  const byId = new Map(wire.results.map((result) => [result.reservationId, result]));
  if (wire.results.length !== order.length || byId.size !== order.length || order.some((action) => !byId.has(action.reservationId))) throw new Error("RESERVED_TRACE_IDENTITY_MISMATCH");
  let state = start;
  const effort = structuredClone(context.state);
  const results: Result[] = [];
  for (const action of order) {
    const original = byId.get(action.reservationId);
    if (!original) throw new Error("RESERVED_TRACE_IDENTITY_MISMATCH");
    const proposed = { ...original, side: action.side, baseRevision: state.revision };
    const mechanics = verifyAttempt(action, proposed, state);
    const actor = context.actors[action.side];
    const skill = mechanics.kind === "skill" ? actor.skills.find((item) => item.id === mechanics.skillId) : undefined;
    const cost = actionCost({ state, action, proposed, mechanics, actor, own: effort[action.side], skill });
    const applied = applyReservedTurnTrace(state, [action], { results: [costedResult({ proposed, action, mechanics, cost, state, skill })] }, "reserved-turn-output-v3");
    const result = applied.trace.results[0];
    if (!result) throw new Error("RESERVED_TRACE_INCOMPLETE");
    results.push(commitEffort({ result, proposed, action, mechanics, actor, skill, cost, effort }));
    state = { ...applied.state, turn: start.turn };
  }
  return { state: { ...state, turn: start.turn + 1 }, trace: ReservedTurnTraceV4Schema.parse({ results }), effortState: effort };
}
