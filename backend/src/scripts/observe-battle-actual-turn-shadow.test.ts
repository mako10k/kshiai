import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  ACTUAL_TURN_APPLICABILITY_FIELDS,
  ACTUAL_TURN_SHADOW_CAPTURE_VERSION,
  ActualTurnShadowObservationEnvelopeSchema,
  type ActualTurnShadowObservationEnvelope,
} from "@kshiai/shared";
import {
  observeBattleActualTurnShadowFile,
  parseBattleActualTurnShadowObserverArgs,
} from "./observe-battle-actual-turn-shadow.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function digest(character: string): string {
  return character.repeat(64);
}

function reference(
  kind: "proposal" | "claim" | "slice" | "issue" | "fact",
  character: string,
): string {
  return `${kind}:${digest(character)}`;
}

function envelope(): ActualTurnShadowObservationEnvelope {
  const issueRef = reference("issue", "e");
  return ActualTurnShadowObservationEnvelopeSchema.parse({
    schemaVersion: 1,
    observationId: `observation:${digest("a")}`,
    source: {
      battleRefHash: digest("b"),
      turn: 7,
      capturedAt: "2026-08-06T00:00:00.000Z",
      captureVersion: ACTUAL_TURN_SHADOW_CAPTURE_VERSION,
    },
    applicabilityInput: {
      allowedFallbacks: ["unknown"],
      proposals: [{
        proposalRef: reference("proposal", "c"),
        actionKind: "custom",
      }],
      adaptive: {
        status: "executed",
        contestedClaimRefs: [reference("claim", "d")],
        receipts: [{
          proposalRef: reference("proposal", "c"),
          resolution: "degraded",
          outcome: "indeterminate",
          failureReason: "budget_exhausted",
          fallbackFact: {
            factRef: reference("fact", "f"),
            strength: "unknown",
          },
        }],
      },
      reads: [{
        sliceRef: reference("slice", "1"),
        consistencyLevel: "conflicted",
        blockingIssueRefs: [issueRef],
      }],
      issues: [{ issueRef, status: "open" }],
    },
    authorityEvidence: {
      sourceBeforeDigest: digest("2"),
      sourceAfterDigest: digest("2"),
      authoritativeOutcomeDigest: digest("3"),
      battleResultChanged: false,
      canonicalCommitCount: 0,
      persistenceWriteCount: 0,
      addedExternalLlmCalls: 0,
      addedXaiCalls: 0,
    },
    privacyEvidence: {
      canonicalIdentifiersIncluded: false,
      characterNamesIncluded: false,
      speechOrNarrationIncluded: false,
      promptOrProviderPayloadIncluded: false,
      mediaUrlsIncluded: false,
    },
  });
}

function persistedTurnRecord(privateScene: string): unknown {
  const stateChange = {
    parameterChanges: {},
    defendingBefore: false,
    defendingAfter: false,
    canFightBefore: true,
    canFightAfter: true,
  };
  return {
    turn: 4,
    sideAChange: stateChange,
    sideBChange: stateChange,
    cognitionA: {
      turn: 4,
      scene: privateScene,
      ownCondition: "steady",
      foeCondition: "strained",
    },
    cognitionB: {
      turn: 4,
      scene: privateScene,
      ownCondition: "strained",
      foeCondition: "steady",
    },
  };
}

async function withTempInput(
  value: unknown,
  run: (filePath: string, source: Buffer) => Promise<void>,
): Promise<void> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kshiai-shadow-"));
  const filePath = path.join(directory, "input.json");
  const source = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  try {
    await fs.writeFile(filePath, source, { flag: "wx" });
    await run(filePath, source);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

describe("actual-turn local shadow observer", () => {
  it("audits a complete envelope without source mutation or private output", async () => {
    await withTempInput({
      schemaVersion: 1,
      mode: "actual_turn_shadow_observation_envelopes",
      envelopes: [envelope()],
    }, async (filePath, source) => {
      const report = await observeBattleActualTurnShadowFile(filePath);

      assert.equal(report.source.beforeSha256, report.source.afterSha256);
      assert.equal(report.source.byteLength, source.byteLength);
      assert.deepEqual(report.summary, {
        inputRecordCount: 1,
        completeRecordCount: 1,
        insufficientSourceRecordCount: 0,
        inferredFieldCount: 0,
      });
      assert.equal(report.records[0]?.status, "complete");
      assert.equal(report.records[0]?.danglingStructuralRefCount, 0);
      assert.deepEqual(report.boundaries, {
        sourceWriteCount: 0,
        databaseQueryCount: 0,
        networkCallCount: 0,
        providerCallCount: 0,
        externalLlmCallCount: 0,
        xaiCallCount: 0,
        canonicalWriteCount: 0,
        persistenceWriteCount: 0,
      });
      assert.deepEqual(await fs.readFile(filePath), source);
      assert.doesNotMatch(JSON.stringify(report), /observation:|battleRefHash/u);
      assert.doesNotMatch(JSON.stringify(report), new RegExp(filePath, "u"));
    });
  });

  it("counts dangling internal references without resolving or repairing them", async () => {
    const incomplete = structuredClone(envelope());
    incomplete.applicabilityInput.reads[0]!.blockingIssueRefs = [
      reference("issue", "9"),
    ];
    await withTempInput({
      schemaVersion: 1,
      mode: "actual_turn_shadow_observation_envelopes",
      envelopes: [incomplete],
    }, async (filePath) => {
      const report = await observeBattleActualTurnShadowFile(filePath);

      assert.equal(report.records[0]?.status, "complete");
      assert.equal(report.records[0]?.danglingStructuralRefCount, 1);
      assert.equal(report.boundaries.canonicalWriteCount, 0);
    });
  });

  it("reports persisted records as insufficient without prose inference", async () => {
    const privateScene = "PRIVATE_SCENE_MUST_NOT_LEAK";
    await withTempInput({
      schemaVersion: 1,
      mode: "persisted_battle_turn_records",
      turnRecords: [persistedTurnRecord(privateScene)],
    }, async (filePath) => {
      const report = await observeBattleActualTurnShadowFile(filePath);
      const record = report.records[0];

      assert.equal(record?.status, "insufficient_source");
      assert.deepEqual(record?.availableApplicabilityFields, []);
      assert.deepEqual(
        record?.missingApplicabilityFields,
        ACTUAL_TURN_APPLICABILITY_FIELDS,
      );
      assert.equal(record?.inferredFieldCount, 0);
      assert.equal(report.summary.insufficientSourceRecordCount, 1);
      assert.doesNotMatch(JSON.stringify(report), new RegExp(privateScene, "u"));
    });
  });

  it("fails closed when the local source changes between reads", async () => {
    const wrapped = {
      schemaVersion: 1,
      mode: "actual_turn_shadow_observation_envelopes",
      envelopes: [envelope()],
    };
    await withTempInput(wrapped, async (filePath, source) => {
      let readCount = 0;
      await assert.rejects(
        observeBattleActualTurnShadowFile(filePath, {
          readFile: async () => {
            readCount += 1;
            return readCount === 1
              ? source
              : Buffer.concat([source, Buffer.from(" ")]);
          },
        }),
        /input changed during read-only observation/u,
      );
    });
  });

  it("requires exactly one explicit local input and has no service imports", async () => {
    assert.deepEqual(
      parseBattleActualTurnShadowObserverArgs(["--input", "sample.json"]),
      { inputPath: "sample.json" },
    );
    assert.throws(
      () => parseBattleActualTurnShadowObserverArgs([]),
      /usage/u,
    );
    await assert.rejects(
      observeBattleActualTurnShadowFile("https://example.invalid/input.json"),
      /filesystem path/u,
    );

    const sourcePath = path.join(
      repositoryRoot,
      "backend/src/scripts/observe-battle-actual-turn-shadow.ts",
    );
    const source = await fs.readFile(sourcePath, "utf8");
    assert.doesNotMatch(
      source,
      /from ["'][^"']*(repositories|services|postgres|config)[^"']*["']/u,
    );
    assert.doesNotMatch(source, /from ["'](pg|openai|node:https?|undici)["']/u);
    assert.doesNotMatch(source, /\b(fetch|writeFile|appendFile)\s*\(/u);
  });
});
