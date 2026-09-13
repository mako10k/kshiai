import {
  isTerminalSemanticAuthoringStatusV1,
  type SemanticAuthoringRunStatusV1,
} from "@kshiai/shared";

export { isTerminalSemanticAuthoringStatusV1 };

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
