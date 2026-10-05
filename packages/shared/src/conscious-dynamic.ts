import { z } from "zod";
import {
  CharacterActionIntentSchema, ConsciousAgencyV2Schema, ConsciousGoalV1Schema,
  ConsciousIntentV2Schema, type CharacterActionIntent, type ConsciousAgencyV2,
  type ConsciousGoalV1, type ConsciousIntentV2,
} from "./battle.js";
import { AgencyFactsV1Schema, type AgencyFactV1, type AgencyField, type AgencyPhase } from "./conscious-agency.js";

export type ConsciousGenerationFieldV4 = "initialGoal" | "intent" | "nextAction" | "nextUtterance" | "realizedManifestation";
export type ConsciousOutputV4 = {
  contractVersion: 4;
  phase: AgencyPhase;
  decisionRequested: boolean;
  generationTrace: { targets: ConsciousGenerationFieldV4[]; repairTargets: ConsciousGenerationFieldV4[]; calls: number; schemaDigests: string[] };
  initialGoal: AgencyField<ConsciousGoalV1 | null>;
  intent: AgencyField<ConsciousIntentV2 | null>;
  nextAction: AgencyField<CharacterActionIntent | null>;
  nextUtterance: AgencyField<string | null>;
  realizedManifestation: AgencyField<string | null>;
  errors: { path: string; code: string; allowed?: string[]; expected?: string }[];
  origins: Record<string, "omitted" | "explicit_null" | "provided">;
};
export function initialConsciousAgencyV2(): ConsciousAgencyV2 {
  return { schemaVersion: 2, upperGoal: null, latestDecision: null };
}
export function decodeConsciousOutputV4(raw: unknown, phase: AgencyPhase): ConsciousOutputV4 {
  const parsed = z.record(z.unknown()).safeParse(raw);
  const object = parsed.success ? parsed.data : {};
  const errors: ConsciousOutputV4["errors"] = parsed.success ? [] : [{ path: "/", code: "object_required" }];
  const origins: ConsciousOutputV4["origins"] = {};
  const field = <T>(key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): AgencyField<T | null> => {
    origins[key] = !Object.hasOwn(object, key) ? "omitted" : object[key] === null ? "explicit_null" : "provided";
    if (!Object.hasOwn(object, key) || object[key] === null) return { valid: true, value: null };
    const value = schema.safeParse(object[key]);
    if (value.success) return { valid: true, value: value.data };
    for (const issue of value.error.issues) errors.push({
      path: `/${key}${issue.path.length ? "/" + issue.path.join("/") : ""}`, code: issue.code,
      ...(issue.code === "invalid_type" ? { expected: issue.expected } : {}),
    });
    return { valid: false, reason: "schema_invalid" };
  };
  return {
    contractVersion: 4, phase, decisionRequested: phase !== "aftermath",
    generationTrace: { targets: [], repairTargets: [], calls: 0, schemaDigests: [] },
    initialGoal: field("initialGoal", ConsciousGoalV1Schema),
    intent: field("intent", ConsciousIntentV2Schema),
    nextAction: field("nextAction", CharacterActionIntentSchema),
    nextUtterance: field("nextUtterance", z.string().trim().min(1).max(400)),
    realizedManifestation: field("realizedManifestation", z.string().min(1).max(240)),
    errors, origins,
  };
}
export type AgencyAcceptanceFailureV4 = "goal_invalid" | "goal_replacement" | "intent_invalid" | "action_invalid" | "action_required";

export function acceptConsciousDecisionV4(input: {
  previous: ConsciousAgencyV2; output: ConsciousOutputV4; facts: readonly AgencyFactV1[];
  turn: number; validateAction: (action: CharacterActionIntent) => CharacterActionIntent | null;
}) {
  const previous = ConsciousAgencyV2Schema.parse(input.previous);
  const facts = AgencyFactsV1Schema.parse(input.facts);
  const turn = z.number().int().nonnegative().parse(input.turn);
  const o = input.output;
  const reject = (state: ConsciousAgencyV2, failure: AgencyAcceptanceFailureV4 | null) => ({ state, acceptedDecision: false, failure });
  if (o.phase === "aftermath" || !o.decisionRequested) return reject(previous, null);
  let goal = previous.upperGoal;
  if (goal === null) {
    if (o.phase === "later" || !o.initialGoal.valid || o.initialGoal.value === null ||
        !o.initialGoal.value.basisRefs.every((ref) => facts.some((fact) => fact.ref === ref &&
          ["value", "relationship", "suggested_objective", "default_objective"].includes(fact.kind)))) {
      return reject(previous, "goal_invalid");
    }
    goal = o.initialGoal.value;
  } else if (!o.initialGoal.valid || o.initialGoal.value !== null) return reject(previous, "goal_replacement");
  const state = { ...previous, upperGoal: goal };
  if (!o.intent.valid || !o.nextAction.valid) return reject(state, !o.intent.valid ? "intent_invalid" : "action_invalid");
  if (o.intent.value === null && o.nextAction.value === null && o.phase !== "later") return reject(state, null);
  if (o.intent.value === null || !o.intent.value.basisRefs.every((ref) => facts.some((fact) => fact.ref === ref))) {
    return reject(state, "intent_invalid");
  }
  if (o.phase === "later" && o.nextAction.value === null) return reject(state, "action_required");
  const action = o.nextAction.value === null ? null : input.validateAction(o.nextAction.value);
  if (o.nextAction.value !== null && action === null) return reject(state, "action_invalid");
  return { state: ConsciousAgencyV2Schema.parse({ ...state, latestDecision: { intent: o.intent.value, action, turn, phase: o.phase } }), acceptedDecision: true, failure: null };
}
