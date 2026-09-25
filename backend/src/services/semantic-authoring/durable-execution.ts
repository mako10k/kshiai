import { createHash } from "node:crypto";
import type {
  SemanticAuthoringResolverResultV1,
  SemanticAuthoringRunV1,
} from "@kshiai/shared";
import type { DatabaseConnection } from "../../db.js";
import * as repository from "../../repositories/semantic-authoring.js";
import type { SemanticAuthoringExecutionPersistenceV1 } from "./execution.js";

export function createDurableSemanticAuthoringExecutionV1<FC, Q>(input: {
  run: SemanticAuthoringRunV1;
  familyPayloadRef: string;
  persistFamilyResult(connection: DatabaseConnection,
    result: SemanticAuthoringResolverResultV1<FC, Q>): Promise<void>;
}): SemanticAuthoringExecutionPersistenceV1<FC, Q> {
  let fence = input.run.executionFence;
  const now = () => new Date().toISOString();
  const owns = async (advance = false) => {
    const current = await repository.getSemanticAuthoringRunV1(input.run.runId);
    if (!current || current.status !== "claimed"
      || current.executionFence.ownerId !== fence.ownerId
      || current.executionFence.fencingToken !== fence.fencingToken
      || current.executionFence.runVersion !== fence.runVersion + (advance ? 1 : 0)) return false;
    fence = current.executionFence;
    return true;
  };
  return {
    owns,
    async reserve(request) {
      const written = await repository.writeSemanticAuthoringReservationV1({
        runId: input.run.runId, fence, reservation: request.reservation,
        requestDigest: createHash("sha256").update(request.body).digest("hex"),
        providerRoute: request.providerRoute, createdAt: now(),
      });
      return written.accepted && await owns(true);
    },
    async settle(requestId, outcome, measuredElapsedMs, measuredUsage) {
      const written = await repository.settleSemanticAuthoringRequestV1({
        runId: input.run.runId, requestId, fence,
        outcome: outcome === "received" ? "succeeded"
          : outcome === "provider_transport_timeout" ? "provider_transport_timeout" : "failed",
        finishedAt: now(), measuredElapsedMs, measuredUsage,
      });
      return written.accepted && await owns(true);
    },
    async finish(result) {
      const written = await repository.writeSemanticAuthoringTerminalV1({
        runId: input.run.runId, fence, status: result.kind,
        accounting: result.accounting,
        failureReceipt: result.kind === "failed" ? result.receipt : null,
        ...(result.kind === "ready_for_review" ? {
          finalCandidate: {
            finalCandidateId: `${input.run.runId}:candidate`, digest: result.finalCandidateDigest,
            familyPayloadRef: input.familyPayloadRef, obligationCoverage: result.obligationCoverage,
            reconciliationReceiptIdentity: result.reconciliationReceiptIdentity,
            compilerReceiptIdentity: result.compilerReceiptIdentity,
            disclosureReceiptIdentity: result.disclosureReceiptIdentity,
            expectedCurrentGenerationId: result.expectedCurrentGenerationId,
          },
        } : {}),
        ...(result.kind === "needs_owner_answer" ? {
          question: { questionId: result.resumption.questionId, question: result.question,
            evidence: result.evidence, resumption: result.resumption },
        } : {}),
        persistFamilyResult: (connection) => input.persistFamilyResult(connection, result),
        updatedAt: now(),
      });
      return written.accepted;
    },
  };
}
