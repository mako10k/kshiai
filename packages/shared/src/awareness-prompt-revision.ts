// R: Define immutable supported prompt identities shared by battle and narration bindings.
import { z } from "zod";

export const AwarenessPromptRevisionSchema = z.enum([
  "awareness-prompt-v1",
  "awareness-prompt-v2",
  "awareness-prompt-v3",
]);
export type AwarenessPromptRevision = z.infer<typeof AwarenessPromptRevisionSchema>;

/** Effective execution identity until normal completion evidence authorizes freezing. */
export const CurrentAwarenessPromptRevision = "awareness-prompt-v3" satisfies AwarenessPromptRevision;
