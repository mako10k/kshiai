// R: Advance one fixed trial through existing battle and narration services and retain its observable snapshots.
import { AwarenessObservedPolicy, type AwarenessPolicyV1 } from "@kshiai/shared";
import { setTimeout as delay } from "node:timers/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getBattle } from "../repositories/battles.js";
import { getAwarenessRuntime } from "../repositories/battle-awareness.js";
import { listLlmUsageAttempts } from "../repositories/llm-usage.js";
import { startBattle, advanceTurn } from "./battle-service.js";
import { createLlmNarrationGenerator, processNextNarration, listNarrationEvents } from "./narration-worker.js";
import { calculateLlmUsageCostReport } from "./llm-usage-cost-report.js";
import type { LlmProvider } from "../llm/types.js";
import type { AwarenessTrialCandidate } from "./awareness-trial-candidate.js";
import { query } from "../db.js";

export async function executeAwarenessTrial(input: {
  candidate: AwarenessTrialCandidate; directory: string; userId: string; battlefieldId: string; llm: LlmProvider; policy?: AwarenessPolicyV1;
}) {
  const battleId = "awareness-real-trial-2026-10-05";
  const policy = input.policy ?? AwarenessObservedPolicy;
  const snapshots: Array<{ phase: string; battle: Awaited<ReturnType<typeof getBattle>>; awareness: Awaited<ReturnType<typeof getAwarenessRuntime>> }> = [];
  const generator = createLlmNarrationGenerator(input.llm);
  let stopping = false;
  let worker: Promise<void> | undefined;
  let errorClass: string | null = null;
  const capture = async (phase: string) => {
    snapshots.push({ phase, battle: await getBattle(battleId), awareness: await getAwarenessRuntime(battleId) });
    writeFileSync(join(input.directory, "snapshots.json"), JSON.stringify(snapshots, null, 2), { mode: 0o600 });
  };
  try {
    const [a, b] = input.candidate.characters;
    if (!a || !b) throw new Error("TRIAL_CHARACTER_PAIR_REQUIRED");
    await startBattle({ userId: input.userId, battleId, myCharacterId: a.sheet.id,
      opponentCharacterId: b.sheet.id, battlefieldMode: "preset", battlefieldPresetId: input.battlefieldId, llm: input.llm, awarenessPolicy: policy });
    await capture("created");
    worker = (async () => {
      while (!stopping) {
        const state = await getAwarenessRuntime(battleId);
        if (!state || Date.now() >= state.runtime.deadlineAt) break;
        const outcome = await processNextNarration({ battleId, ownerId: "trial-narration-worker", generator });
        if (outcome === "failed") { errorClass ??= "NarrationFailed"; stopping = true; break; }
        await delay(250);
      }
    })();
    // Attach rejection handling immediately; report worker failure when joining it below.
    void worker.catch((error: unknown) => {
      errorClass ??= error instanceof Error ? error.name : "UnknownWorkerError";
      stopping = true;
    });
    if (stopping) throw new Error("TRIAL_WORKER_STOPPED");
    await advanceTurn({ userId: input.userId, battleId, operationId: "trial-prologue", llm: input.llm });
    await capture("prologue");
    for (let tick = 1; tick <= input.candidate.scenario.combatTicks; tick += 1) {
      await delay(1050);
      if (stopping || (await getBattle(battleId))?.status !== "active") break;
      await advanceTurn({ userId: input.userId, battleId, operationId: `trial-tick-${tick}`, llm: input.llm });
      await capture(`tick-${tick}`);
    }
  } catch (error) {
    errorClass ??= error instanceof Error ? error.name : "UnknownError";
  } finally {
    // Stop new world ticks while already-issued thoughts and narration finish within their existing deadlines.
    const state = await getAwarenessRuntime(battleId);
    const drainDeadline = Math.min(state?.runtime.deadlineAt ?? Date.now(), Date.now() + policy.narration.publicationDeadlineMs);
    while (Date.now() < drainDeadline) {
      const outstanding = (await listLlmUsageAttempts({ battleId })).some((attempt) => attempt.status === "started");
      const pendingState = await getAwarenessRuntime(battleId);
      const physicalOutstanding = pendingState?.runtime.budget.physicalOutstanding ?? 0;
      const pendingThought = pendingState && Object.values(pendingState.runtime.sides).some((side) => side.job?.physicalStatus === "outstanding");
      const queued = await query<{ count: number }>("SELECT COUNT(*) AS count FROM battle_narration_entries WHERE battle_id=$1 AND status IN ('queued','generating')", [battleId]);
      if (!outstanding && physicalOutstanding === 0 && !pendingThought && Number(queued.rows[0]?.count) === 0) break;
      if (stopping && !outstanding && physicalOutstanding === 0 && !pendingThought) break;
      await delay(250);
    }
    stopping = true;
    try { await worker; } catch (error) { errorClass ??= error instanceof Error ? error.name : "UnknownWorkerError"; }
    await capture("readback");
  }
  const attempts = await listLlmUsageAttempts({ battleId });
  const events = await listNarrationEvents(battleId);
  const queue = await query<{ receipt_id: string; status: string }>("SELECT receipt_id,status FROM battle_narration_entries WHERE battle_id=$1 ORDER BY sequence", [battleId]);
  const finalState = await getAwarenessRuntime(battleId);
  const unresolvedReservationIds = finalState?.runtime.budget.reservations.filter((item) => item.physicalOutstanding).map((item) => item.id) ?? [];
  const unmergedConsciousJobs = finalState ? Object.values(finalState.runtime.sides).flatMap((side) => side.job && ["running", "ready"].includes(side.job.status) ? [side.job] : []) : [];
  const report = { battleId, errorClass, snapshots, attempts, narrationEvents: events, narrationQueue: queue.rows,
    usage: calculateLlmUsageCostReport(attempts),
    unresolvedAttemptIds: attempts.filter((attempt) => attempt.status === "started").map((attempt) => attempt.id),
    unresolvedReservationIds, unmergedConsciousJobs,
    unknownCostReservationIds: finalState?.runtime.budget.unknownAttemptIds ?? [],
    missingUsageAttemptIds: attempts.filter((attempt) => attempt.promptTokens === null || attempt.completionTokens === null || attempt.totalTokens === null).map((attempt) => attempt.id),
    pendingNarrationReceiptIds: queue.rows.filter((entry) => ["queued", "generating"].includes(entry.status)).map((entry) => entry.receipt_id),
    completedCombatTicks: snapshots.at(-1)?.battle?.combatTick ?? 0,
  };
  writeFileSync(join(input.directory, "readback.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  return { battleId, errorClass, completedCombatTicks: report.completedCombatTicks,
    unresolvedAttemptCount: report.unresolvedAttemptIds.length + unresolvedReservationIds.length,
    pendingNarrationCount: report.pendingNarrationReceiptIds.length,
    missingUsageAttemptCount: report.missingUsageAttemptIds.length,
  };
}
