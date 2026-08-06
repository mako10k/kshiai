import {
  authorAdaptiveStageReceipt,
  authorCoarseProposalRegistry,
  authorConsistencyIssueSnapshot,
  authorTurnFallbackPolicy,
  appendPurposeRead,
  closePurposeReadSet,
  createActualTurnSourceAuthoringContext,
  openPurposeReadSet,
  sealActualTurnSourceAuthoringContext,
  type ActualTurnSourceAuthoringContext,
  type SourceAuthoringTransitionResult,
} from "./battle-actual-turn-source-authoring.js";
import {
  sha256ApplicabilityDerivationValue,
  stableApplicabilityDerivationJson,
  type AdaptiveStageReceiptArtifact,
  type ApplicabilityDerivationSourceBundle,
  type PurposeReadSetArtifact,
  type TurnFallbackPolicyArtifact,
} from "./battle-actual-turn-input-derivation.js";
import type {
  ConsistencyIssuePocEnvelope,
} from "./battle-consistency-issue.js";
import {
  buildBattleTurnRecord,
  resolveTurn,
  type BattleRequestedActionSnapshot,
  type DeepReadonly,
  type ResolveTurnInput,
  type ResolveTurnResult,
} from "./battle-engine.js";

export const ACTUAL_TURN_SOURCE_AUTHORING_SHADOW_VERSION =
  "actual-turn-source-authoring-shadow-v1" as const;

export const ACTUAL_TURN_SOURCE_AUTHORING_SHADOW_CASE_REFS = [
  "S01_planned_basic_skill",
  "S02_policy_selected_defense",
  "S03_simultaneous_equal_speed",
  "S04_interrupted_partial",
  "S05_active_world_process",
  "S06_adaptive_skipped_no_eligible",
  "S07_adaptive_contested_conflicted_read_issue",
  "S08_authoring_failure_fail_open",
  "S09_budget_exhausted_fallback",
] as const;
export type ActualTurnSourceAuthoringShadowCaseRef =
  (typeof ACTUAL_TURN_SOURCE_AUTHORING_SHADOW_CASE_REFS)[number];

export const ACTUAL_TURN_SOURCE_AUTHORING_SHADOW_BOUNDARIES = {
  syntheticDataOnly: true,
  observerDefaultEnabled: false,
  backendWiring: 0,
  actualTurnCapture: 0,
  repositoryReads: 0,
  databaseQueries: 0,
  networkCalls: 0,
  providerCalls: 0,
  externalLlmCalls: 0,
  xaiCalls: 0,
  canonicalWrites: 0,
  battleStateWrites: 0,
  persistenceWrites: 0,
} as const;

type ShadowResolveTurnInput = Omit<
  ResolveTurnInput,
  "shadowRequestedActionObserver"
>;

type WorldProposalSource = {
  origin: "world_process";
  proposalRef: string;
  actionKind: "world_process";
};

export type ActualTurnSourceAuthoringShadowInput = {
  caseRef: ActualTurnSourceAuthoringShadowCaseRef;
  derivationCaseRef: string;
  resolveInput: ShadowResolveTurnInput;
  allowedFallbacks: TurnFallbackPolicyArtifact["payload"]["allowedFallbacks"];
  adaptiveReceipt: AdaptiveStageReceiptArtifact["payload"];
  reads: PurposeReadSetArtifact["payload"]["reads"];
  issueEnvelope: ConsistencyIssuePocEnvelope;
  worldProposals?: WorldProposalSource[];
  injectObserverFailure?: boolean;
};

type AuthoritativeDigests = {
  completeResult: string;
  nextState: string;
  actionReceipts: string;
  events: string;
  mechanicalEvidence: string;
  narrationInput: string;
  persistenceCandidate: string;
};

type AuthoritativeParity = {
  completeResult: boolean;
  nextState: boolean;
  actionReceipts: boolean;
  events: boolean;
  mechanicalEvidence: boolean;
  narrationInput: boolean;
  persistenceCandidate: boolean;
  effectfulCallTrace: boolean;
  all: boolean;
};

type ShadowBoundaryCounts = {
  addedDatabaseQueries: 0;
  addedNetworkCalls: 0;
  addedProviderCalls: 0;
  addedExternalLlmCalls: 0;
  addedXaiCalls: 0;
  canonicalWrites: 0;
  battleStateWrites: 0;
  persistenceWrites: 0;
};

type ShadowResultBase = {
  schemaVersion: 1;
  shadowVersion: typeof ACTUAL_TURN_SOURCE_AUTHORING_SHADOW_VERSION;
  caseRef: ActualTurnSourceAuthoringShadowCaseRef;
  sourceInputDigestBefore: string;
  sourceInputDigestAfter: string;
  sourceMutated: boolean;
  observerSnapshotFrozen: boolean;
  controlDigests: AuthoritativeDigests;
  shadowDigests: AuthoritativeDigests;
  parity: AuthoritativeParity;
  controlEffectfulCallTrace: [];
  shadowEffectfulCallTrace: [];
  shadowOperationTrace: string[];
  boundaryCounts: ShadowBoundaryCounts;
};

export type ActualTurnSourceAuthoringShadowResult =
  | (ShadowResultBase & {
      status: "complete";
      sourceBundle: ApplicabilityDerivationSourceBundle;
      sourceBundleDigest: string;
      inferredFieldCount: 0;
    })
  | (ShadowResultBase & {
      status: "observer_failed";
      observerError: string;
      completeBundleProduced: false;
      inferredFieldCount: 0;
    })
  | (ShadowResultBase & {
      status: "authoring_failed";
      reasons: string[];
      completeBundleProduced: false;
      inferredFieldCount: 0;
    });

function boundaryCounts(): ShadowBoundaryCounts {
  return {
    addedDatabaseQueries: 0,
    addedNetworkCalls: 0,
    addedProviderCalls: 0,
    addedExternalLlmCalls: 0,
    addedXaiCalls: 0,
    canonicalWrites: 0,
    battleStateWrites: 0,
    persistenceWrites: 0,
  };
}

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "shadow observer failed without a string error";
}

export async function sourceAuthoringOpaqueRef(input: {
  kind: "proposal" | "claim" | "slice" | "issue" | "fact";
  caseRef: string;
  localRef: string;
}): Promise<string> {
  const digest = await sha256ApplicabilityDerivationValue({
    protocolId: ACTUAL_TURN_SOURCE_AUTHORING_SHADOW_VERSION,
    caseRef: input.caseRef,
    localRef: input.localRef,
  });
  return `${input.kind}:${digest}`;
}

export async function requestedActionSourceProposalRef(input: {
  caseRef: ActualTurnSourceAuthoringShadowCaseRef;
  turn: number;
  side: "a" | "b";
}): Promise<string> {
  return sourceAuthoringOpaqueRef({
    kind: "proposal",
    caseRef: input.caseRef,
    localRef: `turn-${input.turn}-action-${input.side}`,
  });
}

function fixtureNarrationInput(input: {
  before: ResolveTurnInput["state"];
  result: ResolveTurnResult;
}) {
  return {
    schemaVersion: 1,
    turn: input.result.state.turn,
    beforeState: input.before,
    afterState: input.result.state,
    events: input.result.events,
    actions: input.result.actions,
    mechanicalEvidence: input.result.mechanicalEvidence,
  } as const;
}

function fixturePersistenceCandidate(input: {
  before: ResolveTurnInput["state"];
  result: ResolveTurnResult;
}) {
  return {
    schemaVersion: 1,
    battleState: input.result.state,
    turnRecord: buildBattleTurnRecord({
      before: input.before,
      after: input.result.state,
      events: input.result.events,
      actions: input.result.actions,
    }),
  } as const;
}

async function authoritativeDigests(input: {
  before: ResolveTurnInput["state"];
  result: ResolveTurnResult;
}): Promise<AuthoritativeDigests> {
  const narrationInput = fixtureNarrationInput(input);
  const persistenceCandidate = fixturePersistenceCandidate(input);
  const [
    completeResult,
    nextState,
    actionReceipts,
    events,
    mechanicalEvidence,
    narrationInputDigest,
    persistenceCandidateDigest,
  ] = await Promise.all([
    sha256ApplicabilityDerivationValue(input.result),
    sha256ApplicabilityDerivationValue(input.result.state),
    sha256ApplicabilityDerivationValue(input.result.actions),
    sha256ApplicabilityDerivationValue(input.result.events),
    sha256ApplicabilityDerivationValue(input.result.mechanicalEvidence),
    sha256ApplicabilityDerivationValue(narrationInput),
    sha256ApplicabilityDerivationValue(persistenceCandidate),
  ]);
  return {
    completeResult,
    nextState,
    actionReceipts,
    events,
    mechanicalEvidence,
    narrationInput: narrationInputDigest,
    persistenceCandidate: persistenceCandidateDigest,
  };
}

function parity(input: {
  control: AuthoritativeDigests;
  shadow: AuthoritativeDigests;
  controlEffectfulCallTrace: [];
  shadowEffectfulCallTrace: [];
}): AuthoritativeParity {
  const compared = {
    completeResult:
      input.control.completeResult === input.shadow.completeResult,
    nextState: input.control.nextState === input.shadow.nextState,
    actionReceipts:
      input.control.actionReceipts === input.shadow.actionReceipts,
    events: input.control.events === input.shadow.events,
    mechanicalEvidence:
      input.control.mechanicalEvidence === input.shadow.mechanicalEvidence,
    narrationInput:
      input.control.narrationInput === input.shadow.narrationInput,
    persistenceCandidate:
      input.control.persistenceCandidate === input.shadow.persistenceCandidate,
    effectfulCallTrace: stableApplicabilityDerivationJson(
      input.controlEffectfulCallTrace,
    ) === stableApplicabilityDerivationJson(input.shadowEffectfulCallTrace),
  };
  return { ...compared, all: Object.values(compared).every(Boolean) };
}

function acceptedContext(
  result: SourceAuthoringTransitionResult,
): ActualTurnSourceAuthoringContext | string[] {
  return result.status === "accepted" ? result.context : result.reasons;
}

async function assembleSourceBundle(input: {
  shadowInput: ActualTurnSourceAuthoringShadowInput;
  snapshot: BattleRequestedActionSnapshot;
  operationTrace: string[];
}): Promise<
  | { status: "complete"; bundle: ApplicabilityDerivationSourceBundle }
  | { status: "failed"; reasons: string[] }
> {
  let context = createActualTurnSourceAuthoringContext({
    caseRef: input.shadowInput.derivationCaseRef,
    turn: input.snapshot.turn,
  });
  const advance = (
    result: SourceAuthoringTransitionResult,
    operation: string,
  ): string[] | undefined => {
    const next = acceptedContext(result);
    if (Array.isArray(next)) return next;
    context = next;
    input.operationTrace.push(operation);
    return undefined;
  };
  let reasons = advance(
    await authorTurnFallbackPolicy(context, {
      turn: input.snapshot.turn,
      allowedFallbacks: input.shadowInput.allowedFallbacks,
    }),
    "author.turn_fallback_policy",
  );
  if (reasons) return { status: "failed", reasons };

  const characterProposals = await Promise.all(
    (["a", "b"] as const).map(async (side) => ({
      origin: "character" as const,
      proposalRef: await requestedActionSourceProposalRef({
        caseRef: input.shadowInput.caseRef,
        turn: input.snapshot.turn,
        side,
      }),
      action: structuredClone(input.snapshot.requestedActions[side].action),
    })),
  );
  reasons = advance(
    await authorCoarseProposalRegistry(context, {
      turn: input.snapshot.turn,
      proposals: [
        ...characterProposals,
        ...(input.shadowInput.worldProposals ?? []),
      ],
    }),
    "author.coarse_proposal_registry",
  );
  if (reasons) return { status: "failed", reasons };

  reasons = advance(
    await authorAdaptiveStageReceipt(context, {
      turn: input.snapshot.turn,
      receipt: input.shadowInput.adaptiveReceipt,
    }),
    "author.adaptive_stage_receipt",
  );
  if (reasons) return { status: "failed", reasons };

  reasons = advance(openPurposeReadSet(context), "read_set.open");
  if (reasons) return { status: "failed", reasons };
  for (const read of input.shadowInput.reads) {
    reasons = advance(appendPurposeRead(context, {
      turn: input.snapshot.turn,
      sliceRef: read.sliceRef,
      check: read.check,
    }), "read_set.append");
    if (reasons) return { status: "failed", reasons };
  }
  reasons = advance(
    await closePurposeReadSet(context),
    "author.purpose_read_set",
  );
  if (reasons) return { status: "failed", reasons };

  reasons = advance(
    await authorConsistencyIssueSnapshot(context, {
      turn: input.snapshot.turn,
      envelope: input.shadowInput.issueEnvelope,
    }),
    "author.consistency_issue_snapshot",
  );
  if (reasons) return { status: "failed", reasons };

  const sealed = await sealActualTurnSourceAuthoringContext(context);
  if (sealed.status !== "complete") {
    return {
      status: "failed",
      reasons: sealed.status === "invalid_source"
        ? sealed.reasons
        : sealed.reasons,
    };
  }
  input.operationTrace.push("bundle.seal");
  return { status: "complete", bundle: sealed.bundle };
}

export async function runActualTurnSourceAuthoringShadow(
  input: ActualTurnSourceAuthoringShadowInput,
): Promise<ActualTurnSourceAuthoringShadowResult> {
  const sourceInputDigestBefore = await sha256ApplicabilityDerivationValue(input);
  const controlInput = structuredClone(input.resolveInput);
  const shadowInput = structuredClone(input.resolveInput);
  const controlEffectfulCallTrace: [] = [];
  const shadowEffectfulCallTrace: [] = [];
  const shadowOperationTrace: string[] = [];
  const control = resolveTurn(controlInput);
  let observedSnapshot: BattleRequestedActionSnapshot | undefined;
  let observerSnapshotFrozen = false;
  let observerError: string | undefined;
  const shadow = resolveTurn({
    ...shadowInput,
    shadowRequestedActionObserver: {
      observeRequestedActions(
        snapshot: DeepReadonly<BattleRequestedActionSnapshot>,
      ): unknown {
        observerSnapshotFrozen = isDeepFrozen(snapshot);
        observedSnapshot = structuredClone(snapshot) as
          BattleRequestedActionSnapshot;
        shadowOperationTrace.push("observer.requested_actions");
        if (input.injectObserverFailure) {
          throw new Error("injected source-authoring observer failure");
        }
        return { ignored: true };
      },
      onObservationError(error: unknown): void {
        observerError = errorMessage(error);
        shadowOperationTrace.push("observer.failure_captured");
      },
    },
  });
  const [controlDigests, shadowDigests] = await Promise.all([
    authoritativeDigests({ before: controlInput.state, result: control }),
    authoritativeDigests({ before: shadowInput.state, result: shadow }),
  ]);
  const parityResult = parity({
    control: controlDigests,
    shadow: shadowDigests,
    controlEffectfulCallTrace,
    shadowEffectfulCallTrace,
  });
  const sourceInputDigestAfter = await sha256ApplicabilityDerivationValue(input);
  const base: ShadowResultBase = {
    schemaVersion: 1,
    shadowVersion: ACTUAL_TURN_SOURCE_AUTHORING_SHADOW_VERSION,
    caseRef: input.caseRef,
    sourceInputDigestBefore,
    sourceInputDigestAfter,
    sourceMutated: sourceInputDigestBefore !== sourceInputDigestAfter,
    observerSnapshotFrozen,
    controlDigests,
    shadowDigests,
    parity: parityResult,
    controlEffectfulCallTrace,
    shadowEffectfulCallTrace,
    shadowOperationTrace,
    boundaryCounts: boundaryCounts(),
  };
  if (observerError) {
    return {
      ...base,
      status: "observer_failed",
      observerError,
      completeBundleProduced: false,
      inferredFieldCount: 0,
    };
  }
  if (!observedSnapshot) {
    return {
      ...base,
      status: "authoring_failed",
      reasons: ["requested_action_snapshot_missing"],
      completeBundleProduced: false,
      inferredFieldCount: 0,
    };
  }
  const authored = await assembleSourceBundle({
    shadowInput: input,
    snapshot: observedSnapshot,
    operationTrace: shadowOperationTrace,
  });
  if (authored.status === "failed") {
    return {
      ...base,
      shadowOperationTrace,
      status: "authoring_failed",
      reasons: authored.reasons,
      completeBundleProduced: false,
      inferredFieldCount: 0,
    };
  }
  return {
    ...base,
    shadowOperationTrace,
    status: "complete",
    sourceBundle: authored.bundle,
    sourceBundleDigest: await sha256ApplicabilityDerivationValue(
      authored.bundle,
    ),
    inferredFieldCount: 0,
  };
}
