// R: Validate cross-field battle contracts without owning schema construction or state transitions.
import { z } from "zod";
import type { BattleState, BattlePhaseReceipt } from "./battle.js";
import type { AwarenessFrozenNarration } from "./awareness-narration-source.js";

export function validateBattleAgencyBindings(state: BattleState, ctx: z.RefinementCtx): void {
  const dynamic = state.assetManifest?.schemaVersion === 4 && state.assetManifest.consciousOutputContract === "dynamic-v4";
  const awareness = (state.assetManifest?.schemaVersion === 5 || state.assetManifest?.schemaVersion === 6);
  for (const side of ["agentStateA", "agentStateB"] as const) {
    const agent = state[side];
    if (!awareness && (dynamic ? !agent?.consciousAgencyV2 || Boolean(agent.consciousAgencyV1) : Boolean(agent?.consciousAgencyV2))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [side], message: "conscious state must match frozen output contract" });
    }
  }
  if (awareness) {
    for (const side of ["agentStateA", "agentStateB"] as const) {
      const agent = state[side];
      if (agent?.consciousAgencyV1 || agent?.consciousAgencyV2 || agent?.reactionStateV1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [side], message: "awareness-v5 cannot contain legacy agency or reaction state" });
      }
    }
    if (state.consciousRepairReservations?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["consciousRepairReservations"], message: "awareness-v5 cannot use legacy repair reservations" });
    }
  }

}

export function validateIncompleteBattleResult(state: BattleState, ctx: z.RefinementCtx): void {
  const awareness = (state.assetManifest?.schemaVersion === 5 || state.assetManifest?.schemaVersion === 6);
  if (state.status === "incomplete") {
    if (!awareness || !state.incompleteReason?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["incompleteReason"], message: "incomplete requires awareness-v5 and a technical reason" });
    }
    if (state.winnerSide !== null || state.finishReason !== null || state.adjudication || state.ratingSettlement) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "incomplete cannot contain a game result or rating settlement" });
    }
  } else if (state.incompleteReason !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["incompleteReason"], message: "technical reason is valid only for incomplete battles" });
  }

}

export function validateFrozenBattleReceipts(state: BattleState, ctx: z.RefinementCtx): void {
  const awareness = (state.assetManifest?.schemaVersion === 5 || state.assetManifest?.schemaVersion === 6);
  for (const [index, receipt] of (state.phaseReceipts ?? []).entries()) {
    const source = receipt.narrationInput;
    const frozenAwareness = source && "kind" in source && source.kind === "awareness-v5" ? source : null;
    if (awareness && !receipt.narrationDeferred && !frozenAwareness) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phaseReceipts", index, "narrationInput"], message: "awareness-v5 requires its frozen narration source" });
    }
    if (frozenAwareness && !matchesFrozenReceipt(state, receipt, frozenAwareness)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phaseReceipts", index, "narrationInput"], message: "frozen narration identity must match its battle receipt" });
    }
  }

}

export function validateBattleUniqueReferences(state: BattleState, ctx: z.RefinementCtx): void {
  const reservations = state.consciousRepairReservations ?? [];
  if (new Set(reservations).size !== reservations.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["consciousRepairReservations"], message: "repair reservations must be unique" });
  }
  const effectIds = (state.pendingEffects ?? []).map((effect) => effect.effectId);
  if (new Set(effectIds).size !== effectIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pendingEffects"],
      message: "pending effect IDs must be unique within a battle",
    });
  }

}

export function validateBattleAdjudication(state: BattleState, ctx: z.RefinementCtx): void {
  if (state.adjudication) {
    if (
      state.status !== "finished" ||
      state.finishReason !== "turn_limit"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adjudication"],
        message: "adjudication is valid only for a finished turn-limit battle",
      });
    }
    if (state.adjudication.turn !== state.turn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adjudication", "turn"],
        message: "adjudication turn must match battle turn",
      });
    }
    if (state.adjudication.winnerSide !== state.winnerSide) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adjudication", "winnerSide"],
        message: "adjudication winner must match canonical battle winner",
      });
    }
  }

}

export function validateBattleObservationRevisions(state: BattleState, ctx: z.RefinementCtx): void {
  const revision = state.semanticState?.revision;
  if (revision === undefined) return;
  for (const [field, observation] of [
    ["observationStateA", state.observationStateA],
    ["observationStateB", state.observationStateB],
    ["observationStatePublic", state.observationStatePublic],
  ] as const) {
    if (observation && observation.snapshot.revision !== revision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, "snapshot", "revision"],
        message: "observation revision must match semantic state",
      });
    }
  }
  for (const [field, frame] of [
    ["perceptionFrameA", state.perceptionFrameA],
    ["perceptionFrameB", state.perceptionFrameB],
  ] as const) {
    if (frame && frame.revision !== revision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, "revision"],
        message: "perception frame revision must match semantic state",
      });
    }
  }
  if (
    state.latestSemanticTransition &&
    state.latestSemanticTransition.toRevision !== revision
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["latestSemanticTransition", "toRevision"],
      message: "latest semantic transition must match semantic state",
    });
  }
}


function matchesFrozenReceipt(state: BattleState, receipt: BattlePhaseReceipt, source: AwarenessFrozenNarration): boolean {
  return (state.assetManifest?.schemaVersion === 5 || state.assetManifest?.schemaVersion === 6) && source.battleId === state.id && source.turnReceiptId === receipt.id &&
    source.phase === receipt.phase && (receipt.combatTurn === null || source.turn === receipt.combatTurn);
}
