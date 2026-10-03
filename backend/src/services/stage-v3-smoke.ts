// R: Verify fixed V3 battle creation, immutable stored bindings, and one bounded authenticated SSE advance with stored progress readback.
import { BattlePublicSchema, BattleStateSchema, CreateBattleRequestSchema,
  type BattleState, type CreateBattleRequest } from "@kshiai/shared";
import { cutoverRequestDigest } from "./cutover-admission.js";
import { runCutoverStageSmoke, type StageSmokeManifest } from "./cutover-stage-smoke.js";

export type StageV3SmokeTarget = {
  apiBaseUrl: string;
  ownerUserId: string;
  generationIds: [string, string];
  body: CreateBattleRequest;
  idempotencyKey: string;
  advanceKey: string;
};
export function stageV3BattleId(target: StageV3SmokeTarget) {
  const body = CreateBattleRequestSchema.parse(target.body);
  return `btl_${cutoverRequestDigest({ userId: target.ownerUserId, scope: "battle-create",
    key: target.idempotencyKey, requestHash: cutoverRequestDigest(body) }).slice(0, 32)}`;
}
export function stageV3SmokeSteps(target: StageV3SmokeTarget) {
  const base = target.apiBaseUrl.replace(/\/$/, "");
  const id = stageV3BattleId(target);
  return [
    { name: "create", target: `${base}/api/battles#request=${cutoverRequestDigest({
      method: "POST", path: "/api/battles", body: CreateBattleRequestSchema.parse(target.body), idempotencyKey: target.idempotencyKey })}`,
      method: "POST", minimumCalls: 1, maximumCalls: 1 },
    { name: "binding-readback", target: `battle:${id}:${target.generationIds.join(":")}`,
      method: "SELECT", minimumCalls: 1, maximumCalls: 1 },
    { name: "sse", target: `${base}/api/battles/${id}/advance/stream#key=${target.advanceKey}`, method: "POST", minimumCalls: 1, maximumCalls: 1 },
    { name: "progress-readback", target: `battle:${id}:${target.generationIds.join(":")}`, method: "SELECT", minimumCalls: 1, maximumCalls: 1 },
  ];
}
export async function runStageV3Smoke(
  manifest: StageSmokeManifest,
  target: StageV3SmokeTarget,
  dependencies: {
    request: (url: string, init: RequestInit) => Promise<Response>;
    readState: (id: string) => Promise<BattleState | null>;
  },
) {
  if (manifest.kind !== "sse" || manifest.ownerUserId !== target.ownerUserId ||
      JSON.stringify(manifest.steps) !== JSON.stringify(stageV3SmokeSteps(target))) {
    throw new Error("stage_v3_target_mismatch");
  }
  const id = stageV3BattleId(target);
  const base = target.apiBaseUrl.replace(/\/$/, "");
  return runCutoverStageSmoke(manifest, async (context) => {
    const created = await context.step("create", () => dependencies.request(`${base}/api/battles`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": target.idempotencyKey },
      body: JSON.stringify(CreateBattleRequestSchema.parse(target.body)),
    }));
    if (!created.ok) throw new Error("stage_v3_create_failed");
    const createdBody: unknown = await created.json();
    const publicBattle = BattlePublicSchema.parse(createdBody && typeof createdBody === "object"
      ? Reflect.get(createdBody, "battle") : null);
    if (publicBattle.id !== id) throw new Error("stage_v3_battle_identity_mismatch");
    const stored = await context.step("binding-readback", () => dependencies.readState(id));
    const state = BattleStateSchema.parse(stored);
    if (state.id !== id || state.assetManifest?.schemaVersion !== 4 ||
        state.assetManifest.characters.a.generationId !== target.generationIds[0] ||
        state.assetManifest.characters.b.generationId !== target.generationIds[1] ||
        state.sideA.characterId !== target.body.myCharacterId ||
        state.sideB.characterId !== target.body.opponentCharacterId) {
      throw new Error("stage_v3_generation_binding_mismatch");
    }
    const followed = await context.step("sse", () => dependencies.request(`${base}/api/battles/${id}/advance/stream`, {
      method: "POST", headers: { "Idempotency-Key": target.advanceKey },
    }));
    if (!followed.ok || !followed.headers.get("Content-Type")?.startsWith("text/event-stream")) {
      throw new Error("stage_v3_sse_failed");
    }
    const replay = await followed.text();
    const frames = replay.split("\n").filter((line) => line.startsWith("data: "))
      .map((line): unknown => JSON.parse(line.slice(6)));
    const done = frames.find((frame) => frame && typeof frame === "object" && Reflect.get(frame, "type") === "done");
    if (!done || typeof done !== "object") throw new Error("stage_v3_sse_replay_incomplete");
    const advanced = BattlePublicSchema.parse(Reflect.get(done, "battle"));
    if (advanced.id !== id) throw new Error("stage_v3_sse_battle_mismatch");
    const after = BattleStateSchema.parse(await context.step("progress-readback", () => dependencies.readState(id)));
    if (after.id !== id || after.assetManifest?.schemaVersion !== 4 ||
        after.assetManifest.characters.a.generationId !== target.generationIds[0] ||
        after.assetManifest.characters.b.generationId !== target.generationIds[1] ||
        (after.battleRevision ?? 0) <= (state.battleRevision ?? 0) || after.turn !== advanced.turn) {
      throw new Error("stage_v3_progress_readback_failed");
    }
    return { battleId: id, generationIds: target.generationIds,
      stateDigest: cutoverRequestDigest(after), sseDigest: cutoverRequestDigest(replay), eventCount: frames.length,
      beforeRevision: state.battleRevision ?? 0, afterRevision: after.battleRevision ?? 0 };

  });
}
