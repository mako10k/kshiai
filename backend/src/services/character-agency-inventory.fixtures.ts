import { createHash } from "node:crypto";
import {
  BattlefieldInstanceSchema,
  BattleStateSchema,
  CharacterDefinitionV2Schema,
  compileCharacterActionNormProgramV2,
  compileCharacterPsycheTraitsV1,
  compileCharacterRelationshipProgramV2,
  createBattleState,
  defaultBasicAttack,
  defaultDialoguePipelineSettings,
  defaultNarrationSnapshot,
  defaultParameters,
  ensureBattlePerceptionState,
  legacyCharacterSheetToDefinitionV2,
  projectCharacterConsciousSelfV2,
  projectCharacterDeepPsycheV2,
  projectCharacterRelationshipDescriptionV2,
  resolveCharacterRelationshipV2,
  snapshotDialoguePipelineSettings,
  PSYCHE_REACTION_POLICY_V1,
  type BattleCharacterAssetBinding,
  type BattleState,
  type CombatReadyCharacterSheet,
  type DialoguePipelineSettings,
} from "@kshiai/shared";
import { MockLlmProvider } from "../llm/mock.js";
import { OpenAiCompatibleProvider, type ChatOpts } from "../llm/openai-compatible.js";
import type {
  CharacterActionDecisionInput,
  CharacterDeepPsycheInput,
  CharacterExpressionInput,
} from "../llm/types.js";
import { advanceCharacterAgents, buildLaterBucketActionInput } from "./battle-service.js";

export const INVENTORY_STAMP = "2026-09-09T00:00:00.000Z";
export const PRIVATE_GOAL = "inventory-private-goal";
export const INVENTORY_UTTERANCE = "間合いを確かめよう。";
export type InventoryVariant =
  | "control" | "enjoy" | "care" | "low_mp" | "far" | "ability_text";
export type InventoryMode = "legacy" | "compact1" | "compact2";
export type InventoryPhase = "prologue" | "turn" | "aftermath";

// Serialization here identifies immutable synthetic snapshots, never reparses business values.
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function character(id: string, variant: InventoryVariant): CombatReadyCharacterSheet {
  return {
    id, ownerUserId: "inventory-owner", displayName: id === "a" ? "アオ" : "クロ",
    identity: { realName: null, nicknames: [], selfNames: ["私"], epithets: [], gender: null, age: null },
    tags: [], createdAt: INVENTORY_STAMP, updatedAt: INVENTORY_STAMP,
    appearance: { summary: "検証用の姿", visualPrompt: "synthetic fixture" },
    traits: [variant === "enjoy" ? "勝利に固執せず戦闘を楽しむ" : "無駄な消耗を避け勝利を目指す"],
    parameters: defaultParameters(),
    basicAttack: {
      ...defaultBasicAttack(),
      description: variant === "ability_text" ? "基本攻撃の自己知識だけを変更" : "近距離で攻撃する",
      constraints: {
        reach: "near", requiresSight: false, mobility: "limited",
        requiresSpeech: false, requiresUsableHeldObject: false,
      },
    },
    skills: [{
      id: "costly", name: "集中打", description: "魔力を消費して攻撃する",
      costMp: 20, costStamina: 0, power: 1, kind: "attack",
    }],
    weapon: null, armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "ネットワークなしの検証用キャラクター。",
  };
}

function binding(
  sheet: CombatReadyCharacterSheet, counterpartId: string, care: boolean,
): BattleCharacterAssetBinding {
  const base = legacyCharacterSheetToDefinitionV2(sheet);
  const definition = CharacterDefinitionV2Schema.parse({
    ...base,
    relationshipSeeds: [{
      id: "fixture-relationship", target: { kind: "character", characterAssetId: counterpartId },
      relationKinds: [care ? "cherished" : "rival"], historySummary: null,
      defaultAddress: care ? "大切な相手" : "好敵手", selfAwareness: "aware",
      dynamics: { trust: 0, affiliation: 0, fear: 0, competition: 0 }, priority: 80,
    }],
  });
  const relationship = resolveCharacterRelationshipV2({
    program: compileCharacterRelationshipProgramV2(definition),
    counterpartCharacterAssetId: counterpartId,
  });
  const generationId = `inventory-character-${sheet.id}-${digest(definition).slice(0, 16)}`;
  return {
    assetId: sheet.id, generationId, contentDigest: digest(definition), snapshot: structuredClone(sheet),
    basicAttackSource: { kind: "character_generation_v2", generationId, definitionPath: "capabilities.basicAction" },
    compilerInputsV2: {
      psycheTraits: compileCharacterPsycheTraitsV1(definition),
      deepPsyche: {
        ...projectCharacterDeepPsycheV2(definition),
        relationship: projectCharacterRelationshipDescriptionV2({ resolution: relationship, consumer: "deep-psyche" }),
      },
      consciousSelf: {
        ...projectCharacterConsciousSelfV2(definition),
        relationship: projectCharacterRelationshipDescriptionV2({ resolution: relationship, consumer: "conscious-self" }),
      },
      actionNorms: compileCharacterActionNormProgramV2(definition), relationship,
    },
  };
}

export function inventorySettings(mode: InventoryMode): DialoguePipelineSettings {
  return {
    ...defaultDialoguePipelineSettings(),
    schemaVersion: mode === "compact2" ? 2 : 1,
    contextProjectionMode: mode === "legacy" ? "legacy" : "compact",
  };
}

export function createInventoryFixture(
  variant: InventoryVariant = "control",
  mode: InventoryMode = "compact2",
  deterministic = true,
) {
  const mine = character("a", variant);
  const opp = character("b", "control");
  const battlefield = BattlefieldInstanceSchema.parse({
    displayName: "検証広場", scene: "二人が対峙する", terrain: "平地", narrativeSetup: "試合開始",
  });
  const style = defaultNarrationSnapshot();
  const settings = inventorySettings(mode);
  const state = createBattleState({
    id: "agency-inventory", sideA: mine, sideB: opp, turnLimit: 20,
    battlefield, narrationStyle: style, prologuePending: false,
  });
  state.createdAt = INVENTORY_STAMP;
  state.updatedAt = INVENTORY_STAMP;
  if (!state.agentStateA) throw new Error("Fixture has no initial agent state");
  state.agentStateA.currentGoal = PRIVATE_GOAL;
  state.assetManifest = {
    schemaVersion: 2, boundAt: INVENTORY_STAMP,
    characters: { a: binding(mine, opp.id, variant === "care"), b: binding(opp, mine.id, false) },
    narrationStyle: { assetId: style.id, generationId: "inventory-style", contentDigest: digest(style), snapshot: style },
    battlefield: { assetId: null, generationId: "inventory-field", contentDigest: digest(battlefield), snapshot: battlefield },
    dialoguePipeline: {
      generationId: `inventory-dialogue-${mode}`, contentDigest: digest(settings),
      snapshot: snapshotDialoguePipelineSettings(settings), activationSource: "default",
    },
    rules: {
      battleEngine: "battle-engine-v1", temporalRules: "initiative-window-v2",
      ...(deterministic ? { psycheReaction: PSYCHE_REACTION_POLICY_V1 } : {}),
      characterDefinitionRules: "character-definition-rules-v2",
    },
  };
  state.sideA.parameters.mp = variant === "low_mp" ? 0 : 30;
  if (variant === "far") {
    const pair = state.worldState?.pairRelations[0];
    if (!pair) throw new Error("Fixture has no pair relation");
    pair.distance = "far";
  }
  // Re-project synthetic initial state through the ordinary observer builder.
  delete state.perceptionFrameA;
  delete state.perceptionFrameB;
  delete state.perceptionRegistryA;
  delete state.perceptionRegistryB;
  return { mine, opp, settings, state: BattleStateSchema.parse(ensureBattlePerceptionState(state)) };
}

/** Exercise the real provider adapter, but replace its sole network boundary with typed fixtures. */
export class InventoryProvider extends OpenAiCompatibleProvider {
  readonly psycheInputs: CharacterDeepPsycheInput[] = [];
  readonly expressionInputs: CharacterExpressionInput[] = [];
  readonly expressionOutputs: Awaited<ReturnType<OpenAiCompatibleProvider["advanceCharacterAgent"]>>[] = [];
  readonly actionInputs: CharacterActionDecisionInput[] = [];
  readonly requests: { label: string; system: string; user: string }[] = [];
  private response: unknown;
  private readonly fixtureProvider = new MockLlmProvider();

  constructor() {
    super({
      name: "inventory", apiKey: "inventory-not-sent", baseUrl: "https://example.invalid/v1",
      modelEngine: "inventory", modelFast: "inventory", fallbackOnError: false,
    });
  }

  override async advanceCharacterPsyche(input: CharacterDeepPsycheInput) {
    this.psycheInputs.push(structuredClone(input));
    const prepared = await this.fixtureProvider.advanceCharacterPsyche(input);
    this.response = input.contextMode === "compact"
      ? { delta: prepared.delta, expressionBrief: prepared.expressionBrief }
      : prepared;
    return super.advanceCharacterPsyche(input);
  }

  override async advanceCharacterAgent(input: CharacterExpressionInput) {
    this.expressionInputs.push(structuredClone(input));
    this.response = input.contextMode === "compact" && input.contractVersion === 2
      ? { nextUtterance: INVENTORY_UTTERANCE, nextAction: null, realizedManifestation: null }
      : { speech: INVENTORY_UTTERANCE, nextAction: null, realizedManifestation: null };
    const result = await super.advanceCharacterAgent(input);
    this.expressionOutputs.push(structuredClone(result));
    return result;
  }

  override async decideCharacterAction(input: CharacterActionDecisionInput) {
    this.actionInputs.push(structuredClone(input));
    this.response = { nextAction: { kind: "wait" } };
    return super.decideCharacterAction(input);
  }

  protected override async chatJson(system: string, user: string, options?: ChatOpts): Promise<unknown> {
    const label = options?.label ?? "";
    if (![
      "advanceCharacterPsycheCompact", "advanceCharacterPsyche",
      "advanceCharacterAgentCompact", "advanceCharacterAgent", "decideCharacterAction",
    ].includes(label)) throw new Error(`Unexpected inventory operation: ${label}`);
    this.requests.push({ label, system, user });
    return structuredClone(this.response);
  }
}

export async function runInventory(
  variant: InventoryVariant = "control",
  mode: InventoryMode = "compact2",
  phase: InventoryPhase = "turn",
  deterministic = true,
  startingState?: BattleState,
) {
  const fixture = createInventoryFixture(variant, mode, deterministic);
  const before = startingState ?? fixture.state;
  const after = structuredClone(before);
  after.turn = phase === "prologue" ? 0 : before.turn + 1;
  if (!after.perceptionFrameA || !after.perceptionFrameB) throw new Error("Missing observer frames");
  after.perceptionFrameA.turn = after.turn;
  after.perceptionFrameB.turn = after.turn;
  const provider = new InventoryProvider();
  const result = await advanceCharacterAgents({
    llm: provider, before, after, mine: fixture.mine, opp: fixture.opp,
    events: [], actions: [], activeSides: ["a"], dialoguePipeline: fixture.settings, phase,
  });
  const laterInput = buildLaterBucketActionInput({
    state: result.state, sheet: fixture.mine, counterpartSheet: fixture.opp, side: "a",
  });
  return { ...fixture, before, provider, result, laterInput };
}
