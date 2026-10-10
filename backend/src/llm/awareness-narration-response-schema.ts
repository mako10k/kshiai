// R: Derive frozen narration runtime validation and provider grammar from the same phase receipt shapes.
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { AwarenessNarrationReceiptOutputSchema, type AwarenessFrozenNarration } from "@kshiai/shared";
import { assertXaiResponseSchema } from "./provider-response-schema.js";
const identity = {
  battleId: z.string().min(1), turnReceiptId: z.string().min(1), turn: z.number().int().nonnegative(),
};
const speechShape = {
  speeches: z.array(AwarenessNarrationReceiptOutputSchema.shape.speeches.element.extend({ afterNarratorLine: z.number().int().min(-1).max(9) }).strict()),
  recognitionUpdates: AwarenessNarrationReceiptOutputSchema.shape.recognitionUpdates,
};
const framing = { before: z.array(z.string().min(1)).max(3), after: z.array(z.string().min(1)).max(3) };
export const AwarenessFrozenReceiptSchemas = {
  combat: z.object({ ...identity, phase: z.literal("combat"), narrator: AwarenessNarrationReceiptOutputSchema.shape.narrator, ...speechShape }).strict(),
  prologue: z.object({ ...identity, phase: z.literal("prologue"), narrator: z.array(z.string().min(1)).min(4).max(8), ...speechShape }).strict(),
  aftermath: z.object({ ...identity, phase: z.literal("aftermath"), ...framing, ...speechShape }).strict(),
  judgment: z.object({ ...identity, phase: z.literal("judgment"), before: framing.before.max(2), after: framing.after.max(2) }).strict(),
};

export function awarenessFrozenNarrationBatchSchema(phase: AwarenessFrozenNarration["phase"], count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 3 || (phase !== "combat" && count !== 1)) throw new Error("AWARENESS_FROZEN_NARRATION_BATCH_INVALID");
  return z.object({ receipts: z.array(AwarenessFrozenReceiptSchemas[phase]).length(count) }).strict();
}

function committedSpeechSchema(material: AwarenessFrozenNarration) {
  const speech = speechShape.speeches.element;
  const thirdParty = speech.extend({ sourceSide: z.null() }).strict();
  const sideSchema = (side: "a" | "b") => {
    const [first, ...rest] = [...new Set(material.sourceSpeeches.filter((item) => item.side === side).map((item) => item.text))];
    return first === undefined ? null : speech.extend({ sourceSide: z.literal(side), text: z.enum([first, ...rest]) }).strict();
  };
  const a = sideSchema("a");
  const b = sideSchema("b");
  if (a && b) return z.union([thirdParty, a, b]);
  if (a) return z.union([thirdParty, a]);
  if (b) return z.union([thirdParty, b]);
  return thirdParty;
}

/** Narrow provider grammar to immutable sources; runtime coverage/placement validation still applies. */
export function awarenessFrozenNarrationSourceSchema(materials: readonly AwarenessFrozenNarration[]) {
  const [firstMaterial] = materials;
  if (!firstMaterial) throw new Error("AWARENESS_FROZEN_NARRATION_BATCH_INVALID");
  awarenessFrozenNarrationBatchSchema(firstMaterial.phase, materials.length);
  if (materials.some((item) => item.phase !== firstMaterial.phase || item.battleId !== firstMaterial.battleId) ||
      new Set(materials.map((item) => item.turnReceiptId)).size !== materials.length) throw new Error("AWARENESS_FROZEN_NARRATION_BATCH_INVALID");
  const [first, second, third] = materials.map((material) => {
    const identity = { battleId: z.literal(material.battleId), turnReceiptId: z.literal(material.turnReceiptId), turn: z.literal(material.turn) };
    if (material.phase === "judgment") return AwarenessFrozenReceiptSchemas.judgment.extend(identity);
    return AwarenessFrozenReceiptSchemas[material.phase].extend({ ...identity, speeches: z.array(committedSpeechSchema(material)) });
  });
  if (!first) throw new Error("AWARENESS_FROZEN_NARRATION_BATCH_INVALID");
  const receipt = second ? third ? z.union([first, second, third]) : z.union([first, second]) : first;
  return z.object({ receipts: z.array(receipt).length(materials.length) }).strict();
}

export function awarenessFrozenNarrationResponseFormat(phase: AwarenessFrozenNarration["phase"], count: number, materials?: readonly AwarenessFrozenNarration[]) {
  if (materials && (materials.length !== count || materials.some((item) => item.phase !== phase))) throw new Error("AWARENESS_FROZEN_NARRATION_BATCH_INVALID");
  const format = zodResponseFormat(materials ? awarenessFrozenNarrationSourceSchema(materials) : awarenessFrozenNarrationBatchSchema(phase, count), "awareness_narration_receipts");
  assertXaiResponseSchema(format.json_schema.schema);
  const schema = format.json_schema.schema;
  if (!schema || format.json_schema.strict !== true) throw new Error("AWARENESS_NARRATION_RESPONSE_SCHEMA_INVALID");
  return { type: "json_schema" as const, json_schema: { name: format.json_schema.name, strict: true as const, schema } };
}
