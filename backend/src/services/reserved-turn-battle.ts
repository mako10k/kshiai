// R: Connect one parallel-plan turn to immutable battle assets and an atomic fenced world commit.
import { BattleStateSchema, narrationInstructionForPhase, ReservedTurnWorldSchema, buildCharacterSelfProfileAnchor, deriveBattleProfileStateOverrides,
  projectObserverPerception, buildServerOnlyReserveCues, projectBattleActionEffort,
  type BattleState, type BattlePublic, type TurnEvent, type ReservedTurnRuntime } from "@kshiai/shared";
import { isDeepStrictEqual } from "node:util";
import type { LlmProvider } from "../llm/types.js";
import { getBattleMeta, saveBattleInTransaction } from "../repositories/battles.js";
import { getAssetGeneration } from "../repositories/asset-generations.js";
import { getReservedRuntime, getReservedRuntimeInTransaction, mutateReservedRuntime, writeReservedRuntime } from "../repositories/reserved-turns.js";
import { withTransaction } from "../db.js";
import { currentBattleLeaseFence } from "./distributed-guard.js";
import { buildAwarenessCharacterActionFrame, toBattlePublicForViewer } from "./battle-service.js";
import { buildAwarenessExecutionContext } from "./awareness-context.js";
import { executeReservedTurn, type ReservedPlannerFrame } from "./reserved-turn-execution.js";
import { publishReservedNarration } from "../repositories/reserved-turn-narration.js";
import { reservedTurnPublicFailure } from "./reserved-turn-failure.js";
import { settleBattleRatingInTransaction } from "./rating-service.js";

function worldAtStart(state: BattleState) {
  if (!state.worldState) throw new Error("RESERVED_CANONICAL_WORLD_REQUIRED");
  const actor = (side: "a" | "b") => {
    const p = side === "a" ? state.sideA.parameters : state.sideB.parameters;
    return { hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp, stamina: p.stamina, maxStamina: p.maxStamina, initiative: p.spd };
  };
  return ReservedTurnWorldSchema.parse({ turn: state.turn + 1, revision: 0, actors: { a: actor("a"), b: actor("b") }, world: state.worldState });
}
function projectTurnPerception(state: BattleState, events: TurnEvent[]): BattleState {
  if (!state.semanticState || !state.worldState) throw new Error("RESERVED_PERCEPTION_WORLD_REQUIRED");
  let next = state;
  for (const side of ["a", "b"] as const) {
    const actor = side === "a" ? state.sideA : state.sideB;
    const projected = projectObserverPerception({ observerSide: side, turn: state.turn,
      semanticState: state.semanticState, worldState: state.worldState, events, quantizedMechanicalEvidence: [], sensoryEvidence: [],
      reserveEvidence: buildServerOnlyReserveCues({ side, parameters: actor.parameters, baseParameters: actor.baseParameters }),
      actionEffort: projectBattleActionEffort(state, side),
      previousFrame: side === "a" ? state.perceptionFrameA : state.perceptionFrameB,
      previousRegistry: side === "a" ? state.perceptionRegistryA : state.perceptionRegistryB,
      legacyCounterpartIdentified: true });
    next = side === "a" ? { ...next, perceptionFrameA: projected.frame, perceptionRegistryA: projected.registry }
      : { ...next, perceptionFrameB: projected.frame, perceptionRegistryB: projected.registry };
  }
  return next;
}
export async function advanceReservedTurn(input: { userId: string; battleId: string; operationId: string; llm: LlmProvider }, baseline: BattleState): Promise<BattlePublic> {
  const manifest = baseline.assetManifest;
  if (manifest?.schemaVersion !== 7) throw new Error("RESERVED_BINDING_REQUIRED");
  const meta = await getBattleMeta(baseline.id);
  if (!meta || meta.side_a_user_id !== input.userId) throw new Error("FORBIDDEN");
  const view = (state: BattleState) => toBattlePublicForViewer(state, manifest.characters.a.snapshot, null, manifest.characters.b.snapshot);
  if (baseline.status !== "active" || baseline.advanceOperation?.operationId === input.operationId && baseline.advanceOperation.status === "completed") return view(baseline);
  const fence = currentBattleLeaseFence();
  if (!fence || fence.battleId !== baseline.id) throw new Error("RESERVED_LIVE_LEASE_REQUIRED");
  const roles = input.llm.awareness;
  if (!roles?.consciousness) throw new Error("RESERVED_ROUTES_REQUIRED");
  const snapshot = await getReservedRuntime(baseline.id);
  if (!snapshot || snapshot.runtime.turn !== baseline.turn || !isDeepStrictEqual(snapshot.runtime.policy, manifest.reservedTurnPolicy)) throw new Error("RESERVED_TURN_RUNTIME_CONFLICT");
  const frame = async (side: "a" | "b"): Promise<ReservedPlannerFrame> => {
    const generation = await getAssetGeneration(manifest.characters[side].generationId);
    if (!generation) throw new Error("RESERVED_IMMUTABLE_GENERATION_REQUIRED");
    const action = buildAwarenessCharacterActionFrame({ state: baseline, sheet: manifest.characters[side].snapshot,
      counterpartSheet: manifest.characters[side === "a" ? "b" : "a"].snapshot, side, decisionTurn: baseline.turn + 1, phase: "turn" });
    const context = buildAwarenessExecutionContext({ state: baseline, side, generation, availableActions: [], actionFacts: action.facts,
      consciousGuidance: action.consciousGuidance, receivedSpeech: false, intentCompleted: false, intentInvalid: false });
    return { context: { character: buildCharacterSelfProfileAnchor(manifest.characters[side].snapshot,
      deriveBattleProfileStateOverrides({ worldState: baseline.worldState, side })), characteristics: context.characteristics,
      guidance: context.consciousGuidance, perception: context.perception }, references: [
      { id: "self", text: "自分自身" },
      ...(context.perception.counterpart.currentAccess !== "none" ? [{ id: "opponent", text: context.perception.counterpart.perceivedAs }] : []),
      ...context.facts.map((fact) => ({ id: fact.ref, text: fact.content })),
    ] };
  };
  const save = async (state: BattleState, reduce: (runtime: ReservedTurnRuntime) => ReservedTurnRuntime) => withTransaction(async (connection) => {
    const current = await getReservedRuntimeInTransaction(connection, baseline.id, { lock: true });
    if (!current || current.runtime.turn !== baseline.turn) throw new Error("RESERVED_TURN_COMMIT_CONFLICT");
    const settled = state.status === "finished" ? await settleBattleRatingInTransaction(connection, state) : state;
    const savedRuntime = await writeReservedRuntime(connection, current, reduce(current.runtime), new Date().toISOString(), fence);
    await saveBattleInTransaction(connection, settled, { sideAUserId: meta.side_a_user_id, sideACharacterId: meta.side_a_character_id,
      sideBCharacterId: meta.side_b_character_id, expectedRevision: baseline.battleRevision ?? 0 });
    if (state.turn > baseline.turn) await publishReservedNarration(connection, settled, savedRuntime.runtime, new Date().toISOString());
    return settled;
  });
  try {
    const [a, b] = await Promise.all([frame("a"), frame("b")]);
    const resolved = await executeReservedTurn({ battleId: baseline.id, promptRevision: manifest.reservedTurnPromptRevision, start: worldAtStart(baseline), frames: { a, b },
      assets: { characters: { a: manifest.characters.a.snapshot, b: manifest.characters.b.snapshot }, rules: manifest.rules, battlefield: manifest.battlefield.snapshot },
      publicScene: baseline.situation.scene, narrationStyle: narrationInstructionForPhase(baseline.narrationStyle, "combat"), character: roles.consciousness, adjudication: roles.adjudication, narration: roles.adjudication,
      port: { async read() { const row = await getReservedRuntime(baseline.id); if (!row) throw new Error("RESERVED_RUNTIME_REQUIRED"); return row.runtime; },
        async update(reduce) { await mutateReservedRuntime(baseline.id, fence, reduce); },
        async account(reduce) { await mutateReservedRuntime(baseline.id, undefined, reduce); } } });
    const actor = (side: "a" | "b") => {
      const current = side === "a" ? baseline.sideA : baseline.sideB;
      const p = resolved.state.actors[side];
      const alive = p.hp > 0 && !["unconscious", "incapacitated"].includes(resolved.state.world.entities[`character.${side}`]?.actorState?.consciousness ?? "alert");
      return { ...current, parameters: { ...current.parameters, hp: p.hp, mp: p.mp, stamina: p.stamina }, canFight: alive, irreversibleIncapacitated: !alive };
    };
    const sideA = actor("a"); const sideB = actor("b"); const finished = !sideA.canFight || !sideB.canFight;
    const winnerSide = finished ? sideA.canFight ? "a" : sideB.canFight ? "b" : "draw" : null;
    const now = new Date().toISOString(); const revision = (baseline.battleRevision ?? 0) + 1;
    const speechEvents: TurnEvent[] = [];
    const speeches = [];
    for (const side of ["a", "b"] as const) {
      const text = resolved.plans[side].speech;
      if (!text) continue;
      const speaker = manifest.characters[side].snapshot.displayName;
      speeches.push({ sourceSide: side, speaker, text, afterNarratorLine: -1 });
      speechEvents.push({ id: `reserved.${resolved.turn}.${side}.speech`, type: "utterance", actorSide: side, actorName: speaker, summary: `${speaker}が発話した。`,
        utterance: { text, volume: "normal", delivery: "spoken", language: "shared", articulation: "clear" } });
    }
    const next = projectTurnPerception({ ...baseline, turn: resolved.turn, sideA, sideB, worldState: resolved.state.world,
      status: finished ? "finished" : "active", winnerSide, finishReason: finished ? "incapacitated" : null,
      battleRevision: revision, updatedAt: now, prologuePending: false, aftermathPending: false,
      log: [...baseline.log, { turn: resolved.turn, narrator: resolved.narration.lines, speeches }],
      phaseReceiptSequence: (baseline.phaseReceiptSequence ?? 0) + 1,
      phaseReceipts: [...(baseline.phaseReceipts ?? []), { schemaVersion: 1, id: `${baseline.id}:turn:${resolved.turn}`, sequence: (baseline.phaseReceiptSequence ?? 0) + 1,
        operationId: input.operationId, phase: "combat", combatTurn: resolved.turn, fromRevision: baseline.battleRevision ?? 0, toRevision: revision, committedAt: now }],
      advanceOperation: { schemaVersion: 1, operationId: input.operationId, expectedRevision: baseline.battleRevision ?? 0, status: "completed", phase: "combat", startedAt: now, completedAt: now, receiptIds: [`${baseline.id}:turn:${resolved.turn}`] },
    }, speechEvents);
    const checked = BattleStateSchema.parse(next);
    const saved = await save(checked, (runtime) => {
      if (runtime.status !== "active" || Date.now() >= runtime.deadlineAt) throw new Error("RESERVED_COMMIT_DEADLINE");
      if (runtime.requests.some((r) => r.turn === resolved.turn && (r.status !== "prepared" && r.failure !== "RATE_LIMIT" && !(runtime.policy.revision === "reserved-turn-policy-v5" && r.role === "adjudication" && r.status === "failed" && r.failure === "ADJUDICATION_INVALID" && r.rawResponse !== null) || r.physicalOutstanding))) throw new Error("RESERVED_UNFINISHED_REQUESTS");
      return { ...runtime, turn: resolved.turn, memories: resolved.memories, feedback: resolved.feedback, lastTrace: resolved.trace,
        status: finished ? "terminal" : "active", terminalAt: finished ? Date.now() : null };
    });
    return view(saved);
  } catch (error) {
    if (error instanceof Error && /LEASE_CONFLICT|FENCE|COMMIT_CONFLICT|BATTLE_REVISION_CONFLICT/.test(error.message)) throw error;
    const stopped = BattleStateSchema.parse({ ...baseline, status: "incomplete", incompleteReason: reservedTurnPublicFailure(error), updatedAt: new Date().toISOString() });
    return view(await save(stopped, (runtime) => ({ ...runtime, status: "incomplete", failure: error instanceof Error ? error.message.slice(0, 2000) : "RESERVED_TURN_FAILED" })));
  }
}
