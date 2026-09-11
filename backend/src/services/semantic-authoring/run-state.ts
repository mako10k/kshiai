import type { SemanticAuthoringRunStatusV1 } from "@kshiai/shared";

const terminalStatuses: ReadonlySet<SemanticAuthoringRunStatusV1> = new Set([
  "ready_for_review",
  "needs_owner_answer",
  "failed",
  "cancelled",
  "expired",
]);

export function isTerminalSemanticAuthoringStatusV1(
  status: SemanticAuthoringRunStatusV1,
): boolean {
  return terminalStatuses.has(status);
}

export function transitionSemanticAuthoringRunV1(
  current: SemanticAuthoringRunStatusV1,
  next: SemanticAuthoringRunStatusV1,
): SemanticAuthoringRunStatusV1 | null {
  if (isTerminalSemanticAuthoringStatusV1(current)) {
    return null;
  }
  if (current === "pending") {
    return next === "claimed" || next === "cancelled" || next === "expired"
      ? next
      : null;
  }
  return isTerminalSemanticAuthoringStatusV1(next) ? next : null;
}
