import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BattleStateSchema } from "@kshiai/shared";
import {
  captureBattleIntegratedShadowTranscripts,
  verifyIntegratedShadowTranscriptContentDigest,
} from "./capture-battle-integrated-shadow-transcripts.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("integrated shadow-turn transcript capture", () => {
  it("freezes seven stable schema-valid controls without mutation or LLM calls", async () => {
    const report = await captureBattleIntegratedShadowTranscripts({
      fixturePath: path.join(
        repositoryRoot,
        "docs/evidence/battle-pipeline-integrated-shadow-transcript-fixtures-v1.json",
      ),
      repetitions: 2,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    });

    assert.equal(report.fixtureVersion, "battle-pipeline-integrated-shadow-transcripts-v1");
    assert.equal(report.execution.scenarioCount, 7);
    assert.equal(report.execution.externalLlmCallsMade, 0);
    assert.equal(report.execution.sourceMutationCount, 0);
    assert.equal(report.execution.authoritativeOutcomeMismatchCount, 0);
    assert.equal(report.execution.canonicalCommitCount, 0);
    assert.equal(report.aggregate.schemaValidityRate, 1);
    assert.equal(report.aggregate.dependencyResolutionRate, 1);
    assert.equal(report.aggregate.allAuthoritativeOutcomesStable, true);
    assert.equal(report.aggregate.hardInvariantsPass, true);
    assert.match(report.integrity.contentDigest, /^[0-9a-f]{64}$/u);
    assert.equal(verifyIntegratedShadowTranscriptContentDigest(report), true);
    assert.deepEqual(
      report.scenarios.map((scenario) => scenario.stratum),
      [
        "ordinary_fast_action",
        "remote_rejection",
        "simultaneous_terminal_action",
        "interrupted_expanded_action",
        "active_world_process",
        "blocking_local_conflict",
        "exhausted_budget",
      ],
    );
    for (const scenario of report.scenarios) {
      assert.equal(BattleStateSchema.safeParse(scenario.sourceBattleState).success, true);
      assert.equal(scenario.distinctAuthoritativeOutcomeDigests, 1);
      assert.equal(scenario.sourceMutationCount, 0);
      assert.ok(scenario.expectedDependencies.factRefs.length > 0);
      assert.ok(scenario.checks.every((check) => check.passed));
      assert.equal(scenario.expectedBoundaries.sourceMutationAllowed, false);
      assert.equal(
        scenario.expectedBoundaries.authoritativeOutcomeChangeAllowed,
        false,
      );
      assert.equal(scenario.expectedBoundaries.canonicalCommitAllowed, false);
      assert.equal(scenario.callModel.localCaptureExternalLlmCalls, 0);
      assert.equal(scenario.callModel.generationTokensMeasured, false);
      assert.equal(scenario.callModel.generationLatencyMeasured, false);
    }
  });
});
