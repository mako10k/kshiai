// R: Define the immutable awareness narration source stored in authoritative battle receipts.
import { z } from "zod";
import { BattleNarratorContinuitySchema } from "./battle-social.js";
import { AwarenessPromptRevisionSchema } from "./awareness-prompt-revision.js";

export const AwarenessFrozenNarrationSchema = z.object({
  kind: z.literal("awareness-v5"), phase: z.enum(["combat", "prologue", "aftermath", "judgment"]),
  battleId: z.string().min(1).max(160), turnReceiptId: z.string().min(1).max(160), turn: z.number().int().nonnegative(),
  system: z.string().min(1), user: z.string().min(1), urgent: z.boolean(),
  promptRevision: AwarenessPromptRevisionSchema.optional(),
  sourceSpeeches: z.array(z.object({ side: z.enum(["a", "b"]), text: z.string().min(1) }).strict()),
  recognitionTarget: z.enum(["reader", "a", "b"]).default("reader"),
  initialNarratorContinuity: BattleNarratorContinuitySchema.optional(),
  recognitionRefs: z.array(z.string().min(1).max(160)), judgmentVerdict: z.string().min(1).nullable(),
}).strict().refine((value) => value.phase === "judgment" ? value.judgmentVerdict !== null : value.judgmentVerdict === null, { path: ["judgmentVerdict"], message: "Verdict belongs only to judgment" }).refine((value) => value.phase !== "judgment" || (value.sourceSpeeches.length === 0 && value.recognitionRefs.length === 0), { message: "Judgment has no speech or recognition source" }).refine((value) => value.phase !== "prologue" || value.turn === 0, { path: ["turn"], message: "Prologue belongs to turn zero" });
export type AwarenessFrozenNarration = z.infer<typeof AwarenessFrozenNarrationSchema>;
