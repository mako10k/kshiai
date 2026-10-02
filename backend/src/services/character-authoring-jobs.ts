// R: Admit and execute durable asset-authoring jobs under their execution fences.
import { randomUUID } from "node:crypto";
import { toAssetAuthoringProgress } from "@kshiai/shared";
import * as charAssetRepo from "../repositories/character-assets-v2.js";
import {
  claimFamilyAuthoringJob,
  claimNextFamilyAuthoringJob,
  completeAuthoringOutboxDelivery,
  countOpenFamilyAuthoringJobs,
  deferAuthoringOutboxDelivery,
  getAuthoringOutboxDelivery,
  renewFamilyAuthoringFence,
  type AuthoringExecutionFence,
  type AuthoringFamily,
} from "../repositories/family-authoring-jobs.js";
import {
  runBattlefieldAuthoringJob,
  runNarrationStyleAuthoringJob,
} from "./family-authoring-runners.js";
import type { LlmProvider } from "../llm/types.js";
import { runCharacterFocusedAuthoringJobV3 } from "./character-focused-authoring.js";
import {
  cutoverAllowsGeneralWork,
  runCutoverBackgroundOperation,
} from "./cutover-admission.js";

export type CharacterAuthoringJobResult = "idle" | "completed" | "failed";

async function processNextCharacterAuthoringJobCore(input: {
  llm: LlmProvider;
  workerId?: string;
  cap?: number;
}): Promise<CharacterAuthoringJobResult> {
  const workerPolicy = input.llm.semanticAuthoringProvider
    ? input.llm.semanticAuthoringWorkerPolicy
    : undefined;
  if (input.llm.semanticAuthoringProvider && !workerPolicy) {
    throw new Error("SEMANTIC_AUTHORING_WORKER_POLICY_REQUIRED");
  }
  const claimed = await claimNextFamilyAuthoringJob({
    workerId: input.workerId ?? "authoring-worker",
    cap: input.cap,
    leaseDurationMs: workerPolicy?.leaseDurationMs,
  });
  if (!claimed) return "idle";
  if (claimed.family === "battlefield") {
    return runBattlefieldAuthoringJob(
      input.llm,
      claimed.attemptId,
      claimed.ownerUserId,
      claimed.executionFence,
    );
  }
  if (claimed.family === "narration_style") {
    return runNarrationStyleAuthoringJob(
      input.llm,
      claimed.attemptId,
      claimed.ownerUserId,
      claimed.executionFence,
    );
  }
  const attempt = await charAssetRepo.getCharacterAuthoringAttempt(
    claimed.attemptId,
    claimed.ownerUserId,
  );
  if (!attempt || ["succeeded", "discarded", "failed", "expired"].includes(attempt.status)) {
    await charAssetRepo.finishCharacterAuthoringJob(
      claimed.attemptId,
      "cancelled",
      claimed.executionFence,
    );
    return "idle";
  }
  try {
    const focused = await runCharacterFocusedAuthoringJobV3({
      llm: input.llm, attemptId: claimed.attemptId, ownerUserId: claimed.ownerUserId,
      executionFence: claimed.executionFence,
    });
    if (focused) return focused;
    throw new Error("CHARACTER_V3_AUTHORING_REQUIRED");
  } catch (error) {
    if (error instanceof Error && error.message === "AUTHORING_STALE_FENCE") {
      return "failed";
    }
    const message = error instanceof Error ? error.message : "authoring_failed";
    await charAssetRepo.failCharacterAuthoringAttempt({
      attemptId: claimed.attemptId,
      ownerUserId: claimed.ownerUserId,
      errorCode: message.slice(0, 120),
      executionFence: claimed.executionFence,
    });
    return "failed";
  }
}

export async function processNextCharacterAuthoringJob(input: {
  llm: LlmProvider;
  workerId?: string;
  cap?: number;
}): Promise<CharacterAuthoringJobResult> {
  return runCutoverBackgroundOperation({
    operationId: `authoring-worker:${randomUUID()}`,
    kind: "authoring-worker",
  }, () => processNextCharacterAuthoringJobCore(input));
}

export type AuthoringTaskDelivery = {
  outboxId: string;
  family: AuthoringFamily;
  attemptId: string;
  deliveryGeneration: number;
};

type ClaimedAuthoringTask = Exclude<
  Awaited<ReturnType<typeof claimFamilyAuthoringJob>>,
  "busy" | "terminal"
>;

async function runClaimedAuthoringTask(
  llm: LlmProvider,
  claimed: ClaimedAuthoringTask,
): Promise<"acknowledged" | "completed" | "failed" | "retry_queued"> {
  if (claimed.family === "battlefield") {
    return runBattlefieldAuthoringJob(
      llm,
      claimed.attemptId,
      claimed.ownerUserId,
      claimed.executionFence,
    );
  }
  if (claimed.family === "narration_style") {
    return runNarrationStyleAuthoringJob(
      llm,
      claimed.attemptId,
      claimed.ownerUserId,
      claimed.executionFence,
    );
  }
  const attempt = await charAssetRepo.getCharacterAuthoringAttempt(
    claimed.attemptId,
    claimed.ownerUserId,
  );
  if (!attempt || ["succeeded", "discarded", "failed", "expired"].includes(
    attempt.status,
  )) {
    await charAssetRepo.finishCharacterAuthoringJob(
      claimed.attemptId,
      "cancelled",
      claimed.executionFence,
    );
    return "acknowledged";
  }
  try {
    const focused = await runCharacterFocusedAuthoringJobV3({
      llm, attemptId: claimed.attemptId, ownerUserId: claimed.ownerUserId,
      executionFence: claimed.executionFence,
    });
    if (focused) return focused;
    throw new Error("CHARACTER_V3_AUTHORING_REQUIRED");
  } catch (error) {
    if (error instanceof Error && error.message === "AUTHORING_STALE_FENCE") {
      return "retry_queued";
    }
    const message = error instanceof Error ? error.message : "authoring_failed";
    await charAssetRepo.failCharacterAuthoringAttempt({
      attemptId: claimed.attemptId,
      ownerUserId: claimed.ownerUserId,
      errorCode: message.slice(0, 120),
      executionFence: claimed.executionFence,
    });
    return "failed";
  }
}

async function processAuthoringTaskCore(input: {
  llm: LlmProvider;
  delivery: AuthoringTaskDelivery;
  workerId: string;
  cap?: number;
}): Promise<"acknowledged" | "completed" | "failed" | "retry_queued"> {
  const workerPolicy = input.llm.semanticAuthoringProvider
    ? input.llm.semanticAuthoringWorkerPolicy
    : undefined;
  if (input.llm.semanticAuthoringProvider && !workerPolicy) {
    throw new Error("SEMANTIC_AUTHORING_WORKER_POLICY_REQUIRED");
  }
  const active = await getAuthoringOutboxDelivery(input.delivery);
  if (active === "acknowledged") return active;
  const claimed = await claimFamilyAuthoringJob({
    family: input.delivery.family,
    attemptId: input.delivery.attemptId,
    workerId: input.workerId,
    cap: input.cap,
    leaseDurationMs: workerPolicy?.leaseDurationMs,
  });
  if (claimed === "terminal") {
    await completeAuthoringOutboxDelivery(input.delivery);
    return "acknowledged";
  }
  if (claimed === "busy") {
    await deferAuthoringOutboxDelivery(input.delivery);
    return "retry_queued";
  }

  let leaseFailure: Error | null = null;
  const heartbeat = setInterval(() => {
    void renewFamilyAuthoringFence(
      claimed.family,
      claimed.attemptId,
      claimed.executionFence,
      workerPolicy?.leaseDurationMs,
    ).catch((error) => {
      leaseFailure = error instanceof Error
        ? error
        : new Error("AUTHORING_STALE_FENCE");
    });
  }, Math.floor((workerPolicy?.leaseDurationMs ?? 180_000) / 3));
  heartbeat.unref();
  try {
    const result = await runClaimedAuthoringTask(input.llm, claimed);
    if (leaseFailure) return "retry_queued";
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === "AUTHORING_STALE_FENCE") {
      await deferAuthoringOutboxDelivery(input.delivery);
      return "retry_queued";
    }
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

export async function processAuthoringTask(input: {
  llm: LlmProvider;
  delivery: AuthoringTaskDelivery;
  workerId: string;
  cap?: number;
}): Promise<"acknowledged" | "completed" | "failed" | "retry_queued"> {
  return runCutoverBackgroundOperation({
    operationId:
      `authoring-worker:${input.delivery.outboxId}:${input.delivery.deliveryGeneration}`,
    kind: "authoring-worker",
  }, () => processAuthoringTaskCore(input));
}

export async function drainCharacterAuthoringJobs(input: {
  llm: LlmProvider;
  workerId?: string;
  cap?: number;
  limit?: number;
}): Promise<void> {
  if (!await cutoverAllowsGeneralWork()) return;
  const deadline = Date.now() + 10_000;
  for (let i = 0; i < (input.limit ?? 32) && Date.now() < deadline; i += 1) {
    const result = await processNextCharacterAuthoringJob(input);
    if (result !== "idle") continue;
    const open = await countOpenFamilyAuthoringJobs();
    if (open === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export function wakeCharacterAuthoringJobs(llm: LlmProvider): void {
  setImmediate(() => {
    void cutoverAllowsGeneralWork().then((allowed) => {
      if (!allowed) return;
      return processNextCharacterAuthoringJob({ llm });
    }).catch((error) => {
      console.error("[authoring] job wake failed", error);
    });
  });
}

export function authoringAcceptedFromAttempt(attempt: {
  attemptId: string;
  characterId?: string;
  kind: "create" | "revision" | "upgrade";
  status: Parameters<typeof toAssetAuthoringProgress>[1];
}) {
  return {
    attemptId: attempt.attemptId,
    characterId: attempt.characterId ?? attempt.attemptId,
    kind: attempt.kind,
    progress: toAssetAuthoringProgress(
      attempt.kind,
      attempt.status,
      attempt.attemptId,
    ),
  };
}
