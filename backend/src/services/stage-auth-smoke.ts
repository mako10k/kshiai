// R: Verify an existing Supabase account's sign-in and application mapping under a bounded Stage permit.
import type { SupabaseIdentity } from "./supabase-identity.js";
import { runCutoverStageSmoke, type StageSmokeManifest } from "./cutover-stage-smoke.js";

export type StageAuthSmokeTarget = {
  supabaseUrl: string;
  expectedSubject: string;
  expectedApplicationUserId: string;
  authentication: "email" | "google";
};
export type StageAuthSmokeDependencies = {
  signIn: () => Promise<string>;
  verifyIdentity: (token: string) => Promise<SupabaseIdentity | null>;
  readApplicationMapping: (subject: string) => Promise<string | null>;
};
export function stageAuthSmokeSteps(target: StageAuthSmokeTarget) {
  return [
    { name: "sign-in", target: `${target.supabaseUrl}/auth/v1:${target.authentication}:${target.expectedSubject}`,
      method: "AUTH", minimumCalls: 1, maximumCalls: 1 },
    { name: "verify-token", target: `${target.supabaseUrl}/auth/v1:${target.expectedSubject}`,
      method: "VERIFY", minimumCalls: 1, maximumCalls: 1 },
    { name: "mapping", target: `application-user:${target.expectedSubject}:${target.expectedApplicationUserId}`,
      method: "SELECT", minimumCalls: 1, maximumCalls: 1 },
  ];
}
export async function runStageAuthSmoke(
  manifest: StageSmokeManifest,
  target: StageAuthSmokeTarget,
  dependencies: StageAuthSmokeDependencies,
) {
  if (manifest.kind !== target.authentication ||
      JSON.stringify(manifest.steps) !== JSON.stringify(stageAuthSmokeSteps(target))) {
    throw new Error("stage_auth_target_mismatch");
  }
  return runCutoverStageSmoke(manifest, async (context) => {
    const token = await context.step("sign-in", () => dependencies.signIn());
    const identity = await context.step("verify-token", () => dependencies.verifyIdentity(token));
    if (!identity || identity.subject !== target.expectedSubject) {
      throw new Error("stage_auth_identity_mismatch");
    }
    const userId = await context.step("mapping", () => dependencies.readApplicationMapping(identity.subject));
    if (userId !== target.expectedApplicationUserId) throw new Error("stage_auth_mapping_mismatch");
    // Tokens and profiles never enter the returned receipt or persistent ledger.
    return { authentication: target.authentication, subject: identity.subject, applicationUserId: userId };
  });
}
