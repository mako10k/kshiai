// R: Capture explicitly configured models and finite turn budgets in each new battle binding.
import { BattleAssetManifestV7Schema, ReservedTurnPolicySchema, type BattleState, type ReservedTurnPolicy, type UnifiedConsciousnessPolicy } from "@kshiai/shared";
import type { AwarenessProviderRoles } from "../llm/awareness-provider-factory.js";
export function bindReservedTurnPolicy(roles: AwarenessProviderRoles | undefined) {
  if (!roles?.consciousness) throw new Error("RESERVED_CHARACTER_ROUTE_REQUIRED");
  return ReservedTurnPolicySchema.parse({ revision: "reserved-turn-policy-v1", maxTurns: 36, maxReservations: 5, maxLogicalCallsPerTurn: 4,
    maxPhysicalAttempts: 200, durationMs: 600000, deadlineMs: 60000, characterOutputTokens: 2000, adjudicationOutputTokens: 10000, inputCharacters: 128000,
    character: { provider: roles.consciousness.identity.provider, model: roles.consciousness.identity.fastModel },
    adjudication: { provider: roles.adjudication.identity.provider, model: roles.adjudication.identity.engineModel },
    narration: { provider: roles.adjudication.identity.provider, model: roles.adjudication.identity.fastModel } });
}

export function bindReservedBattleState(state: BattleState, reservedTurnPolicy: ReservedTurnPolicy | null): BattleState {
  if (!reservedTurnPolicy) return state;
  state = { ...state, prologuePending: false, aftermathPending: false, turn: 0, turnLimit: reservedTurnPolicy.maxTurns,
    assetManifest: BattleAssetManifestV7Schema.parse({ ...state.assetManifest, schemaVersion: 7,
      consciousOutputContract: "reserved-turns-v1", outputRevision: "reserved-turn-output-v1", reservedTurnPolicy,
      reservedTurnPromptRevision: "reserved-turn-prompt-v2",
      rules: { ...state.assetManifest?.rules, battleEngine: "reserved-turns-v1", temporalRules: "reserved-order-v1", psycheReaction: "reserved-turns-v1" } }) };
  delete state.sceneBeat;
  delete state.combatTick;
  delete state.causalEngineContinuation;
  return state;
}

export function parseReservedCreationPolicy(input: { reservedTurnPolicy?: ReservedTurnPolicy; consciousnessPolicy?: UnifiedConsciousnessPolicy }) {
  const reservedTurnPolicy = input.reservedTurnPolicy ? ReservedTurnPolicySchema.parse(input.reservedTurnPolicy) : null;
  if (reservedTurnPolicy && input.consciousnessPolicy) throw new Error("BATTLE_PIPELINE_BINDING_CONFLICT");
  return reservedTurnPolicy;
}
