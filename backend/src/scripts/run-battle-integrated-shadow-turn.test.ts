import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IntegratedShadowTurnInputSchema,
  IntegratedShadowTurnReceiptSchema,
  runIntegratedShadowTurnPoc,
} from "@kshiai/shared";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

type FrozenTranscriptScenario = {
  id: string;
  sourceBattleState: unknown;
  sourceBattleStateDigest: string;
  authoritativeResult: {
    normalizedOutcome: unknown;
    normalizedOutcomeDigest: string;
  };
  characterInputs: unknown;
  worldInputs: unknown;
  consistencyInputs: unknown;
  expectedDependencies: unknown;
  expectedBoundaries: unknown;
  callModel: unknown;
};

type FrozenTranscriptReport = {
  fixtureVersion: string;
  scenarios: FrozenTranscriptScenario[];
};

describe("integrated shadow-turn receipt", () => {
  it("connects all seven frozen transcripts without authority or reference drift", async () => {
    const artifactPath = path.join(
      repositoryRoot,
      "docs/evidence/battle-pipeline-integrated-shadow-transcript-baseline-2026-08-06.json",
    );
    const artifactSource = await readFile(artifactPath, "utf8");
    const report = JSON.parse(artifactSource) as FrozenTranscriptReport;
    const receipts = report.scenarios.map((scenario) => {
      const request = IntegratedShadowTurnInputSchema.parse({
        transcriptRef: `transcript:${report.fixtureVersion}:${scenario.id}`,
        sourceBattleState: scenario.sourceBattleState,
        sourceBattleStateDigest: scenario.sourceBattleStateDigest,
        authoritativeOutcome: scenario.authoritativeResult.normalizedOutcome,
        authoritativeOutcomeDigest:
          scenario.authoritativeResult.normalizedOutcomeDigest,
        characterInputs: scenario.characterInputs,
        worldInputs: scenario.worldInputs,
        consistencyInputs: scenario.consistencyInputs,
        expectedDependencies: scenario.expectedDependencies,
        expectedBoundaries: scenario.expectedBoundaries,
        callModel: scenario.callModel,
      });
      const first = runIntegratedShadowTurnPoc(request);
      const second = runIntegratedShadowTurnPoc(request);
      IntegratedShadowTurnReceiptSchema.parse(first);
      assert.deepEqual(first, second);
      assert.equal(first.dependencyAudit.recall, 1);
      assert.equal(first.dependencyAudit.allResolved, true);
      assert.equal(first.componentCoverage.coverage, 1);
      assert.equal(first.referenceAudit.danglingRefs.length, 0);
      assert.equal(first.conflictHandling.explicit, true);
      assert.deepEqual(first.boundaries, {
        sourceMutated: false,
        authoritativeOutcomeChanged: false,
        canonicalCommitPerformed: false,
        externalLlmCallsMade: 0,
        observerCanonicalIdentifierLeakCount: 0,
        outOfScopeRepairMutationCount: 0,
        danglingReferenceCount: 0,
        temporalAtomicityFailureCount: 0,
      });
      assert.equal(first.metrics.currentAuthoritativeMinimumCalls, 4);
      assert.equal(first.metrics.shadowModeledOrdinaryCalls, 3);
      assert.equal(first.metrics.generationTokensMeasured, false);
      assert.equal(first.metrics.generationLatencyMeasured, false);
      return [scenario.id, first] as const;
    });

    assert.equal(receipts.length, 7);
    assert.equal(await readFile(artifactPath, "utf8"), artifactSource);
    const byId = new Map(receipts);
    assert.equal(byId.get("ordinary_fast_action")?.adaptive.status, "executed");
    assert.ok((byId.get("ordinary_fast_action")?.patches.length ?? 0) > 0);
    assert.equal(byId.get("active_world_process")?.world.status, "executed");
    assert.ok((byId.get("active_world_process")?.patches.length ?? 0) > 0);
    assert.ok(byId.get("active_world_process")?.patches.every((patch) =>
      patch.audit.verdict === "no_issue_found"
    ));
    const interrupted = byId.get("interrupted_expanded_action");
    assert.equal(interrupted?.adaptive.status, "executed");
    if (interrupted?.adaptive.status === "executed") {
      assert.equal(
        interrupted.adaptive.result.receipts[0]?.failureReason,
        "invalid_character_plan",
      );
      assert.equal(
        interrupted.adaptive.result.receipts[0]?.fallbackFact?.strength,
        "unknown",
      );
    }
    assert.ok(
      (byId.get("blocking_local_conflict")?.conflictHandling
        .conflictedReadRefs.length ?? 0) > 0,
    );
    assert.ok(
      (byId.get("exhausted_budget")?.conflictHandling
        .fallbackFactRefs.length ?? 0) > 0,
    );
  });
});
