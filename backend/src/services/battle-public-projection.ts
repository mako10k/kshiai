/** R: Project private battle state into the public BattlePublic DTO. */
import {
  projectPublicObjectStates,
  sceneBeatK,
  stanceLabel,
  summarizeSelectedPolicies,
  toPublicInstance,
  toPublicPolicyOption,
  usesPublicTurnClock,
  type BattlePublic,
  type BattleState,
  type CharacterSheet,
  type RatingDisplayContext,
} from "@kshiai/shared";

type RatingSettlement = NonNullable<BattleState["ratingSettlement"]>;
type PublicRatingSettlement = NonNullable<BattlePublic["ratingSettlement"]>;

function toPublicRatingEntry(
  entry: RatingSettlement["sideA"],
): NonNullable<PublicRatingSettlement["sideA"]> {
  return {
    before: entry.before,
    after: entry.after,
    delta: entry.delta,
    provisionalAfter: entry.provisionalAfter,
  };
}

function toPublicRatingSettlement(
  settlement: BattleState["ratingSettlement"],
): BattlePublic["ratingSettlement"] {
  if (!settlement?.applied) return null;
  const overall = settlement.overall ?? {
    sideA: settlement.sideA,
    sideB: settlement.sideB,
  };
  const publicSettlement = settlement.public ?? null;
  return {
    applied: settlement.applied,
    ranked: settlement.ranked,
    sameOwner: settlement.sameOwner,
    overall: {
      sideA: toPublicRatingEntry(overall.sideA),
      sideB: toPublicRatingEntry(overall.sideB),
    },
    public: publicSettlement
      ? {
          sideA: toPublicRatingEntry(publicSettlement.sideA),
          sideB: toPublicRatingEntry(publicSettlement.sideB),
        }
      : null,
    sideA: toPublicRatingEntry(overall.sideA),
    sideB: toPublicRatingEntry(overall.sideB),
  };
}

function publicPhaseReceipts(
  receipts: BattleState["phaseReceipts"],
): BattlePublic["receipts"] {
  const published: BattlePublic["receipts"] = [];
  for (const receipt of receipts ?? []) {
    published.push({
      turnReceiptId: receipt.id,
      sequence: receipt.sequence,
      phase: receipt.phase,
      combatTurn: receipt.combatTurn,
      stateRevision: receipt.toRevision,
    });
  }
  return published;
}

function publicTurnClockFields(
  state: BattleState,
): Pick<BattlePublic, "combatBeat" | "combatBeatsPerTurn"> {
  if (!usesPublicTurnClock(state) || (state.sceneBeat?.receiptIds.length ?? 0) === 0) {
    return {};
  }
  return {
    combatBeat: state.sceneBeat?.receiptIds.length,
    combatBeatsPerTurn: sceneBeatK(state),
  };
}

function publicCombatant(
  combatant: BattleState["sideA"],
  sheet: CharacterSheet | null | undefined,
): BattlePublic["sideA"] {
  return {
    characterId: combatant.characterId,
    displayName: combatant.displayName,
    canFight: combatant.canFight,
    imageUrl: combatant.imageUrl ?? (
      sheet && sheet.id === combatant.characterId
        ? (sheet.appearance?.imageUrl ?? null)
        : null
    ),
  };
}

function publicPolicies(state: BattleState) {
  const selected = new Set(state.selectedPolicyIdsA ?? []);
  return (state.policiesA ?? [])
    .filter((policy) => selected.has(policy.id))
    .map(toPublicPolicyOption);
}

function publicPendingEffects(state: BattleState): BattlePublic["pendingEffects"] {
  return (state.pendingEffects ?? []).flatMap((effect) => {
    if (effect.visibility !== "public_when_scheduled") return [];
    return [{
      effectId: effect.effectId,
      targetSide: effect.targetSide,
      parameterKey: effect.payload.parameterKey,
      direction: effect.payload.delta < 0 ? "loss" as const : "gain" as const,
      trigger: effect.trigger.kind === "due_turn"
        ? { kind: "due_turn" as const, dueTurn: effect.trigger.dueTurn }
        : { kind: "target_hp_at_most_percent" as const },
      expiresTurn: effect.expiresTurn,
    }];
  });
}

export function projectBattlePublic(
  state: BattleState,
  mySheet: CharacterSheet,
  resultSummary?: string | null,
  oppSheet?: CharacterSheet | null,
  _ratingDisplay?: RatingDisplayContext,
): BattlePublic {
  const sideASheet = mySheet.id === state.sideA.characterId ? mySheet : oppSheet;
  const sideBSheet = mySheet.id === state.sideB.characterId ? mySheet : oppSheet;

  return {
    id: state.id,
    status: state.status,
    ...(state.status === "incomplete" ? { incompleteReason: "試合処理を継続できなかったため、勝敗を確定せず終了しました。" } : {}),
    turn: state.turn,
    turnLimit: state.turnLimit,
    ...publicTurnClockFields(state),
    sideA: publicCombatant(state.sideA, sideASheet),
    sideB: publicCombatant(state.sideB, sideBSheet),
    policies: publicPolicies(state),
    policySummary: summarizeSelectedPolicies(
      state.policiesA,
      state.selectedPolicyIdsA,
    ),
    opponentPolicySummary: summarizeSelectedPolicies(
      state.policiesB,
      state.selectedPolicyIdsB,
    ),
    stanceA: state.stanceA,
    stanceALabel: state.stanceA ? stanceLabel(state.stanceA) : undefined,
    stanceB: state.stanceB,
    stanceBLabel: state.stanceB ? stanceLabel(state.stanceB) : undefined,
    scene: state.situation.scene,
    situationNotes: state.situation.notes,
    battlefield: state.battlefield ? toPublicInstance(state.battlefield) : null,
    semanticState: state.observationStatePublic ?? null,
    objectStates: projectPublicObjectStates({
      worldState: state.worldState,
      participantLabels: {
        a: state.sideA.displayName,
        b: state.sideB.displayName,
      },
    }),
    pendingEffects: publicPendingEffects(state),
    log: state.log,
    receipts: publicPhaseReceipts(state.phaseReceipts),
    availableActions: [],
    winnerSide: state.winnerSide,
    finishReason: state.finishReason,
    aftermathPending: Boolean(state.aftermathPending),
    prologuePending: Boolean(state.prologuePending),
    narrationStyleName: state.narrationStyle?.displayName,
    priorMatchSummary: state.priorMatchSummary ?? null,
    resultSummary: resultSummary ?? null,
    ratingSettlement: toPublicRatingSettlement(
      state.ratingSettlement,
    ),
  };
}
