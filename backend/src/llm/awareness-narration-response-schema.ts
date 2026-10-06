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
export function awarenessFrozenNarrationResponseFormat(phase: AwarenessFrozenNarration["phase"], count: number) {
  const format = zodResponseFormat(awarenessFrozenNarrationBatchSchema(phase, count), "awareness_narration_receipts");
  assertXaiResponseSchema(format.json_schema.schema);
  const schema = format.json_schema.schema;
  if (!schema || format.json_schema.strict !== true) throw new Error("AWARENESS_NARRATION_RESPONSE_SCHEMA_INVALID");
  return { type: "json_schema" as const, json_schema: { name: format.json_schema.name, strict: true as const, schema } };
}
