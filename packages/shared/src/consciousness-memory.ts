// R: Keep five ranked natural-language memories without interpreting their meaning.
import { z } from "zod";

export const consciousnessText = (maximum: number) => z.string().refine(
  (value) => Array.from(value).length >= 1 && Array.from(value).length <= maximum,
  { message: `Text must contain 1-${maximum} Unicode code points` },
);
export const ConsciousnessMemoryEntrySchema = z.object({
  id: z.string().min(1).max(240), text: consciousnessText(400),
}).strict();
export const ConsciousnessMemorySchema = z.array(ConsciousnessMemoryEntrySchema).max(5).superRefine((items, context) => {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    context.addIssue({ code: "custom", message: "Memory IDs must be unique" });
  }
});
export const ConsciousnessMemoryOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("insert"), priority: z.number().int().min(1).max(5), text: consciousnessText(400) }).strict(),
  z.object({ kind: z.literal("remove"), id: z.string().min(1).max(240) }).strict(),
]);
export const ConsciousnessMemoryOperationsSchema = z.array(ConsciousnessMemoryOperationSchema).max(10);
export type ConsciousnessMemory = z.infer<typeof ConsciousnessMemorySchema>;
export type ConsciousnessMemoryOperation = z.infer<typeof ConsciousnessMemoryOperationSchema>;

/** Work on a copy so every invalid operation rejects the whole proposed update. */
export function applyConsciousnessMemory(
  memory: ConsciousnessMemory, operations: readonly ConsciousnessMemoryOperation[], decisionId: string,
): ConsciousnessMemory {
  if (!decisionId || decisionId.length > 220) throw new Error("CONSCIOUSNESS_DECISION_ID_INVALID");
  const next = ConsciousnessMemorySchema.parse(memory);
  const checked = ConsciousnessMemoryOperationsSchema.parse(operations);
  for (const [index, operation] of checked.entries()) {
    if (operation.kind === "insert") {
      const id = `${decisionId}:m${index}`;
      if (next.some((entry) => entry.id === id)) throw new Error("CONSCIOUSNESS_MEMORY_ALREADY_APPLIED");
      next.splice(Math.min(operation.priority - 1, next.length), 0, { id, text: operation.text });
      next.splice(5);
    } else {
      const position = next.findIndex((entry) => entry.id === operation.id);
      if (position < 0) throw new Error("CONSCIOUSNESS_MEMORY_ID_UNKNOWN");
      next.splice(position, 1);
    }
  }
  return ConsciousnessMemorySchema.parse(next);
}
