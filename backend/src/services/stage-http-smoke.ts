// R: Verify exact health, owner mapping, and direct-origin protection responses under Stage permits.
import { runCutoverStageSmoke, type StageSmokeManifest } from "./cutover-stage-smoke.js";

export type StageHttpSmokeTarget =
  | { kind: "health"; url: string; expectedRevision: string }
  | { kind: "ownership"; url: string; expectedOwnerUserId: string }
  | { kind: "direct-protection"; url: string };
export function stageHttpSmokeSteps(target: StageHttpSmokeTarget) {
  const expectation = target.kind === "health" ? target.expectedRevision
    : target.kind === "ownership" ? target.expectedOwnerUserId : "401-or-403";
  return [{ name: "response", target: `${target.url}#expected=${expectation}`,
    method: "GET", minimumCalls: 1, maximumCalls: 1 }];
}
function field(value: unknown, name: string): unknown {
  return value && typeof value === "object" ? Reflect.get(value, name) : undefined;
}
export async function runStageHttpSmoke(
  manifest: StageSmokeManifest,
  target: StageHttpSmokeTarget,
  request: (url: string, authenticated: boolean) => Promise<Response>,
) {
  const url = new URL(target.url);
  if (url.username || url.password || url.search || url.hash ||
      manifest.kind !== target.kind ||
      target.kind === "ownership" && target.expectedOwnerUserId !== manifest.ownerUserId ||
      JSON.stringify(manifest.steps) !== JSON.stringify(stageHttpSmokeSteps(target))) {
    throw new Error("stage_http_target_mismatch");
  }
  return runCutoverStageSmoke(manifest, async (context) => {
    const response = await context.step("response", () => request(target.url, target.kind === "ownership"));
    if (target.kind === "direct-protection") {
      if (response.status !== 401 && response.status !== 403) throw new Error("stage_direct_protection_failed");
      await response.arrayBuffer();
      return { kind: target.kind, status: response.status };
    }
    if (!response.ok) throw new Error("stage_http_readback_failed");
    const body: unknown = await response.json();
    if (target.kind === "health") {
      if (field(body, "ok") !== true || field(body, "database") !== "postgres" ||
          field(body, "auth") !== "supabase" || field(body, "revision") !== target.expectedRevision) {
        throw new Error("stage_health_identity_mismatch");
      }
      return { kind: target.kind, status: response.status, revision: target.expectedRevision };
    }
    if (field(field(body, "user"), "id") !== target.expectedOwnerUserId) {
      throw new Error("stage_owner_mapping_mismatch");
    }
    return { kind: target.kind, status: response.status, ownerUserId: target.expectedOwnerUserId };
  });
}
