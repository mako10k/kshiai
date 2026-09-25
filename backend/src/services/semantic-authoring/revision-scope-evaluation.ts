import { z } from "zod";

export const CharacterRevisionScopeClusterV1Schema = z.enum([
  "skeleton",
  "mechanics",
  "relationship-expression",
  "appearance",
]);
export type CharacterRevisionScopeClusterV1 = z.infer<
  typeof CharacterRevisionScopeClusterV1Schema
>;

const uniqueClusters = z.array(CharacterRevisionScopeClusterV1Schema)
  .min(1)
  .max(4)
  .superRefine((clusters, context) => {
    if (new Set(clusters).size !== clusters.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "clusters must be unique",
      });
    }
  });

const scopeEvidenceSchema = z.object({
  sourceQuote: z.string().trim().min(1).max(400),
  clusters: uniqueClusters,
}).strict();

const resolvedScopeSchema = z.object({
  kind: z.literal("resolved"),
  clusters: uniqueClusters,
  evidence: z.array(scopeEvidenceSchema).min(1).max(8),
}).strict().superRefine((value, context) => {
  const evidenced = new Set(value.evidence.flatMap((item) => item.clusters));
  for (const cluster of value.clusters) {
    if (!evidenced.has(cluster)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `resolved cluster lacks evidence: ${cluster}`,
      });
    }
  }
  for (const cluster of evidenced) {
    if (!value.clusters.includes(cluster)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `evidence exceeds resolved scope: ${cluster}`,
      });
    }
  }
});

const ambiguousAlternativeSchema = z.object({
  id: z.string().min(1).max(80),
  clusters: uniqueClusters,
  effect: z.string().min(1).max(400),
}).strict();

const ambiguousScopeSchema = z.object({
  kind: z.literal("ambiguous"),
  sourceQuote: z.string().trim().min(1).max(400),
  unsafeReason: z.string().min(1).max(400),
  alternatives: z.array(ambiguousAlternativeSchema).min(2).max(6),
}).strict().superRefine((value, context) => {
  const ids = value.alternatives.map((alternative) => alternative.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "alternative ids must be unique",
    });
  }
  const scopes = value.alternatives.map((alternative) =>
    [...alternative.clusters].sort().join("\u0000"),
  );
  if (new Set(scopes).size !== scopes.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "alternatives must have materially different scopes",
    });
  }
});

export const CharacterRevisionScopeCandidateV1Schema = z.union([
  resolvedScopeSchema,
  ambiguousScopeSchema,
]);
export type CharacterRevisionScopeCandidateV1 = z.infer<
  typeof CharacterRevisionScopeCandidateV1Schema
>;

const resolvedExpectationSchema = z.object({
  kind: z.literal("resolved"),
  clusters: uniqueClusters,
}).strict();

const ambiguousExpectationSchema = z.object({
  kind: z.literal("ambiguous"),
  alternativeScopes: z.array(uniqueClusters).min(2).max(6),
}).strict().superRefine((value, context) => {
  const scopes = value.alternativeScopes.map(scopeKey);
  if (new Set(scopes).size !== scopes.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "expected alternative scopes must be unique",
    });
  }
});

export const CharacterRevisionScopeExpectationV1Schema = z.union([
  resolvedExpectationSchema,
  ambiguousExpectationSchema,
]);
export type CharacterRevisionScopeExpectationV1 = z.infer<
  typeof CharacterRevisionScopeExpectationV1Schema
>;

export type CharacterRevisionScopeEvaluationV1 = Readonly<
  | {
      outcome: "single_cluster" | "cross_cluster";
      clusters: readonly CharacterRevisionScopeClusterV1[];
    }
  | {
      outcome: "ambiguous";
      alternativeScopes: readonly (readonly CharacterRevisionScopeClusterV1[])[];
    }
  | {
      outcome: "over_broad";
      clusters: readonly CharacterRevisionScopeClusterV1[];
      unexpectedClusters: readonly CharacterRevisionScopeClusterV1[];
    }
  | {
      outcome: "invalid";
      reason:
        | "schema"
        | "ungrounded_source_quote"
        | "missing_expected_cluster"
        | "expected_ambiguity"
        | "unexpected_ambiguity"
        | "ambiguous_alternatives_mismatch";
      missingClusters?: readonly CharacterRevisionScopeClusterV1[];
    }
>;

function scopeKey(clusters: readonly CharacterRevisionScopeClusterV1[]): string {
  return [...clusters].sort().join("\u0000");
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalizedGroundingText(value: string): string {
  return normalizedText(value).replace(/[「」『』]/g, "");
}

function sourceQuoteIsGrounded(request: string, sourceQuote: string): boolean {
  const normalizedRequest = normalizedGroundingText(request);
  const normalizedQuote = normalizedGroundingText(sourceQuote);
  return normalizedQuote.length > 0 && normalizedRequest.includes(normalizedQuote);
}

/**
 * Evaluation-only boundary. It does not authorize work, persist a resolution, or
 * select the public revision route. expectedClusters are trusted corpus labels.
 */
export function evaluateCharacterRevisionScopeCandidateV1(input: Readonly<{
  request: string;
  candidate: unknown;
  expectation: CharacterRevisionScopeExpectationV1;
}>): CharacterRevisionScopeEvaluationV1 {
  const parsedCandidate = CharacterRevisionScopeCandidateV1Schema.safeParse(input.candidate);
  if (!parsedCandidate.success) {
    return { outcome: "invalid", reason: "schema" };
  }
  const expectation = CharacterRevisionScopeExpectationV1Schema.parse(input.expectation);

  const candidate = parsedCandidate.data;
  const sourceQuotes = candidate.kind === "resolved"
    ? candidate.evidence.map((item) => item.sourceQuote)
    : [candidate.sourceQuote];
  if (sourceQuotes.some((quote) => !sourceQuoteIsGrounded(input.request, quote))) {
    return { outcome: "invalid", reason: "ungrounded_source_quote" };
  }

  if (candidate.kind === "ambiguous") {
    if (expectation.kind !== "ambiguous") {
      return { outcome: "invalid", reason: "unexpected_ambiguity" };
    }
    const expectedScopes = new Set(expectation.alternativeScopes.map(scopeKey));
    const actualScopes = new Set(candidate.alternatives.map((alternative) => scopeKey(alternative.clusters)));
    if (expectedScopes.size !== actualScopes.size ||
        [...expectedScopes].some((scope) => !actualScopes.has(scope))) {
      return { outcome: "invalid", reason: "ambiguous_alternatives_mismatch" };
    }
    return {
      outcome: "ambiguous",
      alternativeScopes: candidate.alternatives.map((alternative) => alternative.clusters),
    };
  }

  if (expectation.kind !== "resolved") {
    return { outcome: "invalid", reason: "expected_ambiguity" };
  }

  const expectedClusters = new Set(expectation.clusters);
  const unexpectedClusters = candidate.clusters.filter((cluster) => !expectedClusters.has(cluster));
  if (unexpectedClusters.length > 0) {
    return {
      outcome: "over_broad",
      clusters: candidate.clusters,
      unexpectedClusters,
    };
  }

  const actualClusters = new Set(candidate.clusters);
  const missingClusters = expectation.clusters.filter((cluster) => !actualClusters.has(cluster));
  if (missingClusters.length > 0) {
    return {
      outcome: "invalid",
      reason: "missing_expected_cluster",
      missingClusters,
    };
  }

  return {
    outcome: candidate.clusters.length === 1 ? "single_cluster" : "cross_cluster",
    clusters: candidate.clusters,
  };
}
