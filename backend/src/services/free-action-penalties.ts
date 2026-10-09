// R: Validate an adjudicator's bounded effort decision before the server applies canonical consequences.
import { AppliedFreeActionPenaltyV1Schema, type BattleState, type FreeActionPenaltyProposalV1, type FreeActionAdjudicationProposal, type FreeActionCanonicalRoot, type FreeActionResolutionReceipt } from "@kshiai/shared";

export function isPartialFreeAction(proposal: FreeActionAdjudicationProposal): boolean {
  return proposal.penalty?.kind === "execution_limit" && proposal.penalty.execution === "partial";
}

export function partialSubjectIsBound(proposal: FreeActionAdjudicationProposal, root: FreeActionCanonicalRoot,
  previouslyPromoted: boolean): boolean {
  return !isPartialFreeAction(proposal) || !!root.existingEntityId || previouslyPromoted;
}

export function freeActionReceiptOutcome(proposal: FreeActionAdjudicationProposal): FreeActionResolutionReceipt["outcome"] {
  if (isPartialFreeAction(proposal)) return "partial";
  return proposal.outcome === "possible" ? "accepted" : "failed";
}

export function freeActionResultSummary(proposal: FreeActionAdjudicationProposal): string {
  if (proposal.penalty?.kind === "execution_limit") return proposal.penalty.executedDescription;
  return proposal.outcome === "possible" ? proposal.successSummary : proposal.failureSummary;
}

export function validateFreeActionPenalty(state: BattleState, side: "a" | "b", intentText: string,
  adjudication: FreeActionAdjudicationProposal): boolean {
  const proposal = adjudication.penalty;
  const actor = side === "a" ? state.sideA : state.sideB;
  if (!actor.actionEffortPolicy) return proposal == null;
  if (proposal === undefined) return false;
  if (proposal === null) return true;
  if (proposal.baseWorldRevision !== (state.worldState?.revision ?? 0)) return false;
  if (!intentText.includes(proposal.actionQuote)) return false;
  if (proposal.kind === "execution_limit") return validateExecutionLimit(adjudication, proposal);
  return true;
}

export function applyFreeActionPenalty(state: BattleState, side: "a" | "b", actionId: string,
  proposal: FreeActionPenaltyProposalV1 | null | undefined) {
  const actor = side === "a" ? state.sideA : state.sideB;
  const policy = actor.actionEffortPolicy;
  if (!policy || !proposal) return undefined;
  const requestedStamina = proposal.kind === "extra_stamina" ? policy.freeActionPenalty.extraStamina[proposal.level] : 0;
  const paidStamina = Math.min(Math.max(0, actor.parameters.stamina ?? 0), requestedStamina);
  const defenseReduction = proposal.kind === "defense_exposure"
    ? policy.freeActionPenalty.defenseReduction[proposal.level] : 0;
  const receipt = AppliedFreeActionPenaltyV1Schema.parse({
    contractVersion: policy.contractVersion, actionId, actorSide: side, proposal, requestedStamina, paidStamina,
    unpaidStamina: requestedStamina - paidStamina, defenseReduction,
  });
  actor.parameters.stamina = Math.max(0, (actor.parameters.stamina ?? 0) - paidStamina);
  if (proposal.kind === "defense_exposure") {
    // One pending exposure, never multiplicatively stack repeated penalties.
    const reduction = Math.max(actor.pendingDefenseExposure?.reduction ?? 0, defenseReduction);
    actor.pendingDefenseExposure = { actionId, reduction: reduction === 0.3 ? 0.3 : reduction === 0.2 ? 0.2 : 0.1,
      reason: proposal.reason };
  }
  actor.lastFreeActionPenalty = receipt;
  return receipt;
}

function validateExecutionLimit(adjudication: FreeActionAdjudicationProposal,
  penalty: Extract<FreeActionPenaltyProposalV1, { kind: "execution_limit" }>) {
  if (penalty.execution === "not_executed") {
    return adjudication.outcome === "impossible" && !adjudication.subject && adjudication.changes.length === 0
      && penalty.appliedChangeIndexes.length === 0 && penalty.executedDescription.length === 0;
  }
  const indexes = penalty.appliedChangeIndexes;
  return adjudication.outcome === "possible" && penalty.executedDescription.length > 0
    && indexes.length < adjudication.changes.length && new Set(indexes).size === indexes.length
    && indexes.every((index) => index < adjudication.changes.length);
}

export function executableFreeActionChanges(proposal: FreeActionAdjudicationProposal) {
  const penalty = proposal.penalty;
  if (penalty?.kind !== "execution_limit") return proposal.changes;
  if (penalty.execution === "not_executed") return [];
  return proposal.changes.filter((_change, index) => penalty.appliedChangeIndexes.includes(index));
}
