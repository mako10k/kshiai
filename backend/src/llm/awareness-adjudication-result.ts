// R: Decode adjudication wire results without inventing replacement canonical facts.
import { z } from "zod";
import { BattleAdjudicationSchema, PerceptionEvidenceSetSchema, TurnSemanticPatchSchema } from "@kshiai/shared";
import type { LlmProvider, RefereeResult } from "./types.js";

const refereeSchema = BattleAdjudicationSchema.pick({ winnerSide: true, reason: true, reasonFacts: true }).strict();
const semanticSchema = z.object({
  patch: TurnSemanticPatchSchema.pick({ operations: true }).strict(),
  nextSituation: z.object({ notes: z.string().max(1000), tags: z.array(z.string().max(120)).max(16),
    coefficients: z.record(z.number().min(0.25).max(2.5)) }).strict().nullable(),
  environmentDecision: z.object({ status: z.enum(["accepted", "rejected"]), reason: z.string().trim().min(1).max(240) }).strict().nullable(),
  sensoryEvidence: PerceptionEvidenceSetSchema.optional(),
}).strict();
export function decodeAwarenessRefereeResult(raw: unknown): RefereeResult {
  return refereeSchema.parse(raw);
}
export function decodeAwarenessSemanticResult(raw: unknown, input: Parameters<LlmProvider["reconcileTurnSemanticState"]>[0], combined: boolean): Awaited<ReturnType<LlmProvider["reconcileTurnSemanticState"]>> {
  const parsed = semanticSchema.parse(raw);
  if (combined && parsed.sensoryEvidence === undefined) throw new Error("AWARENESS_SENSORY_EVIDENCE_REQUIRED");
  if (!combined && parsed.sensoryEvidence !== undefined) throw new Error("AWARENESS_UNEXPECTED_SENSORY_EVIDENCE");
  if (Boolean(input.environmentProposal) !== (parsed.environmentDecision !== null)) throw new Error("AWARENESS_ENVIRONMENT_DECISION_SCOPE");
  return { patch: TurnSemanticPatchSchema.parse({ ...parsed.patch, baseRevision: input.before.revision, turn: input.turn,
    sourceEventIds: [...input.events.flatMap((event) => event.id ? [event.id] : []), ...(input.environmentProposal ? [input.environmentProposal.id] : [])] }),
    worldPatchStatus: "valid", nextSituation: parsed.nextSituation ?? undefined, environmentDecision: parsed.environmentDecision,
    sensoryEvidence: parsed.sensoryEvidence ?? [], sensoryEvidenceStatus: combined ? "valid" : "unavailable" };
}
export const AwarenessHappeningResultSchema = z.object({
  title: z.string().trim().min(1).max(16), summary: z.string().trim().min(1).max(80),
  notes: z.string().trim().min(1).max(80), tags: z.array(z.string()).max(6).optional(),
}).strict();
