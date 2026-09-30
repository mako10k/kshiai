// R: Execute an exact Stage smoke manifest under a persistent permit and per-step call limits.
import { z } from "zod";
import { StageSmokeKindSchema } from "../repositories/cutover-control.js";
import { beginCutoverOperation, currentCutoverControl, cutoverRequestDigest,
  CutoverUnavailableError } from "./cutover-admission.js";

export const StageSmokeManifestSchema = z.object({
  runId: z.string().trim().min(1),
  ownerUserId: z.string().trim().min(1),
  kind: StageSmokeKindSchema,
  steps: z.array(z.object({
    name: z.string().trim().min(1),
    target: z.string().trim().min(1),
    method: z.string().trim().min(1),
    minimumCalls: z.number().int().min(0),
    maximumCalls: z.number().int().positive(),
  }).strict()).min(1).max(32),
}).strict().superRefine((manifest, context) => {
  if (new Set(manifest.steps.map((step) => step.name)).size !== manifest.steps.length) {
    context.addIssue({ code: "custom", message: "step names must be distinct" });
  }
  for (const step of manifest.steps) {
    if (step.minimumCalls > step.maximumCalls) {
      context.addIssue({ code: "custom", message: "minimumCalls exceeds maximumCalls" });
    }
  }
});
export type StageSmokeManifest = z.infer<typeof StageSmokeManifestSchema>;
export function stageSmokeOperation(input: StageSmokeManifest) {
  const manifest = StageSmokeManifestSchema.parse(input);
  return {
    bindingOperationId: `stage-smoke:${manifest.runId}:${manifest.kind}`,
    kind: "background" as const,
    actorId: manifest.ownerUserId,
    method: "SMOKE",
    path: `/stage-smoke/${manifest.kind}`,
    backgroundKind: `stage-smoke:${manifest.kind}`,
    requestDigest: cutoverRequestDigest(manifest),
  };
}
export type StageSmokeContext = {
  step: <T>(name: string, action: (target: string) => Promise<T>) => Promise<T>;
};
export async function runCutoverStageSmoke<T>(
  input: StageSmokeManifest,
  execute: (context: StageSmokeContext) => Promise<T>,
): Promise<{ result: T; receiptDigest: string }> {
  const manifest = StageSmokeManifestSchema.parse(input);
  const control = await currentCutoverControl();
  if (!control || control.phase !== "trial" || control.policy.ownerUserId !== manifest.ownerUserId) {
    throw new CutoverUnavailableError();
  }
  const handle = await beginCutoverOperation(stageSmokeOperation(manifest));
  const calls = new Map<string, number>();
  const outcomes: { name: string; call: number; outcome: "succeeded" | "unknown" }[] = [];
  let active = false;
  let closed = false;
  const receiptDigest = () => cutoverRequestDigest({ manifest, outcomes });
  try {
    const result = await execute({ step: async (name, action) => {
      const step = manifest.steps.find((candidate) => candidate.name === name);
      const count = calls.get(name) ?? 0;
      if (closed || active || !step || count >= step.maximumCalls) {
        throw new Error("stage_smoke_step_not_admitted");
      }
      calls.set(name, count + 1);
      active = true;
      try {
        const value = await action(step.target);
        outcomes.push({ name, call: count + 1, outcome: "succeeded" });
        return value;
      } catch (error) {
        outcomes.push({ name, call: count + 1, outcome: "unknown" });
        throw error;
      } finally { active = false; }
    } });
    closed = true;
    if (active || outcomes.some((outcome) => outcome.outcome === "unknown") ||
        manifest.steps.some((step) => (calls.get(step.name) ?? 0) < step.minimumCalls)) {
      throw new Error("stage_smoke_readback_incomplete");
    }
    const digest = receiptDigest();
    await handle.finish("settled", digest);
    return { result, receiptDigest: digest };
  } catch (error) {
    closed = true;
    await handle.finish("indeterminate", receiptDigest());
    throw error;
  }
}
