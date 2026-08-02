import {
  createBattleState,
  resolveTurn,
  toPublicCharacter,
  type BattleActionRequest,
  type BattlePublic,
  type BattleState,
  type CharacterSheet,
} from "@kshiai/shared";
import { config } from "../config.js";
import { newId } from "../id.js";
import type { LlmProvider } from "../llm/index.js";
import * as battleRepo from "../repositories/battles.js";
import * as charRepo from "../repositories/characters.js";

function availableActions(sheet: CharacterSheet): BattlePublic["availableActions"] {
  const actions: BattlePublic["availableActions"] = [
    { kind: "defend", label: "防御" },
    { kind: "wait", label: "待機" },
  ];
  for (const s of sheet.skills) {
    actions.unshift({
      kind: "skill",
      skillId: s.id,
      label: s.name,
    });
  }
  return actions;
}

export function toBattlePublic(
  state: BattleState,
  mySheet: CharacterSheet,
  resultSummary?: string | null,
): BattlePublic {
  return {
    id: state.id,
    status: state.status,
    turn: state.turn,
    turnLimit: state.turnLimit,
    sideA: {
      characterId: state.sideA.characterId,
      displayName: state.sideA.displayName,
      canFight: state.sideA.canFight,
    },
    sideB: {
      characterId: state.sideB.characterId,
      displayName: state.sideB.displayName,
      canFight: state.sideB.canFight,
    },
    scene: state.situation.scene,
    situationNotes: state.situation.notes,
    log: state.log,
    availableActions:
      state.status === "active" ? availableActions(mySheet) : [],
    winnerSide: state.winnerSide,
    finishReason: state.finishReason,
    resultSummary: resultSummary ?? null,
  };
}

export async function startBattle(input: {
  userId: string;
  myCharacterId: string;
  opponentCharacterId: string;
  llm: LlmProvider;
}): Promise<BattlePublic> {
  const mine = charRepo.getSheet(input.myCharacterId);
  const opp = charRepo.getSheet(input.opponentCharacterId);
  if (!mine || mine.ownerUserId !== input.userId) {
    throw new Error("MY_CHARACTER_NOT_FOUND");
  }
  if (!opp) throw new Error("OPPONENT_NOT_FOUND");
  if (mine.id === opp.id) throw new Error("SAME_CHARACTER");

  const id = newId("btl");
  let state = createBattleState({
    id,
    sideA: mine,
    sideB: opp,
    turnLimit: config.battleTurnLimit,
  });

  const sit = await input.llm.proposeSituation({
    scene: state.situation.scene,
    turn: 0,
    eventsHint: "opening",
  });
  if (sit.scene) state.situation.scene = sit.scene;
  if (sit.notes) state.situation.notes = sit.notes;
  if (sit.coefficients) {
    state.situation.coefficients = sit.coefficients;
  }

  const opening = await input.llm.narrateTurn({
    turn: 0,
    scene: state.situation.scene,
    sideAName: mine.displayName,
    sideBName: opp.displayName,
    events: [
      {
        type: "info",
        summary: `${mine.displayName} と ${opp.displayName} が対峙する。`,
      },
    ],
  });
  state.log = [opening];
  state.updatedAt = new Date().toISOString();

  battleRepo.saveBattle(state, {
    sideAUserId: input.userId,
    sideACharacterId: mine.id,
    sideBCharacterId: opp.id,
  });

  return toBattlePublic(state, mine);
}

export async function performAction(input: {
  userId: string;
  battleId: string;
  action: BattleActionRequest;
  llm: LlmProvider;
}): Promise<BattlePublic> {
  const meta = battleRepo.getBattleMeta(input.battleId);
  const state = battleRepo.getBattle(input.battleId);
  if (!meta || !state) throw new Error("BATTLE_NOT_FOUND");
  if (meta.side_a_user_id !== input.userId) throw new Error("FORBIDDEN");
  if (state.status !== "active") throw new Error("BATTLE_FINISHED");

  const mine = charRepo.getSheet(meta.side_a_character_id);
  const opp = charRepo.getSheet(meta.side_b_character_id);
  if (!mine || !opp) throw new Error("CHARACTER_MISSING");

  const situationUpdate = await input.llm.proposeSituation({
    scene: state.situation.scene,
    turn: state.turn + 1,
    eventsHint: input.action.kind,
  });

  const { state: next, events } = resolveTurn({
    state,
    playerAction: {
      actorSide: "a",
      kind: input.action.kind,
      skillId: input.action.skillId,
    },
    sideASkills: mine.skills,
    sideBSkills: opp.skills,
    situationUpdate,
  });

  const narrative = await input.llm.narrateTurn({
    turn: next.turn,
    scene: next.situation.scene,
    sideAName: next.sideA.displayName,
    sideBName: next.sideB.displayName,
    events,
  });
  next.log = [...next.log, narrative];

  let resultSummary: string | null = null;
  if (next.status === "finished") {
    if (next.finishReason === "turn_limit") {
      const ref = await input.llm.referee({
        sideAName: next.sideA.displayName,
        sideBName: next.sideB.displayName,
        engineWinnerSide: next.winnerSide,
        logSummaries: next.log.flatMap((b) => b.narrator).slice(-12),
      });
      next.winnerSide = ref.winnerSide;
      resultSummary = ref.summary;
    } else {
      const winner =
        next.winnerSide === "a"
          ? next.sideA.displayName
          : next.winnerSide === "b"
            ? next.sideB.displayName
            : null;
      resultSummary = winner
        ? `${winner} の勝利。相手は戦闘を続けられなくなった。`
        : "相打ち — 両者とも戦闘不能となった。";
    }
  }

  battleRepo.saveBattle(next, {
    sideAUserId: meta.side_a_user_id,
    sideACharacterId: meta.side_a_character_id,
    sideBCharacterId: meta.side_b_character_id,
  });

  return toBattlePublic(next, mine, resultSummary);
}

export function pickRandomOpponent(userId: string, myCharacterId: string) {
  const all = charRepo.listPublicOpponents(userId);
  const candidates = all.filter((c) => c.id !== myCharacterId);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

export function pickAutoOpponent(userId: string, myCharacterId: string) {
  // Scaffold: same as random; later use hidden power band.
  return pickRandomOpponent(userId, myCharacterId);
}

export { toPublicCharacter };
