import { z } from "zod";
import {
  CharacterActionIntentSchema,
  ConsciousAgencyV1Schema,
  ConsciousGoalV1Schema,
  ConsciousIntentV1Schema,
  type CharacterActionIntent,
  type ConsciousAgencyV1,
  type ConsciousGoalV1,
  type ConsciousIntentV1,
} from "./battle.js";

export const AgencyFactV1Schema = z.object({
  ref: z.string().trim().min(1).max(96),
  kind: z.enum([
    "suggested_objective", "value", "relationship", "default_objective",
    "ability", "reserve", "observation", "candidate",
  ]),
  sourcePath: z.string().min(1).refine((path) => path.startsWith("/"), {
    message: "facts use server-constructed JSON pointers",
  }),
}).strict();
export type AgencyFactV1 = z.infer<typeof AgencyFactV1Schema>;
export const AgencyFactsV1Schema = z.array(AgencyFactV1Schema).max(128).refine(
  (facts) => new Set(facts.map((fact) => fact.ref)).size === facts.length,
  { message: "agency facts must have unique refs" },
);

export const CONSCIOUS_GOAL_POLICY_V3 = [
  "性格・価値観・認知済みの相手との関係と現在の状況に照らし、妥当な上位目標を導く。",
  "通常は勝利を目指すが、戦闘を楽しむ、相手を守る等がより適切ならその目標を選べる。",
  "既存の目標文は判断材料であり、作者が明示・確認したことに優先権を与えない。",
  "人間・LLMのどちらが書いたかで目標の妥当性を判断しない。",
  "行動禁止規範と合法候補は守り、未知の相手属性や狙った効果の成立を捏造しない。",
  "basisRefsは今回の入力の事実を参照する。以前の判断の根拠を現在の観測と混同しない。",
].join("\n");

export function initialConsciousAgencyV1(): ConsciousAgencyV1 {
  return { schemaVersion: 1, upperGoal: null, latestDecision: null };
}

export type AgencyField<T> =
  | { valid: true; value: T }
  | { valid: false; reason: "missing" | "schema_invalid" };

export type AgencyPhase = "prologue" | "turn" | "aftermath" | "later";
type DecodedExpression = {
  nextUtterance: AgencyField<string | null>;
  realizedManifestation: AgencyField<string | null>;
};
export type ConsciousOutputV3 =
  | { envelopeValid: false; phase: AgencyPhase }
  | ({
      envelopeValid: true;
      phase: "prologue" | "turn";
      initialGoal: AgencyField<ConsciousGoalV1 | null>;
      intent: AgencyField<ConsciousIntentV1>;
      nextAction: AgencyField<CharacterActionIntent | null>;
    } & DecodedExpression)
  | ({
      envelopeValid: true;
      phase: "aftermath";
    } & DecodedExpression)
  | {
      envelopeValid: true;
      phase: "later";
      intent: AgencyField<ConsciousIntentV1>;
      nextAction: AgencyField<CharacterActionIntent | null>;
    };

const OutputObjectSchema = z.record(z.unknown());
function field<T>(
  object: Record<string, unknown>,
  key: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): AgencyField<T> {
  if (!Object.hasOwn(object, key)) return { valid: false, reason: "missing" };
  const result = schema.safeParse(object[key]);
  return result.success
    ? { valid: true, value: result.data }
    : { valid: false, reason: "schema_invalid" };
}

/**
 * Receives already-parsed external JSON, never stringifies/parses internal values.
 * Speech coercion/grounding remains owned by the existing expression acceptance.
 * Decoded fields are closed typed values, not raw unknown provider data.
 */
export function decodeConsciousOutputV3(
  raw: unknown,
  phase: AgencyPhase,
): ConsciousOutputV3 {
  const object = OutputObjectSchema.safeParse(raw);
  if (!object.success) return { envelopeValid: false, phase };
  const permitted = phase === "aftermath"
    ? ["nextUtterance", "realizedManifestation"]
    : phase === "later"
      ? ["intent", "nextAction"]
      : ["initialGoal", "intent", "nextAction", "nextUtterance", "realizedManifestation"];
  if (Object.keys(object.data).some((key) => !permitted.includes(key))) {
    return { envelopeValid: false, phase };
  }
  if (phase === "later") {
    return {
      envelopeValid: true, phase,
      intent: field(object.data, "intent", ConsciousIntentV1Schema),
      nextAction: field(object.data, "nextAction", CharacterActionIntentSchema.nullable()),
    };
  }
  const expression = {
    nextUtterance: field(object.data, "nextUtterance", z.string().min(1).max(400)
      .refine((value) => value.trim().length > 0, "nextUtterance must not be blank").nullable()),
    realizedManifestation: field(object.data, "realizedManifestation", z.string().max(240).nullable()),
  };
  if (phase === "aftermath") return { envelopeValid: true, phase, ...expression };
  return {
    envelopeValid: true, phase, ...expression,
    initialGoal: field(object.data, "initialGoal", ConsciousGoalV1Schema.nullable()),
    intent: field(object.data, "intent", ConsciousIntentV1Schema),
    nextAction: field(object.data, "nextAction", CharacterActionIntentSchema.nullable()),
  };
}

export type AgencyAcceptanceFailure =
  | "envelope_invalid"
  | "goal_invalid"
  | "goal_replacement"
  | "intent_invalid"
  | "action_invalid";

export type AgencyDecisionAcceptance = {
  state: ConsciousAgencyV1;
  acceptedDecision: boolean;
  failure: AgencyAcceptanceFailure | null;
};
const GOAL_FACT_KINDS: ReadonlySet<AgencyFactV1["kind"]> = new Set([
  "suggested_objective", "value", "relationship", "default_objective",
]);

function refsValid(
  refs: readonly string[],
  facts: readonly AgencyFactV1[],
  forGoal: boolean,
): boolean {
  return refs.every((ref) => facts.some((fact) =>
    fact.ref === ref && (!forGoal || GOAL_FACT_KINDS.has(fact.kind))
  ));
}

/**
 * Pure sole-writer calculation for V3 goal and accepted intent/action proposals.
 * Caller must persist with the battle's existing atomic revision CAS. This
 * does not commit speech, execute an action or establish model semantic quality.
 */
export function acceptConsciousDecisionV3(input: {
  previous: ConsciousAgencyV1;
  output: ConsciousOutputV3;
  facts: readonly AgencyFactV1[];
  turn: number;
  validateAction: (action: CharacterActionIntent) => CharacterActionIntent | null;
}): AgencyDecisionAcceptance {
  const previous = ConsciousAgencyV1Schema.parse(input.previous);
  const facts = AgencyFactsV1Schema.parse(input.facts);
  const turn = z.number().int().nonnegative().parse(input.turn);
  const output = input.output;
  if (!output.envelopeValid) {
    return { state: previous, acceptedDecision: false, failure: "envelope_invalid" };
  }
  if (output.phase === "aftermath") {
    return { state: previous, acceptedDecision: false, failure: null };
  }
  let upperGoal = previous.upperGoal;
  if (output.phase !== "later") {
    if (!output.initialGoal.valid) {
      return { state: previous, acceptedDecision: false, failure: "goal_invalid" };
    }
    if (upperGoal !== null && output.initialGoal.value !== null) {
      return { state: previous, acceptedDecision: false, failure: "goal_replacement" };
    }
    if (upperGoal === null) {
      const proposed = output.initialGoal.value;
      if (proposed === null || !refsValid(proposed.basisRefs, facts, true)) {
        return { state: previous, acceptedDecision: false, failure: "goal_invalid" };
      }
      upperGoal = proposed;
    }
  }
  if (upperGoal === null) {
    return { state: previous, acceptedDecision: false, failure: "goal_invalid" };
  }
  const state = { ...previous, upperGoal };
  if (!output.intent.valid || !refsValid(output.intent.value.basisRefs, facts, false)) {
    return { state, acceptedDecision: false, failure: "intent_invalid" };
  }
  if (!output.nextAction.valid || (output.phase === "later" && output.nextAction.value === null)) {
    return { state, acceptedDecision: false, failure: "action_invalid" };
  }
  const proposedAction = output.nextAction.value;
  const action = proposedAction === null ? null : input.validateAction(proposedAction);
  if (proposedAction !== null && action === null) {
    return { state, acceptedDecision: false, failure: "action_invalid" };
  }
  return {
    state: ConsciousAgencyV1Schema.parse({
      ...state,
      latestDecision: { intent: output.intent.value, action, turn, phase: output.phase },
    }),
    acceptedDecision: true,
    failure: null,
  };
}
