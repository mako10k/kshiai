import {
  PERCEPTION_PROMPT_FIXTURE_VERSION,
  PERCEPTION_PROMPT_FIXTURES,
  aggregatePerceptionPromptScores,
  recommendPerceptionPromptTopology,
  referenceCandidate,
  scorePerceptionPromptCandidate,
  type PerceptionPromptAggregate,
  type PerceptionPromptTopology,
} from "./perception-prompt-strategy.js";

export type ReviewedPerceptionTopologyDecision = {
  provider: string;
  providerRole: "primary" | "fallback" | "development";
  model: string;
  topology: PerceptionPromptTopology;
  fixtureVersion: string;
  reviewedAt: string;
  sampleCountPerTopology: number;
  combined: PerceptionPromptAggregate;
  split: PerceptionPromptAggregate;
  reason:
    | "combined_meets_quality_floor"
    | "combined_below_floor_split_meets_floor"
    | "documented_alias_to_exact_model";
  evidence: string;
};

export const PERCEPTION_PROVIDER_ROLES = {
  primary: "xai",
  fallback: "openai",
} as const;

const mockReferenceEvaluation = buildMockReferenceEvaluation();

/**
 * Runtime may use only an exact reviewed provider/model decision. A missing
 * entry is deliberately not guessed from provider family or a default model.
 */
export const REVIEWED_PERCEPTION_TOPOLOGIES:
  readonly ReviewedPerceptionTopologyDecision[] = [{
    provider: "mock",
    providerRole: "development",
    model: "mock-v1",
    topology: "combined",
    fixtureVersion: PERCEPTION_PROMPT_FIXTURE_VERSION,
    reviewedAt: "2026-08-04",
    sampleCountPerTopology: mockReferenceEvaluation.combined.sampleCount,
    combined: mockReferenceEvaluation.combined,
    split: mockReferenceEvaluation.split,
    reason: "combined_meets_quality_floor",
    evidence: "deterministic-reference-fixtures",
  }, {
    provider: "xai",
    providerRole: "primary",
    model: "grok-4-fast-non-reasoning",
    topology: "combined",
    fixtureVersion: "perception-prompts-v10",
    reviewedAt: "2026-08-04T09:59:07.656Z",
    sampleCountPerTopology: 9,
    combined: {
      fixtureVersion: "perception-prompts-v10",
      topology: "combined",
      sampleCount: 9,
      worldSchemaValidRate: 1,
      sensorySchemaValidRate: 1,
      worldPatchCorrectness: 1,
      sensoryCoverage: 1,
      attributionErrorRate: 0,
      identityLeakageRate: 0,
      meanLatencyMs: 3431.8888888888887,
      p95LatencyMs: 4750,
      measuredTokenSamples: 9,
      meanTotalTokens: 3928.1111111111113,
      totalTokens: 35353,
    },
    split: {
      fixtureVersion: "perception-prompts-v10",
      topology: "split",
      sampleCount: 9,
      worldSchemaValidRate: 1,
      sensorySchemaValidRate: 1,
      worldPatchCorrectness: 1,
      sensoryCoverage: 1,
      attributionErrorRate: 0,
      identityLeakageRate: 0,
      meanLatencyMs: 4040.3333333333335,
      p95LatencyMs: 5542,
      measuredTokenSamples: 9,
      meanTotalTokens: 5851.222222222223,
      totalTokens: 52661,
    },
    reason: "combined_meets_quality_floor",
    evidence: "docs/evidence/perception-xai-grok-4-fast-non-reasoning-v10.json sha256:739eb515c822abc5f9f720f12a2745f4774f42faaba8f0b235277b83540cd0e1",
  }, {
    provider: "xai",
    providerRole: "primary",
    model: "grok-4.3",
    topology: "combined",
    fixtureVersion: "perception-prompts-v10",
    reviewedAt: "2026-08-13",
    sampleCountPerTopology: 9,
    combined: {
      fixtureVersion: "perception-prompts-v10",
      topology: "combined",
      sampleCount: 9,
      worldSchemaValidRate: 1,
      sensorySchemaValidRate: 1,
      worldPatchCorrectness: 1,
      sensoryCoverage: 1,
      attributionErrorRate: 0,
      identityLeakageRate: 0,
      meanLatencyMs: 3431.8888888888887,
      p95LatencyMs: 4750,
      measuredTokenSamples: 9,
      meanTotalTokens: 3928.1111111111113,
      totalTokens: 35353,
    },
    split: {
      fixtureVersion: "perception-prompts-v10",
      topology: "split",
      sampleCount: 9,
      worldSchemaValidRate: 1,
      sensorySchemaValidRate: 1,
      worldPatchCorrectness: 1,
      sensoryCoverage: 1,
      attributionErrorRate: 0,
      identityLeakageRate: 0,
      meanLatencyMs: 4040.3333333333335,
      p95LatencyMs: 5542,
      measuredTokenSamples: 9,
      meanTotalTokens: 5851.222222222223,
      totalTokens: 52661,
    },
    reason: "documented_alias_to_exact_model",
    evidence: "docs/evidence/perception-xai-grok-4-fast-non-reasoning-v10.json sha256:739eb515c822abc5f9f720f12a2745f4774f42faaba8f0b235277b83540cd0e1; xAI May 15 retirement redirect; docs/evidence/character-focus-replay-2026-08-13/run-receipt.json responseModels=grok-4.3",
  }, {
    provider: "openai",
    providerRole: "fallback",
    model: "gpt-4.1-mini",
    topology: "combined",
    fixtureVersion: "perception-prompts-v8",
    reviewedAt: "2026-08-04T09:24:33.005Z",
    sampleCountPerTopology: 9,
    combined: {
      fixtureVersion: "perception-prompts-v8",
      topology: "combined",
      sampleCount: 9,
      worldSchemaValidRate: 1,
      sensorySchemaValidRate: 1,
      worldPatchCorrectness: 1,
      sensoryCoverage: 1,
      attributionErrorRate: 0,
      identityLeakageRate: 0,
      meanLatencyMs: 6112.888888888889,
      p95LatencyMs: 9403,
      measuredTokenSamples: 9,
      meanTotalTokens: 2351.222222222222,
      totalTokens: 21161,
    },
    split: {
      fixtureVersion: "perception-prompts-v8",
      topology: "split",
      sampleCount: 9,
      worldSchemaValidRate: 1,
      sensorySchemaValidRate: 0.8888888888888888,
      worldPatchCorrectness: 0.8888888888888888,
      sensoryCoverage: 0.8888888888888888,
      attributionErrorRate: 0,
      identityLeakageRate: 0,
      meanLatencyMs: 10565.777777777777,
      p95LatencyMs: 21423,
      measuredTokenSamples: 9,
      meanTotalTokens: 2983.1111111111113,
      totalTokens: 26848,
    },
    reason: "combined_meets_quality_floor",
    evidence: "docs/evidence/perception-openai-gpt-4.1-mini-v8.json sha256:c6212fb333ee44fced7cd6f6f6236495286d3c1df695b84e9f33516aa1decb05",
  }];

export function reviewedPerceptionTopology(
  provider: string,
  model: string,
): ReviewedPerceptionTopologyDecision | null {
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedModel = model.trim();
  return REVIEWED_PERCEPTION_TOPOLOGIES.find((decision) =>
    decision.provider === normalizedProvider &&
    decision.model === normalizedModel &&
    decision.fixtureVersion === PERCEPTION_PROMPT_FIXTURE_VERSION
  ) ?? null;
}

function buildMockReferenceEvaluation(): {
  combined: PerceptionPromptAggregate;
  split: PerceptionPromptAggregate;
} {
  const repetitions = 3;
  const scores = (topology: PerceptionPromptTopology) =>
    Array.from({ length: repetitions }, (_, repetition) =>
      PERCEPTION_PROMPT_FIXTURES.map((fixture, fixtureIndex) =>
        ({
          ...scorePerceptionPromptCandidate({
            fixture,
            candidate: referenceCandidate({
              fixture,
              topology,
              latencyMs: topology === "combined" ? 10 : 7,
              totalTokens: topology === "combined" ? 100 : 65,
            }),
          }),
          latencyMs: (topology === "combined" ? 10 : 14) +
            repetition + fixtureIndex,
        })
      )
    ).flat();
  const combined = aggregatePerceptionPromptScores(scores("combined"));
  const split = aggregatePerceptionPromptScores(scores("split"));
  const recommendation = recommendPerceptionPromptTopology({ combined, split });
  if (
    recommendation.topology !== "combined" ||
    recommendation.reason !== "combined_meets_quality_floor"
  ) {
    throw new Error("mock perception topology reference no longer qualifies");
  }
  return { combined, split };
}
