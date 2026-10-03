// R: Execute explicit operator cutover-control commands against one selected database target.
import fs from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

type Arguments = {
  command: "initialize" | "read" | "transition" | "barrier" | "reconcile";
  values: Map<string, string>;
  configuredDatabase: boolean;
};

function usage(message?: string): never {
  const prefix = message ? `${message}\n` : "";
  throw new Error(`${prefix}Usage: cutover-control <initialize|read|transition|barrier|reconcile> ` +
    `(--db /absolute/local.sqlite | --configured-database) --cutover-id ID --artifact-id ID [command options]`);
}

export function parseCutoverControlArguments(argv: string[]): Arguments {
  const command = argv[0];
  if (command !== "initialize" && command !== "read" && command !== "transition" &&
      command !== "barrier" && command !== "reconcile") usage("unknown command");
  const values = new Map<string, string>();
  let configuredDatabase = false;
  for (let index = 1; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--configured-database") {
      if (configuredDatabase) usage("duplicate --configured-database");
      configuredDatabase = true;
      continue;
    }
    if (!name?.startsWith("--")) usage(`unexpected argument: ${name ?? ""}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) usage(`missing value for ${name}`);
    if (values.has(name)) usage(`duplicate argument: ${name}`);
    values.set(name, value);
    index += 1;
  }
  const databasePath = values.get("--db");
  if (configuredDatabase === Boolean(databasePath)) usage("select exactly one database target");
  if (databasePath && !isAbsolute(databasePath)) usage("--db must be absolute");
  for (const required of ["--cutover-id", "--artifact-id"]) {
    if (!values.get(required)?.trim()) usage(`${required} is required`);
  }
  return { command, values, configuredDatabase };
}

function required(args: Arguments, name: string): string {
  const value = args.values.get(name)?.trim();
  if (!value) usage(`${name} is required`);
  return value;
}
function positiveInteger(args: Arguments, name: string): number {
  const raw = required(args, name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) usage(`${name} must be a positive integer`);
  return value;
}
function readJson(path: string): unknown {
  if (!isAbsolute(path)) usage("JSON input paths must be absolute");
  const parsed: unknown = JSON.parse(fs.readFileSync(path, "utf8"));
  return parsed;
}
function assertAllowedArguments(args: Arguments, allowed: string[]): void {
  const permitted = new Set(["--db", "--cutover-id", "--artifact-id", ...allowed]);
  for (const name of args.values.keys()) {
    if (!permitted.has(name)) usage(`${name} is not valid for ${args.command}`);
  }
}

type UnresolvedAccounting = {
  activeProviderRuns: number;
  reservedProviderAttempts: number;
  generatingNarrationAttempts: number;
  unfinishedCharacterJobs: number;
  unfinishedBattlefieldJobs: number;
  unfinishedNarrationStyleJobs: number;
};
async function readUnresolvedAccounting(
  databaseQuery: <Row extends object>(sql: string, parameters?: unknown[]) => Promise<{ rows: Row[]; rowCount: number }>,
): Promise<UnresolvedAccounting> {
  const result = await databaseQuery<{
    active_provider_runs: number | string;
    reserved_provider_attempts: number | string;
    generating_narration_attempts: number | string;
    unfinished_character_jobs: number | string;
    unfinished_battlefield_jobs: number | string;
    unfinished_narration_style_jobs: number | string;
  }>(`SELECT
      (SELECT COUNT(*) FROM provider_operation_runs WHERE status='active') AS active_provider_runs,
      (SELECT COUNT(*) FROM provider_operation_attempts WHERE status='reserved') AS reserved_provider_attempts,
      (SELECT COUNT(*) FROM battle_narration_attempts WHERE status='generating') AS generating_narration_attempts,
      (SELECT COUNT(*) FROM character_authoring_jobs WHERE status IN ('pending','claimed')) AS unfinished_character_jobs,
      (SELECT COUNT(*) FROM battlefield_authoring_jobs WHERE status IN ('pending','claimed')) AS unfinished_battlefield_jobs,
      (SELECT COUNT(*) FROM narration_style_authoring_jobs WHERE status IN ('pending','claimed')) AS unfinished_narration_style_jobs`);
  const row = result.rows[0];
  if (!row) throw new Error("CUTOVER_ACCOUNTING_READBACK_MISSING");
  return {
    activeProviderRuns: Number(row.active_provider_runs),
    reservedProviderAttempts: Number(row.reserved_provider_attempts),
    generatingNarrationAttempts: Number(row.generating_narration_attempts),
    unfinishedCharacterJobs: Number(row.unfinished_character_jobs),
    unfinishedBattlefieldJobs: Number(row.unfinished_battlefield_jobs),
    unfinishedNarrationStyleJobs: Number(row.unfinished_narration_style_jobs),
  };
}

export async function runCutoverControl(argv = process.argv.slice(2)): Promise<unknown> {
  const args = parseCutoverControlArguments(argv);
  const databasePath = args.values.get("--db");
  const cutoverId = required(args, "--cutover-id");
  const artifactId = required(args, "--artifact-id");
  if (databasePath) {
    process.env.DATABASE_URL = "";
    process.env.DIRECT_URL = "";
    process.env.DATABASE_PATH = databasePath;
  }
  // Bind the explicit operator target before config/db modules load. SQLite
  // then uses its configured-runtime read path and cannot create or backfill a schema.
  process.env.CUTOVER_ID = cutoverId;
  process.env.CUTOVER_ARTIFACT_ID = artifactId;
  const repository = await import("../repositories/cutover-control.js");
  const database = await import("../db.js");
  try {
    if (args.command === "read") {
      assertAllowedArguments(args, []);
      return await repository.readCutoverControl({ cutoverId, artifactId });
    }
    const operationId = required(args, "--operation-id");
    const operatorId = required(args, "--operator-id");
    if (args.command === "initialize") {
      assertAllowedArguments(args, ["--operation-id", "--operator-id", "--policy"]);
      const policy = repository.CutoverControlPolicySchema.parse(readJson(required(args, "--policy")));
      if (policy.cutoverId !== cutoverId || policy.artifactId !== artifactId) {
        throw new Error("CUTOVER_POLICY_TARGET_MISMATCH");
      }
      return await repository.initializeCutoverControl({ policy, operationId, operatorId, phase: "closed" });
    }
    if (args.command === "transition") {
      assertAllowedArguments(args, ["--operation-id", "--operator-id", "--expect-revision", "--to",
        "--trial-bindings", "--stage-acceptance", "--production-receipt"]);
      const toPhase = repository.CutoverPhaseSchema.parse(required(args, "--to"));
      const trialPath = args.values.get("--trial-bindings");
      const stagePath = args.values.get("--stage-acceptance");
      const trialBindings = trialPath
        ? repository.TrialBindingsSchema.parse(readJson(trialPath)) : undefined;
      const stageAcceptance = stagePath
        ? repository.StageAcceptanceSchema.parse(readJson(stagePath)) : undefined;
      return await repository.transitionCutoverControl({
        cutoverId, artifactId, expectedRevision: positiveInteger(args, "--expect-revision"),
        operationId, operatorId, toPhase, trialBindings, stageAcceptance,
        productionReceipt: args.values.get("--production-receipt"),
      });
    }
    if (args.command === "barrier") {
      assertAllowedArguments(args, ["--operation-id", "--operator-id", "--expect-revision",
        "--provider-accounting-receipt"]);
      const unresolved = await readUnresolvedAccounting(database.query);
      if (Object.values(unresolved).some((count) => !Number.isSafeInteger(count) || count !== 0)) {
        return { kind: "blocked", reason: "provider_accounting_unresolved", unresolved };
      }
      const result = await repository.recordStoppedBarrier({
        cutoverId, artifactId, expectedRevision: positiveInteger(args, "--expect-revision"),
        operationId, operatorId,
        providerAccountingReceiptId: required(args, "--provider-accounting-receipt"),
      });
      return { ...result, unresolved };
    }
    assertAllowedArguments(args, ["--operation-id", "--operator-id", "--permit-id",
      "--reconciliation-receipt", "--result-digest"]);
    return await repository.reconcileIndeterminateOperation({
      cutoverId, artifactId, permitId: required(args, "--permit-id"),
      operationId, operatorId,
      reconciliationReceiptId: required(args, "--reconciliation-receipt"),
      resultDigest: z.string().regex(/^[0-9a-f]{64}$/).parse(required(args, "--result-digest")),
    });
  } finally {
    await database.closeDatabase();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCutoverControl().then(
    (result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
