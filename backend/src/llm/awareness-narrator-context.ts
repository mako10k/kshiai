// R: Define the permitted narrator cognition and already-published history bound to one dispatch.
import { z } from "zod";
import { NarratorContinuityViewSchema, NarrativeBlockSchema } from "@kshiai/shared";
export const AwarenessNarratorDispatchContextSchema = z.object({
  target: z.enum(["reader", "a", "b"]),
  continuity: NarratorContinuityViewSchema.nullable(),
  published: z.array(z.object({ battleId: z.string().min(1), turnReceiptId: z.string().min(1),
    sequence: z.number().int().positive(), narrative: NarrativeBlockSchema }).strict()).max(4),
}).strict().superRefine((value, context) => {
  if (value.continuity?.perspectives.some((view) => value.target === "reader" || view.viewpointSide !== value.target)) {
    context.addIssue({ code: "custom", path: ["continuity"], message: "Narrator perspective exceeds dispatch access" });
  }
});
export type AwarenessNarratorDispatchContext = z.infer<typeof AwarenessNarratorDispatchContextSchema>;
