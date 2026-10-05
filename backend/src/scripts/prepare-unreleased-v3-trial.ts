// R: Bind and execute an explicit operator preparation command against one PostgreSQL trial target.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Command = "preview" | "apply" | "readback";
export type TrialPreparationArguments = {
  command: Command;
  schema: string;
  projectRef: string | null;
  localTestDatabase: string | null;
  values: ReadonlyMap<string, string>;
};
const commonOptions = ["--schema", "--project-ref", "--local-test-database"];
const commandOptions: Record<Command, readonly string[]> = {
  preview: ["--cutover-id", "--cutover-at"],
  apply: ["--plan", "--expect-plan-sha256", "--policy", "--operator-id"],
  readback: ["--plan", "--expect-plan-sha256"],
};
function usage(): never {
  throw new Error("TRIAL_PREPARATION_ARGUMENTS_INVALID");
}
function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (!value?.trim()) usage();
  return value;
}
export function parseTrialPreparationArguments(argv: readonly string[]): TrialPreparationArguments {
  const command = argv[0];
  if (command !== "preview" && command !== "apply" && command !== "readback") usage();
  const values = new Map<string, string>();
  let configuredDatabase = false;
  for (let index = 1; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--configured-database") {
      if (configuredDatabase) usage();
      configuredDatabase = true;
      continue;
    }
    if (!name || ![...commonOptions, ...commandOptions[command]].includes(name) || values.has(name)) usage();
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage();
    values.set(name, value);
  }
  if (!configuredDatabase) usage();
  const schema = required(values, "--schema");
  if (schema !== "public") usage();
  const projectRef = values.get("--project-ref") ?? null;
  const localTestDatabase = values.get("--local-test-database") ?? null;
  if (Boolean(projectRef) === Boolean(localTestDatabase)) usage();
  if (projectRef && !/^[a-z]{20}$/.test(projectRef)) usage();
  if (localTestDatabase && !/^vt104_trial_disposal_[a-z0-9_]+$/.test(localTestDatabase)) usage();
  for (const name of commandOptions[command]) required(values, name);
  if (command === "preview" && !Number.isFinite(Date.parse(required(values, "--cutover-at")))) usage();
  if (command !== "preview" && !/^[a-f0-9]{64}$/.test(required(values, "--expect-plan-sha256"))) usage();
  return { command, schema, projectRef, localTestDatabase, values };
}
export function validateTrialDatabaseTarget(connectionString: string, args: TrialPreparationArguments): void {
  let target: URL;
  try { target = new URL(connectionString); } catch { throw new Error("TRIAL_DATABASE_TARGET_INVALID"); }
  if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") throw new Error("TRIAL_DATABASE_TARGET_INVALID");
  if (args.localTestDatabase) {
    if (target.hostname !== "127.0.0.1" || target.pathname !== `/${args.localTestDatabase}`) {
      throw new Error("TRIAL_DATABASE_TARGET_MISMATCH");
    }
    return;
  }
  const direct = target.hostname === `db.${args.projectRef}.supabase.co`;
  const pooler = target.hostname.endsWith(".pooler.supabase.com") &&
    decodeURIComponent(target.username) === `postgres.${args.projectRef}`;
  if ((!direct && !pooler) || target.pathname !== "/postgres") throw new Error("TRIAL_DATABASE_TARGET_MISMATCH");
}
export function readReviewedTrialPlan(path: string, expectedSha256: string): unknown {
  const bytes = readFileSync(path);
  if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) {
    throw new Error("TRIAL_PLAN_BYTES_MISMATCH");
  }
  return JSON.parse(bytes.toString("utf8"));
}
export async function runUnreleasedV3TrialPreparation(argv = process.argv.slice(2)): Promise<unknown> {
  const args = parseTrialPreparationArguments(argv);
  const connectionString = process.env.DIRECT_URL?.trim();
  if (!connectionString) throw new Error("TRIAL_EXPLICIT_DIRECT_URL_REQUIRED");
  validateTrialDatabaseTarget(connectionString, args);
  process.env.DATABASE_URL = connectionString;
  process.env.DATABASE_SCHEMA = args.schema;
  const database = await import("../db.js");
  try {
    const { config } = await import("../config.js");
    if (config.databaseUrl !== connectionString || config.databaseSchema !== args.schema) {
      throw new Error("TRIAL_DATABASE_CONFIG_BINDING_MISMATCH");
    }
    const preparation = await import("../repositories/unreleased-trial-preparation.js");
    const identity = (await database.query<{ schema: string; database: string }>(
      "SELECT current_schema() AS schema, current_database() AS database",
    )).rows[0];
    const expectedDatabase = args.localTestDatabase ?? "postgres";
    if (identity?.schema !== args.schema || identity.database !== expectedDatabase) {
      throw new Error("TRIAL_DATABASE_IDENTITY_MISMATCH");
    }
    if (args.command === "preview") {
      return await preparation.planUnreleasedTrialPreparation({
        cutoverId: required(args.values, "--cutover-id"),
        cutoverAt: required(args.values, "--cutover-at"),
      });
    }
    const plan = preparation.UnreleasedTrialPreparationPlanSchema.parse(readReviewedTrialPlan(
      required(args.values, "--plan"), required(args.values, "--expect-plan-sha256"),
    ));
    if (args.command === "readback") return await preparation.readbackUnreleasedTrialPreparation(plan);
    const policy = preparation.UnreleasedTrialPolicySchema.parse(JSON.parse(
      readFileSync(required(args.values, "--policy"), "utf8"),
    ));
    return await preparation.prepareUnreleasedTrial({
      plan, policy, operatorId: required(args.values, "--operator-id"),
    });
  } finally {
    await database.closeDatabase();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runUnreleasedV3TrialPreparation().then((receipt) => {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  }).catch((error: unknown) => {
    const reason = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message : "TRIAL_PREPARATION_FAILED";
    process.stderr.write(`${JSON.stringify({ error: reason })}\n`);
    process.exitCode = 1;
  });
}
