import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConflictHandlingApplicabilityInputSchema,
  ConflictHandlingV2Schema,
  classifyConflictHandlingApplicability,
  type ConflictHandlingApplicabilityInput,
} from "./battle-conflict-handling-applicability.js";

function fixture(
  input: Partial<ConflictHandlingApplicabilityInput>,
): ConflictHandlingApplicabilityInput {
  return ConflictHandlingApplicabilityInputSchema.parse({
    allowedFallbacks: [],
    proposals: [],
    adaptive: { status: "skipped" },
    reads: [],
    issues: [],
    ...input,
  });
}

describe("conflict-handling applicability classifier", () => {
  it("keeps an allowed fallback not needed after a known precondition failure", () => {
    const result = classifyConflictHandlingApplicability(fixture({
      allowedFallbacks: ["intermediate", "unknown"],
      proposals: [{ proposalRef: "proposal.partial", actionKind: "custom" }],
      adaptive: {
        status: "executed",
        contestedClaimRefs: [],
        receipts: [{
          proposalRef: "proposal.partial",
          resolution: "expanded",
          outcome: "partial",
          failureReason: "precondition_failed",
        }],
      },
    }));

    assert.deepEqual(result, {
      schemaVersion: 2,
      capability: {
        allowedFallbacks: ["intermediate", "unknown"],
        availability: "available",
        disposition: "not_needed",
      },
      applicability: {
        status: "not_applicable",
        triggerKinds: [],
        triggerRefs: [],
      },
      handling: {
        status: "not_applicable",
        evidenceKinds: [],
        evidenceRefs: [],
      },
    });
  });

  it("does not hide an unhandled contested claim when no capability exists", () => {
    const result = classifyConflictHandlingApplicability(fixture({
      proposals: [{ proposalRef: "proposal.conflict", actionKind: "custom" }],
      adaptive: {
        status: "executed",
        contestedClaimRefs: ["claim.object"],
        receipts: [{
          proposalRef: "proposal.conflict",
          resolution: "expanded",
          outcome: "attempted_failed",
          failureReason: "simultaneous_conflict",
        }],
      },
    }));

    assert.equal(result.capability.disposition, "unavailable");
    assert.deepEqual(result.applicability, {
      status: "required",
      triggerKinds: ["contested_claim"],
      triggerRefs: ["claim.object"],
    });
    assert.deepEqual(result.handling, {
      status: "missing",
      evidenceKinds: [],
      evidenceRefs: [],
    });
  });

  it("accepts an unknown fallback fact as evidence for a contested claim", () => {
    const result = classifyConflictHandlingApplicability(fixture({
      allowedFallbacks: ["unknown"],
      proposals: [{ proposalRef: "proposal.conflict", actionKind: "custom" }],
      adaptive: {
        status: "executed",
        contestedClaimRefs: ["claim.object"],
        receipts: [{
          proposalRef: "proposal.conflict",
          resolution: "expanded",
          outcome: "indeterminate",
          failureReason: "simultaneous_conflict",
          fallbackFact: {
            factRef: "fact.fallback.unknown",
            strength: "unknown",
          },
        }],
      },
    }));

    assert.equal(result.capability.disposition, "used");
    assert.equal(result.applicability.status, "required");
    assert.deepEqual(result.applicability.triggerKinds, ["contested_claim"]);
    assert.deepEqual(result.handling, {
      status: "handled",
      evidenceKinds: ["fallback_fact"],
      evidenceRefs: ["fact.fallback.unknown"],
    });
  });

  it("keeps degraded indeterminate handling missing without matching evidence", () => {
    const result = classifyConflictHandlingApplicability(fixture({
      allowedFallbacks: ["unknown"],
      proposals: [{ proposalRef: "proposal.degraded", actionKind: "custom" }],
      adaptive: {
        status: "executed",
        contestedClaimRefs: [],
        receipts: [{
          proposalRef: "proposal.degraded",
          resolution: "degraded",
          outcome: "indeterminate",
          failureReason: "invalid_character_plan",
        }],
      },
    }));

    assert.equal(result.capability.disposition, "available_unhandled");
    assert.deepEqual(result.applicability, {
      status: "required",
      triggerKinds: ["degraded_indeterminate"],
      triggerRefs: ["proposal.degraded"],
    });
    assert.equal(result.handling.status, "missing");
  });

  it("returns not applicable and unavailable when no trigger or capability exists", () => {
    const result = classifyConflictHandlingApplicability(fixture({}));

    assert.equal(result.capability.availability, "unavailable");
    assert.equal(result.capability.disposition, "unavailable");
    assert.equal(result.applicability.status, "not_applicable");
    assert.equal(result.handling.status, "not_applicable");
  });

  it("requires every trigger class to have corresponding handling evidence", () => {
    const result = classifyConflictHandlingApplicability(fixture({
      allowedFallbacks: ["defense"],
      proposals: [
        { proposalRef: "proposal.defense", actionKind: "defense" },
        { proposalRef: "proposal.degraded", actionKind: "custom" },
      ],
      adaptive: {
        status: "executed",
        contestedClaimRefs: [],
        receipts: [
          {
            proposalRef: "proposal.defense",
            resolution: "fast",
            outcome: "completed",
          },
          {
            proposalRef: "proposal.degraded",
            resolution: "degraded",
            outcome: "indeterminate",
            failureReason: "invalid_character_plan",
          },
        ],
      },
    }));

    assert.deepEqual(result.applicability.triggerKinds, [
      "degraded_indeterminate",
      "selected_fallback_proposal",
    ]);
    assert.deepEqual(result.handling.evidenceKinds, [
      "selected_fallback_proposal",
    ]);
    assert.equal(result.handling.status, "missing");
  });

  it("rejects unsorted or internally inconsistent v2 envelopes", () => {
    const malformed = ConflictHandlingV2Schema.safeParse({
      schemaVersion: 2,
      capability: {
        allowedFallbacks: ["unknown", "intermediate"],
        availability: "unavailable",
        disposition: "unavailable",
      },
      applicability: {
        status: "not_applicable",
        triggerKinds: ["contested_claim"],
        triggerRefs: ["claim.object"],
      },
      handling: {
        status: "handled",
        evidenceKinds: [],
        evidenceRefs: [],
      },
    });

    assert.equal(malformed.success, false);
  });
});
