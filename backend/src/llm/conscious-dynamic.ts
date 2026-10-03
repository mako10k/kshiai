import { createHash } from "node:crypto";
import { ProviderJsonSyntaxError } from "./provider-json.js";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  CharacterAgentStateSchema, ConsciousGoalV1Schema, ConsciousIntentV2Schema, CharacterActionIntentSchema,
  decodeConsciousOutputV4, acceptConsciousDecisionV4,
  type ConsciousOutputV4, type ConsciousGenerationFieldV4, type CharacterActionIntent, type AgencyPhase,
} from "@kshiai/shared";
import type { CharacterExpressionCompactInputV4, CharacterActionDecisionContext, CharacterAgentAdvanceResult } from "./types.js";
import type { ChatOpts } from "./openai-compatible.js";

export type DynamicInput = Omit<CharacterExpressionCompactInputV4, "phase" | "turnObservation"> & {
  phase: AgencyPhase;
  turnObservation?: CharacterExpressionCompactInputV4["turnObservation"];
};
export type Field = ConsciousGenerationFieldV4;
export type GenerationPlan = {
  phase: AgencyPhase;
  fields: Field[];
  choices: { key: string; candidate: CharacterActionDecisionContext["availableActions"][number] }[];
  manifestations: DynamicInput["observableManifestations"];
  actionRepair?: { choice: GenerationPlan["choices"][number]; preserved: Record<string, unknown>; fields: string[] };
};
type Control = {
  targets?: readonly Field[];
  reserveRepair: () => Promise<boolean>;
  validateAction: (action: CharacterActionIntent) => string | null;
};
const controls = new WeakMap<object, Control>();
export function bindConsciousGenerationControl(input: object, control: Control): void {
  controls.set(input, control);
}
export function generationPlan(input: DynamicInput, targets?: readonly Field[]): GenerationPlan {
  const fields: Field[] = [];
  if (input.phase !== "aftermath") {
    if (input.agencyState.upperGoal === null) {
      if (input.phase === "later") throw new Error("BATTLE_CONTRACT_MISMATCH:later_without_goal");
      fields.push("initialGoal");
    }
    fields.push("intent", "nextAction");
  }
  if (input.phase !== "later") {
    fields.push("nextUtterance");
    if (input.observableManifestations.length) fields.push("realizedManifestation");
  }
  let selected = fields;
  if (targets) {
    if (targets.some((field) => !fields.includes(field))) throw new Error("BATTLE_CONTRACT_MISMATCH:target_outside_phase");
    const requested = new Set(targets);
    if (requested.has("intent") || requested.has("nextAction")) {
      requested.add("intent"); requested.add("nextAction");
      if (fields.includes("initialGoal")) requested.add("initialGoal");
    }
    selected = fields.filter((field) => requested.has(field));
  }
  return {
    phase: input.phase, fields: selected,
    choices: (input.decision?.availableActions ?? []).map((candidate, i) => ({ key: `choice-${i}`, candidate })),
    manifestations: input.observableManifestations,
  };
}
function candidateSchema(choice: GenerationPlan["choices"][number]) {
  const c = choice.candidate;
  const shape: Record<string, z.ZodType<unknown>> = { choiceKey: z.literal(choice.key) };
  if (c.kind === "free_action") Object.assign(shape, {
    description: z.string().min(1).max(600), desiredOutcome: z.string().min(1).max(400).nullable().optional(),
    subjectRefs: z.array(z.string().min(1).max(120)).min(1), opportunityId: z.string().nullable().optional(),
  });
  if (c.kind === "reflect") Object.assign(shape, {
    reflectionAnalysis: z.string().min(1).max(400), reflectionGuideline: z.string().min(1).max(400),
  });
  if (["skill", "basic_attack", "defend"].includes(c.kind)) shape.instrumentRef = z.string().nullable().optional();
  if (c.kind === "skill") shape.useFinisher = z.boolean().nullable().optional();
  return z.object(shape).strict();
}
export function generationSchema(plan: GenerationPlan) {
  const shape: Record<string, z.ZodType<unknown>> = {};
  const [first, second, ...rest] = plan.choices.map(candidateSchema);
  const action = !first ? z.null() : !second ? first : z.union([first, second, ...rest]);
  for (const field of plan.fields) {
    switch (field) {
      case "initialGoal": shape[field] = ConsciousGoalV1Schema; break;
      case "intent": shape[field] = plan.phase === "later" ? ConsciousIntentV2Schema : ConsciousIntentV2Schema.nullable().optional(); break;
      case "nextAction": {
        if (plan.actionRepair) {
          const base = candidateSchema(plan.actionRepair.choice).shape;
          shape[field] = z.object(Object.fromEntries(plan.actionRepair.fields.map((key) => [key, base[key]]))).strict();
        } else shape[field] = plan.phase === "later" ? action : action.nullable().optional();
        break;
      }
      case "nextUtterance": shape[field] = z.string().trim().min(1).max(400).nullable().optional(); break;
      case "realizedManifestation": {
        const keys = plan.manifestations.map((_, i) => `manifestation-${i}`);
        shape[field] = keys[0] ? z.enum([keys[0], ...keys.slice(1)]).nullable().optional() : z.null();
        break;
      }
    }
  }
  return z.object(shape).strict();
}
function closingSpeechPrompt(plan: GenerationPlan): string {
  if (plan.phase !== "aftermath" || !plan.fields.includes("nextUtterance")) return "";
  return "The battle has ended. Respond to its actual outcome and the last known exchange as this character; this is a closing reaction, not a new opening or another combat decision.\n";
}
export function generationPrompt(plan: GenerationPlan) {
  return `You are this character's conscious agency. Use only the supplied frozen self, known observations and legal choices. Intended influence is not an accomplished effect.\nReturn only these JSON fields: ${plan.fields.join(", ")}.\n${plan.fields.includes("initialGoal") ? "Derive the initial goal from personality, values, known relationship and situation. Select its grounding refs exactly from facts.ref, using only value, relationship, suggested_objective or default_objective facts.\n" : ""}${plan.fields.includes("intent") ? "Express the current aim briefly and select its grounding refs exactly from the supplied facts.ref values; never use a source path, kind or invented ref. No reasoning transcript or separate rationale.\n" : ""}${plan.fields.includes("nextAction") ? plan.actionRepair ? "The selected action and valid fields are fixed by the server. Return only the missing/invalid payload fields in nextAction.\n" : "Select a choiceKey exactly. Only free_action and reflect require new content; do not copy fixed skill IDs.\n" : ""}${plan.fields.includes("nextUtterance") ? "Choose one Japanese public utterance as this character, using structuredSelf.speech (register, cadence, vocabulary and examples), known relationship and the present observation. Speech is an action toward the aim: you may probe, provoke, reassure, encourage yourself or develop the ongoing exchange. Decide speech together with the action; selecting a combat action does not imply silence. When prior words received no answer, you may address that lack of response or change your approach using fresh evidence. Choose null when silence fits this character and the present moment; do not use null as a default to avoid expression. History records words already spoken, not examples to copy. Use utteranceHistory.latestCounterpartIndex to respond to the actual latest counterpart words and latestSelfIndex to carry your own preceding move forward. Let a new reply, request, changed stance or a present consequence develop that exchange. Do not restart the encounter or just paraphrase the same ambient observation on successive turns. If nothing calls for a further line, silence is available. Intentional repetition or ritual remains legal when this character has a present reason to hold that line; decide that meaning yourself. Do not expose private intent, refs or claim that the counterpart reacted.\n" : ""}${closingSpeechPrompt(plan)}${plan.phase === "later" ? "Choose a concrete action; no new speech or goal.\n" : ""}${plan.fields.includes("realizedManifestation") ? "Select an exact manifestation key or null.\n" : ""}Do not infer unknown counterpart attributes or claim execution success.`;
}
function restore(raw: unknown, plan: GenerationPlan): ConsciousOutputV4 {
  const parsed = z.record(z.unknown()).safeParse(raw);
  const wire = parsed.success ? parsed.data : {};
  const value: Record<string, unknown> = { ...wire };
  const errors: ConsciousOutputV4["errors"] = [];
  for (const key of Object.keys(wire)) {
    if (!plan.fields.some((field) => field === key)) {
      errors.push({ path: `/${key}`, code: "field_not_requested", allowed: plan.fields });
      delete value[key];
    }
  }
  if (wire.nextAction !== null && wire.nextAction !== undefined) {
    const selected = z.object({ choiceKey: z.string() }).passthrough().safeParse(wire.nextAction);
    const choice = selected.success ? plan.choices.find((c) => c.key === selected.data.choiceKey) : undefined;
    if (!choice) {
      value.nextAction = {};
      errors.push({ path: "/nextAction/choiceKey", code: "not_in_current_candidates", allowed: plan.choices.map((c) => c.key) });
    } else {
      const checked = candidateSchema(choice).safeParse(wire.nextAction);
      if (!checked.success) {
        const parameters = { ...selected.data };
        delete parameters.choiceKey;
        value.nextAction = { ...parameters, kind: choice.candidate.kind, ...(choice.candidate.kind === "skill" ? { skillId: choice.candidate.skillId } : {}) };
        for (const issue of checked.error.issues) errors.push({ path: `/nextAction/${issue.path.join("/")}`, code: issue.code,
          ...(issue.code === "invalid_type" ? { expected: issue.expected } : {}),
        });
      } else {
        const parameters = { ...checked.data };
        delete parameters.choiceKey;
        for (const key of Object.keys(parameters)) if (parameters[key] === null) delete parameters[key];
        value.nextAction = { ...parameters, kind: choice.candidate.kind, ...(choice.candidate.kind === "skill" ? { skillId: choice.candidate.skillId } : {}) };
      }
    }
  }
  if (wire.realizedManifestation !== null && wire.realizedManifestation !== undefined) {
    const found = plan.manifestations.find((_, i) => wire.realizedManifestation === `manifestation-${i}`);
    value.realizedManifestation = found?.proposal ?? {};
  }
  const output = decodeConsciousOutputV4(parsed.success ? value : raw, plan.phase);
  output.decisionRequested = plan.fields.includes("initialGoal") || plan.fields.includes("intent") || plan.fields.includes("nextAction");
  output.errors.push(...errors);
  return output;
}
function validate(output: ConsciousOutputV4, input: DynamicInput, control: Control | undefined) {
  const errors = [...output.errors];
  const accept = acceptConsciousDecisionV4({
    previous: input.agencyState, output, facts: input.facts, turn: input.turnObservation?.turn ?? input.decision?.nextTurn ?? 0,
    validateAction: (action) => {
      const reason = control?.validateAction(action);
      if (reason) errors.push({ path: "/nextAction", code: reason,
        ...(reason === "ungrounded_free_action"
          ? { allowed: (input.decision?.affordances ?? []).map((a) => a.ref) }
          : reason === "unavailable_instrument" ? { allowed: (input.decision?.affordances ?? []).filter((a) =>
            input.decision?.opportunityChains?.some((chain) => chain.setupTurns === 0 && chain.continuation.actionKind === action.kind && chain.continuation.instrumentRef === a.ref)
          ).map((a) => a.ref) } : {}),
      });
      return reason ? null : action;
    },
  });
  if (output.decisionRequested && input.agencyState.upperGoal === null && output.initialGoal.valid && output.initialGoal.value === null) errors.push({ path: "/initialGoal", code: "initial_goal_required", expected: "goal object: statement and grounding basisRefs" });
  if (accept.failure) errors.push({ path: ["goal_invalid", "goal_replacement"].includes(accept.failure) ? "/initialGoal" : accept.failure === "intent_invalid" ? "/intent" : "/nextAction", code: accept.failure });
  if (input.agencyState.upperGoal === null && output.initialGoal.valid && output.initialGoal.value &&
      !output.initialGoal.value.basisRefs.every((ref) => input.facts.some((f) => f.ref === ref && ["value", "relationship", "suggested_objective", "default_objective"].includes(f.kind)))) {
    errors.push({ path: "/initialGoal/basisRefs", code: "unknown_goal_ref", allowed: input.facts.filter((f) => ["value", "relationship", "suggested_objective", "default_objective"].includes(f.kind)).map((f) => f.ref) });
  }
  if (output.intent.valid && output.intent.value && !output.intent.value.basisRefs.every((ref) => input.facts.some((f) => f.ref === ref))) {
    errors.push({ path: "/intent/basisRefs", code: "unknown_intent_ref", allowed: input.facts.map((f) => f.ref) });
  }
  return errors;
}
function payloadRepair(plan: GenerationPlan, raw: unknown, output: ConsciousOutputV4, errors: ConsciousOutputV4["errors"]): GenerationPlan["actionRepair"] {
  if (!output.intent.valid || output.intent.value === null || errors.some((e) => e.path !== "/nextAction" && !e.path.startsWith("/nextAction/"))) return undefined;
  const root = z.record(z.unknown()).safeParse(raw);
  const wire = root.success ? z.record(z.unknown()).safeParse(root.data.nextAction) : null;
  if (!wire?.success) return undefined;
  const choice = plan.choices.find((c) => c.key === wire.data.choiceKey);
  if (!choice || (choice.candidate.kind !== "free_action" && choice.candidate.kind !== "reflect")) return undefined;
  const schema = candidateSchema(choice);
  if (schema.safeParse(wire.data).success) return undefined;
  const fields: string[] = [];
  const preserved: Record<string, unknown> = { choiceKey: choice.key };
  for (const [key, field] of Object.entries(schema.shape)) {
    if (key === "choiceKey") continue;
    const checked = field.safeParse(wire.data[key]);
    if (!checked.success) fields.push(key);
    else if (Object.hasOwn(wire.data, key)) preserved[key] = wire.data[key];
  }
  return fields.length ? { choice, preserved, fields } : undefined;
}

function factContent(input: DynamicInput, sourcePath: string): unknown {
  let value: unknown = input;
  for (const key of sourcePath.slice(1).split("/")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) return null;
    value = Reflect.get(value, key);
  }
  return value;
}

export function prepareSpeechHistory(input: DynamicInput["utteranceHistory"]) {
  let latestSelfIndex: number | null = null;
  let latestCounterpartIndex: number | null = null;
  input.recent.forEach((entry, index) => {
    if (entry.speaker === "self") latestSelfIndex = index;
    if (entry.speaker === "counterpart") latestCounterpartIndex = index;
  });
  return { recent: input.recent, latestSelfIndex, latestCounterpartIndex };
}

export async function runConsciousGeneration(input: DynamicInput, ownerInput: object, chat: (system: string, user: string, opts: ChatOpts) => Promise<unknown>): Promise<ConsciousOutputV4> {
  const control = controls.get(ownerInput);
  const plan = generationPlan(input, control?.targets);
  const request = {
    ...input, utteranceHistory: prepareSpeechHistory(input.utteranceHistory), facts: input.facts.map((fact) => ({ ref: fact.ref, kind: fact.kind, content: factContent(input, fact.sourcePath) })), goalPolicy: plan.fields.includes("initialGoal") ? input.goalPolicy : undefined,
    decision: input.decision ? { ...input.decision, availableActions: undefined } : undefined,
    choices: plan.choices, manifestations: plan.manifestations.map((m, i) => ({ key: `manifestation-${i}`, ...m })),
    observableManifestations: undefined,
  };
  const generationTrace: ConsciousOutputV4["generationTrace"] = { targets: plan.fields, repairTargets: [], calls: 0, schemaDigests: [] };
  const call = async (active: GenerationPlan, extra?: unknown) => {
    const generated = zodResponseFormat(generationSchema(active), "conscious_dynamic_v4");
    const schema = z.record(z.unknown()).parse(generated.json_schema.schema);
    generationTrace.calls++;
    generationTrace.schemaDigests.push(createHash("sha256").update(JSON.stringify(schema)).digest("hex"));
    try { return await chat(generationPrompt(active), JSON.stringify({ context: request, repair: extra }), {
    tier: "fast", label: extra ? "consciousDynamicRepair" : "consciousDynamic", temperature: 0.35,
    responseFormat: { type: "json_schema", json_schema: { name: "conscious_dynamic_v4", strict: true, schema } },
    }); } catch (error) {
      if (error instanceof ProviderJsonSyntaxError) return error.rejectedText;
      throw error;
    }
  };
  if (!plan.fields.length) return restore({}, plan);
  let raw = await call(plan);
  let output = restore(raw, plan);
  let errors = validate(output, input, control);
  if (errors.length && control && await control.reserveRepair()) {
    const fields = new Set<Field>();
    for (const error of errors) {
      const field = plan.fields.find((f) => error.path === `/${f}` || error.path.startsWith(`/${f}/`));
      if (!field || error.path === "/") plan.fields.forEach((f) => fields.add(f));
      else fields.add(field);
    }
    const actionRepair = payloadRepair(plan, raw, output, errors);
    if (!actionRepair && (fields.has("initialGoal") || fields.has("intent") || fields.has("nextAction"))) {
      if (plan.fields.includes("intent")) fields.add("intent");
      if (plan.fields.includes("nextAction")) fields.add("nextAction");
    }
    const repairPlan = { ...plan, fields: actionRepair ? ["nextAction" as const] : plan.fields.filter((f) => fields.has(f)), actionRepair };
    generationTrace.repairTargets = repairPlan.fields;
    const patch = await call(repairPlan, { previousResponse: raw, errors, repairFields: repairPlan.fields, fixedAction: actionRepair?.preserved, payloadFields: actionRepair?.fields, preserveFields: plan.fields.filter((f) => !fields.has(f)), instruction: "Return repair fields only. Select exact allowed keys. Preserve other values." });
    const previousObject = z.record(z.unknown()).safeParse(raw);
    const patchObject = z.record(z.unknown()).safeParse(patch);
    const merged: Record<string, unknown> = previousObject.success
      ? Object.fromEntries(plan.fields.filter((field) => Object.hasOwn(previousObject.data, field)).map((field) => [field, previousObject.data[field]])) : {};
    if (patchObject.success) for (const field of repairPlan.fields) {
      // A missing required repair remains unresolved; never retain its prior invalid value as success.
      if (Object.hasOwn(patchObject.data, field)) {
        if (field === "nextAction" && actionRepair) {
          const payload = z.record(z.unknown()).safeParse(patchObject.data[field]);
          if (payload.success) {
            const allowed = Object.fromEntries(actionRepair.fields.filter((key) => Object.hasOwn(payload.data, key)).map((key) => [key, payload.data[key]]));
            merged[field] = { ...actionRepair.preserved, ...allowed };
          }
        } else merged[field] = patchObject.data[field];
      }
    }
    output = restore(merged, plan);
    errors = validate(output, input, control);
    if (!patchObject.success) errors.push({ path: "/", code: "repair_object_required" });
    else {
      for (const key of Object.keys(patchObject.data)) if (!repairPlan.fields.some((f) => f === key)) errors.push({ path: `/${key}`, code: "repair_field_not_requested" });
      if (actionRepair) {
        const payload = z.record(z.unknown()).safeParse(patchObject.data.nextAction);
        if (payload.success) for (const key of Object.keys(payload.data)) if (!actionRepair.fields.includes(key)) errors.push({ path: `/nextAction/${key}`, code: "repair_field_not_requested" });
      }
    }
  }
  output.errors = errors;
  output.generationTrace = generationTrace;
  return output;
}
export function dynamicAgentResult(output: ConsciousOutputV4): Extract<CharacterAgentAdvanceResult, { contractVersion: 4 }> {
  return {
    contractVersion: 4, state: CharacterAgentStateSchema.parse({}), consciousOutput: output,
    nextUtterance: output.nextUtterance.valid ? output.nextUtterance.value : null,
    proposedAction: output.nextAction.valid ? output.nextAction.value : null,
    proposedActionStatus: output.nextAction.valid ? output.nextAction.value === null ? "omitted" : "valid" : "invalid",
    realizedManifestation: output.realizedManifestation.valid ? output.realizedManifestation.value : null,
  };
}
export function dynamicLaterInput(input: import("./types.js").CharacterActionDecisionInput): DynamicInput {
  const c = input.conscious;
  if (c?.contractVersion !== 4 || c.agencyState.schemaVersion !== 2 || !input.structuredSelf) throw new Error("BATTLE_CONTRACT_MISMATCH");
  return { contextMode: "compact", contractVersion: 4, phase: "later", character: input.character, structuredSelf: input.structuredSelf,
    agencyState: c.agencyState, facts: c.facts, reaction: c.reaction, goalPolicy: c.goalPolicy, utteranceHistory: c.utteranceHistory,
    observableManifestations: [], decision: input.decision };
}
