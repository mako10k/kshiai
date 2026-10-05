// R: Validate the fixed trial candidate identity and model routes before isolated execution.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { CharacterDefinitionV3Schema, CharacterSheetSchema } from "@kshiai/shared";

export const FIXED_TRIAL_DIGEST = "a1e4a95291289f9a6cf5d2fb77120bd362c75b58d223845c1b8f3212e5b1ac7c";
const CandidateSchema = z.object({
  candidateId: z.literal("awareness-real-trial-2026-10-05"),
  preparationOnly: z.literal(true),
  versions: z.object({ characterDefinition: z.literal(3), battleBindingFormat: z.literal(5), consciousnessPipeline: z.literal("awareness-v5") }).strict(),
  policyRevision: z.literal("awareness-v5-usage-v1"),
  scenario: z.object({ combatTicks: z.literal(3), setting: z.string(), stop: z.string() }).strict(),
  characters: z.array(z.object({ sheet: CharacterSheetSchema, definition: CharacterDefinitionV3Schema }).strict()).length(2),
}).strict();
const ConfigurationSchema = z.object({
  openaiKeyPresent: z.boolean(), xaiKeyPresent: z.boolean(),
  subconscious: z.object({ provider: z.literal("openai"), model: z.literal("gpt-6-luna"), reasoning: z.literal("none") }).strict(),
  conscious: z.object({ provider: z.literal("xai"), model: z.literal("grok-4.5") }).strict(),
  adjudication: z.object({ provider: z.literal("xai"), model: z.literal("grok-4.5") }).strict(),
  narration: z.object({ provider: z.literal("xai"), model: z.literal("grok-4.3") }).strict(),
  endpoints: z.tuple([z.literal("https://api.openai.com/v1"), z.literal("https://api.x.ai/v1")]),
  remoteModelAvailability: z.literal("unverified"),
}).strict();
const DocumentSchema = z.object({ candidate: CandidateSchema, candidateSha256: z.literal(FIXED_TRIAL_DIGEST), configuration: ConfigurationSchema }).strict();
export type AwarenessTrialCandidate = z.infer<typeof CandidateSchema>;

export function readAwarenessTrialCandidate(path: string): z.infer<typeof DocumentSchema> {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  // Verify original bytes represented by the compact object before defaults/schema transformations.
  const envelope = z.object({ candidate: z.unknown(), candidateSha256: z.string() }).passthrough().parse(raw);
  const digest = createHash("sha256").update(JSON.stringify(envelope.candidate)).digest("hex");
  if (digest !== FIXED_TRIAL_DIGEST || digest !== envelope.candidateSha256) throw new Error("TRIAL_CANDIDATE_DIGEST_MISMATCH");
  return DocumentSchema.parse(raw);
}
