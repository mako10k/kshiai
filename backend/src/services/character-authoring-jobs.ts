import { toAssetAuthoringProgress } from "@kshiai/shared";
import { findCharacterNameConflict } from "../character-name-uniqueness.js";
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
import * as charRepo from "../repositories/characters.js";
import type { LlmProvider } from "../llm/types.js";
import {
  adjustedGenerationResult,
  buildCharacterGenerationCandidate,
  existingCharacterGenerationResult,
  lastAuthoringAdjustment,
  sheetFromAuthoringCandidate,
} from "./character-authoring-service.js";

export type CharacterAuthoringJobResult = "idle" | "completed" | "failed";

function reportStatus(
  attemptId: string,
  ownerUserId: string,
  executionFence: AuthoringExecutionFence,
) {
  return (status: Parameters<
    typeof charAssetRepo.updateCharacterAuthoringStatus
  >[0]["status"]) =>
    charAssetRepo.updateCharacterAuthoringStatus({
      attemptId,
      ownerUserId,
      status,
      executionFence,
    });
}

async function generateCreateSheet(
  llm: LlmProvider,
  ownerUserId: string,
  prompt: string,
) {
  const referenceTools = {
    search: async (query: string, limit?: number) =>
      charRepo.searchOwnedCharacterReferences(ownerUserId, query, limit),
    get: async (characterId: string) =>
      charRepo.getOwnedCharacterReference(ownerUserId, characterId),
  };
  const rejectedNames: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const promptReservedNames =
      await charRepo.listOwnedCharacterReservedNames(ownerUserId);
    const candidate = await llm.generateCharacter({
      prompt,
      referenceTools,
      reservedNames: promptReservedNames,
      rejectedNames,
    });
    const currentReservedNames =
      await charRepo.listOwnedCharacterReservedNames(ownerUserId);
    const conflict = findCharacterNameConflict(
      [candidate.sheet.displayName, candidate.sheet.identity?.realName],
      currentReservedNames,
    );
    if (!conflict) return candidate;
    rejectedNames.push(
      candidate.sheet.displayName,
      ...(candidate.sheet.identity?.realName
        ? [candidate.sheet.identity.realName]
        : []),
    );
  }
  return null;
}

async function runClaimedAttempt(
  llm: LlmProvider,
  attempt: charAssetRepo.CharacterAuthoringAttempt,
  executionFence: AuthoringExecutionFence,
): Promise<void> {
  const sourceText = attempt.sourceText ?? "";
  await charAssetRepo.updateCharacterAuthoringStatus({
    attemptId: attempt.attemptId,
    ownerUserId: attempt.ownerUserId,
    status: "generating_structure",
    executionFence,
  });
  const existing = await charRepo.getSheetIncludingDeleted(attempt.characterId);
  const adjustMessage = lastAuthoringAdjustment(sourceText);
  if (attempt.candidate && adjustMessage) {
    const current = sheetFromAuthoringCandidate({
      characterId: attempt.characterId,
      ownerUserId: attempt.ownerUserId,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
      candidate: attempt.candidate,
      existing,
    });
    const generated = adjustedGenerationResult(
      current,
      await llm.adjustCharacter(current, adjustMessage),
    );
    const candidate = await buildCharacterGenerationCandidate({
      llm,
      attemptId: attempt.attemptId,
      characterId: attempt.characterId,
      ownerUserId: attempt.ownerUserId,
      sourceText,
      sourceKind: attempt.kind === "upgrade"
        ? "upgrade_description"
        : attempt.kind === "revision"
          ? "revision_instruction"
          : "create_instruction",
      generated,
      existing,
      reportStatus: reportStatus(
        attempt.attemptId,
        attempt.ownerUserId,
        executionFence,
      ),
    });
    await charAssetRepo.saveCharacterAuthoringCandidate({
      attemptId: attempt.attemptId,
      ownerUserId: attempt.ownerUserId,
      envelope: candidate.envelope,
      assistantMessage: candidate.assistantMessage,
      executionFence,
    });
    return;
  }
  if (attempt.kind === "create") {
    const gen = await generateCreateSheet(llm, attempt.ownerUserId, sourceText);
    if (!gen) {
      await charAssetRepo.failCharacterAuthoringAttempt({
        attemptId: attempt.attemptId,
        ownerUserId: attempt.ownerUserId,
        errorCode: "duplicate_character_name",
        executionFence,
      });
      return;
    }
    const candidate = await buildCharacterGenerationCandidate({
      llm,
      attemptId: attempt.attemptId,
      characterId: attempt.characterId,
      ownerUserId: attempt.ownerUserId,
      sourceText,
      sourceKind: "create_instruction",
      generated: gen,
      reportStatus: reportStatus(
        attempt.attemptId,
        attempt.ownerUserId,
        executionFence,
      ),
    });
    await charAssetRepo.saveCharacterAuthoringCandidate({
      attemptId: attempt.attemptId,
      ownerUserId: attempt.ownerUserId,
      envelope: candidate.envelope,
      assistantMessage: candidate.assistantMessage,
      executionFence,
    });
    return;
  }
  if (!existing) throw new Error("CHARACTER_NOT_FOUND");
  const generated = attempt.kind === "upgrade"
    ? existingCharacterGenerationResult(existing)
    : adjustedGenerationResult(
      existing,
      await llm.adjustCharacter(existing, sourceText),
    );
  const candidate = await buildCharacterGenerationCandidate({
    llm,
    attemptId: attempt.attemptId,
    characterId: attempt.characterId,
    ownerUserId: attempt.ownerUserId,
    sourceText,
    sourceKind: attempt.kind === "upgrade"
      ? "upgrade_description"
      : "revision_instruction",
    generated,
    existing,
    reportStatus: reportStatus(
      attempt.attemptId,
      attempt.ownerUserId,
      executionFence,
    ),
  });
  await charAssetRepo.saveCharacterAuthoringCandidate({
    attemptId: attempt.attemptId,
    ownerUserId: attempt.ownerUserId,
    envelope: candidate.envelope,
    assistantMessage: candidate.assistantMessage,
    executionFence,
  });
}

export async function processNextCharacterAuthoringJob(input: {
  llm: LlmProvider;
  workerId?: string;
  cap?: number;
}): Promise<CharacterAuthoringJobResult> {
  const claimed = await claimNextFamilyAuthoringJob({
    workerId: input.workerId ?? "authoring-worker",
    cap: input.cap,
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
    await runClaimedAttempt(input.llm, attempt, claimed.executionFence);
    const latest = await charAssetRepo.getCharacterAuthoringAttempt(
      claimed.attemptId,
      claimed.ownerUserId,
    );
    if (latest?.status === "failed") {
      return "failed";
    }
    await charAssetRepo.finishCharacterAuthoringJob(
      claimed.attemptId,
      "completed",
      claimed.executionFence,
    );
    return "completed";
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
    await runClaimedAttempt(llm, attempt, claimed.executionFence);
    const latest = await charAssetRepo.getCharacterAuthoringAttempt(
      claimed.attemptId,
      claimed.ownerUserId,
    );
    if (latest?.status === "failed") return "failed";
    await charAssetRepo.finishCharacterAuthoringJob(
      claimed.attemptId,
      "completed",
      claimed.executionFence,
    );
    return "completed";
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

export async function processAuthoringTask(input: {
  llm: LlmProvider;
  delivery: AuthoringTaskDelivery;
  workerId: string;
  cap?: number;
}): Promise<"acknowledged" | "completed" | "failed" | "retry_queued"> {
  const active = await getAuthoringOutboxDelivery(input.delivery);
  if (active === "acknowledged") return active;
  const claimed = await claimFamilyAuthoringJob({
    family: input.delivery.family,
    attemptId: input.delivery.attemptId,
    workerId: input.workerId,
    cap: input.cap,
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
    ).catch((error) => {
      leaseFailure = error instanceof Error
        ? error
        : new Error("AUTHORING_STALE_FENCE");
    });
  }, Math.floor(180_000 / 3));
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

export async function drainCharacterAuthoringJobs(input: {
  llm: LlmProvider;
  workerId?: string;
  cap?: number;
  limit?: number;
}): Promise<void> {
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
    void processNextCharacterAuthoringJob({ llm }).catch((error) => {
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
