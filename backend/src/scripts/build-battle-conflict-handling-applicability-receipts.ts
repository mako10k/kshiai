import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  IntegratedShadowTurnInputSchema,
  IntegratedShadowTurnReceiptSchema,
  IntegratedShadowTurnReceiptV2Schema,
  buildIntegratedShadowTurnReceiptV2,
  projectLegacyIntegratedShadowTurnReceipt,
  runIntegratedShadowTurnPoc,
} from "@kshiai/shared";
import {
  buildPlanBasisCorrectiveReplay,
  planBasisReplayDigest,
} from "./build-battle-plan-basis-corrective-replay.js";
import {
  CorrectiveReplayEvaluationReportSchema,
  verifyCorrectiveReplayEvaluationContentDigest,
  verifyCorrectiveReplayEvaluationCurrentSources,
} from "./evaluate-battle-plan-basis-corrective-replay.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const FROZEN_EVALUATION_PATH =
  "docs/evidence/battle-pipeline-plan-basis-corrective-replay-evaluation-v2-2026-08-06.json";
const FROZEN_EVALUATION_SHA256 =
  "55f5312726c0c425f106f50a80d042d4424249a15e5b8dd36370561b8e313e73";
const FROZEN_EVALUATION_CONTENT_DIGEST =
  "524fad02bc27c9c87b1a2e62b238a79813d4d3e375dabcd38ad568a7ddc7074e";
const TARGET_FIXTURE_VERSION =
  "battle-pipeline-integrated-shadow-transcripts-v2";

const frozenFiles = [
  {
    path: "docs/battle-pipeline-plan-basis-corrective-replay-decision.md",
    sha256: "5dfeb6b55f47d72357139dfde4a3898bbe0c5534c6dfc11c19df58e124857fb4",
  },
  {
    path: "packages/shared/src/battle-integrated-shadow-turn.ts",
    sha256: "e70d95ab45f42c00eb6b28387985121bf72c5e40fe13780dd5301b48ba9cc2b3",
  },
  {
    path: "backend/src/scripts/evaluate-battle-integrated-shadow-turn.ts",
    sha256: "1503277d2c23baad60541de2c081e430912f56e30f84347580b79df86eb2f970",
  },
  {
    path: "backend/src/scripts/evaluate-battle-plan-basis-corrective-replay.ts",
    sha256: "c0f7c546b3222c20db429c597d2d4fc56fc46e58984511b2a4de83a6789bec09",
  },
] as const;

const StratumSchema = z.enum([
  "ordinary_fast_action",
  "remote_rejection",
  "simultaneous_terminal_action",
  "interrupted_expanded_action",
  "active_world_process",
  "blocking_local_conflict",
  "exhausted_budget",
]);

export const ConflictHandlingApplicabilityReceiptSetSchema = z.object({
  schemaVersion: z.literal(2),
  mode: z.literal("conflict_handling_applicability_receipt_construction"),
  fixtureVersion: z.literal(TARGET_FIXTURE_VERSION),
  cases: z.array(z.object({
    scenarioId: z.string().min(1),
    stratum: StratumSchema,
    turnInput: IntegratedShadowTurnInputSchema,
    legacyReceipt: IntegratedShadowTurnReceiptSchema,
    receipt: IntegratedShadowTurnReceiptV2Schema,
  }).strict()).length(7),
  boundaries: z.object({
    frozenParentVerified: z.literal(true),
    derivedTranscriptPersisted: z.literal(false),
    sourceMutationCount: z.literal(0),
    authoritativeOutcomeChangeCount: z.literal(0),
    legacyReceiptMutationCount: z.literal(0),
    canonicalCommitCount: z.literal(0),
    externalLlmCallsMade: z.literal(0),
    xaiCallsMade: z.literal(0),
  }).strict(),
}).strict();
export type ConflictHandlingApplicabilityReceiptSet = z.infer<
  typeof ConflictHandlingApplicabilityReceiptSetSchema
>;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readFrozenEvaluation(): Promise<z.infer<
  typeof CorrectiveReplayEvaluationReportSchema
>> {
  const source = await fs.readFile(
    path.join(repositoryRoot, FROZEN_EVALUATION_PATH),
    "utf8",
  );
  if (sha256(source) !== FROZEN_EVALUATION_SHA256) {
    throw new Error("frozen corrective evaluation file SHA-256 mismatch");
  }
  const raw = JSON.parse(source) as unknown;
  const report = CorrectiveReplayEvaluationReportSchema.parse(raw);
  if (
    report.integrity.contentDigest !== FROZEN_EVALUATION_CONTENT_DIGEST ||
    !verifyCorrectiveReplayEvaluationContentDigest(raw)
  ) {
    throw new Error("frozen corrective evaluation content digest mismatch");
  }
  return report;
}

export async function verifyConflictHandlingApplicabilityParent(): Promise<
  boolean
> {
  try {
    const report = await readFrozenEvaluation();
    const frozenChecks = await Promise.all(frozenFiles.map(async (file) => {
      const source = await fs.readFile(path.join(repositoryRoot, file.path));
      return sha256(source) === file.sha256;
    }));
    return frozenChecks.every(Boolean) &&
      await verifyCorrectiveReplayEvaluationCurrentSources(report);
  } catch {
    return false;
  }
}

export async function buildBattleConflictHandlingApplicabilityReceipts(): Promise<
  ConflictHandlingApplicabilityReceiptSet
> {
  const frozenEvaluation = await readFrozenEvaluation();
  if (!await verifyConflictHandlingApplicabilityParent()) {
    throw new Error("conflict-handling applicability parent verification failed");
  }
  const construction = await buildPlanBasisCorrectiveReplay({
    now: () => new Date(frozenEvaluation.construction.builtAt),
  });
  if (
    planBasisReplayDigest(construction.report) !==
      planBasisReplayDigest(frozenEvaluation.construction) ||
    construction.targetTranscript.fixtureVersion !== TARGET_FIXTURE_VERSION
  ) {
    throw new Error(
      "current corrective-v2 derivation does not match frozen evidence",
    );
  }

  let sourceMutationCount = 0;
  let authoritativeOutcomeChangeCount = 0;
  let legacyReceiptMutationCount = 0;
  let canonicalCommitCount = 0;
  let externalLlmCallsMade = 0;
  const cases = construction.targetTranscript.scenarios.map((scenario) => {
    const turnInput = IntegratedShadowTurnInputSchema.parse({
      transcriptRef:
        `transcript:${construction.targetTranscript.fixtureVersion}:${scenario.id}`,
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
    const sourceBefore = planBasisReplayDigest(turnInput.sourceBattleState);
    const authoritativeBefore = planBasisReplayDigest(
      turnInput.authoritativeOutcome,
    );
    const legacyReceipt = runIntegratedShadowTurnPoc(turnInput);
    const legacyBefore = planBasisReplayDigest(legacyReceipt);
    const receipt = buildIntegratedShadowTurnReceiptV2({
      turnInput,
      receipt: legacyReceipt,
    });
    const projectedLegacy = projectLegacyIntegratedShadowTurnReceipt(receipt);

    sourceMutationCount += Number(
      legacyReceipt.boundaries.sourceMutated ||
      planBasisReplayDigest(turnInput.sourceBattleState) !== sourceBefore,
    );
    authoritativeOutcomeChangeCount += Number(
      legacyReceipt.boundaries.authoritativeOutcomeChanged ||
      planBasisReplayDigest(turnInput.authoritativeOutcome) !==
        authoritativeBefore,
    );
    legacyReceiptMutationCount += Number(
      planBasisReplayDigest(legacyReceipt) !== legacyBefore ||
      planBasisReplayDigest(projectedLegacy) !== legacyBefore,
    );
    canonicalCommitCount += Number(
      legacyReceipt.boundaries.canonicalCommitPerformed,
    );
    externalLlmCallsMade += legacyReceipt.boundaries.externalLlmCallsMade;

    return {
      scenarioId: scenario.id,
      stratum: scenario.stratum,
      turnInput,
      legacyReceipt,
      receipt,
    };
  });

  return ConflictHandlingApplicabilityReceiptSetSchema.parse({
    schemaVersion: 2,
    mode: "conflict_handling_applicability_receipt_construction",
    fixtureVersion: construction.targetTranscript.fixtureVersion,
    cases,
    boundaries: {
      frozenParentVerified: true,
      derivedTranscriptPersisted: false,
      sourceMutationCount,
      authoritativeOutcomeChangeCount,
      legacyReceiptMutationCount,
      canonicalCommitCount,
      externalLlmCallsMade,
      xaiCallsMade: 0,
    },
  });
}
