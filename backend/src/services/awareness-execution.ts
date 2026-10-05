import { applyAwarenessTickBoundary, assertAwarenessTickLimit, hasAwarenessExpiry, shouldStartAwarenessThought } from "./awareness-execution-boundary.js";
import { verifyAwarenessExecutionProof as verifyProof } from "./awareness-execution-admission.js";
// R: Orchestrate durable subjective tick preparation through bounded storage and model ports.
import { LlmPhysicalCompletionError } from "../llm/llm-physical-completion.js";
import { withLlmUsageScope } from "../llm/llm-usage-context.js";
import {
  AwarenessAcceptLatent, AwarenessApplyConsciousReady, AwarenessAvailableInfluences,
  AwarenessCancelGeneration, AwarenessConsumeMailbox, AwarenessExpireDesires,
  AwarenessSelectDesires, AwarenessStartConsciousJob,
  AwarenessConsciousInputSchema, AwarenessLatentInputSchema,
  type AwarenessConsciousInput, type AwarenessConsciousOutput,
  type AwarenessLatentInput, type AwarenessLatentOutput, type AwarenessPipelineState,
} from "@kshiai/shared";
import type { AwarenessRuntimeSnapshot, AwarenessRuntimeWrite, AwarenessAttemptSettlement } from "../repositories/battle-awareness.js";
import type { BattleLeaseFence } from "./distributed-guard.js";

export type AwarenessExecutionContext = Pick<AwarenessLatentInput,
  "character" | "characteristics" | "training" | "availableActions" | "facts" | "perception"> & {
  stimuli: AwarenessLatentInput["stimuli"];
  consciousCharacteristics: string[];
  consciousTraining: string[];
  receivedSpeech: boolean;
  intentCompleted: boolean;
  intentInvalid: boolean;
};

/** This proof covers the complete rendered system/user input and maximum provider charge. */
export type AwarenessDispatchProof = {
  mode?: "certified"; requestDigest: string; verifiedFullPrompt: true;
  inputTokens: number; outputTokenLimit: number; maximumChargeUsd: number;
} | {
  mode: "observed"; requestDigest: string; verifiedFullPrompt: false;
  inputTokens: null; outputTokenLimit: number; maximumChargeUsd: null;
};

export interface AwarenessExecutionAdmission {
  verify(request: { role: "subconscious"; input: AwarenessLatentInput } |
    { role: "conscious"; input: AwarenessConsciousInput }): Promise<AwarenessDispatchProof | null>;
}

export type AwarenessModelReceipt<Output> = {
  output: Output;
  actualUsd: number | null;
  physicalClosed: boolean;
};

export interface AwarenessExecutionModels {
  subconscious(input: AwarenessLatentInput, proof: AwarenessDispatchProof): Promise<AwarenessModelReceipt<AwarenessLatentOutput>>;
  conscious(input: AwarenessConsciousInput, proof: AwarenessDispatchProof): Promise<AwarenessModelReceipt<AwarenessConsciousOutput>>;
}

export interface AwarenessExecutionStorage {
  read(battleId: string): Promise<AwarenessRuntimeSnapshot>;
  update(input: AwarenessRuntimeWrite, reduce: (state: AwarenessPipelineState) => AwarenessPipelineState): Promise<AwarenessRuntimeSnapshot>;
  reserve(input: AwarenessRuntimeWrite, attempt: { id: string; role: "subconscious" | "conscious"; maximumUsd: number | null }): Promise<AwarenessRuntimeSnapshot>;
  settle(input: AwarenessAttemptSettlement & { battleId: string; finishedAt: number }): Promise<AwarenessRuntimeSnapshot>;
  completeThought(input: {
    battleId: string; side: "a" | "b"; jobId: string; generation: number; jobFence: number; finishedAt: number;
    outcome: { kind: "succeeded"; result: AwarenessConsciousOutput } | { kind: "failed"; reason: string };
    settlement?: AwarenessAttemptSettlement;
  }): Promise<{ accepted: boolean; snapshot: AwarenessRuntimeSnapshot }>;
}

export interface AwarenessExecutionClock {
  now(): number;
  /** Timeout does not imply provider cancellation or physical termination. */
  withDeadline<T>(promise: Promise<T>, deadlineAt: number): Promise<T>;
}

export type AwarenessPrepareTickInput = {
  battleId: string;
  phase: "prologue" | "turn" | "aftermath";
  tick: number;
  sides: { a: AwarenessExecutionContext; b: AwarenessExecutionContext };
  now: number;
  battleLeaseFence: BattleLeaseFence;
};

export type AwarenessPreparedTick = {
  snapshot: AwarenessRuntimeSnapshot;
  selected: { a: ReturnType<typeof AwarenessSelectDesires>; b: ReturnType<typeof AwarenessSelectDesires> };
  canCommitWorld: boolean;
};

type Ports = {
  storage: AwarenessExecutionStorage;
  models: AwarenessExecutionModels;
  admission: AwarenessExecutionAdmission;
  clock: AwarenessExecutionClock;
};

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) || "AWARENESS_MODEL_FAILURE" : "AWARENESS_MODEL_FAILURE";
}

function settlement(id: string, actualUsd: number | null, physicalClosed: boolean): AwarenessAttemptSettlement {
  return { id, outcome: actualUsd !== null && physicalClosed ? "settled" : "unknown",
    actualUsd: actualUsd !== null && physicalClosed ? actualUsd : null, physicalOutstanding: !physicalClosed };
}


export function createAwarenessExecution(ports: Ports): { prepareTick(input: AwarenessPrepareTickInput): Promise<AwarenessPreparedTick> } {
  const { storage, models, admission, clock } = ports;

  function writeInput(input: AwarenessPrepareTickInput, snapshot: AwarenessRuntimeSnapshot): AwarenessRuntimeWrite {
    return { battleId: input.battleId, expectedRevision: snapshot.revision,
      fence: input.battleLeaseFence, now: new Date(clock.now()).toISOString() };
  }

  async function update(input: AwarenessPrepareTickInput, reduce: (state: AwarenessPipelineState) => AwarenessPipelineState) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const snapshot = await storage.read(input.battleId);
      try { return await storage.update(writeInput(input, snapshot), reduce); }
      catch (error) {
        if (!(error instanceof Error) || error.message !== "AWARENESS_REVISION_OR_LEASE_CONFLICT" || attempt === 4) throw error;
      }
    }
    throw new Error("AWARENESS_REVISION_OR_LEASE_CONFLICT");
  }

  async function incomplete(input: AwarenessPrepareTickInput, reason: string) {
    return update(input, (state) => state.status === "active"
      ? { ...state, status: "incomplete", incompleteReason: reason.slice(0, 400),
        sides: { a: AwarenessCancelGeneration(state.sides.a), b: AwarenessCancelGeneration(state.sides.b) } }
      : state);
  }

  function privateContext(context: AwarenessExecutionContext, conscious = false) {
    return { character: context.character,
      characteristics: conscious ? context.consciousCharacteristics : context.characteristics,
      training: conscious ? context.consciousTraining : context.training,
      availableActions: context.availableActions, facts: context.facts, perception: context.perception };
  }

  async function reserve(input: AwarenessPrepareTickInput, id: string, role: "subconscious" | "conscious", proof: AwarenessDispatchProof) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await storage.read(input.battleId);
      try { return await storage.reserve(writeInput(input, current), { id, role, maximumUsd: proof.maximumChargeUsd }); }
      catch (error) {
        if (!(error instanceof Error) || error.message !== "AWARENESS_REVISION_OR_LEASE_CONFLICT" || attempt === 4) throw error;
      }
    }
    throw new Error("AWARENESS_REVISION_OR_LEASE_CONFLICT");
  }

  async function startThought(input: AwarenessPrepareTickInput, side: "a" | "b") {
    const current = await storage.read(input.battleId);
    const state = current.runtime.sides[side];
    if (!shouldStartAwarenessThought(current.runtime, side, input.tick)) return;
    const frozen = AwarenessConsciousInputSchema.parse({ ...privateContext(input.sides[side], true), side, sourceTick: input.tick,
      feltProjection: state.latent.feltProjection, consciousState: state.conscious });
    const proof = verifyProof(await admission.verify({ role: "conscious", input: frozen }), current.runtime.policy, "conscious");
    const id = `${input.battleId}:thought:${side}:${state.generation + 1}:${input.tick}`;
    await reserve(input, id, "conscious", proof);
    const startedAt = clock.now();
    const stored = await update(input, (runtime) => {
      const latest = runtime.sides[side];
      const started = AwarenessStartConsciousJob(latest, { id, startedAt,
        deadlineAt: Math.min(startedAt + runtime.policy.roles.conscious.deadlineMs, runtime.deadlineAt), snapshot: frozen });
      return { ...runtime, sides: { ...runtime.sides, [side]: { ...started,
        execution: { ...started.execution, lastConsciousStartTick: input.tick,
          pendingReconsider: false, pendingSpeech: false, pendingInvalid: false, pendingCompleted: false } } } };
    });
    const persistedJob = stored.runtime.sides[side].job;
    if (!persistedJob) throw new Error("AWARENESS_JOB_PERSISTENCE_MISSING");
    const stamp = { battleId: input.battleId, side, jobId: id, generation: persistedJob.generation,
      jobFence: persistedJob.fence };
    let request: Promise<AwarenessModelReceipt<AwarenessConsciousOutput>>;
    try { request = withLlmUsageScope({ battleId: input.battleId, role: "conscious", side, tick: persistedJob.sourceTick }, () => models.conscious(persistedJob.input, proof)); }
    catch (error) { request = Promise.reject(error); }
    // Keep observing the physical promise after logical timeout; never retransmit on restart.
    void request.then(
      (receipt) => storage.completeThought({ ...stamp, finishedAt: clock.now(),
        outcome: { kind: "succeeded", result: receipt.output },
        settlement: settlement(id, receipt.actualUsd, receipt.physicalClosed) }),
      (error: unknown) => storage.completeThought({ ...stamp, finishedAt: clock.now(),
        outcome: { kind: "failed", reason: errorReason(error) },
        settlement: settlement(id, null, error instanceof LlmPhysicalCompletionError) }),
    ).catch(() => { /* The persisted outstanding reservation remains fail-closed for recovery. */ });
  }

  async function prepareLatent(input: AwarenessPrepareTickInput, side: "a" | "b", expiredAtBoundary: boolean) {
    const current = await storage.read(input.battleId);
    const state = current.runtime.sides[side];
    if (state.latentAcceptedTick === input.tick) return;
    const context = input.sides[side];
    const mailbox = AwarenessAvailableInfluences(state, input.tick);
    const expires = state.desires.some((item) => item.validUntilTick <= input.tick) ||
      state.latent.tendencies.some((item) => item.validUntilTick <= input.tick);
    const required = state.latentAcceptedTick === null || context.stimuli.length > 0 || mailbox.length > 0 || expires || expiredAtBoundary ||
      state.execution.perceptionRevision !== context.perception.revision ||
      input.tick - state.latent.updatedTick >= current.runtime.policy.latentReassessmentTicks;
    if (!required) return;
    const frame = AwarenessLatentInputSchema.parse({ ...privateContext(context), side, tick: input.tick,
      currentState: state.latent, stimuli: context.stimuli, influences: mailbox.map((entry) => entry.influence) });
    const proof = verifyProof(await admission.verify({ role: "subconscious", input: frame }), current.runtime.policy, "subconscious");
    const id = `${input.battleId}:latent:${side}:${input.tick}`;
    await reserve(input, id, "subconscious", proof);
    const deadlineAt = Math.min(clock.now() + current.runtime.policy.roles.subconscious.deadlineMs, current.runtime.deadlineAt);
    let request: Promise<AwarenessModelReceipt<AwarenessLatentOutput>>;
    try { request = withLlmUsageScope({ battleId: input.battleId, role: "subconscious", side, tick: input.tick }, () => models.subconscious(frame, proof)); }
    catch (error) { request = Promise.reject(error); }
    const accounted = request.then(async (receipt) => {
      await storage.settle({ battleId: input.battleId, finishedAt: clock.now(), ...settlement(id, receipt.actualUsd, receipt.physicalClosed) });
      return receipt;
    }, async (error: unknown) => {
      await storage.settle({ battleId: input.battleId, finishedAt: clock.now(), ...settlement(id, null, error instanceof LlmPhysicalCompletionError) });
      throw error;
    });
    const receipt = await clock.withDeadline(accounted, deadlineAt);
    if (clock.now() >= deadlineAt) throw new Error("AWARENESS_LATENT_DEADLINE_EXCEEDED");
    await update(input, (runtime) => {
      if (runtime.status !== "active") return runtime;
      const latest = runtime.sides[side];
      if (latest.latentAcceptedTick === input.tick) return runtime;
      let next = AwarenessConsumeMailbox(AwarenessAcceptLatent(latest, receipt.output, input.tick), mailbox.map((entry) => entry.id), input.tick);
      const cancelAllowed = next.execution.lastCancelTick === null || input.tick - next.execution.lastCancelTick >= 3;
      if (receipt.output.cancelThought && cancelAllowed && next.job && (next.job.status === "running" || next.job.status === "ready")) {
        next = AwarenessCancelGeneration(next);
        next = { ...next, execution: { ...next.execution, lastCancelTick: input.tick, pendingReconsider: true } };
      }
      return { ...runtime, sides: { ...runtime.sides, [side]: { ...next,
        execution: { ...next.execution, perceptionRevision: context.perception.revision,
          pendingReconsider: next.execution.pendingReconsider || receipt.output.reconsider || receipt.output.cancelThought } } } };
    });
  }

  function prepared(snapshot: AwarenessRuntimeSnapshot, tick: number, canCommitWorld: boolean): AwarenessPreparedTick {
    return { snapshot, selected: {
      a: AwarenessSelectDesires(snapshot.runtime.sides.a.desires, tick, snapshot.runtime.sides.a.acceptedDesireIds),
      b: AwarenessSelectDesires(snapshot.runtime.sides.b.desires, tick, snapshot.runtime.sides.b.acceptedDesireIds),
    }, canCommitWorld };
  }

  return { async prepareTick(input) {
    let snapshot = await storage.read(input.battleId);
    if (snapshot.runtime.status !== "active") return prepared(snapshot, input.tick, false);
    if (input.phase === "aftermath") {
      snapshot = await update(input, (state) => ({ ...state, status: "terminal", terminalAt: state.terminalAt ?? clock.now(), incompleteReason: null,
        sides: { a: AwarenessCancelGeneration(state.sides.a), b: AwarenessCancelGeneration(state.sides.b) } }));
      return prepared(snapshot, input.tick, false);
    }
    try {
      assertAwarenessTickLimit(snapshot.runtime, input.tick, () => clock.now());
      if (snapshot.runtime.lastCommittedAt !== null && input.tick !== snapshot.runtime.preparedTick &&
          clock.now() - snapshot.runtime.lastCommittedAt < snapshot.runtime.policy.minTickIntervalMs) {
        return prepared(snapshot, input.tick, false);
      }
      // Only results present at this boundary may merge; arrivals during this tick remain ready.
      const readyIds = { a: snapshot.runtime.sides.a.job?.status === "ready" ? snapshot.runtime.sides.a.job.id : null,
        b: snapshot.runtime.sides.b.job?.status === "ready" ? snapshot.runtime.sides.b.job.id : null };
      const expiry = { a: hasAwarenessExpiry(snapshot.runtime.sides.a, input.tick), b: hasAwarenessExpiry(snapshot.runtime.sides.b, input.tick) };
      if (input.sides.a.stimuli.length > snapshot.runtime.policy.maxStimuli ||
          input.sides.b.stimuli.length > snapshot.runtime.policy.maxStimuli) throw new Error("AWARENESS_STIMULUS_CAPACITY_EXCEEDED");
      snapshot = await update(input, (state) => applyAwarenessTickBoundary(state, input, readyIds, () => clock.now()));
      // Launch both frozen thoughts before awaiting either compulsory latent result.
      await startThought(input, "a");
      await startThought(input, "b");
      const latent = await Promise.allSettled([prepareLatent(input, "a", expiry.a), prepareLatent(input, "b", expiry.b)]);
      const failure = latent.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failure) throw failure.reason;
      snapshot = await update(input, (state) => {
        const sides = { ...state.sides };
        for (const side of ["a", "b"] as const) {
          const merged = state.cutoffTick === input.tick ? sides[side] : AwarenessApplyConsciousReady(sides[side], input.tick);
          const accepted = merged.conscious.updatedTick === input.tick ?
            { ...merged, execution: { ...merged.execution, consecutiveConsciousFailures: 0 } } : merged;
          const expired = AwarenessExpireDesires(accepted, input.tick);
          const selected = AwarenessSelectDesires(expired.desires, input.tick, expired.acceptedDesireIds);
          sides[side] = { ...expired, acceptedDesireIds: [selected.body?.id, selected.voice?.id].filter((id): id is string => id !== undefined) };
        }
        return { ...state, cutoffTick: input.tick, sides };
      });
      return prepared(snapshot, input.tick, snapshot.runtime.status === "active");
    } catch (error) {
      // A stale/expired world lease is a retry boundary, not authority to mark another owner's run.
      if (error instanceof Error && error.message === "AWARENESS_REVISION_OR_LEASE_CONFLICT") throw error;
      return prepared(await incomplete(input, errorReason(error)), input.tick, false);
    }
  } };
}
