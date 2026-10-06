// R: Generate and validate one ordered, receipt-scoped narration batch without changing world facts.
import { AwarenessNarratorDispatchContextSchema, type AwarenessNarratorDispatchContext } from "./awareness-narrator-context.js";
import {
  AwarenessDefaultPolicy, AwarenessPolicyV1Schema, CurrentAwarenessPromptRevision, type AwarenessPolicyV1,
} from "@kshiai/shared";
import type { PreparedAwarenessRequest } from "./awareness-request.js";
import { prepareAwarenessFrozenNarrationRequest, validateAwarenessFrozenNarrationResults, AwarenessFrozenNarrationSchema, type AwarenessFrozenNarration, type AwarenessFrozenNarrationResult } from "./awareness-frozen-narration.js";
import type { AwarenessTransportIdentity } from "./awareness-provider-contract.js";
import type { AwarenessJsonTransport } from "./awareness-provider-contract.js";
import { freezeAwarenessNarration } from "./awareness-narration-phase.js";
import type { LlmProvider, NarrationResult } from "./types.js";

export type AwarenessNarrationReceiptInput = {
  battleId: string;
  turnReceiptId: string;
  input: Omit<Parameters<LlmProvider["narrateTurn"]>[0], "onProgress">;
};
export type AwarenessNarrationReceiptResult = {
  battleId: string;
  turnReceiptId: string;
  narration: NarrationResult;
};
export interface AwarenessNarrationProvider {
  readonly identity: AwarenessTransportIdentity;
  narrateFrozenBatch(materials: readonly AwarenessFrozenNarration[], timeoutMs?: number, context?: AwarenessNarratorDispatchContext, policy?: AwarenessPolicyV1): Promise<AwarenessFrozenNarrationResult[]>;
  narrateBatch(receipts: readonly AwarenessNarrationReceiptInput[], timeoutMs?: number): Promise<AwarenessNarrationReceiptResult[]>;
}

/** Exact pure material shared by billing admission and the actual batch transport. */
export function prepareAwarenessNarrationRequest(
  receipts: readonly AwarenessNarrationReceiptInput[], timeoutMs?: number, policy: AwarenessPolicyV1 = AwarenessDefaultPolicy,
  promptRevision: NonNullable<AwarenessFrozenNarration["promptRevision"]> = CurrentAwarenessPromptRevision,
): PreparedAwarenessRequest {
  const bound = AwarenessPolicyV1Schema.parse(policy);
  const limits = bound.roles.narration;
  if (receipts.length < 1 || receipts.length > bound.narration.batchReceipts) throw new Error("AWARENESS_NARRATION_BATCH_SIZE_INVALID");
  const first = receipts[0]!;
  if (receipts.some((receipt) => !receipt.battleId || !receipt.turnReceiptId || receipt.battleId !== first.battleId)) throw new Error("AWARENESS_NARRATION_BATCH_IDENTITY_INVALID");
  if (new Set(receipts.map((receipt) => receipt.turnReceiptId)).size !== receipts.length) throw new Error("AWARENESS_NARRATION_DUPLICATE_RECEIPT");
  const deadline = timeoutMs === undefined ? limits.deadlineMs : Math.min(limits.deadlineMs, timeoutMs);
  if (!Number.isFinite(deadline) || deadline <= 0) throw new Error("AWARENESS_NARRATION_DEADLINE_INVALID");
  const prepared = prepareAwarenessFrozenNarrationRequest(receipts.map((receipt) => freezeAwarenessNarration(
    { phase: "combat", input: receipt.input }, { battleId: receipt.battleId, turnReceiptId: receipt.turnReceiptId }, promptRevision,
  )), timeoutMs, undefined, policy);
  return { ...prepared, options: { ...prepared.options, label: "awareness-v5:narration-batch" } };
}

export class TransportAwarenessNarrationProvider implements AwarenessNarrationProvider {
  readonly identity: AwarenessTransportIdentity;
  private readonly policy: AwarenessPolicyV1;
  constructor(private readonly transport: AwarenessJsonTransport, policy: AwarenessPolicyV1 = AwarenessDefaultPolicy) {
    this.policy = AwarenessPolicyV1Schema.parse(policy);
    this.identity = Object.freeze({ ...transport.identity });
    if (transport.identity.provider !== "xai" || !transport.identity.fastModel.startsWith("grok-")) {
      throw new Error("AWARENESS_NARRATION_ROUTE_MUST_BE_XAI_GROK_FAST");
    }
  }

  async narrateFrozenBatch(materials: readonly AwarenessFrozenNarration[], timeoutMs?: number, context?: AwarenessNarratorDispatchContext, policy?: AwarenessPolicyV1): Promise<AwarenessFrozenNarrationResult[]> {
    const captured = materials.map((material) => AwarenessFrozenNarrationSchema.parse(material));
    const request = prepareAwarenessFrozenNarrationRequest(captured, timeoutMs, context ? AwarenessNarratorDispatchContextSchema.parse(context) : undefined, policy ?? this.policy);
    const raw = await this.transport.requestJson(request.system, request.user, request.options);
    return validateAwarenessFrozenNarrationResults(captured, raw);
  }

  async narrateBatch(receipts: readonly AwarenessNarrationReceiptInput[], timeoutMs?: number): Promise<AwarenessNarrationReceiptResult[]> {
    const captured = receipts.map((receipt) => ({ ...receipt, input: structuredClone(receipt.input) }));
    const request = prepareAwarenessNarrationRequest(captured, timeoutMs, this.policy);
    const materials = captured.map((receipt) => freezeAwarenessNarration({ phase: "combat", input: receipt.input }, { battleId: receipt.battleId, turnReceiptId: receipt.turnReceiptId }));
    const frozenResults = validateAwarenessFrozenNarrationResults(materials, await this.transport.requestJson(request.system, request.user, request.options));
    return frozenResults.map((result) => {
      if (result.phase !== "combat") throw new Error("AWARENESS_NARRATION_PHASE_MISMATCH");
      return { battleId: result.battleId, turnReceiptId: result.turnReceiptId, narration: result.narration };
    });
  }
}
