// R: Define receipt-scoped authoritative output for one awareness narration batch.
import { z } from "zod";
import { NarratorRecognitionUpdateSchema } from "./battle-social.js";

export const AwarenessNarrationReceiptOutputSchema = z.object({
  battleId: z.string().min(1).max(160), turnReceiptId: z.string().min(1).max(160),
  turn: z.number().int().nonnegative(), narrator: z.array(z.string().min(1)).min(2).max(4),
  speeches: z.array(z.object({ sourceSide: z.enum(["a", "b"]).nullable(),
    speaker: z.string().min(1), text: z.string().min(1), afterNarratorLine: z.number().int().min(-1).max(3),
  }).strict()), recognitionUpdates: z.array(NarratorRecognitionUpdateSchema),
}).strict();
export type AwarenessNarrationReceiptOutput = z.infer<typeof AwarenessNarrationReceiptOutputSchema>;
export const AwarenessNarrationBatchOutputSchema = z.object({ receipts: z.array(AwarenessNarrationReceiptOutputSchema).min(1).max(3) }).strict().refine((value) => new Set(value.receipts.map((receipt) => JSON.stringify([receipt.battleId, receipt.turnReceiptId]))).size === value.receipts.length, { path: ["receipts"], message: "Duplicate receipt identity" });
export type AwarenessNarrationBatchOutput = z.infer<typeof AwarenessNarrationBatchOutputSchema>;
