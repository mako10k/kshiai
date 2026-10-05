// R: Define authoritative private contracts for the awareness-v5 character pipeline.
import { z } from "zod";
import type { ObserverSafeAvailableAction } from "./action-feasibility.js";
import { CharacterActionIntentSchema } from "./battle.js";
import { CharacterSelfProfileAnchorSchema } from "./profile-grounding.js";
import { CharacterPerceptionFrameSchema } from "./perception.js";

const tick = z.number().int().nonnegative();
const identifier = z.string().min(1).max(160);
const unit = z.number().finite().min(0).max(1);
const shortText = z.string().min(1).max(400);
export const AwarenessSideSchema = z.enum(["a", "b"]);
export const AwarenessRoleSchema = z.enum(["subconscious", "conscious", "adjudication", "narration"]);
export type AwarenessRole = z.infer<typeof AwarenessRoleSchema>;
export { AwarenessPolicyV1Schema, AwarenessDefaultPolicy, AwarenessObservedPolicy, AwarenessLongMeasurementPolicy, AwarenessNormalPolicy } from "./awareness-policy.js";
export type { AwarenessPolicyV1 } from "./awareness-policy.js";
import { AwarenessPolicyV1Schema } from "./awareness-policy.js";

const desireFields = { id: identifier, source: z.enum(["reflex", "subconscious", "conscious"]), strength: unit, startTick: tick, validUntilTick: tick };
export const AwarenessDesireSchema = z.discriminatedUnion("resource", [
  z.object({ ...desireFields, resource: z.literal("body"), action: CharacterActionIntentSchema }).strict(),
  z.object({ ...desireFields, resource: z.literal("voice"), speech: z.string().min(1).max(400) }).strict(),
]).superRefine((value, context) => {
  const duration = value.validUntilTick - value.startTick;
  if (duration < 1 || duration > 3) context.addIssue({ code: "custom", path: ["validUntilTick"], message: "Desire lifetime must be one to three ticks" });
});
export type AwarenessDesire = z.infer<typeof AwarenessDesireSchema>;
export const AwarenessItemSchema = z.object({ id: identifier, feeling: shortText, awareness: unit }).strict();
export const AwarenessTendencySchema = AwarenessItemSchema.extend({ cue: shortText, response: shortText, strength: unit, validUntilTick: tick }).strict();
export const AwarenessLatentStateSchema = z.object({ updatedTick: tick, sensations: z.array(AwarenessItemSchema), emotions: z.array(AwarenessItemSchema), tendencies: z.array(AwarenessTendencySchema), feltProjection: z.string().max(1200) }).strict();
export type AwarenessLatentState = z.infer<typeof AwarenessLatentStateSchema>;
export const AwarenessInfluenceSchema = z.object({ id: identifier, content: shortText }).strict();
export type AwarenessInfluence = z.infer<typeof AwarenessInfluenceSchema>;
export const AwarenessLatentOutputSchema = z.object({ state: AwarenessLatentStateSchema, reflexDesires: z.array(AwarenessDesireSchema), affectiveDesires: z.array(AwarenessDesireSchema), reconsider: z.boolean(), cancelThought: z.boolean() }).strict().superRefine((value, context) => {
  if (value.reflexDesires.some((desire) => desire.source !== "reflex")) context.addIssue({ code: "custom", path: ["reflexDesires"], message: "Reflex output must use reflex source" });
  if (value.affectiveDesires.some((desire) => desire.source !== "subconscious")) context.addIssue({ code: "custom", path: ["affectiveDesires"], message: "Affective output must use subconscious source" });
});
export type AwarenessLatentOutput = z.infer<typeof AwarenessLatentOutputSchema>;
export const AwarenessStimulusSchema = z.object({ id: identifier, content: shortText }).strict();
const availableActionFields = { name: z.string(), description: z.string().optional(), skillKind: z.enum(["attack", "magic", "defend", "support", "special", "status"]).optional(), costMp: z.number().finite().nonnegative().optional(), costStamina: z.number().finite().nonnegative().optional(), finisherCandidate: z.boolean().optional(), cooldownTurns: tick.optional(), cooldownRemaining: tick.optional(), target: z.object({ kind: z.enum(["self", "counterpart"]), perceivedAs: z.string() }).strict() };
export const AwarenessAvailableActionSchema = z.discriminatedUnion("kind", [
  z.object({ ...availableActionFields, kind: z.literal("skill"), skillId: z.string() }).strict(),
  z.object({ ...availableActionFields, kind: z.enum(["basic_attack", "defend", "rest", "wait", "reposition", "free_action", "reflect"]), skillId: z.never().optional() }).strict(),
]);
export type AwarenessAvailableAction = z.infer<typeof AwarenessAvailableActionSchema>;
/** Compile-time check binds the runtime schema to the existing authoritative option type. */
const availableActionContract: z.ZodType<ObserverSafeAvailableAction> = AwarenessAvailableActionSchema;
void availableActionContract;
const characterFields = { character: CharacterSelfProfileAnchorSchema, characteristics: z.array(z.string().min(1).max(2400)), training: z.array(z.string().min(1).max(2400)), availableActions: z.array(AwarenessAvailableActionSchema), facts: z.array(z.object({ ref: identifier, content: z.string().min(1).max(4000) }).strict()) };
export const AwarenessLatentInputSchema = z.object({ ...characterFields, side: AwarenessSideSchema, tick, perception: CharacterPerceptionFrameSchema, currentState: AwarenessLatentStateSchema, influences: z.array(AwarenessInfluenceSchema), stimuli: z.array(AwarenessStimulusSchema).max(8) }).strict().refine((value) => value.side === value.perception.observer.side, { path: ["perception"], message: "Observer side mismatch" });
export type AwarenessLatentInput = z.infer<typeof AwarenessLatentInputSchema>;
export const AwarenessConsciousStateSchema = z.object({ goal: z.string().max(400).nullable(), thought: z.string().max(1200), updatedTick: tick.nullable() }).strict();
export type AwarenessConsciousState = z.infer<typeof AwarenessConsciousStateSchema>;
export const AwarenessConsciousInputSchema = z.object({ ...characterFields, side: AwarenessSideSchema, sourceTick: tick, perception: CharacterPerceptionFrameSchema, feltProjection: z.string().max(1200), consciousState: AwarenessConsciousStateSchema }).strict().refine((value) => value.side === value.perception.observer.side, { path: ["perception"], message: "Observer side mismatch" });
export type AwarenessConsciousInput = z.infer<typeof AwarenessConsciousInputSchema>;
export const AwarenessConsciousOutputSchema = z.object({ goal: z.string().max(400).nullable(), thought: z.string().max(1200), desires: z.array(AwarenessDesireSchema), influences: z.array(AwarenessInfluenceSchema) }).strict().refine((value) => value.desires.every((desire) => desire.source === "conscious"), { path: ["desires"], message: "Conscious output must use conscious source" });
export type AwarenessConsciousOutput = z.infer<typeof AwarenessConsciousOutputSchema>;
export const AwarenessConsciousJobSchema = z.object({ id: identifier, side: AwarenessSideSchema, generation: tick, fence: tick, sourceTick: tick, status: z.enum(["running", "ready", "applied", "cancelled", "failed", "expired"]), physicalStatus: z.enum(["outstanding", "finished", "cancelled"]), startedAt: z.number().finite().nonnegative(), deadlineAt: z.number().finite().nonnegative(), input: AwarenessConsciousInputSchema, result: AwarenessConsciousOutputSchema.nullable() }).strict().superRefine((value, context) => {
  if (value.side !== value.input.side || value.sourceTick !== value.input.sourceTick) context.addIssue({ code: "custom", path: ["input"], message: "Frozen input identity mismatch" });
  if (value.deadlineAt <= value.startedAt) context.addIssue({ code: "custom", path: ["deadlineAt"], message: "Deadline must follow start" });
  if ((value.status === "ready" || value.status === "applied") && value.result === null) context.addIssue({ code: "custom", path: ["result"], message: "Completed job requires output" });
});
export type AwarenessConsciousJob = z.infer<typeof AwarenessConsciousJobSchema>;
export const AwarenessMailboxEntrySchema = z.object({ id: identifier, influence: AwarenessInfluenceSchema, availableTick: tick, appliedTick: tick.nullable() }).strict().refine((value) => value.appliedTick === null || value.appliedTick >= value.availableTick, { path: ["appliedTick"], message: "Mailbox cannot be consumed before availability" });
export type AwarenessMailboxEntry = z.infer<typeof AwarenessMailboxEntrySchema>;
export const AwarenessExecutionStateSchema = z.object({ perceptionRevision: tick.nullable(), lastConsciousStartTick: tick.nullable(), lastCancelTick: tick.nullable(), pendingReconsider: z.boolean(), pendingSpeech: z.boolean(), pendingInvalid: z.boolean(), pendingCompleted: z.boolean(), consecutiveConsciousFailures: tick, lastFailureJobId: identifier.nullable(), unknownSinceTick: tick.nullable(), unknownSinceAt: z.number().finite().nonnegative().nullable() }).strict();
export type AwarenessExecutionState = z.infer<typeof AwarenessExecutionStateSchema>;
export const AwarenessCharacterStateSchema = z.object({ execution: AwarenessExecutionStateSchema, latent: AwarenessLatentStateSchema, latentAcceptedTick: tick.nullable(), issuedDesireIds: z.array(identifier), conscious: AwarenessConsciousStateSchema, desires: z.array(AwarenessDesireSchema), acceptedDesireIds: z.array(identifier), generation: tick, fence: tick, job: AwarenessConsciousJobSchema.nullable(), mailbox: z.array(AwarenessMailboxEntrySchema) }).strict();
export type AwarenessCharacterState = z.infer<typeof AwarenessCharacterStateSchema>;
export const AwarenessReservationSchema = z.object({ id: identifier, role: AwarenessRoleSchema, maximumUsd: z.number().finite().nonnegative().nullable(), status: z.enum(["reserved", "settled", "unknown", "cancelled"]), actualUsd: z.number().finite().nonnegative().nullable(), physicalOutstanding: z.boolean() }).strict().refine((value) => value.status !== "settled" || (value.actualUsd !== null && !value.physicalOutstanding), { message: "Settled reservation requires known cost and closed physical attempt" });
export type AwarenessReservation = z.infer<typeof AwarenessReservationSchema>;
export const AwarenessBudgetSnapshotSchema = z.object({ physicalAttempts: tick, physicalOutstanding: tick, reservedUsd: z.number().finite().nonnegative(), settledUsd: z.number().finite().nonnegative(), unknownAttemptIds: z.array(identifier), reservations: z.array(AwarenessReservationSchema) }).strict().superRefine((value, context) => {
  const reserved = value.reservations.filter((item) => item.status !== "settled").reduce((sum, item) => sum + (item.maximumUsd ?? 0), 0);
  const settled = value.reservations.filter((item) => item.status === "settled").reduce((sum, item) => sum + (item.actualUsd ?? 0), 0);
  const outstanding = value.reservations.filter((item) => item.physicalOutstanding).length;
  const unknown = value.reservations.filter((item) => item.status === "unknown" || item.status === "cancelled" || (item.maximumUsd === null && item.status !== "settled")).map((item) => item.id);
  if (unknown.length !== value.unknownAttemptIds.length || unknown.some((id, index) => id !== value.unknownAttemptIds[index])) context.addIssue({ code: "custom", path: ["unknownAttemptIds"], message: "Unknown attempt identities differ from reservations" });
  if (new Set(value.reservations.map((item) => item.id)).size !== value.reservations.length) context.addIssue({ code: "custom", path: ["reservations"], message: "Reservation identity reused" });
  if (value.physicalAttempts !== value.reservations.length || value.physicalOutstanding !== outstanding || Math.abs(value.reservedUsd - reserved) > 1e-9 || Math.abs(value.settledUsd - settled) > 1e-9) context.addIssue({ code: "custom", message: "Budget summary differs from immutable reservation records" });
});
export type AwarenessBudgetSnapshot = z.infer<typeof AwarenessBudgetSnapshotSchema>;
export const AwarenessPipelineStateSchema = z.object({ pipeline: z.literal("awareness-v5"), policy: AwarenessPolicyV1Schema, promptRevision: identifier, outputRevision: identifier, tick, preparedTick: tick.nullable(), cutoffTick: tick.nullable(), lastCommittedAt: z.number().finite().nonnegative().nullable(), terminalAt: z.number().finite().nonnegative().nullable(), revision: tick, startedAt: z.number().finite().nonnegative(), deadlineAt: z.number().finite().nonnegative(), status: z.enum(["active", "terminal", "incomplete"]), incompleteReason: z.string().min(1).max(400).nullable(), sides: z.object({ a: AwarenessCharacterStateSchema, b: AwarenessCharacterStateSchema }).strict(), budget: AwarenessBudgetSnapshotSchema }).strict().superRefine((value, context) => {
  if (value.policy.accountingMode !== "observed" && value.budget.reservations.some((item) => item.maximumUsd === null)) {
    context.addIssue({ code: "custom", path: ["budget", "reservations"], message: "Certified accounting requires known maximum charges" });
  }
  if (value.deadlineAt !== value.startedAt + value.policy.maxDurationMs) context.addIssue({ code: "custom", path: ["deadlineAt"], message: "Battle deadline must retain the immutable start limit" });
  if ((value.status === "incomplete") !== (value.incompleteReason !== null)) context.addIssue({ code: "custom", path: ["incompleteReason"], message: "Incomplete state requires a reason, other states forbid it" });
});
export type AwarenessPipelineState = z.infer<typeof AwarenessPipelineStateSchema>;
