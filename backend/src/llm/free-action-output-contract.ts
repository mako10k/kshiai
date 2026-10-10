// R: Explain the existing strict adjudication schema without rewriting rejected model results.
import { FreeActionAdjudicationBatchSchema } from "@kshiai/shared";
import type { ZodError } from "zod";
import type { LlmProvider } from "./types.js";

export function freeActionContractClarification(input: Parameters<LlmProvider["adjudicateFreeActions"]>[0]): string {
  const example = FreeActionAdjudicationBatchSchema.parse({
    proposals: input.intents.map(({ actorSide }) => ({
      actorSide,
      outcome: "possible",
      interpretation: "A grounded ordinary movement is attempted.",
      changes: [],
      penalty: null,
      successSummary: "The movement is attempted.",
      failureSummary: "The desired effect is not achieved.",
    })),
  });
  return [
    "Strict wire contract: all objects reject extra keys. Return the complete proposals envelope, never one bare proposal. Exactly one proposal per supplied actorSide; no missing or duplicate side.",
    "subject is optional: omit the key when absent; subject:null is invalid. canonicalLabel inside a present subject is nullable. changes must be an array, never null. penalty may be null; when the bound effort policy requires it, include penalty explicitly.",
    "Nonempty string limits: interpretation/successSummary/failureSummary 1..400 characters; subject.rootRef/canonicalLabel 1..120; candidateKey 1..80; subject.description 1..600; knownOpenAspects at most8 nonempty strings of at most80 characters. changes at most8; path nonempty and at most120 characters. Keep every sentence concise.",
    "A penalty object has only kind, baseWorldRevision, level, reason and actionQuote for extra_stamina or defense_exposure. Do not add numeric stamina/percent/cost/amount fields. reason 1..240, exact actionQuote 1..400; level light|substantial|extreme. execution_limit additionally requires execution, executedDescription (at most400) and appliedChangeIndexes (at most8 integers0..7). Do not emit placeholder enum alternatives, undefined values, explanatory keys or markdown.",
    `Complete response structure example: ${JSON.stringify(example)}. This illustrates shape only: independently adjudicate outcomes, grounded effects and penalties from actual input; do not copy these example judgments.`,
  ].join("\n");
}

const diagnosticFields = new Set(["proposals", "actorSide", "outcome", "interpretation", "subject", "rootRef", "candidateKey", "canonicalLabel", "description", "portable", "usable", "knownOpenAspects", "causalEnvelope", "damage", "defense", "reach", "control", "mobility", "vision", "hearing", "cover", "changes", "target", "path", "value", "successSummary", "failureSummary", "penalty", "kind", "baseWorldRevision", "level", "reason", "actionQuote", "execution", "executedDescription", "appliedChangeIndexes"]);

/** Values, messages and unrecognized key names can contain private model text. */
export function freeActionSchemaDiagnostics(error: ZodError) {
  return error.issues.slice(0, 12).map((issue) => ({
    code: issue.code,
    path: issue.path.slice(0, 8).map((segment) =>
      typeof segment === "number" ? segment : diagnosticFields.has(segment) ? segment : "$other",
    ),
  }));
}
