import type {
  ProposalProvenanceV1,
  SemanticAuthoringAdapterV1,
  SemanticAuthoringCapabilityDescriptorV1,
  SemanticAuthoringFailureCategoryV1,
  SemanticAuthoringOwnerQuestionEvidenceV1,
  SemanticAuthoringPolicyV1,
  SemanticAuthoringResolverResultV1,
  SemanticAuthoringResultIdentityV1,
  SemanticAuthoringRunV1,
  SemanticAuthoringStateV1,
  SemanticProposalV1,
  SourceDispositionDecisionV1,
} from "@kshiai/shared";
import { countSemanticAuthoringStepV1 } from "./accounting.js";
import {
  expireCapabilitySessionIfNeededV1,
  recordCapabilityInvocationV1,
  revokeCapabilitySessionV1,
  visibleCapabilityToolsV1,
  type CapabilitySessionV1,
} from "./capability-session.js";
import {
  applyProposalTransactionV1,
  type KernelTransactionIssueV1,
} from "./kernel.js";
import {
  appendProgressObservationV1,
  classifyProgressCondition,
  detectRepeatedStateCycle,
  observationsSinceProgress,
} from "./progress-monitor.js";

export type SemanticAuthoringKernelIssuesV1<Finding> = Readonly<{
  revisionMismatch: KernelTransactionIssueV1<Finding>;
  proposalRejected: KernelTransactionIssueV1<Finding>;
  referenceCheckFailed: KernelTransactionIssueV1<Finding>;
}>;

export type SemanticAuthoringWorkIdsV1 = Readonly<{
  workItemId: string;
  capabilitySessionId: string;
  questionId: string;
  expiresAtMs: number;
  nowMs: number;
}>;

export type SemanticAuthoringOrchestrationV1<
  Candidate,
  Obligation,
  Finding,
  WorkItem,
  Question,
  FinalCandidate,
> = Readonly<{
  status: "continue" | "awaiting_proposal" | "terminal";
  state: SemanticAuthoringStateV1<
    Candidate,
    Obligation,
    Finding,
    WorkItem,
    Question,
    FinalCandidate
  >;
}>;

type AuthoringState<C, O, F, W, Q, FC> = SemanticAuthoringStateV1<C, O, F, W, Q, FC>;
type CountedAdvance<C, O, F, W, Q, FC> =
  | Readonly<{ status: "counted"; state: AuthoringState<C, O, F, W, Q, FC> }>
  | SemanticAuthoringOrchestrationV1<C, O, F, W, Q, FC>;
type AuthoringAdapter<S, C, O, W, Payload, F, Q, A, FC> = SemanticAuthoringAdapterV1<
  S,
  C,
  O,
  W,
  SemanticProposalV1<Payload>,
  F,
  Q,
  A,
  FC
>;

function adapterView<C, O, F>(
  state: Readonly<{
    candidate: C;
    obligations: ReadonlyMap<string, O>;
    findings: ReadonlyMap<string, F>;
    provenance: ReadonlyMap<string, readonly ProposalProvenanceV1[]>;
    sourceDispositions: ReadonlyMap<string, SourceDispositionDecisionV1>;
  }>,
) {
  return {
    candidate: state.candidate,
    obligations: state.obligations,
    findings: state.findings,
    provenance: state.provenance,
    sourceDispositions: state.sourceDispositions,
  };
}

function resultIdentity<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
): SemanticAuthoringResultIdentityV1 {
  return {
    runId: state.run.runId,
    attemptId: state.run.attemptId,
    sourceIdentity: state.run.sourceIdentity,
    policyIdentity: state.run.policyIdentity,
    adapterIdentity: state.run.adapterIdentity,
    accounting: state.accounting,
    sourceLedger: {
      provenance: [...state.provenance.values()].flat(),
      sourceDispositions: [...state.sourceDispositions.values()],
    },
  };
}

function clearWork<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
): AuthoringState<C, O, F, W, Q, FC> {
  return {
    ...state,
    activeWorkItem: null,
    capabilitySession: state.capabilitySession
      ? revokeCapabilitySessionV1(state.capabilitySession)
      : null,
  };
}

export function chargeOutstandingReservationV1<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
): AuthoringState<C, O, F, W, Q, FC> {
  const reservation = state.outstandingReservation;
  if (!reservation) {
    return state;
  }
  return {
    ...state,
    outstandingReservation: null,
    accounting: {
      llmCalls: state.accounting.llmCalls + 1,
      countedSteps: state.accounting.countedSteps,
      elapsedMs: state.accounting.elapsedMs + reservation.elapsedMs,
      inputTokens: state.accounting.inputTokens + reservation.inputTokens,
      outputTokens: state.accounting.outputTokens + reservation.outputTokens,
      costMicroUsd: state.accounting.costMicroUsd + reservation.costMicroUsd,
    },
  };
}

function terminate<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
  terminalResult: SemanticAuthoringResolverResultV1<FC, Q>,
): SemanticAuthoringOrchestrationV1<C, O, F, W, Q, FC> {
  const charged = chargeOutstandingReservationV1(state);
  const identity = resultIdentity(charged);
  const result = terminalResult.kind === "failed"
    ? {
        ...terminalResult,
        ...identity,
        receipt: {
          ...terminalResult.receipt,
          accounting: charged.accounting,
          sourceIdentity: charged.run.sourceIdentity,
        },
      }
    : { ...terminalResult, ...identity };
  return {
    status: "terminal",
    state: {
      ...clearWork(charged),
      terminalResult: result,
    },
  };
}

export function failSemanticAuthoringV1<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
  category: SemanticAuthoringFailureCategoryV1,
): SemanticAuthoringOrchestrationV1<C, O, F, W, Q, FC> {
  const charged = chargeOutstandingReservationV1(state);
  return terminate(charged, {
    ...resultIdentity(charged),
    kind: "failed",
    receipt: {
      category,
      accounting: charged.accounting,
      relevantFindingKeys: [...charged.findings.keys()],
      sourceIdentity: charged.run.sourceIdentity,
    },
  });
}

export function semanticAuthoringControlFailureV1<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
): SemanticAuthoringFailureCategoryV1 | null {
  if (trustedStateCorrupt(state)) {
    return "trusted_state_corrupt";
  }
  if (resourceExhausted(state)) {
    return "resource_exhausted";
  }
  return null;
}

function trustedStateCorrupt<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
): boolean {
  if (state.candidateRevision < 0) {
    return true;
  }
  if (state.recoveryStrategyChanges < 0) {
    return true;
  }
  if (state.recoveryStrategyChanges > state.policy.maxRecoveryStrategyChanges) {
    return true;
  }
  if (state.progressHistory.length > state.policy.maxProgressObservations) {
    return true;
  }
  if (state.accounting.countedSteps < 0 || state.accounting.llmCalls < 0) {
    return true;
  }
  if (state.accounting.elapsedMs < 0 || state.accounting.costMicroUsd < 0) {
    return true;
  }
  if (state.accounting.inputTokens < 0 || state.accounting.outputTokens < 0) {
    return true;
  }
  if (state.capabilitySession && state.capabilitySession.runId !== state.run.runId) {
    return true;
  }
  return false;
}

function resourceExhausted<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
): boolean {
  return (
    state.accounting.countedSteps >= state.policy.maxCountedSteps ||
    state.accounting.llmCalls > state.policy.maxLlmCalls ||
    state.accounting.costMicroUsd > state.policy.maxCostMicroUsd ||
    state.accounting.inputTokens > state.policy.maxCumulativeInputTokens ||
    state.accounting.outputTokens > state.policy.maxCumulativeOutputTokens
  );
}

export function guardSemanticAuthoringRunningV1<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
): SemanticAuthoringOrchestrationV1<C, O, F, W, Q, FC> | null {
  if (state.terminalResult) {
    return { status: "terminal", state };
  }
  if (trustedStateCorrupt(state)) {
    return failSemanticAuthoringV1(state, "trusted_state_corrupt");
  }
  if (resourceExhausted(state)) {
    return failSemanticAuthoringV1(state, "resource_exhausted");
  }
  return null;
}

function countStep<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
): CountedAdvance<C, O, F, W, Q, FC> {
  const counted = countSemanticAuthoringStepV1(state.policy, state.accounting);
  if (!counted.accepted) {
    return failSemanticAuthoringV1({ ...state, accounting: counted.accounting }, "resource_exhausted");
  }
  return { status: "counted", state: { ...state, accounting: counted.accounting } };
}

function knownEvidenceIds<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
): ReadonlySet<string> {
  return new Set([
    ...state.obligations.keys(),
    ...state.findings.keys(),
    ...state.provenance.keys(),
    ...state.sourceDispositions.keys(),
  ]);
}

function evidenceIsReferenced(
  evidence: SemanticAuthoringOwnerQuestionEvidenceV1,
  knownIds: ReadonlySet<string>,
): boolean {
  const groups = [
    evidence.explicitProblemClaimIds,
    evidence.materialProtectedImpactClaimIds,
    evidence.materiallyDifferentOutcomeClaimIds,
    evidence.exhaustedRecoveryFindingKeys,
    evidence.unsafeAutomaticResolutionClaimIds,
  ];
  return groups.every(
    (ids) => ids.length > 0 && ids.every((id) => knownIds.has(id)),
  );
}

function observeProgress<S, C, O, W, Payload, F, Q, A, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
  adapter: AuthoringAdapter<S, C, O, W, Payload, F, Q, A, FC>,
): AuthoringState<C, O, F, W, Q, FC> {
  const observation = adapter.observeProgress({
    ...adapterView(state),
    phase: state.phase,
    previous: state.progressHistory[state.progressHistory.length - 1],
  });
  return {
    ...state,
    phase: observation.phase,
    progressHistory: appendProgressObservationV1(
      state.progressHistory,
      observation,
      state.policy,
    ),
  };
}

function applyProgressDecision<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
): CountedAdvance<C, O, F, W, Q, FC> {
  const condition = classifyProgressCondition(state.progressHistory, {
    strategyChanges: state.recoveryStrategyChanges,
    cycleRecoveryAlreadyUsed: state.cycleRecoveryAlreadyUsed,
  });
  if (condition === "stalled_without_progress") {
    return failSemanticAuthoringV1(state, "stalled_without_progress");
  }
  if (condition === "repeated_state_cycle") {
    return failSemanticAuthoringV1(state, "repeated_state_cycle");
  }
  if (condition !== "recovery_required") {
    return { status: "counted", state };
  }

  const cycle = detectRepeatedStateCycle(state.progressHistory);
  const withoutProgress = observationsSinceProgress(state.progressHistory).length;
  const alreadyRecoveredThisWindow =
    !cycle && state.recoveryStrategyChanges > 0 && withoutProgress > 4;
  if (alreadyRecoveredThisWindow) {
    return { status: "counted", state };
  }
  if (state.recoveryStrategyChanges >= state.policy.maxRecoveryStrategyChanges) {
    return failSemanticAuthoringV1(
      state,
      cycle ? "repeated_state_cycle" : "stalled_without_progress",
    );
  }

  const counted = countStep(state);
  if (counted.status !== "counted") {
    return counted;
  }
  return {
    status: "counted",
    state: {
      ...counted.state,
      recoveryStrategyChanges: counted.state.recoveryStrategyChanges + 1,
      cycleRecoveryAlreadyUsed: counted.state.cycleRecoveryAlreadyUsed || cycle,
    },
  };
}

function mutationRoleFromDescriptor(
  descriptor: SemanticAuthoringCapabilityDescriptorV1,
): CapabilitySessionV1["mutationRole"] | null {
  if (descriptor.skill.legalCapabilityRoles.includes("propose-change")) {
    return "propose-change";
  }
  if (descriptor.skill.legalCapabilityRoles.includes("submit-review")) {
    return "submit-review";
  }
  return null;
}

function mergeProvenance(
  ledger: ReadonlyMap<string, readonly ProposalProvenanceV1[]>,
  entries: readonly ProposalProvenanceV1[],
): ReadonlyMap<string, readonly ProposalProvenanceV1[]> {
  if (entries.length === 0) {
    return ledger;
  }
  const next = new Map(ledger);
  for (const entry of entries) {
    next.set(entry.targetClaimId, [...(next.get(entry.targetClaimId) ?? []), entry]);
  }
  return next;
}

function withFinding<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
  issue: KernelTransactionIssueV1<F>,
): AuthoringState<C, O, F, W, Q, FC> {
  const findings = new Map(state.findings);
  findings.set(issue.key, issue.finding);
  return { ...state, findings };
}

export function startSemanticAuthoringV1<S, C, O, W, Payload, F, Q, A, FC>(
  adapter: AuthoringAdapter<S, C, O, W, Payload, F, Q, A, FC>,
  run: SemanticAuthoringRunV1,
  policy: SemanticAuthoringPolicyV1,
  frozenSource: unknown,
):
  | Readonly<{ accepted: true; state: AuthoringState<C, O, F, W, Q, FC> }>
  | Readonly<{ accepted: false; reason: "source_decode_failed" | "identity_mismatch" }> {
  if (
    run.adapterIdentity !== adapter.identity ||
    run.policyIdentity !== policy.identity
  ) {
    return { accepted: false, reason: "identity_mismatch" };
  }
  const decoded = adapter.decodeFrozenSource(frozenSource);
  if (!decoded.accepted) {
    return { accepted: false, reason: "source_decode_failed" };
  }
  const baseline = adapter.buildBaseline(decoded.value, run.mode);
  return {
    accepted: true,
    state: {
      run,
      policy,
      candidateRevision: 0,
      candidate: baseline.candidate,
      obligations: new Map(baseline.obligations),
      findings: new Map(),
      provenance: new Map(baseline.provenance),
      sourceDispositions: new Map(baseline.sourceDispositions),
      accounting: {
        llmCalls: 0,
        countedSteps: 0,
        elapsedMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        costMicroUsd: 0,
      },
      outstandingReservation: null,
      phase: "baseline",
      progressHistory: [],
      recoveryStrategyChanges: 0,
      cycleRecoveryAlreadyUsed: false,
      activeWorkItem: null,
      capabilitySession: null,
      terminalResult: null,
    },
  };
}

function finalizeOrAsk<S, C, O, W, Payload, F, Q, A, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
  adapter: AuthoringAdapter<S, C, O, W, Payload, F, Q, A, FC>,
  questionId: string,
): SemanticAuthoringOrchestrationV1<C, O, F, W, Q, FC> {
  const finalized = adapter.finalize(adapterView(state));
  if (finalized.accepted) {
    return terminate(state, {
      ...resultIdentity(state),
      kind: "ready_for_review",
      finalCandidate: finalized.finalCandidate,
      finalCandidateDigest: finalized.finalCandidateDigest,
      obligationCoverage: finalized.obligationCoverage,
      reconciliationReceiptIdentity: finalized.reconciliationReceiptIdentity,
      compilerReceiptIdentity: finalized.compilerReceiptIdentity,
      disclosureReceiptIdentity: finalized.disclosureReceiptIdentity,
      expectedCurrentGenerationId: state.run.expectedCurrentGenerationId,
    });
  }

  const withFindings = { ...state, findings: new Map(finalized.findings) };
  const assessment = adapter.assessQuestion(adapterView(withFindings));
  if (
    assessment.ask &&
    evidenceIsReferenced(assessment.evidence, knownEvidenceIds(withFindings)) &&
    withFindings.accounting.countedSteps < withFindings.policy.maxCountedSteps
  ) {
    return terminate(withFindings, {
      ...resultIdentity(withFindings),
      kind: "needs_owner_answer",
      question: assessment.question,
      evidence: assessment.evidence,
      resumption: {
        predecessorRunId: withFindings.run.runId,
        predecessorAttemptId: withFindings.run.attemptId,
        questionId,
      },
    });
  }
  return failSemanticAuthoringV1(withFindings, "bounded_semantic_failure");
}

export function selectSemanticAuthoringWorkV1<S, C, O, W, Payload, F, Q, A, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
  adapter: AuthoringAdapter<S, C, O, W, Payload, F, Q, A, FC>,
  ids: SemanticAuthoringWorkIdsV1,
): SemanticAuthoringOrchestrationV1<C, O, F, W, Q, FC> {
  const guarded = guardSemanticAuthoringRunningV1(state);
  if (guarded) {
    return guarded;
  }

  const observedState = observeProgress(state, adapter);
  const selected = adapter.selectWork(adapterView(observedState));
  if (!selected.selected) {
    const counted = countStep(clearWork(observedState));
    if (counted.status !== "counted") {
      return counted;
    }
    return finalizeOrAsk(counted.state, adapter, ids.questionId);
  }

  const observed = applyProgressDecision(observedState);
  if (observed.status !== "counted") {
    return observed;
  }

  const counted = countStep(clearWork(observed.state));
  if (counted.status !== "counted") {
    return counted;
  }

  const descriptor = adapter.describeCapabilities(selected.workItem);
  const mutationRole = mutationRoleFromDescriptor(descriptor);
  if (mutationRole === null) {
    return failSemanticAuthoringV1(counted.state, "technical_failure");
  }

  return {
    status: "awaiting_proposal",
    state: {
      ...counted.state,
      phase: descriptor.skill.phase,
      activeWorkItem: selected.workItem,
      capabilitySession: {
        runId: counted.state.run.runId,
        workItemId: ids.workItemId,
        capabilitySessionId: ids.capabilitySessionId,
        mutationRole,
        allowedSelectors: descriptor.allowedSelectors,
        proposalSchemaIdentity: descriptor.proposalSchemaIdentity,
        writeClosure: descriptor.writeClosure,
        expiresAtMs: ids.expiresAtMs,
        queryInvocationCount: 0,
        mutationInvocationCount: 0,
        mutationSucceeded: false,
        revoked: false,
      },
    },
  };
}

function mutationTool(session: CapabilitySessionV1) {
  return session.mutationRole === "propose-change"
    ? "authoring_propose_change_v1"
    : "authoring_submit_review_v1";
}

function stageAdapterProposal<S, C, O, W, Payload, F, Q, A, FC>(
  adapter: AuthoringAdapter<S, C, O, W, Payload, F, Q, A, FC>,
  candidate: C,
  obligations: ReadonlyMap<string, O>,
  findings: ReadonlyMap<string, F>,
  proposal: SemanticProposalV1<Payload>,
  provenance: ReadonlyMap<string, readonly ProposalProvenanceV1[]>,
  sourceDispositions: ReadonlyMap<string, SourceDispositionDecisionV1>,
) {
  const staged = adapter.stageProposal({
    candidate,
    obligations,
    findings,
    provenance,
    sourceDispositions,
    proposal,
  });
  if (!staged.accepted) {
    return {
      accepted: false as const,
      issue: { key: staged.findingKey, finding: staged.finding },
    };
  }
  return {
    accepted: true as const,
    candidate: staged.candidate,
    obligations: staged.obligations,
    findings: staged.findings,
    sourceDispositions: staged.sourceDispositions,
  };
}

function missingReferenceIssue<O, F, Payload>(
  proposal: SemanticProposalV1<Payload>,
  obligations: ReadonlyMap<string, O>,
  findings: ReadonlyMap<string, F>,
  provenance: ReadonlyMap<string, readonly ProposalProvenanceV1[]>,
  sourceDispositions: AuthoringState<unknown, O, F, unknown, unknown, unknown>["sourceDispositions"],
  issue: KernelTransactionIssueV1<F>,
): KernelTransactionIssueV1<F> | null {
  const ids = new Set<string>([
    ...obligations.keys(),
    ...findings.keys(),
    ...provenance.keys(),
    ...sourceDispositions.keys(),
  ]);
  for (const entry of proposal.provenance) {
    ids.add(entry.targetClaimId);
    for (const sourceId of entry.sourceClaimIds) {
      ids.add(sourceId);
    }
  }
  const missing = [
    ...proposal.affectedObligationIds.filter((id) => !obligations.has(id)),
    ...proposal.declaredSemanticDependantIds.filter((id) => !ids.has(id)),
  ];
  return missing.length > 0 ? issue : null;
}

function recordMutation<C, O, F, W, Q, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
  session: CapabilitySessionV1,
  identity: Readonly<{
    runId: string;
    workItemId: string;
    capabilitySessionId: string;
    proposalSchemaIdentity: string;
  }>,
  nowMs: number,
  succeeded: boolean,
): AuthoringState<C, O, F, W, Q, FC> {
  return {
    ...state,
    capabilitySession: recordCapabilityInvocationV1(
      session,
      {
        tool: mutationTool(session),
        runId: identity.runId,
        workItemId: identity.workItemId,
        capabilitySessionId: identity.capabilitySessionId,
        proposalSchemaIdentity: identity.proposalSchemaIdentity,
      },
      nowMs,
      succeeded,
    ).session,
  };
}

export function applySemanticAuthoringProposalV1<S, C, O, W, Payload, F, Q, A, FC>(
  state: AuthoringState<C, O, F, W, Q, FC>,
  adapter: AuthoringAdapter<S, C, O, W, Payload, F, Q, A, FC>,
  encodedProposal: unknown,
  nowMs: number,
  issues: SemanticAuthoringKernelIssuesV1<F>,
): SemanticAuthoringOrchestrationV1<C, O, F, W, Q, FC> {
  const guarded = guardSemanticAuthoringRunningV1(state);
  if (guarded) {
    return guarded;
  }
  if (!state.activeWorkItem || !state.capabilitySession) {
    return { status: "continue", state };
  }

  const session = expireCapabilitySessionIfNeededV1(state.capabilitySession, nowMs);
  const current = { ...state, capabilitySession: session };
  if (session.revoked) {
    return { status: "awaiting_proposal", state: current };
  }

  const decoded = adapter.decodeProposal(state.activeWorkItem, encodedProposal);
  if (!decoded.accepted) {
    return {
      status: "awaiting_proposal",
      state: withFinding(
        recordMutation(current, session, session, nowMs, false),
        issues.proposalRejected,
      ),
    };
  }

  const proposal = decoded.value;
  if (
    proposal.runId !== session.runId ||
    proposal.workItemId !== session.workItemId ||
    proposal.capabilitySessionId !== session.capabilitySessionId ||
    proposal.proposalSchemaIdentity !== session.proposalSchemaIdentity
  ) {
    const recorded = recordCapabilityInvocationV1(
      session,
      {
        tool: mutationTool(session),
        runId: proposal.runId,
        workItemId: proposal.workItemId,
        capabilitySessionId: proposal.capabilitySessionId,
        proposalSchemaIdentity: proposal.proposalSchemaIdentity,
      },
      nowMs,
      false,
    );
    return {
      status: "awaiting_proposal",
      state: { ...current, capabilitySession: recorded.session },
    };
  }

  if (!visibleCapabilityToolsV1(session, nowMs).includes(mutationTool(session))) {
    return {
      status: "awaiting_proposal",
      state: withFinding(current, issues.proposalRejected),
    };
  }

  const counted = countStep(current);
  if (counted.status !== "counted") {
    return counted;
  }

  let nextDispositions = counted.state.sourceDispositions;
  const stageProposal = (
    candidate: typeof counted.state.candidate,
    obligations: typeof counted.state.obligations,
    findings: typeof counted.state.findings,
    stagedProposal: typeof proposal,
  ) => {
    const staged = stageAdapterProposal(
      adapter,
      candidate,
      obligations,
      findings,
      stagedProposal,
      counted.state.provenance,
      counted.state.sourceDispositions,
    );
    if (staged.accepted && staged.sourceDispositions) {
      nextDispositions = new Map([
        ...nextDispositions,
        ...staged.sourceDispositions,
      ]);
    }
    return staged;
  };
  const transaction = applyProposalTransactionV1(
    {
      candidateRevision: counted.state.candidateRevision,
      candidate: counted.state.candidate,
      obligations: counted.state.obligations,
      findings: counted.state.findings,
    },
    proposal.baseCandidateRevision,
    proposal,
    stageProposal,
    [
      (_candidate, obligations, findings) => missingReferenceIssue(
        proposal,
        obligations,
        findings,
        counted.state.provenance,
        counted.state.sourceDispositions,
        issues.referenceCheckFailed,
      ),
    ],
    issues.revisionMismatch,
  );

  const recordedInvocation = recordCapabilityInvocationV1(
    session,
    {
      tool: mutationTool(session),
      runId: proposal.runId,
      workItemId: proposal.workItemId,
      capabilitySessionId: proposal.capabilitySessionId,
      proposalSchemaIdentity: proposal.proposalSchemaIdentity,
    },
    nowMs,
    transaction.accepted,
  );
  if (!recordedInvocation.accepted) {
    return {
      status: "awaiting_proposal",
      state: withFinding(
        { ...counted.state, capabilitySession: recordedInvocation.session },
        issues.proposalRejected,
      ),
    };
  }
  const recorded = {
    ...counted.state,
    capabilitySession: recordedInvocation.session,
  };

  if (!transaction.accepted) {
    const rejected = observeProgress(
      { ...recorded, findings: transaction.state.findings },
      adapter,
    );
    const decided = applyProgressDecision(rejected);
    if (decided.status !== "counted") {
      return decided;
    }
    return { status: "awaiting_proposal", state: decided.state };
  }

  const reconciled = adapter.reconcileAffected({
    candidate: transaction.state.candidate,
    obligations: transaction.state.obligations,
    findings: transaction.state.findings,
    affectedObligationIds: proposal.affectedObligationIds,
    declaredSemanticDependantIds: proposal.declaredSemanticDependantIds,
  });
  const reconciledFindings = new Map(reconciled.findings);
  // A valid committed replacement resolves this kernel-owned decoder failure.
  // Domain findings are not cleared merely because JSON now parses.
  if (reconciledFindings.get(issues.proposalRejected.key) === issues.proposalRejected.finding) {
    reconciledFindings.delete(issues.proposalRejected.key);
  }
  const applied = observeProgress(
    {
      ...recorded,
      candidateRevision: transaction.state.candidateRevision,
      candidate: transaction.state.candidate,
      obligations: transaction.state.obligations,
      findings: reconciledFindings,
      provenance: mergeProvenance(counted.state.provenance, proposal.provenance),
      sourceDispositions: nextDispositions,
    },
    adapter,
  );
  const decided = applyProgressDecision(clearWork(applied));
  if (decided.status !== "counted") {
    return decided;
  }
  return { status: "continue", state: decided.state };
}
