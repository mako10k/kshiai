import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BattleSemanticStateSchema,
  PerceptionEvidenceSetSchema,
} from "@kshiai/shared";
import {
  COMBINED_PERCEPTION_SYSTEM_PROMPT,
  PERCEPTION_PROMPT_FIXTURES,
  SENSORY_EVIDENCE_SYSTEM_PROMPT,
  WORLD_RECONCILIATION_SYSTEM_PROMPT,
  aggregatePerceptionPromptScores,
  promptUserPayload,
  recommendPerceptionPromptTopology,
  referenceCandidate,
  scorePerceptionPromptCandidate,
  worldPromptUserPayload,
  type PerceptionPromptAggregate,
} from "./perception-prompt-strategy.js";
import {
  REVIEWED_PERCEPTION_TOPOLOGIES,
  reviewedPerceptionTopology,
} from "./perception-topology.js";
import { evaluatePerceptionPromptTopologies } from "./perception-prompt-runner.js";

describe("perception prompt strategy", () => {
  it("keeps all fixed fixtures inside canonical and sensory contracts", () => {
    assert.equal(PERCEPTION_PROMPT_FIXTURES.length, 3);
    for (const fixture of PERCEPTION_PROMPT_FIXTURES) {
      assert.equal(BattleSemanticStateSchema.safeParse(fixture.input.before).success, true);
      assert.equal(
        PerceptionEvidenceSetSchema.safeParse(fixture.expectedSensoryEvidence).success,
        true,
      );
    }
  });

  it("keeps world and sensory responsibilities independently stated", () => {
    assert.match(WORLD_RECONCILIATION_SYSTEM_PROMPT, /observable semantic-state/);
    assert.doesNotMatch(WORLD_RECONCILIATION_SYSTEM_PROMPT, /sensoryEvidence/);
    assert.match(SENSORY_EVIDENCE_SYSTEM_PROMPT, /sensoryEvidence/);
    assert.doesNotMatch(SENSORY_EVIDENCE_SYSTEM_PROMPT, /parameterClassReference/);
    assert.match(COMBINED_PERCEPTION_SYSTEM_PROMPT, /separate validity/);
    assert.match(COMBINED_PERCEPTION_SYSTEM_PROMPT, /sensoryEvidence/);
    const fixtureInput = PERCEPTION_PROMPT_FIXTURES[0]!.input;
    assert.match(promptUserPayload(fixtureInput), /mechanicalEvidence/);
    assert.doesNotMatch(worldPromptUserPayload(fixtureInput), /mechanicalEvidence/);
  });

  it("scores deterministic reference outputs perfectly for both topologies", () => {
    for (const topology of ["combined", "split"] as const) {
      for (const fixture of PERCEPTION_PROMPT_FIXTURES) {
        const score = scorePerceptionPromptCandidate({
          fixture,
          candidate: referenceCandidate({ fixture, topology }),
        });
        assert.equal(score.worldSchemaValid, true);
        assert.equal(score.sensorySchemaValid, true);
        assert.equal(score.worldPatchCorrectness, 1);
        assert.equal(score.sensoryCoverage, 1);
        assert.equal(score.attributionErrors, 0);
        assert.equal(score.identityLeakages, 0);
        assert.equal(score.totalTokens, topology === "combined" ? 100 : 200);
      }
    }
  });

  it("does not invalidate a valid combined world patch when sensory JSON fails", () => {
    const fixture = PERCEPTION_PROMPT_FIXTURES[2]!;
    const candidate = referenceCandidate({ fixture, topology: "combined" });
    candidate.rawWorldResponse = {
      ...(candidate.rawWorldResponse as Record<string, unknown>),
      sensoryEvidence: [{ invalid: true }],
    };
    const score = scorePerceptionPromptCandidate({ fixture, candidate });
    assert.equal(score.worldSchemaValid, true);
    assert.equal(score.worldPatchCorrectness, 1);
    assert.equal(score.sensorySchemaValid, false);
    assert.equal(score.sensoryCoverage, 0);
  });

  it("detects wrong attribution and an unknown-identity name leak", () => {
    const fixture = PERCEPTION_PROMPT_FIXTURES[0]!;
    const candidate = referenceCandidate({ fixture, topology: "combined" });
    const raw = candidate.rawWorldResponse as {
      sensoryEvidence: Array<{
        phenomenon: string;
        accessBySide: {
          a: { currentAccess: string; perceivedAs: string };
          b: { currentAccess: string; perceivedAs: string };
        };
      }>;
    };
    raw.sensoryEvidence[0]!.phenomenon = "夜渡りに命中した感触";
    raw.sensoryEvidence[0]!.accessBySide.b.currentAccess = "clear";
    const score = scorePerceptionPromptCandidate({ fixture, candidate });
    assert.equal(score.sensorySchemaValid, true);
    assert.equal(score.attributionErrors, 1);
    assert.equal(score.identityLeakages, 1);
  });

  it("prefers combined only when it meets every quality floor", () => {
    const perfectCombined = perfectAggregate("combined");
    const perfectSplit = perfectAggregate("split");
    assert.deepEqual(
      recommendPerceptionPromptTopology({
        combined: perfectCombined,
        split: perfectSplit,
      }).topology,
      "combined",
    );

    const weakCombined = {
      ...perfectCombined,
      sensoryCoverage: 0.5,
    };
    const splitRecommendation = recommendPerceptionPromptTopology({
      combined: weakCombined,
      split: perfectSplit,
    });
    assert.equal(splitRecommendation.topology, "split");
    assert.deepEqual(splitRecommendation.combinedFailures, ["sensory_coverage"]);
  });

  it("refuses to select from too few samples or two failing candidates", () => {
    const combined = perfectAggregate("combined");
    const split = perfectAggregate("split");
    assert.equal(recommendPerceptionPromptTopology({
      combined: { ...combined, sampleCount: 3 },
      split,
    }).reason, "insufficient_samples");
    assert.equal(recommendPerceptionPromptTopology({
      combined: { ...combined, identityLeakageRate: 0.1 },
      split: { ...split, worldPatchCorrectness: 0.5 },
    }).topology, null);
  });

  it("aggregates latency and tokens without inventing missing usage", () => {
    const fixture = PERCEPTION_PROMPT_FIXTURES[0]!;
    const first = scorePerceptionPromptCandidate({
      fixture,
      candidate: referenceCandidate({
        fixture,
        topology: "combined",
        latencyMs: 10,
        totalTokens: 80,
      }),
    });
    const second = {
      ...first,
      latencyMs: 30,
      totalTokens: null,
    };
    const aggregate = aggregatePerceptionPromptScores([first, second]);
    assert.equal(aggregate.meanLatencyMs, 20);
    assert.equal(aggregate.p95LatencyMs, 30);
    assert.equal(aggregate.measuredTokenSamples, 1);
    assert.equal(aggregate.meanTotalTokens, 80);
  });

  it("requires an exact reviewed provider and model pair", () => {
    assert.equal(REVIEWED_PERCEPTION_TOPOLOGIES.length, 2);
    assert.equal(reviewedPerceptionTopology("mock", "mock-v1")?.topology, "combined");
    const openai = reviewedPerceptionTopology("openai", "gpt-4.1-mini");
    assert.equal(openai?.topology, "combined");
    assert.equal(openai?.combined.worldPatchCorrectness, 1);
    assert.equal(openai?.split.sensorySchemaValidRate, 8 / 9);
    assert.equal(reviewedPerceptionTopology("mock", "mock-v2"), null);
    assert.equal(reviewedPerceptionTopology("openai", "gpt-4.1"), null);
  });

  it("runs the fixed combined and split matrices without adaptive retries", async () => {
    let calls = 0;
    const report = await evaluatePerceptionPromptTopologies({
      provider: "fixture-provider",
      model: "fixture-model",
      repetitions: 3,
      now: () => new Date("2026-08-04T00:00:00.000Z"),
      client: {
        async completeJson(input) {
          calls += 1;
          const fixture = PERCEPTION_PROMPT_FIXTURES.find((item) =>
            input.label.includes(`/${item.id}/`)
          );
          assert.ok(fixture);
          const isSensory = input.label.endsWith("/sensory");
          const isCombined = input.label.endsWith("/combined");
          return {
            data: isSensory
              ? { sensoryEvidence: structuredClone(fixture.expectedSensoryEvidence) }
              : {
                  patch: {
                    operations: structuredClone(fixture.expectedPatch.operations),
                  },
                  ...(isCombined
                    ? {
                        sensoryEvidence: structuredClone(
                          fixture.expectedSensoryEvidence,
                        ),
                      }
                    : {}),
                },
            measurement: {
              latencyMs: 5,
              inputTokens: 40,
              outputTokens: 10,
              totalTokens: 50,
            },
          };
        },
      },
    });
    assert.equal(calls, 27);
    assert.equal(report.combined.sampleCount, 9);
    assert.equal(report.split.sampleCount, 9);
    assert.equal(report.combined.meanLatencyMs, 5);
    assert.equal(report.split.meanLatencyMs, 10);
    assert.equal(report.recommendation.topology, "combined");
    assert.deepEqual(report.callErrors, []);
    assert.equal(report.evaluatedAt, "2026-08-04T00:00:00.000Z");
  });
});

function perfectAggregate(
  topology: "combined" | "split",
): PerceptionPromptAggregate {
  return {
    fixtureVersion: "perception-prompts-v8",
    topology,
    sampleCount: 9,
    worldSchemaValidRate: 1,
    sensorySchemaValidRate: 1,
    worldPatchCorrectness: 1,
    sensoryCoverage: 1,
    attributionErrorRate: 0,
    identityLeakageRate: 0,
    meanLatencyMs: topology === "combined" ? 100 : 180,
    p95LatencyMs: topology === "combined" ? 120 : 220,
    measuredTokenSamples: 9,
    meanTotalTokens: topology === "combined" ? 500 : 750,
    totalTokens: topology === "combined" ? 4500 : 6750,
  };
}
