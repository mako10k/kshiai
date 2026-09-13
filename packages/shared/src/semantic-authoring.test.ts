import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  SemanticAuthoringAdapterV1,
  SemanticAuthoringReservationV1,
  SemanticAuthoringResolverKindV1,
  SemanticAuthoringResolverResultV1,
  SemanticAuthoringRunStatusV1,
  SemanticAuthoringStateV1,
} from "./semantic-authoring.js";
import { isSemanticAuthoringResolverKindV1 } from "./semantic-authoring.js";

type OpenStringIndex<T> = string extends keyof T ? true : false;
type HasKey<T, K extends string> = K extends keyof T ? true : false;

const resolverResultIsClosed:
  OpenStringIndex<SemanticAuthoringResolverResultV1<string, string>> extends true
    ? never
    : true = true;
const reservationHasNoOutcome:
  HasKey<SemanticAuthoringReservationV1, "outcome"> extends true ? never : true = true;
const reservationHasNoFinalAccounting:
  HasKey<SemanticAuthoringReservationV1, "finalAccounting"> extends true ? never : true = true;
const reservationHasNoResponseDigest:
  HasKey<SemanticAuthoringReservationV1, "responseDigest"> extends true ? never : true = true;
const outstandingStateHasNoSettlement:
  HasKey<
    SemanticAuthoringStateV1<string, string, string, string, string, string>,
    "settledProviderReceipt"
  > extends true ? never : true = true;

type ControlTerminal = Extract<SemanticAuthoringRunStatusV1, "cancelled" | "expired">;
const controlTerminalsAreNotResolverKinds:
  ControlTerminal extends SemanticAuthoringResolverKindV1 ? never : true = true;

const emptyLedgers = {
  obligations: new Map<string, string>(),
  findings: new Map<string, string>(),
};

const stubAdapter: SemanticAuthoringAdapterV1<
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string
> = {
  identity: "stub-adapter-v1",
  decodeFrozenSource(value) {
    return typeof value === "string" ? { accepted: true, value } : { accepted: false };
  },
  buildBaseline(source) {
    return { candidate: source, obligations: emptyLedgers.obligations };
  },
  selectWork() {
    return { selected: false };
  },
  describeCapabilities() {
    return {
      skill: {
        identity: "stub-skill-v1",
        objective: "Select focused work.",
        phase: "skeleton",
        legalCapabilityRoles: ["query-context", "propose-change"],
        capabilityRequestGuidance: "Request the current focused capability.",
        resourceReminder: "Stay inside the frozen attempt budget.",
        disclosureReminder: "Do not request preservation or whole-candidate context.",
      },
      allowedSelectors: ["source-claims"],
      proposalSchemaIdentity: "stub-proposal-v1",
      writeClosure: ["identity"],
    };
  },
  decodeProposal(_work, value) {
    return typeof value === "string" ? { accepted: true, value } : { accepted: false };
  },
  stageProposal(input) {
    return {
      accepted: true,
      candidate: input.candidate,
      obligations: input.obligations,
      findings: input.findings,
    };
  },
  reconcileAffected(input) {
    return { findings: input.findings };
  },
  observeProgress(input) {
    return {
      phase: input.phase,
      resolvedRequiredObligationCount: 0,
      coveredMaterialClaimCount: 0,
      unresolvedMaterialFindingKeys: [],
      relevantStateDigest: "digest",
      activeSemanticClusterKey: "cluster-1",
      materialProgress: false,
    };
  },
  assessQuestion() {
    return { ask: false };
  },
  applyAnswer() {
    return { questionId: "question-1", affectedClaimIds: ["claim-1"] };
  },
  finalize(input) {
    return { accepted: false, findings: input.findings };
  },
};

describe("semantic authoring kernel contracts", () => {
  it("keeps resolver results closed and distinct from cancel or expiry", () => {
    assert.equal(resolverResultIsClosed, true);
    assert.equal(controlTerminalsAreNotResolverKinds, true);
    assert.equal(isSemanticAuthoringResolverKindV1("ready_for_review"), true);
    assert.equal(isSemanticAuthoringResolverKindV1("needs_owner_answer"), true);
    assert.equal(isSemanticAuthoringResolverKindV1("failed"), true);
    assert.equal(isSemanticAuthoringResolverKindV1("cancelled"), false);
    assert.equal(isSemanticAuthoringResolverKindV1("expired"), false);
    assert.equal(isSemanticAuthoringResolverKindV1("claimed"), false);
  });

  it("omits provider settlement fields from outstanding reservations and kernel state", () => {
    assert.equal(reservationHasNoOutcome, true);
    assert.equal(reservationHasNoFinalAccounting, true);
    assert.equal(reservationHasNoResponseDigest, true);
    assert.equal(outstandingStateHasNoSettlement, true);
  });

  it("lets a typed adapter return immutable values without inspecting candidate paths", () => {
    const source = stubAdapter.decodeFrozenSource("frozen-source");
    assert.equal(source.accepted, true);
    if (!source.accepted) {
      assert.fail("stub source decode rejected a string");
    }
    const baseline = stubAdapter.buildBaseline(source.value, "create");
    const selection = stubAdapter.selectWork({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: emptyLedgers.findings,
    });
    assert.equal(selection.selected, false);
    assert.equal(stubAdapter.assessQuestion({
      candidate: baseline.candidate,
      obligations: baseline.obligations,
      findings: emptyLedgers.findings,
    }).ask, false);
  });
});
