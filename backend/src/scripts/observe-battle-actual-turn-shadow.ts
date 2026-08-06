import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTUAL_TURN_APPLICABILITY_FIELDS,
  ActualTurnShadowObservationInputFileSchema,
  ActualTurnShadowObservationReportSchema,
  type ActualTurnShadowObservationEnvelope,
  type ActualTurnShadowObservationRecordAudit,
  type ActualTurnShadowObservationReport,
} from "@kshiai/shared";

const MAX_INPUT_BYTES = 16 * 1024 * 1024;

type ObserverFileAccess = {
  readFile?: (filePath: string) => Promise<Buffer>;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

function recordRef(index: number): string {
  return `record:${String(index + 1).padStart(6, "0")}`;
}

function countDanglingStructuralRefs(
  envelope: ActualTurnShadowObservationEnvelope,
): number {
  const proposalRefs = new Set(envelope.applicabilityInput.proposals.map(
    (proposal) => proposal.proposalRef,
  ));
  const issueRefs = new Set(envelope.applicabilityInput.issues.map(
    (issue) => issue.issueRef,
  ));
  let danglingCount = 0;
  if (envelope.applicabilityInput.adaptive.status === "executed") {
    danglingCount += envelope.applicabilityInput.adaptive.receipts.filter(
      (receipt) => !proposalRefs.has(receipt.proposalRef),
    ).length;
  }
  danglingCount += envelope.applicabilityInput.reads.flatMap(
    (read) => read.blockingIssueRefs,
  ).filter((issueRef) => !issueRefs.has(issueRef)).length;
  return danglingCount;
}

function completeRecordAudit(
  envelope: ActualTurnShadowObservationEnvelope,
  index: number,
): ActualTurnShadowObservationRecordAudit {
  return {
    recordRef: recordRef(index),
    sourceKind: "observation_envelope",
    status: "complete",
    availableApplicabilityFields: [...ACTUAL_TURN_APPLICABILITY_FIELDS],
    missingApplicabilityFields: [],
    inferredFieldCount: 0,
    danglingStructuralRefCount: countDanglingStructuralRefs(envelope),
    envelopeDigest: digest(envelope),
    applicabilityInputDigest: digest(envelope.applicabilityInput),
  };
}

function insufficientRecordAudit(
  sourceKind:
    | "persisted_battle_state_record"
    | "persisted_battle_turn_record",
  index: number,
): ActualTurnShadowObservationRecordAudit {
  return {
    recordRef: recordRef(index),
    sourceKind,
    status: "insufficient_source",
    availableApplicabilityFields: [],
    missingApplicabilityFields: [...ACTUAL_TURN_APPLICABILITY_FIELDS],
    inferredFieldCount: 0,
    danglingStructuralRefCount: 0,
  };
}

function auditRecords(raw: unknown): {
  inputMode: ActualTurnShadowObservationReport["source"]["inputMode"];
  records: ActualTurnShadowObservationRecordAudit[];
} {
  const input = ActualTurnShadowObservationInputFileSchema.parse(raw);
  if (input.mode === "actual_turn_shadow_observation_envelopes") {
    return {
      inputMode: input.mode,
      records: input.envelopes.map(completeRecordAudit),
    };
  }
  if (input.mode === "persisted_battle_state") {
    return {
      inputMode: input.mode,
      records: input.battleState.turnRecords.map((_record, index) =>
        insufficientRecordAudit("persisted_battle_state_record", index)
      ),
    };
  }
  return {
    inputMode: input.mode,
    records: input.turnRecords.map((_record, index) =>
      insufficientRecordAudit("persisted_battle_turn_record", index)
    ),
  };
}

function decodeJson(source: Buffer): unknown {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(source);
  return JSON.parse(text) as unknown;
}

function assertLocalPath(inputPath: string): string {
  if (!inputPath || inputPath.includes("\0")) {
    throw new Error("--input requires a non-empty local path");
  }
  if (/^(https?|file|data):/iu.test(inputPath)) {
    throw new Error("--input accepts a filesystem path, not a URL");
  }
  return path.resolve(inputPath);
}

async function assertRegularBoundedFile(filePath: string): Promise<void> {
  const metadata = await fs.lstat(filePath);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("--input must reference a regular non-symlink file");
  }
  if (metadata.size > MAX_INPUT_BYTES) {
    throw new Error(`--input exceeds ${MAX_INPUT_BYTES} bytes`);
  }
}

export async function observeBattleActualTurnShadowFile(
  inputPath: string,
  access: ObserverFileAccess = {},
): Promise<ActualTurnShadowObservationReport> {
  const resolvedPath = assertLocalPath(inputPath);
  const readFile = access.readFile ??
    ((filePath: string) => fs.readFile(filePath));
  await assertRegularBoundedFile(resolvedPath);
  const beforeSource = await readFile(resolvedPath);
  if (beforeSource.byteLength > MAX_INPUT_BYTES) {
    throw new Error(`--input exceeds ${MAX_INPUT_BYTES} bytes`);
  }
  const beforeSha256 = sha256(beforeSource);
  const audited = auditRecords(decodeJson(beforeSource));
  await assertRegularBoundedFile(resolvedPath);
  const afterSource = await readFile(resolvedPath);
  const afterSha256 = sha256(afterSource);
  if (
    beforeSource.byteLength !== afterSource.byteLength ||
    beforeSha256 !== afterSha256
  ) {
    throw new Error("input changed during read-only observation");
  }

  const completeRecordCount = audited.records.filter(
    (record) => record.status === "complete",
  ).length;
  return ActualTurnShadowObservationReportSchema.parse({
    schemaVersion: 1,
    mode: "actual_turn_shadow_observation_audit",
    source: {
      inputMode: audited.inputMode,
      byteLength: beforeSource.byteLength,
      beforeSha256,
      afterSha256,
      unchanged: true,
    },
    summary: {
      inputRecordCount: audited.records.length,
      completeRecordCount,
      insufficientSourceRecordCount:
        audited.records.length - completeRecordCount,
      inferredFieldCount: 0,
    },
    records: audited.records,
    privacy: {
      directIdentityFieldsEmitted: 0,
      proseFieldsEmitted: 0,
      promptOrProviderFieldsEmitted: 0,
      mediaUrlFieldsEmitted: 0,
    },
    boundaries: {
      sourceWriteCount: 0,
      databaseQueryCount: 0,
      networkCallCount: 0,
      providerCallCount: 0,
      externalLlmCallCount: 0,
      xaiCallCount: 0,
      canonicalWriteCount: 0,
      persistenceWriteCount: 0,
    },
  });
}

export function parseBattleActualTurnShadowObserverArgs(
  args: string[],
): { inputPath: string } {
  if (args.length !== 2 || args[0] !== "--input" || !args[1]) {
    throw new Error(
      "usage: observe-battle-actual-turn-shadow --input <local-json>",
    );
  }
  return { inputPath: args[1] };
}

async function main(): Promise<void> {
  const { inputPath } = parseBattleActualTurnShadowObserverArgs(
    process.argv.slice(2),
  );
  const report = await observeBattleActualTurnShadowFile(inputPath);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "observation failed";
    console.error(`[actual-turn-shadow-observer] ${message}`);
    process.exitCode = 1;
  }
}
