// R: Define the narration worker ports and immutable batch handoff contracts.
import type { AwarenessPolicyV1, NarrativeBlock } from "@kshiai/shared";
import type { DatabaseConnection } from "../db.js";
import type { AwarenessNarratorDispatchContext } from "../llm/awareness-narrator-context.js";
import type { AwarenessFrozenNarration } from "../llm/awareness-frozen-narration.js";
import type { AwarenessNarrationProvider } from "../llm/awareness-narration.js";
import type { AwarenessVerifiedBillingContract } from "../llm/awareness-dispatch-admission.js";
import type { AwarenessExecutionClock } from "./awareness-execution.js";
export interface VerifiedNarrationDispatchAdmission {
  readonly pricingRevision: string;
  readonly billingContract: AwarenessVerifiedBillingContract;
}
export type AwarenessNarrationWorkerOptions = {
  provider?: AwarenessNarrationProvider;
  admission?: VerifiedNarrationDispatchAdmission;
  clock?: AwarenessExecutionClock;
};
export type AwarenessNarrationWorkerInput = {
  battleId: string; ownerId: string; now?: Date; leaseMs?: number;
  receiptId?: string; outboxId?: string; deliveryGeneration?: number;
  options: AwarenessNarrationWorkerOptions;
};
export type AwarenessNarrationWorkerResult = "idle" | "acknowledged" | "deferred" | "completed" | "failed";
export interface AwarenessNarrationWorkerLeasePort {
  acquire(input: { battleId: string; ownerId: string; now: string; expiresAt: string }): Promise<number>;
  release(connection: DatabaseConnection, input: { battleId: string; ownerId: string }, fence: number): Promise<void>;
  appendEvent(connection: DatabaseConnection, input: {
    battleId: string; receiptId: string; sequence: number; phase: AwarenessFrozenNarration["phase"];
    combatTurn: number | null; status: "generating" | "completed" | "failed";
    narrative?: NarrativeBlock; fallbackReason?: string; now: string;
  }): Promise<void>;
}
export type Entry = {
  battle_id: string; receipt_id: string; sequence: number; phase: AwarenessFrozenNarration["phase"];
  combat_turn: number | null; input_json: unknown; input_digest: string;
  status: "queued" | "generating" | "completed" | "failed" | "cancelled";
  active_attempt_id: string | null; attempt_count: number; created_at: string;
};
export type Selected = { entry: Entry; material: AwarenessFrozenNarration; committedAt: number };
export type Claimed = { attemptId: string; fence: number; entries: Selected[]; deadlineAt: number; context: AwarenessNarratorDispatchContext; observed: boolean; policy: AwarenessPolicyV1 };
