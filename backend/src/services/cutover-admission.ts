// R: Fence runtime operations against the immutable deployment's persistent cutover control.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID, createHash } from "node:crypto";
import { BattleStateSchema } from "@kshiai/shared";
import { config } from "../config.js";
import { query } from "../db.js";
import {
  readCutoverControl, reserveCutoverOperation, startCutoverOperation,
  settleCutoverOperation, type CutoverControl, type ReserveInput,
} from "../repositories/cutover-control.js";

export class CutoverUnavailableError extends Error {
  readonly status = 503;
  constructor() { super("cutover_unavailable"); this.name = "CutoverUnavailableError"; }
}
export function cutoverRequestDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export async function currentCutoverControl(): Promise<CutoverControl | null> {
  if (!config.cutover) return null;
  try { return await readCutoverControl(config.cutover); }
  catch { throw new CutoverUnavailableError(); }
}
export async function cutoverAllowsGeneralWork(): Promise<boolean> {
  try { const control = await currentCutoverControl(); return !control || control.phase === "open"; }
  catch { return false; }
}
export async function cutoverNarrationBattleIds(): Promise<readonly string[] | null> {
  try {
    const control = await currentCutoverControl();
    if (!control || control.phase === "open") return null;
    return control.phase === "trial" ? control.policy.taskBattleIds : [];
  } catch { return []; }
}
export async function assertCutoverTrialBattle(control: CutoverControl, battleId: string): Promise<void> {
  if (control.phase !== "trial") return;
  const result = await query<{ state_json: unknown; side_a_user_id: string }>(
    "SELECT state_json, side_a_user_id FROM battles WHERE id=$1", [battleId],
  );
  const row = result.rows[0];
  let raw: unknown = row?.state_json;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { throw new CutoverUnavailableError(); } }
  const parsed = BattleStateSchema.safeParse(raw);
  const manifest = parsed.success ? parsed.data.assetManifest : undefined;
  const generations = control.policy.trialBindings?.generationIds;
  if (!row || row.side_a_user_id !== control.policy.ownerUserId || manifest?.schemaVersion !== 4 ||
      !generations || manifest.characters.a.generationId !== generations[0] ||
      manifest.characters.b.generationId !== generations[1]) throw new CutoverUnavailableError();
}
type BattleCreationBinding = { battleId: string; ownerUserId: string; generationIds: readonly [string, string] };
const battleCreation = new AsyncLocalStorage<BattleCreationBinding>();
const operationBattle = new AsyncLocalStorage<string>();
export function currentCutoverBattleId(): string | undefined {
  return operationBattle.getStore() ?? battleCreation.getStore()?.battleId;
}
export function withCutoverBattleOperation<T>(battleId: string, operation: () => Promise<T>): Promise<T> {
  return operationBattle.run(battleId, operation);
}
export function withCutoverBattleCreation<T>(binding: BattleCreationBinding, operation: () => Promise<T>): Promise<T> {
  return battleCreation.run(binding, operation);
}
export async function assertCutoverProviderBattle(control: CutoverControl, battleId: string): Promise<void> {
  if (control.phase !== "trial") return;
  const existing = await query<{ id: string }>("SELECT id FROM battles WHERE id=$1", [battleId]);
  if (existing.rows[0]) return assertCutoverTrialBattle(control, battleId);
  const binding = battleCreation.getStore();
  const generations = control.policy.trialBindings?.generationIds;
  if (!binding || binding.battleId !== battleId || binding.ownerUserId !== control.policy.ownerUserId ||
      !generations || binding.generationIds[0] !== generations[0] || binding.generationIds[1] !== generations[1]) {
    throw new CutoverUnavailableError();
  }
  const permits = await query<{ binding_operation_id: string; request_digest: string }>(
    `SELECT binding_operation_id, request_digest FROM cutover_operation_permits
     WHERE cutover_id=$1 AND operation_kind='http' AND method='POST' AND path='/api/battles'
       AND battle_id=$2 AND actor_id=$3 AND state='sending'`,
    [control.cutoverId, battleId, control.policy.ownerUserId],
  );
  const admitted = permits.rows.some((permit) => control.policy.trialBindings?.requests.some((request) =>
    request.kind === "http" && request.method === "POST" && request.path === "/api/battles" &&
    request.battleId === battleId && request.bindingOperationId === permit.binding_operation_id &&
    request.requestDigest === permit.request_digest));
  if (!admitted) throw new CutoverUnavailableError();
}
export type RuntimeOperationInput = Omit<ReserveInput, "cutoverId" | "artifactId" | "controlRevision" | "reservationAttemptId">;
export async function resolveCutoverNarrationTaskOperation(input: {
  battleId: string;
  deliveryOperationId: string;
  requestDigest: string;
}): Promise<RuntimeOperationInput> {
  const control = await currentCutoverControl();
  if (!control || control.phase === "open") {
    return {
      bindingOperationId: input.deliveryOperationId,
      kind: "task",
      method: "POST",
      path: "/api/internal/narration/task",
      requestDigest: input.requestDigest,
      actorId: control?.policy.ownerUserId ?? "runtime",
      battleId: input.battleId,
    };
  }
  if (control.phase !== "trial") throw new CutoverUnavailableError();
  await assertCutoverTrialBattle(control, input.battleId);
  const stableDigest = cutoverRequestDigest({
    taskKind: "narration",
    battleId: input.battleId,
  });
  const bindings = control.policy.trialBindings?.requests.filter((request) =>
    request.kind === "task" && request.method === "POST" &&
    request.path === "/api/internal/narration/task" &&
    request.requestDigest === stableDigest && request.battleId === input.battleId &&
    request.backgroundKind === "narration") ?? [];
  if (bindings.length !== 1 || !bindings[0]) throw new CutoverUnavailableError();
  return {
    bindingOperationId: bindings[0].bindingOperationId,
    kind: "task",
    method: "POST",
    path: "/api/internal/narration/task",
    requestDigest: stableDigest,
    actorId: control.policy.ownerUserId,
    battleId: input.battleId,
    backgroundKind: "narration",
  };
}
export type CutoverOperationHandle = {
  finish: (outcome: "settled" | "indeterminate", resultDigest?: string) => Promise<void>;
  markAccountingPending: (resultDigest: string) => Promise<void>;
};
export async function beginCutoverOperation(input: RuntimeOperationInput): Promise<CutoverOperationHandle> {
  const control = await currentCutoverControl();
  if (!control) return { finish: async () => undefined, markAccountingPending: async () => undefined };
  const identity = { cutoverId: control.cutoverId, artifactId: control.artifactId };
  const reservation = await reserveCutoverOperation({ ...identity, ...input,
    controlRevision: control.revision, reservationAttemptId: randomUUID() });
  if (reservation.kind !== "reserved") throw new CutoverUnavailableError();
  const permitIdentity = { ...identity, permitId: reservation.permit.permitId };
  if ((await startCutoverOperation(permitIdentity)).kind !== "started") throw new CutoverUnavailableError();
  let completed = false;
  return { markAccountingPending: async (resultDigest) => {
    if (completed) return;
    await settleCutoverOperation({ ...permitIdentity, outcome: "result-accounting-pending", resultDigest });
  }, finish: async (outcome, resultDigest) => {
    if (completed) return;
    await settleCutoverOperation({ ...permitIdentity, outcome, resultDigest });
    completed = true;
  } };
}
export async function runCutoverOperation<T>(input: RuntimeOperationInput, operation: () => Promise<T>): Promise<T> {
  const handle = await beginCutoverOperation(input);
  try {
    const result = await (input.battleId
      ? withCutoverBattleOperation(input.battleId, operation) : operation());
    await handle.finish("settled");
    return result;
  } catch (error) {
    await handle.finish("indeterminate");
    throw error;
  }
}
export async function runCutoverBackgroundOperation<T>(input: {
  operationId: string;
  kind: "narration-dispatch" | "narration-worker" | "authoring-dispatch" | "authoring-worker";
  battleId?: string;
}, operation: () => Promise<T>): Promise<T> {
  const control = await currentCutoverControl();
  if (!control) return operation();
  if (control.phase === "closed" || control.phase === "trial" && !input.kind.startsWith("narration")) {
    throw new CutoverUnavailableError();
  }
  const digest = cutoverRequestDigest({ backgroundKind: input.kind, battleId: input.battleId });
  const binding = control.policy.trialBindings?.requests.find((request) => request.kind === "background" &&
    request.method === "BACKGROUND" && request.path === input.kind && request.requestDigest === digest &&
    request.battleId === input.battleId && request.backgroundKind === input.kind);
  if (control.phase === "trial") {
    if (!binding || !input.battleId) throw new CutoverUnavailableError();
    await assertCutoverTrialBattle(control, input.battleId);
  }
  return runCutoverOperation({
    bindingOperationId: control.phase === "trial" && binding ? binding.bindingOperationId : input.operationId,
    kind: "background", actorId: control.phase === "trial" ? control.policy.ownerUserId : "runtime",
    requestDigest: digest, method: "BACKGROUND", path: input.kind,
    battleId: input.battleId, backgroundKind: input.kind,
  }, operation);
}
