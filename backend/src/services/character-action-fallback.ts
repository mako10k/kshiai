import type { CharacterActionIntent } from "@kshiai/shared";
import type { CharacterActionDecisionContext } from "../llm/types.js";

/** Capabilities alone cannot supply a character's free-action or reflection judgment. */
export function buildDeterministicActionFallback(
  decision: Pick<CharacterActionDecisionContext, "availableActions" | "actionFeedback">,
): CharacterActionIntent | null {
  const spacingCorrection = decision.actionFeedback?.spacing.relation &&
    decision.actionFeedback.spacing.relation !== "in_band"
    ? decision.availableActions.find((action) => action.kind === "reposition")
    : undefined;
  const basicAttack = decision.availableActions.find((action) => action.kind === "basic_attack");
  const candidates = [
    ...(spacingCorrection ? [spacingCorrection] : []),
    ...(basicAttack ? [basicAttack] : []),
    ...decision.availableActions.filter((action) => action.kind !== "wait" && action.kind !== "reflect"),
    ...decision.availableActions,
  ];
  for (const candidate of candidates) {
    switch (candidate.kind) {
      case "free_action":
      case "reflect":
        break;
      case "skill":
        if (candidate.skillId) return { kind: "skill", skillId: candidate.skillId };
        break;
      case "basic_attack":
      case "defend":
      case "rest":
      case "wait":
      case "reposition":
        return { kind: candidate.kind };
    }
  }
  return null;
}
