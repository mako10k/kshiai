// R: Verify one exact existing R2 object and its public route under a bounded Stage permit.
import { runCutoverStageSmoke, type StageSmokeManifest } from "./cutover-stage-smoke.js";

export type StageR2SmokeTarget = {
  accountId: string;
  bucket: string;
  objectKey: string;
  publicBaseUrl: string;
};
export function stageR2SmokeSteps(target: StageR2SmokeTarget) {
  const publicUrl = `${target.publicBaseUrl.replace(/\/$/, "")}/${target.objectKey.split("/").map(encodeURIComponent).join("/")}`;
  return [
    { name: "object-head", target: `r2:${target.accountId}:${target.bucket}:${target.objectKey}`,
      method: "HEAD", minimumCalls: 1, maximumCalls: 1 },
    { name: "public-head", target: publicUrl, method: "HEAD", minimumCalls: 1, maximumCalls: 1 },
  ];
}
export async function runStageR2Smoke(
  manifest: StageSmokeManifest,
  target: StageR2SmokeTarget,
  dependencies: {
    headObject: (bucket: string, objectKey: string) => Promise<void>;
    headPublic: (url: string) => Promise<number>;
  },
) {
  if (manifest.kind !== "r2" || !target.objectKey.trim() ||
      JSON.stringify(manifest.steps) !== JSON.stringify(stageR2SmokeSteps(target))) {
    throw new Error("stage_r2_target_mismatch");
  }
  return runCutoverStageSmoke(manifest, async (context) => {
    await context.step("object-head", () => dependencies.headObject(target.bucket, target.objectKey));
    const status = await context.step("public-head", (url) => dependencies.headPublic(url));
    if (status < 200 || status >= 300) throw new Error("stage_r2_public_readback_failed");
    return { accountId: target.accountId, bucket: target.bucket, objectKey: target.objectKey, status };
  });
}
