import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditConflictHandlingV2References,
  buildIntegratedShadowTurnReceiptV2,
  projectLegacyIntegratedShadowTurnReceipt,
} from "@kshiai/shared";
import {
  ConflictHandlingApplicabilityReceiptSetSchema,
  buildBattleConflictHandlingApplicabilityReceipts,
  verifyConflictHandlingApplicabilityParent,
} from "./build-battle-conflict-handling-applicability-receipts.js";

const receiptSetPromise = buildBattleConflictHandlingApplicabilityReceipts();

const expectedClassifications = {
  ordinary_fast_action: {
    availability: "unavailable",
    disposition: "unavailable",
    applicability: "not_applicable",
    handling: "not_applicable",
  },
  remote_rejection: {
    availability: "available",
    disposition: "used",
    applicability: "required",
    handling: "handled",
  },
  simultaneous_terminal_action: {
    availability: "unavailable",
    disposition: "unavailable",
    applicability: "not_applicable",
    handling: "not_applicable",
  },
  interrupted_expanded_action: {
    availability: "available",
    disposition: "not_needed",
    applicability: "not_applicable",
    handling: "not_applicable",
  },
  active_world_process: {
    availability: "unavailable",
    disposition: "unavailable",
    applicability: "not_applicable",
    handling: "not_applicable",
  },
  blocking_local_conflict: {
    availability: "available",
    disposition: "used",
    applicability: "required",
    handling: "handled",
  },
  exhausted_budget: {
    availability: "available",
    disposition: "used",
    applicability: "required",
    handling: "handled",
  },
} as const;

describe("conflict-handling applicability receipt construction", () => {
  it("builds the seven pre-registered v2 receipts without legacy drift", async () => {
    assert.equal(await verifyConflictHandlingApplicabilityParent(), true);
    const result = await receiptSetPromise;
    ConflictHandlingApplicabilityReceiptSetSchema.parse(result);

    assert.equal(result.cases.length, 7);
    assert.deepEqual(result.boundaries, {
      frozenParentVerified: true,
      derivedTranscriptPersisted: false,
      sourceMutationCount: 0,
      authoritativeOutcomeChangeCount: 0,
      legacyReceiptMutationCount: 0,
      canonicalCommitCount: 0,
      externalLlmCallsMade: 0,
      xaiCallsMade: 0,
    });
    let applicableCount = 0;
    for (const receiptCase of result.cases) {
      const expected = expectedClassifications[receiptCase.stratum];
      const v2 = receiptCase.receipt.conflictHandlingV2;
      assert.equal(v2.capability.availability, expected.availability);
      assert.equal(v2.capability.disposition, expected.disposition);
      assert.equal(v2.applicability.status, expected.applicability);
      assert.equal(v2.handling.status, expected.handling);
      applicableCount += Number(v2.applicability.status === "required");
      assert.deepEqual(
        projectLegacyIntegratedShadowTurnReceipt(receiptCase.receipt),
        receiptCase.legacyReceipt,
      );
      assert.deepEqual(
        buildIntegratedShadowTurnReceiptV2({
          turnInput: receiptCase.turnInput,
          receipt: receiptCase.legacyReceipt,
        }),
        receiptCase.receipt,
      );
      assert.deepEqual(
        auditConflictHandlingV2References({
          turnInput: receiptCase.turnInput,
          receipt: receiptCase.receipt,
        }).danglingRefs,
        [],
      );
    }
    assert.equal(applicableCount, 3);

    const byId = new Map(result.cases.map((receiptCase) => [
      receiptCase.scenarioId,
      receiptCase.receipt.conflictHandlingV2,
    ]));
    assert.deepEqual(byId.get("remote_rejection"), {
      schemaVersion: 2,
      capability: {
        allowedFallbacks: ["defense"],
        availability: "available",
        disposition: "used",
      },
      applicability: {
        status: "required",
        triggerKinds: ["selected_fallback_proposal"],
        triggerRefs: ["proposal.remote.fallback.a"],
      },
      handling: {
        status: "handled",
        evidenceKinds: ["selected_fallback_proposal"],
        evidenceRefs: ["proposal.remote.fallback.a"],
      },
    });
    assert.deepEqual(
      byId.get("interrupted_expanded_action")?.capability,
      {
        allowedFallbacks: ["intermediate", "unknown"],
        availability: "available",
        disposition: "not_needed",
      },
    );
    assert.deepEqual(
      byId.get("blocking_local_conflict")?.applicability.triggerKinds,
      ["conflicted_read", "contested_claim", "degraded_indeterminate"],
    );
    assert.deepEqual(
      byId.get("exhausted_budget")?.applicability.triggerKinds,
      ["budget_exhausted", "degraded_indeterminate"],
    );
  });

  it("fails closed when the integrated input and receipt identities differ", async () => {
    const result = await receiptSetPromise;
    const receiptCase = result.cases[0]!;
    const mismatchedInput = {
      ...structuredClone(receiptCase.turnInput),
      authoritativeOutcomeDigest: "0".repeat(64),
    };

    assert.throws(
      () => buildIntegratedShadowTurnReceiptV2({
        turnInput: mismatchedInput,
        receipt: receiptCase.legacyReceipt,
      }),
      /identities do not match/u,
    );
  });
});
