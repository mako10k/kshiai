// R: Connect one parallel-plan turn to immutable battle assets and an atomic fenced world commit.
import { isClosedRecoverableReservedRequest, BattleStateSchema, narrationInstructionForPhase, ReservedTurnWorldSchema, buildCharacterSelfProfileAnchor, deriveBattleProfileStateOverrides,
  projectObserverPerception, buildServerOnlyReserveCues, projectBattleActionEffort, AppliedFreeActionPenaltyV1Schema, ReservedEffortContextSchema, ReservedTurnTraceV4Schema, buildUtterancePerceptionEvidence,
  type BattleState, type BattlePublic, type TurnEvent, type ReservedTurnRuntime } from "@kshiai/shared";
import { isDeepStrictEqual } from "node:util";
import type { LlmProvider } from "../llm/types.js";
import { getBattleMeta, saveBattleInTransaction } from "../repositories/battles.js";
import { getAssetGeneration } from "../repositories/asset-generations.js";
import { getReservedRuntime, getReservedRuntimeInTransaction, mutateReservedRuntime, writeReservedRuntime } from "../repositories/reserved-turns.js";
import { withTransaction } from "../db.js";
import { currentBattleLeaseFence } from "./distributed-guard.js";
import { reservedTurnOutcome } from "./reserved-turn-outcome.js";
import { buildBattleAdjudication, buildAwarenessCharacterActionFrame, toBattlePublicForViewer } from "./battle-service.js";
import { buildAwarenessExecutionContext } from "./awareness-context.js";
import { executeReservedTurn, type ReservedPlannerFrame } from "./reserved-turn-execution.js";
import { publishReservedNarration, enqueueReservedNarration } from "../repositories/reserved-turn-narration.js";
import { reservedTurnPublicFailure } from "./reserved-turn-failure.js";
import type { ReservedNarrationInput } from "./reserved-turn-narration.js";
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
      semanticState: state.semanticState, worldState: state.worldState, events, quantizedMechanicalEvidence: [], sensoryEvidence: state.assetManifest?.schemaVersion === 7 && "canonicalNarration" in state.assetManifest.reservedTurnPolicy ? buildUtterancePerceptionEvidence({ events, worldState: state.worldState, previousFrameA: state.perceptionFrameA, previousFrameB: state.perceptionFrameB }) : [],
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
  const independentNarration = "canonicalNarration" in snapshot.runtime.policy;
  let frozenNarration: ReservedNarrationInput | undefined;
  const frame = async (side: "a" | "b"): Promise<ReservedPlannerFrame> => {
    const generation = await getAssetGeneration(manifest.characters[side].generationId);
    if (!generation) throw new Error("RESERVED_IMMUTABLE_GENERATION_REQUIRED");
    const action = buildAwarenessCharacterActionFrame({ state: baseline, sheet: manifest.characters[side].snapshot,
      counterpartSheet: manifest.characters[side === "a" ? "b" : "a"].snapshot, side, decisionTurn: baseline.turn + 1, phase: "turn" });
    const context = buildAwarenessExecutionContext({ state: baseline, side, generation, availableActions: [], actionFacts: action.facts,
      consciousGuidance: action.consciousGuidance, receivedSpeech: false, intentCompleted: false, intentInvalid: false });
    return { context: { character: buildCharacterSelfProfileAnchor(manifest.characters[side].snapshot,
      deriveBattleProfileStateOverrides({ worldState: baseline.worldState, side })), characteristics: context.characteristics,
      guidance: context.consciousGuidance, perception: context.perception,
      ...(independentNarration ? { consciousCharacteristics: context.consciousCharacteristics, training: context.training, consciousTraining: context.consciousTraining, actionEffort: context.actionEffort } : {}) }, references: [
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
    if (state.turn > baseline.turn) {
      if (independentNarration) {
        if (!frozenNarration) throw new Error("RESERVED_NARRATION_INPUT_REQUIRED");
        await enqueueReservedNarration(connection, settled, frozenNarration, new Date().toISOString());
      } else await publishReservedNarration(connection, settled, savedRuntime.runtime, new Date().toISOString());
    }
    return settled;
  });
  try {
    const [a, b] = await Promise.all([frame("a"), frame("b")]);
    const resolved = await executeReservedTurn({ battleId: baseline.id, promptRevision: manifest.reservedTurnPromptRevision, start: worldAtStart(baseline), frames: { a, b },
      assets: { characters: { a: manifest.characters.a.snapshot, b: manifest.characters.b.snapshot }, rules: manifest.rules, battlefield: manifest.battlefield.snapshot },
      ...(independentNarration ? { effort: ReservedEffortContextSchema.parse({ state: snapshot.runtime.effortState,
        actors: { a: { policy: baseline.sideA.actionEffortPolicy, skills: manifest.characters.a.snapshot.skills, defense: baseline.sideA.parameters.def ?? 0 },
          b: { policy: baseline.sideB.actionEffortPolicy, skills: manifest.characters.b.snapshot.skills, defense: baseline.sideB.parameters.def ?? 0 } } }) } : {}),
      publicScene: baseline.situation.scene, narrationStyle: narrationInstructionForPhase(baseline.narrationStyle, "combat"), character: roles.consciousness, adjudication: roles.adjudication, narration: roles.adjudication,
      port: { async read() { const row = await getReservedRuntime(baseline.id); if (!row) throw new Error("RESERVED_RUNTIME_REQUIRED"); return row.runtime; },
        async update(reduce) { await mutateReservedRuntime(baseline.id, fence, reduce); },
        async account(reduce) { await mutateReservedRuntime(baseline.id, undefined, reduce); } } });
    const actor = (side: "a" | "b") => {
      const current = side === "a" ? baseline.sideA : baseline.sideB;
      const p = resolved.state.actors[side];
      const alive = p.hp > 0 && !["unconscious", "incapacitated"].includes(resolved.state.world.entities[`character.${side}`]?.actorState?.consciousness ?? "alert");
      const lastPenalty = independentNarration ? [...ReservedTurnTraceV4Schema.parse(resolved.trace).results].reverse().find((result) => result.side === side && result.penalty) : undefined;
      const penalty = lastPenalty?.penalty && lastPenalty.effortApplied ? AppliedFreeActionPenaltyV1Schema.parse({
        contractVersion: "battle-action-effort-v1" as const, actionId: lastPenalty.reservationId, actorSide: side,
        proposal: lastPenalty.penalty, requestedStamina: lastPenalty.effortApplied.requestedStamina,
        paidStamina: lastPenalty.effortApplied.paidStamina, unpaidStamina: lastPenalty.effortApplied.unpaidStamina,
        defenseReduction: lastPenalty.penalty.kind === "defense_exposure" ? current.actionEffortPolicy?.freeActionPenalty.defenseReduction[lastPenalty.penalty.level] ?? 0 : 0,
      }) : undefined;
      return { ...current, ...(independentNarration && resolved.effortState ? { pendingDefenseExposure: resolved.effortState[side].exposure ?? undefined } : {}),
        ...(penalty ? { lastFreeActionPenalty: penalty } : {}), parameters: { ...current.parameters, hp: p.hp, mp: p.mp, stamina: p.stamina }, canFight: alive, irreversibleIncapacitated: !alive };
    };
    const sideA = actor("a"); const sideB = actor("b");
    const outcome = reservedTurnOutcome(sideA, sideB, resolved.turn, snapshot.runtime.policy.maxTurns, independentNarration);
    const finished = outcome.status === "finished";
    const winnerSide = outcome.winnerSide;
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
    const next = projectTurnPerception({ ...baseline,
      ...(independentNarration && baseline.dramaState && resolved.effortState ? { dramaState: { ...baseline.dramaState,
        repeatedActionA: resolved.effortState.a.count, repeatedActionB: resolved.effortState.b.count } } : {}), turn: resolved.turn, sideA, sideB, worldState: resolved.state.world,
      ...outcome,
      ...(independentNarration && outcome.finishReason === "turn_limit" ? { adjudication: buildBattleAdjudication({ turn: resolved.turn, engineWinnerSide: winnerSide, turnFacts: [] }) } : {}),
      battleRevision: revision, updatedAt: now, prologuePending: false, aftermathPending: false,
      log: independentNarration ? baseline.log : [...baseline.log, { turn: resolved.turn, narrator: resolved.narration.lines, speeches }],
      phaseReceiptSequence: (baseline.phaseReceiptSequence ?? 0) + 1,
      phaseReceipts: [...(baseline.phaseReceipts ?? []), { schemaVersion: 1, id: `${baseline.id}:turn:${resolved.turn}`, sequence: (baseline.phaseReceiptSequence ?? 0) + 1,
        operationId: input.operationId, phase: "combat", combatTurn: resolved.turn, fromRevision: baseline.battleRevision ?? 0, toRevision: revision, committedAt: now }],
      advanceOperation: { schemaVersion: 1, operationId: input.operationId, expectedRevision: baseline.battleRevision ?? 0, status: "completed", phase: "combat", startedAt: now, completedAt: now, receiptIds: [`${baseline.id}:turn:${resolved.turn}`] },
    }, speechEvents);
    if (independentNarration) frozenNarration = { kind: "reserved-turns-v2", battleId: baseline.id, turn: resolved.turn,
      policy: snapshot.runtime.policy, scene: baseline.situation.scene,
      style: narrationInstructionForPhase(baseline.narrationStyle, "combat"), consequences: resolved.publicConsequences, speeches,
      verdict: finished ? winnerSide === "draw" ? "判定は引き分け。" : `判定は ${winnerSide === "a" ? sideA.displayName : sideB.displayName} の勝利。` : null };
    const checked = BattleStateSchema.parse(next);
    const saved = await save(checked, (runtime) => {
      if (runtime.status !== "active" || Date.now() >= runtime.deadlineAt) throw new Error("RESERVED_COMMIT_DEADLINE");
      if (runtime.requests.some((r) => r.turn === resolved.turn && (r.status !== "prepared" && r.failure !== "RATE_LIMIT" && !isClosedRecoverableReservedRequest(r, runtime.policy) || r.physicalOutstanding))) throw new Error("RESERVED_UNFINISHED_REQUESTS");
      return { ...runtime, turn: resolved.turn, memories: resolved.memories, feedback: resolved.feedback, lastTrace: resolved.trace, ...(resolved.effortState ? { effortState: resolved.effortState } : {}),
        status: finished ? "terminal" : "active", terminalAt: finished ? Date.now() : null };
    });
    return view(saved);
  } catch (error) {
    if (error instanceof Error && /LEASE_CONFLICT|FENCE|COMMIT_CONFLICT|BATTLE_REVISION_CONFLICT/.test(error.message)) throw error;
    const stopped = BattleStateSchema.parse({ ...baseline, status: "incomplete", incompleteReason: reservedTurnPublicFailure(error), updatedAt: new Date().toISOString() });
    return view(await save(stopped, (runtime) => ({ ...runtime, status: "incomplete", failure: error instanceof Error ? error.message.slice(0, 2000) : "RESERVED_TURN_FAILED" })));
  }
}
