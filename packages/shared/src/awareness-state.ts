// R: Apply pure once-only subjective state transitions and resource conflict selection.
import {
  AwarenessDefaultPolicy, AwarenessPipelineStateSchema, AwarenessConsciousInputSchema,
  AwarenessConsciousOutputSchema, AwarenessLatentOutputSchema, AwarenessConsciousJobSchema,
  type AwarenessCharacterState, type AwarenessConsciousInput, type AwarenessConsciousJob,
  type AwarenessConsciousOutput, type AwarenessDesire, type AwarenessLatentOutput,
  type AwarenessMailboxEntry, type AwarenessPipelineState,
} from "./awareness-pipeline.js";

export function AwarenessInitialCharacterState(): AwarenessCharacterState {
  return { execution: { perceptionRevision: null, lastConsciousStartTick: null, lastCancelTick: null, pendingReconsider: false, pendingSpeech: false, pendingInvalid: false, pendingCompleted: false, consecutiveConsciousFailures: 0, lastFailureJobId: null, unknownSinceTick: null, unknownSinceAt: null }, latent: { updatedTick: 0, sensations: [], emotions: [], tendencies: [], feltProjection: "" },
    latentAcceptedTick: null, issuedDesireIds: [], conscious: { goal: null, thought: "", updatedTick: null }, desires: [], acceptedDesireIds: [],
    generation: 0, fence: 0, job: null, mailbox: [] };
}
export function AwarenessInitialize(input: { startedAt: number; promptRevision: string; outputRevision: string; policy?: AwarenessPipelineState["policy"] }): AwarenessPipelineState {
  return AwarenessPipelineStateSchema.parse({ pipeline: "awareness-v5", ...input, policy: input.policy ?? AwarenessDefaultPolicy,
    tick: 0, preparedTick: null, cutoffTick: null, lastCommittedAt: null, terminalAt: null, revision: 0, deadlineAt: input.startedAt + (input.policy ?? AwarenessDefaultPolicy).maxDurationMs,
    status: "active", incompleteReason: null, sides: { a: AwarenessInitialCharacterState(), b: AwarenessInitialCharacterState() },
    budget: { physicalAttempts: 0, physicalOutstanding: 0, reservedUsd: 0, settledUsd: 0, unknownAttemptIds: [], reservations: [] } });
}
/** End tick is exclusive; no source has automatic precedence. */
export function AwarenessSelectDesires(desires: readonly AwarenessDesire[], currentTick: number, acceptedIds: readonly string[] = []): { body: Extract<AwarenessDesire, { resource: "body" }> | null; voice: Extract<AwarenessDesire, { resource: "voice" }> | null } {
  const accepted = new Set(acceptedIds);
  const active = desires.filter((desire) => desire.startTick <= currentTick && currentTick < desire.validUntilTick);
  active.sort((left, right) => right.strength - left.strength || Number(accepted.has(right.id)) - Number(accepted.has(left.id)) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return { body: active.find((desire): desire is Extract<AwarenessDesire, { resource: "body" }> => desire.resource === "body") ?? null,
    voice: active.find((desire): desire is Extract<AwarenessDesire, { resource: "voice" }> => desire.resource === "voice") ?? null };
}
export function AwarenessExpireDesires(state: AwarenessCharacterState, currentTick: number): AwarenessCharacterState {
  const desires = state.desires.filter((desire) => currentTick < desire.validUntilTick);
  const remaining = new Set(desires.map((desire) => desire.id));
  return { ...state, desires, acceptedDesireIds: state.acceptedDesireIds.filter((id) => remaining.has(id)), latent: { ...state.latent, tendencies: state.latent.tendencies.filter((item) => currentTick < item.validUntilTick) } };
}
function mergeDesires(current: readonly AwarenessDesire[], incoming: readonly AwarenessDesire[], issuedIds: readonly string[]): AwarenessDesire[] {
  const ids = new Set(issuedIds);
  if (incoming.some((desire) => ids.has(desire.id))) throw new Error("AWARENESS_DESIRE_ID_REUSED");
  if (new Set(incoming.map((desire) => desire.id)).size !== incoming.length) throw new Error("AWARENESS_DESIRE_ID_DUPLICATED");
  return [...current, ...incoming];
}
export function AwarenessAcceptLatent(state: AwarenessCharacterState, output: AwarenessLatentOutput, currentTick: number): AwarenessCharacterState {
  const parsed = AwarenessLatentOutputSchema.parse(output);
  if (parsed.state.updatedTick !== currentTick || (state.latentAcceptedTick !== null && state.latentAcceptedTick >= currentTick)) throw new Error("AWARENESS_LATENT_TICK_MISMATCH");
  const incoming = [...parsed.reflexDesires, ...parsed.affectiveDesires];
  if (incoming.some((desire) => desire.startTick !== currentTick)) throw new Error("AWARENESS_DESIRE_START_MISMATCH");
  const expired = AwarenessExpireDesires(state, currentTick);
  return { ...expired, latent: parsed.state, latentAcceptedTick: currentTick, issuedDesireIds: [...state.issuedDesireIds, ...incoming.map((desire) => desire.id)], desires: mergeDesires(expired.desires, incoming, state.issuedDesireIds) };
}
export function AwarenessStartConsciousJob(state: AwarenessCharacterState, input: { id: string; startedAt: number; deadlineAt: number; snapshot: AwarenessConsciousInput }): AwarenessCharacterState {
  if (state.job && (state.job.status === "running" || state.job.status === "ready" || state.job.physicalStatus === "outstanding")) throw new Error("AWARENESS_CONSCIOUS_SLOT_OCCUPIED");
  const snapshot = AwarenessConsciousInputSchema.parse(structuredClone(input.snapshot));
  const generation = state.generation + 1;
  const job: AwarenessConsciousJob = AwarenessConsciousJobSchema.parse({ id: input.id, side: snapshot.side, generation, fence: state.fence, sourceTick: snapshot.sourceTick, status: "running", physicalStatus: "outstanding", startedAt: input.startedAt, deadlineAt: input.deadlineAt, input: snapshot, result: null });
  return { ...state, generation, job };
}
export function AwarenessCancelGeneration(state: AwarenessCharacterState): AwarenessCharacterState {
  return { ...state, generation: state.generation + 1, job: state.job ? { ...state.job, status: "cancelled" } : null };
}
export function AwarenessMarkConsciousReady(state: AwarenessCharacterState, input: { jobId: string; generation: number; fence: number; completedAt: number; output: AwarenessConsciousOutput }): AwarenessCharacterState {
  const job = state.job;
  if (!job || job.id !== input.jobId || job.generation !== input.generation || job.fence !== input.fence) return state;
  if (job.status !== "running" || state.generation !== input.generation || state.fence !== input.fence || input.completedAt >= job.deadlineAt || input.completedAt < job.startedAt) {
    return { ...state, job: { ...job, physicalStatus: "finished", status: job.status === "running" ? "expired" : job.status } };
  }
  return { ...state, job: { ...job, status: "ready", physicalStatus: "finished", result: AwarenessConsciousOutputSchema.parse(input.output) } };
}
export function AwarenessApplyConsciousReady(state: AwarenessCharacterState, currentTick: number): AwarenessCharacterState {
  const job = state.job;
  if (!job || job.status !== "ready" || job.generation !== state.generation || job.fence !== state.fence || !job.result) return state;
  if (currentTick < job.sourceTick) throw new Error("AWARENESS_MERGE_PRECEDES_SOURCE");
  const output = job.result;
  const desires = output.desires.map((desire) => ({ ...desire, startTick: currentTick, validUntilTick: currentTick + desire.validUntilTick - desire.startTick }));
  const existingIds = new Set(state.mailbox.map((entry) => entry.id));
  const mailbox: AwarenessMailboxEntry[] = output.influences.map((influence) => ({ id: `${job.id}:${influence.id}`, influence, availableTick: currentTick + 1, appliedTick: null }));
  if (mailbox.some((entry) => existingIds.has(entry.id)) || new Set(mailbox.map((entry) => entry.id)).size !== mailbox.length) throw new Error("AWARENESS_MAILBOX_ID_REUSED");
  return { ...state, conscious: { goal: output.goal, thought: output.thought, updatedTick: currentTick }, desires: mergeDesires(AwarenessExpireDesires(state, currentTick).desires, desires, state.issuedDesireIds), issuedDesireIds: [...state.issuedDesireIds, ...desires.map((desire) => desire.id)], mailbox: [...state.mailbox, ...mailbox], job: { ...job, status: "applied" } };
}
/** Consume only supplied IDs after successful latent acceptance, never when merely preparing input. */
export function AwarenessConsumeMailbox(state: AwarenessCharacterState, ids: readonly string[], currentTick: number): AwarenessCharacterState {
  const consumed = new Set(ids);
  if (consumed.size !== ids.length || ids.some((id) => !state.mailbox.some((entry) => entry.id === id && entry.appliedTick === null && entry.availableTick <= currentTick))) throw new Error("AWARENESS_MAILBOX_NOT_AVAILABLE");
  return { ...state, mailbox: state.mailbox.map((entry) => consumed.has(entry.id) ? { ...entry, appliedTick: currentTick } : entry) };
}
export function AwarenessAvailableInfluences(state: AwarenessCharacterState, currentTick: number): AwarenessMailboxEntry[] {
  return state.mailbox.filter((entry) => entry.appliedTick === null && entry.availableTick <= currentTick);
}
